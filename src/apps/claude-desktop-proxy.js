import { requireServiceConfig, validateServiceBaseUrl } from '../routerlab/services.js';
import {
  createLongRunningLlmProxy,
  forwardLongRunningLlmRequest,
  isAuthorized,
  readRequestBody,
  writeJson,
} from '../platform/llm-proxy.js';
import { normalizeLoopbackHost, validateLoopbackPort } from '../platform/loopback.js';
import { buildLoopbackUrl } from './claude-desktop.js';

const MODEL_LIST_PATHS = new Set(['/v1/models', '/models']);
const STATIC_API_ROUTES = new Map([
  ['/v1/messages', new Set(['POST'])],
  ['/v1/messages/count_tokens', new Set(['POST'])],
  ['/v1/messages/batches', new Set(['GET', 'POST'])],
]);
const BATCH_MEMBER_PATH = /^\/v1\/messages\/batches\/[^/]+$/;
const BATCH_ACTION_PATH = /^\/v1\/messages\/batches\/[^/]+\/(cancel|results)$/;

export function createClaudeDesktopProxy(options, dependencies = {}) {
  if (Object.hasOwn(options, 'targetBaseUrl')) {
    throw proxyError('targetBaseUrl is not supported by the Claude Desktop proxy.', 500, 'unsupported_proxy_option');
  }
  const {
    serviceValue,
    routerlabToken,
    gatewayToken,
    allowedOrigins = [],
    routes,
  } = options;
  if (!/^[A-Za-z0-9_-]{43}$/.test(gatewayToken ?? '')) {
    throw proxyError('A generated local proxy credential is required.', 500, 'invalid_gateway_credential');
  }
  if (typeof routerlabToken !== 'string' || !routerlabToken) {
    throw proxyError('A RouterLab token is required.', 500, 'missing_routerlab_token');
  }
  const serviceConfig = requireServiceConfig(serviceValue);
  const service = {
    ...serviceConfig,
    baseUrl: validateServiceBaseUrl(serviceConfig.baseUrl, serviceConfig.value),
  };
  const verifiedRoutes = validateRoutes(routes);
  const routeMap = new Map(verifiedRoutes.map((route) => [route.routeId, route.upstreamModel]));
  const forwardRequest = dependencies.forwardRequest ?? forwardLongRunningLlmRequest;

  const { server } = createLongRunningLlmProxy({
    targetBaseUrl: service.baseUrl,
    routerlabToken,
    gatewayToken,
    upstreamAuth: 'anthropic',
    beforeForward: (req, res) => handleDesktopProxyRequest(req, res, {
      service,
      routerlabToken,
      gatewayToken,
      allowedOrigins,
      routes: verifiedRoutes,
      routeMap,
      forwardRequest,
    }),
  });
  return { server, routes: verifiedRoutes };
}

export async function startClaudeDesktopProxy(options, dependencies = {}) {
  const host = normalizeLoopbackHost(options.host ?? '127.0.0.1');
  const port = validateLoopbackPort(options.port ?? 15721);
  const { server, routes } = createClaudeDesktopProxy(options, dependencies);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return { server, routes, baseUrl: buildLoopbackUrl(host, port) };
}

async function handleDesktopProxyRequest(req, res, context) {
  const route = classifyProxyRoute(req);
  const cors = corsHeaders(req, context.allowedOrigins);
  if (req.method === 'OPTIONS') {
    if (!route.supportedPath) {
      throw proxyError('Unsupported Claude Desktop proxy path.', 404, 'unsupported_proxy_path');
    }
    if (!req.headers.origin || !cors) {
      writeJson(res, errorPayload('CORS preflight origin is not allowed.', 'origin_not_allowed'), 403);
      return true;
    }
    res.writeHead(204, cors);
    res.end();
    return true;
  }
  if (req.headers.origin && !cors) {
    writeJson(
      res,
      errorPayload('Origin is not allowed by the local Claude Desktop proxy.', 'origin_not_allowed'),
      403,
    );
    return true;
  }
  if (!isAuthorized(req, context.gatewayToken)) {
    writeJson(
      res,
      errorPayload('Unauthorized local Claude Desktop proxy request.', 'unauthorized', 'authentication_error'),
      401,
      cors ?? {},
    );
    return true;
  }
  if (!route.supportedPath) {
    throw proxyError('Unsupported Claude Desktop proxy path.', 404, 'unsupported_proxy_path');
  }
  if (!route.allowedMethod) {
    throw proxyError('Method is not allowed for this Claude Desktop proxy path.', 405, 'method_not_allowed');
  }
  if (route.kind === 'models') {
    writeJson(res, modelListResponse(context.routes), 200, cors ?? {});
    return true;
  }

  let body;
  if (req.method === 'POST') {
    const bodyText = await readRequestBody(req);
    body = route.kind === 'message' || route.kind === 'count_tokens' || route.kind === 'batch_create'
      ? rewriteModelRequestBody(bodyText, context.routeMap, route.kind)
      : bodyText;
  }
  await context.forwardRequest(req, res, {
    targetBaseUrl: context.service.baseUrl,
    routerlabToken: context.routerlabToken,
    body,
    upstreamAuth: 'anthropic',
    responseHeaders: cors ?? {},
  });
  return true;
}

