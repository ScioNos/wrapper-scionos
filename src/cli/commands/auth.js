import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { deleteStoredToken, getStoredTokenStatus, storeToken } from '../../security/token-store.js';
import { requireServiceConfig, resolveServiceBaseUrl, resolveServiceEnvToken } from '../../routerlab/services.js';
import { fetchModels, validateTokenFormat } from '../../routerlab/models.js';
import { resolveTokenWithSource } from '../../apps/claude-code.js';
import { AUTH_MENU_ITEMS, askMenu } from '../menu.js';
import { print } from './output.js';

export function getAuthMenuContext(options) {
  const service = requireServiceConfig(options.service);
  return {
    service,
    title: `Auth (${service.label})`,
    options: { ...options, service: service.value },
  };
}

export async function handleAuthMenu(options) {
  const context = getAuthMenuContext(options);

  while (true) {
    const action = await askMenu(context.title, AUTH_MENU_ITEMS);
    if (action === 'back') {
      return;
    }

    await handleAuth(action, context.options);
  }
}

export async function handleAuth(action, options) {
  const service = requireServiceConfig(options.service);
  if (action === 'login' || action === 'change') {
    const token = options.token ?? await promptSecret(`${service.label} token: `);
    const format = validateTokenFormat(token);
    if (!format.valid) {
      throw new Error(format.message);
    }
    const storage = storeToken(token.trim(), service.value);
    console.log(`Stored ${service.label} token with ${storage.backend}.`);
    return;
  }

  if (action === 'logout') {
    const deleted = deleteStoredToken(service.value);
    console.log(deleted ? `Deleted ${service.label} token.` : `No ${service.label} token found.`);
    return;
  }

  if (action === 'test') {
    const resolved = await resolveTokenWithSource({ serviceValue: service.value, noPrompt: options.noPrompt });
    const result = await fetchModels(resolved.token, {
      serviceValue: service.value,
      baseUrl: resolveServiceBaseUrl(service.value, process.env),
    });
    print({ tokenSource: resolved.source, ...result }, options);
    return;
  }

  const status = getStoredTokenStatus(service.value);
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

async function promptSecret(message) {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}
