window.__ModuleLoader__.load({
	id: 'dsh-tiedan-update',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		const React = require('react');
		const h = React.createElement;

		/** Locale namespace owned by this bundle. */
		const NS = 'settings.tiedanUpdate';
		/** Route prefix owned by the Host half. */
		const BASE = '/dsh-tiedan-update';

		/** Chinese copy for the two Settings rows. */
		const zh = {
			'update.title': '版本更新',
			'update.description': '检测 DSH 新版本并就地升级，升级完成后需要重启生效',
			'update.currentVersion': '当前版本 {version}',
			'update.check': '检测更新',
			'update.checking': '正在检测最新版本…',
			'update.latest': '已是最新版本 {version}',
			'update.available': '发现新版本 {version}',
			'update.pre': '发现新版本 {version}（预发布）',
			'update.install': '更新到 {version}',
			'update.installing': '正在更新 {version}…',
			'update.installed': '更新完成，重启 DSH 后生效',
			'update.failed': '更新失败：{reason}',
			'update.error': '检测失败：{reason}',
			'update.checkedAt': '上次检测：{time}',
			'restart.title': '重启 DSH',
			'restart.description': '停止并重新拉起 DSH 服务，页面会短暂断开后自动重连',
			'restart.button': '重启 dsh',
			'restart.confirm': '确认重启',
			'restart.sending': '正在重启…',
			'restart.sent': '重启指令已发送，页面将自动重新连接',
			'restart.failed': '重启失败：{reason}',
			'restart.uptime': '进程已运行 {uptime}（{pid}）',
		};

		/** English copy for the two Settings rows. */
		const en = {
			'update.title': 'Version updates',
			'update.description': 'Check for a newer DSH release and install it in place; a restart applies it',
			'update.currentVersion': 'Current version {version}',
			'update.check': 'Check for updates',
			'update.checking': 'Checking for the latest version…',
			'update.latest': 'Already up to date ({version})',
			'update.available': 'New version available: {version}',
			'update.pre': 'New version available: {version} (prerelease)',
			'update.install': 'Update to {version}',
			'update.installing': 'Updating to {version}…',
			'update.installed': 'Update finished; restart DSH to apply it',
			'update.failed': 'Update failed: {reason}',
			'update.error': 'Check failed: {reason}',
			'update.checkedAt': 'Last checked: {time}',
			'restart.title': 'Restart DSH',
			'restart.description': 'Stop and relaunch the DSH service; the page reconnects after a short interruption',
			'restart.button': 'Restart dsh',
			'restart.confirm': 'Confirm restart',
			'restart.sending': 'Restarting…',
			'restart.sent': 'Restart requested; the page will reconnect on its own',
			'restart.failed': 'Restart failed: {reason}',
			'restart.uptime': 'Process has run {uptime} ({pid})',
		};

		/** Row styles, copied from the host General-section row pattern. */
		const CSS = [
			'.dshu_row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}',
			'.dshu_text{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}',
			'@media (width<=767px){html:not([data-windows-titlebar]):not([data-platform=darwin]) .dshu_text{padding-right:16px}}',
			'.dshu_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
			'.dshu_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px;overflow-wrap:anywhere}',
			'.dshu_desc[data-tone=error]{color:var(--dsw-alias-state-error-primary)}',
			'.dshu_desc[data-tone=success]{color:var(--dsw-alias-state-success-primary)}',
			'.dshu_desc[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}',
			'.dshu_actions{flex:none;align-items:center;gap:8px;display:flex}',
			'.dshu_button{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);height:32px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;align-items:center;gap:8px;padding:0 12px;font-size:13px;line-height:20px;display:inline-flex;white-space:nowrap}',
			'@media (hover:hover){.dshu_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}',
			'.dshu_button:disabled{opacity:.5;cursor:default}',
			'.dshu_button_primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
			'@media (hover:hover){.dshu_button_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}}',
			'.dshu_button_danger{color:var(--dsw-alias-state-error-primary)}',
			'.dshu_output{margin:6px 0 0;max-height:110px;overflow:auto;font-family:var(--ds-font-family-code);color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:16px}',
		].join('');

		/**
		 * Call a Host route and parse its JSON answer.
		 * @param {string} path - route path.
		 * @param {object} [init] - fetch options.
		 * @returns {Promise<any>} the parsed body.
		 */
		async function request(path, init) {
			const response = await fetch(path, {
				...(init ?? {}),
				headers: { accept: 'application/json', ...(init?.headers ?? {}) },
			});
			const text = await response.text();
			let body = null;
			try {
				body = text === '' ? null : JSON.parse(text);
			} catch {
				body = null;
			}
			if (!response.ok) {
				const reason = body && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`;
				throw new Error(reason);
			}
			return body;
		}

		/**
		 * Format a timestamp for the status line.
		 * @param {string} value - ISO timestamp.
		 * @returns {string} local time text.
		 */
		function formatTime(value) {
			if (value === null || value === undefined) return '';
			const parsed = new Date(value);
			if (Number.isNaN(parsed.getTime())) return value;
			return parsed.toLocaleString();
		}

		/**
		 * Settings row that checks the registry and installs a newer release.
		 * @param {{t: (key:string, params?:any)=>string}} props - slot props.
		 * @returns {any} the rendered row.
		 */
		function UpdateRow(props) {
			const t = props.t;
			const [status, setStatus] = React.useState(null);
			const [checking, setChecking] = React.useState(false);
			const [job, setJob] = React.useState(null);
			const [error, setError] = React.useState(null);
			const alive = React.useRef(true);

			React.useEffect(() => {
				alive.current = true;
				request(`${BASE}/status`).then((body) => {
					if (!alive.current || body === null) return;
					setStatus(body);
					// A job that survived a page reload keeps its outcome visible.
					if (body.job !== null && body.job !== undefined) setJob(body.job);
				}).catch(() => {});
				return () => {
					alive.current = false;
				};
			}, []);

			const jobState = job?.state;
			const jobId = job?.id;
			React.useEffect(() => {
				if (jobState !== 'running' || jobId === undefined) return undefined;
				const timer = setInterval(() => {
					request(`${BASE}/job?job=${encodeURIComponent(jobId)}`).then((body) => {
						if (!alive.current) return;
						if (body?.job === undefined) {
							// The Host restarted and no longer knows this job.
							setJob(null);
							return;
						}
						setJob(body.job);
						if (body.job.state !== 'running') {
							request(`${BASE}/status`).then((next) => {
								if (alive.current && next !== null) setStatus(next);
							}).catch(() => {});
						}
					}).catch(() => {});
				}, 1000);
				return () => clearInterval(timer);
			}, [jobState, jobId]);

			const runCheck = () => {
				setChecking(true);
				setError(null);
				request(`${BASE}/check`, { method: 'POST' }).then((body) => {
					if (!alive.current) return;
					setStatus(body);
					setChecking(false);
				}).catch((cause) => {
					if (!alive.current) return;
					setError(cause instanceof Error ? cause.message : String(cause));
					setChecking(false);
				});
			};

			const runInstall = () => {
				setError(null);
				request(`${BASE}/install`, { method: 'POST' }).then((body) => {
					if (!alive.current) return;
					setJob(body?.job ?? null);
				}).catch((cause) => {
					if (!alive.current) return;
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};

			let description = t('update.currentVersion', { version: status?.currentVersion ?? '—' });
			let tone = undefined;
			if (checking) {
				description = t('update.checking');
			} else if (error !== null) {
				description = t('update.error', { reason: error });
				tone = 'error';
			} else if (jobState === 'running') {
				description = t('update.installing', { version: job?.target ?? '' });
				tone = 'warn';
			} else if (jobState === 'failed') {
				description = t('update.failed', { reason: job?.error ?? '' });
				tone = 'error';
			} else if (jobState === 'succeeded') {
				description = t('update.installed');
				tone = 'success';
			} else if (status?.updateAvailable === true) {
				description = status.prereleaseAvailable !== null
					? t('update.pre', { version: status.updateTarget })
					: t('update.available', { version: status.updateTarget });
				tone = 'warn';
			} else if (status?.checkedAt !== null && status?.checkedAt !== undefined) {
				description = `${t('update.latest', { version: status.latestVersion ?? '' })} · ${t('update.checkedAt', { time: formatTime(status.checkedAt) })}`;
			}

			const busy = checking || jobState === 'running';
			const children = [
				h('div', { className: 'dshu_text' }, [
					h('div', { className: 'dshu_title' }, t('update.title')),
					h('div', { className: 'dshu_desc', 'data-tone': tone }, description),
					jobState !== undefined && jobState !== null && job?.output !== undefined && job.output !== ''
						? h('pre', { className: 'dshu_output' }, job.output)
						: null,
				]),
				h('div', { className: 'dshu_actions' }, [
					status?.updateAvailable === true && jobState !== 'succeeded'
						? h('button', {
							type: 'button',
							className: 'dshu_button dshu_button_primary',
							disabled: busy,
							onClick: runInstall,
						}, t('update.install', { version: status.updateTarget }))
						: null,
					h('button', {
						type: 'button',
						className: 'dshu_button',
						disabled: busy,
						onClick: runCheck,
					}, checking ? t('update.checking') : t('update.check')),
				]),
			];
			return h('div', { className: 'dshu_row' }, children);
		}

		/**
		 * Format a process age for the restart row.
		 * @param {number} seconds - uptime in seconds.
		 * @returns {string} compact age text.
		 */
		function formatUptime(seconds) {
			const total = Math.max(0, Math.floor(seconds));
			const days = Math.floor(total / 86400);
			const hours = Math.floor((total % 86400) / 3600);
			const minutes = Math.floor((total % 3600) / 60);
			if (days > 0) return `${days}天 ${hours}小时`;
			if (hours > 0) return `${hours}小时 ${minutes}分`;
			if (minutes > 0) return `${minutes}分`;
			return `${total}秒`;
		}

		/**
		 * Settings row that restarts the DSH service.
		 * @param {{t: (key:string, params?:any)=>string}} props - slot props.
		 * @returns {any} the rendered row.
		 */
		function RestartRow(props) {
			const t = props.t;
			const [confirming, setConfirming] = React.useState(false);
			const [state, setState] = React.useState('idle');
			const [error, setError] = React.useState(null);
			const [status, setStatus] = React.useState(null);
			const alive = React.useRef(true);

			React.useEffect(() => {
				alive.current = true;
				const load = () => {
					request(`${BASE}/status`).then((body) => {
						if (alive.current && body !== null) setStatus(body);
					}).catch(() => {});
				};
				load();
				// Refresh the uptime so the reader can watch it grow; a reset value
				// means the service genuinely restarted.
				const timer = setInterval(load, 15000);
				return () => {
					alive.current = false;
					clearInterval(timer);
				};
			}, []);

			React.useEffect(() => {
				if (!confirming) return undefined;
				const timer = setTimeout(() => setConfirming(false), 6000);
				return () => clearTimeout(timer);
			}, [confirming]);

			const restart = () => {
				setState('sending');
				setError(null);
				request(`${BASE}/restart`, { method: 'POST' }).then(() => {
					if (alive.current) setState('sent');
				}).catch((cause) => {
					if (!alive.current) return;
					// The Host answers before it stops, so a dropped connection means
					// the restart request already reached it.
					if (cause instanceof TypeError) {
						setState('sent');
						return;
					}
					setError(cause instanceof Error ? cause.message : String(cause));
					setState('idle');
				});
			};

			const onClick = () => {
				if (confirming) {
					restart();
					return;
				}
				setConfirming(true);
			};

			let description = t('restart.description');
			let tone = undefined;
			if (state === 'sending') {
				description = t('restart.sending');
				tone = 'warn';
			} else if (state === 'sent') {
				description = t('restart.sent');
				tone = 'warn';
			} else if (error !== null) {
				description = t('restart.failed', { reason: error });
				tone = 'error';
			} else if (status !== null && status.uptimeSeconds !== undefined) {
				// The running process's own age and identity: a page reconnect keeps
				// both, so a stable line here proves the service is not restarting.
				description = `${t('restart.description')} · ${t('restart.uptime', { uptime: formatUptime(status.uptimeSeconds), pid: status.bootId ?? '—' })}`;
			}

			return h('div', { className: 'dshu_row' }, [
				h('div', { className: 'dshu_text' }, [
					h('div', { className: 'dshu_title' }, t('restart.title')),
					h('div', { className: 'dshu_desc', 'data-tone': tone }, description),
				]),
				h('div', { className: 'dshu_actions' }, [
					h('button', {
						type: 'button',
						className: `dshu_button${confirming ? ' dshu_button_danger' : ''}`,
						disabled: state === 'sending',
						onClick: onClick,
					}, confirming ? t('restart.confirm') : t('restart.button')),
				]),
			]);
		}

		/** Client services this bundle needs. */
		const inject = ['slots', 'locale'];

		/**
		 * Client plugin body: register the two General-section rows.
		 * @param {any} ctx - client cordis context.
		 * @returns {void} nothing.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-tiedan-update: dictionaries');
			ctx.effect(() => {
				if (typeof document === 'undefined') return undefined;
				const tag = document.createElement('style');
				tag.dataset.plugin = 'dsh-tiedan-update';
				tag.dataset.pluginCss = 'dsh-tiedan-update/settings-rows';
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, 'dsh-tiedan-update: row styles');
			ctx.slots.inject('settings.general.item', () => ctx.slots.register({
				name: 'settings.general.item',
				id: 'dsh-tiedan-update',
				order: 101,
				locale: NS,
			}, UpdateRow));
			ctx.slots.inject('settings.general.item', () => ctx.slots.register({
				name: 'settings.general.item',
				id: 'dsh-tiedan-update-restart',
				order: 102,
				locale: NS,
			}, RestartRow));
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
