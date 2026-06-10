import http from 'node:http';
import { Readable } from 'node:stream';
import { DEFAULT_ANTHROPIC_VERSION, requireServiceConfig } from '../routerlab/services.js';
import { modelRoutesForDesktopMapping, modelRoutesForProxyStrategy } from './claude-desktop.js';

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

export function createClaudeDesktopProxy({
  serviceValue,
  strategyValue,
  strategyValues = null,
  routerlabToken,
  gatewayToken = 'scionos-local',
}) {
  const service = requireServiceConfig(serviceValue);
  const routes = strategyValues
    ? modelRoutesForDesktopMapping(service.value, strategyValues)
    : modelRoutesForProxyStrategy(strategyValue, service.value);
  const routeMap = new Map(routes.map((route) => [route.routeId, route.upstreamModel]));

  const server = http.createServer(async (req, res) => {
    try {
      await handleProxyRequest(req, res, {
        service,
        routerlabToken,
        gatewayToken,
        routes,
        routeMap,
      });
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
      }
      res.end(JSON.stringify({ error: { message: error.message } }));
    }
  });

  return { server, routes };
}

export async function startClaudeDesktopProxy(options) {
  const { host = '127.0.0.1', port = 15721 } = options;
  const { server, routes } = createClaudeDesktopProxy(options);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return { server, routes, baseUrl: `http://${host}:${port}` };
}

async function handleProxyRequest(req, res, context) {
  if (isPreflight(req)) {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (isModelListRequest(req)) {
    writeJson(res, modelListResponse(context.routes));
    return;
  }

  if (!isAuthorized(req, context.gatewayToken)) {
    writeJson(res, { error: { message: 'Unauthorized local Claude Desktop proxy request.' } }, 401);
    return;
  }

  const body = await rewriteRequestBody(req, context.routeMap);
  await forwardToRouterLab(req, res, context.service, context.routerlabToken, body);
}

function isPreflight(req) {
  return req.method === 'OPTIONS';
}

function isModelListRequest(req) {
  const url = new URL(req.url, 'http://127.0.0.1');
  return req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models');
}

function modelListResponse(routes) {
  const data = routes.map((route) => ({
    type: 'model',
    id: route.routeId,
    created_at: '2024-01-01T00:00:00Z',
    ...(route.supports1m ? { supports1m: true } : {}),
  }));

  return {
    data,
    has_more: false,
    first_id: data[0]?.id ?? null,
    last_id: data.at(-1)?.id ?? null,
  };
}

function isAuthorized(req, gatewayToken) {
  const authorization = req.headers.authorization ?? '';
  if (!gatewayToken) {
    return true;
  }
  return authorization === `Bearer ${gatewayToken}`;
}

async function rewriteRequestBody(req, routeMap) {
  const bodyText = await readRequestBody(req);
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (typeof body.model === 'string' && routeMap.has(body.model)) {
    body.model = routeMap.get(body.model);
  }
  return JSON.stringify(body);
}

async function forwardToRouterLab(req, res, service, routerlabToken, body) {
  const upstream = await fetch(buildUpstreamUrl(req, service), {
    method: req.method,
    headers: forwardHeaders(req, routerlabToken),
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });

  writeProxyResponse(res, upstream);
}

function buildUpstreamUrl(req, service) {
  const url = new URL(req.url, 'http://127.0.0.1');
  return new URL(`${url.pathname}${url.search}`, service.baseUrl);
}

function forwardHeaders(req, routerlabToken) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const normalized = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(normalized) && normalized !== 'authorization' && normalized !== 'x-api-key') {
      headers[key] = value;
    }
  }

  headers['content-type'] = 'application/json';
  headers['x-api-key'] = routerlabToken;
  headers['anthropic-version'] = headers['anthropic-version'] ?? DEFAULT_ANTHROPIC_VERSION;
  return headers;
}

function writeProxyResponse(res, upstream) {
  const responseHeaders = {};
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders[key] = value;
    }
  });
  Object.assign(responseHeaders, corsHeaders());

  res.writeHead(upstream.status, responseHeaders);
  if (upstream.body) {
    Readable.fromWeb(upstream.body).pipe(res);
  } else {
    res.end();
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function writeJson(res, payload, status = 200) {
  res.writeHead(status, {
    ...corsHeaders(),
    'content-type': 'application/json',
  });
  res.end(JSON.stringify(payload));
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,anthropic-version,x-api-key',
  };
}
