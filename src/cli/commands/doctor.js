import { detectOS, detectClaudeCode, detectCodexCli, checkGitBashOnWindows } from '../../platform/detect.js';
import { getSecureStorageBackend, getStoredToken } from '../../security/token-store.js';
import { requireServiceConfig } from '../../routerlab/services.js';
import { print } from './output.js';

export async function handleDoctor(options) {
  const service = requireServiceConfig(options.service);
  const token = getStoredToken(service.value) ?? process.env.ANTHROPIC_AUTH_TOKEN ?? null;
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
      source: process.env.ANTHROPIC_AUTH_TOKEN ? 'env' : token ? 'secure-storage' : 'none',
    },
  };
  print(report, options);
}
