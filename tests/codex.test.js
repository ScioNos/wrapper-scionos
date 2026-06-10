import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CODEX_LLM_MODELS, CODEX_ROUTERLAB_MODELS, applyCodexConfig, buildCodexConfigPreview, buildCodexModelCatalogFromCache, buildCodexRuntimeArgs, buildCodexThirdPartyConfig, cleanupCodexRuntimeModelCatalog, codexModelsForService, defaultCodexModelForService, readCodexStatus, restoreCodexConfig, writeCodexRuntimeModelCatalog } from '../src/apps/codex.js';

test('Codex template uses provider-scoped model provider config', () => {
  assert.deepEqual(CODEX_ROUTERLAB_MODELS, [
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'kimi-k2.6',
    'glm-5.1',
  ]);
  assert.deepEqual(CODEX_LLM_MODELS, [
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.5-sp',
    'gpt-5.4-mini-sp',
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'MiniMax-M3',
    'qwen3.7-max',
    'qwen3.6-flash',
    'glm-5.1',
  ]);
  assert.deepEqual(codexModelsForService('routerlab'), CODEX_ROUTERLAB_MODELS);
  assert.deepEqual(codexModelsForService('llm'), CODEX_LLM_MODELS);
  assert.equal(defaultCodexModelForService('routerlab'), 'gpt-5.5');
  assert.equal(defaultCodexModelForService('llm'), 'gpt-5.5');
  const config = buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'deepseek-v4-pro',
  });
  assert.match(config, /model_provider = "custom"/);
  assert.match(config, /model = "deepseek-v4-pro"/);
  assert.match(config, /\[model_providers\.custom\]/);
  assert.match(config, /wire_api = "responses"/);
  assert.match(config, /env_key = "OPENAI_API_KEY"/);
  assert.doesNotMatch(config, /requires_openai_auth/);
  assert.match(config, /base_url = "https:\/\/api\.routerlab\.ch\/v1"/);
});

test('Codex runtime launch args configure provider without writing config', () => {
  const args = buildCodexRuntimeArgs({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.5',
    modelCatalogPath: '/tmp/wrapper-scionos-model-catalog.json',
  });

  assert.equal(args.filter((arg) => arg === '-c').length, 11);
  assert.ok(args.includes('model_provider="custom"'));
  assert.ok(args.includes('model="gpt-5.5"'));
  assert.ok(args.includes('model_reasoning_effort="high"'));
  assert.ok(args.includes('disable_response_storage=true'));
  assert.ok(args.includes('sandbox_mode="workspace-write"'));
  assert.ok(args.includes('approval_policy="on-request"'));
  assert.ok(args.includes('model_catalog_json="/tmp/wrapper-scionos-model-catalog.json"'));
  assert.ok(args.includes('model_providers.custom.name="routerlab"'));
  assert.ok(args.includes('model_providers.custom.base_url="https://api.routerlab.ch/v1"'));
  assert.ok(args.includes('model_providers.custom.wire_api="responses"'));
  assert.ok(args.includes('model_providers.custom.env_key="OPENAI_API_KEY"'));
});

test('Codex launch args do not touch existing config files', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-launch-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const configPath = path.join(tempDir, 'config.toml');
  const originalConfig = 'model_provider = "openai"\n';
  fs.writeFileSync(configPath, originalConfig, 'utf8');

  buildCodexRuntimeArgs({
    providerName: 'llm',
    baseUrl: 'https://llm-api.routerlab.ch/v1',
    model: 'gpt-5.5',
  });

  assert.equal(fs.readFileSync(configPath, 'utf8'), originalConfig);
});

