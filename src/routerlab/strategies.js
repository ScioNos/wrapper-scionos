import { DEFAULT_SERVICE, normalizeServiceValue, requireServiceConfig } from './services.js';

export const ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODEL = 'aws-claude-haiku-4-5';
export const LLM_CLAUDE_CODE_SUBAGENT_MODEL = 'claude-haiku-4-5';
export const LLM_CLAUDE_CODE_SUBAGENT_MODELS = [
  'claude-haiku-4-5',
  'deepseek-v4-flash-0731',
  'gpt-5.6-luna',
];

export const DEFAULT_CLAUDE_MODELS = [
  'claude-fable-5',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
];

export const LLM_CLAUDE_MODELS = [
  'claude-fable-5',
  'claude-opus-5',
  'claude-sonnet-5',
];

export const AWS_CLAUDE_MODELS = [
  'aws-claude-haiku-4-5',
  'aws-claude-sonnet-5',
  'aws-claude-opus-5',
];

export const OPENAI_GPT_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODEL,
];

export const SUBAGENT_MODEL_CHOICES = {
  default: null,
  haiku: 'claude-haiku-4-5',
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
    description: 'Adds Claude Fable 5 and pins the Opus, Sonnet, and Haiku aliases to their native RouterLab models.',
    selectionName: 'Claude Native',
    selectionDescription: 'Custom => Claude Fable 5, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5, Haiku and subagents => Claude Haiku 4.5.',
    requiredModels: DEFAULT_CLAUDE_MODELS,
    environment: createModelEnvironment({
      opus: 'claude-opus-5',
      sonnet: 'claude-sonnet-5',
      haiku: 'claude-haiku-4-5',
      subagent: 'claude-fable-5',
    }),
    claudeCodeEnvironment: {
      ANTHROPIC_CUSTOM_MODEL_OPTION: 'claude-fable-5',
      ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: 'Claude Fable 5',
      ...createModelEnvironment({
        opus: 'claude-opus-5',
        sonnet: 'claude-sonnet-5',
        haiku: 'claude-haiku-4-5',
        subagent: 'claude-haiku-4-5',
      }),
    },
  },
  {
    value: 'aws',
    name: 'Claude via AWS',
    description: 'Sets Claude Code model environment variables to AWS-backed Claude variants.',
    selectionName: '💸 Claude via AWS (-50%)',
    selectionDescription: 'Use aws-claude-haiku, aws-claude-sonnet, aws-claude-opus.',
    requiredModels: AWS_CLAUDE_MODELS,
    environment: createModelEnvironment({
      opus: 'aws-claude-opus-5',
      sonnet: 'aws-claude-sonnet-5',
      haiku: 'aws-claude-haiku-4-5',
      subagent: 'aws-claude-haiku-4-5',
    }),
  },
  {
    value: 'claude',
    name: 'Claude',
    description: 'Custom => Claude Fable 5, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5.',
    selectionName: 'Claude',
    selectionDescription: 'Custom => Claude Fable 5, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5.',
    requiredModels: LLM_CLAUDE_MODELS,
    environment: createModelEnvironment({
      opus: 'claude-opus-5',
      sonnet: 'claude-sonnet-5',
      haiku: 'claude-fable-5',
    }),
  },
  {
    value: 'claude-gpt',
    name: 'OpenAI GPT',
    description: 'Opus => GPT 5.6 Sol, Sonnet => GPT 5.6 Terra, Haiku => GPT 5.6 Luna.',
    selectionDescription: 'Opus => GPT 5.6 Sol, Sonnet => GPT 5.6 Terra, Haiku => GPT 5.6 Luna.',
    aliases: ['claude-gpt-5.4'],
    requiredModels: OPENAI_GPT_MODELS,
    environment: createModelEnvironment({
      opus: 'gpt-5.6-sol',
      sonnet: 'gpt-5.6-terra',
      haiku: 'gpt-5.6-luna',
    }),
  },
  {
    value: 'glm-5.1',
    name: 'glm-5.1',
    description: 'Sets all Claude Code model environment variables to claude-glm-5.1.',
    selectionDescription: 'Uses claude-glm-5.1 for all model aliases.',
    requiredModels: ['claude-glm-5.1'],
    environment: createSingleModelEnvironment('claude-glm-5.1'),
  },
  {
    value: 'glm-5.2',
    name: 'glm-5.2',
    description: 'Uses glm-5.2 for all main model aliases.',
    selectionDescription: 'Uses glm-5.2 for Opus, Sonnet, and Haiku.',
    requiredModels: ['glm-5.2', ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODEL],
    environment: createModelEnvironment({
      opus: 'glm-5.2',
      sonnet: 'glm-5.2',
      haiku: 'glm-5.2',
    }),
  },
  {
    value: 'minimax-m3',
    name: 'minimax-m3',
    selectionName: 'minimax-m3',
    description: 'Uses minimax-m3 for all main model aliases.',
    selectionDescription: 'Uses minimax-m3 for Opus, Sonnet, and Haiku.',
    requiredModels: ['minimax-m3', ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODEL],
    environment: createModelEnvironment({
      opus: 'minimax-m3',
      sonnet: 'minimax-m3',
      haiku: 'minimax-m3',
    }),
  },
  {
    value: 'qwen3.8-max',
    name: 'qwen3.8-max',
    selectionName: 'qwen3.8-max',
    description: 'Uses qwen3.8-max for all main model aliases.',
    selectionDescription: 'Uses qwen3.8-max for Opus, Sonnet, and Haiku.',
    requiredModels: ['qwen3.8-max'],
    environment: createModelEnvironment({
      opus: 'qwen3.8-max',
      sonnet: 'qwen3.8-max',
      haiku: 'qwen3.8-max',
    }),
  },
  {
    value: 'grok-4.6',
    name: 'grok-4.6',
    selectionName: 'grok-4.6',
    description: 'Uses grok-4.6 for all main model aliases.',
    selectionDescription: 'Uses grok-4.6 for Opus, Sonnet, and Haiku.',
    requiredModels: ['grok-4.6'],
    environment: createModelEnvironment({
      opus: 'grok-4.6',
      sonnet: 'grok-4.6',
      haiku: 'grok-4.6',
    }),
  },
  {
    value: 'deepseek',
    name: 'DeepSeek V4',
    selectionName: 'DeepSeek V4',
    description: 'Opus and Sonnet => deepseek-v4-pro-0813, Haiku => deepseek-v4-flash-0731.',
    selectionDescription: 'Opus and Sonnet => deepseek-v4-pro-0813, Haiku => deepseek-v4-flash-0731.',
    aliases: ['deepseek-v4', 'claude-deepseek'],
    requiredModels: ['deepseek-v4-pro-0813', 'deepseek-v4-flash-0731'],
    environment: createModelEnvironment({
      opus: 'deepseek-v4-pro-0813',
      sonnet: 'deepseek-v4-pro-0813',
      haiku: 'deepseek-v4-flash-0731',
      subagent: 'deepseek-v4-flash-0731',
    }),
  },
  {
    value: 'kimi-k3',
    name: 'kimi-k3',
    selectionName: 'kimi-k3',
    description: 'Uses kimi-k3 for all main model aliases.',
    selectionDescription: 'Uses kimi-k3 for Opus, Sonnet, and Haiku.',
    requiredModels: ['kimi-k3', ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODEL],
    environment: createModelEnvironment({
      opus: 'kimi-k3',
      sonnet: 'kimi-k3',
      haiku: 'kimi-k3',
    }),
  },
  {
    value: 'deepseek-v4-flash-0731',
    name: 'deepseek-v4-flash-0731',
    selectionName: 'deepseek-v4-flash-0731',
    description: 'Uses deepseek-v4-flash-0731 for all main model aliases.',
    selectionDescription: 'Uses deepseek-v4-flash-0731 for Opus, Sonnet, and Haiku.',
    requiredModels: ['deepseek-v4-flash-0731', ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODEL],
    environment: createModelEnvironment({
      opus: 'deepseek-v4-flash-0731',
      sonnet: 'deepseek-v4-flash-0731',
      haiku: 'deepseek-v4-flash-0731',
    }),
  },
];

