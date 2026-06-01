import { DEFAULT_SERVICE, normalizeServiceValue, requireServiceConfig } from './services.js';

export const DEFAULT_CLAUDE_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
];

export const LLM_CLAUDE_MODELS = [
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
];

export const AWS_CLAUDE_MODELS = [
  'aws-claude-haiku-4-5-20251001',
  'aws-claude-sonnet-4-6',
  'aws-claude-opus-4-8',
];

export const OPENAI_GPT_MODELS = [
  'claude-gpt-5.5',
  'claude-gpt-5.4',
  'claude-gpt-5.4-mini',
];

export const DEEPSEEK_V4_MODELS = [
  'claude-deepseek-v4-pro',
  'claude-deepseek-v4-flash',
];

export const SUBAGENT_MODEL_CHOICES = {
  default: null,
  haiku: 'claude-haiku-4-5-20251001',
  'gpt-5.4-mini': 'claude-gpt-5.4-mini',
  'claude-deepseek-v4-flash': 'claude-deepseek-v4-flash',
};

function createModelEnvironment({ opus, sonnet, haiku, subagent = null }) {
  const env = {
    ANTHROPIC_DEFAULT_OPUS_MODEL: opus,
    ANTHROPIC_DEFAULT_SONNET_MODEL: sonnet,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: haiku,
  };

  if (subagent) {
    env.CLAUDE_CODE_SUBAGENT_MODEL = subagent;
  }

  return env;
}

function createSingleModelEnvironment(model) {
  return createModelEnvironment({
    opus: model,
    sonnet: model,
    haiku: model,
    subagent: model,
  });
}

export const STRATEGIES = [
  {
    value: 'default',
    name: 'Claude Native',
    selectionDescription: 'Let Claude Code choose its native models.',
    requiredModels: DEFAULT_CLAUDE_MODELS,
  },
  {
    value: 'aws',
    name: 'Claude via AWS',
    selectionDescription: 'Use RouterLab AWS-backed Claude variants.',
    requiredModels: AWS_CLAUDE_MODELS,
    environment: createModelEnvironment({
      opus: 'aws-claude-opus-4-8',
      sonnet: 'aws-claude-sonnet-4-6',
      haiku: 'aws-claude-haiku-4-5-20251001',
      subagent: 'aws-claude-haiku-4-5-20251001',
    }),
  },
  {
    value: 'claude',
    name: 'Claude',
    selectionDescription: 'Use RouterLab LLM Claude-family models.',
    requiredModels: LLM_CLAUDE_MODELS,
    environment: createModelEnvironment({
      opus: 'claude-opus-4-7',
      sonnet: 'claude-sonnet-4-6',
      haiku: 'claude-opus-4-6',
      subagent: 'claude-sonnet-4-6',
    }),
  },
  {
    value: 'claude-gpt',
    name: 'OpenAI GPT',
    selectionDescription: 'Opus => GPT 5.5, Sonnet => GPT 5.4, Haiku/subagents => GPT 5.4 mini.',
    aliases: ['claude-gpt-5.4'],
    requiredModels: OPENAI_GPT_MODELS,
    environment: createModelEnvironment({
      opus: 'claude-gpt-5.5',
      sonnet: 'claude-gpt-5.4',
      haiku: 'claude-gpt-5.4-mini',
      subagent: 'claude-gpt-5.4-mini',
    }),
  },
  {
    value: 'claude-gpt-special',
    name: 'OpenAI GPT special price',
    selectionDescription: 'Use special-price GPT routes when available on RouterLab LLM.',
    aliases: ['gpt-5.5-sp'],
    requiredModels: ['claude-gpt-5.5-sp', 'claude-gpt-5.4-mini-sp'],
    environment: createModelEnvironment({
      opus: 'claude-gpt-5.5-sp',
      sonnet: 'claude-gpt-5.5-sp',
      haiku: 'claude-gpt-5.4-mini-sp',
      subagent: 'claude-gpt-5.4-mini-sp',
    }),
  },
  {
    value: 'deepseek-v4',
    name: 'DeepSeek V4',
    selectionDescription: 'Opus/Sonnet => DeepSeek V4 Pro, Haiku/subagents => DeepSeek V4 Flash.',
    requiredModels: DEEPSEEK_V4_MODELS,
    environment: createModelEnvironment({
      opus: 'claude-deepseek-v4-pro',
      sonnet: 'claude-deepseek-v4-pro',
      haiku: 'claude-deepseek-v4-flash',
      subagent: 'claude-deepseek-v4-flash',
    }),
  },
  {
    value: 'minimax-m2.7',
    name: 'MiniMax M2.7',
    selectionDescription: 'Use MiniMax M2.7 for all Claude Code model roles.',
    requiredModels: ['claude-minimax-m2.7'],
    environment: createSingleModelEnvironment('claude-minimax-m2.7'),
  },
  {
    value: 'claude-kimi-k2.6',
    name: 'Kimi K2.6',
    selectionDescription: 'Use Kimi K2.6 for all Claude Code model roles.',
    requiredModels: ['claude-kimi-k2.6'],
    environment: createSingleModelEnvironment('claude-kimi-k2.6'),
  },
  {
    value: 'glm-5.1',
    name: 'GLM 5.1',
    selectionDescription: 'Use GLM 5.1 for all Claude Code model roles.',
    requiredModels: ['claude-glm-5.1'],
    environment: createSingleModelEnvironment('claude-glm-5.1'),
  },
];

