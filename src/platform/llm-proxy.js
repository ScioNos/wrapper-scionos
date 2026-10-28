import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';
import { DEFAULT_ANTHROPIC_VERSION } from '../routerlab/services.js';
import { supportsOneMillionContext } from '../routerlab/strategy-models.js';
import { normalizeLoopbackHost } from './loopback.js';

export const DEFAULT_LLM_PROXY_HOST = '127.0.0.1';
export const MAX_LLM_PROXY_REQUEST_BYTES = 64 * 1024 * 1024;
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 120_000;
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 120_000;

// Upstream response budgets are independent of the inbound HTTP server limits.
export function resolveProxyTimeouts(options = {}, env = process.env) {
  const read = (option, variable, fallback, allowZero = false) => {
    const value = options[option] ?? env[variable] ?? fallback;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1) || number > 2_147_483_647) {
      throw proxyError(`${variable} must be an integer in milliseconds ${allowZero ? '>= 0' : '> 0'} (maximum 2147483647).`, 500, 'invalid_proxy_timeout');
    }
    return number;
  };
  return {
    firstResponseTimeoutMs: read('firstResponseTimeoutMs', 'WRAPPER_SCIONOS_PROXY_FIRST_RESPONSE_TIMEOUT_MS', options.upstreamTimeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS),
    streamIdleTimeoutMs: read('streamIdleTimeoutMs', 'WRAPPER_SCIONOS_PROXY_STREAM_IDLE_TIMEOUT_MS', DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    streamTotalTimeoutMs: read('streamTotalTimeoutMs', 'WRAPPER_SCIONOS_PROXY_STREAM_TOTAL_TIMEOUT_MS', 0, true),
  };
}

export function generateLlmProxyGatewayToken() {
  return randomBytes(32).toString('base64url');
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const REWRITTEN_REQUEST_HEADERS = new Set(['content-encoding', 'content-length']);

export function createLongRunningLlmProxy({
  targetBaseUrl,
  routerlabToken,
  gatewayToken = generateLlmProxyGatewayToken(),
  upstreamAuth = 'both',
  beforeForward = null,
  allowedModels = null,
  ...timeoutOptions
}) {
  // Never expose the token-forwarding proxy without a local gateway secret.
  if (typeof gatewayToken !== 'string' || gatewayToken.length === 0) {
    throw proxyError('A non-empty gateway token is required to start the local LLM proxy.', 500, 'missing_gateway_token');
  }
  const effectiveAllowedModels = allowedModels ? new Set(allowedModels) : null;
  const timeouts = resolveProxyTimeouts(timeoutOptions);
  const server = http.createServer(async (req, res) => {
    try {
      const handled = await beforeForward?.(req, res);
      if (handled) {
        return;
      }

      if (!isAuthorized(req, gatewayToken)) {
        writeJson(res, { error: { message: 'Unauthorized local LLM proxy request.', type: 'authentication_error', code: 'unauthorized' } }, 401);
        return;
      }

      const bodyText = await readRequestBody(req);
      const normalizedBodyText = validateAllowedModelRequest(req, bodyText, effectiveAllowedModels);

      await forwardLongRunningLlmRequest(req, res, {
        targetBaseUrl,
        routerlabToken,
        body: normalizedBodyText,
        upstreamAuth,
        ...timeouts,
      });
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        const payload = typeof error.toResponse === 'function'
          ? error.toResponse()
          : { error: { message: error.message, type: error.type ?? 'local_proxy_error', code: error.code ?? null } };
        writeJson(res, payload, error.statusCode ?? 500);
      } else if (!res.destroyed) {
        res.destroy(error);
      }
    }
  });
  server.on('error', (error) => {
    if (server.listening) console.error('Local LLM proxy server error:', error.message);
  });

  configureLongRunningHttpServer(server);
  return { server };
}

export function validateAllowedModelRequest(req, bodyText, allowedModels) {
  return normalizeAllowedModelRequest(req, bodyText, allowedModels);
}

