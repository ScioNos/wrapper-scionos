import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseOptions } from './args.js';
import { detectOS, detectClaudeCode, checkGitBashOnWindows } from '../platform/detect.js';
import { deleteStoredToken, getSecureStorageBackend, getStoredToken, getStoredTokenStatus, storeToken } from '../security/token-store.js';
import { requireServiceConfig } from '../routerlab/services.js';
import { fetchModels, validateTokenFormat } from '../routerlab/models.js';
import { getStrategyChoices } from '../routerlab/strategies.js';
import { launchClaudeCode, resolveToken } from '../apps/claude-code.js';
import { DESKTOP_MAPPING_STRATEGIES, applyDirectClaudeDesktop, applyProxyClaudeDesktop, readClaudeDesktopStatus, restoreOfficialClaudeDesktop } from '../apps/claude-desktop.js';
import { startClaudeDesktopProxy } from '../apps/claude-desktop-proxy.js';
import { CODEX_ROUTERLAB_MODELS, DEFAULT_CODEX_MODEL, applyCodexConfig, buildCodexAuth, getCodexPaths, readCodexStatus } from '../apps/codex.js';
import { AUTH_MENU_ITEMS, CLAUDE_DESKTOP_MENU_ITEMS, CODEX_MENU_ITEMS, MAIN_MENU_ITEMS, askMenu, askText, askYesNo } from './menu.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const COMMANDS = new Set([
  'auth',
  'doctor',
  'strategies',
  'claude-code',
  'claude',
  'claude-desktop',
  'desktop',
  'codex',
  'help',
]);

export async function main(argv) {
  const command = COMMANDS.has(argv[0]) ? argv[0] : null;
  const rest = command ? argv.slice(1) : argv;
  const options = parseOptions(rest);

  if (command === 'help' || options.help) {
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

  if (command === 'auth') {
    await handleAuth(options.passthrough[0] ?? 'status', options);
  } else if (command === 'doctor') {
    await handleDoctor(options);
  } else if (command === 'strategies' || rest.includes('--list-strategies')) {
    await handleStrategies(options);
  } else if (command === 'claude-desktop' || command === 'desktop') {
    await handleClaudeDesktop(options.passthrough[0] ?? 'status', options);
  } else if (command === 'codex') {
    await handleCodex(options.passthrough[0] ?? 'template', options);
  } else {
    await launchClaudeCode({
      serviceValue: options.service,
      strategyValue: options.strategy,
      subagentModel: options.subagentModel,
      noPrompt: options.noPrompt,
      claudeArgs: options.passthrough,
      version: pkg.version,
    });
  }
}

export function shouldOpenInteractiveMenu(options) {
  return options.passthrough.length === 0;
}

function showHelp() {
  console.log(readFileSync(new URL('../../README.md', import.meta.url), 'utf8').split('## Commands')[0]);
  console.log(`Commands:
  wrapper-scionos                         Open interactive app menu
  wrapper-scionos claude-code [args]      Launch Claude Code through RouterLab
  wrapper-scionos auth login|status|test  Manage RouterLab tokens
  wrapper-scionos doctor                  Diagnose local setup
  wrapper-scionos strategies              List RouterLab strategies
  wrapper-scionos claude-desktop status   Inspect Claude Desktop 3P config
  wrapper-scionos claude-desktop apply    Dry-run Claude Desktop direct config
  wrapper-scionos claude-desktop apply-proxy  Write Desktop profile for local mapping
  wrapper-scionos claude-desktop proxy    Start Claude Desktop local mapping proxy
  wrapper-scionos codex template          Print a Codex CLI config template
  wrapper-scionos codex apply             Write Codex config.toml
  wrapper-scionos codex status            Inspect Codex config status

Common flags:
  --service <routerlab|llm>
  --strategy <value>
  --subagent-model <default|haiku|gpt-5.4-mini|claude-deepseek-v4-flash>
  --model <value>
  --host <value>
  --port <value>
  --no-prompt
  --json
`);
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
      await launchClaudeCode({
        serviceValue: options.service,
        strategyValue: options.strategy,
        subagentModel: options.subagentModel,
        noPrompt: options.noPrompt,
        claudeArgs: [],
        version: pkg.version,
      });
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
      await handleCodexMenu(options);
    }
  }
}

