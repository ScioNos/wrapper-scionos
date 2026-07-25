import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';
import { DEFAULT_ANTHROPIC_VERSION } from '../routerlab/services.js';
import { upstreamResponsesError } from './responses-errors.js';

export const DEFAULT_LLM_PROXY_HOST = '127.0.0.1';
export const LEGACY_LLM_PROXY_GATEWAY_TOKEN = 'scionos-local';
export const MAX_LLM_PROXY_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_ERROR_BODY_BYTES = 1024 * 1024;

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
  
}) {
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

      let bodyText = await readRequestBody(req);
      

      await forwardLongRunningLlmRequest(req, res, {
        targetBaseUrl,
        routerlabToken,
        body: bodyText,
        upstreamAuth,
        errorContext: null,
      });
    } catch (error) {
      if (!res.headersSent) {
        const payload = typeof error.toResponse === 'function'
          ? error.toResponse()
          : { error: { message: error.message, type: error.type ?? 'local_proxy_error', code: error.code ?? null } };
        writeJson(res, payload, error.statusCode ?? 500);
      } else if (!res.destroyed) {
        res.destroy(error);
      }
    }
  });

  configureLongRunningHttpServer(server);
  return { server };
}

export async function startLongRunningLlmProxy({
  host = DEFAULT_LLM_PROXY_HOST,
  port = 0,
  ...options
}) {
  const listenHost = host === '[::1]' ? '::1' : host;
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
  errorContext = null,
  responseHeaders = {},
}) {
  const upstreamUrl = buildUpstreamUrl(req, targetBaseUrl);
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once('aborted', abort);
  res.once('close', abort);
  const upstream = await requestLongRunningHttp(upstreamUrl, {
    method: req.method,
    headers: forwardHeaders(req.headers, {
      routerlabToken,
      upstreamAuth,
    }),
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    signal: controller.signal,
  });

  const status = upstream.statusCode ?? 502;
  if (errorContext && (status < 200 || status >= 300)) {
    const errorBody = await readEncodedStreamText(upstream);
    writeJson(res, upstreamResponsesError(status, errorBody, {
      ...errorContext,
      upstreamUrl: upstreamUrl.href,
    }), status);
    return;
  }

  await writeLongRunningHttpResponse(res, upstream, responseHeaders);
}

export function configureLongRunningHttpServer(server) {
  server.requestTimeout = 120000;
  server.timeout = 0;
  server.keepAliveTimeout = 5000;
  server.headersTimeout = 30000;
}

export function buildUpstreamUrl(req, targetBaseUrl) {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
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
  headers['anthropic-version'] = headers['anthropic-version'] ?? DEFAULT_ANTHROPIC_VERSION;
  return headers;
}

function connectionHeaderNames(value) {
  const values = Array.isArray(value) ? value : [value];
  return new Set(values.filter(Boolean).flatMap((item) => String(item).split(',')).map((item) => item.trim().toLowerCase()).filter(Boolean));
}

export function isAuthorized(req, gatewayToken) {
  if (!gatewayToken) {
    return true;
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

async function readEncodedStreamText(stream, maxBytes = MAX_ERROR_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = maxBytes - size;
    if (remaining <= 0) break;
    chunks.push(value.subarray(0, remaining));
    size += Math.min(value.length, remaining);
    if (value.length > remaining) break;
  }
  let body = Buffer.concat(chunks);
  const header = Array.isArray(stream.headers?.['content-encoding'])
    ? stream.headers['content-encoding'].join(',')
    : stream.headers?.['content-encoding'] ?? 'identity';
  const encodings = String(header).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  for (const encoding of encodings.reverse()) {
    if (!encoding || encoding === 'identity') continue;
    const method = { gzip: zlib.gunzip, deflate: zlib.inflate, br: zlib.brotliDecompress, zstd: zlib.zstdDecompress }[encoding];
    if (typeof method !== 'function') throw proxyError('Unsupported upstream content encoding: ' + encoding + '.', 502, 'unsupported_upstream_content_encoding');
    try {
      body = await promisify(method)(body, { maxOutputLength: maxBytes });
    } catch {
      throw proxyError('Upstream error body uses invalid ' + encoding + ' compression.', 502, 'invalid_upstream_compression');
    }
  }
  return body.subarray(0, maxBytes).toString('utf8');
}

async function requestLongRunningHttp(url, { method, headers, body, signal }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'http:' ? http : https;
    const upstreamReq = transport.request(url, { method, headers, signal }, resolve);
    upstreamReq.setTimeout(0);
    upstreamReq.once('error', reject);
    upstreamReq.end(body);
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
  } catch (error) {
    if (!res.destroyed) {
      res.destroy(error);
    }
  } finally {
    if (!res.destroyed && !res.writableEnded) {
      res.end();
    }
  }
}
