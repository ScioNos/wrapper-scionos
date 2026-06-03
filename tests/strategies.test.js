import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildClaudeCodeEnvironment, chooseSubagentModel, formatClaudeCodeChoiceMenu, formatClaudeCodeIntro } from '../src/apps/claude-code.js';
import { CODEX_ROUTERLAB_MODELS, applyCodexConfig, buildCodexModelCatalogFromCache, buildCodexThirdPartyConfig } from '../src/apps/codex.js';
import { createClaudeDesktopProxy } from '../src/apps/claude-desktop-proxy.js';
import { shouldOpenInteractiveMenu } from '../src/cli/main.js';
import { parseOptions } from '../src/cli/args.js';
import { CLAUDE_DESKTOP_MENU_ITEMS, CODEX_MENU_ITEMS, MAIN_MENU_ITEMS, formatBanner, formatMenu, formatSelectChoice, resolveMenuChoice } from '../src/cli/menu.js';
import { DESKTOP_MAPPING_STRATEGIES, desktopRouteIdForStrategyModel, isClaudeDesktopSafeModelId, modelRoutesForDesktopMapping, modelRoutesForProxyStrategy, modelSpecsForDirectStrategy, supportsOneMillionContext } from '../src/apps/claude-desktop.js';
import { requireServiceConfig } from '../src/routerlab/services.js';
import { allowsSubagentModelOverride, assessStrategyLaunch, getClaudeCodeStrategyEnvironment, getStrategyDisplayName, getStrategyEnvironment, getStrategyChoices } from '../src/routerlab/strategies.js';
import { extractModelIds, validateTokenFormat } from '../src/routerlab/models.js';

test('RouterLab services expose the expected endpoints', () => {
  assert.equal(requireServiceConfig('routerlab').baseUrl, 'https://api.routerlab.ch');
  assert.equal(requireServiceConfig('llm').baseUrl, 'https://llm-api.routerlab.ch');
});

test('Claude Code strategy mapping is service-aware', () => {
  assert.deepEqual(getStrategyEnvironment('claude-gpt', 'routerlab'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-gpt-5.5',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-gpt-5.4',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-gpt-5.4-mini',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-gpt-5.4-mini',
  });

  assert.deepEqual(getStrategyEnvironment('claude', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-7',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-opus-4-6',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5-20251001',
  });

  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude', 'llm'), {});
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude', 'llm', { subagentModel: 'haiku' }), {
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-4-5-20251001',
  });
  assert.deepEqual(getStrategyEnvironment('claude-MiniMax-M3', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-MiniMax-M3',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-MiniMax-M3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-MiniMax-M3',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-MiniMax-M3',
  });
  assert.deepEqual(getStrategyEnvironment('claude-qwen3.7-max', 'llm'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-qwen3.7-max',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-qwen3.7-max',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-qwen3.7-max',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-qwen3.6-flash',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-MiniMax-M3', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-MiniMax-M3',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-MiniMax-M3',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-MiniMax-M3',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-MiniMax-M3',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-qwen3.7-max', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-qwen3.7-max',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-qwen3.7-max',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-qwen3.7-max',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-qwen3.6-flash',
  });
  assert.deepEqual(getClaudeCodeStrategyEnvironment('claude-gpt-special', 'llm', { subagentModel: 'haiku' }), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-gpt-5.5-sp',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-gpt-5.5-sp',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-gpt-5.4-mini-sp',
    CLAUDE_CODE_SUBAGENT_MODEL: 'claude-gpt-5.4-mini-sp',
  });
  assert.equal(allowsSubagentModelOverride('claude-gpt-special', 'llm'), false);
  assert.equal(allowsSubagentModelOverride('claude-MiniMax-M3', 'llm'), false);
  assert.equal(allowsSubagentModelOverride('claude-qwen3.7-max', 'llm'), false);
  assert.throws(() => getStrategyEnvironment('minimax-m2.7', 'llm'), /Unknown strategy/);
});

