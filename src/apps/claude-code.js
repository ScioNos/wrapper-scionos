import { password, select, Separator } from '@inquirer/prompts';
import chalk from 'chalk';
import { detectClaudeCode, MINIMUM_CLAUDE_CODE_VERSION } from '../platform/detect.js';
import { startLongRunningLlmProxy, stopLongRunningLlmProxy } from '../platform/llm-proxy.js';
import { runInteractiveCli } from '../platform/process.js';
import { getStoredToken } from '../security/token-store.js';
import { LEGACY_TOKEN_ENV_KEY, requireServiceConfig, resolveServiceBaseUrlWithSource, resolveServiceEnvToken, SERVICES, validateServiceBaseUrl } from '../routerlab/services.js';
import { assessStrategy, assessStrategyLaunch, getAuthorizedClaudeCodeModels, getClaudeCodeStrategyEnvironment, getClaudeCodeSubagentModels, getFallbackStrategy, getServiceStrategies, getStrategyChoices, getStrategyDisplayName, hasVerifiedModelIds, isSupportedClaudeCodeSubagentModel, LLM_CLAUDE_CODE_SUBAGENT_MODELS } from '../routerlab/strategies.js';
import { fetchModelsDirect, validateTokenFormat } from '../routerlab/models.js';
import { formatBanner } from '../cli/menu.js';

export const CLAUDE_CODE_TEMPORARY_ENVIRONMENT = {
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
  CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
};

export function buildClaudeCodeEnvironment(token, service, strategyValue, options = {}) {
  const { env: sourceEnv = process.env, subagentModel = null, ...strategyOptions } = options;
  const requestedSubagentModel = subagentModel?.trim() || null;
  if (
    requestedSubagentModel
    && !isSupportedClaudeCodeSubagentModel(requestedSubagentModel, service.value)
  ) {
    throw new Error(`Subagent model "${requestedSubagentModel}" is not supported for ${service.label}.`);
  }
  const environment = {};
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (!isClaudeCodeRoutingEnvironmentKey(key)) {
      environment[key] = value;
    }
  }
  const noProxy = mergeNoProxyValues(sourceEnv, new URL(service.baseUrl).hostname);
  return {
    ...environment,
    ...CLAUDE_CODE_TEMPORARY_ENVIRONMENT,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
    ANTHROPIC_BASE_URL: service.baseUrl,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: '',
    ...getClaudeCodeStrategyEnvironment(strategyValue, service.value, strategyOptions),
    ...(service.value === 'llm' && requestedSubagentModel ? { CLAUDE_CODE_SUBAGENT_MODEL: requestedSubagentModel } : {}),
  };
}

function isClaudeCodeRoutingEnvironmentKey(key) {
  const normalized = String(key).toUpperCase();
  const routerLabTokenKeys = new Set([
    LEGACY_TOKEN_ENV_KEY,
    ...Object.values(SERVICES).flatMap((service) => service.tokenEnvKeys ?? []),
  ]);
  if (routerLabTokenKeys.has(normalized)) return true;
  if (normalized === 'NO_PROXY') return true;
  if ([
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_BETAS',
    'ANTHROPIC_CUSTOM_HEADERS',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION',
    'ANTHROPIC_WORKSPACE_ID',
    'AWS_BEARER_TOKEN_BEDROCK',
    'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
    'CLAUDE_CODE_SUBAGENT_MODEL',
    'CLAUDE_CODE_USE_ANTHROPIC_AWS',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_FOUNDRY',
    'CLAUDE_CODE_USE_MANTLE',
    'CLAUDE_CODE_USE_VERTEX',
  ].includes(normalized)) return true;
  return /^ANTHROPIC_(?:AWS|BEDROCK|FOUNDRY|VERTEX)_/.test(normalized)
    || /^ANTHROPIC_CUSTOM_MODEL_OPTION(?:_|$)/.test(normalized)
    || /^ANTHROPIC_DEFAULT_(?:FABLE|HAIKU|OPUS|SONNET)_MODEL(?:_|$)/.test(normalized);
}

