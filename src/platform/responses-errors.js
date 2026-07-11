const MAX_RAW_ERROR_CHARS = 1024 * 1024;

export function upstreamResponsesError(status, body, context = {}) {
  const value = typeof body === 'string' ? parseJsonOrText(body) : body;
  const error = extractError(value);
  return {
    error: {
      message: buildUpstreamErrorMessage(status, error.message, context),
      type: error.type || 'upstream_error',
      code: error.code ?? null,
      param: error.param ?? null,
    },
  };
}

function extractError(value) {
  if (isPlainObject(value?.error)) return value.error;
  if (isPlainObject(value?.base_resp)) {
    return {
      message: value.base_resp.status_msg ?? value.base_resp.message ?? JSON.stringify(value.base_resp),
      type: 'upstream_error',
      code: value.base_resp.status_code ?? null,
      param: null,
    };
  }
  if (isPlainObject(value)) {
    return {
      message: value.message ?? value.detail ?? JSON.stringify(value),
      type: value.type ?? 'upstream_error',
      code: value.code ?? null,
      param: value.param ?? null,
    };
  }
  return { message: truncateRawError(String(value ?? 'Unknown upstream error')), type: 'upstream_error', code: null, param: null };
}

function parseJsonOrText(text) {
  try { return JSON.parse(text); } catch { return truncateRawError(text); }
}

function buildUpstreamErrorMessage(status, upstreamMessage, context) {
  const parts = [(context.requestLabel ?? 'Upstream Responses request') + ' failed with HTTP ' + status + '.'];
  if (context.serviceValue) parts.push('Service: ' + context.serviceValue + '.');
  if (context.model) parts.push('Model: ' + context.model + '.');
  if (context.upstreamUrl) parts.push('Upstream URL: ' + context.upstreamUrl + '.');
  if (upstreamMessage) parts.push('Upstream message: ' + String(upstreamMessage));
  if (status === 401 || status === 403) parts.push(authFailureHint(context.serviceValue));
  return parts.join(' ');
}

function authFailureHint(serviceValue) {
  const serviceFlag = serviceValue ? '--service ' + serviceValue : '--service <routerlab|llm>';
  return [
    'This is an authorization or model-access denial from the upstream API, not a local proxy permission error.',
    'For Codex, a stored secure-storage token takes precedence over environment variables.',
    'Check the token with wrapper-scionos auth status ' + serviceFlag + ' and wrapper-scionos auth test ' + serviceFlag + ',',
    'replace it with wrapper-scionos auth login ' + serviceFlag + ', or pass --token to test a known-good token.',
  ].join(' ');
}

function truncateRawError(text) {
  return text.length > MAX_RAW_ERROR_CHARS ? text.slice(0, MAX_RAW_ERROR_CHARS) + '...(truncated)' : text;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
