import { createRequire } from 'node:module';
import { CliUsageError, COMMON_OPTION_DEFINITIONS, emitOptionDeprecations, isRecognizedWrapperOption, optionConsumesNextArgument, parseOptions } from './args.js';
import { warnDeprecationOnce } from './deprecations.js';
import { getLocalizedMenuRoutes, askMenu, askYesNo, formatBreadcrumb, formatServiceHealthAlert, resolveNavigation } from './menu.js';
import { translate } from './i18n.js';
import { requireServiceConfig } from '../routerlab/services.js';
import { findStrategy, getClaudeCodeSubagentModels, isSupportedClaudeCodeSubagentModel } from '../routerlab/strategies.js';
import { print } from './commands/output.js';
import { handleAuth } from './commands/auth.js';
import { handleClaudeCode } from './commands/claude-code.js';
import {
  formatDesktopReplacementPrompt,
  handleClaudeDesktop,
  planInteractiveClaudeDesktopStart,
} from './commands/claude-desktop.js';
import { handleCodex, launchCodexForService } from './commands/codex.js';
import { launchOpenCodeForService } from './commands/opencode.js';
import { handleDoctor } from './commands/doctor.js';
import { handleStrategies } from './commands/strategies.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

export const COMMAND_DEFINITIONS = [
  {
    name: 'claude-code', aliases: ['claude'], usage: 'wrapper-scionos claude-code [args]',
    description: 'Launch Claude Code through RouterLab', defaultAction: null,
    handler: ({ options }) => handleClaudeCode(options, pkg.version),
  },
  {
    name: 'auth', usage: 'wrapper-scionos auth login|logout|status|test',
    description: 'Manage RouterLab tokens', defaultAction: 'status',
    handler: ({ action, options }) => handleAuth(action, options),
  },
  {
    name: 'doctor', usage: 'wrapper-scionos doctor', description: 'Diagnose local setup',
    defaultAction: null, handler: ({ options }) => handleDoctor(options),
  },
  {
    name: 'strategies', usage: 'wrapper-scionos strategies', description: 'List RouterLab strategies',
    defaultAction: null, handler: ({ options }) => handleStrategies(options),
  },
  {
    name: 'claude-desktop', aliases: ['desktop'],
    usage: 'wrapper-scionos claude-desktop status|apply-proxy|proxy|restore-official',
    description: 'Configure Claude Desktop through the local RouterLab proxy', defaultAction: 'status',
    handler: ({ action, options }) => handleClaudeDesktop(action, options),
  },
  {
    name: 'codex', usage: 'wrapper-scionos codex launch|template|restore|status',
    description: 'Launch Codex CLI directly with RouterLab', defaultAction: 'launch',
    handler: ({ action, options }) => handleCodex(action, options),
  },
  {
    name: 'opencode', aliases: ['open-code'], usage: 'wrapper-scionos opencode [args]',
    description: 'Launch OpenCode through the local RouterLab proxy', defaultAction: null,
    handler: ({ options }) => launchOpenCodeForService(options),
  },
];

const COMMANDS = new Map();
for (const command of COMMAND_DEFINITIONS) {
  COMMANDS.set(command.name, command);
  for (const alias of command.aliases ?? []) COMMANDS.set(alias, command);
}
COMMANDS.set('help', { name: 'help' });
export function resolveCommandInvocation(argv) {
  for (let index = 0; index < argv.length;) {
    const argument = argv[index];
    if (argument === '--') break;
    const command = COMMANDS.get(argument);
    if (command) {
      return { command, rest: argv.filter((_, itemIndex) => itemIndex !== index) };
    }
    if (!isRecognizedWrapperOption(argument)) break;
    index += optionConsumesNextArgument(argument) ? 2 : 1;
  }
  return { command: null, rest: argv };
}

