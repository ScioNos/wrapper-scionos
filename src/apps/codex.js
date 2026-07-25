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
    'deepseek-v4-pro',
    'kimi-k2.7-code',
    'glm-5.2',
  ],
  llm: [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'kimi-k3',
    'grok-4.5',
    'MiniMax-M3',
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

// Kept only so status/restore can detect and remove files created by older releases.
export const CODEX_MODEL_CATALOG_FILENAME = 'wrapper-scionos-model-catalog.json';
export const CODEX_CONFIG_BACKUP_FILENAME = 'config.toml.wrapper-scionos-backup';
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
} = {}) {
  const q = (value) => JSON.stringify(value);
  const overrides = [
    `model_provider=${q('custom')}`,
    `model=${q(model)}`,
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
