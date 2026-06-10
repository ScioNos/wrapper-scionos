export function print(value, options = {}) {
  if (options.json || typeof value !== 'object') {
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    return;
  }

  console.log(JSON.stringify(value, null, 2));
}
