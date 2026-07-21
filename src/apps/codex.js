import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { detectCodexCli, MINIMUM_CODEX_VERSION } from '../platform/detect.js';
import { runInteractiveCli } from '../platform/process.js';
import { codexModelDisplayName } from '../routerlab/strategy-models.js';

export { codexModelDisplayName };

export const CODEX_ROUTERLAB_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'deepseek-v4-pro',
  'kimi-k2.7-code',
  'glm-5.2',
];
export const CODEX_LLM_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'kimi-k3',
  'grok-4.5',
  'MiniMax-M3',
];

export const DEFAULT_CODEX_MODEL = CODEX_ROUTERLAB_MODELS[0];
export const DEFAULT_CODEX_LLM_MODEL = CODEX_LLM_MODELS[0];
export const CODEX_LLM_MODEL_NOTICES = new Map();
export const CODEX_MODEL_CATALOG_FILENAME = 'wrapper-scionos-model-catalog.json';
export const CODEX_CONFIG_BACKUP_FILENAME = 'config.toml.wrapper-scionos-backup';
export const CODEX_RUNTIME_MODEL_CATALOG_DIR = 'wrapper-scionos-codex';
export const CODEX_FALLBACK_CONTEXT_WINDOW = 128000;
const CODEX_FALLBACK_BASE_INSTRUCTIONS = 'You are Codex, a coding agent. Follow the active system, developer, and user instructions.';
const CODEX_REASONING_DESCRIPTIONS = {
  none: 'Disables additional reasoning',
  low: 'Fast responses with lighter reasoning',
  medium: 'Balances speed and reasoning depth for everyday tasks',
  high: 'Greater reasoning depth for complex problems',
  xhigh: 'Extra high reasoning depth for complex problems',
  max: 'Maximum reasoning depth for the hardest problems',
  ultra: 'Maximum reasoning with automatic task delegation',
};

function codexReasoningLevels(...efforts) {
  return efforts.map((effort) => ({ effort, description: CODEX_REASONING_DESCRIPTIONS[effort] }));
}

const CODEX_FALLBACK_REASONING_LEVELS = codexReasoningLevels('low', 'medium', 'high');
const CODEX_REASONING_PROFILES = new Map([
  ['gpt-5.6-sol', {
    defaultLevel: 'low',
    levels: codexReasoningLevels('low', 'medium', 'high', 'xhigh', 'max', 'ultra'),
  }],
  ['gpt-5.6-terra', {
    defaultLevel: 'medium',
    levels: codexReasoningLevels('low', 'medium', 'high', 'xhigh', 'max', 'ultra'),
  }],
  ['gpt-5.6-luna', {
    defaultLevel: 'medium',
    levels: codexReasoningLevels('low', 'medium', 'high', 'xhigh', 'max'),
  }],
  ['deepseek-v4-pro', {
    defaultLevel: 'high',
    levels: codexReasoningLevels('none', 'high', 'max'),
  }],
  ['kimi-k2.7-code', {
    defaultLevel: 'high',
    levels: codexReasoningLevels('high'),
  }],
  ['glm-5.2', {
    defaultLevel: 'high',
    levels: codexReasoningLevels('none', 'high'),
  }],
  ['kimi-k3', {
    defaultLevel: 'max',
    levels: codexReasoningLevels('low', 'high', 'max'),
  }],
  ['grok-4.5', {
    defaultLevel: 'high',
    levels: codexReasoningLevels('low', 'medium', 'high'),
  }],
  ['MiniMax-M3', {
    defaultLevel: 'high',
    levels: codexReasoningLevels('none', 'high'),
  }],
]);

