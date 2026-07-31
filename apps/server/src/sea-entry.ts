/**
 * Bootstrap for the Node.js Single Executable Application build.
 *
 * Frontend files and node-pty are embedded as SEA assets. node-pty contains a
 * native addon (and, on Unix, an executable spawn helper), so the operating
 * system requires real files. They are extracted to a private temporary
 * directory for the lifetime of this process.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { getAssetKeys, getRawAsset, isSea } from 'node:sea';
import { setEmbeddedNodePtyEntry } from './node-pty-loader.ts';

const FRONTEND_PREFIX = 'public/';
const NODE_PTY_PREFIX = 'node-pty/';

if (!isSea()) {
  throw new Error('The SEA entry point must run from a Node.js single executable application.');
}

const runtimeDir = mkdtempSync(join(tmpdir(), 'node-websh-'));
const publicDir = join(runtimeDir, 'public');

for (const key of getAssetKeys()) {
  if (!key.startsWith(FRONTEND_PREFIX) && !key.startsWith(NODE_PTY_PREFIX)) continue;

  const destination = join(runtimeDir, ...key.split('/'));
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  writeFileSync(destination, new Uint8Array(getRawAsset(key)), {
    mode: executableAsset(key) ? 0o700 : 0o600,
  });
  if (executableAsset(key)) chmodSync(destination, 0o700);
}

setEmbeddedNodePtyEntry(join(runtimeDir, 'node-pty', 'lib', 'index.js'));
process.env.WEBSH_STATIC_DIR ??= publicDir;

// `exit` handlers must be synchronous. SIGKILL and machine crashes can leave a
// small directory behind in the system temp area; the OS eventually reaps it.
process.once('exit', () => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

void import('./main.ts').catch((cause: unknown) => {
  console.error(cause);
  process.exitCode = 1;
});

function executableAsset(key: string): boolean {
  return key.endsWith('/spawn-helper') || key.endsWith('.exe');
}
