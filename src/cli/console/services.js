import { password } from '@inquirer/prompts';
import { launchClaudeCode, resolveTokenWithSource } from '../../apps/claude-code.js';
import { readClaudeDesktopStatus, restoreOfficialClaudeDesktop } from '../../apps/claude-desktop.js';
import { fetchModels, validateTokenFormat } from '../../routerlab/models.js';
import { resolveServiceEnvToken } from '../../routerlab/services.js';
import { deleteStoredToken, getStoredTokenStatus, storeToken } from '../../security/token-store.js';
import { launchCodexForService } from '../commands/codex.js';
import { launchOpenCodeForService } from '../commands/opencode.js';
import { planInteractiveClaudeDesktopStart, startManagedClaudeDesktopProxy } from '../commands/claude-desktop.js';
import { desktopSnapshot } from './inspect.js';
import { uiText } from './i18n.js';
import { resolveCliToken } from '../token-option.js';
import { createCodexAppIntegration } from '../../apps/codex-app.js';

export function createConsoleServices(options, dependencies = {}) {
  const ops = { password, launchClaudeCode, launchCodexForService, launchOpenCodeForService,
    resolveTokenWithSource, fetchModels, storeToken, deleteStoredToken, getStoredTokenStatus,
    resolveServiceEnvToken, readClaudeDesktopStatus, restoreOfficialClaudeDesktop,
    planInteractiveClaudeDesktopStart, startManagedClaudeDesktopProxy, ...dependencies };
  const app = dependencies.codexApp ?? createCodexAppIntegration(options, dependencies.appDependencies);
  return {
    prepare(client) {
      if (client === 'codex-app') return app.prepare();
      if (client === 'claude-code') {
        if (options.token || options.tokenFromStdin || options.providedOptions?.has('token')) {
          throw new Error('--token / --token-stdin cannot be used for Claude Code. Use account & access.');
        }
        return ops.launchClaudeCode({ serviceValue: options.service, language: options.language,
          claudeArgs: options.passthrough ?? [], noPrompt: true, quiet: true, prepareOnly: true });
      }
      const launch = client === 'codex' ? ops.launchCodexForService : ops.launchOpenCodeForService;
      return launch({ ...options, strategy: undefined, model: undefined, prepareOnly: true, noPrompt: true });
    },
    async login({ signal, input, output } = {}) {
      const token = await ops.password({ message: uiText(options.language, 'password') }, { signal, input, output });
      const format = validateTokenFormat(token);
      if (!format.valid) throw new Error(format.message);
      ops.storeToken(token.trim(), options.service);
    },
    logout: () => ops.deleteStoredToken(options.service),
    tokenStatus() {
      const value = ops.getStoredTokenStatus(options.service);
      return { stored: value.stored, supported: value.supported, backend: value.backend,
        env: Boolean(ops.resolveServiceEnvToken(options.service, process.env).token) };
    },
    async verify(client) {
      if (client === 'codex-app') { await app.prepare(); return; }
      const explicit = resolveCliToken(options);
      const resolved = explicit ? { token: explicit } : await ops.resolveTokenWithSource({ serviceValue: options.service,
        noPrompt: true, preferStored: ['codex', 'codex-app'].includes(client), language: options.language });
      const result = await ops.fetchModels(resolved.token, { serviceValue: options.service });
      if (!result.valid) throw new Error(`${uiText(options.language, 'accessFailed')} (${result.reason ?? result.status ?? 'unknown'})`);
    },
    desktopStatus: () => desktopSnapshot(ops.readClaudeDesktopStatus()),
    planDesktop: (configuration) => ops.planInteractiveClaudeDesktopStart({ ...options, ...configuration }),
    startDesktop: (configuration, logger) => ops.startManagedClaudeDesktopProxy({ ...options, ...configuration, noPrompt: true }, { logger }),
    restoreDesktop: () => ops.restoreOfficialClaudeDesktop({ dryRun: false }),
    appStatus: () => app.status(),
    restoreApp: () => app.restore({ recover: true }),
    closeApp: () => app.close(),
    shutdownApp: () => app.shutdown(),
    hasAppSession: () => app.hasSession(),
  };
}