// Context and modality fallbacks stay aligned with cc-switch's conservative
// RouterLab presets. Model-specific capabilities live here until verified metadata wins.
const CODEX_MODEL_PROFILES = new Map([
  ['gpt-5.6-sol', {
    contextWindow: 372000,
    inputModalities: ['text', 'image'],
    supportsReasoning: true,
    supportsParallelToolCalls: true,
  }],
  ['gpt-5.6-terra', {
    contextWindow: 372000,
    inputModalities: ['text', 'image'],
    supportsReasoning: true,
    supportsParallelToolCalls: true,
  }],
  ['gpt-5.6-luna', {
    contextWindow: 372000,
    inputModalities: ['text', 'image'],
    supportsReasoning: true,
    supportsParallelToolCalls: true,
  }],
  ['deepseek-v4-pro', {
    contextWindow: 1000000,
    inputModalities: ['text'],
    supportsReasoning: true,
    supportsParallelToolCalls: false,
  }],
  ['kimi-k2.7-code', {
    contextWindow: 262144,
    inputModalities: ['text', 'image'],
    supportsReasoning: true,
    supportsParallelToolCalls: false,
  }],
  ['glm-5.2', {
    contextWindow: 200000,
    inputModalities: ['text'],
    supportsReasoning: true,
    supportsParallelToolCalls: false,
  }],
  ['kimi-k3', {
    contextWindow: 1048576,
    inputModalities: ['text', 'image'],
    supportsReasoning: true,
    supportsParallelToolCalls: false,
  }],
  ['grok-4.5', {
    contextWindow: 500000,
    inputModalities: ['text', 'image'],
    supportsReasoning: true,
    supportsParallelToolCalls: true,
  }],
  ['MiniMax-M3', {
    contextWindow: 1000000,
    inputModalities: ['text', 'image'],
    supportsReasoning: true,
    supportsParallelToolCalls: true,
    baseInstructions: 'You are Codex, a coding agent based on MiniMax-M3. You and the user share the same workspace and collaborate to achieve the user\'s goals.',
  }],
]);

export function getCodexPaths(env = process.env) {
  const configDir = env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return {
    configDir,
    authPath: path.join(configDir, 'auth.json'),
    configPath: path.join(configDir, 'config.toml'),
    backupPath: path.join(configDir, CODEX_CONFIG_BACKUP_FILENAME),
    modelsCachePath: path.join(configDir, 'models_cache.json'),
    modelCatalogPath: path.join(configDir, CODEX_MODEL_CATALOG_FILENAME),
  };
}

export function buildCodexThirdPartyConfig({
  providerName = 'routerlab',
  baseUrl,
  model = DEFAULT_CODEX_MODEL,
  modelCatalogPath = null,
}) {
  const q = (value) => JSON.stringify(value);
  return [
    'model_provider = "custom"',
    `model = ${q(model)}`,
    ...(modelCatalogPath ? [`model_catalog_json = ${q(modelCatalogPath)}`] : []),
    '',
    '[model_providers.custom]',
    `name = ${q(providerName)}`,
    `base_url = ${q(baseUrl)}`,
    'wire_api = "responses"',
    'env_key = "OPENAI_API_KEY"',
  ].join('\n');
}

export function buildCodexRuntimeArgs({
  providerName = 'routerlab',
  baseUrl,
  model = DEFAULT_CODEX_MODEL,
  modelCatalogPath = null,
} = {}) {
  const q = (value) => JSON.stringify(value);
  const overrides = [
    `model_provider=${q('custom')}`,
    `model=${q(model)}`,
    ...(modelCatalogPath ? [`model_catalog_json=${q(modelCatalogPath)}`] : []),
    `web_search=${q('disabled')}`,
    `model_providers.custom.name=${q(providerName)}`,
    `model_providers.custom.base_url=${q(baseUrl)}`,
    `model_providers.custom.wire_api=${q('responses')}`,
    `model_providers.custom.env_key=${q('OPENAI_API_KEY')}`,
  ];

  return overrides.flatMap((override) => ['-c', override]);
}

export function codexModelsForService(serviceValue = 'routerlab') {
  return serviceValue === 'llm' ? CODEX_LLM_MODELS : CODEX_ROUTERLAB_MODELS;
}