function classifyProxyRoute(req) {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname.replace(/\/+$/, '') || '/';
  const method = String(req.method ?? '').toUpperCase();
  if (MODEL_LIST_PATHS.has(pathname)) {
    return { supportedPath: true, allowedMethod: method === 'GET' || method === 'OPTIONS', kind: 'models' };
  }

  const staticMethods = STATIC_API_ROUTES.get(pathname);
  if (staticMethods) {
    return {
      supportedPath: true,
      allowedMethod: staticMethods.has(method) || method === 'OPTIONS',
      kind: pathname === '/v1/messages'
        ? 'message'
        : pathname === '/v1/messages/count_tokens'
          ? 'count_tokens'
          : method === 'POST'
            ? 'batch_create'
            : 'batch_list',
    };
  }
  if (BATCH_MEMBER_PATH.test(pathname)) {
    return {
      supportedPath: true,
      allowedMethod: method === 'GET' || method === 'DELETE' || method === 'OPTIONS',
      kind: method === 'DELETE' ? 'batch_delete' : 'batch_read',
    };
  }
  const action = pathname.match(BATCH_ACTION_PATH)?.[1];
  if (action) {
    const expectedMethod = action === 'cancel' ? 'POST' : 'GET';
    return {
      supportedPath: true,
      allowedMethod: method === expectedMethod || method === 'OPTIONS',
      kind: action === 'cancel' ? 'batch_cancel' : 'batch_results',
    };
  }
  return { supportedPath: false, allowedMethod: false, kind: null };
}

function modelListResponse(routes) {
  const data = routes.map((route) => ({
    type: 'model',
    id: route.routeId,
    ...(route.createdAt !== undefined ? { created_at: route.createdAt } : {}),
    ...(route.supports1m === true ? { supports1m: true } : {}),
  }));
  return { data, has_more: false, first_id: data[0]?.id ?? null, last_id: data.at(-1)?.id ?? null };
}

function rewriteModelRequestBody(bodyText, routeMap, kind) {
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    throw proxyError('Request body is not valid JSON.', 400, 'invalid_json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw proxyError('Request body must be a JSON object.', 400, 'invalid_json');
  }

  if (kind === 'batch_create') {
    if (!Array.isArray(body.requests) || body.requests.length === 0) {
      throw proxyError('Batch requests must contain at least one request.', 400, 'missing_model');
    }
    for (const request of body.requests) {
      if (!request || typeof request !== 'object' || Array.isArray(request)
        || !request.params || typeof request.params !== 'object' || Array.isArray(request.params)) {
        throw proxyError('Every batch request must contain params.model.', 400, 'missing_model');
      }
      request.params.model = rewriteModel(request.params.model, routeMap);
    }
  } else {
    body.model = rewriteModel(body.model, routeMap);
  }
  return JSON.stringify(body);
}

function rewriteModel(model, routeMap) {
  if (typeof model !== 'string' || !model) {
    throw proxyError('A model is required.', 400, 'missing_model');
  }
  if (!routeMap.has(model)) {
    throw proxyError('The requested model is not allowed.', 403, 'model_not_allowed');
  }
  return routeMap.get(model);
}

function validateRoutes(routes) {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw proxyError('No verified Claude Desktop model routes are available.', 500, 'no_authorized_models');
  }
  const seen = new Set();
  return routes.map((route) => {
    if (!route || typeof route !== 'object'
      || typeof route.routeId !== 'string' || !route.routeId
      || typeof route.upstreamModel !== 'string' || !route.upstreamModel
      || seen.has(route.routeId)) {
      throw proxyError('Invalid or colliding Claude Desktop model routes.', 500, 'route_collision');
    }
    seen.add(route.routeId);
    return {
      routeId: route.routeId,
      upstreamModel: route.upstreamModel,
      ...(typeof route.labelOverride === 'string' && route.labelOverride
        ? { labelOverride: route.labelOverride }
        : {}),
      ...(route.supports1m === true ? { supports1m: true } : {}),
      ...(typeof route.createdAt === 'string' || typeof route.createdAt === 'number'
        ? { createdAt: route.createdAt }
        : {}),
    };
  });
}

function corsHeaders(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return {};
  if (!allowedOrigins.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,anthropic-version,x-api-key',
    vary: 'Origin',
  };
}

function errorPayload(message, code, type = 'invalid_request_error') {
  return { error: { message, type, code } };
}

function proxyError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.type = 'invalid_request_error';
  return error;
}
