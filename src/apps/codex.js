import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { detectCodexCli } from '../platform/detect.js';
import { runInteractiveCli } from '../platform/process.js';
import { codexModelDisplayName, codexModelsFromClaudeCodeStrategies } from '../routerlab/strategy-models.js';

export { codexModelDisplayName };

export const CODEX_ROUTERLAB_MODELS = codexModelsFromClaudeCodeStrategies('routerlab');
export const CODEX_LLM_MODELS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'glm-5.2',
  'qwen3.7-max',
  'MiniMax-M3',
  'deepseek-v4-pro',
];

export const DEFAULT_CODEX_MODEL = CODEX_ROUTERLAB_MODELS[0];
export const DEFAULT_CODEX_LLM_MODEL = 'gpt-5.5';
export const CODEX_MODEL_CATALOG_FILENAME = 'wrapper-scionos-model-catalog.json';
export const CODEX_CONFIG_BACKUP_FILENAME = 'config.toml.wrapper-scionos-backup';
export const CODEX_RUNTIME_MODEL_CATALOG_DIR = 'wrapper-scionos-codex';
export const CODEX_FALLBACK_CONTEXT_WINDOW = 272000;
const CODEX_FALLBACK_COMP_HASH = 'wrapper-scionos-fallback-v1';
const CODEX_FALLBACK_BASE_INSTRUCTIONS = 'You are Codex, a coding agent. Follow the active system, developer, and user instructions.';
const CODEX_FALLBACK_REASONING_LEVELS = [
  { effort: 'low', description: 'Fast responses with lighter reasoning' },
  { effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
  { effort: 'high', description: 'Greater reasoning depth for complex problems' },
];
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
    'model_reasoning_effort = "high"',
    'disable_response_storage = true',
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
    `model_reasoning_effort=${q('high')}`,
    'disable_response_storage=true',
    `sandbox_mode=${q('workspace-write')}`,
    `approval_policy=${q('on-request')}`,
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
} = {}) {
  const models = codexModelsForService(serviceValue);
  const catalog = buildCodexModelCatalogFromCache({ paths, models });
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
  baseUrl,
  model = DEFAULT_CODEX_MODEL,
  paths = getCodexPaths(),
  modelCatalogModels = CODEX_ROUTERLAB_MODELS,
} = {}) {
  const resolvedPaths = resolveCodexPaths(paths);
  const catalog = buildCodexModelCatalogFromCache({ paths: resolvedPaths, models: modelCatalogModels });
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

export async function launchCodex({ apiKey = null, codexArgs = [] } = {}) {
  const codex = detectCodexCli();
  if (!codex.installed) {
    throw new Error('Codex CLI not found. Install the official Codex CLI first.');
  }

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

export function buildCodexModelCatalogFromCache({ paths = getCodexPaths(), models = CODEX_ROUTERLAB_MODELS } = {}) {
  const resolvedPaths = resolveCodexPaths(paths);
  const template = readCodexModelTemplate(resolvedPaths.modelsCachePath) ?? buildFallbackCodexModelTemplate();

  return {
    models: models.map((model, index) => buildCodexModelCatalogEntry(template, model, index)),
  };
}

function buildCodexModelCatalogEntry(template, model, index) {
  const entry = structuredClone(template);
  entry.slug = model;
  entry.display_name = codexModelDisplayName(model);
  entry.description = entry.display_name;
  entry.priority = 1000 + index;
  entry.additional_speed_tiers = [];
  entry.service_tiers = [];
  entry.default_service_tier = null;
  entry.availability_nux = null;
  entry.upgrade = null;
  entry.visibility = 'list';
  entry.supported_in_api = true;
  entry.supported_reasoning_levels ??= structuredClone(CODEX_FALLBACK_REASONING_LEVELS);
  entry.default_reasoning_level ??= 'high';
  entry.context_window ??= CODEX_FALLBACK_CONTEXT_WINDOW;
  entry.max_context_window ??= entry.context_window;
  entry.shell_type ??= 'shell_command';
  entry.input_modalities ??= ['text', 'image'];
  entry.supports_parallel_tool_calls ??= true;
  entry.supports_reasoning_summaries ??= true;
  entry.default_reasoning_summary ??= 'none';
  entry.support_verbosity ??= true;
  entry.default_verbosity ??= 'low';
  entry.apply_patch_tool_type ??= 'freeform';
  entry.web_search_tool_type ??= 'text_and_image';
  entry.truncation_policy ??= { mode: 'tokens', limit: 10000 };
  entry.supports_search_tool ??= true;
  entry.supports_image_detail_original ??= true;
  entry.experimental_supported_tools ??= [];
  entry.effective_context_window_percent ??= 95;
  entry.use_responses_lite ??= false;
  entry.base_instructions ??= CODEX_FALLBACK_BASE_INSTRUCTIONS;
  entry.model_messages ??= structuredClone(CODEX_FALLBACK_MODEL_MESSAGES);
  entry.comp_hash ??= CODEX_FALLBACK_COMP_HASH;
  return entry;
}

function buildFallbackCodexModelTemplate() {
  return {
    slug: DEFAULT_CODEX_MODEL,
    display_name: codexModelDisplayName(DEFAULT_CODEX_MODEL),
    description: codexModelDisplayName(DEFAULT_CODEX_MODEL),
    default_reasoning_level: 'high',
    supported_reasoning_levels: structuredClone(CODEX_FALLBACK_REASONING_LEVELS),
    shell_type: 'shell_command',
    visibility: 'list',
    supported_in_api: true,
    priority: 1000,
    additional_speed_tiers: [],
    service_tiers: [],
    default_service_tier: null,
    availability_nux: null,
    upgrade: null,
    base_instructions: CODEX_FALLBACK_BASE_INSTRUCTIONS,
    model_messages: structuredClone(CODEX_FALLBACK_MODEL_MESSAGES),
    supports_reasoning_summaries: true,
    default_reasoning_summary: 'none',
    support_verbosity: true,
    default_verbosity: 'low',
    apply_patch_tool_type: 'freeform',
    web_search_tool_type: 'text_and_image',
    truncation_policy: { mode: 'tokens', limit: 10000 },
    supports_parallel_tool_calls: true,
    supports_image_detail_original: true,
    context_window: CODEX_FALLBACK_CONTEXT_WINDOW,
    max_context_window: CODEX_FALLBACK_CONTEXT_WINDOW,
    comp_hash: CODEX_FALLBACK_COMP_HASH,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    input_modalities: ['text', 'image'],
    supports_search_tool: true,
    use_responses_lite: false,
  };
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