test('Codex config preview stays pure without touching auth state', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const paths = {
    configDir: tempDir,
    authPath: path.join(tempDir, 'auth.json'),
    configPath: path.join(tempDir, 'config.toml'),
  };
  const auth = { OPENAI_API_KEY: 'existing-key', tokens: { chatgpt: true } };
  fs.writeFileSync(paths.authPath, JSON.stringify(auth), 'utf8');

  const preview = buildCodexConfigPreview({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.5',
    paths,
  });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.changed, true);
  assert.equal(fs.existsSync(paths.configPath), false);

  const compatibilityPreview = applyCodexConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.5',
    paths,
    dryRun: false,
  });
  assert.equal(compatibilityPreview.dryRun, true);
  assert.equal(compatibilityPreview.authPreserved, true);
  assert.equal(compatibilityPreview.backupCreated, false);
  assert.match(compatibilityPreview.config, /base_url = "https:\/\/api\.routerlab\.ch\/v1"/);
  assert.equal(fs.existsSync(paths.configPath), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(paths.authPath, 'utf8')), auth);
});

test('Codex restore brings back the previous config and removes wrapper catalog', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-restore-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const paths = {
    configDir: tempDir,
    authPath: path.join(tempDir, 'auth.json'),
    configPath: path.join(tempDir, 'config.toml'),
    backupPath: path.join(tempDir, 'config.toml.wrapper-scionos-backup'),
    modelCatalogPath: path.join(tempDir, 'wrapper-scionos-model-catalog.json'),
  };
  const originalConfig = 'model_provider = "openai"\nmodel = "gpt-5"\n';
  const wrapperConfig = buildCodexThirdPartyConfig({
    providerName: 'llm',
    baseUrl: 'https://llm-api.routerlab.ch/v1',
    model: 'gpt-5.5',
  });
  fs.writeFileSync(paths.configPath, `${wrapperConfig}\n`, 'utf8');
  fs.writeFileSync(paths.backupPath, originalConfig, 'utf8');
  fs.writeFileSync(paths.modelCatalogPath, JSON.stringify({ models: [] }), 'utf8');
  fs.writeFileSync(paths.authPath, JSON.stringify({ OPENAI_API_KEY: 'existing-key' }), 'utf8');
  assert.match(fs.readFileSync(paths.configPath, 'utf8'), /llm-api\.routerlab\.ch/);

  const restored = restoreCodexConfig({ paths, dryRun: false });
  assert.equal(restored.restoredFromBackup, true);
  assert.equal(fs.existsSync(restored.paths.backupPath), false);
  assert.equal(fs.readFileSync(paths.configPath, 'utf8'), originalConfig);
  assert.equal(fs.existsSync(paths.modelCatalogPath), false);
  assert.equal(fs.existsSync(paths.authPath), true);
});

test('Codex restore refuses to remove non-wrapper config without backup', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-restore-refuse-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const paths = {
    configDir: tempDir,
    configPath: path.join(tempDir, 'config.toml'),
  };
  fs.writeFileSync(paths.configPath, 'model_provider = "openai"\n', 'utf8');

  assert.throws(() => restoreCodexConfig({ paths, dryRun: false }), /Refusing to remove/);
});

test('Codex status reports summary without raw config content', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-status-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const paths = {
    configDir: tempDir,
    authPath: path.join(tempDir, 'auth.json'),
    configPath: path.join(tempDir, 'config.toml'),
    modelCatalogPath: path.join(tempDir, 'wrapper-scionos-model-catalog.json'),
  };
  fs.writeFileSync(paths.configPath, buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.5',
  }), 'utf8');

  const status = readCodexStatus(paths);
  assert.equal(status.configExists, true);
  assert.equal(status.wrapperConfig, true);
  assert.equal(status.routerlabEndpoint, true);
  assert.equal(Object.hasOwn(status, 'config'), false);
});

