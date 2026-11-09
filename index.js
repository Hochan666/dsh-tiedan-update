/**
 * Host half of the `dsh-tiedan-update` bundle.
 *
 * The browser half owns the Settings rows; this half owns every effect that
 * touches the machine: reading the npm registry, installing a new DSH release,
 * and restarting the running DSH service. Nothing here runs until the browser
 * asks for it through an authenticated route.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Cordis plugin name. */
export const name = 'dsh-tiedan-update'

/** Route prefix owned by this bundle. */
const BASE_PATH = '/dsh-tiedan-update'

/**
 * Configuration fields, their defaults and how a raw value is checked.
 * @type {Record<string, {default: unknown, parse: (raw: unknown) => {value: unknown}|{issue: string}}>}
 */
const FIELDS = {
  packageName: {
    default: '@deepseek-ai/dsh',
    parse: (raw) => typeof raw === 'string' && raw !== ''
      ? { value: raw }
      : { issue: 'must be a non-empty string' },
  },
  registry: {
    default: 'https://registry.npmmirror.com',
    parse: (raw) => typeof raw === 'string' && raw !== ''
      ? { value: raw }
      : { issue: 'must be a non-empty string' },
  },
  packageManager: {
    default: 'npm',
    parse: (raw) => raw === 'npm' || raw === 'pnpm'
      ? { value: raw }
      : { issue: 'must be "npm" or "pnpm"' },
  },
  installPrefix: {
    default: '',
    parse: (raw) => typeof raw === 'string'
      ? { value: raw }
      : { issue: 'must be a string' },
  },
  serviceUnit: {
    default: 'dsh.service',
    parse: (raw) => typeof raw === 'string'
      ? { value: raw }
      : { issue: 'must be a string' },
  },
  postUpdateCommand: {
    default: '',
    parse: (raw) => typeof raw === 'string'
      ? { value: raw }
      : { issue: 'must be a string' },
  },
  requestTimeoutMs: {
    default: 20000,
    parse: (raw) => typeof raw === 'number' && Number.isFinite(raw) && raw > 0
      ? { value: raw }
      : { issue: 'must be a positive number' },
  },
  installTimeoutMs: {
    default: 900000,
    parse: (raw) => typeof raw === 'number' && Number.isFinite(raw) && raw > 0
      ? { value: raw }
      : { issue: 'must be a positive number' },
  },
}

/**
 * Validated configuration for the update and restart operations.
 * A hand-written Standard Schema v1 keeps this bundle free of runtime
 * dependencies, so it works the same whether it is linked or packed.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-tiedan-update',
    /**
     * Validate and normalize the row configuration.
     * @param {unknown} value - raw row configuration.
     * @returns {{value: object}|{issues: {message: string, path?: string[]}[]}} the outcome.
     */
    validate(value) {
      if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
        return { issues: [{ message: 'configuration must be an object' }] }
      }
      const input = value ?? {}
      const issues = []
      const output = {}
      for (const [key, field] of Object.entries(FIELDS)) {
        const raw = input[key]
        if (raw === undefined || raw === null) {
          output[key] = field.default
          continue
        }
        const parsed = field.parse(raw)
        if ('issue' in parsed) {
          issues.push({ message: parsed.issue, path: [key] })
          continue
        }
        output[key] = parsed.value
      }
      if (issues.length > 0) return { issues }
      return { value: output }
    },
  },
}

/** Rolling output kept for an install job. */
const OUTPUT_LIMIT = 64 * 1024

/**
 * Compare two semver strings, prereleases included.
 * @param {string} left - first version.
 * @param {string} right - second version.
 * @returns {number} -1, 0 or 1.
 */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return 0
  for (const part of ['major', 'minor', 'patch']) {
    if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1
  const count = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < count; index += 1) {
    const x = a.prerelease[index]
    const y = b.prerelease[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      const delta = Number(x) - Number(y)
      if (delta !== 0) return delta < 0 ? -1 : 1
    } else if (xNumeric !== yNumeric) {
      return xNumeric ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/**
 * Split a semver string into its comparable parts.
 * @param {string} value - version text.
 * @returns {{major:number,minor:number,patch:number,prerelease:string[]}|undefined} parsed parts.
 */
function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value ?? '').trim())
  if (match === null) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
  }
}

/**
 * Find the installed package directory that owns the running executable.
 * @param {string} packageName - npm package name.
 * @returns {{dir:string,version:string|undefined}|undefined} installed package.
 */
