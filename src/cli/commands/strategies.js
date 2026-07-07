import { getStoredToken } from '../../security/token-store.js';
import { requireServiceConfig, resolveServiceBaseUrl, resolveServiceEnvToken } from '../../routerlab/services.js';
import { fetchModels } from '../../routerlab/models.js';
import { getStrategyChoices } from '../../routerlab/strategies.js';
import { print } from './output.js';

export async function handleStrategies(options) {
  const service = requireServiceConfig(options.service);
  const envToken = resolveServiceEnvToken(service.value, process.env);
  const token = getStoredToken(service.value) ?? envToken.token;
  const validation = token ? await fetchModels(token, {
    serviceValue: service.value,
    baseUrl: resolveServiceBaseUrl(service.value, process.env),
  }) : null;
  const models = validation?.valid ? validation.models : [];
  const choices = getStrategyChoices(models, service.value);
  print({ service: service.value, validation, strategies: choices }, options);
}
