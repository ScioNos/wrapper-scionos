import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyDirectClaudeDesktop, buildGatewayProfile, DESKTOP_MAPPING_STRATEGIES, desktopRouteIdForStrategyModel, getClaudeDesktopPaths, isClaudeDesktopSafeModelId, isClaudeDesktopSupportedPlatform, modelRoutesForDesktopMapping, modelRoutesForProxyStrategy, modelSpecsForDirectStrategy, readClaudeDesktopProxyCredential, redactClaudeDesktopResult, restoreOfficialClaudeDesktop, supportsOneMillionContext } from '../src/apps/claude-desktop.js';

test('Claude Desktop helper identifies visible model ids and rejects hidden direct strategy ids', () => {
  assert.equal(isClaudeDesktopSafeModelId('claude-sonnet-4-6'), true);
  assert.equal(isClaudeDesktopSafeModelId('anthropic/claude-opus-4.8'), true);
  assert.equal(isClaudeDesktopSafeModelId('aws-claude-sonnet-4-6'), true);
  assert.equal(isClaudeDesktopSafeModelId('cursor-aws-opus-4-7'), true);
  assert.equal(isClaudeDesktopSafeModelId('claude-gpt-5.5'), false);
  assert.equal(isClaudeDesktopSafeModelId('gpt-5.5'), false);
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
    'claude-5.6-luna',
    'claude-5.6-terra',
    'claude-5.6-sol',
  ]);
  assert.deepEqual(routes.map((route) => route.upstreamModel), [
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
  ]);
  assert.deepEqual(routes.map((route) => route.labelOverride), [
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
  ]);
  assert.deepEqual(routes.map((route) => route.supports1m), [
    true,
    true,
    true,
  ]);
  assert.equal(desktopRouteIdForStrategyModel('opus', 'gpt-5.6-sol'), 'claude-5.6-sol');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'gpt-5.6-terra'), 'claude-5.6-terra');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'gpt-5.6-luna'), 'claude-5.6-luna');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'claude-fable-5'), 'claude-fable-5');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-sonnet-5'), 'claude-sonnet-5');
  assert.equal(desktopRouteIdForStrategyModel('opus', 'claude-gpt-5.5'), 'claude-5.5');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-gpt-5.4'), 'claude-5.4');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'claude-gpt-5.4-mini'), 'claude-5.4-mini');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'claude-haiku-4-5-20251001'), 'claude-haiku-4-5');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'aws-claude-haiku-4-5-20251001'), 'aws-claude-haiku-4-5');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-kimi-k2.7-code'), 'claude-kim2.7-code');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'kimi-k2.7'), 'claude-kim2.7');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-glm-5.1'), 'claude-lm5.1');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-glm-5.2'), 'claude-lm5.2');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'glm-5.2'), 'claude-lm5.2');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-deepseek-v4-pro'), 'claude-deev4-pro');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'deepseek-v4-pro'), 'claude-deev4-pro');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'claude-deepseek-v4-flash'), 'claude-deev4-flash');
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'deepseek-v4-flash'), 'claude-deev4-flash');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-MiniMax-M3'), 'claude-max-m3');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'MiniMax-M3'), 'claude-max-m3');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-qwen3.7-max'), 'claude-wen3.7-max');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'qwen3.7-max'), 'claude-wen3.7-max');
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
  assert.equal(supportsOneMillionContext('claude-kimi-k2.7-code'), false);
  assert.equal(supportsOneMillionContext('claude-glm-5.1'), false);
  assert.equal(supportsOneMillionContext('claude-glm-5.2'), false);
  assert.equal(supportsOneMillionContext('gpt-5.4-mini'), false);
  assert.equal(supportsOneMillionContext('gpt-5.4'), true);
  assert.equal(supportsOneMillionContext('gpt-5.6-sol'), true);
  assert.equal(supportsOneMillionContext('gpt-5.6-terra'), true);
  assert.equal(supportsOneMillionContext('gpt-5.6-luna'), true);
  assert.equal(supportsOneMillionContext('deepseek-v4-pro'), true);
  assert.equal(supportsOneMillionContext('deepseek-v4-flash'), true);
  assert.equal(supportsOneMillionContext('MiniMax-M3'), true);
  assert.equal(supportsOneMillionContext('qwen3.7-max'), true);
  assert.equal(supportsOneMillionContext('glm-5.2'), false);
});

