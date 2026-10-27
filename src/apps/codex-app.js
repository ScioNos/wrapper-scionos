import path from 'node:path';
import { requireServiceConfig } from '../routerlab/services.js';
import { fetchModels } from '../routerlab/models.js';
import { readCodexAppCredential } from '../security/codex-app-credential.js';
import { launchCodexForService } from '../cli/commands/codex.js';
import { codexAppPaths, CodexAppConfigSession } from '../platform/codex-app-config.js';
import { appConfigError } from '../platform/codex-app-toml.js';
import { detectCodexApp, codexAppSnapshot, isCodexAppRunning, openCodexApp, requestCodexAppClose } from '../platform/codex-app-desktop.js';
import { describeCodexAppRuntime, installCodexAppRuntime, removeCodexAppRuntime } from '../platform/codex-app-runtime.js';

export function createCodexAppIntegration(options = {}, dependencies = {}) {
  const service = requireServiceConfig(options.service);
  const paths = dependencies.paths ?? codexAppPaths();
  const session = dependencies.session ?? new CodexAppConfigSession(paths);
  const ops = { detect: detectCodexApp, credential: readCodexAppCredential, fetchModels,
    open: openCodexApp, isRunning: isCodexAppRunning, close: requestCodexAppClose,
    installRuntime: installCodexAppRuntime, ...dependencies };
  let active = false;
  let managed = false;
  const runtimes = new Set();
  let lastApp;
  function status() {
    const app = ops.detect();
    lastApp = app;
    const snapshot = codexAppSnapshot(app);
    try { return { ...snapshot, ...session.status() }; }
    catch (error) { return { ...snapshot, configPath: paths.configPath, configured: false, error: error.code ?? 'config_invalid' }; }
  }
  async function discover() {
    const app = ops.detect();
    lastApp = app;
    if (!app.supported) throw appConfigError('codex_app_unsupported', 'Codex App integration is supported on Windows and macOS.');
    if (!app.installed) throw appConfigError('codex_app_not_found', 'Codex App is not installed.');
    if (!app.versionSupported) throw appConfigError('codex_app_version', 'Update Codex App: its embedded Codex engine is not supported.');
    const current = session.status();
    if (current.ownerActive && !current.owned) throw appConfigError('config_busy', 'Another ScioNos session owns this Codex configuration.');
    if (current.recoveryRequired) throw appConfigError('recovery_required', 'Restore the previous Codex App session in Applications desktop before continuing.');
    const token = ops.credential(service.value);
    let discovery;
    const capability = await launchCodexForService({ service: service.value, language: options.language,
      noPrompt: true, prepareOnly: true }, {
      assertCodexCliAvailable: () => ({ installed: true, versionSupported: true, version: app.engineVersion, cliPath: app.enginePath }),
      resolveTokenWithSource: async () => ({ token, source: 'secure-storage' }),
      fetchModels: async (...args) => { discovery = await ops.fetchModels(...args); return discovery; },
    });
    return { app, catalogue: capability, metadata: discovery.modelMetadata ?? [] };
  }
  function configuration(selection, descriptor) {
    return { ...descriptor, providerId: 'scionos_' + service.value,
      baseUrl: service.baseUrl.replace(/\/$/, '') + '/v1', service: service.value, model: selection.model };
  }
  function assertSelection(catalogue, selection) {
    const family = catalogue.families.find(item => item.value === selection.family);
    if (!family || !family.models.some(item => item.model === selection.model)) {
      throw appConfigError('model_unavailable', 'The selected Codex App model is no longer available. Select it again.');
    }
  }
  async function prepare() {
    const { app, catalogue } = await discover();
    const { execute: unused, ...publicCatalogue } = catalogue;
    return { ...publicCatalogue, app: codexAppSnapshot(app),
      execute: (selection, hooks) => launch(selection, hooks) };
  }
  async function preview(selection) {
    const { catalogue } = await discover();
    assertSelection(catalogue, selection);
    const plan = session.preview(configuration(selection, describeCodexAppRuntime(paths)));
    return { dryRun: true, configPath: paths.configPath, service: service.value, model: selection.model,
      provider: 'scionos_' + service.value, changedKeys: ['model', 'model_provider', 'model_catalog_json', 'model_providers.scionos_' + service.value],
      previous: Object.fromEntries(Object.entries(plan.before).map(([key, entry]) => [key, { present: entry.present }])), restoresOnExit: true };
  }
  async function launch(selection, { onSpawn, signal } = {}) {
    const { app, catalogue, metadata } = await discover();
    assertSelection(catalogue, selection);
    signal?.throwIfAborted();
    const descriptor = describeCodexAppRuntime(paths);
    // Check collisions and recovery before creating even our own runtime files.
    session.preview(configuration(selection, descriptor));
    const familyModels = catalogue.families.find(item => item.value === selection.family).models.map(item => item.model);
    const runtime = ops.installRuntime(paths, { descriptor, models: familyModels, modelMetadata: metadata });
    runtimes.add(runtime.directory);
    try {
      signal?.throwIfAborted();
      session.activate(configuration(selection, runtime));
      active = true;
      const result = await ops.open(app);
      managed = true;
      onSpawn?.();
      return { ...result, exitCode: 0, desktop: true, configured: true, service: service.value, model: selection.model };
    } catch (error) {
      if (active) { try { session.restore(); active = false; } catch (cleanupError) { error.cleanupError = cleanupError; } }
      if (!ops.isRunning(app)) { removeCodexAppRuntime(paths, runtime.directory); runtimes.delete(runtime.directory); }
      throw error;
    }
  }
  function restore({ recover = false, dryRun = false } = {}) {
    const record = session.readJournal();
    const result = session.restore({ recover, dryRun });
    if (!dryRun) {
      active = false;
      if (record) {
        const directory = path.dirname(JSON.parse(record.applied.model_catalog_json.raw));
        if (path.dirname(path.resolve(directory)) === path.resolve(paths.runtimePath) && /^[a-f0-9-]{36}$/.test(path.basename(directory))) runtimes.add(directory);
      }
      cleanupRuntime();
    }
    return result;
  }
  function cleanupRuntime() {
    if (!runtimes.size) return;
    if (ops.isRunning(lastApp ?? ops.detect())) return;
    for (const directory of runtimes) { removeCodexAppRuntime(paths, directory); runtimes.delete(directory); }
  }
  function close() { return ops.close(lastApp ?? ops.detect()); }
  function shutdown() {
    try { if (active) return restore(); cleanupRuntime(); return { restored: false }; }
    finally { managed = false; }
  }
  return { prepare, preview, launch, status, restore, close, shutdown, hasSession: () => active || managed };
}
