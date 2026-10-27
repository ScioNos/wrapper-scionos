import { createCodexAppIntegration } from '../../apps/codex-app.js';
import { CliUsageError } from '../args.js';
import { applyMenuControl, askSelect, askYesNo } from '../menu.js';
import { print } from './output.js';
import { appErrorText, uiText } from '../console/i18n.js';
import { findStrategy } from '../../routerlab/strategies.js';

export async function selectCodexAppConfiguration(integration, options, { select = askSelect } = {}) {
  const catalogue = await integration.prepare();
  const t = key => uiText(options.language, key);
  const requested = options.strategy ? findStrategy(options.strategy, options.service)?.value : null;
  let family = requested ? catalogue.families.find(item => item.value === requested) : null;
  if (options.strategy && !family) throw Object.assign(new Error(t('selectAgain')), { code: 'model_unavailable' });
  if (!family && options.model) family = catalogue.families.find(item => item.models.some(entry => entry.model === options.model));
  if (!family && !options.noPrompt) {
    const value = applyMenuControl(await select(t('family'), catalogue.families.map(item => ({ value: item.value, name: item.name })), { language: options.language, signal: options.signal }), { allowBack: false });
    family = catalogue.families.find(item => item.value === value);
  }
  if (!family && !requested && !options.model) family = catalogue.families.find(item => item.models.some(entry => entry.model === catalogue.defaultModel));
  if (!family) throw Object.assign(new Error(t('selectFirst')), { code: 'model_unavailable' });
  let model = options.model;
  if (!model && !options.noPrompt) model = applyMenuControl(await select(t('model'), family.models.map(item => ({ name: item.model, value: item.model })), { language: options.language, signal: options.signal }), { allowBack: false });
  model ??= family.models.some(entry => entry.model === catalogue.defaultModel) ? catalogue.defaultModel : family.defaultModel;
  if (!family.models.some(entry => entry.model === model)) throw Object.assign(new Error(t('selectAgain')), { code: 'model_unavailable' });
  return { family: family.value, model };
}

export async function launchCodexAppFromMenu(options, { integration = createCodexAppIntegration(options), select = askSelect, confirm = askYesNo } = {}) {
  const selection = await selectCodexAppConfiguration(integration, options, { select });
  const preview = await integration.preview(selection);
  if (options.dryRun) return { preview };
  if (!options.yes && !await confirm(uiText(options.language, 'appApplyPrompt'), false, { signal: options.signal })) return { cancelled: true };
  return integration.launch(selection, { signal: options.signal });
}

export async function handleCodexApp(action, options, dependencies = {}) {
  try { return await runCodexAppCommand(action, options, dependencies); }
  catch (error) { error.message = appErrorText(options.language, error); throw error; }
}

async function runCodexAppCommand(action, options, dependencies) {
  const integration = dependencies.integration ?? createCodexAppIntegration(options, dependencies.appDependencies);
  const select = dependencies.select ?? askSelect;
  const confirm = dependencies.confirm ?? askYesNo;
  const signals = dependencies.signalSource ?? process;
  const exitState = dependencies.exitState ?? process;
  const interactive = dependencies.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const t = key => uiText(options.language, key);
  if (action === 'status') return print(integration.status(), options);
  if (action === 'restore') {
    if (options.dryRun || !options.yes) return print(integration.restore({ dryRun: true, recover: true }), options);
    return print(integration.restore({ recover: true }), options);
  }
  if (action !== 'launch') throw new CliUsageError('Unknown codex-app action.');
  if (options.json && !options.dryRun) throw new CliUsageError('--json is supported for codex-app launch only with --dry-run.');
  if ((options.noPrompt || !interactive) && !options.dryRun && !options.yes) throw new CliUsageError('codex-app launch requires --yes when prompting is disabled.');
  let signal = null;
  let keepAlive;
  let wake;
  let abort = new AbortController();
  const interrupted = value => { signal = value; abort.abort(); wake?.(); };
  const onInt = () => interrupted('SIGINT');
  const onTerm = () => interrupted('SIGTERM');
  signals.on('SIGINT', onInt); signals.on('SIGTERM', onTerm);
  try {
    const selected = await selectCodexAppConfiguration(integration, { ...options, noPrompt: options.noPrompt || options.json || !interactive, signal: abort.signal }, { select });
    const preview = await integration.preview(selected);
    if (options.dryRun) return print(preview, options);
    if (!options.yes && !await confirm(t('appApplyPrompt'), false, { signal: abort.signal })) return;
    abort.signal.throwIfAborted();
    const result = await integration.launch(selected, { signal: abort.signal });
    // The GUI is detached. Signal listeners and an unresolved promise alone
    // do not keep Node alive when stdin is redirected.
    keepAlive = setInterval(() => {}, 60000);
    print(t(result.requiresRestart ? 'appRestart' : 'appOpened') + '\n' + t('appWait'), options);
    while (true) {
      if (!signal) await new Promise(resolve => { wake = resolve; });
      if (signal === 'SIGTERM' || !interactive || options.noPrompt) break;
      abort = new AbortController();
      let action;
      try {
        action = await select(t('appExitPrompt'), [
          { name: t('appCloseRestore'), value: 'close' }, { name: t('appKeepRestore'), value: 'keep' }, { name: t('back'), value: 'cancel' },
        ], { language: options.language, signal: abort.signal });
      } catch (error) { if (!['ExitPromptError', 'AbortPromptError'].includes(error.name)) throw error; break; }
      if (['cancel', 'back'].includes(action) && signal !== 'SIGTERM') { signal = null; abort = new AbortController(); continue; }
      if (action === 'close' && signal !== 'SIGTERM') integration.close();
      break;
    }
  } catch (error) {
    if (!signal) throw error;
  } finally {
    clearInterval(keepAlive);
    signals.off('SIGINT', onInt); signals.off('SIGTERM', onTerm);
    if (signal) exitState.exitCode = signal === 'SIGTERM' ? 143 : 130;
    if (integration.hasSession()) {
      try { integration.shutdown(); if (!options.json) console.log(t('appRestored') + '\n' + t('appRestartNote')); }
      catch (error) { exitState.exitCode ||= 1; throw error; }
    }
  }
}