export async function main(argv) {
  const { command, rest } = resolveCommandInvocation(argv);
  const options = parseOptions(rest);
  emitOptionDeprecations(options);

  if (command?.name === 'help' || options.help) {
    showHelp(options);
    return;
  }
  if (options.version) {
    print(pkg.version, { ...options, command: 'version' });
    return;
  }
  const serviceAlert = formatServiceHealthAlert(options.service, options.language);
  if (serviceAlert) {
    console.error(serviceAlert);
  }
  if (!command && options.listStrategies) {
    validateOptions('strategies', null, options, new Set(['service', 'token', 'noPrompt', 'json', 'listStrategies']));
    rejectPositionals(options, 0, 'strategies');
    options.command = 'strategies';
    await handleStrategies(options);
    return;
  }
  if (!command && shouldOpenInteractiveMenu(options)) {
    if (options.noPrompt || options.json) {
      throw usageError('A command is required with --no-prompt or --json.');
    }
    await handleInteractiveMenu(options);
    return;
  }
  if (command) {
    const action = command.defaultAction ? options.positionals[0] ?? command.defaultAction : null;
    validateCommand(command.name, action, options);
    options.command = action ? command.name + ':' + action : command.name;
    await command.handler({ action, options });
    return;
  }
  if (options.json) throw usageError('--json cannot be used while launching Claude Code.');
  validateOptions('claude-code', null, options, new Set(['service', 'strategy', 'noPrompt']));
  validateClaudeOptions(options);
  options.command = 'claude-code';
  await handleClaudeCode(options, pkg.version);
}

export function shouldOpenInteractiveMenu(options) {
  return options.positionals.length === 0 && options.forwarded.length === 0;
}

const OPTION_LABELS = {
  service: '--service', language: '--lang', strategy: '--strategy', subagentModel: '--subagent-model', model: '--model', token: '--token',
  host: '--host', port: '--port', allowOrigins: '--allow-origin',
  noPrompt: '--no-prompt', yes: '--yes', dryRun: '--dry-run', json: '--json',
  listStrategies: '--list-strategies',
};

const COMMAND_OPTIONS = {
  auth: {
    login: ['service', 'token', 'dryRun', 'json'],
    change: ['service', 'token', 'dryRun', 'json'],
    logout: ['service', 'dryRun', 'json'],
    status: ['service', 'json'],
    test: ['service', 'token', 'noPrompt', 'json'],
  },
  doctor: { '': ['service', 'json'] },
  strategies: { '': ['service', 'token', 'noPrompt', 'json'] },
  'claude-desktop': {
    status: ['json'],
    'restore-official': ['yes', 'dryRun', 'json'],
    'apply-proxy': ['service', 'strategy', 'token', 'noPrompt', 'host', 'port', 'yes', 'dryRun', 'json'],
    proxy: ['service', 'strategy', 'token', 'noPrompt', 'host', 'port', 'allowOrigins', 'yes'],
  },
  codex: {
    launch: ['service', 'strategy', 'model', 'token', 'noPrompt'],
    template: ['service', 'model', 'json'],
    restore: ['yes', 'dryRun', 'json'],
    status: ['json'],
  },
  opencode: {
    '': ['service', 'strategy', 'model', 'token', 'noPrompt'],
  },
};

function validateCommand(name, action, options) {
  if (name === 'claude-code') {
    if (options.json) throw usageError('--json cannot be used while launching Claude Code.');
    validateOptions(name, null, options, new Set(['service', 'strategy', 'subagentModel', 'noPrompt']));
    validateClaudeOptions(options);
    return;
  }
  if (name === 'opencode') {
    if (options.json) throw usageError('--json cannot be used while launching OpenCode.');
    validateOptions(name, null, options, new Set(['service', 'strategy', 'model', 'token', 'noPrompt']));
    let service;
    try {
      service = requireServiceConfig(options.service);
    } catch (error) {
      throw usageError(error.message);
    }
    if (options.strategy && !findStrategy(options.strategy, service.value)) {
      throw usageError('Unknown strategy "' + options.strategy + '" for service "' + service.value + '".');
    }
    return;
  }
  const actionTable = COMMAND_OPTIONS[name];
  const allowed = actionTable?.[action ?? ''];
  if (!allowed) {
    if (name === 'claude-desktop' && action === 'apply') {
      throw usageError('claude-desktop apply was removed because direct profiles expose the RouterLab token. Use "claude-desktop apply-proxy --yes".');
    }
    if (name === 'codex' && action === 'apply') {
      throw usageError('codex apply was removed. Use "codex launch"; use "codex restore" only to undo an old wrapper config.');
    }
    throw usageError('Unknown ' + name + (action ? ' action "' + action + '".' : ' action.'));
  }
  if (name === 'auth' && action === 'change') {
    warnDeprecationOnce('action:auth-change', '`auth change` is deprecated in 4.x; use `auth login`.');
  }
  const allowedOptions = new Set(allowed);
  validateOptions(name, action, options, allowedOptions);
  let service;
  try {
    service = requireServiceConfig(options.service);
  } catch (error) {
    throw usageError(error.message);
  }
  if (allowedOptions.has('strategy') && options.strategy && !findStrategy(options.strategy, service.value)) {
    throw usageError('Unknown strategy "' + options.strategy + '" for service "' + service.value + '".');
  }
  const positionalCount = actionTable[''] ? 0 : 1;
  rejectPositionals(options, positionalCount, name + (action ? ' ' + action : ''));
  if (options.forwarded.length > 0 && !(name === 'codex' && action === 'launch')) {
    throw usageError('Arguments after -- are not supported by ' + name + (action ? ' ' + action : '') + '.');
  }
}

