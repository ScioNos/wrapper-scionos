import { warnDeprecationOnce } from '../cli/deprecations.js';

export const DEFAULT_SERVICE = 'routerlab';
export const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
export const LEGACY_TOKEN_ENV_KEY = 'ANTHROPIC_AUTH_TOKEN';
export const LEGACY_BASE_URL_ENV_KEY = 'ANTHROPIC_BASE_URL';

export const SERVICES = {
  routerlab: {
    value: 'routerlab',
    label: 'RouterLab',
    availabilityLabel: 'RouterLab',
    baseUrl: 'https://api.routerlab.ch',
    secureStorageAccount: 'routerlab-token',
    secureStorageLabel: 'RouterLab Token',
    secureStorageFileName: 'routerlab-token.secure.txt',
    legacySecureStorageFileName: 'routerlab-token.secure.txt',
    tokenEnvKeys: ['ROUTERLAB_API_KEY', 'WRAPPER_SCIONOS_ROUTERLAB_TOKEN'],
    baseUrlEnvKeys: ['ROUTERLAB_BASE_URL', 'WRAPPER_SCIONOS_ROUTERLAB_BASE_URL'],
    strategyValues: [
      'default',
      'aws',
      'claude-gpt',
      'deepseek-v4-flash-0731',
      'glm-5.2',
      'minimax-m3',
    ],
  },
  llm: {
    value: 'llm',
    label: 'RouterLab LLM',
    availabilityLabel: 'RouterLab LLM',
    baseUrl: 'https://llm-api.routerlab.ch',
    secureStorageAccount: 'routerlab-llm-token',
    secureStorageLabel: 'RouterLab LLM Token',
    secureStorageFileName: 'routerlab-llm-token.secure.txt',
    legacySecureStorageFileName: 'routerlab-llm-token.secure.txt',
    tokenEnvKeys: ['ROUTERLAB_LLM_API_KEY', 'WRAPPER_SCIONOS_LLM_TOKEN'],
    baseUrlEnvKeys: ['ROUTERLAB_LLM_BASE_URL', 'WRAPPER_SCIONOS_LLM_BASE_URL'],
    strategyValues: [
      'claude',
      'claude-gpt',
      'qwen3.8-max',
      'minimax-m3',
      'glm-5.2',
      'deepseek-v4-flash-0731',
    ],
  },
};

export function normalizeServiceValue(serviceValue = DEFAULT_SERVICE) {
  return serviceValue?.trim()?.toLowerCase() || DEFAULT_SERVICE;
}

export function getServiceConfig(serviceValue = DEFAULT_SERVICE) {
  return SERVICES[normalizeServiceValue(serviceValue)] ?? null;
}

export function requireServiceConfig(serviceValue = DEFAULT_SERVICE) {
  const service = getServiceConfig(serviceValue);
  if (!service) {
    throw new Error(`Unknown service "${serviceValue}". Supported values: ${Object.keys(SERVICES).join(', ')}.`);
  }
  return service;
}

export function validateServiceBaseUrl(baseUrl, serviceValue = DEFAULT_SERVICE) {
  const service = requireServiceConfig(serviceValue);
  const value = String(baseUrl ?? '').trim();
  const expected = new URL(service.baseUrl);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${service.label} base URL must be ${service.baseUrl}.`);
  }
  if (
    parsed.protocol !== expected.protocol
    || parsed.hostname !== expected.hostname
    || parsed.port !== expected.port
    || parsed.username
    || parsed.password
    || parsed.pathname.replace(/\/+$/, '') !== expected.pathname.replace(/\/+$/, '')
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${service.label} base URL must be ${service.baseUrl}.`);
  }
  return service.baseUrl;
}

export function resolveServiceBaseUrl(serviceValue = DEFAULT_SERVICE, env = {}) {
  return resolveServiceBaseUrlWithSource(serviceValue, env).baseUrl;
}

export function resolveServiceBaseUrlWithSource(serviceValue = DEFAULT_SERVICE, env = {}) {
  const service = requireServiceConfig(serviceValue);
  const ignoredEnvKeys = [
    ...Object.values(SERVICES).flatMap((candidate) => candidate.baseUrlEnvKeys ?? []),
    LEGACY_BASE_URL_ENV_KEY,
  ].filter((key, index, keys) => keys.indexOf(key) === index && Boolean(env[key]?.trim()));

  if (env === process.env) {
    for (const key of ignoredEnvKeys) {
      warnDeprecationOnce(
        `ignored-base-url:${key}`,
        `${key} is ignored. ${service.label} always uses ${service.baseUrl}.`,
      );
    }
  }

  return {
    baseUrl: service.baseUrl,
    source: 'fixed',
    envKey: null,
    ignoredEnvKeys,
  };
}

export function resolveServiceEnvToken(serviceValue = DEFAULT_SERVICE, env = {}) {
  const service = requireServiceConfig(serviceValue);
  const serviceToken = firstEnvValue(env, service.tokenEnvKeys ?? []);
  if (serviceToken) {
    return { token: serviceToken.value, source: 'env', envKey: serviceToken.key };
  }

  const legacyToken = firstEnvValue(env, [LEGACY_TOKEN_ENV_KEY]);
  if (legacyToken) {
    if (env === process.env) warnDeprecationOnce('env:ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN is deprecated; use the RouterLab service-specific token variable.');
    return { token: legacyToken.value, source: 'legacy-env', envKey: legacyToken.key };
  }

  return { token: null, source: null, envKey: null };
}

function firstEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }
  return null;
}
