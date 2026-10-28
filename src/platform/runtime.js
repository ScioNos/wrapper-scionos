export const SUPPORTED_NODE_RANGE = '24.x';

export function isSupportedNodeVersion(version = process.versions.node) {
  const match = String(version).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return false;
  }
  return Number(match[1]) === 24;
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  if (!isSupportedNodeVersion(version)) {
    throw new Error('Node.js ' + SUPPORTED_NODE_RANGE + ' is required (detected: ' + version + ').');
  }
}
