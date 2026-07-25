import { password, select, Separator } from '@inquirer/prompts';
import chalk from 'chalk';
import { detectClaudeCode } from '../platform/detect.js';
import { startLongRunningLlmProxy, stopLongRunningLlmProxy } from '../platform/llm-proxy.js';
import { runInteractiveCli } from '../platform/process.js';
import { getStoredToken } from '../security/token-store.js';
import { requireServiceConfig, resolveServiceBaseUrlWithSource, resolveServiceEnvToken, validateServiceBaseUrl } from '../routerlab/services.js';
import { assessStrategy, assessStrategyLaunch, getClaudeCodeStrategyEnvironment, getFallbackStrategy, getServiceStrategies, getStrategyChoices, getStrategyDisplayName, hasVerifiedModelIds } from '../routerlab/strategies.js';
import { fetchModels, validateTokenFormat } from '../routerlab/models.js';
import { formatBanner } from '../cli/menu.js';

export const CLAUDE_CODE_TEMPORARY_ENVIRONMENT = {
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
};

export function buildClaudeCodeEnvironment(token, service, strategyValue, options = {}) {
  return {
    ...process.env,
    ...CLAUDE_CODE_TEMPORARY_ENVIRONMENT,
    ANTHROPIC_BASE_URL: service.baseUrl,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: '',
    ...getClaudeCodeStrategyEnvironment(strategyValue, service.value, options),
  };
}

export function selectTokenCandidate({
  envToken = null,
  envSource = 'env',
  storedToken = null,
  preferStored = false,
} = {}) {
  const normalizedEnvToken = envToken?.trim() || null;
  const normalizedStoredToken = storedToken?.trim() || null;
  if (preferStored) {
    return normalizedStoredToken
      ? { token: normalizedStoredToken, source: 'secure-storage' }
      : { token: normalizedEnvToken, source: normalizedEnvToken ? envSource : null };
  }

  return normalizedEnvToken
    ? { token: normalizedEnvToken, source: envSource }
    : { token: normalizedStoredToken, source: normalizedStoredToken ? 'secure-storage' : null };
}

export async function resolveTokenWithSource(
  { serviceValue, noPrompt = false, preferStored = false } = {},
  {
    passwordFn = password,
    getStoredTokenFn = getStoredToken,
    resolveServiceEnvTokenFn = resolveServiceEnvToken,
  } = {},
) {
  const service = requireServiceConfig(serviceValue);
  const envToken = resolveServiceEnvTokenFn(service.value, process.env);
  const storedToken = getStoredTokenFn(service.value);
  const resolved = selectTokenCandidate({
    envToken: envToken.token,
    envSource: envToken.source ?? 'env',
    storedToken,
    preferStored,
  });
  const token = resolved.token;
  if (token) {
    const format = validateTokenFormat(token);
    if (!format.valid) {
      throw new Error(`Resolved token is invalid: ${format.message}`);
    }
    return {
      token,
      source: resolved.source,
      envTokenPresent: Boolean(envToken.token),
      envTokenKey: envToken.envKey,
      storedTokenPresent: Boolean(storedToken),
    };
  }

  if (noPrompt) {
    throw new Error(`A ${service.label} token is required in --no-prompt mode. Set ${service.tokenEnvKeys[0]} or run auth login first.`);
  }

  const answer = await passwordFn({ message: `${service.label} token:` });
  const format = validateTokenFormat(answer);
  if (!format.valid) {
    throw new Error(format.message);
  }
  return {
    token: answer.trim(),
    source: 'prompt',
    envTokenPresent: Boolean(envToken.token),
    envTokenKey: envToken.envKey,
    storedTokenPresent: Boolean(storedToken),
  };
}

export async function resolveToken(options = {}, dependencies = {}) {
  const resolved = await resolveTokenWithSource(options, dependencies);
  return resolved.token;
}

export function formatClaudeCodeTokenConflictWarning(service, resolvedToken) {
  if (!resolvedToken.envTokenPresent || !resolvedToken.storedTokenPresent) return;
  if (resolvedToken.source !== 'env' && resolvedToken.source !== 'legacy-env') return;
  const source = resolvedToken.envTokenKey ?? 'an environment variable';
  return `WARN Claude Code is using ${source}; a stored ${service.label} token is present and ignored. Pass --token to override explicitly.`;
}

