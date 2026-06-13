import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { DEFAULT_ANTHROPIC_VERSION } from '../routerlab/services.js';

export const DEFAULT_LLM_PROXY_HOST = '127.0.0.1';
export const DEFAULT_LLM_PROXY_GATEWAY_TOKEN = 'scionos-local';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function createLongRunningLlmProxy({
  targetBaseUrl,
  routerlabToken,
  gatewayToken = DEFAULT_LLM_PROXY_GATEWAY_TOKEN,
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
        writeJson(res, { error: { message: 'Unauthorized local LLM proxy request.' } }, 401);
        return;
      }

      const bodyText = await readRequestBody(req);
      await forwardLongRunningLlmRequest(req, res, {
        targetBaseUrl,
        routerlabToken,
        body: bodyText,
        upstreamAuth,
      });
    } catch (error) {
      if (!res.headersSent) {
        writeJson(res, { error: { message: error.message } }, 500);
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
  const { server } = createLongRunningLlmProxy(options);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;
  return { server, baseUrl: `http://${host}:${resolvedPort}` };
}

export async function stopLongRunningLlmProxy(proxy) {
  if (!proxy?.server?.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    proxy.server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export async function forwardLongRunningLlmRequest(req, res, {
  targetBaseUrl,
  routerlabToken,
  body,
  upstreamAuth = 'both',
}) {
  const upstream = await requestLongRunningHttp(buildUpstreamUrl(req, targetBaseUrl), {
    method: req.method,
    headers: forwardHeaders(req.headers, {
      routerlabToken,
      upstreamAuth,
    }),
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });

  await writeLongRunningHttpResponse(res, upstream);
}

export function configureLongRunningHttpServer(server) {
  server.requestTimeout = 0;
  server.timeout = 0;
  server.keepAliveTimeout = 0;
  server.headersTimeout = 0;
}

export function buildUpstreamUrl(req, targetBaseUrl) {
  const url = new URL(req.url, 'http://127.0.0.1');
  return new URL(`${url.pathname}${url.search}`, targetBaseUrl);
}

export function forwardHeaders(sourceHeaders, {
  routerlabToken,
  upstreamAuth = 'both',
} = {}) {
  const headers = {};
  for (const [key, value] of Object.entries(sourceHeaders)) {
    const normalized = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(normalized) && normalized !== 'authorization' && normalized !== 'x-api-key') {
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

export function isAuthorized(req, gatewayToken) {
  if (!gatewayToken) {
    return true;
  }

  const authorization = req.headers.authorization ?? '';
  const apiKey = req.headers['x-api-key'] ?? '';
  return authorization === `Bearer ${gatewayToken}` || apiKey === gatewayToken;
}

export function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function writeJson(res, payload, status = 200, headers = {}) {
  res.writeHead(status, {
    ...headers,
    'content-type': 'application/json',
  });
  res.end(JSON.stringify(payload));
}

async function requestLongRunningHttp(url, { method, headers, body }) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'http:' ? http : https;
    const upstreamReq = transport.request(url, { method, headers }, resolve);
    upstreamReq.setTimeout(0);
    upstreamReq.once('error', reject);
    upstreamReq.end(body);
  });
}

async function writeLongRunningHttpResponse(res, upstream) {
  const responseHeaders = {};
  for (const [key, value] of Object.entries(upstream.headers)) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders[key] = value;
    }
  }

  res.writeHead(upstream.statusCode ?? 502, responseHeaders);
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