export function defaultCodexModelForService(serviceValue = 'routerlab') {
  return serviceValue === 'llm' ? DEFAULT_CODEX_LLM_MODEL : DEFAULT_CODEX_MODEL;
}

export function buildCodexAuth(apiKey = '') {
  return { OPENAI_API_KEY: apiKey };
}

export function writeCodexRuntimeModelCatalog({
  serviceValue = 'routerlab',
  paths = getCodexPaths(),
  tmpDir = os.tmpdir(),
  modelMetadata = [],
  models = codexModelsForService(serviceValue),
} = {}) {
  cleanupStaleCodexRuntimeModelCatalogs({ tmpDir });
  const catalog = buildCodexModelCatalogFromCache({
    paths,
    models,
    modelMetadata,
    serviceValue,
  });
  if (!catalog) {
    return null;
  }

  const catalogDir = path.join(tmpDir, CODEX_RUNTIME_MODEL_CATALOG_DIR);
  fs.mkdirSync(catalogDir, { recursive: true });
  const catalogPath = path.join(catalogDir, `${serviceValue}-${randomUUID()}-${CODEX_MODEL_CATALOG_FILENAME}`);
  writeJsonAtomic(catalogPath, catalog);

  return {
    path: catalogPath,
    modelCount: catalog.models.length,
    models: catalog.models.map((entry) => entry.slug),
  };
}

export function cleanupCodexRuntimeModelCatalog(catalog) {
  if (catalog?.path) {
    fs.rmSync(catalog.path, { force: true });
  }
}

export function buildCodexConfigPreview({
  providerName = 'routerlab',
  serviceValue = providerName,
  baseUrl,
  model = DEFAULT_CODEX_MODEL,
  paths = getCodexPaths(),
  modelCatalogModels = CODEX_ROUTERLAB_MODELS,
} = {}) {
  const resolvedPaths = resolveCodexPaths(paths);
  const catalog = buildCodexModelCatalogFromCache({
    paths: resolvedPaths,
    models: modelCatalogModels,
    serviceValue,
  });
  const config = buildCodexThirdPartyConfig({
    providerName,
    baseUrl,
    model,
    modelCatalogPath: catalog ? resolvedPaths.modelCatalogPath : null,
  });
  const previousConfig = readText(resolvedPaths.configPath);
  const changed = previousConfig !== config;
  const backupExists = fs.existsSync(resolvedPaths.backupPath);
  const backupCreated = Boolean(previousConfig && !backupExists && changed);
  const catalogSummary = catalog ? {
    path: resolvedPaths.modelCatalogPath,
    modelCount: catalog.models.length,
    models: catalog.models.map((entry) => entry.slug),
  } : null;

  return {
    dryRun: true,
    changed,
    paths: resolvedPaths,
    config,
    catalog: catalogSummary,
    backupExists,
    backupCreated,
    authPreserved: true,
  };
}

export function applyCodexConfig(options = {}) {
  return buildCodexConfigPreview(options);
}

export function restoreCodexConfig({ paths = getCodexPaths(), dryRun = true } = {}) {
  const resolvedPaths = resolveCodexPaths(paths);
  const currentConfig = readText(resolvedPaths.configPath);
  const backupConfig = readText(resolvedPaths.backupPath);
  const wrapperConfig = isWrapperCodexConfig(currentConfig);
  const catalogExists = fs.existsSync(resolvedPaths.modelCatalogPath);

  if (dryRun) {
    return {
      dryRun: true,
      paths: resolvedPaths,
      canRestore: Boolean(backupConfig || wrapperConfig || catalogExists),
      backupExists: Boolean(backupConfig),
      wrapperConfig,
      modelCatalogExists: catalogExists,
      authPreserved: true,
    };
  }

  if (backupConfig) {
    writeTextAtomic(resolvedPaths.configPath, `${backupConfig}\n`);
    fs.rmSync(resolvedPaths.backupPath, { force: true });
  } else if (wrapperConfig) {
    fs.rmSync(resolvedPaths.configPath, { force: true });
  } else if (currentConfig) {
    throw new Error('Codex config does not look like a wrapper-scionos config, and no backup exists. Refusing to remove it automatically.');
  }

  if (catalogExists) {
    fs.rmSync(resolvedPaths.modelCatalogPath, { force: true });
  }

  return {
    dryRun: false,
    paths: resolvedPaths,
    restoredFromBackup: Boolean(backupConfig),
    removedWrapperConfig: !backupConfig && wrapperConfig,
    removedModelCatalog: catalogExists,
    authPreserved: true,
  };
}