function mergeNoProxyValues(environment, loopbackHost) {
  const values = Object.entries(environment)
    .filter(([key]) => key.toUpperCase() === 'NO_PROXY')
    .flatMap(([, value]) => String(value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  values.push('127.0.0.1', 'localhost', '::1', loopbackHost);
  return [...new Set(values.map((value) => value.toLowerCase()))].join(',');
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
  return `WARN Claude Code is using ${source}; a stored ${service.label} token is present and ignored. Update or unset ${source} to change the token source.`;
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
  const usesEnvironment = resolvedToken.source === 'env' || resolvedToken.source === 'legacy-env';
  const recovery = usesEnvironment
    ? `Update or unset ${resolvedToken.envTokenKey ?? 'the environment token'}; after unsetting it, use "wrapper-scionos auth login ${serviceFlag}" to store a replacement.`
    : `Replace it with "wrapper-scionos auth login ${serviceFlag}".`;
  const error = new Error([
    `${service.label} rejected the Claude Code token from ${describeClaudeCodeTokenSource(resolvedToken)} with HTTP ${status}.`,
    `Check it with "wrapper-scionos auth status ${serviceFlag}" and "wrapper-scionos auth test ${serviceFlag}",`,
    recovery,
  ].join(' '));
  error.code = 'auth_failed';
  error.statusCode = status;
  return error;
}

export function claudeCodeModelDiscoveryError(validation, service) {
  const detail = validation.message || validation.reason || 'model availability could not be verified';
  const error = new Error(`${service.availabilityLabel} model discovery failed: ${detail}. Claude Code was not started.`);
  error.code = validation.reason === 'no_authorized_models'
    ? 'no_authorized_models'
    : 'model_discovery_failed';
  error.statusCode = validation.status;
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
  noPrompt = false,
  preferredSubagentModel = null,
  modelIds = [],
  selectFn = select,
} = {}) {
  const serviceConfig = requireServiceConfig(serviceValue);
  const serviceLabel = serviceConfig.availabilityLabel || serviceConfig.label;
  const defaultModel = getClaudeCodeStrategyEnvironment(strategyValue, serviceValue).CLAUDE_CODE_SUBAGENT_MODEL
    ?? 'strategy default';
  const subagentModels = getClaudeCodeSubagentModels(serviceValue);

  const requestedModel = preferredSubagentModel?.trim() || null;
  if (requestedModel) {
    if (!isSupportedClaudeCodeSubagentModel(requestedModel, serviceValue)) {
      throw new Error(`Subagent model "${requestedModel}" is not supported for ${serviceLabel}.`);
    }
    if (hasVerifiedModelIds(modelIds) && !modelIds.includes(requestedModel)) {
      throw new Error(`Subagent model "${requestedModel}" is not available on ${serviceLabel}.`);
    }
    return requestedModel;
  }

  if (noPrompt) {
    if (hasVerifiedModelIds(modelIds) && !modelIds.includes(defaultModel)) {
      throw new Error(`Default subagent model "${defaultModel}" is not available on ${serviceLabel}.`);
    }
    return defaultModel;
  }

  const choices = subagentModels.map((model) => ({
    name: model,
    value: model,
    description: model,
    disabled: !hasVerifiedModelIds(modelIds) || modelIds.includes(model) ? false : `Not currently available on ${serviceLabel}.`,
  }));
  const availableChoices = choices.filter((choice) => !choice.disabled);
  if (availableChoices.length === 0) {
    throw new Error(`No supported subagent model is currently available on ${serviceLabel}.`);
  }
  if (availableChoices.length === 1) return availableChoices[0].value;

  return selectFn({
    message: 'Select Subagent Model:',
    choices,
    pageSize: choices.length,
  });
}

export async function launchClaudeCode(
  { serviceValue, strategyValue, subagentModel = null, token: tokenOverride = null, noPrompt, claudeArgs, version = null, allowBack = false },
  {
    chooseSubagentModelFn = chooseSubagentModel,
    chooseStrategyFn = chooseStrategy,
    detectClaudeCodeFn = detectClaudeCode,
    fetchModelsFn = fetchModelsDirect,
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
  if (!claude.versionSupported) {
    const error = new Error(`Claude Code ${MINIMUM_CLAUDE_CODE_VERSION} or newer is required; detected ${claude.version ?? 'an unknown version'}.`);
    error.code = 'unsupported_claude_version';
    throw error;
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
  if (!validation.valid) {
    throw claudeCodeModelDiscoveryError(validation, service);
  }
  const authorizedModels = new Set(getAuthorizedClaudeCodeModels(service.value));
  const modelIds = [...new Set(validation.models.filter((model) => authorizedModels.has(model)))];
  if (modelIds.length === 0) {
    throw claudeCodeModelDiscoveryError({
      reason: 'no_authorized_models',
      message: `the verified catalog contains none of the ${authorizedModels.size} authorized Claude Code models`,
    }, service);
  }

  const selectedStrategy = await chooseStrategyFn({
    serviceValue: service.value,
    noPrompt,
    preferredStrategy: strategyValue,
    modelIds,
    allowBack,
  });
  if (selectedStrategy === null) return { kind: 'back' };
  const selectedSubagentModel = await chooseSubagentModelFn({
    serviceValue: service.value,
    strategyValue: selectedStrategy,
    noPrompt,
    preferredSubagentModel: subagentModel,
    modelIds,
  });

  let proxy = null;
  try {
    proxy = await startLongRunningLlmProxyFn({
      targetBaseUrl: service.baseUrl,
      routerlabToken: token,
      upstreamAuth: 'anthropic',
      allowedModels: modelIds,
    });
    const proxiedService = { ...service, baseUrl: proxy.baseUrl };
    const env = buildClaudeCodeEnvironment(proxy.gatewayToken, proxiedService, selectedStrategy, {
      subagentModel: selectedSubagentModel,
    });
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
  } catch (error) {
    if (proxy) {
      try {
        await stopLongRunningLlmProxyFn(proxy, { graceMs: 2000 });
      } catch (cleanupError) {
        error.cleanupError = cleanupError;
      }
      proxy = null;
    }
    throw error;
  } finally {
    if (proxy) {
      await stopLongRunningLlmProxyFn(proxy, { graceMs: 2000 });
    }
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
