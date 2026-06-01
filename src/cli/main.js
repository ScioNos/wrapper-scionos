import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseOptions } from './args.js';
import { detectOS, detectClaudeCode, checkGitBashOnWindows } from '../platform/detect.js';
import { deleteStoredToken, getSecureStorageBackend, getStoredToken, getStoredTokenStatus, storeToken } from '../security/token-store.js';
import { SERVICES, requireServiceConfig } from '../routerlab/services.js';
import { fetchModels, validateTokenFormat } from '../routerlab/models.js';
import { getStrategyChoices } from '../routerlab/strategies.js';
import { launchClaudeCode, resolveToken } from '../apps/claude-code.js';
import { applyDirectClaudeDesktop, applyProxyClaudeDesktop, readClaudeDesktopStatus, restoreOfficialClaudeDesktop } from '../apps/claude-desktop.js';
import { startClaudeDesktopProxy } from '../apps/claude-desktop-proxy.js';
import { buildCodexAuth, buildCodexThirdPartyConfig, getCodexPaths } from '../apps/codex.js';
import { AUTH_MENU_ITEMS, CLAUDE_DESKTOP_MENU_ITEMS, MAIN_MENU_ITEMS, askMenu, askText, askYesNo } from './menu.js';

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

  if (!command && argv.length === 0) {
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
    });
  }
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
  wrapper-scionos codex template          Print a Codex config template

Common flags:
  --service <routerlab|llm>
  --strategy <value>
  --subagent-model <default|haiku|gpt-5.4-mini|claude-deepseek-v4-flash>
  --host <value>
  --port <value>
  --no-prompt
  --json
`);
}

async function handleInteractiveMenu(options) {
  while (true) {
    const action = await askMenu('ScioNos Wrapper', MAIN_MENU_ITEMS);
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
      await handleCodex('template', options);
    }
  }
}

async function handleClaudeDesktopMenu(options) {
  while (true) {
    const action = await askMenu('Claude Desktop', CLAUDE_DESKTOP_MENU_ITEMS);
    if (action === 'back') {
      return;
    }

    const desktopOptions = { ...options };
    if (action === 'apply' || action === 'apply-proxy' || action === 'proxy') {
      desktopOptions.service = await askText('RouterLab service', options.service);
      desktopOptions.strategy = await askText(
        'Strategy',
        desktopOptions.service === 'llm' ? 'claude' : 'default',
      );
      if (action === 'apply') {
        desktopOptions.yes = await askYesNo('Write Claude Desktop files now?', false);
      } else if (action === 'apply-proxy') {
        desktopOptions.yes = await askYesNo('Write Claude Desktop local mapping profile now?', false);
      }
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
    const result = applyProxyClaudeDesktop({
      serviceValue: service.value,
      strategyValue: options.strategy ?? (service.value === 'llm' ? 'claude' : 'default'),
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
    const result = await startClaudeDesktopProxy({
      serviceValue: service.value,
      strategyValue,
      routerlabToken: token,
      host: options.host,
      port: options.port,
    });
    console.log(`Claude Desktop local mapping proxy listening on ${result.baseUrl}`);
    console.log(`Service: ${service.value}`);
    console.log(`Strategy: ${strategyValue}`);
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

async function handleCodex(action, options) {
  if (action !== 'template') {
    throw new Error(`Unknown codex action "${action}".`);
  }
  const service = requireServiceConfig(options.service);
  const model = service.value === 'llm' ? 'openai/gpt-5.5' : 'gpt-5.5';
  print({
    paths: getCodexPaths(),
    auth: buildCodexAuth(''),
    config: buildCodexThirdPartyConfig({
      providerName: service.value,
      baseUrl: `${service.baseUrl}/v1`,
      model,
    }),
  }, options);
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
