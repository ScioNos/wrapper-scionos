import { DEFAULT_SERVICE, normalizeServiceValue, requireServiceConfig } from './services.js';

export const ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODEL = 'aws-claude-haiku-4-5';
export const LLM_CLAUDE_CODE_SUBAGENT_MODEL = 'claude-haiku-4-5';
const OPEN_SOURCE_MODEL_MAP = Object.freeze({
  fable: 'deepseek-v4.1-flash',
  haiku: 'glm-5.3-flash',
  sonnet: 'glm-5.3',
  opus: 'qwen3.8-max',
  subagent: 'kimi-k3',
});
export const OPEN_SOURCE_MODELS = Object.values(OPEN_SOURCE_MODEL_MAP);
export const ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODELS = [
  'claude-haiku-4-5',
  'aws-claude-haiku-4-5',
  'gpt-5.6-luna',
  'deepseek-v4.1-flash',
];
export const LLM_CLAUDE_CODE_SUBAGENT_MODELS = [
  'claude-haiku-4-5',
  'glm-5.3-flash',
  'deepseek-v4.1-flash',
  'gpt-5.6-luna',
];

export const DEFAULT_CLAUDE_MODELS = [
  'claude-fable-5.1',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
];

export const LLM_CLAUDE_MODELS = [
  'claude-fable-5',
  'claude-haiku-4-5',
  'claude-opus-5',
  'claude-sonnet-5',
];

export const AWS_CLAUDE_MODELS = [
  'aws-claude-haiku-4-5',
  'aws-claude-sonnet-5',
  'aws-claude-opus-5',
];

export const OPENAI_GPT_MODELS = [
  'gpt-6-astra',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'gpt-5.6-sol',
];

const LLM_DIVERS_MODEL_MAP = Object.freeze({
  fable: 'deepseek-v4.1-flash',
  haiku: 'gemini-3.8-flash',
  sonnet: 'glm-5.3',
  opus: 'glm-5.3-flash',
});

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

