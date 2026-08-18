import { getServiceStrategies, getStrategyEnvironment } from './strategies.js';

export const STRATEGY_MODEL_KEYS = [
  ['haiku', 'ANTHROPIC_DEFAULT_HAIKU_MODEL'],
  ['sonnet', 'ANTHROPIC_DEFAULT_SONNET_MODEL'],
  ['opus', 'ANTHROPIC_DEFAULT_OPUS_MODEL'],
  ['subagent', 'CLAUDE_CODE_SUBAGENT_MODEL'],
];

export const DESKTOP_MAPPING_STRATEGIES = {
  routerlab: [
    'default',
    'aws',
    'claude-gpt',
    'deepseek-v4-flash-0731',
    'glm-5.2',
    'minimax-m3',
  ],
  llm: [
    'claude',
    'claude-gpt',
    'qwen3.8-max',
    'minimax-m3',
    'grok-4.6',
    'glm-5.2',
    'deepseek',
  ],
};

const DEFAULT_NATIVE_STRATEGY_MODELS = [
  { role: 'fable', model: 'claude-fable-5' },
  { role: 'opus', model: 'claude-opus-5' },
  { role: 'sonnet', model: 'claude-sonnet-5' },
  { role: 'haiku', model: 'claude-haiku-4-5-20251001' },
];

const DESKTOP_ROUTE_PREFIX_BY_ROLE = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
};

