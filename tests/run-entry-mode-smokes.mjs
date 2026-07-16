import { spawnSync } from 'node:child_process';

const smokeCases = [
  ['wrapper-scionos'],
  ['wrapper-scionos', '--service', 'llm'],
  ['npx', 'wrapper-scionos'],
  ['npx', 'wrapper-scionos', '--service', 'llm'],
];

for (const args of smokeCases) {
  const result = spawnSync(process.execPath, ['tests/entry-mode-smoke.mjs', ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