async function handleClaudeDesktopMenu(options) {
  while (true) {
    const action = await askMenu('Claude Desktop', CLAUDE_DESKTOP_MENU_ITEMS, {
      interactiveSelect: true,
      message: 'Select Claude Desktop action:',
    });
    if (action === 'back') {
      return;
    }

    const desktopOptions = { ...options };
    if (action === 'proxy') {
      const service = requireServiceConfig(options.service);
      desktopOptions.service = service.value;
      desktopOptions.strategyValues = resolveDesktopMappingStrategies(service.value);
      desktopOptions.setupLocalMapping = true;
      desktopOptions.yes = true;
    } else if (action === 'restore-official') {
      desktopOptions.yes = await askYesNo('Restore Claude Desktop official mode now?', false);
    }

    await handleClaudeDesktop(action, desktopOptions);
  }
}

async function handleAuthMenu(options) {
  while (true) {
    const action = await askMenu('Auth', AUTH_MENU_ITEMS);
    if (action === 'back') {
      return;
    }

    const authOptions = { ...options };
    authOptions.service = await askText('RouterLab service', options.service);
    await handleAuth(action, authOptions);
  }
}

async function handleCodexMenu(options) {
  const service = requireServiceConfig(options.service);
  while (true) {
    const action = await askMenu('Codex CLI', CODEX_MENU_ITEMS, {
      interactiveSelect: true,
      message: 'Select Codex CLI action:',
    });
    if (action === 'back') {
      return;
    }

    const codexOptions = { ...options };
    if (action === 'apply') {
      codexOptions.yes = await askYesNo('Write Codex CLI config.toml now?', false);
      await handleCodex('apply', codexOptions);
    } else if (action === 'model') {
      codexOptions.model = await askMenu('Codex CLI Model', codexModelMenuItems(service.value), {
        interactiveSelect: true,
        message: 'Select default Codex CLI model:',
      });
      codexOptions.yes = await askYesNo('Write Codex CLI config.toml now?', true);
      await handleCodex('apply', codexOptions);
    } else {
      await handleCodex(action, codexOptions);
    }
  }
}

async function handleAuth(action, options) {
  const service = requireServiceConfig(options.service);
  if (action === 'login' || action === 'change') {
    const token = options.token ?? await promptSecret(`${service.label} token: `);
    const format = validateTokenFormat(token);
    if (!format.valid) {
      throw new Error(format.message);
    }
    const storage = storeToken(token.trim(), service.value);
    console.log(`Stored ${service.label} token with ${storage.backend}.`);
    return;
  }

  if (action === 'logout') {
    const deleted = deleteStoredToken(service.value);
    console.log(deleted ? `Deleted ${service.label} token.` : `No ${service.label} token found.`);
    return;
  }

  if (action === 'test') {
    const token = await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
    const result = await fetchModels(token, { serviceValue: service.value });
    print(result, options);
    return;
  }

  const status = getStoredTokenStatus(service.value);
  print({ service: service.value, ...status, envToken: Boolean(process.env.ANTHROPIC_AUTH_TOKEN) }, options);
}

async function handleDoctor(options) {
  const service = requireServiceConfig(options.service);
  const token = getStoredToken(service.value) ?? process.env.ANTHROPIC_AUTH_TOKEN ?? null;
  const report = {
    os: detectOS(),
    node: process.version,
    claudeCode: detectClaudeCode(),
    gitBash: checkGitBashOnWindows(),
    secureStorage: getSecureStorageBackend(),
    token: {
      service: service.value,
      present: Boolean(token),
      source: process.env.ANTHROPIC_AUTH_TOKEN ? 'env' : token ? 'secure-storage' : 'none',
    },
  };
  print(report, options);
}

async function handleStrategies(options) {
  const service = requireServiceConfig(options.service);
  const token = getStoredToken(service.value) ?? process.env.ANTHROPIC_AUTH_TOKEN ?? null;
  const validation = token ? await fetchModels(token, { serviceValue: service.value }) : null;
  const models = validation?.valid ? validation.models : [];
  const choices = getStrategyChoices(models, service.value);
  print({ service: service.value, validation, strategies: choices }, options);
}

