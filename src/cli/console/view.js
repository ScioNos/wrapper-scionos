import { findStrategy, getClaudeCodeStrategyEnvironment, getStrategyDisplayName, getServiceStrategies } from '../../routerlab/strategies.js';
import { STRATEGY_MODEL_KEYS } from '../../routerlab/strategy-models.js';
import { uiText } from './i18n.js';
import { LANGUAGE_LABELS, LANGUAGE_MENU_TITLE } from '../i18n.js';

export const CLIENT_LABELS = Object.freeze({ 'claude-code': 'Claude Code', codex: 'Codex CLI', opencode: 'OpenCode CLI', 'codex-app': 'Codex App' });
export const PAGES = Object.freeze(['home', 'launch', 'desktop', 'access', 'diagnostic']);
const item = (action, label, value = null, extra = {}) => ({ action, label, value, ...extra });

export function familyFor(state) {
  return state.catalogues[state.client]?.families.find((family) => family.value === state.selections[state.client]?.family);
}

export function familyLabel(state, family) {
  return findStrategy(family?.value, state.service)?.selectionName ?? family?.name ?? state.selections[state.client]?.family ?? '—';
}

export function selectionModels(state) {
  return (familyFor(state)?.models ?? []).map((entry) => typeof entry === 'string' ? entry : entry.model);
}

export function canLaunch(state) {
  const selection = state.selections[state.client];
  const catalogue = state.catalogues[state.client];
  const family = familyFor(state);
  if (!selection || !catalogue || !family || family.disabled) return false;
  if (state.client === 'claude-code') return family.fixedSubagent
    ? family.fixedSubagent === selection.subagent && catalogue.models.includes(selection.subagent)
    : catalogue.subagents.includes(selection.subagent);
  return selectionModels(state).includes(selection.model);
}

export function clientStatus(state, client) {
  const t = (key) => uiText(state.language, key);
  const value = state.inspection.clients?.[client];
  if (!value) return t(state.inspection.loading ? 'checking' : 'unknown');
  if (client === 'codex-app' && value.supported === false) return t('appUnsupported');
  if (value.error) return t('inspectionFailed');
  return t(!value.installed ? 'missing' : value.versionSupported ? 'installed' : 'incompatible');
}

export function tokenLabel(state) {
  const value = state.inspection.token;
  return uiText(state.language, !value ? 'checking' : value.error ? 'storageFailed' : value.stored ? 'tokenStored' : value.env ? 'tokenEnv' : 'tokenMissing');
}