export const MODEL_ROUTE_METADATA = {
  'claude-fable-5': {
    desktopRouteId: 'claude-fable-5',
    label: 'claude-fable-5',
  },
  'claude-opus-5': {
    desktopRouteId: 'claude-opus-5',
    label: 'claude-opus-5',
  },
  'claude-sonnet-5': {
    desktopRouteId: 'claude-sonnet-5',
    label: 'claude-sonnet-5',
  },
  'claude-haiku-4-5-20251001': {
    desktopRouteId: 'claude-haiku-4-5',
    label: 'claude-haiku-4-5',
    supports1m: false,
  },
  'claude-haiku-4-5': {
    desktopRouteId: 'claude-haiku-4-5',
    label: 'claude-haiku-4-5',
    supports1m: false,
  },
  'claude-sonnet-4-6': {
    desktopRouteId: 'claude-sonnet-4-6',
    label: 'claude-sonnet-4-6',
  },
  'claude-opus-4-8': {
    desktopRouteId: 'claude-opus-4-8',
    label: 'claude-opus-4-8',
  },
  'claude-opus-4-7': {
    desktopRouteId: 'claude-opus-4-8',
    label: 'claude-opus-4-8',
  },
  'aws-claude-haiku-4-5-20251001': {
    desktopRouteId: 'aws-claude-haiku-4-5',
    label: 'aws-claude-haiku-4-5',
    supports1m: false,
  },
  'aws-claude-haiku-4-5': {
    desktopRouteId: 'aws-claude-haiku-4-5',
    label: 'aws-claude-haiku-4-5',
    supports1m: false,
  },
  'aws-claude-sonnet-4-6': {
    desktopRouteId: 'aws-claude-sonnet-4-6',
    label: 'aws-claude-sonnet-4-6',
  },
  'aws-claude-opus-4-8': {
    desktopRouteId: 'aws-claude-opus-4-8',
    label: 'aws-claude-opus-4-8',
  },
  'aws-claude-sonnet-5': {
    desktopRouteId: 'aws-claude-sonnet-5',
    label: 'aws-claude-sonnet-5',
  },
  'aws-claude-opus-5': {
    desktopRouteId: 'aws-claude-opus-5',
    label: 'aws-claude-opus-5',
  },
  'claude-gpt-5.5': {
    desktopRouteId: 'claude-5.5',
    label: 'gpt-5.5',
    codexModel: 'gpt-5.5',
    codexDisplayName: 'GPT 5.5',
  },
  'gpt-5.5': {
    desktopRouteId: 'claude-5.5',
    label: 'gpt-5.5',
    codexModel: 'gpt-5.5',
    codexDisplayName: 'GPT 5.5',
  },
  'claude-gpt-5.4': {
    desktopRouteId: 'claude-5.4',
    label: 'gpt-5.4',
    codexModel: 'gpt-5.4',
    codexDisplayName: 'GPT 5.4',
  },
  'gpt-5.4': {
    desktopRouteId: 'claude-5.4',
    label: 'gpt-5.4',
    codexModel: 'gpt-5.4',
    codexDisplayName: 'GPT 5.4',
  },
  'claude-gpt-5.4-mini': {
    desktopRouteId: 'claude-5.4-mini',
    label: 'gpt-5.4-mini',
    codexModel: 'gpt-5.4-mini',
    codexDisplayName: 'GPT 5.4 mini',
    supports1m: false,
  },
  'gpt-5.4-mini': {
    desktopRouteId: 'claude-5.4-mini',
    label: 'gpt-5.4-mini',
    codexModel: 'gpt-5.4-mini',
    codexDisplayName: 'GPT 5.4 mini',
    supports1m: false,
  },
  'gpt-5.6-sol': {
    desktopRouteId: 'claude-5.6-sol',
    label: 'gpt-5.6-sol',
    codexModel: 'gpt-5.6-sol',
    codexDisplayName: 'GPT 5.6 Sol',
  },  'gpt-5.6-sol-pro': {
    desktopRouteId: 'claude-5.6-sol-pro',
    label: 'gpt-5.6-sol-pro',
    codexModel: 'gpt-5.6-sol-pro',
    codexDisplayName: 'GPT 5.6 Sol Pro',
  },
  'gpt-5.6-terra': {
    desktopRouteId: 'claude-5.6-terra',
    label: 'gpt-5.6-terra',
    codexModel: 'gpt-5.6-terra',
    codexDisplayName: 'GPT 5.6 Terra',
  },  'gpt-5.6-terra-pro': {
    desktopRouteId: 'claude-5.6-terra-pro',
    label: 'gpt-5.6-terra-pro',
    codexModel: 'gpt-5.6-terra-pro',
    codexDisplayName: 'GPT 5.6 Terra Pro',
  },
  'gpt-5.6-luna': {
    desktopRouteId: 'claude-5.6-luna',
    label: 'gpt-5.6-luna',
    codexModel: 'gpt-5.6-luna',
    codexDisplayName: 'GPT 5.6 Luna',
  },
  'claude-deepseek-v4-pro': {
    desktopRouteId: 'claude-deev4-pro',
    label: 'deepseek-v4-pro',
    codexModel: 'deepseek-v4-pro',
    codexDisplayName: 'DeepSeek V4 Pro',
  },
  'deepseek-v4-pro': {
    desktopRouteId: 'claude-deev4-pro',
    label: 'deepseek-v4-pro',
    codexModel: 'deepseek-v4-pro',
    codexDisplayName: 'DeepSeek V4 Pro',
  },
  'claude-deepseek-v4-flash': {
    desktopRouteId: 'claude-deev4-flash',
    label: 'deepseek-v4-flash',
    codexModel: 'deepseek-v4-flash',
    codexDisplayName: 'DeepSeek V4 Flash',
  },
  'deepseek-v4-flash': {
    desktopRouteId: 'claude-deev4-flash',
    label: 'deepseek-v4-flash',
    codexModel: 'deepseek-v4-flash',
    codexDisplayName: 'DeepSeek V4 Flash',
  },
  'claude-MiniMax-M3': {
    desktopRouteId: 'claude-max-m3',
    label: 'MiniMax-M3',
    codexModel: 'MiniMax-M3',
    codexDisplayName: 'MiniMax M3',
  },
  'MiniMax-M3': {
    desktopRouteId: 'claude-max-m3',
    label: 'MiniMax-M3',
    codexModel: 'MiniMax-M3',
    codexDisplayName: 'MiniMax M3',
  },
  'minimax-m3': {
    desktopRouteId: 'claude-max-m3',
    label: 'minimax-m3',
    codexModel: 'minimax-m3',
    codexDisplayName: 'MiniMax M3',
  },
  'claude-qwen3.7-max': {
    desktopRouteId: 'claude-wen3.7-max',
    label: 'qwen3.7-max',
    codexModel: 'qwen3.7-max',
    codexDisplayName: 'Qwen 3.7 Max',
  },
  'qwen3.7-max': {
    desktopRouteId: 'claude-wen3.7-max',
    label: 'qwen3.7-max',
    codexModel: 'qwen3.7-max',
    codexDisplayName: 'Qwen 3.7 Max',
  },
  'qwen3.8-max': {
    desktopRouteId: 'claude-wen3.8-max',
    label: 'qwen3.8-max',
    codexModel: 'qwen3.8-max',
    codexDisplayName: 'Qwen 3.8 Max',
  },
  'claude-qwen3.6-flash': {
    desktopRouteId: 'claude-wen3.6-flash',
    label: 'qwen3.6-flash',
    codexModel: 'qwen3.6-flash',
    codexDisplayName: 'Qwen 3.6 Flash',
  },
  'claude-kimi-k2.7-code': {
    desktopRouteId: 'claude-kim2.7-code',
    label: 'kimi-k2.7-code',
    codexModel: 'kimi-k2.7-code',
    codexDisplayName: 'Kimi K2.7 Code',
    supports1m: false,
  },
  'kimi-k2.7-code': {
    desktopRouteId: 'claude-kim2.7-code',
    label: 'kimi-k2.7-code',
    codexModel: 'kimi-k2.7-code',
    codexDisplayName: 'Kimi K2.7 Code',
    supports1m: false,
  },
  'kimi-k2.7': {
    desktopRouteId: 'claude-kim2.7',
    label: 'kimi-k2.7',
    codexModel: 'kimi-k2.7',
    codexDisplayName: 'Kimi K2.7',
    supports1m: false,
  },
  'deepseek-v4-pro-0813': {
    desktopRouteId: 'claude-deev4-pro-0813',
    label: 'deepseek-v4-pro-0813',
    codexModel: 'deepseek-v4-pro-0813',
    codexDisplayName: 'DeepSeek V4 Pro 0813',
  },
  'deepseek-v4-flash-0731': {
    desktopRouteId: 'claude-deev4-flash-0731',
    label: 'deepseek-v4-flash-0731',
    codexModel: 'deepseek-v4-flash-0731',
    codexDisplayName: 'DeepSeek V4 Flash 0731',
  },
  'grok-4.6': {
    desktopRouteId: 'claude-rok4.6',
    label: 'grok-4.6',
    codexModel: 'grok-4.6',
    codexDisplayName: 'Grok 4.6',
  },
  'claude-glm-5.1': {
    desktopRouteId: 'claude-lm5.1',
    label: 'glm-5.1',
    codexModel: 'glm-5.1',
    codexDisplayName: 'GLM 5.1',
    supports1m: false,
  },
  'claude-glm-5.2': {
    desktopRouteId: 'claude-lm5.2',
    label: 'glm-5.2',
    codexModel: 'glm-5.2',
    codexDisplayName: 'GLM 5.2',
    supports1m: false,
  },
  'glm-5.2': {
    desktopRouteId: 'claude-lm5.2',
    label: 'glm-5.2',
    codexModel: 'glm-5.2',
    codexDisplayName: 'GLM 5.2',
    supports1m: false,
  },
};

