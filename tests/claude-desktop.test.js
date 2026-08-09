import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyProxyClaudeDesktop,
  buildGatewayProfile,
  buildLoopbackUrl,
  buildVerifiedClaudeDesktopRoutes,
  DESKTOP_MAPPING_STRATEGIES,
  desktopRouteIdForStrategyModel,
  getClaudeDesktopPaths,
  isClaudeDesktopSupportedPlatform,
  modelRoutesForDesktopMapping,
  modelRoutesForProxyStrategy,
  readClaudeDesktopProxyCredential,
  readClaudeDesktopStatus,
  redactClaudeDesktopResult,
  restoreOfficialClaudeDesktop,
} from '../src/apps/claude-desktop.js';

const LOCAL_TOKEN = 'A'.repeat(43);

function verifiedRoutes(serviceValue = 'routerlab', strategyValues = DESKTOP_MAPPING_STRATEGIES[serviceValue]) {
  const configured = modelRoutesForDesktopMapping(serviceValue, strategyValues);
  return buildVerifiedClaudeDesktopRoutes({
    serviceValue,
    strategyValue: null,
    strategyValues,
    models: configured.map((route) => route.upstreamModel),
    modelMetadata: configured.map((route) => ({
      id: route.upstreamModel,
      contextWindow: 1_000_000,
      contextWindowVerified: true,
      raw: { id: route.upstreamModel },
    })),
  });
}

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
    undefined,
    undefined,
    undefined,
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
  assert.equal(desktopRouteIdForStrategyModel('haiku', 'aws-claude-haiku-4-5'), 'aws-claude-haiku-4-5');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'aws-claude-sonnet-5'), 'aws-claude-sonnet-5');
  assert.equal(desktopRouteIdForStrategyModel('opus', 'aws-claude-opus-5'), 'aws-claude-opus-5');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'kimi-k3'), 'claude-kim3');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-glm-5.1'), 'claude-lm5.1');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-glm-5.2'), 'claude-lm5.2');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'glm-5.2'), 'claude-lm5.2');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'deepseek-v4-flash-0731'), 'claude-deev4-flash-0731');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-MiniMax-M3'), 'claude-max-m3');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'MiniMax-M3'), 'claude-max-m3');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'claude-qwen3.7-max'), 'claude-wen3.7-max');
  assert.equal(desktopRouteIdForStrategyModel('sonnet', 'qwen3.7-max'), 'claude-wen3.7-max');
  assert.equal(desktopRouteIdForStrategyModel('subagent', 'claude-qwen3.6-flash'), 'claude-wen3.6-flash');
});