test('Claude Desktop default local mapping exposes the selected RouterLab catalog', () => {
  assert.deepEqual(DESKTOP_MAPPING_STRATEGIES.routerlab, [
    'default',
    'aws',
    'claude-gpt',
    'claude-kimi-k2.7-code',
    'glm-5.2',
  ]);
  assert.deepEqual(DESKTOP_MAPPING_STRATEGIES.llm, [
    'claude',
    'claude-gpt',
    'glm-5.2',
    'claude-qwen3.7-max',
    'claude-MiniMax-M3',
    'deepseek-v4',
  ]);

  const routes = modelRoutesForDesktopMapping('routerlab');
  assert.deepEqual([...new Set(routes.map((route) => route.strategyValue))], [
    'default',
    'aws',
    'claude-gpt',
    'glm-5.2',
    'claude-kimi-k2.7-code',
  ]);
  assert.deepEqual(routes.map((route) => route.routeId), [
    'claude-opus-4-8',
    'claude-sonnet-5',
    'claude-fable-5',
    'aws-claude-opus-4-8',
    'aws-claude-sonnet-4-6',
    'aws-claude-haiku-4-5',
    'claude-5.6-sol',
    'claude-5.6-terra',
    'claude-5.6-luna',
    'claude-lm5.2',
    'claude-kim2.7',
  ]);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-opus-4-8' && route.labelOverride === 'claude-opus-4-8'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-sonnet-5' && route.labelOverride === 'claude-sonnet-5'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-fable-5' && route.labelOverride === 'claude-fable-5'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'aws' && route.routeId === 'aws-claude-opus-4-8' && route.labelOverride === 'aws-claude-opus-4-8'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'aws' && route.routeId === 'aws-claude-sonnet-4-6' && route.labelOverride === 'aws-claude-sonnet-4-6'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'aws' && route.routeId === 'aws-claude-haiku-4-5' && route.labelOverride === 'aws-claude-haiku-4-5' && route.supports1m === false), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-5.6-sol' && route.labelOverride === 'gpt-5.6-sol'), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-kim2.7' && route.labelOverride === 'kimi-k2.7' && route.supports1m === false), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-lm5.2' && route.labelOverride === 'glm-5.2' && route.supports1m === false), true);
  assert.equal(new Set(routes.map((route) => route.routeId)).size, routes.length);

  const llmRoutes = modelRoutesForDesktopMapping('llm');
  assert.deepEqual([...new Set(llmRoutes.map((route) => route.strategyValue))], [
    'claude',
    'claude-gpt',
    'glm-5.2',
    'claude-qwen3.7-max',
    'claude-MiniMax-M3',
    'deepseek-v4',
  ]);
  assert.deepEqual(llmRoutes.map((route) => route.routeId), [
    'claude-opus-4-8',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'claude-5.6-sol',
    'claude-lm5.2',
    'claude-wen3.7-max',
    'claude-max-m3',
    'claude-deev4-pro',
    'claude-deev4-flash',
    'claude-5.6-terra-pro',
    'claude-5.6-sol-pro',
  ]);
  assert.equal(llmRoutes.some((route) => (
    route.routeId === 'claude-haiku-4-5'
      && route.upstreamModel === 'claude-haiku-4-5-20251001'
      && route.supports1m === false
  )), true);
  assert.equal(llmRoutes.some((route) => route.upstreamModel === 'claude-opus-4-6'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-haiku-4-5-gpt-special'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-sonnet-4-6-gpt-special'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.5-sp'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.4-mini-sp'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.6-sol-pro' && route.upstreamModel === 'gpt-5.6-sol-pro' && route.labelOverride === 'gpt-5.6-sol-pro'), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-deev4-pro' && route.upstreamModel === 'deepseek-v4-pro' && route.labelOverride === 'deepseek-v4-pro' && route.supports1m === true), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-deev4-flash' && route.upstreamModel === 'deepseek-v4-flash' && route.labelOverride === 'deepseek-v4-flash' && route.supports1m === true), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-max-m3' && route.upstreamModel === 'MiniMax-M3' && route.labelOverride === 'MiniMax-M3' && route.supports1m === true), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-wen3.7-max' && route.upstreamModel === 'qwen3.7-max' && route.labelOverride === 'qwen3.7-max' && route.supports1m === true), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-wen3.6-flash'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-lm5.2' && route.upstreamModel === 'glm-5.2' && route.labelOverride === 'glm-5.2' && route.supports1m === false), true);
});

