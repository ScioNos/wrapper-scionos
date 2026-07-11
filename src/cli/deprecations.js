const emittedWarnings = new Set();

export function warnDeprecationOnce(key, message) {
  if (emittedWarnings.has(key)) {
    return;
  }
  emittedWarnings.add(key);
  console.error(`DEPRECATED ${message}`);
}

export function resetDeprecationWarningsForTests() {
  emittedWarnings.clear();
}