export function assertCodexCliAvailable() {
  const codex = detectCodexCli();
  if (!codex.installed) {
    throw new Error('Codex CLI not found. Install the official Codex CLI first.');
  }
  if (!codex.versionSupported) {
    throw new Error('Codex CLI ' + MINIMUM_CODEX_VERSION + ' or newer is required (detected: ' + (codex.version ?? 'unknown') + ').');
  }
  return codex;
}

export async function launchCodex({
  apiKey = null,
  codexArgs = [],
  codex = null,
  updateProcessExitCode = true,
} = {}) {
  const resolvedCodex = codex ?? assertCodexCliAvailable();
  return runInteractiveCli(resolvedCodex.cliPath, codexArgs, {
    env: {
      ...process.env,
      ...(apiKey ? buildCodexAuth(apiKey) : {}),
    },
    updateProcessExitCode,
  });
}

export function readCodexStatus(paths = getCodexPaths()) {
  const resolvedPaths = resolveCodexPaths(paths);
  const config = readText(resolvedPaths.configPath);
  return {
    paths: resolvedPaths,
    configExists: fs.existsSync(resolvedPaths.configPath),
    backupExists: fs.existsSync(resolvedPaths.backupPath),
    authExists: fs.existsSync(resolvedPaths.authPath),
    modelCatalogExists: fs.existsSync(resolvedPaths.modelCatalogPath),
    wrapperConfig: isWrapperCodexConfig(config),
    routerlabEndpoint: hasRouterlabEndpoint(config),
  };
}

export function buildCodexModelCatalogFromCache({
  paths = getCodexPaths(),
  models = CODEX_ROUTERLAB_MODELS,
  modelMetadata = [],
  serviceValue = 'routerlab',
} = {}) {
  // The Codex cache schema is not stable. Use only normalized upstream metadata.
  resolveCodexPaths(paths);
  const metadataById = new Map(modelMetadata.map((entry) => [entry.id, entry]));
  return {
    models: models.map((model, index) => buildCodexModelCatalogEntry(
      model,
      index,
      metadataById.get(model),
      serviceValue,
    )),
  };
}

