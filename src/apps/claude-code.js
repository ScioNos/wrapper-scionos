import { spawn } from 'node:child_process';
import { password, select, Separator } from '@inquirer/prompts';
import chalk from 'chalk';
import { detectClaudeCode } from '../platform/detect.js';
import { getStoredToken } from '../security/token-store.js';
import { requireServiceConfig } from '../routerlab/services.js';
import { allowsSubagentModelOverride, assessStrategy, assessStrategyLaunch, getClaudeCodeStrategyEnvironment, getFallbackStrategy, getServiceStrategies, getStrategyChoices, hasVerifiedModelIds } from '../routerlab/strategies.js';
import { fetchModels, validateTokenFormat } from '../routerlab/models.js';
import { formatBanner } from '../cli/menu.js';

export const SUBAGENT_MODEL_CHOICES = [
  {
    name: 'Strategy default',
    value: 'default',
    description: 'Use the subagent model defined by the selected strategy.',
  },
  {
    name: 'Claude Haiku',
    value: 'haiku',
    description: 'Force Claude Code subagents to claude-haiku-4-5-20251001.',
  },
  {
    name: 'GPT 5.4 mini',
    value: 'gpt-5.4-mini',
    description: 'Force Claude Code subagents to gpt-5.4-mini.',
  },
  {
    name: 'DeepSeek V4 flash',
    value: 'claude-deepseek-v4-flash',
    description: 'Force Claude Code subagents to claude-deepseek-v4-flash.',
  },
];

