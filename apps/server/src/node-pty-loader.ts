/**
 * Resolves node-pty from either the workspace or a SEA runtime extraction.
 *
 * Node.js cannot load a native `.node` addon directly from a SEA asset. The
 * SEA entry point extracts node-pty to a private temporary directory first and
 * registers the absolute path to its CommonJS entry point here.
 */

import { createRequire } from 'node:module';

type NodePty = typeof import('node-pty');

const embeddedEntryKey = Symbol.for('node-websh.node-pty-entry');
const requireFromDisk = createRequire(import.meta.url);

type EmbeddedGlobal = typeof globalThis & {
  [embeddedEntryKey]?: string;
};

/** Called only by the SEA bootstrap after its embedded runtime is extracted. */
export function setEmbeddedNodePtyEntry(path: string): void {
  (globalThis as EmbeddedGlobal)[embeddedEntryKey] = path;
}

/** Loads the regular package in development, or the extracted package in SEA. */
export function loadNodePty(): NodePty {
  const embeddedEntry = (globalThis as EmbeddedGlobal)[embeddedEntryKey];
  return requireFromDisk(embeddedEntry ?? 'node-pty') as NodePty;
}
