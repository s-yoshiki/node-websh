/**
 * Restores the executable bit on node-pty's `spawn-helper`.
 *
 * node-pty ships prebuilt binaries, and on Unix it `exec`s a small
 * `spawn-helper` to start the shell. The executable bit does not survive
 * extraction in every package manager and CI setup, and when it is missing
 * every single spawn fails with a bare `posix_spawnp failed` — no hint that
 * the cause is a file mode.
 *
 * Cheap to run, and it turns an obscure runtime failure into a non-event.
 */

import { chmod, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

if (process.platform === 'win32') {
  process.exit(0);
}

const roots = ['node_modules/.pnpm', 'node_modules'];
const fixed = [];

/** Walks a directory tree, stopping at a depth that covers node-pty layouts. */
async function walk(dir, depth) {
  if (depth < 0) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isFile() && entry.name === 'spawn-helper') {
      try {
        const info = await stat(path);
        // Only touch it when it is not already executable by the owner.
        if ((info.mode & 0o100) === 0) {
          await chmod(path, 0o755);
          fixed.push(path);
        }
      } catch {
        // A broken symlink or a race with another install; nothing to do.
      }
      continue;
    }

    if (entry.isDirectory()) {
      await walk(path, depth - 1);
    }
  }
}

for (const root of roots) {
  await walk(root, 6);
}

if (fixed.length > 0) {
  console.log(`made ${fixed.length} node-pty spawn-helper binary(s) executable`);
}