export function buildClaudeCodeEnvironment(token, service, strategyValue, options = {}) {
  return {
    ...process.env,
    ANTHROPIC_BASE_URL: service.baseUrl,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: '',
    ...getClaudeCodeStrategyEnvironment(strategyValue, service.value, options),
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

  const answer = await password({ message: `${service.label} token:` });
  const format = validateTokenFormat(answer);
  if (!format.valid) {
    throw new Error(format.message);
  }
  return answer.trim();
}

export async function chooseStrategy({
  serviceValue,
  noPrompt = false,
  preferredStrategy = null,
  modelIds = [],
} = {}) {
  const service = requireServiceConfig(serviceValue);
  const finalizeChoice = (selected) => {
    const resolvedStrategy = getFallbackStrategy(selected, modelIds, service.value);
    if (!resolvedStrategy) {
      const launchReadiness = assessStrategyLaunch(selected, modelIds, service.value);
      throw new Error(`Strategy "${selected}" cannot support the default Claude Code launch on ${service.availabilityLabel}. ${launchReadiness.note}`);
    }

    if (hasVerifiedModelIds(modelIds)) {
      const availability = assessStrategy(selected, modelIds, service.value);
      if (availability.level === 'partial') {
        console.log(chalk.yellow(`WARN Strategy "${selected}" is only partially available on ${service.availabilityLabel}.`));
      }
    }

    return resolvedStrategy;
  };

  if (preferredStrategy) {
    const strategy = getServiceStrategies(service.value).find((entry) => (
      entry.value === preferredStrategy || entry.aliases?.includes(preferredStrategy)
    ));
    if (!strategy) {
      throw new Error(`Unknown strategy "${preferredStrategy}". Use strategies to inspect the supported values.`);
    }
    return finalizeChoice(strategy.value);
  }

  const strategies = getServiceStrategies(service.value);
  if (noPrompt || strategies.length === 1) {
    return finalizeChoice(strategies[0].value);
  }

  const choices = getStrategyChoices(modelIds, service.value).map((choice) => {
    const launchReadiness = assessStrategyLaunch(choice.value, modelIds, service.value);
    const disabled = hasVerifiedModelIds(modelIds) && !launchReadiness.ready ? launchReadiness.note : false;
    return {
      ...choice,
      disabled,
      name: `${getStrategyIndicator(choice.value, modelIds, service.value)} ${choice.name}`,
      short: choice.name,
    };
  });

  if (hasVerifiedModelIds(modelIds) && choices.every((choice) => choice.disabled)) {
    throw new Error(`No launchable strategy is available on ${service.availabilityLabel}.`);
  }

  return select({
    message: 'Select Model Strategy:',
    choices: withSeparators(choices),
    pageSize: choices.length + Math.max(choices.length - 1, 0),
  }).then(finalizeChoice);
}

export async function chooseSubagentModel({
  serviceValue,
  strategyValue,
  noPrompt = false,
  preferredSubagentModel = 'default',
} = {}) {
  if (strategyValue && serviceValue && !allowsSubagentModelOverride(strategyValue, serviceValue)) {
    return 'strategy default';
  }

  if (preferredSubagentModel && preferredSubagentModel !== 'default') {
    return preferredSubagentModel;
  }

  if (noPrompt) {
    return preferredSubagentModel || 'default';
  }

  return select({
    message: 'Select Subagent Model:',
    choices: SUBAGENT_MODEL_CHOICES,
  });
}

export async function launchClaudeCode({ serviceValue, strategyValue, subagentModel, noPrompt, claudeArgs, version = null }) {
  const service = requireServiceConfig(serviceValue);
  if (!noPrompt) {
    console.log(formatClaudeCodeIntro(version));
  }

  const claude = detectClaudeCode();
  if (!claude.installed) {
    throw new Error('Claude Code CLI not found. Install @anthropic-ai/claude-code first.');
  }

  const token = await resolveToken({ serviceValue: service.value, noPrompt });
  const validation = await fetchModels(token, { serviceValue: service.value });
  const modelIds = validation.valid ? validation.models : [];
  if (!validation.valid && !noPrompt) {
    const detail = validation.message || validation.reason || 'model availability could not be verified';
    console.log(chalk.yellow(`WARN ${service.availabilityLabel} model list unavailable: ${detail}.`));
  }

  const selectedStrategy = await chooseStrategy({
    serviceValue: service.value,
    noPrompt,
    preferredStrategy: strategyValue,
    modelIds,
  });
  const selectedSubagentModel = await chooseSubagentModel({
    serviceValue: service.value,
    strategyValue: selectedStrategy,
    noPrompt,
    preferredSubagentModel: subagentModel,
  });
  const env = buildClaudeCodeEnvironment(token, service, selectedStrategy, {
    subagentModel: selectedSubagentModel,
  });

  if (!noPrompt) {
    console.log(formatLaunchSummary({
      service,
      strategy: selectedStrategy,
      subagentModel: selectedSubagentModel,
      endpoint: service.baseUrl,
    }));
    console.log(chalk.green(`Launching Claude Code [${selectedStrategy}]...\n`));
  }

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

export function formatClaudeCodeIntro(version = null) {
  const commands = [
    ['wrapper-scionos', 'Guided launch'],
    ['wrapper-scionos doctor', 'Diagnose setup and RouterLab access'],
    ['wrapper-scionos auth login', 'Save your token securely'],
    ['wrapper-scionos auth login --service llm', 'Save your RouterLab LLM token'],
    ['wrapper-scionos strategies', 'Show routing options and availability'],
  ];
  const width = Math.max(...commands.map(([command]) => command.length)) + 2;
  const lines = [
    formatBanner('ScioNos Wrapper', version),
    chalk.gray('Quick commands'),
    ...commands.map(([command, description]) => `  ${chalk.cyan(command.padEnd(width, ' '))}${description}`),
    '',
  ];
  return lines.join('\n');
}

export function formatClaudeCodeChoiceMenu(message, choices) {
  const lines = [message, ''];
  choices.forEach((choice, index) => {
    lines.push(`  ${index + 1}. ${choice.name}`);
    if (choice.description) {
      lines.push(`     ${choice.description}`);
    }
    if (index < choices.length - 1) {
      lines.push('');
    }
  });
  lines.push('');
  return lines.join('\n');
}

function formatLaunchSummary({ service, strategy, subagentModel, endpoint }) {
  return [
    '',
    chalk.gray('Launch Summary'),
    `  ${chalk.white('Service:')}        ${service.label}`,
    `  ${chalk.white('Strategy:')}       ${strategy}`,
    `  ${chalk.white('Subagent model:')} ${subagentModel}`,
    `  ${chalk.white('Endpoint:')}       ${endpoint}`,
    `  ${chalk.white('Mode:')}           guided`,
    '',
  ].join('\n');
}

function withSeparators(choices) {
  return choices.flatMap((choice, index) => (
    index === choices.length - 1 ? [choice] : [choice, new Separator(' ')]
  ));
}

function getStrategyIndicator(strategyValue, modelIds, serviceValue) {
  if (!hasVerifiedModelIds(modelIds)) {
    return chalk.gray('●');
  }

  const launchReadiness = assessStrategyLaunch(strategyValue, modelIds, serviceValue);
  return launchReadiness.ready ? chalk.green('●') : chalk.red('●');
}
