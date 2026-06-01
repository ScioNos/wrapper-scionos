import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { detectClaudeCode } from '../platform/detect.js';
import { getStoredToken } from '../security/token-store.js';
import { requireServiceConfig } from '../routerlab/services.js';
import { getServiceStrategies, getStrategyEnvironment } from '../routerlab/strategies.js';
import { validateTokenFormat } from '../routerlab/models.js';

export function buildClaudeCodeEnvironment(token, service, strategyValue, options = {}) {
  return {
    ...process.env,
    ANTHROPIC_BASE_URL: service.baseUrl,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: '',
    ...getStrategyEnvironment(strategyValue, service.value, options),
  };
}

export async function resolveToken({ serviceValue, noPrompt = false } = {}) {
  const service = requireServiceConfig(serviceValue);
  const envToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  const token = envToken || getStoredToken(service.value);
  if (token) {
    const format = validateTokenFormat(token);
    if (!format.valid) {
      throw new Error(`Resolved token is invalid: ${format.message}`);
    }
    return token;
  }

  if (noPrompt) {
    throw new Error('A RouterLab token is required in --no-prompt mode. Set ANTHROPIC_AUTH_TOKEN or run auth login first.');
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${service.label} token: `);
    const format = validateTokenFormat(answer);
    if (!format.valid) {
      throw new Error(format.message);
    }
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function chooseStrategy({ serviceValue, noPrompt = false, preferredStrategy = null }) {
  const service = requireServiceConfig(serviceValue);
  if (preferredStrategy) {
    return preferredStrategy;
  }

  const strategies = getServiceStrategies(service.value);
  if (noPrompt || strategies.length === 1) {
    return strategies[0].value;
  }

  console.log(`Strategies for ${service.label}:`);
  strategies.forEach((strategy, index) => {
    console.log(`  ${index + 1}. ${strategy.value} - ${strategy.selectionDescription}`);
  });

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`Choose a strategy [1-${strategies.length}, default 1]: `);
    const index = Number.parseInt(answer.trim() || '1', 10) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= strategies.length) {
      throw new Error('Invalid strategy selection.');
    }
    return strategies[index].value;
  } finally {
    rl.close();
  }
}

export async function launchClaudeCode({ serviceValue, strategyValue, subagentModel, noPrompt, claudeArgs }) {
  const service = requireServiceConfig(serviceValue);
  const claude = detectClaudeCode();
  if (!claude.installed) {
    throw new Error('Claude Code CLI not found. Install @anthropic-ai/claude-code first.');
  }

  const token = await resolveToken({ serviceValue: service.value, noPrompt });
  const selectedStrategy = await chooseStrategy({
    serviceValue: service.value,
    noPrompt,
    preferredStrategy: strategyValue,
  });
  const env = buildClaudeCodeEnvironment(token, service, selectedStrategy, { subagentModel });

  const child = spawn(claude.cliPath, claudeArgs, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(claude.cliPath),
  });

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      if (typeof code === 'number') {
        resolve(code);
      } else {
        resolve(signal === 'SIGINT' ? 130 : 1);
      }
    });
  });
  process.exitCode = exitCode;
}
