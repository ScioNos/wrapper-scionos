import fs from 'node:fs';
import { validateTokenFormat } from '../routerlab/models.js';
import { CliUsageError } from './args.js';

function readProcessStdin() {
  return fs.readFileSync(0, 'utf8');
}

// Use `--token-stdin` to avoid exposing a service token in process arguments
// or shell history. The piped input is consumed at most once per options object.
export function readTokenFromStdin({ readStdin = readProcessStdin } = {}) {
  if (readStdin === readProcessStdin && process.stdin.isTTY) {
    throw new CliUsageError('Pass the token through stdin with a pipe; interactive terminals are not read by --token-stdin.');
  }
  let raw;
  try {
    raw = readStdin();
  } catch (error) {
    throw new CliUsageError('Failed to read the token from stdin: ' + (error?.message ?? String(error)));
  }
  const token = String(raw ?? '').trim();
  if (!token) throw new CliUsageError('No token received on stdin.');
  const format = validateTokenFormat(token);
  if (!format.valid) throw new CliUsageError(`Token read from stdin is invalid: ${format.message}`);
  return token;
}

export function resolveCliToken(options, dependencies = {}) {
  if (options?.token) return options.token;
  if (options?.tokenFromStdin) {
    if (options.tokenStdinCache === undefined) {
      options.tokenStdinCache = readTokenFromStdin(dependencies);
    }
    return options.tokenStdinCache;
  }
  return null;
}