async function handleClaudeDesktop(action, options) {
  if (action === 'status') {
    print(readClaudeDesktopStatus(), options);
    return;
  }

  if (action === 'restore-official') {
    const result = restoreOfficialClaudeDesktop({ dryRun: !options.yes });
    print(result, options);
    return;
  }

  if (action === 'apply-proxy') {
    const service = requireServiceConfig(options.service);
    const strategyValue = options.strategy ?? (service.value === 'llm' ? 'claude' : 'default');
    const strategyValues = resolveDesktopProxyStrategyValues(service.value, options);
    const result = applyProxyClaudeDesktop({
      serviceValue: service.value,
      strategyValue,
      strategyValues,
      host: options.host,
      port: options.port,
      dryRun: !options.yes,
    });
    print(result, options);
    return;
  }

  if (action === 'proxy') {
    const service = requireServiceConfig(options.service);
    const token = options.token ?? await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
    const strategyValue = options.strategy ?? (service.value === 'llm' ? 'claude' : 'default');
    const strategyValues = resolveDesktopProxyStrategyValues(service.value, options);
    if (options.setupLocalMapping || options.yes) {
      const profile = applyProxyClaudeDesktop({
        serviceValue: service.value,
        strategyValue,
        strategyValues,
        host: options.host,
        port: options.port,
        dryRun: false,
      });
      console.log(`Configured Claude Desktop local mapping profile at ${profile.paths.profilePath}`);
    }

    const result = await startClaudeDesktopProxy({
      serviceValue: service.value,
      strategyValue,
      strategyValues,
      routerlabToken: token,
      host: options.host,
      port: options.port,
    });
    console.log(`Claude Desktop local mapping proxy listening on ${result.baseUrl}`);
    console.log(`Service: ${service.value}`);
    console.log(`Strategies: ${(strategyValues ?? [strategyValue]).join(', ')}`);
    console.log('Routes:');
    for (const route of result.routes) {
      console.log(`  ${route.routeId} -> ${route.upstreamModel}`);
    }
    console.log('Press Ctrl+C to stop.');
    await new Promise((resolve) => {
      result.server.on('close', resolve);
    });
    return;
  }

  if (action !== 'apply') {
    throw new Error(`Unknown claude-desktop action "${action}".`);
  }

  const service = requireServiceConfig(options.service);
  const token = options.token ?? await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
  const result = applyDirectClaudeDesktop({
    serviceValue: service.value,
    strategyValue: options.strategy ?? (service.value === 'llm' ? 'claude' : 'default'),
    token,
    dryRun: !options.yes,
  });
  print(result, options);
}

function resolveDesktopMappingStrategies(serviceValue) {
  const service = requireServiceConfig(serviceValue);
  return DESKTOP_MAPPING_STRATEGIES[service.value] ?? [
    service.value === 'llm' ? 'claude' : 'default',
  ];
}

function resolveDesktopProxyStrategyValues(serviceValue, options) {
  if (options.strategyValues) {
    return options.strategyValues;
  }
  return options.strategy ? null : resolveDesktopMappingStrategies(serviceValue);
}

async function handleCodex(action, options) {
  if (action !== 'template' && action !== 'apply' && action !== 'status') {
    throw new Error(`Unknown codex action "${action}".`);
  }
  const service = requireServiceConfig(options.service);
  const model = options.model ?? defaultCodexModelForService(service.value);
  if (action === 'status') {
    print(readCodexStatus(), options);
    return;
  }
  if (action === 'apply') {
    print(applyCodexConfig({
      providerName: service.value,
      baseUrl: `${service.baseUrl}/v1`,
      model,
      dryRun: !options.yes,
    }), options);
    return;
  }

  const paths = getCodexPaths();
  const preview = applyCodexConfig({
    providerName: service.value,
    baseUrl: `${service.baseUrl}/v1`,
    model,
    paths,
  });

  print({
    paths,
    auth: buildCodexAuth(''),
    config: preview.config,
    catalog: preview.catalog,
  }, options);
}

function defaultCodexModelForService(serviceValue) {
  return serviceValue === 'llm' ? 'openai/gpt-5.5' : DEFAULT_CODEX_MODEL;
}

function codexModelMenuItems(serviceValue) {
  const models = serviceValue === 'llm' ? [defaultCodexModelForService(serviceValue)] : CODEX_ROUTERLAB_MODELS;
  return models.map((model, index) => ({
    key: String(index + 1),
    value: model,
    label: model,
    description: index === 0 ? 'Default Codex CLI model for the selected service.' : 'Codex CLI model for the selected service.',
  }));
}

async function promptSecret(message) {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

function print(value, options) {
  if (options.json || typeof value !== 'object') {
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    return;
  }

  console.log(JSON.stringify(value, null, 2));
}
