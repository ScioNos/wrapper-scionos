import {
  requireServiceConfig,
  resolveServiceBaseUrlWithSource,
  resolveServiceEnvToken,
  validateServiceBaseUrl,
} from '../../routerlab/services.js';
import { fetchModels, validateTokenFormat } from '../../routerlab/models.js';
import { resolveTokenWithSource } from '../../apps/claude-code.js';
import {
  appendOpenCodeApiPath,
  assertOpenCodeCliAvailable,
  availableOpenCodeModels,
  getOpenCodeModelFamilies,
  buildOpenCodeEnvironment,
  defaultOpenCodeModelForService,
  launchOpenCode,
  openCodeModelDisplayName,
} from '../../apps/opencode.js';
import { applyMenuControl, askSelect } from '../menu.js';
import { startLongRunningLlmProxy, stopLongRunningLlmProxy } from '../../platform/llm-proxy.js';
import { findStrategy } from '../../routerlab/strategies.js';
import { CliUsageError } from '../args.js';
import { translate } from '../i18n.js';

const DEFAULT_OPEN_CODE_DEPENDENCIES = Object.freeze({
  assertOpenCodeCliAvailable,
  fetchModels,
  launchOpenCode,
  resolveTokenWithSource,
  selectFamily: askSelect,
  selectModel: askSelect,
  startLongRunningLlmProxy,
  stopLongRunningLlmProxy,
});

export async function launchOpenCodeForService(options, dependencies = {}) {
  const deps = { ...DEFAULT_OPEN_CODE_DEPENDENCIES, ...dependencies };
  const openCodeArgs = validateOpenCodeForwardedArgs(options.passthrough ?? []);
  const openCode = deps.assertOpenCodeCliAvailable();
  const serviceConfig = requireServiceConfig(options.service);
  const service = {
    ...serviceConfig,
    baseUrl: validateServiceBaseUrl(
      resolveServiceBaseUrlWithSource(serviceConfig.value, process.env).baseUrl,
      serviceConfig.value,
    ),
  };

  const envToken = resolveServiceEnvToken(service.value, process.env);
  const resolvedToken = options.token
    ? explicitOpenCodeToken(options.token, envToken)
    : await deps.resolveTokenWithSource({ serviceValue: service.value, noPrompt: options.noPrompt });

  let modelResult;
  try {
    modelResult = await deps.fetchModels(resolvedToken.token, {
      serviceValue: service.value,
      baseUrl: service.baseUrl,
      timeoutMs: 10000,
    });
  } catch (error) {
    throw openCodeModelDiscoveryError({ reason: 'network_error', message: error.message }, service);
  }
  if (!modelResult.valid) {
    if (modelResult.reason === 'auth_failed') {
      throw openCodeAuthenticationError(modelResult, service, resolvedToken);
    }
    throw openCodeModelDiscoveryError(modelResult, service);
  }

  const availableModels = availableOpenCodeModels(service.value, modelResult.models);
  if (availableModels.length === 0) {
    throw openCodeModelDiscoveryError({
      reason: 'models_unavailable',
      message: options.strategy
        ? `no model for strategy "${options.strategy}" is currently available`
        : 'no authorized OpenCode model is currently available',
    }, service);
  }

  const availableFamilies = availableOpenCodeModelFamilies(service.value, modelResult.models, options.strategy);
  if (!options.model && !options.noPrompt && availableFamilies.length === 0) {
    throw openCodeModelDiscoveryError({
      reason: 'models_unavailable',
      message: 'no OpenCode model family is currently available',
    }, service);
  }
  let selectedFamily = await resolveOpenCodeLaunchFamily({
    requestedFamily: options.strategy,
    availableFamilies,
    service,
    noPrompt: options.noPrompt || Boolean(options.model),
    language: options.language,
    selectFamily: deps.selectFamily,
  });
  let selectionModels;
  let model;
  while (true) {
    selectionModels = selectedFamily
      ? selectedFamily.models.map(({ model: familyModel }) => familyModel)
      : availableModels;
    try {
      model = await resolveOpenCodeLaunchModel({
        requestedModel: options.model,
        availableModels: selectionModels,
        service,
        noPrompt: options.noPrompt,
        language: options.language,
        selectModel: deps.selectModel,
      });
      break;
    } catch (error) {
      if (error?.name !== 'MenuBackError' || options.noPrompt || options.model || options.strategy || availableFamilies.length < 2) {
        throw error;
      }
      selectedFamily = await resolveOpenCodeLaunchFamily({
        availableFamilies,
        service,
        language: options.language,
        selectFamily: deps.selectFamily,
      });
    }
  }

  let proxy = null;
  try {
    proxy = await deps.startLongRunningLlmProxy({
      targetBaseUrl: service.baseUrl,
      routerlabToken: resolvedToken.token,
      upstreamAuth: 'openai',
      allowedModels: selectedFamily ? selectionModels : availableModels,
    });
    const env = buildOpenCodeEnvironment({
      sourceEnv: process.env,
      proxyBaseUrl: proxy.baseUrl,
      gatewayToken: proxy.gatewayToken,
      model,
      models: selectedFamily ? selectionModels : availableModels,
      modelMetadata: modelResult.modelMetadata ?? [],
    });

    if (!options.noPrompt) {
      console.log([
        `OpenCode via ${service.label}`,
        `Model: ${model}`,
        `Endpoint: ${proxy.baseUrl} -> ${appendOpenCodeApiPath(service.baseUrl)}`,
        '',
      ].join('\n'));
    }

    return await deps.launchOpenCode({
      openCode,
      openCodeArgs,
      env,
      updateProcessExitCode: options.updateProcessExitCode ?? true,
    });
  } finally {
    if (proxy) {
      await deps.stopLongRunningLlmProxy(proxy, { graceMs: 2000 });
    }
  }
}

