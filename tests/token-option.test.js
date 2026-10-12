import test from 'node:test';
import assert from 'node:assert/strict';
import { emitOptionDeprecations, parseOptions } from '../src/cli/args.js';
import { resetDeprecationWarningsForTests } from '../src/cli/deprecations.js';
import { readTokenFromStdin, resolveCliToken } from '../src/cli/token-option.js';

test('token stdin mode parses safely and rejects conflicting secret sources', () => {
  const options = parseOptions(['--token-stdin']);
  assert.equal(options.tokenFromStdin, true);
  assert.throws(() => parseOptions(['--token', 'secret', '--token-stdin']), /cannot be combined/);
  assert.throws(() => parseOptions(['--token-stdin=secret']), /does not take a value/);
});

test('inline token options emit a single deprecation warning', () => {
  resetDeprecationWarningsForTests();
  const options = parseOptions(['--token', 'secret']);
  const warnings = [];
  const originalError = console.error;
  console.error = (message) => warnings.push(String(message));
  try {
    emitOptionDeprecations(options);
    emitOptionDeprecations(options);
  } finally {
    console.error = originalError;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /--token-stdin/);
});

test('token stdin is validated and read once for a command', () => {
  assert.equal(
    readTokenFromStdin({ readStdin: () => ' valid-token-with-enough-length-1234567890\n' }),
    'valid-token-with-enough-length-1234567890',
  );
  assert.throws(() => readTokenFromStdin({ readStdin: () => ' \n' }), /No token received/);
  assert.throws(() => readTokenFromStdin({ readStdin: () => { throw new Error('EPIPE'); } }), /Failed to read/);

  let reads = 0;
  const options = { tokenFromStdin: true };
  const readStdin = () => {
    reads += 1;
    return 'stdin-token-with-enough-length-1234567890';
  };
  assert.equal(resolveCliToken(options, { readStdin }), 'stdin-token-with-enough-length-1234567890');
  assert.equal(resolveCliToken(options), 'stdin-token-with-enough-length-1234567890');
  assert.equal(reads, 1);
});
