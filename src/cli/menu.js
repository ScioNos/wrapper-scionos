import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { select, Separator } from '@inquirer/prompts';
import chalk from 'chalk';

export const MAIN_MENU_ITEMS = [
  {
    key: '1',
    value: 'claude-code',
    label: 'Claude Code',
    description: 'Launch Claude Code through RouterLab.',
  },
  {
    key: '2',
    value: 'claude-desktop',
    label: 'Claude Desktop',
    description: 'Inspect or configure Claude Desktop.',
  },
  {
    key: '3',
    value: 'codex',
    label: 'Codex CLI',
    description: 'Configure Codex CLI for RouterLab.',
  },
  {
    key: '4',
    value: 'auth',
    label: 'Auth',
    description: 'Manage RouterLab tokens.',
  },
  {
    key: '5',
    value: 'doctor',
    label: 'Doctor',
    description: 'Diagnose local setup.',
  },
  {
    key: '0',
    value: 'quit',
    label: 'Quit',
    description: 'Exit without changing anything.',
  },
];

export const CODEX_MENU_ITEMS = [
  {
    key: '1',
    value: 'apply',
    label: 'Apply Config',
    description: 'Write the Codex CLI config for the selected service.',
  },
  {
    key: '2',
    value: 'model',
    label: 'Choose Default Model',
    description: 'Select the default Codex CLI model.',
  },
  {
    key: '3',
    value: 'template',
    label: 'Print Template',
    description: 'Show the Codex CLI config template.',
  },
  {
    key: '4',
    value: 'status',
    label: 'Status',
    description: 'Show Codex CLI configuration status.',
  },
  {
    key: '0',
    value: 'back',
    label: 'Back',
    description: 'Return to the main menu.',
  },
];

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
  {
    key: '0',
    value: 'back',
    label: 'Back',
    description: 'Return to the main menu.',
  },
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
  {
    key: '0',
    value: 'back',
    label: 'Back',
    description: 'Return to the main menu.',
  },
];

const BANNER_WIDTH = 58;

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
    choices: withSeparators(items.map(formatSelectChoice)),
    pageSize: items.length + Math.max(items.length - 1, 0),
  });
}

function withSeparators(choices) {
  return choices.flatMap((choice, index) => (
    index === choices.length - 1 ? [choice] : [choice, new Separator(' ')]
  ));
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
