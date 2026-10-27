import { getStoredToken } from './token-store.js';
import { validateTokenFormat } from '../routerlab/models.js';
import { requireServiceConfig } from '../routerlab/services.js';
import { pathToFileURL } from 'node:url';

export function readCodexAppCredential(service, { readToken = getStoredToken } = {}) {
  requireServiceConfig(service);
  let token;
  try { token = readToken(service); }
  catch { throw Object.assign(new Error('ScioNos secure credential storage is unavailable.'), { code: 'credential_unavailable' }); }
  if (!validateTokenFormat(token).valid || /[\r\n\x00]/.test(token)) {
    throw Object.assign(new Error('Store a valid service token with wrapper-scionos auth login before opening Codex App.'), { code: 'credential_unavailable' });
  }
  return token.trim();
}

// stdout is the private credential-helper protocol, never a CLI status output.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(readCodexAppCredential(process.argv[2])); }
  catch { process.stderr.write('ScioNos credential unavailable. Run wrapper-scionos auth login for this service.\n'); process.exitCode = 1; }
}
