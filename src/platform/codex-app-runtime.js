import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { buildCodexModelCatalog } from '../apps/codex.js';

const SOURCES = ['security/token-store.js', 'security/keychain.jxa.js', 'security/codex-app-credential.js',
  'routerlab/services.js', 'routerlab/models.js', 'cli/deprecations.js'];

export function describeCodexAppRuntime(paths, id = randomUUID()) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid ScioNos runtime identity.');
  const directory = path.join(paths.runtimePath, id);
  return { directory, helperPath: path.join(directory, 'credential.mjs'), cataloguePath: path.join(directory, 'models.json'), nodePath: process.execPath };
}

export function installCodexAppRuntime(paths, { models, modelMetadata = [], tokenDirectory = process.env.WRAPPER_SCIONOS_TOKEN_DIR,
  descriptor = describeCodexAppRuntime(paths) } = {}) {
  const { directory, helperPath, cataloguePath } = descriptor;
  if (path.dirname(path.resolve(directory)) !== path.resolve(paths.runtimePath)) throw new Error('Invalid ScioNos runtime location.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    for (const source of SOURCES) {
      const target = path.join(directory, 'src', source);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, fs.readFileSync(fileURLToPath(new URL('../' + source, import.meta.url))), { mode: 0o600, flag: 'wx' });
    }
    fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module","private":true}\n', { mode: 0o600, flag: 'wx' });
    const prefix = tokenDirectory ? `process.env.WRAPPER_SCIONOS_TOKEN_DIR = ${JSON.stringify(path.resolve(tokenDirectory))};\n` : '';
    fs.writeFileSync(helperPath, prefix + [
      'try { const { readCodexAppCredential } = await import("./src/security/codex-app-credential.js"); process.stdout.write(readCodexAppCredential(process.argv[2])); }',
      'catch { process.stderr.write("ScioNos credential unavailable. Run wrapper-scionos auth login for this service.\\n"); process.exitCode = 1; }', '',
    ].join('\n'), { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(cataloguePath, JSON.stringify(buildCodexModelCatalog({ models, modelMetadata }), null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return descriptor;
  } catch (error) {
    removeCodexAppRuntime(paths, directory);
    throw error;
  }
}

export function removeCodexAppRuntime(paths, directory) {
  const parent = path.resolve(paths.runtimePath);
  const target = path.resolve(directory);
  if (path.dirname(target) !== parent || !/^[a-f0-9-]{36}$/.test(path.basename(target))) throw new Error('Invalid ScioNos runtime directory.');
  fs.rmSync(target, { recursive: true, force: true });
}