function findInstalledPackage(packageName) {
  const entry = process.argv[1]
  if (entry === undefined) return undefined
  let dir
  try {
    dir = dirname(realpathSync(entry))
  } catch {
    dir = dirname(entry)
  }
  for (let depth = 0; depth < 10; depth += 1) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
        if (parsed.name === packageName) return { dir, version: parsed.version }
      } catch {
        /* an unreadable manifest is not this package */
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

/**
 * Derive the npm global prefix from an installed package directory.
 * @param {string} packageDir - directory of the installed package.
 * @returns {string|undefined} the prefix, when the layout is the npm one.
 */
function detectPrefix(packageDir) {
  const match = /^(.*)\/lib\/node_modules\/.+$/.exec(packageDir)
  return match === null ? undefined : match[1]
}

/**
 * Read the packument of the configured package.
 * @param {string} registry - registry base URL.
 * @param {string} packageName - npm package name.
 * @param {number} timeoutMs - request timeout.
 * @returns {Promise<{latest:string,versions:string[],distTags:Record<string,string>}>} registry facts.
 */
async function readPackument(registry, packageName, timeoutMs) {
  const base = registry.replace(/\/+$/, '')
  // The scope separator stays literal: mirrors reject an encoded "@" before
  // the package name.
  const path = packageName.split('/').map((part) => encodeURIComponent(part).replace(/%40/g, '@')).join('/')
  const url = `${base}/${path}`
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`registry answered HTTP ${response.status}`)
  const body = await response.json()
  const distTags = body?.['dist-tags'] ?? {}
  const versions = Object.keys(body?.versions ?? {})
  const latest = typeof distTags.latest === 'string' ? distTags.latest : versions[versions.length - 1]
  if (typeof latest !== 'string') throw new Error('registry answer carries no version')
  return { latest, versions, distTags }
}

/**
 * Run a command and collect its output.
 * @param {string} command - executable.
 * @param {string[]} args - arguments.
 * @param {object} options - run options.
 * @param {number} options.timeoutMs - kill the child after this delay.
 * @param {(chunk:string)=>void} [options.onOutput] - live output sink.
 * @returns {Promise<{code:number|null,output:string,signal:string|null,error:string|undefined}>} run result.
 */
function runCommand(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.env.HOME ?? process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let settled = false
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM')
      } catch {
        /* the child is already gone */
      }
    }, options.timeoutMs)
    const append = (chunk) => {
      output += chunk
      if (output.length > OUTPUT_LIMIT) output = output.slice(output.length - OUTPUT_LIMIT)
      options.onOutput?.(chunk)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: null, output, signal: null, error: error.message })
    })
    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, output, signal, error: undefined })
    })
  })
}

/**
 * Read the main PID of a systemd unit.
 * @param {string} unit - unit name.
 * @returns {Promise<number|undefined>} the main PID, when the unit is running.
 */
async function systemdMainPid(unit) {
  const result = await runCommand('systemctl', ['show', '-p', 'MainPID', '--value', unit], { timeoutMs: 8000 })
  if (result.code !== 0) return undefined
  const pid = Number(result.output.trim())
  return Number.isInteger(pid) && pid > 0 ? pid : undefined
}

/**
 * JSON response with no-store semantics.
 * @param {import('node:http').ServerResponse} res - response.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 * @param {() => void} [onFlushed] - runs once the body reached the socket.
 * @returns {void} nothing.
 */
function sendJson(res, status, payload, onFlushed) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  const body = JSON.stringify(payload)
  if (onFlushed === undefined) {
    res.end(body)
    return
  }
  res.end(body, onFlushed)
}

/**
 * Host half: publish the authenticated routes the browser half calls.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host context.
 * @param {object} config - validated configuration.
 * @returns {void} nothing.
 */