export const STRATEGIES = [
  {
    value: 'default',
    name: 'Claude Native',
    description: 'Adds Claude Fable 5.1 and pins the Opus, Sonnet, and Haiku aliases to their native RouterLab models.',
    selectionName: 'Claude Native',
    selectionDescription: 'Fable => Claude Fable 5.1, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5, Haiku and subagents => Claude Haiku 4.5.',
    requiredModels: DEFAULT_CLAUDE_MODELS,
    environment: createModelEnvironment({
      opus: 'claude-opus-5',
      sonnet: 'claude-sonnet-5',
      haiku: 'claude-haiku-4-5',
      subagent: 'claude-fable-5.1',
    }),
    claudeCodeEnvironment: {
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5.1',
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
    description: 'Fable => GPT 6 Astra, Haiku => GPT 5.6 Luna, Sonnet => GPT 5.6 Terra, Opus => GPT 5.6 Sol.',
    selectionDescription: 'Fable => GPT 6 Astra, Haiku => GPT 5.6 Luna, Sonnet => GPT 5.6 Terra, Opus => GPT 5.6 Sol.',
    aliases: ['claude-gpt-5.4'],
    requiredModels: OPENAI_GPT_MODELS,
    environment: createModelEnvironment({
      opus: 'gpt-5.6-sol',
      sonnet: 'gpt-5.6-terra',
      haiku: 'gpt-5.6-luna',
    }),
    claudeCodeEnvironment: {
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'gpt-6-astra',
      ...createModelEnvironment({
        opus: 'gpt-5.6-sol',
        sonnet: 'gpt-5.6-terra',
        haiku: 'gpt-5.6-luna',
        subagent: 'gpt-5.6-luna',
      }),
    },
  },
  {
    value: 'open-source',
    name: 'Open Source',
    selectionName: 'Open Source',
    description: 'Fable => DeepSeek V4.1 Flash, Haiku => GLM 5.3 Flash, Sonnet => GLM 5.3, Opus => Qwen 3.8 Max, subagent => Kimi K3.',
    selectionDescription: 'Fable => DeepSeek V4.1 Flash, Haiku => GLM 5.3 Flash, Sonnet => GLM 5.3, Opus => Qwen 3.8 Max, subagent => Kimi K3.',
    requiredModels: OPEN_SOURCE_MODELS,
    claudeCodeEnvironment: {
      ANTHROPIC_DEFAULT_FABLE_MODEL: OPEN_SOURCE_MODEL_MAP.fable,
      ...createModelEnvironment({
        opus: OPEN_SOURCE_MODEL_MAP.opus,
        sonnet: OPEN_SOURCE_MODEL_MAP.sonnet,
        haiku: OPEN_SOURCE_MODEL_MAP.haiku,
        subagent: OPEN_SOURCE_MODEL_MAP.subagent,
      }),
    },
    environment: {
      ANTHROPIC_DEFAULT_FABLE_MODEL: OPEN_SOURCE_MODEL_MAP.fable,
      ...createModelEnvironment({
        opus: OPEN_SOURCE_MODEL_MAP.opus,
        sonnet: OPEN_SOURCE_MODEL_MAP.sonnet,
        haiku: OPEN_SOURCE_MODEL_MAP.haiku,
      }),
    },
  },
  {
    value: 'divers',
    name: 'Divers',
    selectionName: 'Divers',
    description: 'Fable => DeepSeek V4.1 Flash, Haiku => Gemini 3.8 Flash, Sonnet => GLM 5.3, Opus => GLM 5.3 Flash.',
    selectionDescription: 'Fable => DeepSeek V4.1 Flash, Haiku => Gemini 3.8 Flash, Sonnet => GLM 5.3, Opus => GLM 5.3 Flash.',
    requiredModels: Object.values(LLM_DIVERS_MODEL_MAP),
    environment: {
      ANTHROPIC_DEFAULT_FABLE_MODEL: LLM_DIVERS_MODEL_MAP.fable,
      ...createModelEnvironment({
        opus: LLM_DIVERS_MODEL_MAP.opus,
        sonnet: LLM_DIVERS_MODEL_MAP.sonnet,
        haiku: LLM_DIVERS_MODEL_MAP.haiku,
      }),
    },
  },
];

const LLM_STRATEGY_OVERRIDES = {
  claude: {
    description: 'Fable => Claude Fable 5, Haiku => Claude Haiku 4.5, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5. Select a subagent model at launch.',
    selectionDescription: 'Fable => Claude Fable 5, Haiku => Claude Haiku 4.5, Opus => Claude Opus 5, Sonnet => Claude Sonnet 5. Select a subagent model at launch.',
    requiredModels: LLM_CLAUDE_MODELS,
    allowSubagentOverride: false,
    claudeCodeEnvironment: {
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-fable-5',
      ...createModelEnvironment({
        opus: 'claude-opus-5',
        sonnet: 'claude-sonnet-5',
        haiku: 'claude-haiku-4-5',
      }),
    },
    environment: createModelEnvironment({
      opus: 'claude-opus-5',
      sonnet: 'claude-sonnet-5',
      haiku: 'claude-fable-5',
    }),
  },
  'claude-gpt': {
    description: 'Fable => GPT 6 Astra, Haiku => GPT 5.6 Luna, Sonnet => GPT 5.6 Terra, Opus => GPT 5.6 Sol. Select a subagent model at launch.',
    selectionDescription: 'Fable => GPT 6 Astra, Haiku => GPT 5.6 Luna, Sonnet => GPT 5.6 Terra, Opus => GPT 5.6 Sol. Select a subagent model at launch.',
    requiredModels: ['gpt-6-astra', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'],
    allowSubagentOverride: false,
    environment: createModelEnvironment({
      opus: 'gpt-5.6-sol',
      sonnet: 'gpt-5.6-terra',
      haiku: 'gpt-5.6-luna',
    }),
    claudeCodeEnvironment: {
      ANTHROPIC_DEFAULT_FABLE_MODEL: 'gpt-6-astra',
      ...createModelEnvironment({
        opus: 'gpt-5.6-sol',
        sonnet: 'gpt-5.6-terra',
        haiku: 'gpt-5.6-luna',
      }),
    },
  },
  divers: {
    description: 'Fable => DeepSeek V4.1 Flash, Haiku => Gemini 3.8 Flash, Sonnet => GLM 5.3, Opus => GLM 5.3 Flash. Select a subagent model at launch.',
    selectionDescription: 'Fable => DeepSeek V4.1 Flash, Haiku => Gemini 3.8 Flash, Sonnet => GLM 5.3, Opus => GLM 5.3 Flash. Select a subagent model at launch.',
    requiredModels: Object.values(LLM_DIVERS_MODEL_MAP),
    allowSubagentOverride: false,
    environment: {
      ANTHROPIC_DEFAULT_FABLE_MODEL: LLM_DIVERS_MODEL_MAP.fable,
      ...createModelEnvironment({
        opus: LLM_DIVERS_MODEL_MAP.opus,
        sonnet: LLM_DIVERS_MODEL_MAP.sonnet,
        haiku: LLM_DIVERS_MODEL_MAP.haiku,
      }),
    },
    claudeCodeEnvironment: {
      ANTHROPIC_DEFAULT_FABLE_MODEL: LLM_DIVERS_MODEL_MAP.fable,
      ...createModelEnvironment({
        opus: LLM_DIVERS_MODEL_MAP.opus,
        sonnet: LLM_DIVERS_MODEL_MAP.sonnet,
        haiku: LLM_DIVERS_MODEL_MAP.haiku,
      }),
    },
  },
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

export function getClaudeCodeSubagentModels(serviceValue = DEFAULT_SERVICE) {
  return normalizeServiceValue(serviceValue) === 'llm'
    ? LLM_CLAUDE_CODE_SUBAGENT_MODELS
    : ROUTERLAB_CLAUDE_CODE_SUBAGENT_MODELS;
}

export function getAuthorizedClaudeCodeModels(serviceValue = DEFAULT_SERVICE) {
  const modelKeys = [
    'ANTHROPIC_CUSTOM_MODEL_OPTION',
    'ANTHROPIC_DEFAULT_FABLE_MODEL',
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
  for (const model of getClaudeCodeSubagentModels(serviceValue)) {
    models.add(model);
  }
  return [...models];
}

export function isSupportedClaudeCodeSubagentModel(model, serviceValue = DEFAULT_SERVICE) {
  const normalized = String(model ?? '').trim();
  return getClaudeCodeSubagentModels(serviceValue).includes(normalized);
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

export function getRequiredModels(strategy) {
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
