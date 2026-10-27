import chalk from 'chalk';
import width from 'fast-string-width';
import { wrapAnsi } from 'fast-wrap-ansi';
import { stripVTControlCharacters } from 'node:util';
import { buildConsoleView, tokenLabel } from './view.js';
import { uiText } from './i18n.js';
import { LANGUAGE_LABELS } from '../i18n.js';

export function cleanText(value) {
  return stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
}

export function fitText(value, columns) {
  const text = cleanText(value);
  const size = Math.max(0, columns);
  if (width(text) <= size) return text + ' '.repeat(size - width(text));
  if (size < 2) return ' '.repeat(size);
  let result = '';
  for (const grapheme of new Intl.Segmenter().segment(text)) {
    if (width(result + grapheme.segment) > size - 1) break;
    result += grapheme.segment;
  }
  return result + '…' + ' '.repeat(Math.max(0, size - width(result) - 1));
}

export function consoleLayout(columns = 80, rows = 24) {
  const w = Math.max(20, Number(columns) || 80);
  const h = Math.max(10, Number(rows) || 24);
  return { columns: w, rows: h, sidebar: w >= 100 ? 23 : 0, capacity: Math.max(3, h - (w >= 100 ? 11 : 13)) };
}

export function renderConsole(state, focus = { pane: 'content', index: 0 }, size = {}) {
  return renderConsoleFrame(state, focus, size).text;
}

const BUTTONS = new Set(['tool', 'launch', 'confirm', 'quit', 'closeAppQuit', 'keepAppQuit', 'relaunch', 'resume',
  'startProxy', 'stopProxy', 'restore', 'restoreApp', 'applyFamilies', 'login', 'logout', 'testAccess', 'refreshInspection', 'prepare']);
const SELECTORS = new Set(['chooseClient', 'chooseFamily', 'chooseModel', 'chooseSubagent', 'chooseDesktopApp', 'chooseLanguage']);
function entryLabel(entry) {
  if (BUTTONS.has(entry.action)) return `[ ${entry.label} ]`;
  return entry.label + (SELECTORS.has(entry.action) ? ' ▾' : '');
}

