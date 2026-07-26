import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CODEX_ALLOWED_MODELS,
  CODEX_MODEL_CATALOG_FILENAME,
  buildCodexConfigPreview,
  buildCodexRuntimeArgs,
  buildCodexThirdPartyConfig,
  getCodexPaths,
  readCodexStatus,
  restoreCodexConfig,
} from '../src/apps/codex.js';

function nativeTempDir(t, label) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), `.test-codex-native-${label}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('Codex allowlists stay service-scoped', () => {
  assert.deepEqual(CODEX_ALLOWED_MODELS.routerlab, [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'deepseek-v4-pro',
    'kimi-k2.7-code',
    'glm-5.2',
    'minimax-m3',
  ]);
  assert.deepEqual(CODEX_ALLOWED_MODELS.llm, [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'kimi-k3',
    'grok-4.5',
    'MiniMax-M3',
  ]);
});

test('Codex native template contains only provider routing fields', () => {
  const config = buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'deepseek-v4-pro',
  });
  assert.deepEqual(config.split('\n'), [
    'model_provider = "custom"',
    'model = "deepseek-v4-pro"',
    '',
    '[model_providers.custom]',
    'name = "routerlab"',
    'base_url = "https://api.routerlab.ch/v1"',
    'wire_api = "responses"',
    'env_key = "OPENAI_API_KEY"',
  ]);
  assert.doesNotMatch(config, /model_catalog_json|context_window|reasoning|shell_type|modalities|tool|truncation|priority/);
});

test('Codex runtime uses exactly six native overrides and preserves the model id', () => {
  const model = 'MiniMax-M3';
  const args = buildCodexRuntimeArgs({
    providerName: 'llm',
    baseUrl: 'https://llm-api.routerlab.ch/v1',
    model,
  });
  assert.equal(args.filter((value) => value === '-c').length, 6);
  assert.deepEqual(args.filter((value) => value !== '-c'), [
    'model_provider="custom"',
    `model="${model}"`,
    'model_providers.custom.name="llm"',
    'model_providers.custom.base_url="https://llm-api.routerlab.ch/v1"',
    'model_providers.custom.wire_api="responses"',
    'model_providers.custom.env_key="OPENAI_API_KEY"',
  ]);
  assert.equal(args.some((value) => value.includes('model_catalog_json')), false);
});

test('Codex preview is read-only and has no catalog property', (t) => {
  const dir = nativeTempDir(t, 'preview');
  const paths = getCodexPaths({ CODEX_HOME: dir });
  const preview = buildCodexConfigPreview({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.6-sol',
    paths,
  });
  assert.equal(preview.dryRun, true);
  assert.equal(Object.hasOwn(preview, 'catalog'), false);
  assert.equal(fs.existsSync(paths.configPath), false);
  assert.equal(fs.existsSync(paths.modelCatalogPath), false);
});

test('Codex status and restore retain legacy catalog cleanup', (t) => {
  const dir = nativeTempDir(t, 'legacy-restore');
  const paths = getCodexPaths({ CODEX_HOME: dir });
  fs.writeFileSync(paths.configPath, buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.6-sol',
  }), 'utf8');
  fs.writeFileSync(paths.modelCatalogPath, '{"models":[]}', 'utf8');

  const status = readCodexStatus(paths);
  assert.equal(status.modelCatalogExists, true);
  assert.equal(status.manualCleanupRequired, true);
  const restored = restoreCodexConfig({ paths, dryRun: false });
  assert.equal(restored.removedWrapperConfig, false);
  assert.equal(restored.removedModelCatalog, true);
  assert.equal(restored.manualCleanupRequired, true);
  assert.equal(fs.existsSync(paths.configPath), true);
  assert.equal(fs.existsSync(paths.modelCatalogPath), false);
  assert.equal(path.basename(paths.modelCatalogPath), CODEX_MODEL_CATALOG_FILENAME);
});

test('Codex restore brings back a backup and drops the wrapper catalog', (t) => {
  const dir = nativeTempDir(t, 'restore-apply');
  const paths = {
    configDir: dir,
    authPath: path.join(dir, 'auth.json'),
    configPath: path.join(dir, 'config.toml'),
    backupPath: path.join(dir, 'config.toml.wrapper-scionos-backup'),
    modelCatalogPath: path.join(dir, CODEX_MODEL_CATALOG_FILENAME),
  };
  const original = 'model_provider = "openai"\nmodel = "gpt-5"\n';
  fs.writeFileSync(paths.configPath, `${buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.6-sol',
  })}\n`, 'utf8');
  fs.writeFileSync(paths.backupPath, original, 'utf8');
  fs.writeFileSync(paths.modelCatalogPath, '{"models":[]}', 'utf8');
  fs.writeFileSync(paths.authPath, '{"OPENAI_API_KEY":"existing-key"}', 'utf8');

  const result = restoreCodexConfig({ paths, dryRun: false });
  assert.equal(result.restoredFromBackup, true);
  assert.equal(result.removedModelCatalog, true);
  assert.equal(result.authPreserved, true);
  assert.equal(fs.readFileSync(paths.configPath, 'utf8'), original);
  assert.equal(fs.existsSync(paths.backupPath), false);
  assert.equal(fs.existsSync(paths.modelCatalogPath), false);
  assert.equal(fs.existsSync(paths.authPath), true);
});

test('Codex restore preserves a wrapper config when no backup exists', (t) => {
  const dir = nativeTempDir(t, 'restore-wrapper');
  const paths = {
    configDir: dir,
    configPath: path.join(dir, 'config.toml'),
    backupPath: path.join(dir, 'config.toml.wrapper-scionos-backup'),
    modelCatalogPath: path.join(dir, CODEX_MODEL_CATALOG_FILENAME),
  };
  fs.writeFileSync(paths.configPath, buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.6-sol',
  }), 'utf8');

  const result = restoreCodexConfig({ paths, dryRun: false });
  assert.equal(result.removedWrapperConfig, false);
  assert.equal(result.restoredFromBackup, false);
  assert.equal(result.preservedConfig, true);
  assert.equal(result.manualCleanupRequired, true);
  assert.equal(fs.existsSync(paths.configPath), true);
});

test('Codex restore preserves a foreign config without backup', (t) => {
  const dir = nativeTempDir(t, 'restore-refuse');
  const paths = {
    configDir: dir,
    configPath: path.join(dir, 'config.toml'),
    backupPath: path.join(dir, 'config.toml.wrapper-scionos-backup'),
    modelCatalogPath: path.join(dir, CODEX_MODEL_CATALOG_FILENAME),
  };
  fs.writeFileSync(paths.configPath, 'model_provider = "openai"\n', 'utf8');

  const result = restoreCodexConfig({ paths, dryRun: false });
  assert.equal(result.preservedConfig, true);
  assert.equal(result.manualCleanupRequired, false);
  assert.equal(fs.existsSync(paths.configPath), true);
});

test('Codex legacy detection requires an exact official base_url assignment', (t) => {
  const dir = nativeTempDir(t, 'status-exact-endpoint');
  const paths = getCodexPaths({ CODEX_HOME: dir });
  fs.writeFileSync(paths.configPath, [
    'model_provider = "custom"',
    '[model_providers.custom]',
    '# base_url = "https://api.routerlab.ch/v1"',
    'base_url = "https://routerlab.ch/v1"',
  ].join('\n'), 'utf8');

  const status = readCodexStatus(paths);
  assert.equal(status.routerlabEndpoint, false);
  assert.equal(status.wrapperConfig, false);
  assert.equal(status.manualCleanupRequired, false);
});
