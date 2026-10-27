import { createCodexAppIntegration } from '../../apps/codex-app.js';
import { launchCodexAppFromMenu } from '../commands/codex-app.js';
import { askSelect, askYesNo } from '../menu.js';
import { print } from '../commands/output.js';
import { appErrorText, uiText } from './i18n.js';

// The linear menu shares the same ownership and recovery policy as the TUI.
export function createLinearAppSession(options, runtime, dependencies = {}) {
  const integration = dependencies.integration ?? createCodexAppIntegration(options);
  const signals = dependencies.signals ?? process;
  const processState = dependencies.processState ?? process;
  const select = dependencies.select ?? askSelect;
  const confirm = dependencies.confirm ?? askYesNo;
  const t = key => uiText(options.language, key);
  let abort = new AbortController();
  let native = false;
  let terminating = false;
  const onTerm = () => { terminating = true; processState.exitCode = 143; abort.abort(); };
  const onInt = () => { if (!native) abort.abort(); };
  signals.on('SIGTERM', onTerm); signals.on('SIGINT', onInt);
  async function exit({ interrupted = false } = {}) {
    if (interrupted && !terminating) processState.exitCode = 130;
    if (!integration.hasSession() || !integration.status().running || terminating) return true;
    abort = new AbortController();
    let action;
    try { action = await select(t('appExitPrompt'), [
      { value: 'close', name: t('appCloseRestore') }, { value: 'keep', name: t('appKeepRestore') },
      { value: 'cancel', name: t('back') },
    ], { language: options.language, signal: abort.signal }); }
    catch (error) { if (!['AbortError', 'AbortPromptError', 'ExitPromptError'].includes(error.name)) throw error; return true; }
    if (['cancel', 'back'].includes(action)) { processState.exitCode = 0; return false; }
    if (action === 'close') integration.close();
    return true;
  }
  return {
    signal: () => abort.signal,
    terminating: () => terminating,
    async menu(title, items, config) {
      try { return await runtime.askMenu(title, items, { ...config, signal: abort.signal }); }
      catch (error) {
        if (!['AbortError', 'AbortPromptError', 'ExitPromptError'].includes(error.name)) throw error;
        if (!terminating) processState.exitCode = 130;
        if (!terminating) abort = new AbortController();
        return 'quit';
      }
    },
    exit,
    async native(operation) { native = true; try { return await operation(); } finally { native = false; } },
    async action(action) {
      try {
        if (action === 'status') print(integration.status(), options);
        else if (action === 'restore') {
          print(integration.restore({ dryRun: true, recover: true }), options);
          if (await confirm(t('appRestore'), false, { signal: abort.signal })) print(integration.restore({ recover: true }), options);
        } else if (action === 'launch') {
          const result = await launchCodexAppFromMenu({ ...options, signal: abort.signal }, { integration, select, confirm });
          if (result.opened) print(t(result.requiresRestart ? 'appRestart' : 'appOpened'), options);
        }
      } catch (error) {
        if (terminating) return;
        abort = new AbortController();
        if (error.name === 'MenuExitError') return { exit: true };
        if (['AbortError', 'AbortPromptError', 'ExitPromptError'].includes(error.name)) return { exit: true, interrupted: true };
        if (!['AbortError', 'AbortPromptError', 'ExitPromptError', 'MenuBackError'].includes(error.name)) console.error(appErrorText(options.language, error));
      }
    },
    async shutdown() {
      signals.off('SIGTERM', onTerm); signals.off('SIGINT', onInt);
      try { if (integration.shutdown().restored) print(t('appRestored') + '\n' + t('appRestartNote'), options); }
      catch (error) { processState.exitCode ||= 1; throw error; }
    },
  };
}
