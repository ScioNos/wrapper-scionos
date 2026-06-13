import test from 'node:test';
import assert from 'node:assert/strict';
import { DESKTOP_MAPPING_STRATEGIES, desktopRouteIdForStrategyModel, getClaudeDesktopPaths, isClaudeDesktopSafeModelId, isClaudeDesktopSupportedPlatform, modelRoutesForDesktopMapping, modelRoutesForProxyStrategy, modelSpecsForDirectStrategy, supportsOneMillionContext } from '../src/apps/claude-desktop.js';

test('Claude Desktop helper identifies visible model ids and rejects hidden direct strategy ids', () => {
  assert.equal(isClaudeDesktopSafeModelId('claude-sonnet-4-6'), true);
  assert.equal(isClaudeDesktopSafeModelId('anthropic/claude-opus-4.8'), true);
  assert.equal(isClaudeDesktopSafeModelId('aws-claude-sonnet-4-6'), true);
  assert.equal(isClaudeDesktopSafeModelId('cursor-aws-opus-4-7'), true);
  assert.equal(isClaudeDesktopSafeModelId('claude-gpt-5.5'), false);
  assert.throws(() => modelSpecsForDirectStrategy('claude-gpt', 'routerlab'), /may hide/);
});

test('Claude Desktop helper supports claude-desktop-debian Linux config paths', () => {
  assert.equal(isClaudeDesktopSupportedPlatform('linux'), true);

  const paths = getClaudeDesktopPaths({
    HOME: '/home/alice',
    XDG_CONFIG_HOME: '/home/alice/.config',
  }, 'linux');

  assert.deepEqual(paths, {
    normalConfigPath: '/home/alice/.config/Claude/claude_desktop_config.json',
    threepConfigPath: '/home/alice/.config/Claude-3p/claude_desktop_config.json',
    configLibraryPath: '/home/alice/.config/Claude-3p/configLibrary',
    profilePath: '/home/alice/.config/Claude-3p/configLibrary/00000000-0000-4000-8000-000000157210.json',
    metaPath: '/home/alice/.config/Claude-3p/configLibrary/_meta.json',
  });
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
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-deepseek-v4-pro'), 'claude-deev4-pro');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'claude-deepseek-v4-flash'), 'claude-deev4-flash');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-MiniMax-M3'), 'claude-max-m3');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-qwen3.7-max'), 'claude-wen3.7-max');
  assert.equal(desktopRouteIdForStrategyModel('subagent', 'claude-qwen3.6-flash'), 'claude-wen3.6-flash');
  assert.equal(supportsOneMillionContext('claude-haiku-4-5-20251001'), false);
  assert.equal(supportsOneMillionContext('aws-claude-haiku-4-5-20251001'), false);
  assert.equal(supportsOneMillionContext('claude-gpt-5.4-mini'), false);
  assert.equal(supportsOneMillionContext('claude-gpt-5.4'), true);
  assert.equal(supportsOneMillionContext('claude-deepseek-v4-pro'), true);
  assert.equal(supportsOneMillionContext('claude-deepseek-v4-flash'), true);
  assert.equal(supportsOneMillionContext('claude-MiniMax-M3'), true);
  assert.equal(supportsOneMillionContext('claude-qwen3.7-max'), true);
  assert.equal(supportsOneMillionContext('claude-qwen3.6-flash'), true);
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
    'deepseek-v4-beta',
    'claude-MiniMax-M3',
    'claude-qwen3.7-max',
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
  assert.deepEqual([...new Set(llmRoutes.map((route) => route.strategyValue))], [
    'claude',
    'claude-gpt',
    'claude-gpt-special',
    'deepseek-v4-beta',
    'claude-MiniMax-M3',
    'claude-qwen3.7-max',
    'glm-5.1',
  ]);
  assert.deepEqual(llmRoutes.map((route) => route.routeId), [
    'claude-opus-4-8',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'claude-5.5',
    'claude-5.4',
    'claude-5.4-mini',
    'claude-5.5-sp',
    'claude-5.4-mini-sp',
    'claude-deev4-pro',
    'claude-deev4-flash',
    'claude-max-m3',
    'claude-wen3.7-max',
    'claude-wen3.6-flash',
    'claude-lm5.1',
  ]);
  assert.equal(llmRoutes.some((route) => (
    route.routeId === 'claude-haiku-4-5'
      && route.upstreamModel === 'claude-haiku-4-5-20251001'
      && route.supports1m === false
  )), true);
  assert.equal(llmRoutes.some((route) => route.upstreamModel === 'claude-opus-4-6'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-haiku-4-5-gpt-special'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-sonnet-4-6-gpt-special'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.5-sp' && route.labelOverride === 'gpt-5.5-sp'), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.4-mini-sp' && route.labelOverride === 'gpt-5.4-mini-sp' && route.supports1m === false), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-deev4-pro' && route.labelOverride === 'deepseek-v4-pro' && route.supports1m === true), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-deev4-flash' && route.labelOverride === 'deepseek-v4-flash' && route.supports1m === true), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-max-m3' && route.labelOverride === 'MiniMax-M3' && route.supports1m === true), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-wen3.7-max' && route.labelOverride === 'qwen3.7-max' && route.supports1m === true), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-wen3.6-flash' && route.labelOverride === 'qwen3.6-flash' && route.supports1m === true), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-lm5.1' && route.labelOverride === 'glm-5.1' && route.supports1m === false), true);
});
