import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseOptions } from './args.js';
import { MAIN_MENU_ITEMS, askMenu } from './menu.js';
import { handleAuth, handleAuthMenu } from './commands/auth.js';
import { handleClaudeCode } from './commands/claude-code.js';
import { handleClaudeDesktop, handleClaudeDesktopMenu } from './commands/claude-desktop.js';
import { handleCodex, launchCodexForService } from './commands/codex.js';
import { handleDoctor } from './commands/doctor.js';
import { handleStrategies } from './commands/strategies.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const COMMAND_DEFINITIONS = [
  {
    name: 'claude-code',
    aliases: ['claude'],
    usage: 'wrapper-scionos claude-code [args]',
    description: 'Launch Claude Code through RouterLab',
    defaultAction: null,
    handler: ({ options }) => handleClaudeCode(options, pkg.version),
  },
  {
    name: 'auth',
    usage: 'wrapper-scionos auth login|status|test',
    description: 'Manage RouterLab tokens',
    defaultAction: 'status',
    handler: ({ action, options }) => handleAuth(action, options),
  },
  {
    name: 'doctor',
    usage: 'wrapper-scionos doctor',
    description: 'Diagnose local setup',
    defaultAction: null,
    handler: ({ options }) => handleDoctor(options),
  },
  {
    name: 'strategies',
    usage: 'wrapper-scionos strategies',
    description: 'List RouterLab strategies',
    defaultAction: null,
    handler: ({ options }) => handleStrategies(options),
  },
  {
    name: 'claude-desktop',
    aliases: ['desktop'],
    usage: 'wrapper-scionos claude-desktop status|apply|apply-proxy|proxy|restore-official',
    description: 'Inspect or configure Claude Desktop',
    defaultAction: 'status',
    handler: ({ action, options }) => handleClaudeDesktop(action, options),
  },
  {
    name: 'codex',
    usage: 'wrapper-scionos codex launch|template|restore|status',
    description: 'Launch Codex CLI with the RouterLab model catalog',
    defaultAction: 'launch',
    handler: ({ action, options }) => handleCodex(action, options),
  },
];

const COMMANDS = new Map();
for (const command of COMMAND_DEFINITIONS) {
  COMMANDS.set(command.name, command);
  for (const alias of command.aliases ?? []) {
    COMMANDS.set(alias, command);
  }
}
COMMANDS.set('help', { name: 'help' });

export async function main(argv) {
  const command = COMMANDS.get(argv[0]) ?? null;
  const rest = command ? argv.slice(1) : argv;
  const options = parseOptions(rest);

  if (command?.name === 'help' || options.help) {
    showHelp();
    return;
  }
  if (options.version) {
    console.log(pkg.version);
    return;
  }

  if (!command && shouldOpenInteractiveMenu(options)) {
    await handleInteractiveMenu(options);
    return;
  }
  if (!command && rest.includes('--list-strategies')) {
    await handleStrategies(options);
    return;
  }

  if (command) {
    const action = command.defaultAction ? options.passthrough[0] ?? command.defaultAction : null;
    await command.handler({ action, options });
    return;
  }

  await handleClaudeCode(options, pkg.version);
}

export function shouldOpenInteractiveMenu(options) {
  return options.passthrough.length === 0;
}

function showHelp() {
  console.log(readFileSync(new URL('../../README.md', import.meta.url), 'utf8').split('## Commands')[0]);
  console.log(`Commands:
${formatCommandHelp()}

Common flags:
  --service <routerlab|llm>
  --strategy <value>
  --subagent-model <default|haiku|gpt-5.4-mini|claude-deepseek-v4-flash>
  --model <value>
  --transport <direct|proxy>
  --host <value>
  --port <value>
  --no-prompt
  --json
`);
}

function formatCommandHelp() {
  const rows = [
    ['wrapper-scionos', 'Open interactive app menu'],
    ...COMMAND_DEFINITIONS.map((command) => [command.usage, command.description]),
  ];
  const width = Math.max(...rows.map(([usage]) => usage.length)) + 2;
  return rows.map(([usage, description]) => `  ${usage.padEnd(width, ' ')}${description}`).join('\n');
}

async function handleInteractiveMenu(options) {
  while (true) {
    const action = await askMenu('ScioNos Wrapper', MAIN_MENU_ITEMS, {
      interactiveSelect: true,
      version: pkg.version,
    });
    if (action === 'quit') {
      return;
    }

    if (action === 'claude-code') {
      await handleClaudeCode({ ...options, passthrough: [] }, pkg.version, []);
      return;
    }

    if (action === 'claude-desktop') {
      await handleClaudeDesktopMenu(options);
    } else if (action === 'auth') {
      await handleAuthMenu(options);
    } else if (action === 'strategies') {
      await handleStrategies(options);
    } else if (action === 'doctor') {
      await handleDoctor(options);
    } else if (action === 'codex') {
      await launchCodexForService(options);
      return;
    }
  }
}
