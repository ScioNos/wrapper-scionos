import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';

const HOME_ROUTE_ID = 'home';

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
    value: 'auth',
    label: 'Account & access',
    description: 'Manage and validate your RouterLab token.',
  },
  {
    key: '5',
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

const ROUTE_TARGETS = Object.freeze({ 'claude-desktop': 'desktop', auth: 'account', tools: 'tools' });

export function resolveNavigation(routeId, action) {
  const route = MENU_ROUTES[routeId];
  if (!route) throw new Error(`Unknown menu route: ${routeId}`);
  if (action === 'quit' && routeId === HOME_ROUTE_ID) return { kind: 'exit' };
  if (action === 'back') return route.parent ? { kind: 'navigate', routeId: route.parent } : { kind: 'exit' };
  const target = ROUTE_TARGETS[action];
  if (target && routeId === HOME_ROUTE_ID) return { kind: 'navigate', routeId: target };
  return { kind: 'action', action };
}

export function formatBreadcrumb(routeId) {
  const labels = [];
  let route = MENU_ROUTES[routeId];
  if (!route) throw new Error(`Unknown menu route: ${routeId}`);
  while (route) {
    labels.unshift(route.title);
    route = route.parent ? MENU_ROUTES[route.parent] : null;
  }
  return labels.join('  ›  ');
}
const BANNER_WIDTH = 58;
const LINUX_CLAUDE_DESKTOP_LABEL = 'aaddrick/claude-desktop-debian';
const LINUX_CLAUDE_DESKTOP_URL = 'https://github.com/aaddrick/claude-desktop-debian';

export function formatServiceHealthAlert(serviceValue) {
  if (String(serviceValue ?? '').trim().toLowerCase() !== 'llm') {
    return '';
  }
  const border = chalk.bold.red;
  const warning = chalk.bgRed.white.bold;
  return [
    '',
    border(`   ╔${'═'.repeat(BANNER_WIDTH)}╗`),
    `${border('   ║')}${warning(centerText('ℹ MODEL AVAILABILITY', BANNER_WIDTH))}${border('║')}`,
    `${border('   ║')}${warning(centerText('ROUTERLAB LLM — AVAILABLE MODELS MAY VARY', BANNER_WIDTH))}${border('║')}`,
    border(`   ╚${'═'.repeat(BANNER_WIDTH)}╝`),
    '',
  ].join('\n');
}

export function formatBanner(title, version = null) {
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
    lines.push(formatCompatibilityLine());
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
  return {
    name: item.label,
    value: item.value,
    description: item.description,
    short: item.label,
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

function formatCompatibilityLine() {
  return [
    chalk.gray('   Compatible Windows, macOS, Linux via '),
    terminalLink(chalk.cyan.underline(LINUX_CLAUDE_DESKTOP_LABEL), LINUX_CLAUDE_DESKTOP_URL),
  ].join('');
}

function terminalLink(label, url) {
  return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
}

export function resolveMenuChoice(items, answer) {
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return items.find((item) => (
    item.key === normalized || item.value === normalized || item.label.toLowerCase() === normalized
  )) ?? null;
}

export async function askMenu(title, items, options = {}) {
  if (options.interactiveSelect) {
    console.log(formatBanner(title, options.version));
    return askSelect(options.message ?? 'Select an option:', items);
  }

  const rl = createInterface({ input, output });
  try {
    while (true) {
      console.log(formatMenu(title, items, options));
      const answer = await rl.question('Select an option: ');
      const choice = resolveMenuChoice(items, answer);
      if (choice) {
        return choice.value;
      }
      console.log('Invalid option.');
    }
  } finally {
    rl.close();
  }
}

export async function askSelect(message, items) {
  return select({
    message,
    choices: items.map(formatSelectChoice),
    pageSize: items.length,
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
