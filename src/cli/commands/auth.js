import { password } from '@inquirer/prompts';
import { deleteStoredToken, getStoredTokenStatus, storeToken } from '../../security/token-store.js';
import { requireServiceConfig, resolveServiceBaseUrl, resolveServiceEnvToken } from '../../routerlab/services.js';
import { fetchModels, validateTokenFormat } from '../../routerlab/models.js';
import { resolveTokenWithSource } from '../../apps/claude-code.js';
import { AUTH_MENU_ITEMS, askMenu } from '../menu.js';
import { print } from './output.js';

export function getAuthMenuContext(options) {
  const service = requireServiceConfig(options.service);
  return { service, title: 'Auth (' + service.label + ')', options: { ...options, service: service.value } };
}


export async function handleAuth(action, options, {
  passwordFn = password,
  deleteStoredTokenFn = deleteStoredToken,
  getStoredTokenStatusFn = getStoredTokenStatus,
  storeTokenFn = storeToken,
  fetchModelsFn = fetchModels,
  resolveTokenWithSourceFn = resolveTokenWithSource,
} = {}) {
  const service = requireServiceConfig(options.service);
  if (action === 'login' || action === 'change') {
    if (options.dryRun) {
      const format = options.token ? validateTokenFormat(options.token) : null;
      if (format && !format.valid) throw new Error(format.message);
      const status = getStoredTokenStatusFn(service.value);
      print({
        dryRun: true, service: service.value, backend: status.backend,
        storageSupported: status.supported, tokenProvided: Boolean(options.token),
        wouldReplace: status.stored,
      }, options);
      return;
    }
    const token = options.token ?? await passwordFn({ message: service.label + ' token:' });
    const format = validateTokenFormat(token);
    if (!format.valid) throw new Error(format.message);
    const storage = storeTokenFn(token.trim(), service.value);
    print({ stored: true, service: service.value, backend: storage.backend }, options);
    return;
  }
  if (action === 'logout') {
    if (options.dryRun) {
      const status = getStoredTokenStatusFn(service.value);
      print({ dryRun: true, service: service.value, wouldDelete: status.stored, backend: status.backend }, options);
      return;
    }
    const deleted = deleteStoredTokenFn(service.value);
    print({ deleted, service: service.value, legacyEntriesIncluded: deleted }, options);
    return;
  }
  if (action === 'test') {
    const resolved = await resolveOptionFirstToken(service, options, resolveTokenWithSourceFn);
    const result = await fetchModelsFn(resolved.token, {
      serviceValue: service.value,
      baseUrl: resolveServiceBaseUrl(service.value, process.env),
    });
    print({ tokenSource: resolved.source, ...result }, options);
    return;
  }
  const status = getStoredTokenStatusFn(service.value);
  const envToken = resolveServiceEnvToken(service.value, process.env);
  print({
    service: service.value,
    ...status,
    envToken: Boolean(envToken.token),
    envTokenKey: envToken.envKey,
    effectiveTokenSource: envToken.token ? envToken.source : status.stored ? 'secure-storage' : 'none',
    codexTokenSource: status.stored ? 'secure-storage' : envToken.source ?? 'none',
  }, options);
}

export async function resolveOptionFirstToken(
  service,
  options,
  resolveTokenWithSourceFn = resolveTokenWithSource,
) {
  if (options.token) {
    const format = validateTokenFormat(options.token);
    if (!format.valid) throw new Error(format.message);
    return { token: options.token.trim(), source: 'option' };
  }
  return resolveTokenWithSourceFn({ serviceValue: service.value, noPrompt: options.noPrompt });
}
