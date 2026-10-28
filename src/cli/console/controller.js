import { EventEmitter } from 'node:events';
import { requireServiceConfig } from '../../routerlab/services.js';
import { findStrategy, getServiceStrategies } from '../../routerlab/strategies.js';
import { consolePrompt } from './prompt.js';
import { cleanText, renderConsole } from './render.js';
import { loadPreferences, savePreferences, rememberSelection, CLIENTS } from './preferences.js';
import { startInspection } from './inspect.js';
import { createConsoleServices } from './services.js';
import { buildConsoleView, canLaunch, CLIENT_LABELS, familyFor, familyLabel, selectionModels, strategyEntries } from './view.js';
import { uiText, appErrorText } from './i18n.js';
import { createConsoleInput } from './input.js';
import { LANGUAGE_LABELS, LANGUAGE_MENU_TITLE, SUPPORTED_LANGUAGES } from '../i18n.js';

export function createConsoleState(options, preferences, version) {
  const service = requireServiceConfig(options.service);
  const saved = preferences.services[service.value];
  return {
    service: service.value, serviceLabel: service.label, language: options.language ?? 'en', version,
    page: 'home', client: saved?.lastClient ?? 'claude-code', desktopClient: 'desktop', preferences,
    selections: Object.fromEntries(CLIENTS.map((client) => [client, { ...(saved?.clients[client] ?? {}) }])),
    catalogues: {}, accessStatus: {}, inspection: { clients: {}, loading: true }, remember: true,
    proxyActive: false, proxyStopped: false, notice: '', warning: null, dialog: null,
    focus: { pane: 'content', index: 0 }, busy: false, journal: [],
  };
}

export function initializeSelection(state, client, catalogue, options = {}) {
  const current = state.selections[client];
  const remembered = Boolean(current.family || current.model || current.subagent);
  if (options.strategy) current.family = findStrategy(options.strategy, state.service)?.value ?? options.strategy;
  if (client === 'claude-code' && options.subagentModel) current.subagent = options.subagentModel;
  if (client !== 'claude-code' && options.model) current.model = options.model;
  if (!current.family && !remembered) {
    const preferred = catalogue.families.find((family) => !family.disabled && family.models?.some((entry) => (entry.model ?? entry) === catalogue.defaultModel));
    current.family = (preferred ?? catalogue.families.find((family) => !family.disabled))?.value;
  }
  const family = catalogue.families.find((entry) => entry.value === current.family && !entry.disabled);
  if (!family) return false;
  if (client === 'claude-code') {
    if (!current.subagent && !remembered) current.subagent = family.fixedSubagent
      ?? (catalogue.subagents.includes(family.defaultSubagent) ? family.defaultSubagent : null);
    return family.fixedSubagent ? family.fixedSubagent === current.subagent && catalogue.models.includes(current.subagent)
      : catalogue.subagents.includes(current.subagent);
  }
  const models = (family.models ?? []).map((entry) => entry.model ?? entry);
  if (!current.model && !remembered) {
    const preferred = family.defaultModel ?? catalogue.defaultModel;
    current.model = models.includes(preferred) ? preferred : null;
  }
  return models.includes(current.model);
}

export function selectFamily(state, value) {
  const family = state.catalogues[state.client]?.families.find((entry) => entry.value === value && !entry.disabled);
  if (!family) return;
  const current = state.selections[state.client];
  current.family = value;
  if (state.client === 'claude-code') current.subagent = family.fixedSubagent
    ?? (state.catalogues[state.client].subagents.includes(family.defaultSubagent) ? family.defaultSubagent : null);
  else {
    const models = selectionModels(state);
    const preferred = family.defaultModel ?? state.catalogues[state.client].defaultModel;
    current.model = models.includes(preferred) ? preferred : null;
  }
}