export function normalizeAllowedModelRequest(req, bodyText, allowedModels) {
  if (!allowedModels) return bodyText;
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname.replace(/\/+$/, '');
  if (String(req.method).toUpperCase() !== 'POST') return bodyText;

  const isMessageRequest = pathname.endsWith('/v1/messages')
    || pathname.endsWith('/v1/messages/count_tokens');
  const isBatchRequest = pathname.endsWith('/v1/messages/batches');
  const isOpenAiRequest = pathname.endsWith('/v1/chat/completions')
    || pathname.endsWith('/v1/responses');
  if (!isMessageRequest && !isBatchRequest && !isOpenAiRequest) return bodyText;

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw proxyError('Claude model request body must be valid JSON.', 400, 'invalid_json');
  }

  const models = isBatchRequest
    ? (Array.isArray(payload?.requests)
        ? payload.requests.map((entry) => entry?.params?.model)
        : [])
    : [payload?.model];
  if (models.length === 0 || models.some((model) => typeof model !== 'string' || !model.trim())) {
    throw proxyError('Claude model request must include a model.', 400, 'missing_model');
  }

  const normalizedModels = models.map((model) => normalizeAllowedModel(model, allowedModels, isOpenAiRequest));
  const deniedIndex = normalizedModels.findIndex((model) => model === null);
  if (deniedIndex !== -1) {
    const denied = models[deniedIndex];
    const client = isOpenAiRequest ? 'OpenCode' : 'RouterLab Claude Code';
    throw proxyError(`Model "${denied}" is not allowed for this ${client} session.`, 403, 'model_not_allowed');
  }

  if (isBatchRequest) {
    normalizedModels.forEach((model, index) => {
      payload.requests[index].params.model = model;
    });
  } else {
    payload.model = normalizedModels[0];
  }

  return normalizedModels.some((model, index) => model !== models[index])
    ? JSON.stringify(payload)
    : bodyText;
}

function normalizeAllowedModel(model, allowedModels, allowProviderPrefix = false) {
  if (allowedModels.has(model)) return model;

  if (allowProviderPrefix) {
    const separator = model.lastIndexOf('/');
    if (separator > 0) {
      const unprefixedModel = model.slice(separator + 1);
      if (allowedModels.has(unprefixedModel)) return unprefixedModel;
    }
  }

  const match = model.match(/^(.*)\[1m\]$/);
  if (!match) return null;

  const baseModel = match[1];
  return allowedModels.has(baseModel) && supportsOneMillionContext(baseModel)
    ? baseModel
    : null;
}

export async function startLongRunningLlmProxy({
  host = DEFAULT_LLM_PROXY_HOST,
  port = 0,
  ...options
}) {
  // The proxy forwards using the user's real RouterLab token; bind loopback only.
  const listenHost = normalizeLoopbackHost(host ?? DEFAULT_LLM_PROXY_HOST);
  const displayHost = listenHost.includes(':') ? '[' + listenHost + ']' : listenHost;
  const gatewayToken = options.gatewayToken ?? generateLlmProxyGatewayToken();
  const { server } = createLongRunningLlmProxy({ ...options, gatewayToken });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, listenHost, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;
  return { server, baseUrl: 'http://' + displayHost + ':' + resolvedPort, gatewayToken };
}

export async function stopLongRunningLlmProxy(proxy, { graceMs = 2000 } = {}) {
  const server = proxy?.server;
  if (!server?.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    let forceTimer = null;
    const finish = (error) => {
      if (forceTimer) clearTimeout(forceTimer);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    server.close(finish);
    forceTimer = setTimeout(() => {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
    }, Math.max(0, graceMs));
    forceTimer.unref?.();
  });
}