test('fixed-subagent strategies do not prompt for subagent overrides', async () => {
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'claude-MiniMax-M3',
    preferredSubagentModel: 'haiku',
  }), 'strategy default');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'claude-qwen3.7-max',
    preferredSubagentModel: 'haiku',
  }), 'strategy default');
  assert.equal(await chooseSubagentModel({
    serviceValue: 'llm',
    strategyValue: 'claude-gpt-special',
    preferredSubagentModel: 'haiku',
  }), 'strategy default');
});

test('service strategy lists stay scoped', () => {
  assert.deepEqual(getStrategyChoices([], 'routerlab').map((choice) => choice.value), [
    'default',
    'aws',
    'claude-gpt',
    'deepseek-v4-beta',
    'claude-kimi-k2.6',
    'glm-5.1',
  ]);
  assert.deepEqual(getStrategyChoices([], 'llm').map((choice) => choice.value), [
    'claude',
    'claude-gpt',
    'claude-gpt-special',
    'deepseek-v4-beta',
    'claude-MiniMax-M3',
    'claude-qwen3.7-max',
    'glm-5.1',
  ]);
});

test('Claude Code strategy choices match guided launcher labels and readiness', () => {
  const choices = getStrategyChoices([], 'routerlab');
  assert.equal(choices.find((choice) => choice.value === 'aws').name, '💸 Claude via AWS (-50%)');
  assert.equal(choices.some((choice) => choice.value === 'deepseek-v4'), false);
  assert.equal(choices.find((choice) => choice.value === 'deepseek-v4-beta').name, 'deepseek-v4 beta');
  assert.throws(() => getStrategyEnvironment('deepseek-v4', 'routerlab'), /Unknown strategy/);
  assert.equal(choices.find((choice) => choice.value === 'default').description, 'Standard behavior. Claude decides which model to use.');
  assert.equal(choices.find((choice) => choice.value === 'claude-gpt').name, 'OpenAI GPT');
  assert.equal(choices.find((choice) => choice.value === 'claude-gpt').description, 'Opus => GPT 5.5, Sonnet => GPT 5.4, Haiku/subagents => GPT 5.4 mini.');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-MiniMax-M3').name, 'MiniMax-M3 beta');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-qwen3.7-max').name, 'qwen3.7-max');
  assert.equal(getStrategyDisplayName('claude-qwen3.7-max', 'llm'), 'qwen3.7-max');
  assert.equal(getStrategyChoices([], 'llm').find((choice) => choice.value === 'claude-qwen3.7-max').description, 'Uses claude-qwen3.7-max for main model aliases and claude-qwen3.6-flash for subagents.');

  assert.equal(assessStrategyLaunch('aws', [
    'aws-claude-haiku-4-5-20251001',
    'aws-claude-sonnet-4-6',
    'aws-claude-opus-4-8',
  ], 'routerlab').ready, true);
  assert.equal(assessStrategyLaunch('aws', [
    'aws-claude-sonnet-4-6',
  ], 'routerlab').ready, false);
  assert.equal(assessStrategyLaunch('claude', [
    'claude-sonnet-4-6',
  ], 'llm').ready, true);
  assert.deepEqual(assessStrategyLaunch('claude', [
    'claude-sonnet-4-6',
  ], 'llm').missingModels, []);
});

test('Claude Code launch environment disables experimental betas only for the child process', () => {
  const original = process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS;
  delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS;
  try {
    const env = buildClaudeCodeEnvironment('valid-token-with-enough-length', requireServiceConfig('llm'), 'claude');
    assert.equal(env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, '1');
    assert.equal(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, undefined);
  } finally {
    if (original === undefined) {
      delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS;
    } else {
      process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = original;
    }
  }
});

test('Claude Desktop helper identifies visible model ids and rejects hidden direct strategy ids', () => {
  assert.equal(isClaudeDesktopSafeModelId('claude-sonnet-4-6'), true);
  assert.equal(isClaudeDesktopSafeModelId('anthropic/claude-opus-4.8'), true);
  assert.equal(isClaudeDesktopSafeModelId('aws-claude-sonnet-4-6'), true);
  assert.equal(isClaudeDesktopSafeModelId('cursor-aws-opus-4-7'), true);
  assert.equal(isClaudeDesktopSafeModelId('claude-gpt-5.5'), false);
  assert.throws(() => modelSpecsForDirectStrategy('claude-gpt', 'routerlab'), /may hide/);
});

