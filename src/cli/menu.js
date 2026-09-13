import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  createPrompt,
  isBackspaceKey,
  isDownKey,
  isEnterKey,
  isNumberKey,
  isUpKey,
  makeTheme,
  Separator,
  useKeypress,
  useMemo,
  usePagination,
  usePrefix,
  useState,
} from '@inquirer/core';
import chalk from 'chalk';
import { getHelpText, translate, translateMenuItem, translateRoute } from './i18n.js';

const HOME_ROUTE_ID = 'home';
export const MENU_BACK_VALUE = 'back';
export const MENU_QUIT_VALUE = 'quit';

export class MenuBackError extends Error {
  constructor(message = 'Menu navigation cancelled.') {
    super(message);
    this.name = 'MenuBackError';
    this.exitCode = 130;
  }
}

export class MenuExitError extends Error {
  constructor(message = 'Menu exited by the user.') {
    super(message);
    this.name = 'MenuExitError';
    this.exitCode = 0;
  }
}

export const MAIN_MENU_ITEMS = [
  {
    key: '1',
    value: 'claude-code',
    label: 'Claude Code',
    description: 'Start a coding session through RouterLab.',
  },
  {
    key: '2',
    value: 'claude-desktop',
    label: 'Claude Desktop',
    description: 'Configure and run the local Desktop mapping.',
  },
  {
    key: '3',
    value: 'codex',
    label: 'Codex CLI',
    description: 'Start a Codex session through RouterLab.',
  },
  {
    key: '4',
    value: 'opencode',
    label: 'OpenCode CLI',
    description: 'Start an OpenCode session through RouterLab.',
  },
  {
    key: '5',
    value: 'auth',
    label: 'Account & access',
    description: 'Manage and validate your RouterLab token.',
  },
  {
    key: '6',
    value: 'tools',
    label: 'Tools & diagnostics',
    description: 'Inspect strategies or troubleshoot this installation.',
  },
  {
    key: '0',
    value: 'quit',
    label: 'Exit',
    description: 'Close ScioNos Wrapper.',
  },
];

const HOME_MENU_BACK_ITEM = {
  key: '0',
  value: 'back',
  label: '← Back to home',
  description: 'Return to the main menu.',
};

export const CLAUDE_DESKTOP_MENU_ITEMS = [
  {
    key: '1',
    value: 'proxy',
    label: 'Start Local Mapping',
    description: 'Configure the selected Desktop mapping and run the local proxy.',
  },
  {
    key: '2',
    value: 'restore-official',
    label: 'Restore Official Mode',
    description: 'Return Claude Desktop to official sign-in mode.',
  },
  {
    key: '3',
    value: 'status',
    label: 'Status',
    description: 'Show Claude Desktop configuration status.',
  },
  HOME_MENU_BACK_ITEM,
];

export const AUTH_MENU_ITEMS = [
  {
    key: '1',
    value: 'status',
    label: 'Status',
    description: 'Show token storage status.',
  },
  {
    key: '2',
    value: 'login',
    label: 'Login',
    description: 'Store a RouterLab token.',
  },
  {
    key: '3',
    value: 'test',
    label: 'Test',
    description: 'Validate the current token against RouterLab.',
  },
  {
    key: '4',
    value: 'logout',
    label: 'Logout',
    description: 'Delete the stored token.',
  },
  HOME_MENU_BACK_ITEM,
];

export const TOOLS_MENU_ITEMS = [
  {
    key: '1',
    value: 'strategies',
    label: 'Available strategies',
    description: 'Show the strategies available for this service.',
  },
  {
    key: '2',
    value: 'doctor',
    label: 'Run diagnostics',
    description: 'Check the local installation and configuration.',
  },
  HOME_MENU_BACK_ITEM,
];

export const MENU_ROUTES = Object.freeze({
  [HOME_ROUTE_ID]: Object.freeze({ id: HOME_ROUTE_ID, parent: null, title: 'ScioNos Wrapper', message: 'Choose where you want to go:', items: MAIN_MENU_ITEMS }),
  desktop: Object.freeze({ id: 'desktop', parent: HOME_ROUTE_ID, title: 'Claude Desktop', message: 'Choose a Claude Desktop action:', items: CLAUDE_DESKTOP_MENU_ITEMS }),
  account: Object.freeze({ id: 'account', parent: HOME_ROUTE_ID, title: 'Account & access', message: 'Choose an account action:', items: AUTH_MENU_ITEMS }),
  tools: Object.freeze({ id: 'tools', parent: HOME_ROUTE_ID, title: 'Tools & diagnostics', message: 'Choose a tool:', items: TOOLS_MENU_ITEMS }),
});