function llmSingleModelStrategy(model) {
  return {
    description: `Uses ${model} for all main model aliases. Select a subagent model at launch.`,
    selectionDescription: `Uses ${model} for all main model aliases. Select a subagent model at launch.`,
    requiredModels: [model],
    allowSubagentOverride: false,
    environment: createModelEnvironment({ opus: model, sonnet: model, haiku: model }),
  };
}

const LLM_STRATEGY_OVERRIDES = {
  claude: {
    description: 'Custom and Haiku => Claude Fable 5, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5. Select a subagent model at launch.',
    selectionDescription: 'Custom and Haiku => Claude Fable 5, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5. Select a subagent model at launch.',
    requiredModels: LLM_CLAUDE_MODELS,
    allowSubagentOverride: false,
    claudeCodeEnvironment: {
      ANTHROPIC_CUSTOM_MODEL_OPTION: 'claude-fable-5',
      ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: 'Claude Fable 5',
      ...createModelEnvironment({
        opus: 'claude-opus-5',
        sonnet: 'claude-sonnet-5',
        haiku: 'claude-fable-5',
      }),
    },
    environment: createModelEnvironment({
      opus: 'claude-opus-5',
      sonnet: 'claude-sonnet-5',
      haiku: 'claude-fable-5',
    }),
  },
  'claude-gpt': {
    description: 'Opus => GPT 5.6 Sol, Sonnet => GPT 5.6 Terra, Haiku => GPT 5.6 Luna. Select a subagent model at launch.',
    selectionDescription: 'Opus => GPT 5.6 Sol, Sonnet => GPT 5.6 Terra, Haiku => GPT 5.6 Luna. Select a subagent model at launch.',
    requiredModels: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    allowSubagentOverride: false,
    environment: createModelEnvironment({
      opus: 'gpt-5.6-sol',
      sonnet: 'gpt-5.6-terra',
      haiku: 'gpt-5.6-luna',
    }),
  },
  'glm-5.2': {
    description: 'Uses glm-5.2 for all main model aliases. Select a subagent model at launch.',
    selectionDescription: 'Uses glm-5.2 for all main model aliases. Select a subagent model at launch.',
    requiredModels: ['glm-5.2'],
    allowSubagentOverride: false,
    environment: createModelEnvironment({
      opus: 'glm-5.2',
      sonnet: 'glm-5.2',
      haiku: 'glm-5.2',
    }),
  },
  'qwen3.8-max': llmSingleModelStrategy('qwen3.8-max'),
  'minimax-m3': llmSingleModelStrategy('minimax-m3'),
  'grok-4.6': llmSingleModelStrategy('grok-4.6'),
  deepseek: {
    description: 'Opus and Sonnet => deepseek-v4-pro-0813, Haiku => deepseek-v4-flash-0731. Select a subagent model at launch.',
    selectionDescription: 'Opus and Sonnet => deepseek-v4-pro-0813, Haiku => deepseek-v4-flash-0731. Select a subagent model at launch.',
    requiredModels: ['deepseek-v4-pro-0813', 'deepseek-v4-flash-0731'],
    allowSubagentOverride: false,
    environment: createModelEnvironment({
      opus: 'deepseek-v4-pro-0813',
      sonnet: 'deepseek-v4-pro-0813',
      haiku: 'deepseek-v4-flash-0731',
    }),
  },
  'deepseek-v4-flash-0731': llmSingleModelStrategy('deepseek-v4-flash-0731'),
};

