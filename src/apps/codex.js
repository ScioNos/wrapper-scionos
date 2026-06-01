import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const CODEX_ROUTERLAB_MODELS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.4-mini',
  'minimax-m2.7',
  'glm-5.1',
];

export const DEFAULT_CODEX_MODEL = CODEX_ROUTERLAB_MODELS[0];
export const CODEX_MODEL_CATALOG_FILENAME = 'wrapper-scionos-model-catalog.json';

export function getCodexPaths(env = process.env) {
  const configDir = env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return {
    configDir,
    authPath: path.join(configDir, 'auth.json'),
    configPath: path.join(configDir, 'config.toml'),
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
    'requires_openai_auth = true',
  ].join('\n');
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
      authPreserved: true,
    };
  }

  fs.mkdirSync(path.dirname(resolvedPaths.configPath), { recursive: true });
  writeTextAtomic(resolvedPaths.configPath, `${config}\n`);
  if (catalog) {
    writeJsonAtomic(resolvedPaths.modelCatalogPath, catalog);
  }

  return {
    dryRun: false,
    changed,
    paths: resolvedPaths,
    catalogWritten: Boolean(catalog),
    authPreserved: true,
  };
}

export function readCodexStatus(paths = getCodexPaths()) {
  const resolvedPaths = resolveCodexPaths(paths);
  return {
    paths: resolvedPaths,
    configExists: fs.existsSync(resolvedPaths.configPath),
    authExists: fs.existsSync(resolvedPaths.authPath),
    modelCatalogExists: fs.existsSync(resolvedPaths.modelCatalogPath),
    config: readText(resolvedPaths.configPath),
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
  return { ...getCodexPaths(), ...paths };
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
  if (model === 'gpt-5.5') return 'GPT 5.5';
  if (model === 'gpt-5.4') return 'GPT 5.4';
  if (model === 'gpt-5.3-codex') return 'GPT 5.3 Codex';
  if (model === 'gpt-5.4-mini') return 'GPT 5.4 mini';
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
