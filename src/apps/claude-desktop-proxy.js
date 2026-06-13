import { requireServiceConfig } from '../routerlab/services.js';
import {
  createLongRunningLlmProxy,
  forwardLongRunningLlmRequest,
  isAuthorized,
  readRequestBody,
  writeJson,
} from '../platform/llm-proxy.js';
import { modelRoutesForDesktopMapping, modelRoutesForProxyStrategy } from './claude-desktop.js';

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

  const { server } = createLongRunningLlmProxy({
    targetBaseUrl: service.baseUrl,
    routerlabToken,
    gatewayToken,
    upstreamAuth: 'anthropic',
    beforeForward: (req, res) => handleDesktopProxyRequest(req, res, {
      service,
      routerlabToken,
      gatewayToken,
      routes,
      routeMap,
    }),
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

async function handleDesktopProxyRequest(req, res, context) {
  if (isPreflight(req)) {
    res.writeHead(204, corsHeaders());
    res.end();
    return true;
  }

  if (isModelListRequest(req)) {
    writeJson(res, modelListResponse(context.routes), 200, corsHeaders());
    return true;
  }

  if (!isAuthorized(req, context.gatewayToken)) {
    writeJson(res, { error: { message: 'Unauthorized local Claude Desktop proxy request.' } }, 401, corsHeaders());
    return true;
  }

  const body = await rewriteRequestBody(req, context.routeMap);
  await forwardLongRunningLlmRequest(req, res, {
    targetBaseUrl: context.service.baseUrl,
    routerlabToken: context.routerlabToken,
    body,
    upstreamAuth: 'anthropic',
  });
  return true;
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

async function rewriteRequestBody(req, routeMap) {
  const bodyText = await readRequestBody(req);
  const body = bodyText ? JSON.parse(bodyText) : {};
  if (typeof body.model === 'string' && routeMap.has(body.model)) {
    body.model = routeMap.get(body.model);
  }
  return JSON.stringify(body);
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,anthropic-version,x-api-key',
  };
}