export const DESKTOP_MODEL_ORDER = [
  'claude-fable-5',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'aws-claude-opus-5',
  'aws-claude-sonnet-5',
  'aws-claude-haiku-4-5',
  'aws-claude-opus-4-8',
  'aws-claude-sonnet-4-6',
  'claude-5.6-sol',
  'claude-5.6-terra',
  'claude-5.6-luna',
  'claude-5.5',
  'claude-5.4',
  'claude-5.4-mini',
  'claude-lm5.2',
  'claude-wen3.8-max',
  'claude-max-m3',
  'claude-rok4.6',
  'claude-deev4-pro-0813',
  'claude-deev4-flash-0731',
  'claude-wen3.7-max',
  'claude-wen3.6-flash',
  'claude-deev4-pro',
  'claude-deev4-flash',
  'claude-kim2.7',
  'claude-kim2.7-code',
  'claude-lm5.1',
];

const CODEX_DISPLAY_NAMES = new Map([
  ...Object.values(MODEL_ROUTE_METADATA)
    .filter((entry) => entry.codexModel)
    .map((entry) => [entry.codexModel, entry.codexDisplayName ?? entry.label ?? entry.codexModel]),
  ['gpt-5.6-terra', 'GPT 5.6 Terra'],
  ['gpt-5.6-sol', 'GPT 5.6 Sol'],
  ['gpt-5.6-luna', 'GPT 5.6 Luna'],
  ['gpt-5.6-terra-pro', 'GPT 5.6 Terra Pro'],
  ['gpt-5.6-sol-pro', 'GPT 5.6 Sol Pro'],
  ['grok-4.6', 'Grok 4.6'],
  ['deepseek-v4-pro-0813', 'DeepSeek V4 Pro 0813'],
  ['minimax-m3', 'MiniMax M3'],
]);

