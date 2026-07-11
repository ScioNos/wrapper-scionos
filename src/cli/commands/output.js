export function print(value, options = {}) {
  if (options.json) {
    console.log(JSON.stringify({
      ok: true,
      command: options.command ?? 'unknown',
      data: value ?? {},
    }));
    return;
  }
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

export function printError(error, { json = false } = {}) {
  const code = error?.code ?? (error?.exitCode === 2 ? 'invalid_usage' : 'runtime_error');
  const message = error?.message ?? String(error);
  if (json) {
    console.log(JSON.stringify({ ok: false, error: { code, message } }));
  } else {
    console.error('wrapper-scionos: ' + message);
  }
}
