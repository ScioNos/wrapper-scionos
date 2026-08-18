import test from 'node:test';
import assert from 'node:assert/strict';
import { launchClaudeCode } from '../src/apps/claude-code.js';

const SUPPORTED_CLAUDE = {
  installed: true,
  cliPath: 'fake-claude',
  version: '2.1.220',
  versionSupported: true,
};

test('Claude Code targets the official service and receives the generated local proxy URL', async () => {
  const previousRouterlabBaseUrl = process.env.ROUTERLAB_BASE_URL;
  const previousAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  process.env.ROUTERLAB_BASE_URL = 'http://127.0.0.1:1';
  process.env.ANTHROPIC_BASE_URL = 'https://untrusted.example';
  const calls = {};
  try {
    const result = await launchClaudeCode({
      serviceValue: 'routerlab',
      strategyValue: 'claude-gpt',
      token: 'claude-code-token-with-enough-length',
      noPrompt: true,
      claudeArgs: ['--print'],
    }, {
      detectClaudeCodeFn: () => SUPPORTED_CLAUDE,
      fetchModelsFn: async (_token, options) => {
        calls.discovery = options;
        return { valid: true, models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'aws-claude-haiku-4-5'] };
      },
      chooseStrategyFn: async () => 'claude-gpt',
      startLongRunningLlmProxyFn: async (options) => {
        calls.proxy = options;
        return {
          baseUrl: 'http://127.0.0.1:43123',
          gatewayToken: 'generated-local-token',
          server: {},
        };
      },
      runInteractiveCliFn: async (cliPath, args, options) => {
        calls.child = { cliPath, args, env: options.env };
      },
      stopLongRunningLlmProxyFn: async (proxy, options) => {
        calls.stop = { proxy, options };
      },
    });

    assert.deepEqual(result, { kind: 'launched' });
    assert.equal(calls.discovery.baseUrl, 'https://api.routerlab.ch');
    assert.equal(calls.proxy.targetBaseUrl, 'https://api.routerlab.ch');
    assert.equal(calls.proxy.upstreamAuth, 'anthropic');
    assert.deepEqual(calls.proxy.allowedModels, ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'aws-claude-haiku-4-5']);
    assert.equal(calls.child.env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:43123');
    assert.equal(calls.child.env.ANTHROPIC_AUTH_TOKEN, 'generated-local-token');
    assert.equal(calls.child.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST, '1');
    assert.deepEqual(calls.child.args, ['--print']);
    assert.deepEqual(calls.stop.options, { graceMs: 2000 });
  } finally {
    if (previousRouterlabBaseUrl === undefined) delete process.env.ROUTERLAB_BASE_URL;
    else process.env.ROUTERLAB_BASE_URL = previousRouterlabBaseUrl;
    if (previousAnthropicBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = previousAnthropicBaseUrl;
  }
});

test('Claude Code refuses unsupported versions before resolving tokens or using the network', async () => {
  const calls = [];
  await assert.rejects(
    () => launchClaudeCode({
      serviceValue: 'routerlab',
      noPrompt: true,
      claudeArgs: [],
    }, {
      detectClaudeCodeFn: () => ({
        installed: true,
        cliPath: 'old-claude',
        version: '2.1.219',
        versionSupported: false,
      }),
      resolveTokenWithSourceFn: async () => {
        calls.push('token');
        return { token: 'should-not-be-read' };
      },
      fetchModelsFn: async () => {
        calls.push('discovery');
        return { valid: true, models: [] };
      },
    }),
    (error) => error.code === 'unsupported_claude_version' && /2\.1\.220/.test(error.message),
  );
  assert.deepEqual(calls, []);
});

