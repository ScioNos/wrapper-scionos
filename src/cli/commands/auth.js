import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { deleteStoredToken, getStoredTokenStatus, storeToken } from '../../security/token-store.js';
import { requireServiceConfig } from '../../routerlab/services.js';
import { fetchModels, validateTokenFormat } from '../../routerlab/models.js';
import { resolveToken } from '../../apps/claude-code.js';
import { AUTH_MENU_ITEMS, askMenu, askText } from '../menu.js';
import { print } from './output.js';

export async function handleAuthMenu(options) {
  while (true) {
    const action = await askMenu('Auth', AUTH_MENU_ITEMS);
    if (action === 'back') {
      return;
    }

    const authOptions = { ...options };
    authOptions.service = await askText('RouterLab service', options.service);
    await handleAuth(action, authOptions);
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
    const token = await resolveToken({ serviceValue: service.value, noPrompt: options.noPrompt });
    const result = await fetchModels(token, { serviceValue: service.value });
    print(result, options);
    return;
  }

  const status = getStoredTokenStatus(service.value);
  print({ service: service.value, ...status, envToken: Boolean(process.env.ANTHROPIC_AUTH_TOKEN) }, options);
}

async function promptSecret(message) {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}
