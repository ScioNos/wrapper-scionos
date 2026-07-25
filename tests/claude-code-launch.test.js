import test from 'node:test';
import assert from 'node:assert/strict';
import { launchClaudeCode } from '../src/apps/claude-code.js';

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
      detectClaudeCodeFn: () => ({ installed: true, cliPath: 'fake-claude' }),
      fetchModelsFn: async (_token, options) => {
        calls.discovery = options;
        return { valid: true, models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'] };
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
    assert.equal(calls.child.env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:43123');
    assert.equal(calls.child.env.ANTHROPIC_AUTH_TOKEN, 'generated-local-token');
    assert.deepEqual(calls.child.args, ['--print']);
    assert.deepEqual(calls.stop.options, { graceMs: 2000 });
  } finally {
    if (previousRouterlabBaseUrl === undefined) delete process.env.ROUTERLAB_BASE_URL;
    else process.env.ROUTERLAB_BASE_URL = previousRouterlabBaseUrl;
    if (previousAnthropicBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = previousAnthropicBaseUrl;
  }
});
