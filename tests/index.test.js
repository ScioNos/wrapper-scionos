import test from 'node:test';
import assert from 'node:assert/strict';

let entryModulePromise = null;

function loadEntrypointModule() {
  if (!entryModulePromise) {
    entryModulePromise = (async () => {
      const originalArgv = process.argv;
      const originalLog = console.log;
      const originalExitCode = process.exitCode;
      const output = [];
      process.argv = [process.execPath, 'index.js', '--version'];
      console.log = (...values) => output.push(values.join(' '));
      try {
        const entry = await import('../index.js');
        await entry.entrypointPromise;
        return { entry, output };
      } finally {
        process.argv = originalArgv;
        console.log = originalLog;
        if (originalExitCode === undefined) process.exitCode = 0;
        else process.exitCode = originalExitCode;
      }
    })();
  }
  return entryModulePromise;
}

test('entrypoint maps prompt interruptions and runtime failures to stable exit codes', async () => {
  const { entry, output } = await loadEntrypointModule();
  assert.match(output.join('\n'), /4\.1\.0/);

  const promptState = {};
  entry.handleTopLevelError(
    Object.assign(new Error('cancelled'), { name: 'ExitPromptError' }),
    {
      processState: promptState,
      printErrorFn: () => assert.fail('prompt cancellation must not print an error'),
    },
  );
  assert.equal(promptState.exitCode, 130);

  const closedState = {};
  entry.handleTopLevelError(
    Object.assign(new Error('closed'), { code: 'ERR_USE_AFTER_CLOSE' }),
    {
      processState: closedState,
      printErrorFn: () => assert.fail('closed prompt must not print an error'),
    },
  );
  assert.equal(closedState.exitCode, 130);

  const runtimeState = {};
  const printed = [];
  const debugged = [];
  const runtimeError = Object.assign(new Error('bad usage'), { exitCode: 2 });
  entry.handleTopLevelError(runtimeError, {
    argv: ['doctor', '--json'],
    env: { SCIONOS_DEBUG: '1' },
    processState: runtimeState,
    printErrorFn: (error, options) => printed.push({ error, options }),
    errorLogger: (error) => debugged.push(error),
  });
  assert.equal(runtimeState.exitCode, 2);
  assert.equal(printed[0].error, runtimeError);
  assert.deepEqual(printed[0].options, { json: true });
  assert.deepEqual(debugged, [runtimeError]);

  const defaultFailureState = {};
  entry.handleTopLevelError(new Error('runtime'), {
    argv: [],
    env: {},
    processState: defaultFailureState,
    printErrorFn: (_error, options) => printed.push({ options }),
  });
  assert.equal(defaultFailureState.exitCode, 1);
  assert.deepEqual(printed.at(-1).options, { json: false });
});

test('runEntrypoint executes version checks before main and delegates failures', async () => {
  const { entry } = await loadEntrypointModule();

  const order = [];
  await entry.runEntrypoint({
    argv: ['doctor'],
    assertSupportedNodeVersionFn: () => order.push('version'),
    mainFn: async (argv) => order.push(`main:${argv.join(',')}`),
  });
  assert.deepEqual(order, ['version', 'main:doctor']);

  const processState = {};
  const printed = [];
  await entry.runEntrypoint({
    argv: ['doctor', '--json'],
    assertSupportedNodeVersionFn: () => {},
    mainFn: async () => {
      throw Object.assign(new Error('failure'), { exitCode: 7 });
    },
    errorOptions: {
      processState,
      env: {},
      printErrorFn: (error, options) => printed.push({ error, options }),
    },
  });
  assert.equal(processState.exitCode, 7);
  assert.deepEqual(printed[0].options, { json: true });
});