export function getLocalizedMenuRoutes(language = 'en') {
  const routes = {};
  for (const [routeId, route] of Object.entries(MENU_ROUTES)) {
    routes[routeId] = {
      ...route,
      title: translateRoute(language, routeId),
      message: translate(language, routeId === 'home'
        ? 'chooseDestination'
        : routeId === 'desktop'
          ? 'chooseDesktopAction'
          : routeId === 'account'
            ? 'chooseAccountAction'
            : 'chooseTool'),
      items: route.items.map((item) => {
        const text = translateMenuItem(language, routeId, item.value);
        return text ? { ...item, label: text[0], description: text[1] } : { ...item };
      }),
    };
  }
  return routes;
}

const ROUTE_TARGETS = Object.freeze({ 'claude-desktop': 'desktop', auth: 'account', tools: 'tools' });

export function resolveNavigation(routeId, action) {
  const route = MENU_ROUTES[routeId];
  if (!route) throw new Error(`Unknown menu route: ${routeId}`);
  const normalizedAction = String(action ?? '').trim().toLowerCase();
  if ([MENU_QUIT_VALUE, 'q', 'exit'].includes(normalizedAction)) return { kind: 'exit' };
  if ([MENU_BACK_VALUE, 'b'].includes(normalizedAction)) {
    return route.parent ? { kind: 'navigate', routeId: route.parent } : { kind: 'exit' };
  }
  const target = ROUTE_TARGETS[normalizedAction];
  if (target && routeId === HOME_ROUTE_ID) return { kind: 'navigate', routeId: target };
  return { kind: 'action', action: normalizedAction };
}

export function formatBreadcrumb(routeId, language = 'en', routes = MENU_ROUTES) {
  const labels = [];
  let route = routes[routeId];
  if (!route) throw new Error(`Unknown menu route: ${routeId}`);
  while (route) {
    labels.unshift(route.title);
    route = route.parent ? routes[route.parent] : null;
  }
  return labels.join('  ›  ');
}
const BANNER_WIDTH = 58;
const LINUX_CLAUDE_DESKTOP_LABEL = 'aaddrick/claude-desktop-debian';
const LINUX_CLAUDE_DESKTOP_URL = 'https://github.com/aaddrick/claude-desktop-debian';

export function formatServiceHealthAlert(serviceValue, language = 'en') {
  if (String(serviceValue ?? '').trim().toLowerCase() !== 'llm') {
    return '';
  }
  const message = translate(language, 'serviceLlmAvailability');
  const width = Math.max(BANNER_WIDTH, message.length + 2);
  const border = chalk.bold.cyan;
  const info = chalk.cyan;
  return [
    '',
    border(`   ╔${'═'.repeat(width)}╗`),
    `${border('   ║')}${info(centerText(message, width))}${border('║')}`,
    border(`   ╚${'═'.repeat(width)}╝`),
    '',
  ].join('\n');
}

export function formatBanner(title, version = null, options = {}) {
  const centered = centerText(title, BANNER_WIDTH).replace(title, colorBannerTitle(title));
  const border = chalk.gray;
  const lines = [
    '',
    border(`   ┌${'─'.repeat(BANNER_WIDTH)}┐`),
    border(`   │${' '.repeat(BANNER_WIDTH)}│`),
    `${border('   │')}${centered}${border('│')}`,
    border(`   │${' '.repeat(BANNER_WIDTH)}│`),
    border(`   └${'─'.repeat(BANNER_WIDTH)}┘`),
  ];

  if (version) {
    lines.push(chalk.gray(`${' '.repeat(51)}v${version}`));
  }
  if (title === 'ScioNos Wrapper') {
    lines.push(formatCompatibilityLine(options.language));
  }

  lines.push('');
  return lines.join('\n');
}

