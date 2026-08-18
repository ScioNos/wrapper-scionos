import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { createClaudeDesktopProxy } from '../src/apps/claude-desktop-proxy.js';
import { DESKTOP_MAPPING_STRATEGIES, modelRoutesForDesktopMapping, modelRoutesForProxyStrategy } from '../src/apps/claude-desktop.js';
import { startLongRunningLlmProxy, stopLongRunningLlmProxy } from '../src/platform/llm-proxy.js';

const DESKTOP_GATEWAY_TOKEN = 'G'.repeat(43);

test('Claude Desktop proxy rejects configurable upstream endpoints', () => {
  assert.throws(() => createClaudeDesktopProxy({
    serviceValue: 'routerlab',
    routerlabToken: 'upstream-token',
    gatewayToken: DESKTOP_GATEWAY_TOKEN,
    routes: modelRoutesForProxyStrategy('claude-gpt', 'routerlab'),
    targetBaseUrl: 'http://127.0.0.1:9999',
  }), (error) => error.code === 'unsupported_proxy_option');
  assert.throws(() => createClaudeDesktopProxy({
    serviceValue: 'routerlab',
    routerlabToken: 'upstream-token',
    gatewayToken: DESKTOP_GATEWAY_TOKEN,
    routes: [
      { routeId: 'claude-collision', upstreamModel: 'model-a' },
      { routeId: 'claude-collision', upstreamModel: 'model-b' },
    ],
  }), (error) => error.code === 'route_collision');
});

