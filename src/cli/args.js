import { DEFAULT_SERVICE } from '../routerlab/services.js';
import { isLoopbackHost, normalizeLoopbackHost, validateLoopbackPort } from '../platform/loopback.js';
import { warnDeprecationOnce } from './deprecations.js';

export { isLoopbackHost };

export const COMMON_OPTION_DEFINITIONS = [
  { flags: ['--service'], value: '<routerlab|llm>', description: 'Select the RouterLab service.' },
  { flags: ['--strategy'], value: '<value>', description: 'Select a model-routing strategy.' },
  { flags: ['--subagent-model'], value: '<id>', description: 'Select an LLM Claude Code subagent model.' },
  { flags: ['--model'], value: '<value>', description: 'Select the initial Codex model.' },
  { flags: ['--token'], value: '<value>', description: 'Override the service token for supported commands (not Claude Code; visible in shell history).' },
  { flags: ['--host'], value: '<loopback>', description: 'Bind a local proxy to a loopback address.' },
  { flags: ['--port'], value: '<1-65535>', description: 'Select the Claude Desktop proxy port.' },
  { flags: ['--allow-origin'], value: '<origin>', description: 'Allow an exact CORS origin; repeatable.' },
  { flags: ['--no-prompt'], description: 'Disable interactive prompts.' },
  { flags: ['--yes', '-y'], description: 'Confirm a mutating operation.' },
  { flags: ['--dry-run'], description: 'Preview a mutating operation.' },
  { flags: ['--json'], description: 'Print machine-readable JSON.' },
  { flags: ['--help', '-h'], description: 'Show help.' },
  { flags: ['--version', '-v'], description: 'Show the wrapper version.' },
];

export class CliUsageError extends Error {
  constructor(message, code = 'invalid_usage') {
    super(message);
    this.name = 'CliUsageError';
    this.code = code;
    this.exitCode = 2;
  }
}

export const OPTION_WITH_VALUE = new Set([
  '--service', '--strategy', '--subagent-model', '--model', '--token', '--port', '--host', '--allow-origin',
]);

const OPTION_WITHOUT_VALUE = new Set(['--no-prompt', '--yes', '-y', '--dry-run', '--json', '--help', '-h', '--version', '-v', '--list-strategies']);
const REMOVED_OPTIONS = new Set(['--direct', '--proxy', '--transport']);

export function isRecognizedWrapperOption(argument) {
  const key = String(argument).match(/^(--[^=]+)=/)?.[1] ?? argument;
  return OPTION_WITH_VALUE.has(key) || OPTION_WITHOUT_VALUE.has(key) || REMOVED_OPTIONS.has(key);
}

export function optionConsumesNextArgument(argument) {
  return !String(argument).includes('=') && (OPTION_WITH_VALUE.has(argument) || argument === '--transport');
}

export function parseOptions(argv) {
  const options = {
    service: DEFAULT_SERVICE,
    strategy: null,
    subagentModel: null,
    model: null,
    noPrompt: false,
    yes: false,
    json: false,
    help: false,
    version: false,
    token: null,
    host: '127.0.0.1',
    port: 15721,
    allowOrigins: [],
    dryRun: false,
    listStrategies: false,
    deprecations: [],
    providedOptions: new Set(),
    positionals: [],
    forwarded: [],
    passthrough: [],
  };

  let passthroughMode = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (passthroughMode) {
      options.passthrough.push(arg);
      options.forwarded.push(arg);
      continue;
    }
    if (arg === '--') {
      passthroughMode = true;
      continue;
    }

    const inline = arg.match(/^(--[^=]+)=(.*)$/);
    const key = inline?.[1] ?? arg;
    const inlineValue = inline?.[2];

    if (REMOVED_OPTIONS.has(key)) {
      throw new CliUsageError(`${key} has been removed. Codex now connects directly to RouterLab.`);
    }

    if (OPTION_WITH_VALUE.has(key)) {
      const value = inline ? inlineValue : argv[++index];
      if (!value || value.startsWith('--')) {
        throw new CliUsageError(`${key} requires a value.`);
      }
      options.providedOptions.add(optionProperty(key));
      if (key === '--service') options.service = value;
      if (key === '--strategy') options.strategy = value;
      if (key === '--subagent-model') options.subagentModel = value;
      if (key === '--model') options.model = value;
      if (key === '--token') options.token = value;
      if (key === '--host') {
        if (!isLoopbackHost(value)) {
          throw new CliUsageError('--host must be a loopback address (127.0.0.1, localhost, or ::1).');
        }
        options.host = normalizeLoopbackHost(value);
      }
      if (key === '--allow-origin') options.allowOrigins.push(normalizeOrigin(value));
      if (key === '--port') {
        let port;
        try {
          if (!/^\d+$/.test(value)) throw new Error('not numeric');
          port = validateLoopbackPort(value);
        } catch {
          throw new CliUsageError('--port must be a valid TCP port.');
        }
        options.port = port;
      }
      continue;
    }

    if (arg === '--no-prompt') {
      options.noPrompt = true;
      options.providedOptions.add('noPrompt');
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
      options.dryRun = false;
      options.providedOptions.add('yes');
    } else if (arg === '--dry-run') {
      options.yes = false;
      options.dryRun = true;
      options.providedOptions.add('dryRun');
    } else if (arg === '--json') {
      options.json = true;
      options.providedOptions.add('json');
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--list-strategies') {
      options.listStrategies = true;
      options.providedOptions.add('listStrategies');
      options.deprecations.push('--list-strategies');
    } else {
      options.passthrough.push(arg);
      options.positionals.push(arg);
    }
  }

  return options;
}

export function emitOptionDeprecations(options) {
  for (const option of new Set(options.deprecations ?? [])) {
    if (option === '--list-strategies') {
      warnDeprecationOnce('option:--list-strategies', '`--list-strategies` is deprecated; use `strategies`.');
    }
  }
}

function normalizeOrigin(value) {
  let origin;
  try {
    origin = new URL(value).origin;
  } catch {
    throw new CliUsageError('--allow-origin must be an absolute HTTP(S) origin.');
  }
  if (origin === 'null' || !/^https?:\/\//i.test(origin)) {
    throw new CliUsageError('--allow-origin must be an absolute HTTP(S) origin.');
  }
  return origin;
}

function optionProperty(flag) {
  return {
    '--service': 'service',
    '--strategy': 'strategy',
    '--subagent-model': 'subagentModel',
    '--model': 'model',
    '--token': 'token',
    '--host': 'host',
    '--port': 'port',
    '--allow-origin': 'allowOrigins',
  }[flag];
}