export async function forwardLongRunningLlmRequest(req, res, {
  targetBaseUrl,
  routerlabToken,
  body,
  upstreamAuth = 'both',
  responseHeaders = {},
  ...timeoutOptions
}) {
  const upstreamUrl = buildUpstreamUrl(req, targetBaseUrl);
  const controller = new AbortController();
  const { firstResponseTimeoutMs, streamIdleTimeoutMs, streamTotalTimeoutMs } = resolveProxyTimeouts(timeoutOptions);
  let timeoutError = null;
  let firstTimer = null;
  let idleTimer = null;
  let totalTimer = null;
  let upstream = null;
  const deadline = (ms, code, label) => {
    const timer = setTimeout(() => {
      timeoutError = proxyError(`${label} timed out after ${ms}ms.`, 504, code);
      controller.abort(timeoutError);
    }, ms);
    timer.unref?.();
    return timer;
  };
  firstTimer = deadline(firstResponseTimeoutMs, 'upstream_first_response_timeout', 'Upstream first response');
  const receivedChunk = () => {
    if (firstTimer) {
      clearTimeout(firstTimer);
      firstTimer = null;
      if (streamTotalTimeoutMs > 0) {
        totalTimer = deadline(streamTotalTimeoutMs, 'upstream_total_timeout', 'Upstream stream duration');
      }
    }
    clearTimeout(idleTimer);
    idleTimer = deadline(streamIdleTimeoutMs, 'upstream_idle_timeout', 'Upstream stream inactivity');
  };
  const abort = () => controller.abort();
  req.once('aborted', abort);
  res.once('close', abort);
  try {
    if (req.aborted || res.destroyed) controller.abort();
    upstream = await requestLongRunningHttp(upstreamUrl, {
      method: req.method,
      headers: forwardHeaders(req.headers, {
        routerlabToken,
        upstreamAuth,
      }),
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      signal: controller.signal,
    });
    // Until the first body bytes arrive, keep the downstream outside pipeline:
    // pipeline destroys its destination on error, preventing a JSON 504.
    await waitForUpstreamBody(upstream);
    upstream.on('data', receivedChunk);
    await writeLongRunningHttpResponse(res, upstream, responseHeaders);
  } catch (error) {
    if (timeoutError) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(firstTimer);
    clearTimeout(idleTimer);
    clearTimeout(totalTimer);
    upstream?.off('data', receivedChunk);
    if (upstream && !upstream.complete) upstream.destroy();
    req.off('aborted', abort);
    res.off('close', abort);
  }
}

export function configureLongRunningHttpServer(server) {
  server.requestTimeout = 120000;
  server.timeout = 0;
  server.keepAliveTimeout = 5000;
  server.headersTimeout = 30000;
}

export function buildUpstreamUrl(req, targetBaseUrl) {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  if (!isAllowedUpstreamPath(requestUrl.pathname)) {
    throw proxyError('Unsupported upstream API path.', 404, 'unsupported_upstream_path');
  }
  const base = new URL(targetBaseUrl);
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw proxyError('Service base URL must use HTTP or HTTPS.', 500, 'invalid_service_base_url');
  }
  const basePath = base.pathname.replace(/\/+$/, '');
  const requestPath = requestUrl.pathname.startsWith('/') ? requestUrl.pathname : '/' + requestUrl.pathname;
  const deduplicatedRequestPath = basePath.endsWith('/v1') && requestPath.startsWith('/v1/')
    ? requestPath.slice('/v1'.length)
    : requestPath;
  base.pathname = (basePath || '') + deduplicatedRequestPath;
  base.search = requestUrl.search;
  return base;
}

function isAllowedUpstreamPath(pathname) {
  return pathname === '/v1/models'
    || pathname === '/v1/messages'
    || pathname === '/v1/messages/count_tokens'
    || /^\/v1\/messages\/batches(?:\/[A-Za-z0-9_-]+(?:\/(?:cancel|results))?)?$/.test(pathname)
    || pathname === '/v1/chat/completions'
    || pathname === '/v1/responses';
}

export function forwardHeaders(sourceHeaders, {
  routerlabToken,
  upstreamAuth = 'both',
} = {}) {
  const headers = {};
  const connectionHeaders = connectionHeaderNames(sourceHeaders.connection);
  for (const [key, value] of Object.entries(sourceHeaders)) {
    const normalized = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(normalized)
      && !REWRITTEN_REQUEST_HEADERS.has(normalized)
      && !connectionHeaders.has(normalized)
      && normalized !== 'authorization'
      && normalized !== 'x-api-key') {
      headers[key] = value;
    }
  }

  if (upstreamAuth === 'anthropic' || upstreamAuth === 'both') {
    headers['x-api-key'] = routerlabToken;
  }
  if (upstreamAuth === 'openai' || upstreamAuth === 'both') {
    headers.authorization = `Bearer ${routerlabToken}`;
  }

  headers['content-type'] = headers['content-type'] ?? 'application/json';
  if (upstreamAuth === 'anthropic' || upstreamAuth === 'both') {
    headers['anthropic-version'] = headers['anthropic-version'] ?? DEFAULT_ANTHROPIC_VERSION;
  }
  return headers;
}