test('Claude Desktop proxy exposes mapped model list', async () => {
  const catalogRoutes = modelRoutesForDesktopMapping('routerlab', DESKTOP_MAPPING_STRATEGIES.routerlab);
  catalogRoutes[0] = { ...catalogRoutes[0], supports1m: true, createdAt: 'routerlab-created-at' };
  const { server } = createClaudeDesktopProxy({
    serviceValue: 'routerlab',
    routerlabToken: 'valid-token-with-enough-length',
    gatewayToken: DESKTOP_GATEWAY_TOKEN,
    routes: catalogRoutes,
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
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/models`, {
      headers: { authorization: `Bearer ${DESKTOP_GATEWAY_TOKEN}` },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.some((model) => model.id === 'claude-opus-5'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-sonnet-5'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-fable-5'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-haiku-4-5'), true);
    assert.equal(payload.data.some((model) => model.id === 'aws-claude-haiku-4-5' && !model.supports1m), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-5.6-luna'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-lm5.2' && !model.supports1m), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-max-m3'), true);
    assert.equal(payload.data.some((model) => model.id === 'claude-deev4-flash-0731'), true);
    assert.equal(payload.data[0].created_at, 'routerlab-created-at');
    assert.equal(payload.data[0].supports1m, true);
    assert.equal(payload.data.slice(1).every((model) => !Object.hasOwn(model, 'created_at')), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Claude Desktop proxy rewrites mapped models through injected transport and rejects missing models locally', async () => {
  const captured = [];
  const configuredRoutes = modelRoutesForProxyStrategy('claude-gpt', 'routerlab');
  const { server, routes } = createClaudeDesktopProxy({
    serviceValue: 'routerlab',
    routerlabToken: 'real-routerlab-token',
    gatewayToken: DESKTOP_GATEWAY_TOKEN,
    routes: configuredRoutes,
  }, {
    forwardRequest: async (req, res, options) => {
      captured.push({
        body: JSON.parse(options.body),
        routerlabToken: options.routerlabToken,
        targetBaseUrl: options.targetBaseUrl,
        url: req.url,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    },
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  try {
    const proxyBaseUrl = `http://127.0.0.1:${server.address().port}`;
    const mappedRoute = routes[0];
    const mappedResponse = await fetch(`${proxyBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${DESKTOP_GATEWAY_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: mappedRoute.routeId, messages: [] }),
    });
    assert.equal(mappedResponse.status, 200);

    const emptyResponse = await fetch(`${proxyBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${DESKTOP_GATEWAY_TOKEN}`,
        'content-type': 'application/json',
      },
    });
    assert.equal(emptyResponse.status, 400);
    assert.equal((await emptyResponse.json()).error.code, 'missing_model');

    assert.equal(captured[0].body.model, mappedRoute.upstreamModel);
    assert.deepEqual(captured[0].body.messages, []);
    assert.equal(captured[0].routerlabToken, 'real-routerlab-token');
    assert.equal(captured[0].targetBaseUrl, 'https://api.routerlab.ch');
    assert.equal(captured[0].url, '/v1/messages');
    assert.equal(captured.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Claude Desktop proxy fails closed for unknown models, mixed batches, paths, and methods', async () => {
  const forwarded = [];
  const routes = modelRoutesForProxyStrategy('claude-gpt', 'routerlab');
  const { server } = createClaudeDesktopProxy({
    serviceValue: 'routerlab',
    routerlabToken: 'real-routerlab-token',
    gatewayToken: DESKTOP_GATEWAY_TOKEN,
    routes,
  }, {
    forwardRequest: async (req, res, options) => {
      forwarded.push({ url: req.url, method: req.method, body: options.body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    },
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    authorization: `Bearer ${DESKTOP_GATEWAY_TOKEN}`,
    'content-type': 'application/json',
  };

  try {
    const denied = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'unknown', messages: [] }),
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'model_not_allowed');

    const mixedBatch = await fetch(`${baseUrl}/v1/messages/batches`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requests: [
          { custom_id: 'ok', params: { model: routes[0].routeId, messages: [] } },
          { custom_id: 'denied', params: { model: 'unknown', messages: [] } },
        ],
      }),
    });
    assert.equal(mixedBatch.status, 403);
    assert.equal((await mixedBatch.json()).error.code, 'model_not_allowed');

    const validBatch = await fetch(`${baseUrl}/v1/messages/batches`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requests: routes.slice(0, 2).map((route, index) => ({
          custom_id: String(index),
          params: { model: route.routeId, messages: [] },
        })),
      }),
    });
    assert.equal(validBatch.status, 200);
    const batchBody = JSON.parse(forwarded[0].body);
    assert.deepEqual(
      batchBody.requests.map((request) => request.params.model),
      routes.slice(0, 2).map((route) => route.upstreamModel),
    );

    const unsupported = await fetch(`${baseUrl}/v1/complete`, { method: 'POST', headers, body: '{}' });
    assert.equal(unsupported.status, 404);
    assert.equal((await unsupported.json()).error.code, 'unsupported_proxy_path');

    const wrongMethod = await fetch(`${baseUrl}/v1/messages`, { method: 'GET', headers });
    assert.equal(wrongMethod.status, 405);
    assert.equal((await wrongMethod.json()).error.code, 'method_not_allowed');

    for (const [method, pathname] of [
      ['GET', '/v1/messages/batches'],
      ['GET', '/v1/messages/batches/batch_1'],
      ['DELETE', '/v1/messages/batches/batch_1'],
      ['POST', '/v1/messages/batches/batch_1/cancel'],
      ['GET', '/v1/messages/batches/batch_1/results'],
    ]) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers,
        ...(method === 'POST' ? { body: '{}' } : {}),
      });
      assert.equal(response.status, 200, `${method} ${pathname}`);
    }
    assert.equal(forwarded.length, 6);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('shared long-running LLM proxy forces lingering connections closed after its grace period', async () => {
  let markUpstreamStarted;
  const upstreamStarted = new Promise((resolve) => {
    markUpstreamStarted = resolve;
  });
  const upstream = http.createServer((_req, _res) => {
    markUpstreamStarted();
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  const proxy = await startLongRunningLlmProxy({
    targetBaseUrl: 'http://127.0.0.1:' + upstream.address().port,
    routerlabToken: 'real-routerlab-token',
    upstreamAuth: 'anthropic',
  });
  const request = http.request(proxy.baseUrl + '/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': proxy.gatewayToken,
      'content-type': 'application/json',
    },
  });
  request.on('error', () => {});
  request.end('{}');

  try {
    await upstreamStarted;
    const startedAt = Date.now();
    await stopLongRunningLlmProxy(proxy, { graceMs: 50 });
    assert.ok(Date.now() - startedAt < 1000, 'proxy shutdown should remain bounded');
    assert.equal(proxy.server.listening, false);
  } finally {
    request.destroy();
    await stopLongRunningLlmProxy(proxy, { graceMs: 0 });
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('Claude Code proxy enforces the discovered service model allowlist before forwarding', async () => {
  const captured = [];
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      captured.push({ url: req.url, body: JSON.parse(body) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startLongRunningLlmProxy({
    targetBaseUrl: `http://127.0.0.1:${upstream.address().port}`,
    routerlabToken: 'routerlab-token-with-enough-length',
    upstreamAuth: 'anthropic',
    allowedModels: ['allowed-primary', 'allowed-other-strategy'],
  });
  const headers = {
    authorization: `Bearer ${proxy.gatewayToken}`,
    'content-type': 'application/json',
  };

  try {
    const allowed = await fetch(`${proxy.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'allowed-primary', messages: [] }),
    });
    assert.equal(allowed.status, 200);

    const compressed = await fetch(`${proxy.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { ...headers, 'content-encoding': 'gzip' },
      body: zlib.gzipSync(JSON.stringify({
        model: 'allowed-other-strategy',
        messages: [],
      })),
    });
    assert.equal(compressed.status, 200);

    const counted = await fetch(`${proxy.baseUrl}/v1/messages/count_tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'allowed-primary', messages: [] }),
    });
    assert.equal(counted.status, 200);

    const denied = await fetch(`${proxy.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'not-announced-by-routerlab', messages: [] }),
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'model_not_allowed');

    const missing = await fetch(`${proxy.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: [] }),
    });
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).error.code, 'missing_model');

    const invalid = await fetch(`${proxy.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: '{not-json',
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'invalid_json');

    assert.deepEqual(captured.map((entry) => entry.body.model), [
      'allowed-primary',
      'allowed-other-strategy',
      'allowed-primary',
    ]);
    assert.deepEqual(captured.map((entry) => entry.url), [
      '/v1/messages',
      '/v1/messages',
      '/v1/messages/count_tokens',
    ]);
  } finally {
    await stopLongRunningLlmProxy(proxy, { graceMs: 0 });
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('shared long-running proxy preserves generic OpenAI-compatible requests', async () => {
  const captured = [];
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      captured.push({ url: req.url, authorization: req.headers.authorization, body });
      if (body.stream) {
        const event = `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', model: body.model, store: body.store })}\n\n`;
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(event);
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'response', model: body.model, store: body.store }));
      }
    });
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startLongRunningLlmProxy({
    targetBaseUrl: 'http://127.0.0.1:' + upstream.address().port,
    routerlabToken: 'real-routerlab-token',
    upstreamAuth: 'openai',
  });

  try {
    const models = ['gpt-5.6-sol', 'glm-5.2', 'qwen3.7-max', 'MiniMax-M3', 'deepseek-v4-pro', 'kimi-k2.7-code'];
    for (const model of models) {
      for (const stream of [false, true]) {
        const response = await fetch(proxy.baseUrl + '/v1/responses?trace=' + encodeURIComponent(model), {
          method: 'POST',
          headers: { authorization: 'Bearer ' + proxy.gatewayToken, 'content-type': 'application/json' },
          body: JSON.stringify({ model, input: 'ping', stream, store: true, metadata: { source: 'codex' } }),
        });
        assert.equal(response.status, 200);
        if (stream) {
          assert.equal(await response.text(), `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', model, store: true })}\n\n`);
        } else {
          assert.deepEqual(await response.json(), { object: 'response', model, store: true });
        }
      }
    }
    assert.deepEqual(captured.map((entry) => entry.body.model), models.flatMap((model) => [model, model]));
    assert.deepEqual(captured.map((entry) => entry.body.stream), models.flatMap(() => [false, true]));
    assert.equal(captured.every((entry) => entry.url.startsWith('/v1/responses?trace=')), true);
    assert.equal(captured.every((entry) => entry.authorization === 'Bearer real-routerlab-token'), true);
    assert.equal(captured.every((entry) => entry.body.store === true), true);
    // metadata is now preserved if sent
  } finally {
    await stopLongRunningLlmProxy(proxy);
    await new Promise((resolve) => upstream.close(resolve));
  }
});
test('shared long-running LLM proxy keeps generic responses on passthrough', async () => {
  let captured = null;
  const upstream = http.createServer((req, res) => {
    captured = { url: req.url, authorization: req.headers.authorization };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', () => {
      upstream.off('error', reject);
      resolve();
    });
  });

  const upstreamAddress = upstream.address();
  const proxy = await startLongRunningLlmProxy({
    targetBaseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
    routerlabToken: 'real-routerlab-token',
    upstreamAuth: 'openai',
  });

  try {
    const response = await fetch(`${proxy.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${proxy.gatewayToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'glm-5.2', input: 'ping' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(captured.url, '/v1/responses');
    assert.equal(captured.authorization, 'Bearer real-routerlab-token');
    assert.deepEqual(payload, { ok: true });
  } finally {
    await stopLongRunningLlmProxy(proxy);
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('shared long-running LLM proxy preserves upstream error responses', async () => {
  const upstream = http.createServer((req, res) => {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'model access denied', type: 'forbidden' } }));
  });

  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', () => {
      upstream.off('error', reject);
      resolve();
    });
  });

  const upstreamAddress = upstream.address();
  const proxy = await startLongRunningLlmProxy({
    targetBaseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
    routerlabToken: 'real-routerlab-token',
    upstreamAuth: 'openai',
  });

  try {
    const response = await fetch(`${proxy.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${proxy.gatewayToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-5.5', input: 'ping' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.error.type, 'forbidden');
    assert.equal(payload.error.message, 'model access denied');
  } finally {
    await stopLongRunningLlmProxy(proxy);
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('proxy preserves compressed response headers and upstream errors', async () => {
  let fail = false;
  let encoding = 'gzip';
  const upstream = http.createServer((req, res) => {
    const payload = fail
      ? JSON.stringify({ error: { message: 'compressed denial', type: 'forbidden' } })
      : JSON.stringify({ ok: true });
    const body = encoding === 'br' ? zlib.brotliCompressSync(payload) : zlib.gzipSync(payload);
    res.writeHead(fail ? 403 : 200, {
      'content-type': 'application/json',
      'content-encoding': encoding,
      'content-length': body.length,
    });
    res.end(body);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startLongRunningLlmProxy({
    targetBaseUrl: 'http://127.0.0.1:' + upstream.address().port,
    routerlabToken: 'real-routerlab-token',
    upstreamAuth: 'openai',
  });
  try {
    const raw = await new Promise((resolve, reject) => {
      http.get(proxy.baseUrl + '/v1/responses', {
        headers: { authorization: 'Bearer ' + proxy.gatewayToken, 'accept-encoding': 'gzip' },
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ headers: response.headers, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });
    assert.equal(raw.headers['content-encoding'], 'gzip');
    assert.deepEqual(JSON.parse(zlib.gunzipSync(raw.body)), { ok: true });

    encoding = 'br';
    const brotli = await new Promise((resolve, reject) => {
      http.get(proxy.baseUrl + '/v1/responses', {
        headers: { authorization: 'Bearer ' + proxy.gatewayToken, 'accept-encoding': 'br' },
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ headers: response.headers, body: Buffer.concat(chunks) }));
      }).on('error', reject);
    });
    assert.equal(brotli.headers['content-encoding'], 'br');
    assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(brotli.body)), { ok: true });

    fail = true;
    const response = await fetch(proxy.baseUrl + '/v1/responses', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + proxy.gatewayToken, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'glm-5.2' }),
    });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.error.type, 'forbidden');
    assert.match(payload.error.message, /compressed denial/);
  } finally {
    await stopLongRunningLlmProxy(proxy);
    await new Promise((resolve) => upstream.close(resolve));
  }
});