function buildCodexModelCatalogEntry(model, index, metadata = {}, serviceValue = 'routerlab') {
  const modelProfile = CODEX_MODEL_PROFILES.get(model) ?? {};
  const contextWindow = resolveCatalogMetadataValue(
    metadata,
    'contextWindow',
    'contextWindowVerified',
    modelProfile.contextWindow ?? CODEX_FALLBACK_CONTEXT_WINDOW,
  );
  const declaredModalities = resolveCatalogMetadataValue(
    metadata,
    'inputModalities',
    'inputModalitiesVerified',
    modelProfile.inputModalities ?? ['text'],
  );
  const inputModalities = declaredModalities?.includes('image') ? ['text', 'image'] : ['text'];
  const supportsReasoning = resolveCatalogBoolean(
    metadata,
    'supportsReasoning',
    'supportsReasoningVerified',
    modelProfile.supportsReasoning === true,
  );
  const supportsParallelToolCalls = resolveCatalogBoolean(
    metadata,
    'supportsParallelToolCalls',
    'supportsParallelToolCallsVerified',
    modelProfile.supportsParallelToolCalls === true,
  );
  const reasoningProfile = supportsReasoning
    ? CODEX_REASONING_PROFILES.get(model) ?? {
        defaultLevel: 'medium',
        levels: CODEX_FALLBACK_REASONING_LEVELS,
      }
    : null;
  const unavailableNotice = serviceValue === 'llm'
    ? CODEX_LLM_MODEL_NOTICES.get(model) ?? null
    : null;
  const displayName = unavailableNotice ? '🔴 ' + codexModelDisplayName(model) : codexModelDisplayName(model);

  return {
    slug: model,
    display_name: displayName,
    description: unavailableNotice ?? displayName,
    default_reasoning_level: reasoningProfile?.defaultLevel ?? null,
    supported_reasoning_levels: reasoningProfile
      ? structuredClone(reasoningProfile.levels)
      : [],
    shell_type: 'shell_command',
    visibility: 'list',
    supported_in_api: !unavailableNotice,
    priority: 1000 + index,
    additional_speed_tiers: [],
    service_tiers: [],
    default_service_tier: null,
    availability_nux: unavailableNotice ? { message: '🔴 ' + unavailableNotice } : null,
    upgrade: null,
    base_instructions: modelProfile.baseInstructions ?? CODEX_FALLBACK_BASE_INSTRUCTIONS,
    supports_reasoning_summaries: supportsReasoning,
    default_reasoning_summary: 'none',
    support_verbosity: false,
    default_verbosity: null,
    truncation_policy: { mode: 'bytes', limit: 10000 },
    supports_parallel_tool_calls: supportsParallelToolCalls,
    supports_image_detail_original: inputModalities.includes('image'),
    context_window: contextWindow,
    max_context_window: contextWindow,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    input_modalities: inputModalities,
    supports_search_tool: false,
  };
}

function resolveCatalogMetadataValue(metadata, valueKey, verifiedKey, fallback) {
  if (metadata?.[verifiedKey] === false) {
    return fallback;
  }
  return metadata?.[valueKey] ?? fallback;
}

function resolveCatalogBoolean(metadata, valueKey, verifiedKey, fallback) {
  if (metadata?.[verifiedKey] === false) {
    return fallback;
  }
  return typeof metadata?.[valueKey] === 'boolean' ? metadata[valueKey] : fallback;
}

export function cleanupStaleCodexRuntimeModelCatalogs({
  tmpDir = os.tmpdir(),
  maxAgeMs = 24 * 60 * 60 * 1000,
  now = Date.now(),
} = {}) {
  const catalogDir = path.join(tmpDir, CODEX_RUNTIME_MODEL_CATALOG_DIR);
  let entries;
  try {
    entries = fs.readdirSync(catalogDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(CODEX_MODEL_CATALOG_FILENAME)) {
      continue;
    }
    const filePath = path.join(catalogDir, entry.name);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.rmSync(filePath, { force: true });
        removed += 1;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return removed;
}
function resolveCodexPaths(paths) {
  const defaults = getCodexPaths();
  const configPath = paths.configPath ?? defaults.configPath;
  return {
    ...defaults,
    ...paths,
    backupPath: paths.backupPath ?? path.join(path.dirname(configPath), CODEX_CONFIG_BACKUP_FILENAME),
  };
}

function isWrapperCodexConfig(config) {
  return Boolean(config
    && /model_provider\s*=\s*["']custom["']/.test(config)
    && /\[model_providers\.custom\]/.test(config)
    && hasRouterlabEndpoint(config));
}

function hasRouterlabEndpoint(config) {
  return Boolean(config && /https:\/\/(api\.|llm-api\.)?routerlab\.ch\/v1/.test(config));
}

function readCodexModelTemplate(modelsCachePath) {
  try {
    const cache = JSON.parse(fs.readFileSync(modelsCachePath, 'utf8'));
    return cache.models?.find((entry) => entry?.slug === DEFAULT_CODEX_MODEL)
      ?? cache.models?.[0]
      ?? null;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trimEnd();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function writeTextAtomic(filePath, value) {
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, value, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeJsonAtomic(filePath, value) {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