test('Claude Desktop default local mapping exposes the selected RouterLab catalog', () => {
  assert.deepEqual(DESKTOP_MAPPING_STRATEGIES.routerlab, [
    'default',
    'aws',
    'claude-gpt',
    'deepseek-v4-flash-0731',
    'kimi-k3',
    'glm-5.2',
    'minimax-m3',
  ]);
  assert.deepEqual(DESKTOP_MAPPING_STRATEGIES.llm, [
    'claude',
    'claude-gpt',
    'qwen3.8-max',
    'kimi-k3',
    'minimax-m3',
    'grok-4.5',
    'glm-5.2',
    'deepseek-v4-flash-0731',
  ]);

  const routes = modelRoutesForDesktopMapping('routerlab');
  assert.deepEqual([...new Set(routes.map((route) => route.strategyValue))], [
    'default',
    'aws',
    'claude-gpt',
    'glm-5.2',
    'kimi-k3',
    'minimax-m3',
    'deepseek-v4-flash-0731',
  ]);
  assert.deepEqual(routes.map((route) => route.routeId), [
    'claude-fable-5',
    'claude-opus-5',
    'claude-sonnet-5',
    'claude-haiku-4-5',
    'aws-claude-opus-5',
    'aws-claude-sonnet-5',
    'aws-claude-haiku-4-5',
    'claude-5.6-sol',
    'claude-5.6-terra',
    'claude-5.6-luna',
    'claude-lm5.2',
    'claude-kim3',
    'claude-max-m3',
    'claude-deev4-flash-0731',
  ]);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-opus-5' && route.labelOverride === 'claude-opus-5'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-sonnet-5' && route.labelOverride === 'claude-sonnet-5'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-fable-5' && route.labelOverride === 'claude-fable-5'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'default' && route.routeId === 'claude-haiku-4-5' && route.upstreamModel === 'claude-haiku-4-5-20251001'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'aws' && route.routeId === 'aws-claude-opus-5' && route.labelOverride === 'aws-claude-opus-5'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'aws' && route.routeId === 'aws-claude-sonnet-5' && route.labelOverride === 'aws-claude-sonnet-5'), true);
  assert.equal(routes.some((route) => route.strategyValue === 'aws' && route.routeId === 'aws-claude-haiku-4-5' && route.labelOverride === 'aws-claude-haiku-4-5' && !Object.hasOwn(route, 'supports1m')), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-5.6-sol' && route.labelOverride === 'gpt-5.6-sol'), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-kim3' && route.labelOverride === 'kimi-k3' && !Object.hasOwn(route, 'supports1m')), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-lm5.2' && route.labelOverride === 'glm-5.2' && !Object.hasOwn(route, 'supports1m')), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-max-m3' && route.upstreamModel === 'minimax-m3'), true);
  assert.equal(routes.some((route) => route.routeId === 'claude-deev4-flash-0731' && route.upstreamModel === 'deepseek-v4-flash-0731'), true);
  assert.equal(new Set(routes.map((route) => route.routeId)).size, routes.length);

  const llmRoutes = modelRoutesForDesktopMapping('llm');
  assert.deepEqual([...new Set(llmRoutes.map((route) => route.strategyValue))], [
    'claude',
    'claude-gpt',
    'glm-5.2',
    'qwen3.8-max',
    'kimi-k3',
    'minimax-m3',
    'grok-4.5',
    'deepseek-v4-flash-0731',
  ]);
  assert.deepEqual(llmRoutes.map((route) => route.routeId), [
    'claude-fable-5',
    'claude-opus-5',
    'claude-sonnet-5',
    'claude-5.6-sol',
    'claude-5.6-terra',
    'claude-5.6-luna',
    'claude-lm5.2',
    'claude-wen3.8-max',
    'claude-kim3',
    'claude-max-m3',
    'claude-grok4.5',
    'claude-deev4-flash-0731',
  ]);
  assert.equal(llmRoutes.some((route) => (
    route.routeId === 'claude-fable-5'
      && route.upstreamModel === 'claude-fable-5'
      && !Object.hasOwn(route, 'supports1m')
  )), true);
  assert.equal(llmRoutes.some((route) => route.upstreamModel === 'claude-opus-4-6'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-haiku-4-5-gpt-special'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-sonnet-5-gpt-special'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.5-sp'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.4-mini-sp'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-5.6-luna' && route.upstreamModel === 'gpt-5.6-luna' && route.labelOverride === 'gpt-5.6-luna'), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-deev4-flash-0731' && route.upstreamModel === 'deepseek-v4-flash-0731' && route.labelOverride === 'deepseek-v4-flash-0731' && !Object.hasOwn(route, 'supports1m')), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-max-m3' && route.upstreamModel === 'minimax-m3' && route.labelOverride === 'minimax-m3' && !Object.hasOwn(route, 'supports1m')), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-wen3.8-max' && route.upstreamModel === 'qwen3.8-max' && route.labelOverride === 'qwen3.8-max' && !Object.hasOwn(route, 'supports1m')), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-kim3' && route.upstreamModel === 'kimi-k3' && route.labelOverride === 'kimi-k3' && !Object.hasOwn(route, 'supports1m')), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-grok4.5' && route.upstreamModel === 'grok-4.5' && route.labelOverride === 'grok-4.5' && !Object.hasOwn(route, 'supports1m')), true);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-wen3.6-flash'), false);
  assert.equal(llmRoutes.some((route) => route.routeId === 'claude-lm5.2' && route.upstreamModel === 'glm-5.2' && route.labelOverride === 'glm-5.2' && !Object.hasOwn(route, 'supports1m')), true);
});