test('Codex template preview includes model_catalog_json when Codex model cache is available', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-catalog-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const paths = {
    configDir: tempDir,
    authPath: path.join(tempDir, 'auth.json'),
    configPath: path.join(tempDir, 'config.toml'),
    modelsCachePath: path.join(tempDir, 'models_cache.json'),
    modelCatalogPath: path.join(tempDir, 'wrapper-scionos-model-catalog.json'),
  };
  fs.writeFileSync(paths.modelsCachePath, JSON.stringify({
    models: [{
      slug: 'gpt-5.5',
      display_name: 'GPT 5.5',
      model_messages: { instructions_template: 'template' },
      base_instructions: 'base',
      context_window: 272000,
      additional_speed_tiers: ['fast'],
      availability_nux: { message: 'launch' },
    }],
  }), 'utf8');

  const catalog = buildCodexModelCatalogFromCache({ paths });
  assert.equal(catalog.models[3].slug, 'deepseek-v4-pro');
  assert.equal(catalog.models[3].display_name, 'DeepSeek V4 Pro');
  assert.deepEqual(catalog.models[3].additional_speed_tiers, []);
  assert.equal(catalog.models[3].availability_nux, null);
  assert.deepEqual(catalog.models[3].model_messages, { instructions_template: 'template' });

  const preview = buildCodexConfigPreview({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.5',
    paths,
    dryRun: false,
  });
  assert.equal(preview.catalog.modelCount, CODEX_ROUTERLAB_MODELS.length);
  assert.equal(preview.catalog.models[5], 'kimi-k2.6');
  assert.match(preview.config, /model_catalog_json = /);
  assert.equal(fs.existsSync(paths.configPath), false);
  assert.equal(fs.existsSync(paths.modelCatalogPath), false);
});

test('Codex template preview builds LLM-specific model catalog for llm service', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-llm-catalog-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const paths = {
    configDir: tempDir,
    configPath: path.join(tempDir, 'config.toml'),
    modelsCachePath: path.join(tempDir, 'models_cache.json'),
    modelCatalogPath: path.join(tempDir, 'wrapper-scionos-model-catalog.json'),
  };
  fs.writeFileSync(paths.modelsCachePath, JSON.stringify({
    models: [{
      slug: 'gpt-5.5',
      display_name: 'GPT 5.5',
      context_window: 272000,
    }],
  }), 'utf8');

  const preview = buildCodexConfigPreview({
    providerName: 'llm',
    baseUrl: 'https://llm-api.routerlab.ch/v1',
    model: defaultCodexModelForService('llm'),
    modelCatalogModels: codexModelsForService('llm'),
    paths,
    dryRun: false,
  });
  assert.match(preview.config, /model = "gpt-5\.5"/);
  assert.deepEqual(preview.catalog.models, CODEX_LLM_MODELS);
  const catalog = buildCodexModelCatalogFromCache({ paths, models: CODEX_LLM_MODELS });
  assert.equal(catalog.models[0].display_name, 'GPT 5.5');
  assert.equal(catalog.models[5].display_name, 'DeepSeek V4 Pro');
  assert.equal(catalog.models[9].display_name, 'Qwen 3.6 Flash');
  assert.equal(fs.existsSync(paths.configPath), false);
  assert.equal(fs.existsSync(paths.modelCatalogPath), false);
});

test('Codex runtime catalog is temporary and service-scoped', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-runtime-catalog-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const paths = {
    configDir: tempDir,
    modelsCachePath: path.join(tempDir, 'models_cache.json'),
  };
  fs.writeFileSync(paths.modelsCachePath, JSON.stringify({
    models: [{
      slug: 'gpt-5.5',
      display_name: 'GPT 5.5',
      context_window: 272000,
    }],
  }), 'utf8');

  const catalog = writeCodexRuntimeModelCatalog({
    serviceValue: 'llm',
    paths,
    tmpDir: tempDir,
  });

  assert.ok(catalog.path.startsWith(tempDir));
  assert.deepEqual(catalog.models, CODEX_LLM_MODELS);
  const written = JSON.parse(fs.readFileSync(catalog.path, 'utf8'));
  assert.deepEqual(written.models.map((entry) => entry.slug), CODEX_LLM_MODELS);

  cleanupCodexRuntimeModelCatalog(catalog);
  assert.equal(fs.existsSync(catalog.path), false);
});