export function getStrategyModels(strategyValue, serviceValue) {
  const env = getStrategyEnvironment(strategyValue, serviceValue);
  const seen = new Set();
  const models = [];

  if (Object.keys(env).length === 0 && strategyValue === 'default') {
    return DEFAULT_NATIVE_STRATEGY_MODELS;
  }

  for (const [role, key] of STRATEGY_MODEL_KEYS) {
    const model = env[key]?.trim();
    if (model && !seen.has(model)) {
      seen.add(model);
      models.push({ role, model });
    }
  }

  return models;
}

export function codexModelsFromClaudeCodeStrategies(serviceValue) {
  const seen = new Set();
  const models = [];

  for (const strategy of getServiceStrategies(serviceValue)) {
    for (const model of getCodexCandidateModels(strategy.value, serviceValue)) {
      const codexModel = codexModelFromClaudeCodeModel(model);
      if (codexModel && !seen.has(codexModel)) {
        seen.add(codexModel);
        models.push(codexModel);
      }
    }
  }

  return models;
}

function getCodexCandidateModels(strategyValue, serviceValue) {
  const env = getStrategyEnvironment(strategyValue, serviceValue);
  if (Object.keys(env).length === 0 && strategyValue === 'default') {
    return DEFAULT_NATIVE_STRATEGY_MODELS.map((entry) => entry.model);
  }
  return Object.values(env).map((model) => model?.trim()).filter(Boolean);
}

export function codexModelFromClaudeCodeModel(model) {
  const value = model?.trim();
  if (!value || isClaudeFamilyModel(value)) {
    return null;
  }
  return MODEL_ROUTE_METADATA[value]?.codexModel ?? value.replace(/^claude-/, '');
}

export function codexModelDisplayName(model) {
  return CODEX_DISPLAY_NAMES.get(model) ?? model;
}

export function supportsOneMillionContext(model) {
  const metadata = MODEL_ROUTE_METADATA[model.trim()];
  return metadata?.supports1m ?? true;
}

export function desktopRouteIdForStrategyModel(role, upstreamModel, suffix = null) {
  const metadata = MODEL_ROUTE_METADATA[upstreamModel];
  if (metadata?.desktopRouteId) {
    return metadata.desktopRouteId;
  }

  const prefix = DESKTOP_ROUTE_PREFIX_BY_ROLE[role] ?? DESKTOP_ROUTE_PREFIX_BY_ROLE.sonnet;
  return suffix ? `${prefix}-${suffix}` : prefix;
}

export function desktopLabelForStrategyModel(upstreamModel) {
  return MODEL_ROUTE_METADATA[upstreamModel]?.label ?? upstreamModel;
}

export function desktopLabelForDesktopMapping(strategyLabel, upstreamModel) {
  return MODEL_ROUTE_METADATA[upstreamModel]?.label ?? `${strategyLabel} - ${upstreamModel}`;
}

export function sortDesktopRoutes(routes) {
  const order = new Map(DESKTOP_MODEL_ORDER.map((routeId, index) => [routeId, index]));
  return [...routes].sort((left, right) => (
    (order.get(left.routeId) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right.routeId) ?? Number.MAX_SAFE_INTEGER)
  ));
}

export function isClaudeFamilyModel(model) {
  const normalized = model.toLowerCase();
  return normalized.startsWith('claude-fable-')
    || normalized.startsWith('claude-haiku-')
    || normalized.startsWith('claude-sonnet-')
    || normalized.startsWith('claude-opus-')
    || normalized.startsWith('aws-claude-')
    || normalized.startsWith('anthropic/claude-')
    || normalized.startsWith('cursor-aws-');
}
