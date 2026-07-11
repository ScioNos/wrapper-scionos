export const SUPPORTED_NODE_RANGE = '^22.13.0 || >=23.5.0';

export function isSupportedNodeVersion(version = process.versions.node) {
  const match = String(version).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return false;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major === 22) {
    return minor >= 13;
  }
  if (major === 23) {
    return minor >= 5;
  }
  return major >= 24;
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  if (!isSupportedNodeVersion(version)) {
    throw new Error('Node.js ' + SUPPORTED_NODE_RANGE + ' is required (detected: ' + version + ').');
  }
}
