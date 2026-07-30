/**
 * Spawning and driving the pseudo terminal.
 */

import { homedir } from 'node:os';
import { clampSize, type TerminalSize } from '@node-websh/protocol';
import * as nodePty from 'node-pty';

export interface PtyOptions {
  shell?: string | null;
  cwd?: string | null;
  size: TerminalSize;
}

export interface PtyHandle {
  readonly shell: string;
  readonly size: TerminalSize;
  onData(listener: (data: string) => void): void;
  onExit(listener: (exitCode: number) => void): void;
  write(data: string): void;
  resize(size: TerminalSize): void;
  kill(): void;
}

/** The shell to launch when none is configured. */
export function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'powershell.exe';
  }
  return process.env.SHELL ?? '/bin/bash';
}

/**
 * Builds the child environment.
 *
 * Two additions matter more than they look:
 *
 * - `TERM`/`COLORTERM`: without them programs assume a dumb terminal and
 *   colour and cursor addressing stop working.
 * - A UTF-8 locale, when the parent has none. Under `LC_CTYPE=C`, readline
 *   treats typed bytes as 8-bit characters, so entering anything non-ASCII —
 *   Japanese, an accented letter, an emoji — makes the shell ring the bell and
 *   fire filename completion instead of inserting the text. Daemons, systemd
 *   units and CI runners routinely have no locale set, so without this the
 *   terminal is unusable for exactly the users who need multi-byte input.
 */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';

  const hasLocale = ['LC_ALL', 'LC_CTYPE', 'LANG'].some((key) => {
    const value = env[key];
    return typeof value === 'string' && value.length > 0;
  });
  if (!hasLocale) {
    // macOS understands the bare `UTF-8` charmap; glibc and musl want a full
    // locale name, and `C.UTF-8` is the one that is always present.
    env.LC_CTYPE = process.platform === 'darwin' ? 'UTF-8' : 'C.UTF-8';
  }

  return env;
}

/**
 * Spawns a shell on a PTY.
 *
 * `node-pty` decodes its output with a streaming UTF-8 decoder, so multi-byte
 * characters that straddle two reads arrive intact and callers get strings.
 */
export function spawnPty(options: PtyOptions): PtyHandle {
  const shell = options.shell ?? defaultShell();
  let size = clampSize(options.size);

  const child = nodePty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: size.cols,
    rows: size.rows,
    cwd: options.cwd ?? homedir(),
    env: childEnv() as Record<string, string>,
  });

  let killed = false;

  return {
    shell,
    get size() {
      return size;
    },
    onData(listener) {
      child.onData(listener);
    },
    onExit(listener) {
      child.onExit(({ exitCode }) => listener(exitCode));
    },
    write(data) {
      if (!killed) child.write(data);
    },
    resize(next) {
      if (killed) return;
      size = clampSize(next);
      try {
        child.resize(size.cols, size.rows);
      } catch {
        // The child can exit between the check and the call; the socket will
        // see the exit event either way.
      }
    },
    kill() {
      if (killed) return;
      killed = true;
      try {
        child.kill();
      } catch {
        // Already gone.
      }
    },
  };
}
