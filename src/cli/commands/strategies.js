import { requireServiceConfig, resolveServiceBaseUrl } from '../../routerlab/services.js';
import { fetchModels, validateTokenFormat } from '../../routerlab/models.js';
import { resolveTokenWithSource } from '../../apps/claude-code.js';
import { getStrategyChoices } from '../../routerlab/strategies.js';
import { print } from './output.js';

export async function handleStrategies(options, {
  fetchModelsFn = fetchModels,
  resolveTokenWithSourceFn = resolveTokenWithSource,
} = {}) {
  const service = requireServiceConfig(options.service);
  let resolved = null;
  if (options.token) {
    const format = validateTokenFormat(options.token);
    if (!format.valid) throw new Error(format.message);
    resolved = { token: options.token.trim(), source: 'option' };
  } else {
    try {
      resolved = await resolveTokenWithSourceFn({ serviceValue: service.value, noPrompt: true });
    } catch (error) {
      if (options.noPrompt) throw error;
    }
  }
  const validation = resolved ? await fetchModelsFn(resolved.token, {
    serviceValue: service.value,
    baseUrl: resolveServiceBaseUrl(service.value, process.env),
  }) : null;
  const models = validation?.valid ? validation.models : [];
  const choices = getStrategyChoices(models, service.value);
  print({ service: service.value, tokenSource: resolved?.source ?? 'none', validation, strategies: choices }, options);
}