function validateClaudeOptions(options) {
  let service;
  try {
    service = requireServiceConfig(options.service);
  } catch (error) {
    throw usageError(error.message);
  }
  if (options.strategy && !findStrategy(options.strategy, service.value)) {
    throw usageError('Unknown strategy "' + options.strategy + '" for service "' + service.value + '".');
  }
  if (options.subagentModel && !isSupportedClaudeCodeSubagentModel(options.subagentModel, service.value)) {
    const supported = getClaudeCodeSubagentModels(service.value).join(', ');
    throw usageError(`--subagent-model must be one of: ${supported}.`);
  }
}

function validateOptions(name, action, options, allowed) {
  for (const option of options.providedOptions) {
    if (option === 'language') continue;
    if (!allowed.has(option)) {
      throw usageError((OPTION_LABELS[option] ?? option) + ' is not valid for ' + name + (action ? ' ' + action : '') + '.');
    }
  }
}

function rejectPositionals(options, allowedCount, invocation) {
  const extras = options.positionals.slice(allowedCount);
  if (extras.length > 0) {
    throw usageError('Unexpected argument' + (extras.length > 1 ? 's' : '') + ' for ' + invocation + ': ' + extras.join(' '));
  }
}

function usageError(message) {
  return new CliUsageError(message + '\nRun "wrapper-scionos --help" for usage.');
}

function showHelp(options = {}) {
  const help = [
    'wrapper-scionos v' + pkg.version,
    'Extensible ScioNos CLI wrapper for RouterLab-backed coding assistants.',
    '',
    'Commands:',
    formatCommandHelp(),
    '',
    'Options:',
    formatOptionHelp(),
    '',
    'Global options may appear before or after a command. Supported arguments after -- are passed through unchanged; Codex and OpenCode routing overrides are rejected.',
    'Claude Desktop: use apply-proxy; direct profiles are refused because they expose the RouterLab token.',
    '',
  ].join('\n');
  if (options.json) print({ help }, { ...options, command: 'help' });
  else console.log(help);
}
function formatCommandHelp() {
  const rows = [
    ['wrapper-scionos', 'Open interactive app menu'],
    ...COMMAND_DEFINITIONS.map((command) => [command.usage, command.description]),
  ];
  const width = Math.max(...rows.map(([usage]) => usage.length)) + 2;
  return rows.map(([usage, description]) => `  ${usage.padEnd(width, ' ')}${description}`).join('\n');
}

function formatOptionHelp() {
  const rows = COMMON_OPTION_DEFINITIONS.map((option) => {
    const flags = option.flags.join(', ');
    return [`${flags}${option.value ? ` ${option.value}` : ''}`, option.description];
  });
  const width = Math.max(...rows.map(([usage]) => usage.length)) + 2;
  return rows.map(([usage, description]) => `  ${usage.padEnd(width, ' ')}${description}`).join('\n');
}

