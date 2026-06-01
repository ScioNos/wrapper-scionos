import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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
    value: 'auth',
    label: 'Auth',
    description: 'Manage RouterLab tokens.',
  },
  {
    key: '4',
    value: 'strategies',
    label: 'Strategies',
    description: 'List RouterLab model strategies.',
  },
  {
    key: '5',
    value: 'doctor',
    label: 'Doctor',
    description: 'Diagnose local setup.',
  },
  {
    key: '6',
    value: 'codex',
    label: 'Codex',
    description: 'Print a Codex config template.',
  },
  {
    key: '0',
    value: 'quit',
    label: 'Quit',
    description: 'Exit without changing anything.',
  },
];

export const CLAUDE_DESKTOP_MENU_ITEMS = [
  {
    key: '1',
    value: 'status',
    label: 'Status',
    description: 'Show Claude Desktop configuration status.',
  },
  {
    key: '2',
    value: 'apply',
    label: 'Configure Direct Mode',
    description: 'Write a direct RouterLab Claude Desktop profile.',
  },
  {
    key: '3',
    value: 'apply-proxy',
    label: 'Configure Local Mapping',
    description: 'Write a Desktop profile that points to the local mapping proxy.',
  },
  {
    key: '4',
    value: 'proxy',
    label: 'Start Local Mapping',
    description: 'Run the local RouterLab mapping proxy.',
  },
  {
    key: '5',
    value: 'restore-official',
    label: 'Restore Official Mode',
    description: 'Return Claude Desktop to official sign-in mode.',
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

export function formatMenu(title, items) {
  const width = Math.max(...items.map((item) => item.label.length));
  const lines = [`\n${title}`, ''];
  for (const item of items) {
    lines.push(`  ${item.key}. ${item.label.padEnd(width, ' ')}  ${item.description}`);
  }
  lines.push('');
  return lines.join('\n');
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

export async function askMenu(title, items) {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      console.log(formatMenu(title, items));
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