export async function runStructuredConsole(options, dependencies = {}) {
  options = { ...options };
  const output = dependencies.output ?? process.stdout;
  const inputManager = createConsoleInput(dependencies.input ?? process.stdin);
  let input = dependencies.input ?? process.stdin;
  const signals = dependencies.signalSource ?? process;
  const processState = dependencies.processState ?? process;
  const prompt = dependencies.prompt ?? consolePrompt;
  const load = dependencies.loadPreferences ?? loadPreferences;
  const save = dependencies.savePreferences ?? savePreferences;
  const inspect = dependencies.startInspection ?? startInspection;
  const services = dependencies.services ?? createConsoleServices(options);
  const loaded = load();
  const state = createConsoleState(options, loaded.value, dependencies.version ?? '8.0.0');
  state.warning = loaded.warning;
  const events = new EventEmitter();
  const prepared = new Map();
  let inspection;
  let inspectionGeneration = 0;
  let session;
  let pendingDesktop;
  let exiting = false;
  let childActive = false;
  let termination = 0;
  let promptAbort;
  let entered = false;
  let launchAbort;
  const t = (key) => uiText(state.language, key);
  const update = () => events.emit('change');
  const enter = () => { if (output.isTTY && !entered) { output.write('\x1b[?1049h\x1b[H\x1b[2J\x1b[?25l'); entered = true; } };
  const leave = () => { if (entered) { output.write('\x1b[?25h\x1b[?1049l'); entered = false; } };
  const log = (...values) => { state.journal.push(values.map(cleanText).join(' ')); state.journal = state.journal.slice(-50); };
  const logger = { log, error: log };
  const resetFocus = () => { state.focus = { pane: 'content', index: 0 }; };
  const onInterrupt = () => {
    if (launchAbort) {
      if (state.client === 'codex-app') { termination = 130; exiting = true; }
      launchAbort.abort(Object.assign(new Error('Launch interrupted.'), { name: 'AbortError', signal: 'SIGINT' }));
    }
    else if (!childActive) { termination = 130; exiting = !services.hasAppSession?.(); promptAbort?.abort(); }
  };
  const onTerminate = () => {
    termination = 143; exiting = true;
    launchAbort?.abort(Object.assign(new Error('Launch terminated.'), { name: 'AbortError', signal: 'SIGTERM' }));
    promptAbort?.abort();
  };
  signals.on('SIGINT', onInterrupt);
  signals.on('SIGTERM', onTerminate);

  async function refreshInspection() {
    const generation = ++inspectionGeneration;
    await inspection?.stop();
    state.inspection.loading = true;
    inspection = inspect(state.service, (snapshot) => {
      if (generation !== inspectionGeneration || exiting) return;
      state.inspection = { ...state.inspection, ...snapshot,
        clients: { ...state.inspection.clients, ...snapshot.clients } };
      if (services.hasAppSession?.()) refreshApp();
      update();
    });
    inspection.done.then((result) => {
      if (generation !== inspectionGeneration || exiting) return;
      state.inspection.loading = false;
      if (result.error) state.warning = result.error;
      update();
    });
  }

  async function busy(operation) {
    state.busy = true;
    if (entered) output.write('\x1b[H\x1b[2J' + renderConsole(state, state.focus, output));
    try { return await operation(); } finally {
      state.busy = false;
      if (entered) output.write('\x1b[H\x1b[2J');
    }
  }

  async function prepare(client, resume = false) {
    state.client = client;
    state.page = 'launch';
    state.notice = '';
    resetFocus();
    if (resume) state.selections[client] = { ...state.preferences.services[state.service].clients[client] };
    const hadSelection = Boolean(state.selections[client].family);
    prepared.delete(client);
    delete state.catalogues[client];
    state.accessStatus[client] = 'accessUnknown';
    const capability = await busy(() => services.prepare(client));
    if (exiting) return;
    const { execute, ...catalogue } = capability;
    if (typeof execute !== 'function') throw new Error('Invalid launch capability.');
    prepared.set(client, execute);
    state.catalogues[client] = catalogue;
    state.accessStatus[client] = 'verified';
    if (!initializeSelection(state, client, catalogue, options)) state.notice = t(hadSelection ? 'selectAgain' : 'selectFirst');
  }

  function picker(kind, title, entries, lines = []) {
    state.dialog = { kind, title, entries: [...entries, { action: 'back', label: t('back') }], lines };
    resetFocus();
  }

  function confirm(kind, message) {
    state.dialog = { kind, title: t('confirm'), lines: [message], entries: [
      { action: 'back', label: t('no') }, { action: 'confirm', label: t('yes') },
    ] };
    resetFocus();
  }

  function refreshDesktop() {
    state.inspection.desktop = services.desktopStatus();
    state.proxyActive = Boolean(session?.active);
  }

  function refreshApp() {
    const app = services.appStatus?.();
    if (!app) return;
    state.inspection.codexApp = app;
    state.inspection.clients['codex-app'] = app;
  }

  function requestExit() {
    if (services.hasAppSession?.()) {
      refreshApp();
      if (state.inspection.codexApp?.running) {
        state.dialog = { kind: 'exitApp', title: t('appExitPrompt'), lines: [t('appRestartNote')], entries: [
          { action: 'closeAppQuit', label: t('appCloseRestore') }, { action: 'keepAppQuit', label: t('appKeepRestore') },
          { action: 'back', label: t('back') },
        ] };
        resetFocus(); return;
      }
    }
    exiting = true;
  }

  async function stopProxy() {
    if (session) {
      const current = session;
      await current.stop();
      current.server?.off('error', proxyError);
      current.server?.off('close', proxyClosed);
      session = null;
    }
    state.proxyActive = false;
    state.proxyStopped = true;
  }

  function proxyError(error) {
    state.proxyActive = Boolean(session?.active);
    state.notice = t('failed') + ': ' + cleanText(error.message);
    log(state.notice);
    update();
  }

  function proxyClosed() {
    state.proxyActive = false;
    state.proxyStopped = true;
    update();
  }

  function desktopConfiguration(families) {
    const current = state.inspection.desktop;
    return {
      host: options.host ?? '127.0.0.1', port: options.port ?? 15721,
      strategyValues: families ?? (current?.service === state.service && current.families?.length ? current.families : undefined),
    };
  }

  function planDesktop(families) {
    const configuration = desktopConfiguration(families);
    pendingDesktop = { configuration, plan: services.planDesktop(configuration) };
    if (pendingDesktop.plan.requiresConfirmation) {
      confirm('replaceDesktop', t('replacePrompt'));
      const requested = pendingDesktop.plan.config;
      if (requested) state.dialog.lines.push(`${t('service')} : ${requested.serviceValue}`,
        `${t('families')} : ${(requested.strategyValues ?? [requested.strategyValue]).join(', ')}`);
    }
    else return startProxy();
  }

  async function startProxy() {
    const pending = pendingDesktop;
    pendingDesktop = null;
    if (session) await stopProxy();
    session = await busy(() => services.startDesktop({ ...pending.configuration, interactiveDesktopPlan: pending.plan }, logger));
    session.server?.on('error', proxyError);
    session.server?.once('close', proxyClosed);
    if (exiting) return;
    state.proxyStopped = false;
    refreshDesktop();
    state.notice = t('running');
    state.dialog = null;
  }

  function reviewLaunch() {
    if (!canLaunch(state) || !prepared.has(state.client)) { state.notice = t('selectFirst'); return; }
    const summary = buildConsoleView({ ...state, page: 'launch', dialog: null }).summary;
    state.dialog = { kind: 'launch', title: t('summary'), entries: [
      ...summary.slice(2).filter(Boolean).map((label) => ({ action: 'noop', label })),
      { action: 'confirm', label: `${t('launch')} ${CLIENT_LABELS[state.client]}` },
      { action: 'back', label: t('back') },
    ] };
    resetFocus();
  }

  async function launch() {
    if (exiting) return;
    if (!canLaunch(state) || !prepared.has(state.client)) { state.notice = t('selectFirst'); return; }
    const client = state.client;
    const selection = { ...state.selections[client] };
    const remember = state.remember;
    // Desktop activation never takes terminal input. Keep this console's TTY
    // attached; only a foreground CLI needs the native terminal handoff.
    childActive = true;
    launchAbort = new AbortController();
    try {
      if (client !== 'codex-app') {
        leave();
        await inputManager.release();
      }
      launchAbort.signal.throwIfAborted();
      const execute = () => prepared.get(client)(selection, { language: state.language, signal: launchAbort.signal, onSpawn() {
        if (!remember) return;
        state.preferences = rememberSelection(state.preferences, state.service, client, selection);
        const saved = save(state.preferences);
        if (!saved.ok) state.warning = saved.warning;
      } });
      const result = client === 'codex-app' ? await busy(execute) : await execute();
      const code = typeof result === 'number' ? result : result?.exitCode ?? 0;
      if (client === 'codex-app') { refreshApp(); state.notice = t(result?.requiresRestart ? 'appRestart' : 'appOpened'); }
      else state.notice = `${t(code === 130 ? 'interrupted' : code === 0 ? 'launched' : 'failed')} : ${CLIENT_LABELS[client]} (${code})`;
    } catch (error) {
      if (launchAbort.signal.aborted && !error.cleanupError) { state.notice = t('interrupted'); return; }
      prepared.delete(client);
      delete state.catalogues[client];
      state.accessStatus[client] = 'accessFailed';
      throw error;
    } finally {
      childActive = false;
      launchAbort = null;
      state.page = 'home';
      resetFocus();
      processState.exitCode = termination;
      if (!exiting) { input = inputManager.acquire(); enter(); }
    }
  }

  async function dispatch(entry) {
    const { action, value } = entry;
    if (action === 'quit') { requestExit(); return; }
    if (action === 'closeAppQuit' || action === 'keepAppQuit') {
      if (action === 'closeAppQuit') await busy(() => services.closeApp());
      exiting = true; return;
    }
    if (action === 'back') {
      if (state.dialog?.kind === 'exitApp') termination = 0;
      state.dialog = null;
      pendingDesktop = null;
      state.page = state.page === 'home' ? 'home' : state.page;
      if (!buildConsoleView(state).modal && entry.fromEscape && !entry.wasDialog) state.page = 'home';
      resetFocus(); return;
    }
    if (action === 'navigate') {
      state.page = value; state.dialog = null; state.notice = ''; resetFocus();
      if (value === 'launch' && !prepared.has(state.client)) await prepare(state.client);
      return;
    }
    if (action === 'tool') {
      if (value === 'desktop' || value === 'cowork') { state.page = 'desktop'; state.desktopClient = value; refreshDesktop(); resetFocus(); }
      else await prepare(value);
    } else if (action === 'chooseLanguage') picker('language', LANGUAGE_MENU_TITLE, SUPPORTED_LANGUAGES.map((language) => ({ action: 'pick', value: language, label: LANGUAGE_LABELS[language] })));
    else if (action === 'prepare') await prepare(state.client);
    else if (action === 'resume' || action === 'relaunch') {
      await prepare(value, true);
      if (action === 'relaunch' && !exiting && canLaunch(state)) reviewLaunch();
    } else if (action === 'chooseClient') picker('client', t('tool'), CLIENTS.map((client) => ({ action: 'pick', value: client, label: CLIENT_LABELS[client] })));
    else if (action === 'chooseFamily') picker('family', t('family'), (state.catalogues[state.client]?.families ?? []).map((family) => ({ action: 'pick', value: family.value, label: familyLabel(state, family), disabled: Boolean(family.disabled), detail: family.disabled || '' })));
    else if (action === 'chooseModel') picker('model', t('model'), selectionModels(state).map((model) => ({ action: 'pick', value: model, label: model })));
    else if (action === 'chooseSubagent') picker('subagent', t('subagent'), (state.catalogues[state.client]?.subagents ?? []).map((model) => ({ action: 'pick', value: model, label: model })));
    else if (action === 'chooseDesktopApp') picker('desktopApp', t('desktop'), [
      { action: 'pick', value: 'desktop', label: 'Claude Desktop' }, { action: 'pick', value: 'cowork', label: 'Claude Cowork' },
      { action: 'pick', value: 'codex-app', label: 'Codex App' },
    ]);
    else if (action === 'pick') {
      const kind = state.dialog.kind;
      state.dialog = null; state.notice = ''; resetFocus();
      if (kind === 'language') {
        if (SUPPORTED_LANGUAGES.includes(value)) { state.language = value; options.language = value; }
      }
      else if (kind === 'client') await prepare(value);
      else if (kind === 'desktopApp') { state.desktopClient = value; if (value === 'codex-app') refreshApp(); else refreshDesktop(); }
      else if (kind === 'family') selectFamily(state, value);
      else state.selections[state.client][kind] = value;
    } else if (action === 'remember') state.remember = !state.remember;
    else if (action === 'launch') reviewLaunch();
    else if (action === 'login') {
      leave();
      promptAbort = new AbortController();
      try { await services.login({ signal: promptAbort.signal, input, output }); } finally { if (!exiting) enter(); }
      prepared.clear(); state.catalogues = {}; state.accessStatus = {};
      await inspection?.stop(); ++inspectionGeneration;
      state.inspection.token = services.tokenStatus();
      state.notice = t('stored');
    } else if (action === 'logout') confirm('logout', t('logoutPrompt'));
    else if (action === 'testAccess') { await busy(() => services.verify(state.client)); state.accessStatus[state.client] = 'verified'; state.notice = t('verified'); }
    else if (action === 'refreshInspection') await refreshInspection();
    else if (action === 'strategies') picker('info', t('strategies'), strategyEntries(state), [t('verifyBefore')]);
    else if (action === 'startProxy') await planDesktop();
    else if (action === 'stopProxy') { await busy(stopProxy); refreshDesktop(); state.notice = t('stoppedNote'); }
    else if (action === 'restore') confirm('restore', t('restorePrompt'));
    else if (action === 'restoreApp') confirm('restoreApp', t('appRestore'));
    else if (action === 'routes') {
      refreshDesktop();
      picker('info', t('routes'), (state.inspection.desktop.routes ?? []).map((route) => ({ action: 'noop', label: `${route.routeId} → ${route.upstreamModel}` })), state.inspection.desktop.routes?.length ? [] : [t('noRoutes')]);
    } else if (action === 'journal') picker('info', t('log'), state.journal.map((message) => ({ action: 'noop', label: message })));
    else if (action === 'desktopFamilies') {
      const selected = desktopConfiguration().strategyValues ?? getServiceStrategies(state.service).map((family) => family.value);
      picker('families', t('families'), [], [t('selectFamilies')]);
      state.dialog.selected = [...selected];
      updateFamilyPicker();
    } else if (action === 'toggleFamily') {
      const selected = state.dialog.selected;
      state.dialog.selected = selected.includes(value) ? selected.filter((family) => family !== value) : [...selected, value];
      updateFamilyPicker();
    } else if (action === 'applyFamilies') {
      const families = [...state.dialog.selected];
      state.dialog = null;
      await planDesktop(families);
    } else if (action === 'confirm') {
      const kind = state.dialog.kind;
      state.dialog = null; resetFocus();
      if (kind === 'launch') await launch();
      else if (kind === 'restoreApp') { await busy(() => services.restoreApp()); refreshApp(); state.notice = t('appRestored'); }
      else if (kind === 'replaceDesktop') await startProxy();
      else if (kind === 'restore') { await busy(stopProxy); await busy(() => services.restoreDesktop()); refreshDesktop(); state.notice = t('official'); }
      else if (kind === 'logout') {
        await busy(() => services.logout());
        prepared.clear(); state.catalogues = {}; state.accessStatus = {};
        await inspection?.stop(); ++inspectionGeneration;
        state.inspection.token = services.tokenStatus(); state.notice = `${t('deleted')} ${t('logoutEnv')}`;
      }
    }
  }

  function updateFamilyPicker() {
    const selected = state.dialog.selected;
    state.dialog.entries = getServiceStrategies(state.service).map((family) => ({ action: 'toggleFamily', value: family.value,
      label: `[${selected.includes(family.value) ? 'x' : ' '}] ${family.selectionName ?? family.name}` }));
    state.dialog.entries.push({ action: 'applyFamilies', label: t('apply'), disabled: selected.length === 0 }, { action: 'back', label: t('no') });
  }

  try {
    input = inputManager.acquire();
    enter();
    await refreshInspection();
    while (!exiting) {
      promptAbort = new AbortController();
      let entry;
      try {
        entry = await prompt({ state, events, output }, { input, output, signal: promptAbort.signal, clearPromptOnDone: true });
      } catch (error) {
        if (['ExitPromptError', 'AbortPromptError'].includes(error.name)) {
          termination ||= 130;
          if (!exiting && state.dialog?.kind !== 'exitApp' && services.hasAppSession?.()) { requestExit(); if (!exiting) continue; }
          break;
        }
        throw error;
      }
      if (exiting) break;
      try {
        await dispatch({ ...entry, fromEscape: entry.action === 'back', wasDialog: Boolean(state.dialog) });
      } catch (error) {
        if (['ExitPromptError', 'AbortPromptError'].includes(error.name)) {
          termination ||= 130;
          if (!exiting && services.hasAppSession?.()) requestExit(); else exiting = true;
          continue;
        }
        if (['MenuBackError', 'MenuExitError'].includes(error.name)) {
          state.dialog = null; state.notice = ''; continue;
        }
        state.notice = error.code === 'EADDRINUSE' ? t('externalProxy') : `${t('failed')} : ${cleanText(appErrorText(state.language, error))}`;
        if (error.code === 'recovery_required') { state.page = 'desktop'; state.desktopClient = 'codex-app'; refreshApp(); }
        if (entry.action === 'testAccess' || ['auth_failed', 'network_error', 'timeout'].includes(error.code)) state.accessStatus[state.client] = 'accessFailed';
        log(state.notice);
      }
    }
  } finally {
    exiting = true;
    ++inspectionGeneration;
    let appRestored = false;
    let appCleanupError;
    try { appRestored = Boolean((await services.shutdownApp?.())?.restored); }
    catch (error) { appCleanupError = error; termination ||= 1; state.notice = appErrorText(state.language, error); }
    try { await inspection?.stop(); } finally {
      try { await stopProxy(); } finally {
        signals.off('SIGINT', onInterrupt); signals.off('SIGTERM', onTerminate);
        try { await inputManager.release(); } finally {
          leave();
          processState.exitCode = termination;
          if (appCleanupError) output.write('\n' + state.notice + '\n');
          else if (appRestored) output.write('\n' + t('appRestored') + '\n' + t('appRestartNote') + '\n');
          await new Promise(resolve => output.write('', resolve));
          await inputManager.dispose();
        }
      }
    }
  }
  return state;
}