export function apply(ctx, config) {
  const settings = {
    packageName: config.packageName,
    registry: config.registry,
    packageManager: config.packageManager,
    installPrefix: config.installPrefix,
    serviceUnit: config.serviceUnit,
    postUpdateCommand: config.postUpdateCommand,
    requestTimeoutMs: config.requestTimeoutMs,
    installTimeoutMs: config.installTimeoutMs,
  }

  /** Last registry answer, kept so the status route can report it without a request. */
  let lastCheck
  /** The most recent install job, running or finished. */
  let currentJob
  /** Every install job this process ran, newest last. */
  const jobs = new Map()
  let jobCounter = 0
  /** Set once a restart of this process has been accepted. */
  let restartRequested = false
  /** Identity of this process, so the page can tell a real restart from a reconnect. */
  const bootId = `${process.pid}-${Date.now()}`

  /**
   * Report the running and installed versions plus the last registry answer.
   * @returns {object} status payload.
   */
  const statusPayload = () => {
    const installed = findInstalledPackage(settings.packageName)
    const current = installed?.version
    const latest = lastCheck?.latest ?? null
    const target = lastCheck?.target ?? null
    const updateAvailable = target !== null
      && (current === undefined || compareVersions(target, current) > 0)
    return {
      packageName: settings.packageName,
      registry: settings.registry,
      packageManager: settings.packageManager,
      installPrefix: settings.installPrefix,
      resolvedPrefix: resolvePrefix(),
      currentVersion: current ?? null,
      installedVersion: installed?.version ?? null,
      installedPath: installed?.dir ?? null,
      latestVersion: latest,
      updateAvailable,
      checkedAt: lastCheck?.checkedAt ?? null,
      updateTarget: target,
      prereleaseAvailable: lastCheck?.prerelease ?? null,
      job: currentJob === undefined ? null : { ...currentJob },
      jobOutput: currentJob?.output ?? '',
      // Liveness facts: a page that reconnects keeps the same bootId, while a
      // real process restart changes it. This separates "the page reconnected"
      // from "the service restarted" without reading logs.
      bootId,
      uptimeSeconds: Math.round(process.uptime()),
      restartRequested,
    }
  }

  /**
   * The npm prefix an install would use: the configured one, else the prefix
   * derived from the running installation.
   * @returns {string|undefined} the prefix.
   */
  const resolvePrefix = () => {
    if (settings.installPrefix !== '') return settings.installPrefix
    const installed = findInstalledPackage(settings.packageName)
    return detectPrefix(installed?.dir ?? '')
  }

  /**
   * Reject a request that the Connection service does not admit.
   * @param {import('node:http').IncomingMessage} req - request.
   * @param {import('node:http').ServerResponse} res - response.
   * @returns {boolean} true when the request was rejected.
   */
  const reject = (req, res) => {
    const connection = ctx.get('connection')
    if (connection === undefined) {
      sendJson(res, 503, { error: 'connection service unavailable' })
      return true
    }
    const rejection = connection.requestRejection(req)
    if (rejection === undefined) return false
    sendJson(res, rejection, { error: `rejected: ${rejection}` })
    return true
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: `${BASE_PATH}/status`,
      handler: async (req, res) => {
        if (reject(req, res)) return
        sendJson(res, 200, statusPayload())
      },
    }), 'dsh-tiedan-update: status route')

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: `${BASE_PATH}/check`,
      handler: async (req, res) => {
        if (reject(req, res)) return
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        try {
          const packument = await readPackument(settings.registry, settings.packageName, settings.requestTimeoutMs)
          const installed = findInstalledPackage(settings.packageName)
          const current = installed?.version
          // An unknown current version means "not installed here": every
          // published release is then newer than what is running.
          const baseline = current ?? '0.0.0'
          const newest = packument.versions
            .filter((version) => compareVersions(version, baseline) > 0)
            .sort((left, right) => compareVersions(right, left))[0]
          const stableIsNewer = compareVersions(packument.latest, baseline) > 0
          const target = stableIsNewer
            ? packument.latest
            : newest !== undefined
              ? newest
              : undefined
          lastCheck = {
            latest: packument.latest,
            target: target ?? null,
            prerelease: target !== undefined && target !== packument.latest ? target : null,
            checkedAt: new Date().toISOString(),
          }
          sendJson(res, 200, statusPayload())
        } catch (error) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), 'dsh-tiedan-update: check route')

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: `${BASE_PATH}/install`,
      handler: async (req, res) => {
        if (reject(req, res)) return
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        if (currentJob !== undefined && currentJob.state === 'running') {
          sendJson(res, 409, { error: 'an install job is already running', job: currentJob })
          return
        }
        const prefix = resolvePrefix()
        const target = lastCheck?.target
        if (target === undefined || target === null) {
          sendJson(res, 409, { error: 'no newer release is available to install' })
          return
        }
        const spec = `${settings.packageName}@${target}`
        const args = settings.packageManager === 'pnpm'
          ? ['add', '-g', spec]
          : ['install', '-g', ...(prefix === undefined ? [] : ['--prefix', prefix]), spec]
        jobCounter += 1
        const job = {
          id: `install-${jobCounter}`,
          state: 'running',
          target,
          spec,
          command: `${settings.packageManager} ${args.join(' ')}`,
          output: '',
          error: undefined,
          startedAt: new Date().toISOString(),
          finishedAt: undefined,
        }
        currentJob = job
        jobs.set(job.id, job)

        void (async () => {
          const result = await runCommand(settings.packageManager, args, {
            timeoutMs: settings.installTimeoutMs,
            onOutput: (chunk) => {
              job.output = (job.output + chunk).slice(-OUTPUT_LIMIT)
            },
          })
          if (result.error !== undefined || result.code !== 0) {
            job.state = 'failed'
            job.error = result.error
              ?? (result.signal === null
                ? `command exited with code ${result.code}`
                : `command was terminated by ${result.signal}`)
            job.finishedAt = new Date().toISOString()
            return
          }
          if (settings.postUpdateCommand !== '') {
            const hook = await runCommand('sh', ['-c', settings.postUpdateCommand], {
              timeoutMs: 120000,
              onOutput: (chunk) => {
                job.output = (job.output + chunk).slice(-OUTPUT_LIMIT)
              },
            })
            if (hook.code !== 0) {
              job.state = 'failed'
              job.error = `post-update command failed: ${hook.error ?? `exit code ${hook.code}`}`
              job.finishedAt = new Date().toISOString()
              return
            }
          }
          job.state = 'succeeded'
          job.finishedAt = new Date().toISOString()
        })()

        sendJson(res, 202, { job: { ...job, output: undefined } })
      },
    }), 'dsh-tiedan-update: install route')

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: `${BASE_PATH}/job`,
      handler: async (req, res) => {
        if (reject(req, res)) return
        const url = new URL(String(req.url ?? '/'), 'http://dsh.invalid')
        const id = url.searchParams.get('job')
        const job = id === null ? undefined : jobs.get(id)
        if (job === undefined) {
          sendJson(res, 404, { error: 'unknown job' })
          return
        }
        sendJson(res, 200, { job })
      },
    }), 'dsh-tiedan-update: job route')

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: `${BASE_PATH}/restart`,
      handler: async (req, res) => {
        if (reject(req, res)) return
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        // One restart per process: a second request during the hand-off would
        // otherwise race the first one and can spawn a second DSH on the same
        // port, which is exactly the restart loop this guard prevents.
        if (restartRequested) {
          sendJson(res, 409, {
            error: 'a restart of this process is already in progress',
            restart: { mode: 'pending' },
          })
          return
        }
        restartRequested = true
        const pid = settings.serviceUnit === ''
          ? undefined
          : await systemdMainPid(settings.serviceUnit)
        // A unit that owns this process restarts it through its own supervisor.
        // Never fall back to respawning here: a respawn would add a second
        // process beside a unit-managed one.
        const plan = pid === undefined
          ? { mode: 'respawn', unit: null, pid: null }
          : { mode: 'systemd', unit: settings.serviceUnit, pid }
        const managed = settings.serviceUnit !== ''
        if (managed && pid === undefined) {
          restartRequested = false
          sendJson(res, 503, {
            error: `service unit ${settings.serviceUnit} reports no main process; refusing to respawn beside it`,
          })
          return
        }
        sendJson(res, 200, { restart: plan }, () => {
          setTimeout(() => {
            void performRestart(plan)
          }, 250)
        })
      },
    }), 'dsh-tiedan-update: restart route')
  })
}

/**
 * Stop the running DSH process so its supervisor starts a fresh one.
 *
 * The respawn branch exists only for deployments with no unit. When a unit is
 * configured it is the sole owner of the process: spawning a detached copy
 * beside it would leave two DSH instances fighting for one port.
 * @param {{mode:string,unit:string|null,pid:number|null}} plan - restart plan.
 * @returns {Promise<void>} nothing.
 */
async function performRestart(plan) {
  if (plan.mode === 'systemd' && plan.pid !== null) {
    try {
      process.kill(plan.pid, 'SIGTERM')
      return
    } catch {
      /* the unit already reclaimed the process; leave it alone */
      return
    }
  }
  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()
  setTimeout(() => process.exit(0), 100)
}