export async function resolveOpenCodeLaunchModel({
  requestedModel = null,
  availableModels,
  service,
  noPrompt = false,
  language = 'en',
  selectModel = askSelect,
} = {}) {
  if (requestedModel !== null && requestedModel !== undefined) {
    if (!availableModels.includes(requestedModel)) {
      throw openCodeModelUnavailableError(requestedModel, service, availableModels);
    }
    return requestedModel;
  }

  const defaultModel = defaultOpenCodeModelForService(service.value);
  if (noPrompt) {
    if (!availableModels.includes(defaultModel)) {
      throw openCodeModelUnavailableError(defaultModel, service, availableModels);
    }
    return defaultModel;
  }

  if (availableModels.length === 1) return availableModels[0];
  return applyMenuControl(await selectModel({
    message: translate(language, 'selectOpenCodeModel', { service: service.label }),
    language,
    helpMode: 'compact',
    choices: [
      ...availableModels.map((model, index) => ({
        key: String(index + 1),
        name: openCodeModelDisplayName(model),
        value: model,
        description: model,
      })),
      {
        key: '0',
        name: '← Back',
        value: 'back',
        description: 'Return to the previous menu.',
      },
    ],
  }), { allowBack: false });
}

export function availableOpenCodeModelFamilies(serviceValue, discoveredModelIds = [], strategyValue = null) {
  const families = getOpenCodeModelFamilies(serviceValue, discoveredModelIds);
  if (!strategyValue) return families;
  const strategy = findStrategy(strategyValue, serviceValue);
  return strategy ? families.filter((family) => family.value === strategy.value) : [];
}

export async function resolveOpenCodeLaunchFamily({
  requestedFamily = null,
  availableFamilies = [],
  service,
  noPrompt = false,
  language = 'en',
  selectFamily = askSelect,
} = {}) {
  if (requestedFamily !== null && requestedFamily !== undefined) {
    const family = availableFamilies.find((entry) => entry.value === (findStrategy(requestedFamily, service.value)?.value ?? requestedFamily));
    if (!family) {
      throw new Error(`OpenCode model family "${requestedFamily}" is not available on ${service.label}.`);
    }
    return family;
  }
  if (noPrompt) return null;
  if (availableFamilies.length === 1) return availableFamilies[0];
  const selected = applyMenuControl(await selectFamily({
    message: translate(language, 'selectOpenCodeFamily', { service: service.label }),
    language,
    helpMode: 'compact',
    choices: [
      ...availableFamilies.map((family, index) => ({
        key: String(index + 1),
        name: family.name,
        value: family.value,
        description: family.description,
      })),
      {
        key: '0',
        name: '← Back',
        value: 'back',
        description: 'Return to the previous menu.',
      },
    ],
  }), { allowBack: false });
  const family = availableFamilies.find((entry) => entry.value === selected);
  if (!family) throw new Error(`Unknown OpenCode model family "${selected}".`);
  return family;
}

export function validateOpenCodeForwardedArgs(forwarded = []) {
  const blocked = new Set([
    '-m',
    '--model',
    '--config',
    '--config-dir',
    '--config-content',
  ]);
  for (const argument of forwarded) {
    const value = String(argument);
    const option = value.match(/^(--[^=]+)=/)?.[1] ?? value;
    const attachedShortModel = value.startsWith('-m') && value.length > 2;
    if (blocked.has(option) || attachedShortModel) {
      const blockedOption = attachedShortModel ? '-m' : option;
      throw new CliUsageError(
        `${blockedOption} cannot be forwarded to OpenCode because RouterLab controls the provider and model selection. Use the wrapper --model option.`,
      );
    }
  }
  return [...forwarded];
}

export function explicitOpenCodeToken(token, envToken) {
  const format = validateTokenFormat(token);
  if (!format.valid) throw new Error(format.message);
  return {
    token: token.trim(),
    source: 'option',
    envTokenPresent: Boolean(envToken.token),
    envTokenKey: envToken.envKey,
    storedTokenPresent: false,
  };
}

export function openCodeAuthenticationError(validation, service, resolvedToken) {
  const status = validation.status ?? 401;
  const source = resolvedToken.source === 'option'
    ? '--token'
    : resolvedToken.envTokenKey ?? resolvedToken.source ?? 'the configured token source';
  const error = new Error(
    `${service.label} rejected the OpenCode token from ${source} with HTTP ${status}. Check the service token with "wrapper-scionos auth test --service ${service.value}".`,
  );
  error.code = 'auth_failed';
  error.statusCode = status;
  return error;
}

export function openCodeModelDiscoveryError(validation, service) {
  const detail = validation.message
    ?? (validation.status ? `HTTP ${validation.status}${validation.statusText ? ` ${validation.statusText}` : ''}` : null)
    ?? validation.reason
    ?? 'unknown error';
  const error = new Error(`Cannot discover available OpenCode models on ${service.label}: ${detail}. OpenCode was not launched.`);
  error.code = validation.reason ?? 'model_discovery_failed';
  if (validation.status) error.statusCode = validation.status;
  return error;
}

export function openCodeModelUnavailableError(model, service, availableModels) {
  const available = availableModels.length > 0 ? availableModels.join(', ') : 'none';
  const error = new Error(
    `OpenCode model "${model}" is not available on ${service.label}. Available OpenCode models: ${available}.`,
  );
  error.code = 'model_unavailable';
  return error;
}