export function renderConsoleFrame(state, focus = { pane: 'content', index: 0 }, size = {}) {
  const layout = consoleLayout(size.columns, size.rows);
  const view = buildConsoleView(state);
  const t = (key) => uiText(state.language, key);
  if (layout.columns < 60 || layout.rows < 18) return renderLinear(state, view, focus, layout, t);
  const targets = [];
  const regions = [];
  const add = target => { if (!state.busy && target.x >= 1 && target.y >= 1 && target.y <= layout.rows && target.x + target.width - 1 <= layout.columns) targets.push({ height: 1, ...target }); };
  const line = '─'.repeat(layout.columns - 2);
  const contentWidth = layout.columns - 4 - (layout.sidebar ? layout.sidebar + 3 : 0);
  const sideSummary = state.page === 'launch' && !state.dialog && contentWidth >= 90 ? 31 : 0;
  const listWidth = contentWidth - (sideSummary ? sideSummary + 3 : 0);
  const baseBanner = `ScioNos  v${state.version}    ${t('service')} : ${state.serviceLabel}`;
  const fullLanguage = `${t('language')} : ${LANGUAGE_LABELS[state.language]} [L] ▾`;
  const language = layout.columns < 80 || width(baseBanner) + width(fullLanguage) + 2 > layout.columns
    ? `${state.language.toUpperCase()} [L] ▾` : fullLanguage;
  const banner = fitText(baseBanner, Math.max(0, layout.columns - width(language) - 2)) + '  ' + language;
  const status = `${tokenLabel(state)}  |  ${t(state.accessStatus[state.client] ?? 'accessUnknown')}`;
  const output = [chalk.cyan(fitText(banner, layout.columns)), chalk.dim(fitText(status, layout.columns)), chalk.dim(line), ''];
  if (!view.modal) add({ kind: 'action', x: layout.columns - width(language) + 1, y: 1, width: width(language), entry: { action: 'chooseLanguage' } });
  if (!layout.sidebar) {
    let navigation = '';
    for (const [index, entry] of view.navigation.entries()) {
      const tab = `${focus.pane === 'nav' && focus.index === index ? '>' : entry.value === state.page ? '*' : ''}${entry.label}`;
      if (width(navigation) + (navigation ? 2 : 0) + width(tab) > layout.columns) { output.push(navigation); navigation = ''; }
      const x = width(navigation) + (navigation ? 3 : 1);
      if (!view.modal) add({ kind: 'entry', x, y: output.length + 1, width: width(tab), pane: 'nav', index, entry });
      navigation += (navigation ? '  ' : '') + tab;
    }
    output.push(navigation, '');
  }
  const mouseHelp = state.mouseEnabled ? t('mouseKeys') + '  ' : '';
  const keyHelp = view.modal ? 'pickerKeys' : state.mouseEnabled && layout.columns < 80 ? 'compactKeys' : 'keys';
  const help = wrapAnsi(mouseHelp + t(keyHelp), layout.columns, { hard: true }).split('\n').slice(0, 2);
  const available = Math.max(4, layout.rows - output.length - 4 - help.length);
  const fixed = [view.title, '', ...view.lines];
  // Reserve space for a selected row's explanation, status and keyboard help.
  const fixedLimit = Math.min(fixed.length, Math.max(1, available - 3));
  const visibleFixed = fixed.slice(0, fixedLimit);
  const pageSize = Math.max(1, available - visibleFixed.length - (view.entries.length > available - visibleFixed.length ? 1 : 0));
  const active = focus.pane === 'content' ? Math.min(focus.index, Math.max(0, view.entries.length - 1)) : 0;
  const start = Math.floor(active / pageSize) * pageSize;
  const entries = view.entries.slice(start, start + pageSize);
  const content = visibleFixed.map((text, index) => ({ text, title: index === 0 }));
  const contentX = layout.sidebar ? layout.sidebar + 4 : 1;
  const contentY = output.length + 1;
  for (const [index, entry] of entries.entries()) {
    const prefix = focus.pane === 'content' && start + index === active ? '›' : ' ';
    const display = entryLabel(entry);
    const label = state.page === 'home' && entry.action === 'tool'
      ? fitText(display, Math.max(12, listWidth - width(cleanText(entry.detail)) - 4)) + '  ' + entry.detail
      : display;
    if (!entry.disabled && entry.action !== 'noop') add({ kind: 'entry', x: contentX, y: contentY + content.length, width: listWidth, pane: 'content', index: start + index, entry });
    content.push({ text: `${prefix} ${label}`, active: focus.pane === 'content' && start + index === active, disabled: entry.disabled, button: BUTTONS.has(entry.action) });
  }
  if (view.entries.length > pageSize) {
    const counts = ` ${start + 1}–${Math.min(start + pageSize, view.entries.length)} / ${view.entries.length} `;
    const y = contentY + content.length;
    if (start > 0) add({ kind: 'page', x: contentX, y, width: 3, direction: -1, step: pageSize });
    if (start + pageSize < view.entries.length) add({ kind: 'page', x: contentX + 3 + width(counts), y, width: 3, direction: 1, step: pageSize });
    content.push({ text: '[‹]' + counts + '[›]' });
  }
  const total = Math.max(content.length, layout.sidebar ? view.navigation.length + 2 : 0, sideSummary ? Math.min(available, view.summary.length) : 0);
  for (let index = 0; index < total; index++) {
    const row = content[index];
    let right = fitText(row?.text ?? '', listWidth);
    if (row?.disabled) right = chalk.dim(right);
    else if (row?.active) right = chalk.cyan.bold(right);
    else if (row?.title) right = chalk.bold(right);
    else if (row?.button) right = chalk.cyan(right);
    if (sideSummary) right += chalk.dim(' │ ') + fitText(view.summary[index] ?? '', sideSummary);
    if (layout.sidebar) {
      const nav = view.navigation[index];
      let left = fitText(nav ? `${focus.pane === 'nav' && focus.index === index ? '›' : nav.value === state.page ? '•' : ' '} ${nav.label}` : '', layout.sidebar);
      if (nav && ((focus.pane === 'nav' && focus.index === index) || nav.value === state.page)) left = chalk.cyan(left);
      if (nav && !view.modal) add({ kind: 'entry', x: 1, y: contentY + index, width: layout.sidebar, pane: 'nav', index, entry: nav });
      output.push(left + chalk.dim(' │ ') + right);
    } else output.push(right);
  }
  regions.push({ pane: 'content', x: contentX, y: contentY, width: listWidth, height: total });
  if (layout.sidebar && !view.modal) regions.push({ pane: 'nav', x: 1, y: contentY, width: layout.sidebar, height: view.navigation.length });
  const selected = focus.pane === 'content' ? view.entries[active] : null;
  const detail = selected?.detail ?? (!sideSummary ? view.summary.filter(Boolean).join(' / ') : '');
  output.push('', chalk.dim(fitText(detail, layout.columns)));
  const notice = state.busy ? t('working') : state.notice || (state.warning ? t(state.warning) : '');
  output.push(chalk.yellow(fitText(notice, layout.columns)), chalk.dim(line));
  output.push(...help.map((text) => chalk.dim(text)));
  return { text: output.slice(0, layout.rows).join('\n'), targets, regions, view, pageSize };
}

function renderLinear(state, view, focus, layout, t) {
  const entries = focus.pane === 'nav' ? view.navigation : view.entries;
  const active = Math.min(focus.index, Math.max(0, entries.length - 1));
  const capacity = Math.max(1, layout.rows - 7);
  const start = Math.floor(active / capacity) * capacity;
  const lines = [
    fitText(`ScioNos ${state.version} · ${state.serviceLabel}`, Math.max(0, layout.columns - 9)) + ` ${state.language.toUpperCase()} [L]`,
    `${tokenLabel(state)} | ${t(state.accessStatus[state.client] ?? 'accessUnknown')}`,
    focus.pane === 'nav' ? t('navigation') : view.title,
    ...entries.slice(start, start + capacity).map((entry, index) => `${start + index === active ? '>' : ' '} ${entry.disabled ? '[-] ' : ''}${entryLabel(entry)}`),
    entries.length > capacity ? `${start + 1}–${Math.min(start + capacity, entries.length)} / ${entries.length}` : '',
    state.notice || (state.warning ? t(state.warning) : '') || entries[active]?.detail || '',
    t('compactKeys'),
  ];
  const targets = entries.slice(start, start + capacity).flatMap((entry, index) => entry.disabled || entry.action === 'noop' ? [] : [{
    kind: 'entry', x: 1, y: 4 + index, width: layout.columns, height: 1, pane: focus.pane, index: start + index, entry,
  }]);
  if (!view.modal) targets.push({ kind: 'action', x: layout.columns - 8, y: 1, width: 8, height: 1, entry: { action: 'chooseLanguage' } });
  return { text: lines.map((line) => fitText(line, layout.columns)).slice(0, layout.rows).join('\n'),
    targets: targets.filter(target => target.y <= layout.rows),
    regions: [{ pane: focus.pane, x: 1, y: 3, width: layout.columns, height: capacity + 1 }], view, pageSize: capacity };
}