test('every Claude Code model discovery failure is fail-closed before proxy and child startup', async () => {
  const failures = [
    { reason: 'redirect_not_allowed', status: 302, message: 'redirect refused' },
    { reason: 'timeout', message: 'timed out' },
    { reason: 'network_error', message: 'network unavailable' },
    { reason: 'invalid_response', message: 'invalid JSON' },
    { reason: 'server_error', status: 503, message: 'service unavailable' },
    { reason: 'models_unavailable', message: 'empty catalog' },
  ];
  for (const failure of failures) {
    let proxyStarts = 0;
    let childStarts = 0;
    await assert.rejects(
      () => launchClaudeCode({
        serviceValue: 'routerlab',
        strategyValue: 'default',
        token: 'discovery-token-with-enough-length',
        noPrompt: true,
        claudeArgs: [],
      }, {
        detectClaudeCodeFn: () => SUPPORTED_CLAUDE,
        fetchModelsFn: async () => ({ valid: false, ...failure }),
        startLongRunningLlmProxyFn: async () => {
          proxyStarts += 1;
        },
        runInteractiveCliFn: async () => {
          childStarts += 1;
        },
      }),
      (error) => error.code === 'model_discovery_failed',
    );
    assert.equal(proxyStarts, 0, failure.reason);
    assert.equal(childStarts, 0, failure.reason);
  }
});

test('Claude Code rejects a verified catalog with no authorized model', async () => {
  let proxyStarts = 0;
  await assert.rejects(
    () => launchClaudeCode({
      serviceValue: 'llm',
      strategyValue: 'claude',
      token: 'catalog-token-with-enough-length',
      noPrompt: true,
      claudeArgs: [],
    }, {
      detectClaudeCodeFn: () => SUPPORTED_CLAUDE,
      fetchModelsFn: async () => ({ valid: true, models: ['unapproved-model'] }),
      startLongRunningLlmProxyFn: async () => {
        proxyStarts += 1;
      },
    }),
    (error) => error.code === 'no_authorized_models' && !error.message.includes('catalog-token'),
  );
  assert.equal(proxyStarts, 0);
});

test('Claude Code accepts a verified RouterLab LLM subagent selection', async () => {
  const calls = {};
  await launchClaudeCode({
    serviceValue: 'llm',
    strategyValue: 'glm-5.2',
    subagentModel: 'deepseek-v4-flash-0731',
    token: 'llm-subagent-token-with-enough-length',
    noPrompt: true,
    claudeArgs: ['--print'],
  }, {
    detectClaudeCodeFn: () => SUPPORTED_CLAUDE,
    fetchModelsFn: async () => ({
      valid: true,
      models: ['glm-5.2', 'deepseek-v4-flash-0731'],
    }),
    chooseStrategyFn: async () => 'glm-5.2',
    startLongRunningLlmProxyFn: async (options) => {
      calls.proxy = options;
      return {
        baseUrl: 'http://127.0.0.1:43123',
        gatewayToken: 'generated-local-token',
        server: {},
      };
    },
    runInteractiveCliFn: async (_cliPath, _args, options) => {
      calls.env = options.env;
    },
    stopLongRunningLlmProxyFn: async () => {},
  });

  assert.deepEqual(calls.proxy.allowedModels, ['glm-5.2', 'deepseek-v4-flash-0731']);
  assert.equal(calls.env.CLAUDE_CODE_SUBAGENT_MODEL, 'deepseek-v4-flash-0731');
});

test('Claude Code preserves a child failure when proxy cleanup also fails', async () => {
  const childError = new Error('child startup failed');
  const cleanupError = new Error('proxy cleanup failed');
  let stops = 0;
  await assert.rejects(
    () => launchClaudeCode({
      serviceValue: 'routerlab',
      strategyValue: 'claude-gpt',
      token: 'lifecycle-token-with-enough-length',
      noPrompt: true,
      claudeArgs: [],
    }, {
      detectClaudeCodeFn: () => SUPPORTED_CLAUDE,
      fetchModelsFn: async () => ({
        valid: true,
        models: [
          'gpt-5.6-sol',
          'gpt-5.6-terra',
          'gpt-5.6-luna',
          'aws-claude-haiku-4-5',
        ],
      }),
      startLongRunningLlmProxyFn: async () => ({
        baseUrl: 'http://127.0.0.1:43123',
        gatewayToken: 'local-gateway-token',
        server: {},
      }),
      runInteractiveCliFn: async () => {
        throw childError;
      },
      stopLongRunningLlmProxyFn: async () => {
        stops += 1;
        throw cleanupError;
      },
    }),
    (error) => error === childError && error.cleanupError === cleanupError,
  );
  assert.equal(stops, 1);
});