export function normalizeStrategyValue(strategyValue) {
  if (strategyValue === 'claude-gpt-5.4') {
    return 'claude-gpt';
  }
  if (strategyValue === 'deepseek-v4' || strategyValue === 'claude-deepseek') {
    return 'deepseek';
  }
  return strategyValue;
}

export function getServiceStrategies(serviceValue = DEFAULT_SERVICE) {
  const service = requireServiceConfig(serviceValue);
  return service.strategyValues
    .map((value) => {
      const strategy = STRATEGIES.find((entry) => entry.value === value);
      if (service.value === 'llm' && strategy) {
        return {
          ...strategy,
          ...(LLM_STRATEGY_OVERRIDES[strategy.value] ?? {}),
          allowSubagentOverride: false,
        };
      }
      return strategy ? { ...strategy, allowSubagentOverride: false } : strategy;
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

  const env = strategy.claudeCodeNative
    ? {}
    : { ...(strategy.claudeCodeEnvironment ?? strategy.environment ?? {}) };
  if (!env.CLAUDE_CODE_SUBAGENT_MODEL) {
    if (normalizeServiceValue(serviceValue) === 'llm') {
      env.CLAUDE_CODE_SUBAGENT_MODEL = LLM_CLAUDE_CODE_SUBAGENT_MODEL;
    } else {
      env.CLAUDE_CODE_SUBAGENT_MODEL = ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODEL;
    }
  }
  return applySubagentModelOverride(strategy, env, options);
}

export function getAuthorizedClaudeCodeModels(serviceValue = DEFAULT_SERVICE) {
  const modelKeys = [
    'ANTHROPIC_CUSTOM_MODEL_OPTION',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'CLAUDE_CODE_SUBAGENT_MODEL',
  ];
  const models = new Set();
  for (const strategy of getServiceStrategies(serviceValue)) {
    const environment = getClaudeCodeStrategyEnvironment(strategy.value, serviceValue);
    for (const key of modelKeys) {
      const model = environment[key]?.trim();
      if (model) models.add(model);
    }
  }
  if (normalizeServiceValue(serviceValue) === 'llm') {
    for (const model of LLM_CLAUDE_CODE_SUBAGENT_MODELS) models.add(model);
  }
  return [...models];
}

export function isSupportedClaudeCodeSubagentModel(model, serviceValue = DEFAULT_SERVICE) {
  return normalizeServiceValue(serviceValue) === 'llm'
    && LLM_CLAUDE_CODE_SUBAGENT_MODELS.includes(String(model ?? '').trim());
}

export function allowsSubagentModelOverride(strategyValue, serviceValue = DEFAULT_SERVICE) {
  const strategy = findStrategy(strategyValue, serviceValue);
  if (!strategy) {
    throw new Error(`Unknown strategy "${strategyValue}" for service "${serviceValue}".`);
  }
  return strategy.allowSubagentOverride !== false;
}

export function applySubagentModelOverride(strategy, env, options = {}) {
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
  if (strategy.claudeCodeDisabledReason) {
    return {
      available: false,
      level: 'unavailable',
      note: strategy.claudeCodeDisabledReason,
      strategy,
    };
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
