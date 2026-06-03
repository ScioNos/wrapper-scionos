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
    description: 'Uses Claude Code natively without forcing model environment variables.',
    selectionName: 'Claude Native',
    selectionDescription: 'Standard behavior. Claude decides which model to use.',
    requiredModels: DEFAULT_CLAUDE_MODELS,
  },
  {
    value: 'aws',
    name: 'Claude via AWS',
    description: 'Sets Claude Code model environment variables to AWS-backed Claude variants.',
    selectionName: '💸 Claude via AWS (-50%)',
    selectionDescription: 'Use aws-claude-haiku, aws-claude-sonnet, aws-claude-opus.',
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
    description: 'Sets Claude Code model environment variables to standard Claude variants.',
    selectionName: 'Claude',
    selectionDescription: 'Use claude-haiku, claude-sonnet, claude-opus.',
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
    description: 'Opus => GPT 5.5, Sonnet => GPT 5.4, Haiku/subagents => GPT 5.4 mini.',
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
    description: 'Use special-price GPT routes when available on RouterLab LLM.',
    selectionDescription: 'Use special-price GPT routes when available on RouterLab LLM.',
    aliases: ['gpt-5.5-sp'],
    requiredModels: ['claude-gpt-5.5-sp', 'claude-gpt-5.4-mini-sp'],
    allowSubagentOverride: false,
    environment: createModelEnvironment({
      opus: 'claude-gpt-5.5-sp',
      sonnet: 'claude-gpt-5.5-sp',
      haiku: 'claude-gpt-5.4-mini-sp',
      subagent: 'claude-gpt-5.4-mini-sp',
    }),
  },
  {
    value: 'deepseek-v4-beta',
    name: 'deepseek-v4 beta',
    selectionName: 'deepseek-v4 beta',
    description: 'Sets Claude Code model environment variables to the claude-deepseek-v4 family. Opus and Sonnet => claude-deepseek-v4-pro, Haiku => claude-deepseek-v4-flash.',
    selectionDescription: 'Opus and Sonnet => claude-deepseek-v4-pro, Haiku => claude-deepseek-v4-flash.',
    requiredModels: DEEPSEEK_V4_MODELS,
    environment: createModelEnvironment({
      opus: 'claude-deepseek-v4-pro',
      sonnet: 'claude-deepseek-v4-pro',
      haiku: 'claude-deepseek-v4-flash',
      subagent: 'claude-deepseek-v4-flash',
    }),
  },
  {
    value: 'claude-MiniMax-M3',
    name: 'MiniMax-M3 beta',
    selectionName: 'MiniMax-M3 beta',
    description: 'Sets all Claude Code model environment variables to claude-MiniMax-M3.',
    selectionDescription: 'Uses claude-MiniMax-M3 for all model aliases.',
    requiredModels: ['claude-MiniMax-M3'],
    allowSubagentOverride: false,
    environment: createSingleModelEnvironment('claude-MiniMax-M3'),
  },
  {
    value: 'claude-qwen3.7-max',
    name: 'qwen3.7-max',
    selectionName: 'qwen3.7-max',
    description: 'Sets Claude Code main model aliases to claude-qwen3.7-max and subagents to claude-qwen3.6-flash.',
    selectionDescription: 'Uses claude-qwen3.7-max for main model aliases and claude-qwen3.6-flash for subagents.',
    requiredModels: ['claude-qwen3.7-max', 'claude-qwen3.6-flash'],
    allowSubagentOverride: false,
    environment: createModelEnvironment({
      opus: 'claude-qwen3.7-max',
      sonnet: 'claude-qwen3.7-max',
      haiku: 'claude-qwen3.7-max',
      subagent: 'claude-qwen3.6-flash',
    }),
  },
  {
    value: 'claude-kimi-k2.6',
    name: 'Kimi K2.6',
    description: 'Sets all Claude Code model environment variables to claude-kimi-k2.6.',
    selectionDescription: 'Uses claude-kimi-k2.6 for all model aliases.',
    requiredModels: ['claude-kimi-k2.6'],
    environment: createSingleModelEnvironment('claude-kimi-k2.6'),
  },
  {
    value: 'glm-5.1',
    name: 'glm-5.1',
    description: 'Sets all Claude Code model environment variables to claude-glm-5.1.',
    selectionDescription: 'Uses claude-glm-5.1 for all model aliases.',
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
    .map((value) => {
      const strategy = STRATEGIES.find((entry) => entry.value === value);
      if (service.value === 'llm' && strategy?.value === 'claude') {
        return {
          ...strategy,
          selectionDescription: 'Standard behavior. Claude decides which model to use.',
          requiredModels: [],
          claudeCodeNative: true,
        };
      }
      return strategy;
    })
    .filter(Boolean);
}

export function findStrategy(strategyValue, serviceValue = DEFAULT_SERVICE) {
  const normalized = normalizeStrategyValue(strategyValue);
  return getServiceStrategies(serviceValue).find((strategy) => (
    strategy.value === normalized || strategy.aliases?.includes(strategyValue)
  )) ?? null;
}