export function normalizeStrategyValue(strategyValue) {
  if (strategyValue === 'claude-gpt-5.4') {
    return 'claude-gpt';
  }
  if (strategyValue === 'gpt-5.5-sp') {
    return 'claude-gpt-special';
  }
  return strategyValue;
}

export function getServiceStrategies(serviceValue = DEFAULT_SERVICE) {
  const service = requireServiceConfig(serviceValue);
  return service.strategyValues
    .map((value) => STRATEGIES.find((strategy) => strategy.value === value))
    .filter(Boolean);
}

export function findStrategy(strategyValue, serviceValue = DEFAULT_SERVICE) {
  const normalized = normalizeStrategyValue(strategyValue);
  return getServiceStrategies(serviceValue).find((strategy) => (
    strategy.value === normalized || strategy.aliases?.includes(strategyValue)
  )) ?? null;
}

export function getSubagentModelOverride(subagentModel = 'default') {
  const normalized = subagentModel?.trim()?.toLowerCase() || 'default';
  if (!Object.hasOwn(SUBAGENT_MODEL_CHOICES, normalized)) {
    throw new Error(`Unknown subagent model "${subagentModel}". Supported values: ${Object.keys(SUBAGENT_MODEL_CHOICES).join(', ')}.`);
  }
  return SUBAGENT_MODEL_CHOICES[normalized];
}

export function getStrategyEnvironment(strategyValue, serviceValue = DEFAULT_SERVICE, options = {}) {
  const strategy = findStrategy(strategyValue, serviceValue);
  if (!strategy) {
    throw new Error(`Unknown strategy "${strategyValue}" for service "${serviceValue}".`);
  }

  const env = { ...(strategy.environment ?? {}) };
  const subagentOverride = getSubagentModelOverride(options.subagentModel);
  if (subagentOverride) {
    env.CLAUDE_CODE_SUBAGENT_MODEL = subagentOverride;
  }
  return env;
}

export function hasVerifiedModelIds(modelIds) {
  return Array.isArray(modelIds) && modelIds.length > 0;
}

export function assessStrategy(strategyValue, modelIds = [], serviceValue = DEFAULT_SERVICE) {
  const service = requireServiceConfig(serviceValue);
  const strategy = findStrategy(strategyValue, service.value);
  if (!strategy) {
    return { available: false, level: 'unavailable', note: 'Unknown strategy.', strategy: null };
  }

  const requiredModels = strategy.requiredModels ?? [];
  if (!requiredModels.length || !hasVerifiedModelIds(modelIds)) {
    return { available: true, level: 'unknown', note: 'Availability not verified.', strategy };
  }

  const availableModels = new Set(modelIds);
  const presentCount = requiredModels.filter((model) => availableModels.has(model)).length;
  if (presentCount === requiredModels.length) {
    return { available: true, level: 'ready', note: `Verified on ${service.availabilityLabel}.`, strategy };
  }
  if (presentCount > 0) {
    return { available: true, level: 'partial', note: `Partially available on ${service.availabilityLabel}.`, strategy };
  }
  return { available: false, level: 'unavailable', note: `Not reported by ${service.availabilityLabel}.`, strategy };
}

export function getStrategyChoices(modelIds = [], serviceValue = DEFAULT_SERVICE) {
  return getServiceStrategies(normalizeServiceValue(serviceValue)).map((strategy) => ({
    name: strategy.name,
    value: strategy.value,
    description: strategy.selectionDescription,
    availability: assessStrategy(strategy.value, modelIds, serviceValue),
  }));
}
