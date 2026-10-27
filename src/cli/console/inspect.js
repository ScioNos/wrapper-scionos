import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { detectClaudeCode, detectCodexCli, detectOpenCodeCli } from '../../platform/detect.js';
import { getStoredTokenStatus } from '../../security/token-store.js';
import { resolveServiceEnvToken } from '../../routerlab/services.js';
import { readClaudeDesktopStatus } from '../../apps/claude-desktop.js';
import { detectCodexApp, codexAppSnapshot } from '../../platform/codex-app-desktop.js';
import { CodexAppConfigSession } from '../../platform/codex-app-config.js';

export function desktopSnapshot(status) {
  return {
    supported: status.supported, applied: Boolean(status.applied), healthy: Boolean(status.healthy),
    profileExists: Boolean(status.profileExists), issues: status.issues ?? [],
    service: status.wrapperScionos?.service,
    families: status.wrapperScionos?.strategies ?? (status.wrapperScionos?.strategy ? [status.wrapperScionos.strategy] : []),
    routes: (status.wrapperScionos?.routes ?? []).map(({ routeId, upstreamModel, labelOverride }) => ({ routeId, upstreamModel, labelOverride })),
  };
}

export function collectInspection(service, dependencies = {}, notify = () => {}) {
  const detectors = dependencies.detectors ?? { 'claude-code': detectClaudeCode, codex: detectCodexCli, opencode: detectOpenCodeCli,
    'codex-app': detectCodexApp };
  const result = { clients: {} };
  for (const [client, detect] of Object.entries(detectors)) {
    try {
      const value = detect();
      result.clients[client] = { installed: value.installed, version: value.version, versionSupported: value.versionSupported, minimumVersion: value.minimumVersion };
      if (client === 'codex-app') {
        try { result.codexApp = { ...codexAppSnapshot(value), ...(dependencies.appStatus ?? (() => new CodexAppConfigSession().status()))() }; }
        catch { result.codexApp = { ...codexAppSnapshot(value), error: 'appInvalid' }; }
        result.clients[client] = { ...result.clients[client], ...codexAppSnapshot(value) };
        notify({ codexApp: result.codexApp });
      }
    } catch { result.clients[client] = { error: 'inspectionFailed' }; }
    notify({ clients: { ...result.clients } });
  }
  try {
    const status = (dependencies.tokenStatus ?? getStoredTokenStatus)(service);
    result.token = { stored: status.stored, supported: status.supported, backend: status.backend,
      env: Boolean((dependencies.envToken ?? resolveServiceEnvToken)(service, process.env).token) };
  } catch { result.token = { error: 'storageFailed' }; }
  notify({ token: result.token });
  try { result.desktop = desktopSnapshot((dependencies.desktopStatus ?? readClaudeDesktopStatus)()); }
  catch { result.desktop = { error: 'inspectionFailed' }; }
  notify({ desktop: result.desktop });
  return result;
}

export function startInspection(service, notify, { WorkerClass = Worker, timeoutMs = 60000 } = {}) {
  const worker = new WorkerClass(new URL('./inspect.js', import.meta.url), { workerData: { mode: 'console-inspection', service } });
  let settled = false;
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const complete = (error = null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    finish({ error });
  };
  const timer = setTimeout(() => { complete('inspectionFailed'); void worker.terminate(); }, timeoutMs);
  worker.on('message', (message) => { if (!settled) notify(message); });
  worker.once('error', () => complete('inspectionFailed'));
  worker.once('exit', (code) => complete(code === 0 ? null : 'inspectionFailed'));
  return { done, stop: async () => { complete(); await worker.terminate(); } };
}

if (!isMainThread && workerData?.mode === 'console-inspection') {
  collectInspection(workerData.service, {}, (snapshot) => parentPort.postMessage(snapshot));
}