export function buildConsoleView(state) {
  const t = (key) => uiText(state.language, key);
  const savedService = state.preferences.services[state.service];
  const recentClient = savedService?.lastClient;
  const recent = savedService?.clients[recentClient];
  const navigation = PAGES.map((page) => item('navigate', t(page), page));
  if (state.dialog) return {
    title: state.dialog.title, lines: state.dialog.lines ?? [], navigation,
    entries: state.dialog.entries, summary: [], modal: true,
  };
  let view = { title: t(state.page), navigation, lines: [], entries: [], summary: [] };
  if (state.page === 'home') {
    view.title = t('start');
    view.lines = [t('chooseTool'), '', t(recent ? 'recent' : 'emptyRecent')];
    if (recent) {
      view.lines.push(`${CLIENT_LABELS[recentClient]} / ${getStrategyDisplayName(recent.family, state.service)}`, recent.subagent ?? recent.model ?? '', '');
      view.entries.push(item('relaunch', t('relaunch'), recentClient), item('resume', t('modify'), recentClient));
    }
    for (const [index, client] of ['claude-code', 'desktop', 'codex', 'opencode', 'cowork', 'codex-app'].entries()) {
      const status = ['desktop', 'cowork'].includes(client)
        ? t(!state.inspection.desktop ? state.inspection.loading ? 'checking' : 'unknown' : state.inspection.desktop.error ? 'inspectionFailed' : state.inspection.desktop.applied ? state.inspection.desktop.healthy ? 'applied' : 'invalidProfile' : state.inspection.desktop.supported === false ? 'unsupported' : 'official')
        : clientStatus(state, client);
      const detail = client === 'codex-app' && state.inspection.codexApp?.restoreConflict ? t('appConflict')
        : client === 'codex-app' && state.inspection.codexApp?.recoveryRequired ? t('appRecovery') : status;
      view.entries.push(item('tool', `${index + 1}  ${client === 'desktop' ? 'Claude Desktop' : client === 'cowork' ? 'Claude Cowork' : CLIENT_LABELS[client]}`, client, { detail }));
    }
    view.entries.push(item('chooseLanguage', `L  ${LANGUAGE_MENU_TITLE} : ${LANGUAGE_LABELS[state.language]}`), item('quit', '0  ' + t('quit')));
    view.summary = [t('verifyBefore'), '', t('currentService')];
  } else if (state.page === 'launch') {
    const selection = state.selections[state.client] ?? {};
    const family = familyFor(state);
    view.title = t('prepare');
    view.lines = [t('verifyBefore'), ''];
    view.entries = [item('chooseClient', `${t('tool')} : ${CLIENT_LABELS[state.client]}`),
      item('chooseFamily', `${t('family')} : ${familyLabel(state, family)}`)];
    if (state.client === 'claude-code') {
      view.entries.push(item('chooseSubagent', `${t('subagent')} : ${selection.subagent ?? '—'}`, null, { disabled: Boolean(family?.fixedSubagent), detail: family?.fixedSubagent ? t('fixed') : '' }));
      if (selection.family && findStrategy(selection.family, state.service)) {
        const environment = getClaudeCodeStrategyEnvironment(selection.family, state.service);
        const mapping = STRATEGY_MODEL_KEYS.filter(([role, key]) => role !== 'subagent' && environment[key]);
        view.summary = [t('summary'), '', CLIENT_LABELS[state.client], familyLabel(state, family),
          `${t('subagent')}: ${selection.subagent ?? '—'}`, '', t('mapping'),
          ...mapping.map(([role, key]) => `${role[0].toUpperCase() + role.slice(1)}: ${environment[key]}`)];
      }
    } else {
      view.entries.push(item('chooseModel', `${t('model')} : ${selection.model ?? '—'}`));
      view.summary = [t('summary'), '', CLIENT_LABELS[state.client], familyLabel(state, family), selection.model ?? '—'];
      if (state.client === 'codex-app') view.summary.push('', t('appSettings'), t('appWait'));
    }
    view.entries.push(item('remember', `[${state.remember ? 'x' : ' '}] ${t('remember')}`),
      item('launch', `${t('launch')} ${CLIENT_LABELS[state.client]}`, null, { disabled: !canLaunch(state), detail: canLaunch(state) ? '' : t('selectFirst') }),
      item('navigate', t('returnHome'), 'home'));
    if (!state.catalogues[state.client]) view.entries.splice(1, 0, item('prepare', t('refresh')));
  } else if (state.page === 'desktop') {
    if (state.desktopClient === 'codex-app') {
      const app = state.inspection.codexApp;
      view.title = 'Codex App';
      view.lines = [clientStatus(state, 'codex-app'),
        t(app?.restoreConflict ? 'appConflict' : app?.recoveryRequired ? 'appRecovery' : app?.configured ? 'appActive' : 'appIdle'),
        app?.model ?? '', app ? t(app.running ? 'appLive' : 'appClosed') : '', t('appRestartNote')];
      view.entries = [item('chooseDesktopApp', t('tool') + ' : Codex App'), item('tool', t('appConfigure'), 'codex-app'),
        item('restoreApp', t('appRestore'), null, { disabled: !app?.configured }), item('navigate', t('returnHome'), 'home')];
      return view;
    }
    const desktop = state.inspection.desktop;
    view.title = state.desktopClient === 'cowork' ? 'Claude Cowork' : 'Claude Desktop';
    if (desktop?.supported === false) view.lines = [t('unsupported')];
    else {
      view.lines = [`${t('profile')} : ${t(!desktop ? state.inspection.loading ? 'checking' : 'unknown' : desktop.error ? 'inspectionFailed' : desktop.applied ? desktop.healthy ? 'applied' : 'invalidProfile' : 'official')}`,
        `${t('proxy')} : ${t(state.proxyActive ? 'running' : state.proxyStopped ? 'stopped' : 'proxyUnknown')}`,
        desktop?.service ? `${t('service')} : ${desktop.service}` : '', '', t('stoppedNote'), ''];
      view.entries = [item(state.proxyActive ? 'stopProxy' : 'startProxy', t(state.proxyActive ? 'stopProxy' : 'startProxy')),
        item('desktopFamilies', t('editFamilies')), item('routes', t('routes')),
        item('restore', t('restore'))];
      view.summary = [t('families'), ...(desktop?.families ?? []).map((family) => getStrategyDisplayName(family, desktop.service ?? state.service))];
    }
    view.entries.unshift(item('chooseDesktopApp', t('tool') + ' : ' + view.title));
    view.entries.push(item('journal', t('log')), item('navigate', t('returnHome'), 'home'));
  } else if (state.page === 'access') {
    view.lines = [tokenLabel(state), state.inspection.token?.backend ?? '', t(state.accessStatus[state.client] ?? 'accessUnknown'), '', t('logoutEnv'), ''];
    view.entries = [item('login', t('login')), item('testAccess', t('test')), item('logout', t('logout')), item('navigate', t('returnHome'), 'home')];
  } else {
    view.lines = Object.keys(CLIENT_LABELS).map((client) => `${CLIENT_LABELS[client]} : ${clientStatus(state, client)} ${state.inspection.clients?.[client]?.version ?? ''}`);
    view.lines.push('', tokenLabel(state), state.inspection.token?.backend ?? '', '');
    view.entries = [item('refreshInspection', t('refresh')), item('strategies', t('strategies')), item('navigate', t('returnHome'), 'home')];
  }
  return view;
}

export function strategyEntries(state) {
  return getServiceStrategies(state.service).map((strategy) => item('noop', strategy.selectionName ?? strategy.name ?? strategy.value, strategy.value));
}
