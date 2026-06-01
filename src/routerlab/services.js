export const DEFAULT_SERVICE = 'routerlab';
export const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

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
    strategyValues: [
      'default',
      'aws',
      'claude-gpt',
      'deepseek-v4',
      'claude-kimi-k2.6',
      'glm-5.1',
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
    strategyValues: [
      'claude',
      'claude-gpt',
      'claude-gpt-special',
      'deepseek-v4',
      'minimax-m2.7',
      'glm-5.1',
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

export function resolveServiceBaseUrl(serviceValue = DEFAULT_SERVICE, env = {}) {
  return env.ANTHROPIC_BASE_URL?.trim() || requireServiceConfig(serviceValue).baseUrl;
}