test('Claude Desktop proxy routes expose valid Anthropic route ids and map to RouterLab strategy models', () => {
  const routes = modelRoutesForProxyStrategy('claude-gpt', 'routerlab');
  assert.deepEqual(routes.map((route) => route.routeId), [
    'claude-5.4-mini',
    'claude-5.4',
    'claude-5.5',
  ]);
  assert.deepEqual(routes.map((route) => route.upstreamModel), [
    'claude-gpt-5.4-mini',
    'claude-gpt-5.4',
    'claude-gpt-5.5',
  ]);
  assert.deepEqual(routes.map((route) => route.labelOverride), [
    'gpt-5.4-mini',
    'gpt-5.4',
    'gpt-5.5',
  ]);
  assert.deepEqual(routes.map((route) => route.supports1m), [
    false,
    true,
    true,
  ]);
  assert.equal(desktopRouteIdForStrategyModel('opus', 'claude-gpt-5.5'), 'claude-5.5');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-gpt-5.4'), 'claude-5.4');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'claude-gpt-5.4-mini'), 'claude-5.4-mini');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-gpt-5.5-sp'), 'claude-5.5-sp');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'claude-gpt-5.4-mini-sp'), 'claude-5.4-mini-sp');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'claude-haiku-4-5-20251001'), 'claude-haiku-4-5');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'aws-claude-haiku-4-5-20251001'), 'aws-claude-haiku-4-5');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-kimi-k2.6'), 'claude-kim2.6');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-glm-5.1'), 'claude-lm5.1');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-deepseek-v4-pro'), 'claude-sonnet-4-6');
  assert.equal(supportsOneMillionContext('claude-haiku-4-5-20251001'), false);
  assert.equal(supportsOneMillionContext('aws-claude-haiku-4-5-20251001'), false);
  assert.equal(supportsOneMillionContext('claude-gpt-5.4-mini'), false);
  assert.equal(supportsOneMillionContext('claude-gpt-5.4'), true);
  assert.equal(supportsOneMillionContext('claude-kimi-k2.6'), false);
  assert.equal(supportsOneMillionContext('claude-glm-5.1'), false);
});

test('Claude Desktop default local mapping exposes the selected RouterLab catalog', () => {
  assert.deepEqual(DESKTOP_MAPPING_STRATEGIES.routerlab, [
    'default',
    'aws',
    'claude-gpt',
    'claude-kimi-k2.6',
    'glm-5.1',
  ]);
  assert.deepEqual(DESKTOP_MAPPING_STRATEGIES.llm, [
    'claude',
    'claude-gpt',
    'claude-gpt-special',
    'glm-5.1',
  ]);

  const routes = modelRoutesForDesktopMapping('routerlab');
  assert.deepEqual([...new Set(routes.map((route) => route.strategyValue))], [
    'default',
    'aws',
    'claude-gpt',
    'claude-kimi-k2.6',
    'glm-5.1',
  ]);
  assert.deepEqual(routes.map((route) => route.routeId), [
    'claude-opus-4-8',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'aws-claude-opus-4-8',
    'aws-claude-sonnet-4-6',
    'aws-claude-haiku-4-5',
    'claude-5.5',
    'claude-5.4',
    'claude-5.4-mini',
    'claude-kim2.6',
    'claude-lm5.1',
  ]);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-opus-4-8' && route.labelOverride === 'claude-opus-4-8'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-sonnet-4-6' && route.labelOverride === 'claude-sonnet-4-6'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-haiku-4-5' && route.labelOverride === 'claude-haiku-4-5' && route.supports1m === false), true);
  assert.equal(routes.some((route) => route.strategyValue === 'aws' && route.routeId === 'aws-claude-opus-4-8' && route.labelOverride === 'aws-claude-opus-4-8'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'aws' && route.routeId === 'aws-claude-sonnet-4-6' && route.labelOverride === 'aws-claude-sonnet-4-6'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'aws' && route.routeId === 'aws-claude-haiku-4-5' && route.labelOverride === 'aws-claude-haiku-4-5' && route.supports1m === false), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-5.5' && route.labelOverride === 'gpt-5.5'), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-kim2.6' && route.labelOverride === 'Kimi K2.6' && route.supports1m === false), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-lm5.1' && route.labelOverride === 'glm-5.1' && route.supports1m === false), true);
  assert.equal(new Set(routes.map((route) => route.routeId)).size, routes.length);

  const llmRoutes = modelRoutesForDesktopMapping('llm');
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-haiku-4-5-gpt-special'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-sonnet-4-6-gpt-special'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.5-sp' && route.labelOverride === 'gpt-5.5-sp'), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.4-mini-sp' && route.labelOverride === 'gpt-5.4-mini-sp' && route.supports1m === false), true);
});