test('Claude Desktop direct application and restore write versioned metadata atomically', (t) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-desktop-direct-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const paths = {
    normalConfigPath: path.join(dir, 'normal.json'),
    threepConfigPath: path.join(dir, 'threep.json'),
    configLibraryPath: dir,
    profilePath: path.join(dir, 'profile.json'),
    metaPath: path.join(dir, '_meta.json'),
  };
  const applied = applyDirectClaudeDesktop({
    serviceValue: 'routerlab', strategyValue: 'default', token: 'secret-token', dryRun: false, paths,
  });
  assert.equal(applied.dryRun, false);
  assert.equal(JSON.parse(fs.readFileSync(paths.normalConfigPath)).deploymentMode, '3p');
  assert.equal(JSON.parse(fs.readFileSync(paths.metaPath)).wrapperScionos.mode, 'direct');
  assert.equal(redactClaudeDesktopResult(applied).profile.inferenceGatewayApiKey, '[redacted]');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    for (const filePath of [paths.normalConfigPath, paths.threepConfigPath, paths.profilePath, paths.metaPath]) {
      assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    }
  }

  const restored = restoreOfficialClaudeDesktop({ dryRun: false, paths });
  assert.equal(restored.dryRun, false);
  assert.equal(fs.existsSync(paths.profilePath), false);
  assert.equal(JSON.parse(fs.readFileSync(paths.normalConfigPath)).deploymentMode, '1p');
  assert.equal(JSON.parse(fs.readFileSync(paths.metaPath)).wrapperScionos, undefined);
});

test('Claude Desktop fails closed when private directory permissions cannot be enforced', (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX permission enforcement');
    return;
  }
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-desktop-permissions-'));
  fs.chmodSync(dir, 0o777);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const chmodSync = fs.chmodSync;
  fs.chmodSync = () => {};
  t.after(() => { fs.chmodSync = chmodSync; });
  const paths = {
    normalConfigPath: path.join(dir, 'normal.json'),
    threepConfigPath: path.join(dir, 'threep.json'),
    configLibraryPath: dir,
    profilePath: path.join(dir, 'profile.json'),
    metaPath: path.join(dir, '_meta.json'),
  };

  assert.throws(() => applyDirectClaudeDesktop({
    serviceValue: 'routerlab', strategyValue: 'default', token: 'secret-token', dryRun: false, paths,
  }), /expected mode 700/);
  assert.equal(fs.existsSync(paths.profilePath), false);
});
test('Claude Desktop profile helpers cover model specs, redaction, and invalid credentials', (t) => {
  const profile = buildGatewayProfile({
    baseUrl: 'http://127.0.0.1:1', apiKey: 'secret',
    modelSpecs: [{ name: 'claude-sonnet-5', labelOverride: 'Sonnet', supports1m: true }, { name: 'claude-haiku-4-5' }],
  });
  assert.equal(profile.inferenceModels[0].labelOverride, 'Sonnet');
  assert.equal(profile.inferenceModels[1], 'claude-haiku-4-5');
  assert.equal(modelSpecsForDirectStrategy('aws', 'routerlab').length, 3);
  assert.equal(redactClaudeDesktopResult(null), null);
  assert.throws(() => getClaudeDesktopPaths({}, 'freebsd'), /supported only/);

  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-invalid-profile-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const profilePath = path.join(dir, 'profile.json');
  fs.writeFileSync(profilePath, '{"inferenceGatewayApiKey":"x","inferenceGatewayBaseUrl":"not a url"}');
  assert.equal(readClaudeDesktopProxyCredential({ profilePath, metaPath: path.join(dir, 'missing.json') }), null);
});
