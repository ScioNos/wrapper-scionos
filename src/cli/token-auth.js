import { validateTokenFormat } from '../routerlab/models.js';

export function explicitCliToken(token, envToken) {
  const format = validateTokenFormat(token);
  if (!format.valid) throw new Error(format.message);
  return {
    token: token.trim(),
    source: 'option',
    envTokenPresent: Boolean(envToken.token),
    envTokenKey: envToken.envKey,
    storedTokenPresent: false,
  };
}

export function describeCliTokenSource(resolvedToken) {
  if (resolvedToken.source === 'option') return '--token';
  if (resolvedToken.source === 'secure-storage') return 'secure storage';
  if (resolvedToken.source === 'prompt') return 'the interactive prompt';
  if (resolvedToken.source === 'env' || resolvedToken.source === 'legacy-env') {
    return resolvedToken.envTokenKey ? `environment variable ${resolvedToken.envTokenKey}` : 'the environment';
  }
  return 'the configured token source';
}

export function cliAuthenticationError(client, validation, service, resolvedToken, recovery) {
  const status = validation.status ?? 401;
  const error = new Error(
    `${service.label} rejected the ${client} token from ${describeCliTokenSource(resolvedToken)} with HTTP ${status}. ${recovery}`,
  );
  error.code = 'auth_failed';
  error.statusCode = status;
  return error;
}
