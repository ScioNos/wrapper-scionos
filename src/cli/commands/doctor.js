import { detectOS, detectClaudeCode, detectCodexCli, checkGitBashOnWindows } from '../../platform/detect.js';
import { getSecureStorageBackend, getStoredTokenStatus } from '../../security/token-store.js';
import { requireServiceConfig, resolveServiceBaseUrlWithSource, resolveServiceEnvToken } from '../../routerlab/services.js';
import { print } from './output.js';

export async function handleDoctor(options) {
  const service = requireServiceConfig(options.service);
  const storedTokenStatus = getStoredTokenStatus(service.value);
  const envToken = resolveServiceEnvToken(service.value, process.env);
  const baseUrl = resolveServiceBaseUrlWithSource(service.value, process.env);
  const report = {
    os: detectOS(),
    node: process.version,
    claudeCode: detectClaudeCode(),
    codexCli: detectCodexCli(),
    gitBash: checkGitBashOnWindows(),
    secureStorage: getSecureStorageBackend(),
    token: {
      service: service.value,
      present: Boolean(envToken.token || storedTokenStatus.stored),
      envToken: Boolean(envToken.token),
      envTokenKey: envToken.envKey,
      storedToken: storedTokenStatus.stored,
      migrationRequired: Boolean(storedTokenStatus.migrationRequired),
      effectiveTokenSource: envToken.token ? envToken.source : storedTokenStatus.stored ? 'secure-storage' : 'none',
      codexTokenSource: storedTokenStatus.stored ? 'secure-storage' : envToken.source ?? 'none',
    },
    baseUrl,
  };
  print(report, options);
}
