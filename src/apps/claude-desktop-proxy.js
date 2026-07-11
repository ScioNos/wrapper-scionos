import { requireServiceConfig, resolveServiceBaseUrl } from '../routerlab/services.js';
import {
  createLongRunningLlmProxy,
  forwardLongRunningLlmRequest,
  isAuthorized,
  readRequestBody,
  writeJson,
} from '../platform/llm-proxy.js';
import { buildLoopbackUrl, modelRoutesForDesktopMapping, modelRoutesForProxyStrategy } from './claude-desktop.js';

export function createClaudeDesktopProxy({
  serviceValue,
  strategyValue,
  strategyValues = null,
  routerlabToken,
  gatewayToken,
  allowedOrigins = [],
}) {
  if (!gatewayToken) throw new Error('A generated local proxy credential is required.');
  const serviceConfig = requireServiceConfig(serviceValue);
  const service = { ...serviceConfig, baseUrl: resolveServiceBaseUrl(serviceConfig.value, process.env) };
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
      service, routerlabToken, gatewayToken, allowedOrigins, routes, routeMap,
    }),
  });
  return { server, routes };
}

export async function startClaudeDesktopProxy(options) {
  const { host = '127.0.0.1', port = 15721 } = options;
  const listenHost = host === '[::1]' ? '::1' : host;
  const { server, routes } = createClaudeDesktopProxy(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, listenHost, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return { server, routes, baseUrl: buildLoopbackUrl(listenHost, port) };
}

async function handleDesktopProxyRequest(req, res, context) {
  const cors = corsHeaders(req, context.allowedOrigins);
  if (req.method === 'OPTIONS') {
    if (!req.headers.origin || !cors) {
      writeJson(res, { error: { message: 'CORS preflight origin is not allowed.', type: 'invalid_request_error', code: 'origin_not_allowed' } }, 403);
      return true;
    }
    res.writeHead(204, cors);
    res.end();
    return true;
  }
  if (req.headers.origin && !cors) {
    writeJson(res, { error: { message: 'Origin is not allowed by the local Claude Desktop proxy.', type: 'invalid_request_error', code: 'origin_not_allowed' } }, 403);
    return true;
  }
  if (!isAuthorized(req, context.gatewayToken)) {
    writeJson(res, { error: { message: 'Unauthorized local Claude Desktop proxy request.', type: 'authentication_error', code: 'unauthorized' } }, 401, cors ?? {});
    return true;
  }
  if (isModelListRequest(req)) {
    writeJson(res, modelListResponse(context.routes), 200, cors ?? {});
    return true;
  }

  const body = await rewriteRequestBody(req, context.routeMap);
  await forwardLongRunningLlmRequest(req, res, {
    targetBaseUrl: context.service.baseUrl,
    routerlabToken: context.routerlabToken,
    body,
    upstreamAuth: 'anthropic',
    responseHeaders: cors ?? {},
  });
  return true;
}

function isModelListRequest(req) {
  const url = new URL(req.url, 'http://127.0.0.1');
  return req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models');
}

function modelListResponse(routes) {
  const data = routes.map((route) => ({
    type: 'model', id: route.routeId, created_at: '2024-01-01T00:00:00Z',
    ...(route.supports1m ? { supports1m: true } : {}),
  }));
  return { data, has_more: false, first_id: data[0]?.id ?? null, last_id: data.at(-1)?.id ?? null };
}

async function rewriteRequestBody(req, routeMap) {
  const bodyText = await readRequestBody(req);
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    const error = new Error('Request body is not valid JSON.');
    error.statusCode = 400;
    error.code = 'invalid_json';
    error.type = 'invalid_request_error';
    throw error;
  }
  if (typeof body.model === 'string' && routeMap.has(body.model)) body.model = routeMap.get(body.model);
  return JSON.stringify(body);
}

function corsHeaders(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return {};
  if (!allowedOrigins.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,anthropic-version,x-api-key',
    vary: 'Origin',
  };
}