test('Claude Desktop proxy application and restore write v2 metadata without RouterLab token', (t) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-desktop-proxy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const paths = {
    normalConfigPath: path.join(dir, 'normal.json'),
    threepConfigPath: path.join(dir, 'threep.json'),
    configLibraryPath: dir,
    profilePath: path.join(dir, 'profile.json'),
    metaPath: path.join(dir, '_meta.json'),
  };
  fs.writeFileSync(paths.normalConfigPath, JSON.stringify({ foreignNormal: true }));
  fs.writeFileSync(paths.threepConfigPath, JSON.stringify({ foreignThreep: true }));
  fs.writeFileSync(paths.metaPath, JSON.stringify({ foreignMeta: true, entries: [{ id: 'foreign' }] }));
  const applied = applyProxyClaudeDesktop({
    serviceValue: 'routerlab',
    strategyValue: 'default',
    strategyValues: DESKTOP_MAPPING_STRATEGIES.routerlab,
    routes: verifiedRoutes(),
    gatewayToken: LOCAL_TOKEN,
    dryRun: false,
    paths,
  });
  assert.equal(applied.dryRun, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(paths.normalConfigPath)), {
    foreignNormal: true,
    deploymentMode: '3p',
  });
  assert.equal(JSON.parse(fs.readFileSync(paths.threepConfigPath)).foreignThreep, true);
  const metadataText = fs.readFileSync(paths.metaPath, 'utf8');
  const metadata = JSON.parse(metadataText).wrapperScionos;
  assert.equal(JSON.parse(metadataText).foreignMeta, true);
  assert.equal(JSON.parse(metadataText).entries.some((entry) => entry.id === 'foreign'), true);
  assert.equal(metadata.schemaVersion, 2);
  assert.equal(metadata.mode, 'proxy');
  assert.equal(metadataText.includes('secret-token'), false);
  assert.equal(metadataText.includes(LOCAL_TOKEN), false);
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

  assert.throws(() => applyProxyClaudeDesktop({
    serviceValue: 'routerlab',
    strategyValue: 'default',
    routes: verifiedRoutes('routerlab', ['default']),
    gatewayToken: LOCAL_TOKEN,
    dryRun: false,
    paths,
  }), /expected mode 700/);
  assert.equal(fs.existsSync(paths.profilePath), false);
});
test('Claude Desktop profile helpers cover model specs, redaction, and invalid credentials', (t) => {
  const profile = buildGatewayProfile({
    baseUrl: 'http://127.0.0.1:1', apiKey: 'secret',
    modelSpecs: [{ name: 'claude-sonnet-5', labelOverride: 'Sonnet', supports1m: true }, { name: 'claude-haiku-4-5' }],
  });
  assert.deepEqual(profile.coworkEgressAllowedHosts, ['127.0.0.1']);
  assert.equal(profile.inferenceModels[0].labelOverride, 'Sonnet');
  assert.equal(profile.inferenceModels[1], 'claude-haiku-4-5');
  assert.deepEqual(buildGatewayProfile({
    baseUrl: 'http://[::1]:15721', apiKey: 'secret',
  }).coworkEgressAllowedHosts, ['::1']);
  assert.deepEqual(buildGatewayProfile({
    baseUrl: 'https://api.routerlab.ch/gateway', apiKey: 'secret',
  }).coworkEgressAllowedHosts, ['api.routerlab.ch']);
  assert.throws(() => buildGatewayProfile({
    baseUrl: 'file:///tmp/routerlab', apiKey: 'secret',
  }), /must use HTTP or HTTPS/);
  assert.equal(redactClaudeDesktopResult(null), null);
  assert.throws(() => getClaudeDesktopPaths({}, 'freebsd'), /supported only/);
  assert.throws(() => buildLoopbackUrl('127.attacker.test', 15721), /Invalid loopback host/);
  assert.throws(() => buildLoopbackUrl('127.0.0.1', 0), /Invalid loopback port/);
  assert.equal(buildLoopbackUrl('[::1]', 15721), 'http://[::1]:15721');

  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-invalid-profile-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const profilePath = path.join(dir, 'profile.json');
  fs.writeFileSync(profilePath, '{"inferenceGatewayApiKey":"x","inferenceGatewayBaseUrl":"not a url"}');
  assert.equal(readClaudeDesktopProxyCredential({ profilePath, metaPath: path.join(dir, 'missing.json') }), null);
});

test('Claude Desktop status distinguishes healthy, unapplied, and corrupt profiles', (t) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-desktop-status-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const paths = {
    normalConfigPath: path.join(dir, 'normal.json'),
    threepConfigPath: path.join(dir, 'threep.json'),
    configLibraryPath: dir,
    profilePath: path.join(dir, 'profile.json'),
    metaPath: path.join(dir, '_meta.json'),
  };

  const missing = readClaudeDesktopStatus(paths);
  assert.equal(missing.configured, false);
  assert.equal(missing.profileExists, false);
  assert.equal(missing.applied, false);
  assert.equal(missing.healthy, false);
  assert.deepEqual(missing.issues, ['profile_missing', 'profile_not_applied', 'metadata_invalid']);

  applyProxyClaudeDesktop({
    serviceValue: 'routerlab',
    strategyValue: 'default',
    strategyValues: DESKTOP_MAPPING_STRATEGIES.routerlab,
    routes: verifiedRoutes(),
    gatewayToken: LOCAL_TOKEN,
    dryRun: false,
    paths,
  });
  const healthy = readClaudeDesktopStatus(paths);
  assert.equal(healthy.configured, true);
  assert.equal(healthy.profileExists, true);
  assert.equal(healthy.applied, true);
  assert.equal(healthy.healthy, true);
  assert.deepEqual(healthy.issues, []);
  assert.equal(healthy.profile.inferenceGatewayApiKey, '[redacted]');

  const meta = JSON.parse(fs.readFileSync(paths.metaPath, 'utf8'));
  delete meta.appliedId;
  fs.writeFileSync(paths.metaPath, JSON.stringify(meta));
  const unapplied = readClaudeDesktopStatus(paths);
  assert.equal(unapplied.healthy, false);
  assert.deepEqual(unapplied.issues, ['profile_not_applied']);

  fs.writeFileSync(paths.profilePath, '{not json');
  const corrupt = readClaudeDesktopStatus(paths);
  assert.equal(corrupt.configured, true);
  assert.equal(corrupt.healthy, false);
  assert.deepEqual(corrupt.issues, ['profile_invalid', 'profile_not_applied']);
});