export function formatMenu(title, items, options = {}) {
  const width = Math.max(...items.map((item) => item.label.length));
  const lines = [
    ...(options.banner ? [formatBanner(title, options.version)] : [`\n${title}`]),
    '',
  ];
  for (const item of items) {
    lines.push(`  ${item.key}. ${item.label.padEnd(width, ' ')}  ${item.description}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function formatSelectChoice(item) {
  if (Separator.isSeparator(item)) return item;
  const label = item.label ?? item.name ?? String(item.value ?? '');
  return {
    name: label,
    value: item.value,
    description: item.description,
    short: item.short ?? label,
    ...(item.key !== undefined ? { key: item.key } : {}),
  };
}

function centerText(text, width) {
  const padding = Math.max(width - text.length, 0);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return `${' '.repeat(left)}${text}${' '.repeat(right)}`;
}

function colorBannerTitle(title) {
  if (title === 'ScioNos Wrapper') {
    return `${chalk.bold(chalk.hex('#3b82f6')('Scio'))}${chalk.bold(chalk.hex('#a855f7')('Nos'))}${chalk.bold(chalk.hex('#D97757')(' Wrapper'))}`;
  }
  return chalk.bold(title);
}

function formatCompatibilityLine(language = 'en') {
  return [
    chalk.gray(`   ${translate(language, 'compatibility')}`),
    terminalLink(chalk.cyan.underline(LINUX_CLAUDE_DESKTOP_LABEL), LINUX_CLAUDE_DESKTOP_URL),
  ].join('');
}

function terminalLink(label, url) {
  return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
}

export function resolveMenuChoice(items, answer) {
  const normalized = String(answer ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return items.find((item) => (
    !Separator.isSeparator(item)
    && (String(item.key ?? '').toLowerCase() === normalized
      || String(item.value ?? '').toLowerCase() === normalized
      || String(item.label ?? item.name ?? '').toLowerCase() === normalized)
  )) ?? null;
}

export function resolveMenuInput(items, answer) {
  const normalized = String(answer ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (['b', 'back'].includes(normalized)) {
    return { kind: 'back', value: MENU_BACK_VALUE };
  }
  if (['q', 'quit', 'exit'].includes(normalized)) {
    return { kind: 'exit', value: MENU_QUIT_VALUE };
  }
  const choice = resolveMenuChoice(items, normalized);
  return choice ? { kind: 'choice', value: choice.value, choice } : null;
}

export function applyMenuControl(value, { allowBack = true } = {}) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if ([MENU_QUIT_VALUE, 'q', 'exit'].includes(normalized)) throw new MenuExitError();
  if ([MENU_BACK_VALUE, 'b'].includes(normalized)) {
    if (allowBack) return null;
    throw new MenuBackError();
  }
  return value;
}

export async function askMenu(title, items, options = {}) {
  if (options.interactiveSelect) {
    console.log(formatBanner(title, options.version, { language: options.language }));
    return askSelect(options.message ?? translate(options.language, 'selectOption'), items, options);
  }

  const rl = createInterface({ input, output });
  try {
    while (true) {
      console.log(formatMenu(title, items, options));
      const answer = await rl.question('Select an option: ');
      const resolved = resolveMenuInput(items, answer);
      if (resolved) {
        return resolved.value;
      }
      console.log(translate(options.language, 'invalidOption'));
    }
  } finally {
    rl.close();
  }
}

export async function askSelect(configOrMessage, items = [], options = {}) {
  const config = typeof configOrMessage === 'string'
    ? { ...options, message: configOrMessage, choices: items }
    : { ...(configOrMessage ?? {}) };
  return keyedSelect({
    ...config,
    choices: (config.choices ?? []).map(formatSelectChoice),
  });
}

const keyedSelect = createPrompt((config, done) => {
  const choices = useMemo(() => normalizePromptChoices(config.choices ?? []), [config.choices]);
  const navigable = (choice) => !Separator.isSeparator(choice) && !choice.disabled;
  const bounds = useMemo(() => {
    const first = choices.findIndex(navigable);
    const last = choices.findLastIndex(navigable);
    if (first === -1) {
      throw new Error('[menu prompt] No selectable choices.');
    }
    return { first, last };
  }, [choices]);
  const defaultIndex = choices.findIndex((choice) => (
    navigable(choice) && choice.value === config.default
  ));
  const [active, setActive] = useState(defaultIndex === -1 ? bounds.first : defaultIndex);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const theme = makeTheme(config.theme);
  const prefix = usePrefix({ status, theme });
  const loop = config.loop ?? true;

  const finish = (value) => {
    setStatus('done');
    done(value);
  };

  const findPrefixIndex = (value) => {
    const normalized = value.toLowerCase();
    if (!normalized) return -1;
    return choices.findIndex((choice) => (
      navigable(choice)
      && [choice.key, choice.name, choice.value]
        .filter((candidate) => candidate !== undefined && candidate !== null)
        .some((candidate) => String(candidate).toLowerCase().startsWith(normalized))
    ));
  };

  useKeypress((key, rl) => {
    const line = String(rl.line ?? '').trim();
    setErrorMessage('');

    if (key.name === 'escape') {
      finish(MENU_BACK_VALUE);
      return;
    }
    if (isEnterKey(key)) {
      const control = resolveMenuInput(choices, line);
      if (control?.kind === 'exit' || control?.kind === 'back') {
        finish(control.value);
        return;
      }
      const exactChoice = control?.choice;
      if (exactChoice && !exactChoice.disabled) {
        finish(exactChoice.value);
        return;
      }
      if (!line) {
        finish(choices[active].value);
        return;
      }
      const matchingIndex = findPrefixIndex(line);
      if (matchingIndex !== -1) {
        finish(choices[matchingIndex].value);
        return;
      }
      setErrorMessage(translate(config.language, 'unavailableOption', { value: line }));
      rl.clearLine(0);
      return;
    }
    if (isUpKey(key, theme.keybindings) || isDownKey(key, theme.keybindings)) {
      const offset = isUpKey(key, theme.keybindings) ? -1 : 1;
      let next = active;
      do {
        next = (next + offset + choices.length) % choices.length;
      } while (!navigable(choices[next]));
      if (loop || (offset < 0 && active !== bounds.first) || (offset > 0 && active !== bounds.last)) {
        setActive(next);
      }
      return;
    }
    if (isBackspaceKey(key)) {
      rl.clearLine(0);
      const matchingIndex = findPrefixIndex(line);
      if (matchingIndex !== -1) setActive(matchingIndex);
      return;
    }
    if (isNumberKey(key) || line) {
      const matchingIndex = findPrefixIndex(line);
      if (matchingIndex !== -1) setActive(matchingIndex);
    }
  });

  const page = usePagination({
    items: choices,
    active,
    pageSize: Math.max(1, config.pageSize ?? choices.length),
    loop,
    renderItem({ item, isActive }) {
      if (Separator.isSeparator(item)) return ` ${item.separator}`;
      const cursor = isActive ? '❯' : ' ';
      const keyLabel = item.key ? `${item.key}) ` : '';
      const line = `${cursor} ${keyLabel}${item.name}`;
      if (item.disabled) return chalk.dim(line + ` (${item.disabled === true ? 'disabled' : item.disabled})`);
      return isActive ? theme.style.highlight(line) : line;
    },
  });
  const help = chalk.dim(getHelpText(config.language, config.helpMode));
  const error = errorMessage ? theme.style.error(errorMessage) : '';
  const defaultMessage = translate(config.language, 'selectOption');
  return [`${prefix} ${theme.style.message(config.message ?? defaultMessage, status)}`, [page, help, error].filter(Boolean).join('\n')];
});

function normalizePromptChoices(choices) {
  let nextKey = 1;
  return choices.map((choice) => {
    if (Separator.isSeparator(choice)) return choice;
    const label = choice.label ?? choice.name ?? String(choice.value ?? '');
    const normalized = {
      ...choice,
      name: label,
      value: choice.value ?? label,
      short: choice.short ?? label,
      key: choice.key ?? String(nextKey),
    };
    nextKey += 1;
    return normalized;
  });
}

export async function askText(question, defaultValue = null) {
  const rl = createInterface({ input, output });
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await rl.question(`${question}${suffix}: `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

export async function askYesNo(question, defaultValue = false) {
  const answer = await askText(`${question} ${defaultValue ? '[Y/n]' : '[y/N]'}`);
  if (!answer) {
    return defaultValue;
  }
  return ['y', 'yes', 'o', 'oui'].includes(answer.trim().toLowerCase());
}
