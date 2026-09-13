import { detectOpenCodeCli } from '../platform/detect.js';
import { startLongRunningLlmProxy, stopLongRunningLlmProxy } from '../platform/llm-proxy.js';
import { runInteractiveCli } from '../platform/process.js';
import { LEGACY_TOKEN_ENV_KEY, requireServiceConfig, SERVICES } from '../routerlab/services.js';
import {
  findStrategy,
} from '../routerlab/strategies.js';
import { codexModelDisplayName, getServiceModelFamilies } from '../routerlab/strategy-models.js';

export const OPENCODE_PROVIDER_ID = 'scionos';
export const OPENCODE_CONFIG_CONTENT_ENV = 'OPENCODE_CONFIG_CONTENT';
export const OPENCODE_GATEWAY_TOKEN_ENV = 'WRAPPER_SCIONOS_OPENCODE_GATEWAY_TOKEN';
export const DEFAULT_OPENCODE_MODEL = Object.freeze({
  routerlab: 'gpt-5.6-sol',
  llm: 'gpt-5.6-sol',
});

export function assertOpenCodeCliAvailable() {
  const openCode = detectOpenCodeCli();
  if (!openCode.installed) {
    throw new Error('OpenCode CLI not found. Install it with "npm install -g opencode-ai" first.');
  }
  return openCode;
}

export function launchOpenCode({
  openCode = null,
  openCodeArgs = [],
  env = process.env,
  updateProcessExitCode = true,
} = {}) {
  const resolvedOpenCode = openCode ?? assertOpenCodeCliAvailable();
  return runInteractiveCli(resolvedOpenCode.cliPath, openCodeArgs, {
    env,
    updateProcessExitCode,
  });
}

export function getOpenCodeAuthorizedModels(serviceValue = 'routerlab') {
  return [...new Set(getOpenCodeModelFamilies(serviceValue)
    .flatMap((family) => family.models.map(({ model }) => model)))];
}

export function getOpenCodeStrategyModels(strategyValue, serviceValue = 'routerlab') {
  const service = requireServiceConfig(serviceValue);
  const family = getServiceModelFamilies(service.value, { client: 'opencode' })
    .find((entry) => entry.value === findStrategy(strategyValue, service.value)?.value);
  if (!family) {
    throw new Error(`Unknown strategy "${strategyValue}" for service "${service.value}".`);
  }
  return family.models.map(({ model }) => model);
}

export function availableOpenCodeModels(serviceValue, discoveredModelIds = [], strategyValue = null) {
  const candidates = strategyValue
    ? getOpenCodeStrategyModels(strategyValue, serviceValue)
    : getOpenCodeAuthorizedModels(serviceValue);
  const discovered = new Set(discoveredModelIds);
  return candidates.filter((model) => discovered.has(model));
}

export function getOpenCodeModelFamilies(serviceValue = 'routerlab', discoveredModelIds = null) {
  const hasDiscovery = Array.isArray(discoveredModelIds);
  const discovered = new Set(discoveredModelIds ?? []);
  return getServiceModelFamilies(serviceValue, { client: 'opencode' })
    .map((family) => ({
      ...family,
      models: family.models.filter(({ model }) => !hasDiscovery || discovered.has(model)),
    }))
    .filter((family) => family.models.length > 0);
}

export function defaultOpenCodeModelForService(serviceValue = 'routerlab') {
  return DEFAULT_OPENCODE_MODEL[serviceValue] ?? DEFAULT_OPENCODE_MODEL.routerlab;
}

export function openCodeModelDisplayName(model) {
  return codexModelDisplayName(model);
}

export function appendOpenCodeApiPath(baseUrl) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = basePath.endsWith('/v1') ? basePath : `${basePath}/v1`;
  return url.href.replace(/\/$/, '');
}

export function buildOpenCodeConfigContent({
  baseUrl,
  model,
  models = [model],
  providerId = OPENCODE_PROVIDER_ID,
  gatewayTokenEnv = OPENCODE_GATEWAY_TOKEN_ENV,
  modelMetadata = [],
} = {}) {
  const metadataById = new Map(
    (Array.isArray(modelMetadata) ? modelMetadata : [])
      .filter((entry) => entry?.id)
      .map((entry) => [entry.id, entry]),
  );
  const configuredModels = {};
  for (const modelId of [...new Set(models.filter(Boolean))]) {
    const metadata = metadataById.get(modelId);
    configuredModels[modelId] = {
      name: metadata?.displayName ?? openCodeModelDisplayName(modelId),
    };
  }

  return JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    model: `${providerId}/${model}`,
    enabled_providers: [providerId],
    provider: {
      [providerId]: {
        npm: '@ai-sdk/openai-compatible',
        name: 'ScioNos RouterLab',
        options: {
          baseURL: appendOpenCodeApiPath(baseUrl),
          apiKey: `{env:${gatewayTokenEnv}}`,
        },
        models: configuredModels,
      },
    },
  }, null, 2);
}

export function buildOpenCodeEnvironment({
  sourceEnv = process.env,
  proxyBaseUrl,
  gatewayToken,
  model,
  models,
  modelMetadata = [],
  providerId = OPENCODE_PROVIDER_ID,
} = {}) {
  const environment = {};
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (!isOpenCodeRoutingEnvironmentKey(key)) {
      environment[key] = value;
    }
  }
  const noProxy = mergeNoProxyValues(sourceEnv, new URL(proxyBaseUrl).hostname);
  return {
    ...environment,
    [OPENCODE_CONFIG_CONTENT_ENV]: buildOpenCodeConfigContent({
      baseUrl: proxyBaseUrl,
      model,
      models,
      providerId,
      modelMetadata,
    }),
    [OPENCODE_GATEWAY_TOKEN_ENV]: gatewayToken,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
  };
}

function isOpenCodeRoutingEnvironmentKey(key) {
  const normalized = String(key).toUpperCase();
  if (normalized === OPENCODE_CONFIG_CONTENT_ENV) return true;
  if (normalized === OPENCODE_GATEWAY_TOKEN_ENV) return true;
  if (normalized === LEGACY_TOKEN_ENV_KEY) return true;
  if (normalized === 'NO_PROXY') return true;
  return Object.values(SERVICES).some((service) => service.tokenEnvKeys?.includes(normalized));
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
