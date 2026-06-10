import { DEFAULT_SERVICE } from '../routerlab/services.js';

const OPTION_WITH_VALUE = new Set(['--service', '--strategy', '--subagent-model', '--model', '--token', '--port', '--host']);

export function parseOptions(argv) {
  const options = {
    service: DEFAULT_SERVICE,
    strategy: null,
    subagentModel: 'default',
    model: null,
    noPrompt: false,
    yes: false,
    json: false,
    help: false,
    version: false,
    token: null,
    host: '127.0.0.1',
    port: 15721,
    passthrough: [],
  };

  let passthroughMode = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (passthroughMode) {
      options.passthrough.push(arg);
      continue;
    }
    if (arg === '--') {
      passthroughMode = true;
      continue;
    }

    const inline = arg.match(/^(--[^=]+)=(.*)$/);
    const key = inline?.[1] ?? arg;
    const inlineValue = inline?.[2];

    if (OPTION_WITH_VALUE.has(key)) {
      const value = inline ? inlineValue : argv[++index];
      if (!value || value.startsWith('--')) {
        throw new Error(`${key} requires a value.`);
      }
      if (key === '--service') options.service = value;
      if (key === '--strategy') options.strategy = value;
      if (key === '--subagent-model') options.subagentModel = value;
      if (key === '--model') options.model = value;
      if (key === '--token') options.token = value;
      if (key === '--host') options.host = value;
      if (key === '--port') {
        const port = Number.parseInt(value, 10);
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          throw new Error('--port must be a valid TCP port.');
        }
        options.port = port;
      }
      continue;
    }

    if (arg === '--no-prompt') {
      options.noPrompt = true;
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--dry-run') {
      options.yes = false;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else {
      options.passthrough.push(arg);
    }
  }

  return options;
}