function connectionHeaderNames(value) {
  const values = Array.isArray(value) ? value : [value];
  return new Set(values.filter(Boolean).flatMap((item) => String(item).split(',')).map((item) => item.trim().toLowerCase()).filter(Boolean));
}

export function isAuthorized(req, gatewayToken) {
  if (!gatewayToken) {
    return false;
  }

  const authorization = req.headers.authorization ?? '';
  const apiKey = req.headers['x-api-key'] ?? '';
  return authorization === `Bearer ${gatewayToken}` || apiKey === gatewayToken;
}

export async function readRequestBody(req, maxBytes = MAX_LLM_PROXY_REQUEST_BYTES) {
  let body = await readRawRequestBody(req, maxBytes);
  const header = Array.isArray(req.headers['content-encoding'])
    ? req.headers['content-encoding'].join(',')
    : req.headers['content-encoding'] ?? 'identity';
  const encodings = String(header).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  for (const encoding of encodings.reverse()) {
    body = await decompressRequestBody(body, encoding, maxBytes);
  }
  if (body.length > maxBytes) throw requestTooLarge(maxBytes);
  return body.toString('utf8');
}

function readRawRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      const item = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += item.length;
      if (size > maxBytes) {
        settled = true;
        reject(requestTooLarge(maxBytes));
        return;
      }
      chunks.push(item);
    });
    req.on('end', () => { if (!settled) resolve(Buffer.concat(chunks)); });
    req.on('error', (error) => { if (!settled) reject(error); });
  });
}

async function decompressRequestBody(body, encoding, maxBytes) {
  if (!encoding || encoding === 'identity') return body;
  const method = { gzip: zlib.gunzip, deflate: zlib.inflate, br: zlib.brotliDecompress, zstd: zlib.zstdDecompress }[encoding];
  if (typeof method !== 'function') {
    throw proxyError('Unsupported content encoding: ' + encoding + '.', 415, 'unsupported_content_encoding');
  }
  try {
    return await promisify(method)(body, { maxOutputLength: maxBytes });
  } catch (error) {
    if (error?.code === 'ERR_BUFFER_TOO_LARGE' || /larger than/i.test(error?.message ?? '')) {
      throw requestTooLarge(maxBytes);
    }
    throw proxyError('Request body uses invalid ' + encoding + ' compression.', 400, 'invalid_compressed_body');
  }
}

function requestTooLarge(maxBytes) {
  return proxyError('Request body exceeds the ' + maxBytes + '-byte local proxy limit.', 413, 'request_body_too_large');
}

function proxyError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.type = 'invalid_request_error';
  return error;
}

export function writeJson(res, payload, status = 200, headers = {}) {
  res.writeHead(status, {
    ...headers,
    'content-type': 'application/json',
  });
  res.end(JSON.stringify(payload));
}

async function requestLongRunningHttp(url, { method, headers, body, signal }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'http:' ? http : https;
    const upstreamReq = transport.request(url, { method, headers, signal }, resolve);
    upstreamReq.once('error', reject);
    upstreamReq.end(body);
  });
}

function waitForUpstreamBody(upstream) {
  if (upstream.readableLength || upstream.readableEnded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      upstream.off('readable', ready);
      upstream.off('end', ready);
      upstream.off('error', failed);
      upstream.off('close', closed);
      if (error) reject(error); else resolve();
    };
    const ready = () => finish();
    const failed = (error) => finish(error);
    const closed = () => finish(upstream.complete ? null : Object.assign(new Error('Upstream closed before its response body.'), { code: 'ERR_STREAM_PREMATURE_CLOSE' }));
    upstream.once('readable', ready);
    upstream.once('end', ready);
    upstream.once('error', failed);
    upstream.once('close', closed);
  });
}

async function writeLongRunningHttpResponse(res, upstream, extraHeaders = {}) {
  const responseHeaders = {};
  const connectionHeaders = connectionHeaderNames(upstream.headers.connection);
  for (const [key, value] of Object.entries(upstream.headers)) {
    const normalized = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(normalized) && !connectionHeaders.has(normalized)) {
      responseHeaders[key] = value;
    }
  }

  res.writeHead(upstream.statusCode ?? 502, { ...responseHeaders, ...extraHeaders });
  try {
    await pipeline(upstream, res);
  } finally {
    if (!res.destroyed && !res.writableEnded) {
      res.end();
    }
  }
}