test('model payload extraction supports common response shapes', () => {
  assert.deepEqual(extractModelIds({ data: [{ id: 'a' }, { name: 'b' }] }), ['a', 'b']);
  assert.deepEqual(extractModelIds({ models: ['c'] }), ['c']);
});

test('token format validation catches obvious mistakes', () => {
  assert.equal(validateTokenFormat('').valid, false);
  assert.equal(validateTokenFormat('short').valid, false);
  assert.equal(validateTokenFormat('valid-token-with-enough-length').valid, true);
});

test('Codex template uses provider-scoped model provider config', () => {
  assert.deepEqual(CODEX_ROUTERLAB_MODELS, [
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.3-codex',
    'gpt-5.4-mini',
    'minimax-m2.7',
    'glm-5.1',
  ]);
  const config = buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.3-codex',
  });
  assert.match(config, /model_provider = "custom"/);
  assert.match(config, /model = "gpt-5\.3-codex"/);
  assert.match(config, /\[model_providers\.custom\]/);
  assert.match(config, /wire_api = "responses"/);
  assert.match(config, /base_url = "https:\/\/api\.routerlab\.ch\/v1"/);
});

test('Codex apply writes config atomically without touching auth state', (t) => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-codex-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const paths = {
    configDir: tempDir,
    authPath: path.join(tempDir, 'auth.json'),
    configPath: path.join(tempDir, 'config.toml'),
  };
  const auth = { OPENAI_API_KEY: 'existing-key', tokens: { chatgpt: true } };
  fs.writeFileSync(paths.authPath, JSON.stringify(auth), 'utf8');

  const dryRun = applyCodexConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.5',
    paths,
  });
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.changed, true);
  assert.equal(fs.existsSync(paths.configPath), false);

  const applied = applyCodexConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.5',
    paths,
    dryRun: false,
  });
  assert.equal(applied.dryRun, false);
  assert.equal(applied.authPreserved, true);
  assert.match(fs.readFileSync(paths.configPath, 'utf8'), /base_url = "https:\/\/api\.routerlab\.ch\/v1"/);
  assert.deepEqual(JSON.parse(fs.readFileSync(paths.authPath, 'utf8')), auth);
});

test('Codex apply writes model_catalog_json when Codex model cache is available', (t) => {
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
  assert.equal(catalog.models[2].slug, 'gpt-5.3-codex');
  assert.equal(catalog.models[2].display_name, 'GPT 5.3 Codex');
  assert.deepEqual(catalog.models[2].additional_speed_tiers, []);
  assert.equal(catalog.models[2].availability_nux, null);
  assert.deepEqual(catalog.models[2].model_messages, { instructions_template: 'template' });

  const applied = applyCodexConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.5',
    paths,
    dryRun: false,
  });
  assert.equal(applied.catalogWritten, true);
  assert.match(fs.readFileSync(paths.configPath, 'utf8'), /model_catalog_json = /);
  const written = JSON.parse(fs.readFileSync(paths.modelCatalogPath, 'utf8'));
  assert.equal(written.models[2].slug, 'gpt-5.3-codex');
});

