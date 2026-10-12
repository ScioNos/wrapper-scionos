export function mergeNoProxyValues(environment, loopbackHost) {
  const values = Object.entries(environment ?? {})
    .filter(([key]) => key.toUpperCase() === 'NO_PROXY')
    .flatMap(([, value]) => String(value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  values.push('127.0.0.1', 'localhost', '::1', loopbackHost);
  return [...new Set(values.map((value) => value.toLowerCase()))].join(',');
}
