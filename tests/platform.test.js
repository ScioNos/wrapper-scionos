import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInteractiveCliInvocation } from '../src/platform/process.js';

test('Windows command shims are launched through cmd without shell args', () => {
  const invocation = buildInteractiveCliInvocation('C:\\tools\\codex.cmd', [
    '-c',
    'model_provider="custom"',
    '-c',
    'model_providers.custom={name="routerlab",base_url="https://api.routerlab.ch/v1",wire_api="responses",env_key="OPENAI_API_KEY"}',
  ], {
    platform: 'win32',
    comSpec: 'C:\\Windows\\System32\\cmd.exe',
  });

  assert.equal(invocation.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(invocation.args[3], /^""C:\\tools\\codex\.cmd"/);
  assert.match(invocation.args[3], /"$/);
  assert.match(invocation.args[3], /"model_provider=\^"custom\^""/);
  assert.match(invocation.args[3], /"model_providers\.custom=\{name=\^"routerlab\^",base_url=\^"https:\/\/api\.routerlab\.ch\/v1\^",wire_api=\^"responses\^",env_key=\^"OPENAI_API_KEY\^"\}"/);
});

test('Windows bare commands are launched through PATH like the user terminal', () => {
  const invocation = buildInteractiveCliInvocation('codex', [
    '-c',
    'model_provider="custom"',
    '--help',
  ], {
    platform: 'win32',
  });

  assert.equal(invocation.command, 'powershell.exe');
  assert.deepEqual(invocation.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.equal(invocation.args[3], '& \'codex\' \'-c\' \'model_provider="custom"\' \'--help\'');
});

test('Non-Windows executables keep direct argv spawning', () => {
  const invocation = buildInteractiveCliInvocation('/usr/local/bin/codex', ['-c', 'model="gpt-5.5"'], {
    platform: 'linux',
  });

  assert.deepEqual(invocation, {
    command: '/usr/local/bin/codex',
    args: ['-c', 'model="gpt-5.5"'],
  });
});
