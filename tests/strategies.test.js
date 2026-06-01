import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexThirdPartyConfig } from '../src/apps/codex.js';
import { createClaudeDesktopProxy } from '../src/apps/claude-desktop-proxy.js';
import { MAIN_MENU_ITEMS, formatMenu, resolveMenuChoice } from '../src/cli/menu.js';
import { desktopRouteIdForStrategyModel, isClaudeDesktopSafeModelId, modelRoutesForProxyStrategy, modelSpecsForDirectStrategy, supportsOneMillionContext } from '../src/apps/claude-desktop.js';
import { requireServiceConfig } from '../src/routerlab/services.js';
import { getStrategyEnvironment, getStrategyChoices } from '../src/routerlab/strategies.js';
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
});

test('service strategy lists stay scoped', () => {
  assert.deepEqual(getStrategyChoices([], 'routerlab').map((choice) => choice.value), [
    'default',
    'aws',
    'claude-gpt',
    'deepseek-v4',
    'claude-kimi-k2.6',
    'glm-5.1',
  ]);
  assert.deepEqual(getStrategyChoices([], 'llm').map((choice) => choice.value), [
    'claude',
    'claude-gpt',
    'claude-gpt-special',
    'deepseek-v4',
    'minimax-m2.7',
    'glm-5.1',
  ]);
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
    'claude-haiku-4-5',
    'claude-sonnet-4-6',
    'claude-opus-4-8',
  ]);
  assert.deepEqual(routes.map((route) => route.upstreamModel), [
    'claude-gpt-5.4-mini',
    'claude-gpt-5.4',
    'claude-gpt-5.5',
  ]);
  assert.deepEqual(routes.map((route) => route.supports1m), [
    false,
    true,
    true,
  ]);
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-deepseek-v4-pro'), 'claude-sonnet-4-6');
  assert.equal(supportsOneMillionContext('claude-gpt-5.4-mini'), false);
  assert.equal(supportsOneMillionContext('claude-gpt-5.4'), true);
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
  const config = buildCodexThirdPartyConfig({
    providerName: 'routerlab',
    baseUrl: 'https://api.routerlab.ch/v1',
    model: 'gpt-5.5',
  });
  assert.match(config, /model_provider = "custom"/);
  assert.match(config, /\[model_providers\.custom\]/);
  assert.match(config, /wire_api = "responses"/);
  assert.match(config, /base_url = "https:\/\/api\.routerlab\.ch\/v1"/);
});

test('default menu exposes Claude Code and Claude Desktop', () => {
  const labels = MAIN_MENU_ITEMS.map((item) => item.label);
  assert.deepEqual(labels.slice(0, 2), ['Claude Code', 'Claude Desktop']);
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, '1').value, 'claude-code');
  assert.equal(resolveMenuChoice(MAIN_MENU_ITEMS, 'Claude Desktop').value, 'claude-desktop');
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Claude Code/);
  assert.match(formatMenu('ScioNos Wrapper', MAIN_MENU_ITEMS), /Claude Desktop/);
});

test('Claude Desktop proxy exposes mapped model list', async () => {
  const { server } = createClaudeDesktopProxy({
    serviceValue: 'routerlab',
    strategyValue: 'claude-gpt',
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
    assert.deepEqual(payload.data.map((model) => model.id), [
      'claude-haiku-4-5',
      'claude-sonnet-4-6',
      'claude-opus-4-8',
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