test('verified Desktop routes expose only authorized models and explicit metadata', () => {
  const configured = modelRoutesForProxyStrategy('claude-gpt', 'routerlab');
  const routes = buildVerifiedClaudeDesktopRoutes({
    serviceValue: 'routerlab',
    strategyValue: 'claude-gpt',
    models: [configured[0].upstreamModel, configured[1].upstreamModel],
    modelMetadata: [
      {
        id: configured[0].upstreamModel,
        contextWindow: 1_000_000,
        contextWindowVerified: true,
        raw: { id: configured[0].upstreamModel, created_at: 123 },
      },
      {
        id: configured[1].upstreamModel,
        contextWindow: 2_000_000,
        contextWindowVerified: false,
        raw: { id: configured[1].upstreamModel },
      },
    ],
  });
  assert.equal(routes.length, 2);
  const explicitlyVerified = routes.find((route) => route.upstreamModel === configured[0].upstreamModel);
  const unverified = routes.find((route) => route.upstreamModel === configured[1].upstreamModel);
  assert.equal(explicitlyVerified.supports1m, true);
  assert.equal(explicitlyVerified.createdAt, 123);
  assert.equal(Object.hasOwn(unverified, 'supports1m'), false);
  assert.equal(Object.hasOwn(unverified, 'createdAt'), false);
  assert.throws(() => buildVerifiedClaudeDesktopRoutes({
    serviceValue: 'routerlab',
    strategyValue: 'claude-gpt',
    models: ['not-configured'],
  }), (error) => error.code === 'no_authorized_models');
});

test('invalid existing Desktop JSON is never overwritten', (t) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-desktop-invalid-json-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const paths = {
    normalConfigPath: path.join(dir, 'normal.json'),
    threepConfigPath: path.join(dir, 'threep.json'),
    configLibraryPath: dir,
    profilePath: path.join(dir, 'profile.json'),
    metaPath: path.join(dir, '_meta.json'),
  };
  fs.writeFileSync(paths.normalConfigPath, '{invalid');
  assert.throws(() => applyProxyClaudeDesktop({
    serviceValue: 'routerlab',
    strategyValue: 'default',
    routes: verifiedRoutes('routerlab', ['default']),
    gatewayToken: LOCAL_TOKEN,
    dryRun: false,
    paths,
  }), (error) => error.code === 'invalid_desktop_config');
  assert.equal(fs.readFileSync(paths.normalConfigPath, 'utf8'), '{invalid');
  assert.equal(fs.existsSync(paths.profilePath), false);
});

test('proxy credential parsing rejects deceptive loopback URLs and direct metadata', (t) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.test-desktop-credentials-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const profilePath = path.join(dir, 'profile.json');
  const metaPath = path.join(dir, '_meta.json');
  fs.writeFileSync(profilePath, JSON.stringify({
    inferenceGatewayApiKey: LOCAL_TOKEN,
    inferenceGatewayBaseUrl: 'http://127.attacker.test:15721',
  }));
  assert.equal(readClaudeDesktopProxyCredential({ profilePath, metaPath }), null);
  fs.writeFileSync(profilePath, JSON.stringify({
    inferenceGatewayApiKey: LOCAL_TOKEN,
    inferenceGatewayBaseUrl: 'http://127.0.0.1:15721/path',
  }));
  assert.equal(readClaudeDesktopProxyCredential({ profilePath, metaPath }), null);
  fs.writeFileSync(profilePath, JSON.stringify({
    inferenceGatewayApiKey: LOCAL_TOKEN,
    inferenceGatewayBaseUrl: 'http://127.0.0.1:15721',
  }));
  fs.writeFileSync(metaPath, JSON.stringify({ wrapperScionos: { schemaVersion: 1, mode: 'direct' } }));
  assert.equal(readClaudeDesktopProxyCredential({ profilePath, metaPath }), null);
});
