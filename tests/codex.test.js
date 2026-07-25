import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CODEX_ALLOWED_MODELS,
  CODEX_LLM_MODELS,
  CODEX_MODEL_CATALOG_FILENAME,
  CODEX_ROUTERLAB_MODELS,
  CODEX_RUNTIME_MODEL_CATALOG_DIR,
  DEFAULT_CODEX_MODEL,
  buildCodexCatalogFallback,
  buildCodexCatalogFromUpstream,
  buildCodexConfigPreview,
  buildCodexRuntimeArgs,
  buildCodexThirdPartyConfig,
  cleanupCodexRuntimeModelCatalog,
  cleanupStaleCodexRuntimeModelCatalogs,
  codexModelsForService,
  defaultCodexModelForService,
  getCodexPaths,
  readCodexStatus,
  restoreCodexConfig,
  writeCodexRuntimeModelCatalog,
} from '../src/apps/codex.js';
import { extractModelMetadata } from '../src/routerlab/models.js';

const ROUTERLAB_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'deepseek-v4-pro',
  'kimi-k2.7-code',
  'glm-5.2',
];

const LLM_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'kimi-k3',
  'grok-4.5',
  'MiniMax-M3',
];

function tempDirFor(t, label) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), `.test-codex-${label}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('Codex model whitelist is service scoped', () => {
  assert.deepEqual(CODEX_ALLOWED_MODELS.routerlab, ROUTERLAB_MODELS);
  assert.deepEqual(CODEX_ALLOWED_MODELS.llm, LLM_MODELS);
  assert.deepEqual(CODEX_ROUTERLAB_MODELS, ROUTERLAB_MODELS);
  assert.deepEqual(CODEX_LLM_MODELS, LLM_MODELS);
  assert.deepEqual(codexModelsForService('routerlab'), ROUTERLAB_MODELS);
  assert.deepEqual(codexModelsForService('llm'), LLM_MODELS);
  assert.deepEqual(codexModelsForService('unknown'), ROUTERLAB_MODELS);
});

test('Codex default model is gpt-5.6-sol for both services', () => {
  assert.equal(DEFAULT_CODEX_MODEL.routerlab, 'gpt-5.6-sol');
  assert.equal(DEFAULT_CODEX_MODEL.llm, 'gpt-5.6-sol');
  assert.equal(defaultCodexModelForService('routerlab'), 'gpt-5.6-sol');
  assert.equal(defaultCodexModelForService('llm'), 'gpt-5.6-sol');
  assert.equal(defaultCodexModelForService('unknown'), 'gpt-5.6-sol');
});

test('Codex TOML template only declares provider routing', () => {
  const config = buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'deepseek-v4-pro',
  });
  assert.match(config, /^model_provider = "custom"$/m);
  assert.match(config, /^model = "deepseek-v4-pro"$/m);
  assert.match(config, /^\[model_providers\.custom\]$/m);
  assert.match(config, /^name = "routerlab"$/m);
  assert.match(config, /^base_url = "https:\/\/api\.routerlab\.ch\/v1"$/m);
  assert.match(config, /^wire_api = "responses"$/m);
  assert.match(config, /^env_key = "OPENAI_API_KEY"$/m);
  assert.doesNotMatch(config, /web_search/);
  assert.doesNotMatch(config, /requires_openai_auth/);
  assert.doesNotMatch(config, /model_catalog_json/);
});

test('Codex runtime args pass routing through -c overrides only', () => {
  const args = buildCodexRuntimeArgs({
    providerName: 'llm',
    baseUrl: 'https://llm-api.routerlab.ch/v1',
    model: 'kimi-k3',
    modelCatalogPath: '/tmp/catalog.json',
  });

  assert.equal(args.filter((arg) => arg === '-c').length, 7);
  assert.deepEqual(args.filter((arg) => arg !== '-c'), [
    'model_provider="custom"',
    'model="kimi-k3"',
    'model_catalog_json="/tmp/catalog.json"',
    'model_providers.custom.name="llm"',
    'model_providers.custom.base_url="https://llm-api.routerlab.ch/v1"',
    'model_providers.custom.wire_api="responses"',
    'model_providers.custom.env_key="OPENAI_API_KEY"',
  ]);
  assert.equal(args.some((arg) => arg.includes('web_search')), false);
});

test('Codex runtime args omit the catalog override when no catalog exists', () => {
  const args = buildCodexRuntimeArgs({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.6-sol',
  });
  assert.equal(args.filter((arg) => arg === '-c').length, 6);
  assert.equal(args.some((arg) => arg.startsWith('model_catalog_json')), false);
});

test('Codex launch args never touch an existing config file', (t) => {
  const dir = tempDirFor(t, 'launch-args');
  const configPath = path.join(dir, 'config.toml');
  const original = 'model_provider = "openai"\nmodel = "gpt-5"\n';
  fs.writeFileSync(configPath, original, 'utf8');

  buildCodexRuntimeArgs({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.6-sol',
    modelCatalogPath: path.join(dir, 'catalog.json'),
  });

  assert.equal(fs.readFileSync(configPath, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(dir), ['config.toml']);
});

test('Codex catalog uses upstream metadata when available', () => {
  const catalog = buildCodexCatalogFromUpstream({
    serviceValue: 'routerlab',
    allowedModelIds: ROUTERLAB_MODELS,
    upstreamModels: [
      {
        id: 'gpt-5.6-sol',
        contextWindow: 372000,
        inputModalities: ['text', 'image'],
        supportsReasoning: true,
        supportsParallelToolCalls: true,
      },
      { id: 'not-allowed', contextWindow: 999 },
      {
        id: 'glm-5.2',
        contextWindow: 200000,
        inputModalities: ['text'],
        supportsReasoning: false,
        supportsParallelToolCalls: false,
      },
    ],
  });

  assert.deepEqual(catalog.models.map((entry) => entry.slug), ['gpt-5.6-sol', 'glm-5.2']);

  const [sol, glm] = catalog.models;
  assert.equal(sol.context_window, 372000);
  assert.equal(sol.max_context_window, 372000);
  assert.equal(sol.display_name, 'GPT 5.6 Sol');
  assert.deepEqual(sol.input_modalities, ['text', 'image']);
  assert.equal(sol.supports_image_detail_original, true);
  assert.equal(sol.supports_reasoning_summaries, true);
  assert.equal(sol.supports_parallel_tool_calls, true);
  assert.equal(sol.priority, 1000);

  assert.equal(glm.context_window, 200000);
  assert.equal(glm.display_name, 'GLM 5.2');
  assert.deepEqual(glm.input_modalities, ['text']);
  assert.equal(glm.supports_image_detail_original, false);
  assert.equal(glm.supports_reasoning_summaries, false);
  assert.equal(glm.priority, 1001);
});

test('Codex catalog propagates upstream reasoning metadata and base instructions', () => {
  const metadata = extractModelMetadata({
    data: [
      {
        id: 'gpt-5.6-sol',
        display_name: 'Sol (upstream)',
        description: 'Upstream described flagship',
        base_instructions: 'You are Codex running through RouterLab.',
        default_reasoning_level: 'xhigh',
        supported_reasoning_levels: [
          { effort: 'minimal', description: 'Fastest' },
          'xhigh',
        ],
        context_window: 372000,
        input_modalities: ['text', 'image'],
        supports_reasoning: true,
        supports_search: true,
      },
    ],
  });

  const catalog = buildCodexCatalogFromUpstream({
    serviceValue: 'routerlab',
    allowedModelIds: ['gpt-5.6-sol'],
    upstreamModels: metadata,
  });

  const [sol] = catalog.models;
  assert.equal(sol.display_name, 'Sol (upstream)');
  assert.equal(sol.description, 'Upstream described flagship');
  assert.equal(sol.base_instructions, 'You are Codex running through RouterLab.');
  assert.equal(sol.default_reasoning_level, 'xhigh');
  assert.deepEqual(sol.supported_reasoning_levels, [
    { effort: 'minimal', description: 'Fastest' },
    { effort: 'xhigh', description: 'xhigh' },
  ]);
  assert.equal(sol.supports_search_tool, true);
  assert.equal(sol.context_window, 372000);
});

test('Codex catalog refuses to build when upstream matches nothing', () => {
  assert.throws(() => buildCodexCatalogFromUpstream({
    serviceValue: 'llm',
    allowedModelIds: LLM_MODELS,
    upstreamModels: [{ id: 'some-other-model' }],
  }), /No upstream models matched/);
});

test('Codex fallback catalog stays minimal and neutral', () => {
  const catalog = buildCodexCatalogFallback({
    serviceValue: 'llm',
    allowedModelIds: LLM_MODELS,
  });

  assert.deepEqual(catalog.models.map((entry) => entry.slug), LLM_MODELS);
  assert.deepEqual(catalog.models.map((entry) => entry.display_name), [
    'GPT 5.6 Sol',
    'GPT 5.6 Terra',
    'GPT 5.6 Luna',
    'Kimi K3',
    'Grok 4.5',
    'MiniMax M3',
  ]);

  for (const entry of catalog.models) {
    assert.equal(entry.context_window, 128000);
    assert.equal(entry.max_context_window, 128000);
    assert.equal(entry.default_reasoning_level, 'medium');
    assert.deepEqual(entry.supported_reasoning_levels.map((level) => level.effort), ['low', 'medium', 'high']);
    assert.deepEqual(entry.input_modalities, ['text']);
    assert.equal(entry.visibility, 'list');
    assert.equal(entry.supported_in_api, true);
    assert.equal(entry.supports_search_tool, false);
    assert.equal(typeof entry.base_instructions, 'string');
    assert.ok(entry.base_instructions.length > 0);
    assert.deepEqual(entry.truncation_policy, { mode: 'bytes', limit: 10000 });
    assert.equal('model_messages' in entry, false);
    assert.equal('comp_hash' in entry, false);
    assert.equal('apply_patch_tool_type' in entry, false);
    assert.equal('web_search_tool_type' in entry, false);
  }
});

test('Codex runtime catalog is temporary, service scoped and upstream driven', (t) => {
  const dir = tempDirFor(t, 'runtime-catalog');

  const catalog = writeCodexRuntimeModelCatalog({
    serviceValue: 'llm',
    tmpDir: dir,
    models: LLM_MODELS,
    modelMetadata: LLM_MODELS.map((id, index) => ({
      id,
      contextWindow: 200000 + index,
      inputModalities: ['text'],
      supportsReasoning: true,
      supportsParallelToolCalls: true,
    })),
  });

  assert.ok(catalog.path.startsWith(path.join(dir, CODEX_RUNTIME_MODEL_CATALOG_DIR)));
  assert.ok(path.basename(catalog.path).startsWith('llm-'));
  assert.ok(catalog.path.endsWith(CODEX_MODEL_CATALOG_FILENAME));
  assert.equal(catalog.modelCount, LLM_MODELS.length);
  assert.deepEqual(catalog.models, LLM_MODELS);

  const written = JSON.parse(fs.readFileSync(catalog.path, 'utf8'));
  assert.deepEqual(written.models.map((entry) => entry.slug), LLM_MODELS);
  assert.equal(written.models[0].context_window, 200000);

  cleanupCodexRuntimeModelCatalog(catalog);
  assert.equal(fs.existsSync(catalog.path), false);
});

test('Codex runtime catalog falls back when no upstream metadata is provided', (t) => {
  const dir = tempDirFor(t, 'runtime-fallback');

  const catalog = writeCodexRuntimeModelCatalog({
    serviceValue: 'routerlab',
    tmpDir: dir,
    models: ROUTERLAB_MODELS,
  });

  const written = JSON.parse(fs.readFileSync(catalog.path, 'utf8'));
  assert.deepEqual(written.models.map((entry) => entry.slug), ROUTERLAB_MODELS);
  assert.equal(written.models[0].context_window, 128000);
  cleanupCodexRuntimeModelCatalog(catalog);
});

test('Codex stale runtime catalogs are pruned by age', (t) => {
  const dir = tempDirFor(t, 'stale-catalog');
  const catalogDir = path.join(dir, CODEX_RUNTIME_MODEL_CATALOG_DIR);
  fs.mkdirSync(catalogDir, { recursive: true });

  const stalePath = path.join(catalogDir, `routerlab-stale-${CODEX_MODEL_CATALOG_FILENAME}`);
  const freshPath = path.join(catalogDir, `routerlab-fresh-${CODEX_MODEL_CATALOG_FILENAME}`);
  const unrelatedPath = path.join(catalogDir, 'unrelated.json');
  fs.writeFileSync(stalePath, '{}', 'utf8');
  fs.writeFileSync(freshPath, '{}', 'utf8');
  fs.writeFileSync(unrelatedPath, '{}', 'utf8');

  const now = Date.now();
  const old = new Date(now - (48 * 60 * 60 * 1000));
  fs.utimesSync(stalePath, old, old);

  const removed = cleanupStaleCodexRuntimeModelCatalogs({ tmpDir: dir, now });
  assert.equal(removed, 1);
  assert.equal(fs.existsSync(stalePath), false);
  assert.equal(fs.existsSync(freshPath), true);
  assert.equal(fs.existsSync(unrelatedPath), true);
});

test('Codex stale cleanup tolerates a missing catalog directory', (t) => {
  const dir = tempDirFor(t, 'stale-missing');
  assert.equal(cleanupStaleCodexRuntimeModelCatalogs({ tmpDir: dir }), 0);
});

test('Codex paths honour CODEX_HOME', (t) => {
  const dir = tempDirFor(t, 'paths');
  const paths = getCodexPaths({ CODEX_HOME: dir });
  assert.equal(paths.configDir, dir);
  assert.equal(paths.configPath, path.join(dir, 'config.toml'));
  assert.equal(paths.authPath, path.join(dir, 'auth.json'));
  assert.equal(paths.modelCatalogPath, path.join(dir, CODEX_MODEL_CATALOG_FILENAME));
});

test('Codex config preview never writes to disk', (t) => {
  const dir = tempDirFor(t, 'preview');
  const paths = {
    configDir: dir,
    authPath: path.join(dir, 'auth.json'),
    configPath: path.join(dir, 'config.toml'),
    modelCatalogPath: path.join(dir, CODEX_MODEL_CATALOG_FILENAME),
  };
  const auth = { OPENAI_API_KEY: 'existing-key' };
  fs.writeFileSync(paths.authPath, JSON.stringify(auth), 'utf8');

  const preview = buildCodexConfigPreview({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.6-sol',
    paths,
  });

  assert.equal(preview.dryRun, true);
  assert.equal(preview.authPreserved, true);
  assert.equal(preview.catalog.modelCount, ROUTERLAB_MODELS.length);
  assert.deepEqual(preview.catalog.models, ROUTERLAB_MODELS);
  assert.match(preview.config, /model_catalog_json = /);
  assert.equal(fs.existsSync(paths.configPath), false);
  assert.equal(fs.existsSync(paths.modelCatalogPath), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(paths.authPath, 'utf8')), auth);
});

test('Codex status summarises files without leaking config content', (t) => {
  const dir = tempDirFor(t, 'status');
  const paths = {
    configDir: dir,
    authPath: path.join(dir, 'auth.json'),
    configPath: path.join(dir, 'config.toml'),
    modelCatalogPath: path.join(dir, CODEX_MODEL_CATALOG_FILENAME),
  };
  fs.writeFileSync(paths.configPath, buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.6-sol',
  }), 'utf8');

  const status = readCodexStatus(paths);
  assert.equal(status.configExists, true);
  assert.equal(status.wrapperConfig, true);
  assert.equal(status.routerlabEndpoint, true);
  assert.equal(status.authExists, false);
  assert.equal(status.modelCatalogExists, false);
  assert.equal(Object.hasOwn(status, 'config'), false);
});

test('Codex restore reports what it would do in dry-run mode', (t) => {
  const dir = tempDirFor(t, 'restore-dry');
  const paths = {
    configDir: dir,
    configPath: path.join(dir, 'config.toml'),
    backupPath: path.join(dir, 'config.toml.wrapper-scionos-backup'),
    modelCatalogPath: path.join(dir, CODEX_MODEL_CATALOG_FILENAME),
  };
  fs.writeFileSync(paths.configPath, buildCodexThirdPartyConfig({
    providerName: 'llm',
    baseUrl: 'https://llm-api.routerlab.ch/v1',
    model: 'kimi-k3',
  }), 'utf8');

  const result = restoreCodexConfig({ paths, dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.canRestore, true);
  assert.equal(result.wrapperConfig, true);
  assert.equal(result.backupExists, false);
  assert.equal(fs.existsSync(paths.configPath), true);
});

test('Codex restore brings back a backup and drops the wrapper catalog', (t) => {
  const dir = tempDirFor(t, 'restore-apply');
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

test('Codex restore removes a wrapper config when no backup exists', (t) => {
  const dir = tempDirFor(t, 'restore-wrapper');
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
  assert.equal(result.removedWrapperConfig, true);
  assert.equal(result.restoredFromBackup, false);
  assert.equal(fs.existsSync(paths.configPath), false);
});

test('Codex restore refuses to delete a foreign config without backup', (t) => {
  const dir = tempDirFor(t, 'restore-refuse');
  const paths = {
    configDir: dir,
    configPath: path.join(dir, 'config.toml'),
    backupPath: path.join(dir, 'config.toml.wrapper-scionos-backup'),
    modelCatalogPath: path.join(dir, CODEX_MODEL_CATALOG_FILENAME),
  };
  fs.writeFileSync(paths.configPath, 'model_provider = "openai"\n', 'utf8');

  assert.throws(() => restoreCodexConfig({ paths, dryRun: false }), /Refusing to remove/);
  assert.equal(fs.existsSync(paths.configPath), true);
});