export function warnClaudeCodeTokenConflict(service, resolvedToken) {
  const warning = formatClaudeCodeTokenConflictWarning(service, resolvedToken);
  if (warning) console.error(chalk.yellow(warning));
}

export function describeClaudeCodeTokenSource(resolvedToken) {
  if (resolvedToken.source === 'option') return '--token';
  if (resolvedToken.source === 'secure-storage') return 'secure storage';
  if (resolvedToken.source === 'prompt') return 'the interactive prompt';
  if (resolvedToken.source === 'env' || resolvedToken.source === 'legacy-env') {
    return resolvedToken.envTokenKey ? `environment variable ${resolvedToken.envTokenKey}` : 'the environment';
  }
  return 'the configured token source';
}

export function claudeCodeAuthenticationError(validation, service, resolvedToken) {
  const status = validation.status ?? 401;
  const serviceFlag = `--service ${service.value}`;
  const error = new Error([
    `${service.label} rejected the Claude Code token from ${describeClaudeCodeTokenSource(resolvedToken)} with HTTP ${status}.`,
    `Check it with "wrapper-scionos auth status ${serviceFlag}" and "wrapper-scionos auth test ${serviceFlag}",`,
    `then replace it with "wrapper-scionos auth login ${serviceFlag}" or pass --token.`,
  ].join(' '));
  error.code = 'auth_failed';
  error.statusCode = status;
  return error;
}

