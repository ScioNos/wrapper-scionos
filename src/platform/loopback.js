import net from 'node:net';

export function normalizeLoopbackHost(value) {
  const input = String(value ?? '').trim();
  const host = input.startsWith('[') && input.endsWith(']')
    ? input.slice(1, -1)
    : input;
  const normalized = host.toLowerCase();

  if (normalized === 'localhost' || normalized === '::1') {
    return normalized;
  }
  if (net.isIP(normalized) === 4 && normalized.split('.')[0] === '127') {
    return normalized;
  }

  throw loopbackError('invalid_loopback_host', `Invalid loopback host: ${input || '(empty)'}.`);
}

export function validateLoopbackPort(value) {
  const port = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw loopbackError('invalid_loopback_port', `Invalid loopback port: ${value}.`);
  }
  return port;
}

export function buildValidatedLoopbackUrl(host = '127.0.0.1', port = 15721) {
  const normalizedHost = normalizeLoopbackHost(host);
  const normalizedPort = validateLoopbackPort(port);
  const displayHost = normalizedHost.includes(':') ? `[${normalizedHost}]` : normalizedHost;
  return `http://${displayHost}:${normalizedPort}`;
}

export function parseLoopbackUrl(value) {
  const rawValue = String(value ?? '').trim();
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw loopbackError('invalid_loopback_url', 'The local Claude Desktop proxy URL is invalid.');
  }

  if (parsed.protocol !== 'http:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.pathname !== '' && parsed.pathname !== '/')
    || !parsed.port) {
    throw loopbackError(
      'invalid_loopback_url',
      'The local Claude Desktop proxy URL must be an HTTP loopback origin with an explicit port and no credentials, path, query, or fragment.',
    );
  }

  const host = normalizeLoopbackHost(parsed.hostname);
  const port = validateLoopbackPort(parsed.port);
  const origin = buildValidatedLoopbackUrl(host, port);
  if (parsed.origin !== origin || (rawValue !== origin && rawValue !== `${origin}/`)) {
    throw loopbackError('invalid_loopback_url', 'The local Claude Desktop proxy URL is not canonical.');
  }

  return { origin, host, port };
}

export function isLoopbackHost(value) {
  try {
    normalizeLoopbackHost(value);
    return true;
  } catch {
    return false;
  }
}

function loopbackError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
