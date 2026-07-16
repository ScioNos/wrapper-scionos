import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { MAIN_MENU_ITEMS } from '../src/cli/menu.js';
import { findWindowsExecutable } from '../src/platform/detect.js';
import { buildInteractiveCliInvocation } from '../src/platform/process.js';

const [requestedCommand, ...args] = process.argv.slice(2);
assert.ok(requestedCommand, 'Usage: node tests/entry-mode-smoke.mjs <command> [...args]');

function resolveCommand(command) {
  if (process.platform !== 'win32') return command;
  if (command === 'npx') return path.join(path.dirname(process.execPath), 'npx.cmd');
  if (!path.extname(command)) {
    if (fs.existsSync(command + '.cmd')) return command + '.cmd';
    return findWindowsExecutable(command) ?? command;
  }
  return command;
}

const command = resolveCommand(requestedCommand);
const invocation = buildInteractiveCliInvocation(command, args);
const child = spawn(invocation.command, invocation.args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
  ...(invocation.spawnOptions ?? {}),
});

let stdout = '';
let stderr = '';
let answered = false;
const exitMenu = () => {
  if (answered || !stdout.includes('Choose where you want to go:')) return;
  answered = true;
  child.stdin.write('\u001b[B'.repeat(MAIN_MENU_ITEMS.length - 1) + '\r');
};

child.stdout.on('data', (chunk) => {
  stdout += chunk;
  exitMenu();
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const timeout = setTimeout(() => child.kill(), 60000);
const result = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolve({ code, signal }));
});
clearTimeout(timeout);

assert.equal(answered, true, `Interactive menu did not open.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
assert.equal(result.signal, null, `CLI was terminated by ${result.signal}.\nstderr:\n${stderr}`);
assert.equal(result.code, 0, `CLI exited with ${result.code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
assert.match(stdout, /Choose where you want to go:/);
if (args.includes('llm')) {
  assert.match(stdout, /Service: RouterLab LLM/);
} else {
  assert.match(stdout, /Service: RouterLab(?! LLM)/);
}

console.log(`${requestedCommand} ${args.join(' ')}`.trim() + ': interactive menu OK');