export async function handleInteractiveMenu(options, overrides = {}) {
  const runtime = {
    askMenu,
    handleClaudeCode,
    launchCodexForService,
    launchOpenCodeForService,
    handleInteractiveDesktopAction,
    handleAuth,
    handleStrategies,
    handleDoctor,
    ...overrides,
  };
  const service = requireServiceConfig(options.service);
  const language = options.language ?? 'en';
  const localizedRoutes = getLocalizedMenuRoutes(language);
  const clientActions = {
    'claude-code': () => runInteractiveClaudeCode(runtime, options),
    codex: () => runInteractiveRoutedClient('Codex CLI', runtime.launchCodexForService, runtime, options, service),
    opencode: () => runInteractiveRoutedClient('OpenCode', runtime.launchOpenCodeForService, runtime, options, service),
  };
  let routeId = 'home';
  while (true) {
    const route = localizedRoutes[routeId];
    const action = await runtime.askMenu(formatBreadcrumb(routeId, language, localizedRoutes), route.items, {
      interactiveSelect: true,
      version: routeId === 'home' ? pkg.version : null,
      language,
      helpMode: routeId === 'home' ? 'home' : 'compact',
      message: `${translate(language, 'serviceActive', { service: service.label })}\n\n${route.message}`,
    });
    const next = resolveNavigation(routeId, action);
    if (next.kind === 'exit') return;
    if (next.kind === 'navigate') {
      routeId = next.routeId;
      continue;
    }
    const clientAction = clientActions[action];
    if (clientAction) {
      const result = await clientAction();
      if (result?.kind === 'back') {
        routeId = 'home';
        continue;
      }
      return;
    }
    if (routeId === 'desktop') {
      const result = await runtime.handleInteractiveDesktopAction(action, options);
      if (result?.kind === 'terminate') return;
    } else if (routeId === 'account') {
      await runtime.handleAuth(action, { ...options, service: service.value });
    } else if (routeId === 'tools') {
      if (action === 'strategies') await runtime.handleStrategies(options);
      if (action === 'doctor') await runtime.handleDoctor(options);
    }
  }
}

async function runInteractiveClaudeCode(runtime, options) {
  try {
    const result = await runtime.handleClaudeCode({ ...options, passthrough: [], allowBack: true }, pkg.version, []);
    return result?.kind === 'back' ? { kind: 'back' } : { kind: 'terminate' };
  } catch (error) {
    if (error?.name === 'MenuBackError') return { kind: 'back' };
    throw error;
  }
}

async function runInteractiveRoutedClient(label, launch, runtime, options, service) {
  try {
    const exitCode = await launch.call(runtime, {
      ...options,
      service: service.value,
      interactiveMenu: true,
      updateProcessExitCode: false,
    });
    if (exitCode === undefined || exitCode === 0) return { kind: 'terminate' };
    console.error(`ERROR ${label} exited with code ${exitCode}. Returning to ScioNos Wrapper.`);
  } catch (error) {
    if (error?.name === 'MenuBackError') return { kind: 'back' };
    if (error?.name === 'MenuExitError') throw error;
    console.error(`ERROR ${label} could not start for ${service.label}: ${error.message}`);
  }
  process.exitCode = 0;
  return { kind: 'back' };
}

export async function handleInteractiveDesktopAction(action, options, overrides = {}) {
  const runtime = {
    askYesNo,
    handleClaudeDesktop,
    planInteractiveClaudeDesktopStart,
    ...overrides,
  };
  const desktopOptions = { ...options };
  if (action === 'proxy') {
    const plan = runtime.planInteractiveClaudeDesktopStart(options);
    if (plan.requiresConfirmation) {
      const confirmed = await runtime.askYesNo(formatDesktopReplacementPrompt(plan, options.language), false);
      if (!confirmed) return { kind: 'cancelled' };
    }
    desktopOptions.interactiveDesktopPlan = plan;
    desktopOptions.returnToMenuOnSigint = true;
  } else if (action === 'restore-official') {
    desktopOptions.yes = await runtime.askYesNo(translate(options.language, 'restoreOfficialConfirm'), false);
  }
  return runtime.handleClaudeDesktop(action, desktopOptions);
}