test('default menu exposes Claude Code and Claude Desktop', () => {
  const labels = MAIN_MENU_ITEMS.map((item) => item.label);
  assert.deepEqual(labels, ['Claude Code', 'Claude Desktop', 'Codex CLI', 'Auth', 'Doctor', 'Quit']);
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '1').value, 'claude-code');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '3').value, 'codex');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '5').value, 'doctor');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, 'Claude Desktop').value, 'claude-desktop');
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Claude Code/);
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Claude Desktop/);
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, 'Codex CLI').value, 'codex');
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Codex CLI/);
  assert.match(formatBanner('ScioNos Wrapper', '1.0.0'), /ScioNos Wrapper/);
  assert.doesNotMatch(formatBanner('ScioNos Wrapper', '1.0.0'), /ScioNos\s+✕\s+Claude Code/);
  assert.deepEqual(formatSelectChoice(MAIN_MENU_ITEMS[0]), {
    name: 'Claude Code',
    value: 'claude-code',
    description: 'Launch Claude Code through RouterLab.',
    short: 'Claude Code',
  });
});

test('wrapper options without a command keep the user in the main menu', () => {
  assert.equal(shouldOpenInteractiveMenu(parseOptions([])), true);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--service', 'llm'])), true);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--service', 'llm', '--strategy', 'claude-gpt'])), true);
  assert.equal(parseOptions(['codex', 'apply', '--model', 'gpt-5.3-codex']).model, 'gpt-5.3-codex');
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['--', '-p', 'hello'])), false);
  assert.equal(shouldOpenInteractiveMenu(parseOptions(['-p', 'hello'])), false);
});

test('Claude Desktop menu keeps only the simple customer actions', () => {
  assert.deepEqual(CLAUDE_DESKTOP_MENU_ITEMS.map((item) => item.value), [
    'proxy',
    'restore-official',
    'status',
    'back',
  ]);
  assert.deepEqual(formatSelectChoice(CLAUDE_DESKTOP_MENU_ITEMS[0]), {
    name: 'Start Local Mapping',
    value: 'proxy',
    description: 'Configure the selected Desktop mapping and run the local proxy.',
    short: 'Start Local Mapping',
  });
});

test('Codex CLI menu exposes config and model actions', () => {
  assert.deepEqual(CODEX_MENU_ITEMS.map((item) => item.value), [
    'apply',
    'model',
    'template',
    'status',
    'back',
  ]);
  assert.deepEqual(formatSelectChoice(CODEX_MENU_ITEMS[1]), {
    name: 'Choose Default Model',
    value: 'model',
    description: 'Select the default Codex CLI model.',
    short: 'Choose Default Model',
  });
});

test('Claude Code launch screens use wrapper-branded guided layout', () => {
  const intro = formatClaudeCodeIntro('1.0.0');
  assert.match(intro, /ScioNos Wrapper/);
  assert.match(intro, /Quick commands/);
  assert.doesNotMatch(intro, /ScioNos\s+✕\s+Claude Code/);

  const menu = formatClaudeCodeChoiceMenu('Select Model Strategy:', [
    {
      name: 'Claude Native',
      value: 'default',
      description: 'Standard behavior. Claude decides which model to use.',
    },
    {
      name: 'OpenAI GPT',
      value: 'claude-gpt',
      description: 'Opus => GPT 5.5, Sonnet => GPT 5.4, Haiku/subagents => GPT 5.4 mini.',
    },
  ]);
  assert.match(menu, /Select Model Strategy:/);
  assert.match(menu, /1\. Claude Native/);
  assert.match(menu, /Standard behavior\. Claude decides which model to use\./);
  assert.match(menu, /2\. OpenAI GPT/);
});

test('Claude Desktop proxy exposes mapped model list', async () => {
  const { server } = createClaudeDesktopProxy({
    serviceValue: 'routerlab',
    strategyValue: 'claude-gpt',
    strategyValues: DESKTOP_MAPPING_STRATEGIES.routerlab,
    routerlabToken: 'valid-token-with-enough-length',
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/models`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.some((model) => model.id === 'claude-opus-4-8'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-sonnet-4-6'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-haiku-4-5' && !model.supports1m), true);
    assert.equal(payload.data.some((model) => model.id === 'aws-claude-haiku-4-5' && !model.supports1m), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-5.4-mini'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-kim2.6' && !model.supports1m), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-lm5.1' && !model.supports1m), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
