import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { MAIN_MENU_ITEMS } from '../src/cli/menu.js';
import { findWindowsExecutable } from '../src/platform/detect.js';
import { buildInteractiveCliInvocation } from '../src/platform/process.js';

let requestedArgs = process.argv.slice(2);
let displayLabel = null;
let selectionMode = 'arrows';
if (requestedArgs[0] === '--label') {
  displayLabel = requestedArgs[1];
  requestedArgs = requestedArgs.slice(2);
}
if (requestedArgs[0] === '--selection') {
  selectionMode = requestedArgs[1];
  requestedArgs = requestedArgs.slice(2);
}

const [requestedCommand, ...args] = requestedArgs;
assert.ok(requestedCommand, 'Usage: node tests/entry-mode-smoke.mjs <command> [...args]');
const languageOptionIndex = args.findIndex((arg) => arg === '--lang' || arg === '--language');
const requestedLanguage = languageOptionIndex === -1 ? 'en' : args[languageOptionIndex + 1] ?? 'en';
const menuPrompt = {
  fr: 'Choisissez une destination :',
  de: 'Wohin möchten Sie gehen?',
  en: 'Choose where you want to go:',
}[String(requestedLanguage).toLowerCase().split('-')[0]] ?? 'Choose where you want to go:';

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
  const menuOpened = stdout.includes(menuPrompt) || stdout.includes('Claude Code');
  if (answered || !menuOpened) return;
  answered = true;
  child.stdin.write(selectionMode === 'numeric'
    ? '0\r'
    : '\u001b[B'.repeat(MAIN_MENU_ITEMS.length - 1) + '\r');
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
assert.match(stdout, new RegExp(menuPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
if (args.includes('llm')) {
  if (String(requestedLanguage).toLowerCase().startsWith('fr')) {
    assert.match(stdout, /Service actif : RouterLab LLM/);
    assert.match(stderr, /Service LLM actif — les modèles disponibles peuvent varier/);
  } else if (String(requestedLanguage).toLowerCase().startsWith('de')) {
    assert.match(stdout, /Aktiver Dienst: RouterLab LLM/);
    assert.match(stderr, /LLM-Dienst aktiv — verfügbare Modelle können variieren/);
  } else {
    assert.match(stdout, /Active service: RouterLab LLM/);
    assert.match(stderr, /Active LLM service — available models may vary/);
  }
} else {
  if (String(requestedLanguage).toLowerCase().startsWith('fr')) {
    assert.match(stdout, /Service actif : RouterLab(?! LLM)/);
  } else if (String(requestedLanguage).toLowerCase().startsWith('de')) {
    assert.match(stdout, /Aktiver Dienst: RouterLab(?! LLM)/);
  } else {
    assert.match(stdout, /Active service: RouterLab(?! LLM)/);
  }
  assert.doesNotMatch(stderr, /LIMITED AVAILABILITY/);
}

console.log((displayLabel ?? `${requestedCommand} ${args.join(' ')}`.trim()) + ': interactive menu OK');
