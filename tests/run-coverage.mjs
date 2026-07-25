import { spawnSync } from 'node:child_process';

const args = ['--test'];
args.push(
  '--experimental-test-coverage',
  '--test-coverage-lines=85',
  '--test-coverage-functions=85',
  '--test-coverage-branches=80',
);

const result = spawnSync(process.execPath, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