export function getStrategyDisplayName(strategyValue, serviceValue = DEFAULT_SERVICE) {
  const strategy = findStrategy(strategyValue, serviceValue);
  return strategy?.selectionName ?? strategy?.name ?? strategy?.value ?? strategyValue;
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
  return applySubagentModelOverride(strategy, env, options);
}

export function getClaudeCodeStrategyEnvironment(strategyValue, serviceValue = DEFAULT_SERVICE, options = {}) {
  const strategy = findStrategy(strategyValue, serviceValue);
  if (!strategy) {
    throw new Error(`Unknown strategy "${strategyValue}" for service "${serviceValue}".`);
  }

  const env = strategy.claudeCodeNative ? {} : { ...(strategy.environment ?? {}) };
  return applySubagentModelOverride(strategy, env, options);
}

export function allowsSubagentModelOverride(strategyValue, serviceValue = DEFAULT_SERVICE) {
  const strategy = findStrategy(strategyValue, serviceValue);
  if (!strategy) {
    throw new Error(`Unknown strategy "${strategyValue}" for service "${serviceValue}".`);
  }
  return strategy.allowSubagentOverride !== false;
}

function applySubagentModelOverride(strategy, env, options = {}) {
  if (strategy.allowSubagentOverride === false) {
    return env;
  }

  const subagentOverride = getSubagentModelOverride(options.subagentModel);
  if (subagentOverride) {
    env.CLAUDE_CODE_SUBAGENT_MODEL = subagentOverride;
  }
  return env;
}

export function hasVerifiedModelIds(modelIds) {
  return Array.isArray(modelIds) && modelIds.length > 0;
}

function getRequiredModels(strategy) {
  return strategy?.requiredModels ?? strategy?.verificationModels ?? strategy?.mappedModels ?? [];
}

export function hasExploitableModelIds(modelIds, serviceValue = DEFAULT_SERVICE) {
  if (!hasVerifiedModelIds(modelIds)) {
    return false;
  }

  const knownModelIds = new Set(
    getServiceStrategies(serviceValue).flatMap((strategy) => getRequiredModels(strategy)),
  );

  if (knownModelIds.size === 0) {
    return false;
  }

  return modelIds.some((modelId) => knownModelIds.has(modelId));
}

export function assessStrategy(strategyValue, modelIds = [], serviceValue = DEFAULT_SERVICE) {
  const service = requireServiceConfig(serviceValue);
  const strategy = findStrategy(strategyValue, service.value);
  if (!strategy) {
    return { available: false, level: 'unavailable', note: 'Unknown strategy.', strategy: null };
  }

  const requiredModels = getRequiredModels(strategy);
  if (!requiredModels.length) {
    return { available: true, level: 'ready', note: 'Always available.', strategy };
  }

  if (!hasExploitableModelIds(modelIds, service.value)) {
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

export function assessStrategyLaunch(strategyValue, modelIds = [], serviceValue = DEFAULT_SERVICE) {
  const service = requireServiceConfig(serviceValue);
  const availability = assessStrategy(strategyValue, modelIds, service.value);
  const requiredModels = getRequiredModels(availability.strategy);

  if (!availability.strategy) {
    return {
      ready: false,
      note: 'Unknown strategy.',
      missingModels: [],
      requiredModels: [],
      availability,
    };
  }

  if (!requiredModels.length || !hasExploitableModelIds(modelIds, service.value)) {
    return {
      ready: availability.level !== 'unavailable',
      note: availability.note,
      missingModels: [],
      requiredModels,
      availability,
    };
  }

  const missingModels = requiredModels.filter((model) => !modelIds.includes(model));
  if (missingModels.length === 0) {
    return {
      ready: true,
      note: `Default Claude Code launch verified on ${service.availabilityLabel}.`,
      missingModels,
      requiredModels,
      availability,
    };
  }

  const note = requiredModels.length === 1
    ? `Default Claude Code launch requires ${requiredModels[0]}, which is not reported by ${service.availabilityLabel}.`
    : `Default Claude Code launch requires all of: ${requiredModels.join(', ')}. Missing on ${service.availabilityLabel}: ${missingModels.join(', ')}.`;

  return {
    ready: false,
    note,
    missingModels,
    requiredModels,
    availability,
  };
}

export function getFallbackStrategy(strategyValue, modelIds = [], serviceValue = DEFAULT_SERVICE) {
  const normalized = normalizeStrategyValue(strategyValue);
  if (hasExploitableModelIds(modelIds, serviceValue)) {
    return assessStrategyLaunch(normalized, modelIds, serviceValue).ready ? normalized : null;
  }

  const availability = assessStrategy(normalized, modelIds, serviceValue);
  return availability.level === 'unavailable' ? null : normalized;
}

export function getStrategyChoices(modelIds = [], serviceValue = DEFAULT_SERVICE) {
  return getServiceStrategies(normalizeServiceValue(serviceValue)).map((strategy) => ({
    name: strategy.selectionName ?? strategy.name ?? strategy.value,
    value: strategy.value,
    description: strategy.selectionDescription ?? strategy.description,
    availability: assessStrategy(strategy.value, modelIds, serviceValue),
  }));
}
