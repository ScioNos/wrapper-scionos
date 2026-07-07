import { detectOS, detectClaudeCode, detectCodexCli, checkGitBashOnWindows } from '../../platform/detect.js';
import { getSecureStorageBackend, getStoredToken } from '../../security/token-store.js';
import { requireServiceConfig, resolveServiceBaseUrlWithSource, resolveServiceEnvToken } from '../../routerlab/services.js';
import { print } from './output.js';

export async function handleDoctor(options) {
  const service = requireServiceConfig(options.service);
  const storedToken = getStoredToken(service.value);
  const envToken = resolveServiceEnvToken(service.value, process.env);
  const baseUrl = resolveServiceBaseUrlWithSource(service.value, process.env);
  const token = envToken.token ?? storedToken;
  const report = {
    os: detectOS(),
    node: process.version,
    claudeCode: detectClaudeCode(),
    codexCli: detectCodexCli(),
    gitBash: checkGitBashOnWindows(),
    secureStorage: getSecureStorageBackend(),
    token: {
      service: service.value,
      present: Boolean(token),
      envToken: Boolean(envToken.token),
      envTokenKey: envToken.envKey,
      storedToken: Boolean(storedToken),
      effectiveTokenSource: envToken.token ? envToken.source : storedToken ? 'secure-storage' : 'none',
      codexTokenSource: storedToken ? 'secure-storage' : envToken.source ?? 'none',
    },
    baseUrl,
  };
  print(report, options);
}
