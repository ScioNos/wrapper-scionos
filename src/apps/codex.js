import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { detectCodexCli, MINIMUM_CODEX_VERSION } from '../platform/detect.js';
import { runInteractiveCli } from '../platform/process.js';
import { codexModelDisplayName } from '../routerlab/strategy-models.js';

export { codexModelDisplayName };

// Model whitelist by service
export const CODEX_ALLOWED_MODELS = {
  routerlab: [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'deepseek-v4-flash-0731',
    'kimi-k3',
    'glm-5.2',
    'minimax-m3',
  ],
  llm: [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'qwen3.8-max',
    'kimi-k3',
    'minimax-m3',
    'grok-4.5',
    'glm-5.2',
    'deepseek-v4-flash-0731',
  ],
};

// Default model by service
export const DEFAULT_CODEX_MODEL = {
  routerlab: 'gpt-5.6-sol',
  llm: 'gpt-5.6-sol',
};

// Legacy exports for compatibility
export const CODEX_ROUTERLAB_MODELS = CODEX_ALLOWED_MODELS.routerlab;
export const CODEX_LLM_MODELS = CODEX_ALLOWED_MODELS.llm;
export const DEFAULT_CODEX_LLM_MODEL = DEFAULT_CODEX_MODEL.llm;

export const CODEX_MODEL_CATALOG_FILENAME = 'wrapper-scionos-model-catalog.json';
export const CODEX_CONFIG_BACKUP_FILENAME = 'config.toml.wrapper-scionos-backup';
const FALLBACK_CONTEXT_WINDOW = 128000;
const FALLBACK_BASE_INSTRUCTIONS = 'You are Codex, a coding agent. Follow the active system, developer, and user instructions.';
const FALLBACK_REASONING_LEVELS = [
  { effort: 'low', description: 'Fast responses with lighter reasoning' },
  { effort: 'medium', description: 'Balanced speed and reasoning depth' },
  { effort: 'high', description: 'Greater reasoning depth for complex tasks' },
];
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
  model = DEFAULT_CODEX_MODEL.routerlab,
}) {
  const q = (value) => JSON.stringify(value);
  return [
    'model_provider = "custom"',
    `model = ${q(model)}`,
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
  model = DEFAULT_CODEX_MODEL.routerlab,
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
  return CODEX_ALLOWED_MODELS[serviceValue] || CODEX_ALLOWED_MODELS.routerlab;
}

export function defaultCodexModelForService(serviceValue = 'routerlab') {
  return DEFAULT_CODEX_MODEL[serviceValue] || DEFAULT_CODEX_MODEL.routerlab;
}

export function buildCodexAuth(apiKey = '') {
  return { OPENAI_API_KEY: apiKey };
}

export function buildCodexModelCatalog({
  models = CODEX_ALLOWED_MODELS.routerlab,
  modelMetadata = [],
} = {}) {
  const metadataById = new Map(modelMetadata.map((entry) => [entry.id, entry]));

  return {
    models: models.map((model, index) => {
      const metadata = metadataById.get(model) ?? {};
      const contextWindow = metadata.contextWindow ?? FALLBACK_CONTEXT_WINDOW;
      const inputModalities = Array.isArray(metadata.inputModalities) && metadata.inputModalities.length > 0
        ? metadata.inputModalities
        : ['text'];
      const displayName = metadata.displayName ?? codexModelDisplayName(model);

      return {
        slug: model,
        display_name: displayName,
        description: metadata.description ?? displayName,
        default_reasoning_level: metadata.defaultReasoningLevel ?? 'medium',
        supported_reasoning_levels: metadata.supportedReasoningLevels ?? FALLBACK_REASONING_LEVELS,
        shell_type: 'shell_command',
        visibility: 'list',
        supported_in_api: true,
        priority: 1000 + index,
        additional_speed_tiers: [],
        service_tiers: [],
        default_service_tier: null,
        availability_nux: null,
        upgrade: null,
        base_instructions: metadata.baseInstructions ?? FALLBACK_BASE_INSTRUCTIONS,
        default_reasoning_summary: 'none',
        support_verbosity: false,
        default_verbosity: null,
        truncation_policy: { mode: 'bytes', limit: 10000 },
        supports_parallel_tool_calls: metadata.supportsParallelToolCalls === true,
        supports_image_detail_original: inputModalities.includes('image'),
        context_window: contextWindow,
        max_context_window: contextWindow,
        effective_context_window_percent: 95,
        experimental_supported_tools: [],
        input_modalities: inputModalities,
        supports_search_tool: metadata.supportsSearch === true,
      };
    }),
  };
}

export function writeCodexRuntimeModelCatalog({
  models = CODEX_ALLOWED_MODELS.routerlab,
  modelMetadata = [],
  tmpDir = os.tmpdir(),
} = {}) {
  const catalogDir = fs.mkdtempSync(path.join(tmpDir, 'wrapper-scionos-codex-'));
  const catalogPath = path.join(catalogDir, CODEX_MODEL_CATALOG_FILENAME);
  fs.writeFileSync(
    catalogPath,
    `${JSON.stringify(buildCodexModelCatalog({ models, modelMetadata }), null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  return { path: catalogPath, directory: catalogDir };
}

export function cleanupCodexRuntimeModelCatalog(catalog) {
  if (!catalog?.path || !catalog?.directory) return;
  fs.rmSync(catalog.path, { force: true });
  try {
    fs.rmdirSync(catalog.directory);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error;
  }
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
  return Boolean(config && /^\s*base_url\s*=\s*["']https:\/\/(?:api|llm-api)\.routerlab\.ch\/v1\/?["']\s*(?:#.*)?$/m.test(config));
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

// Legacy functions for compatibility
export function buildCodexConfigPreview({
  providerName = 'routerlab',
  baseUrl,
  model = DEFAULT_CODEX_MODEL.routerlab,
  paths = getCodexPaths(),
} = {}) {
  const resolvedPaths = resolveCodexPaths(paths);
  const config = buildCodexThirdPartyConfig({
    providerName,
    baseUrl,
    model,
  });
  const previousConfig = readText(resolvedPaths.configPath);
  const changed = previousConfig !== config;
  const backupExists = fs.existsSync(resolvedPaths.backupPath);
  const backupCreated = Boolean(previousConfig && !backupExists && changed);
  return {
    dryRun: true,
    changed,
    paths: resolvedPaths,
    config,
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
  const backupExists = backupConfig !== null;
  const manualCleanupRequired = Boolean(wrapperConfig && !backupExists);

  if (dryRun) {
    return {
      dryRun: true,
      paths: resolvedPaths,
      canRestore: Boolean(backupExists || catalogExists),
      backupExists,
      wrapperConfig,
      modelCatalogExists: catalogExists,
      manualCleanupRequired,
      authPreserved: true,
    };
  }

  if (backupExists) {
    writeTextAtomic(resolvedPaths.configPath, `${backupConfig}\n`);
    fs.rmSync(resolvedPaths.backupPath, { force: true });
  }

  if (catalogExists) {
    fs.rmSync(resolvedPaths.modelCatalogPath, { force: true });
  }

  return {
    dryRun: false,
    paths: resolvedPaths,
    restoredFromBackup: backupExists,
    removedWrapperConfig: false,
    removedModelCatalog: catalogExists,
    preservedConfig: Boolean(currentConfig && !backupExists),
    manualCleanupRequired,
    authPreserved: true,
  };
}



export function readCodexStatus(paths = getCodexPaths()) {
  const resolvedPaths = resolveCodexPaths(paths);
  const config = readText(resolvedPaths.configPath);
  const backupExists = fs.existsSync(resolvedPaths.backupPath);
  const wrapperConfig = isWrapperCodexConfig(config);
  return {
    paths: resolvedPaths,
    configExists: fs.existsSync(resolvedPaths.configPath),
    backupExists,
    authExists: fs.existsSync(resolvedPaths.authPath),
    modelCatalogExists: fs.existsSync(resolvedPaths.modelCatalogPath),
    wrapperConfig,
    routerlabEndpoint: hasRouterlabEndpoint(config),
    manualCleanupRequired: Boolean(wrapperConfig && !backupExists),
  };
}
