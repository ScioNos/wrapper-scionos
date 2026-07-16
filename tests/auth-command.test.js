import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAuth, resolveOptionFirstToken } from '../src/cli/commands/auth.js';
import { requireServiceConfig } from '../src/routerlab/services.js';

function captureJsonOutput() {
  const originalLog = console.log;
  const output = [];
  console.log = (line) => output.push(JSON.parse(line));
  return {
    output,
    restore: () => {
      console.log = originalLog;
    },
  };
}

test('auth login validates option and prompted tokens before storing', async () => {
  const stored = [];
  const capture = captureJsonOutput();
  try {
    await handleAuth('login', {
      service: 'routerlab',
      token: '  option-token-with-enough-length  ',
      json: true,
      command: 'auth:login',
    }, {
      storeTokenFn: (token, serviceValue) => {
        stored.push({ token, serviceValue });
        return { backend: 'Test vault' };
      },
    });

    await handleAuth('change', {
      service: 'llm',
      token: null,
      json: true,
      command: 'auth:change',
    }, {
      passwordFn: async ({ message }) => {
        assert.equal(message, 'RouterLab LLM token:');
        return '  prompted-token-with-enough-length  ';
      },
      storeTokenFn: (token, serviceValue) => {
        stored.push({ token, serviceValue });
        return { backend: 'Prompt vault' };
      },
    });
  } finally {
    capture.restore();
  }

  assert.deepEqual(stored, [
    { token: 'option-token-with-enough-length', serviceValue: 'routerlab' },
    { token: 'prompted-token-with-enough-length', serviceValue: 'llm' },
  ]);
  assert.equal(capture.output[0].data.backend, 'Test vault');
  assert.equal(capture.output[1].data.backend, 'Prompt vault');

  await assert.rejects(
    () => handleAuth('login', {
      service: 'routerlab',
      token: null,
      json: true,
      command: 'auth:login',
    }, {
      passwordFn: async () => 'short',
      storeTokenFn: () => assert.fail('invalid token must not be stored'),
    }),
    /too short/,
  );
});

test('auth logout and test actions cover deletion and resolved-token fallback', async () => {
  const capture = captureJsonOutput();
  const seen = [];
  try {
    await handleAuth('logout', {
      service: 'routerlab',
      json: true,
      command: 'auth:logout',
    }, {
      deleteStoredTokenFn: (serviceValue) => {
        assert.equal(serviceValue, 'routerlab');
        return true;
      },
    });

    await handleAuth('test', {
      service: 'llm',
      token: null,
      noPrompt: true,
      json: true,
      command: 'auth:test',
    }, {
      resolveTokenWithSourceFn: async (options) => {
        assert.deepEqual(options, { serviceValue: 'llm', noPrompt: true });
        return { token: 'resolved-token-with-enough-length', source: 'secure-storage' };
      },
      fetchModelsFn: async (token, options) => {
        seen.push({ token, options });
        return { valid: true, models: ['gpt-5.6-sol-pro'] };
      },
    });
  } finally {
    capture.restore();
  }

  assert.equal(capture.output[0].data.deleted, true);
  assert.equal(capture.output[0].data.legacyEntriesIncluded, true);
  assert.equal(capture.output[1].data.tokenSource, 'secure-storage');
  assert.equal(capture.output[1].data.valid, true);
  assert.equal(seen[0].token, 'resolved-token-with-enough-length');
  assert.equal(seen[0].options.serviceValue, 'llm');
});

test('auth token resolver validates explicit tokens and delegates when absent', async () => {
  const service = requireServiceConfig('routerlab');
  assert.deepEqual(await resolveOptionFirstToken(service, {
    token: '  explicit-token-with-enough-length  ',
    noPrompt: true,
  }), {
    token: 'explicit-token-with-enough-length',
    source: 'option',
  });
  await assert.rejects(
    () => resolveOptionFirstToken(service, { token: 'short', noPrompt: true }),
    /too short/,
  );

  let delegated = false;
  const resolved = await resolveOptionFirstToken(
    service,
    { token: null, noPrompt: false },
    async (options) => {
      delegated = true;
      assert.deepEqual(options, { serviceValue: 'routerlab', noPrompt: false });
      return { token: 'delegated-token', source: 'prompt' };
    },
  );
  assert.equal(delegated, true);
  assert.equal(resolved.source, 'prompt');
});
