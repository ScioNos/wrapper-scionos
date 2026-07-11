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
  'gpt-5.6-sol-pro',
  'gpt-5.6-terra-pro',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'glm-5.2',
  'qwen3.7-max',
  'MiniMax-M3',
];

export const DEFAULT_CODEX_MODEL = CODEX_ROUTERLAB_MODELS[0];
export const DEFAULT_CODEX_LLM_MODEL = 'gpt-5.6-sol-pro';
export const CODEX_LLM_MODEL_NOTICES = new Map();
export const CODEX_MODEL_CATALOG_FILENAME = 'wrapper-scionos-model-catalog.json';
export const CODEX_CONFIG_BACKUP_FILENAME = 'config.toml.wrapper-scionos-backup';
export const CODEX_RUNTIME_MODEL_CATALOG_DIR = 'wrapper-scionos-codex';
export const CODEX_FALLBACK_CONTEXT_WINDOW = 128000;
const CODEX_FALLBACK_COMP_HASH = 'wrapper-scionos-fallback-v4';
const CODEX_FALLBACK_BASE_INSTRUCTIONS = 'You are Codex, a coding agent. Follow the active system, developer, and user instructions.';
const CODEX_FALLBACK_REASONING_LEVELS = [
  { effort: 'low', description: 'Fast responses with lighter reasoning' },
  { effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
  { effort: 'high', description: 'Greater reasoning depth for complex problems' },
];
const CODEX_GPT56_REASONING_LEVELS = [
  ...CODEX_FALLBACK_REASONING_LEVELS,
  { effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
  { effort: 'max', description: 'Maximum reasoning depth for the hardest problems' },
  { effort: 'ultra', description: 'Maximum reasoning with automatic task delegation' },
];
const CODEX_REASONING_PROFILES = new Map([
  ['gpt-5.6-terra', { defaultLevel: 'xhigh', levels: CODEX_GPT56_REASONING_LEVELS }],
  ['gpt-5.6-sol', { defaultLevel: 'xhigh', levels: CODEX_GPT56_REASONING_LEVELS }],
  ['gpt-5.6-luna', { defaultLevel: 'xhigh', levels: CODEX_GPT56_REASONING_LEVELS }],
  ['gpt-5.6-terra-pro', { defaultLevel: 'xhigh', levels: CODEX_GPT56_REASONING_LEVELS }],
  ['gpt-5.6-sol-pro', { defaultLevel: 'xhigh', levels: CODEX_GPT56_REASONING_LEVELS }],
]);
const CODEX_FALLBACK_MODEL_MESSAGES = {
  instructions_template: CODEX_FALLBACK_BASE_INSTRUCTIONS,
  instructions_variables: {},
};

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
} = {}) {
  cleanupStaleCodexRuntimeModelCatalogs({ tmpDir });
  const models = codexModelsForService(serviceValue);
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

export async function launchCodex({ apiKey = null, codexArgs = [] } = {}) {
  const codex = assertCodexCliAvailable();
  await runInteractiveCli(codex.cliPath, codexArgs, {
    env: {
      ...process.env,
      ...(apiKey ? buildCodexAuth(apiKey) : {}),
    },
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
  const contextWindow = metadata.contextWindow ?? CODEX_FALLBACK_CONTEXT_WINDOW;
  const inputModalities = metadata.inputModalities?.includes('image') ? ['text', 'image'] : ['text'];
  const supportsReasoning = metadata.supportsReasoning === true;
  const reasoningProfile = CODEX_REASONING_PROFILES.get(model);
  const unavailableNotice = serviceValue === 'llm'
    ? CODEX_LLM_MODEL_NOTICES.get(model) ?? null
    : null;
  const displayName = unavailableNotice ? '🔴 ' + codexModelDisplayName(model) : codexModelDisplayName(model);

  return {
    slug: model,
    display_name: displayName,
    description: unavailableNotice ?? displayName,
    default_reasoning_level: reasoningProfile?.defaultLevel ?? 'medium',
    supported_reasoning_levels: reasoningProfile?.levels
      ? structuredClone(reasoningProfile.levels)
      : supportsReasoning
        ? structuredClone(CODEX_FALLBACK_REASONING_LEVELS)
        : [{ effort: 'medium', description: 'Conservative default reasoning effort' }],
    shell_type: 'shell_command',
    visibility: 'list',
    supported_in_api: !unavailableNotice,
    priority: 1000 + index,
    additional_speed_tiers: [],
    service_tiers: [],
    default_service_tier: null,
    availability_nux: unavailableNotice ? { message: '🔴 ' + unavailableNotice } : null,
    upgrade: null,
    base_instructions: CODEX_FALLBACK_BASE_INSTRUCTIONS,
    model_messages: structuredClone(CODEX_FALLBACK_MODEL_MESSAGES),
    supports_reasoning_summaries: supportsReasoning || Boolean(reasoningProfile),
    default_reasoning_summary: 'none',
    support_verbosity: false,
    default_verbosity: null,
    apply_patch_tool_type: 'freeform',
    web_search_tool_type: 'text_and_image',
    truncation_policy: { mode: 'tokens', limit: 10000 },
    supports_parallel_tool_calls: metadata.supportsParallelToolCalls === true,
    supports_image_detail_original: inputModalities.includes('image'),
    context_window: contextWindow,
    max_context_window: contextWindow,
    comp_hash: CODEX_FALLBACK_COMP_HASH,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    input_modalities: inputModalities,
    supports_search_tool: metadata.supportsSearch === true,
    use_responses_lite: false,
  };
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
