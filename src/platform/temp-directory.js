import fs from 'node:fs';
import path from 'node:path';

export function removeTemporaryDirectorySync(directory, parent) {
  const absolute = path.resolve(directory);
  const assertChild = (root, target) => {
    const relative = path.relative(root, target);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw new Error(`Refusing recursive cleanup outside temporary parent: ${target}`);
    }
  };
  assertChild(path.resolve(parent), absolute);
  if (!fs.existsSync(absolute)) return;
  assertChild(fs.realpathSync(parent), fs.realpathSync(absolute));
  fs.rmSync(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
