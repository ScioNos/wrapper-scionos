import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { startLongRunningLlmProxy, stopLongRunningLlmProxy, resolveProxyTimeouts } from '../src/platform/llm-proxy.js';
import { closeTestServer } from './support/lifecycle.mjs';

async function fixture(t, options = {}) {
  const upstream = http.createServer();
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startLongRunningLlmProxy({ targetBaseUrl: `http://127.0.0.1:${upstream.address().port}`, routerlabToken: 'fake-token', firstResponseTimeoutMs: 100, streamIdleTimeoutMs: 100, ...options });
  t.after(async () => {
    t.mock.timers.reset();
    await stopLongRunningLlmProxy(proxy, { graceMs: 0 });
    await closeTestServer(upstream);
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pendingRequest = once(upstream, 'request');
  const client = http.get(proxy.baseUrl + '/v1/models', { headers: { authorization: `Bearer ${proxy.gatewayToken}` } });
  client.on('error', () => {});
  const response = once(client, 'response');
  response.catch(() => {});
  const [, source] = await pendingRequest;
  return { source, client, response };
}

test('an active stream outlives the former 120-second cap; every chunk resets inactivity', { timeout: 5000 }, async (t) => {
  const { source, response } = await fixture(t, { firstResponseTimeoutMs: 120000, streamIdleTimeoutMs: 120000 });
  source.write('one');
  const [incoming] = await response;
  incoming.on('error', () => {});
  await once(incoming, 'data');
  incoming.resume();
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(119000);
    const chunk = once(incoming, 'data');
    source.write('next');
    await chunk;
    assert.equal(source.destroyed, false);
  }
  const finished = once(incoming, 'end');
  source.end('done');
  await finished;
  assert.equal(incoming.complete, true);
  t.mock.timers.tick(1000000);
});

test('inactivity aborts upstream and closes a partially sent response', { timeout: 5000 }, async (t) => {
  const { source, response } = await fixture(t);
  source.write('started');
  const [incoming] = await response;
  incoming.on('error', () => {});
  incoming.resume();
  const upstreamClosed = once(source, 'close');
  const downstreamClosed = new Promise((resolve) => incoming.once('close', resolve));
  t.mock.timers.tick(100);
  await Promise.all([upstreamClosed, downstreamClosed]);
  assert.equal(incoming.complete, false);
});

test('no first response returns a distinct 504 and aborts upstream', { timeout: 5000 }, async (t) => {
  const { source, response } = await fixture(t);
  const closed = once(source, 'close');
  t.mock.timers.tick(100);
  const [incoming] = await response;
  let body = '';
  for await (const chunk of incoming) body += chunk;
  assert.equal(incoming.statusCode, 504);
  assert.equal(JSON.parse(body).error.code, 'upstream_first_response_timeout');
  await closed;
});

test('an explicitly enabled total stream budget interrupts an active stream', { timeout: 5000 }, async (t) => {
  const { source, response } = await fixture(t, { streamTotalTimeoutMs: 60 });
  source.write('started');
  const [incoming] = await response;
  incoming.on('error', () => {});
  incoming.resume();
  const closed = once(source, 'close');
  t.mock.timers.tick(30);
  const chunk = once(incoming, 'data');
  source.write('active');
  await chunk;
  t.mock.timers.tick(30);
  await closed;
  assert.equal(source.destroyed, true);
});

test('client cancellation aborts upstream before a timeout', { timeout: 5000 }, async (t) => {
  const { source, client, response } = await fixture(t);
  source.write('started');
  const [incoming] = await response;
  incoming.on('error', () => {});
  const closed = once(source, 'close');
  client.destroy(); incoming.destroy();
  await closed;
  assert.equal(source.destroyed, true);
});

test('proxy timeout configuration is explicit and rejects invalid or disabled safety budgets', () => {
  assert.deepEqual(resolveProxyTimeouts({}, {}), { firstResponseTimeoutMs: 120000, streamIdleTimeoutMs: 120000, streamTotalTimeoutMs: 0 });
  assert.deepEqual(resolveProxyTimeouts({}, { WRAPPER_SCIONOS_PROXY_FIRST_RESPONSE_TIMEOUT_MS: '40', WRAPPER_SCIONOS_PROXY_STREAM_IDLE_TIMEOUT_MS: '50', WRAPPER_SCIONOS_PROXY_STREAM_TOTAL_TIMEOUT_MS: '60' }), { firstResponseTimeoutMs: 40, streamIdleTimeoutMs: 50, streamTotalTimeoutMs: 60 });
  for (const value of ['no', '', -1, 0, 2147483648]) assert.throws(() => resolveProxyTimeouts({ firstResponseTimeoutMs: value }, {}), /must be an integer/);
});
