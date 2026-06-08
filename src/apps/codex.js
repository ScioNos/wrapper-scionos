import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { detectCodexCli } from '../platform/detect.js';

export const CODEX_ROUTERLAB_MODELS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.4-mini',
  'minimax-m2.7',
  'glm-5.1',
];

export const CODEX_LLM_MODELS = [
  'MiniMax-M3',
  'deepseek-v4-pro',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
  'qwen3.7-max',
  'glm-5.1',
];

export const DEFAULT_CODEX_MODEL = CODEX_ROUTERLAB_MODELS[0];
export const DEFAULT_CODEX_LLM_MODEL = 'gpt-5.5';
export const CODEX_MODEL_CATALOG_FILENAME = 'wrapper-scionos-model-catalog.json';
export const CODEX_CONFIG_BACKUP_FILENAME = 'config.toml.wrapper-scionos-backup';

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

export function codexModelsForService(serviceValue = 'routerlab') {
  return serviceValue === 'llm' ? CODEX_LLM_MODELS : CODEX_ROUTERLAB_MODELS;
}

export function defaultCodexModelForService(serviceValue = 'routerlab') {
  return serviceValue === 'llm' ? DEFAULT_CODEX_LLM_MODEL : DEFAULT_CODEX_MODEL;
}

export function buildCodexAuth(apiKey = '') {
  return { OPENAI_API_KEY: apiKey };
}

export function applyCodexConfig({
  providerName = 'routerlab',
  baseUrl,
  model = DEFAULT_CODEX_MODEL,
  paths = getCodexPaths(),
  dryRun = true,
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

  if (dryRun) {
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

  fs.mkdirSync(path.dirname(resolvedPaths.configPath), { recursive: true });
  if (backupCreated) {
    writeTextAtomic(resolvedPaths.backupPath, `${previousConfig}\n`);
  }
  writeTextAtomic(resolvedPaths.configPath, `${config}\n`);
  if (catalog) {
    writeJsonAtomic(resolvedPaths.modelCatalogPath, catalog);
  }

  return {
    dryRun: false,
    changed,
    paths: resolvedPaths,
    catalogWritten: Boolean(catalog),
    backupExists,
    backupCreated,
    backupPath: resolvedPaths.backupPath,
    authPreserved: true,
  };
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

  const child = spawn(codex.cliPath, codexArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(apiKey ? buildCodexAuth(apiKey) : {}),
    },
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(codex.cliPath),
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (typeof code === 'number') {
        resolve(code);
      } else {
        resolve(signal === 'SIGINT' ? 130 : 1);
      }
    });
  });
  process.exitCode = exitCode;
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
    config,
  };
}

export function buildCodexModelCatalogFromCache({ paths = getCodexPaths(), models = CODEX_ROUTERLAB_MODELS } = {}) {
  const resolvedPaths = resolveCodexPaths(paths);
  const template = readCodexModelTemplate(resolvedPaths.modelsCachePath);
  if (!template) {
    return null;
  }

  return {
    models: models.map((model, index) => {
      const entry = { ...template };
      entry.slug = model;
      entry.display_name = codexModelDisplayName(model);
      entry.description = entry.display_name;
      entry.priority = 1000 + index;
      entry.additional_speed_tiers = [];
      entry.service_tiers = [];
      entry.availability_nux = null;
      entry.upgrade = null;
      return entry;
    }),
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
  return Boolean(config && /https:\/\/(llm-api\.)?routerlab\.ch\/v1/.test(config));
}

function readCodexModelTemplate(modelsCachePath) {
  try {
    const cache = JSON.parse(fs.readFileSync(modelsCachePath, 'utf8'));
    return cache.models?.find((entry) => entry?.slug === DEFAULT_CODEX_MODEL) ?? null;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function codexModelDisplayName(model) {
  if (model === 'MiniMax-M3') return 'MiniMax M3';
  if (model === 'deepseek-v4-pro') return 'DeepSeek V4 Pro';
  if (model === 'gpt-5.5') return 'GPT 5.5';
  if (model === 'gpt-5.4') return 'GPT 5.4';
  if (model === 'gpt-5.3-codex') return 'GPT 5.3 Codex';
  if (model === 'gpt-5.4-mini') return 'GPT 5.4 mini';
  if (model === 'qwen3.7-max') return 'Qwen 3.7 Max';
  if (model === 'minimax-m2.7') return 'MiniMax M2.7';
  if (model === 'glm-5.1') return 'GLM 5.1';
  return model;
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