export async function chooseStrategy({
  serviceValue,
  noPrompt = false,
  preferredStrategy = null,
  modelIds = [],
  allowBack = false,
  selectFn = select,
} = {}) {
  const service = requireServiceConfig(serviceValue);
  const finalizeChoice = (selected) => {
    const resolvedStrategy = getFallbackStrategy(selected, modelIds, service.value);
    if (!resolvedStrategy) {
      const launchReadiness = assessStrategyLaunch(selected, modelIds, service.value);
      throw new Error(`Strategy "${selected}" cannot support the default Claude Code launch on ${service.availabilityLabel}. ${launchReadiness.note}`);
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
    const defaultStrategy = strategies.find((strategy) => (
      assessStrategyLaunch(strategy.value, modelIds, service.value).ready
    ));
    if (!defaultStrategy) {
      throw new Error(`No launchable strategy is available on ${service.availabilityLabel}.`);
    }
    return finalizeChoice(defaultStrategy.value);
  }

  const choices = buildStrategyPromptChoices(modelIds, service.value);
  const promptChoices = allowBack
    ? [...choices, {
      name: '← Back to home',
      value: 'back',
      description: 'Return to the main menu without launching Claude Code.',
      short: 'Back to home',
    }]
    : choices;

  if (choices.every((choice) => choice.disabled)) {
    throw new Error(`No launchable strategy is available on ${service.availabilityLabel}.`);
  }

  return selectFn({
    message: 'Select Model Strategy:',
    choices: withSeparators(promptChoices),
    pageSize: promptChoices.length + Math.max(promptChoices.length - 1, 0),
  }).then((selected) => selected === 'back' ? null : finalizeChoice(selected));
}

export function buildGuidedStrategyPromptChoices(modelIds, serviceValue, allowBack = false) {
  const choices = buildStrategyPromptChoices(modelIds, serviceValue);
  if (!allowBack) return choices;
  return [...choices, {
    name: '← Back to home',
    value: 'back',
    description: 'Return to the main menu without launching Claude Code.',
    short: 'Back to home',
  }];
}
export function buildStrategyPromptChoices(modelIds, serviceValue) {
  return getStrategyChoices(modelIds, serviceValue).map((choice) => {
    const launchReadiness = assessStrategyLaunch(choice.value, modelIds, serviceValue);
    const disabled = !launchReadiness.ready
      && (choice.availability.level === 'unavailable' || hasVerifiedModelIds(modelIds))
      ? launchReadiness.note
      : false;
    return {
      ...choice,
      disabled,
      name: getStrategyIndicator(choice.value, modelIds, serviceValue) + ' ' + choice.name,
      short: choice.name,
    };
  });
}

export async function chooseSubagentModel({
  serviceValue,
  strategyValue,
} = {}) {
  return getClaudeCodeStrategyEnvironment(strategyValue, serviceValue).CLAUDE_CODE_SUBAGENT_MODEL
    ?? 'strategy default';
}

export async function launchClaudeCode(
  { serviceValue, strategyValue, token: tokenOverride = null, noPrompt, claudeArgs, version = null, allowBack = false },
  {
    chooseStrategyFn = chooseStrategy,
    detectClaudeCodeFn = detectClaudeCode,
    fetchModelsFn = fetchModels,
    resolveTokenWithSourceFn = resolveTokenWithSource,
    runInteractiveCliFn = runInteractiveCli,
    startLongRunningLlmProxyFn = startLongRunningLlmProxy,
    stopLongRunningLlmProxyFn = stopLongRunningLlmProxy,
  } = {},
) {
  const serviceConfig = requireServiceConfig(serviceValue);
  const baseUrlResolution = resolveServiceBaseUrlWithSource(serviceConfig.value, process.env);
  const service = {
    ...serviceConfig,
    baseUrl: validateServiceBaseUrl(baseUrlResolution.baseUrl, serviceConfig.value),
  };
  if (!noPrompt) {
    console.log(formatClaudeCodeIntro(version));
  }

  const claude = detectClaudeCodeFn();
  if (!claude.installed) {
    throw new Error('Claude Code CLI not found. Install @anthropic-ai/claude-code first.');
  }

  const override = tokenOverride?.trim();
  const resolvedToken = override
    ? {
        token: override,
        source: 'option',
        envTokenPresent: false,
        envTokenKey: null,
        storedTokenPresent: false,
      }
    : await resolveTokenWithSourceFn({ serviceValue: service.value, noPrompt });
  warnClaudeCodeTokenConflict(service, resolvedToken);
  const token = resolvedToken.token;
  const tokenFormat = validateTokenFormat(token);
  if (!tokenFormat.valid) {
    throw new Error(tokenFormat.message);
  }
  const validation = await fetchModelsFn(token, { serviceValue: service.value, baseUrl: service.baseUrl });
  if (!validation.valid && validation.reason === 'auth_failed') {
    throw claudeCodeAuthenticationError(validation, service, resolvedToken);
  }
  const modelIds = validation.valid ? validation.models : [];
  if (!validation.valid && !noPrompt) {
    const detail = validation.message || validation.reason || 'model availability could not be verified';
    console.log(chalk.yellow(`WARN ${service.availabilityLabel} model list unavailable: ${detail}.`));
  }

  const selectedStrategy = await chooseStrategyFn({
    serviceValue: service.value,
    noPrompt,
    preferredStrategy: strategyValue,
    modelIds,
    allowBack,
  });
  if (selectedStrategy === null) return { kind: 'back' };
  const selectedSubagentModel = await chooseSubagentModel({
    serviceValue: service.value,
    strategyValue: selectedStrategy,
  });

  let proxy = null;
  try {
    proxy = await startLongRunningLlmProxyFn({
      targetBaseUrl: service.baseUrl,
      routerlabToken: token,
      upstreamAuth: 'anthropic',
    });
    const proxiedService = { ...service, baseUrl: proxy.baseUrl };
    const env = buildClaudeCodeEnvironment(proxy.gatewayToken, proxiedService, selectedStrategy);
    const selectedStrategyName = getStrategyDisplayName(selectedStrategy, service.value);

    if (!noPrompt) {
      console.log(formatLaunchSummary({
        service,
        strategy: selectedStrategyName,
        subagentModel: selectedSubagentModel,
        endpoint: `${proxy.baseUrl} -> ${service.baseUrl}`,
      }));
      console.log(chalk.green(`Launching Claude Code [${selectedStrategyName}]...\n`));
    }

    await runInteractiveCliFn(claude.cliPath, claudeArgs, { env });
    return { kind: 'launched' };
  } finally {
    await stopLongRunningLlmProxyFn(proxy, { graceMs: 2000 });
  }
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

export function formatLaunchSummary({ service, strategy, subagentModel, endpoint }) {
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

export function withSeparators(choices) {
  return choices.flatMap((choice, index) => (
    index === choices.length - 1 ? [choice] : [choice, new Separator(' ')]
  ));
}

export function getStrategyIndicator(strategyValue, modelIds, serviceValue) {
  const launchReadiness = assessStrategyLaunch(strategyValue, modelIds, serviceValue);
  if (!launchReadiness.ready && launchReadiness.availability.level === 'unavailable') {
    return chalk.red('●');
  }
  if (!hasVerifiedModelIds(modelIds)) {
    return chalk.gray('●');
  }

  return launchReadiness.ready ? chalk.green('●') : chalk.red('●');
}
