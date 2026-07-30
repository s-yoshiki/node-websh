/**
 * Configuration from environment variables and command line flags.
 *
 * Flags win over the environment, which wins over the defaults.
 */

import { parseArgs } from 'node:util';

export interface Config {
  host: string;
  port: number;
  /** `null` disables authentication entirely. */
  token: string | null;
  shell: string | null;
  cwd: string | null;
  sessionTtlMs: number;
  maxSessions: number;
  allowedOrigins: string[];
  secureCookie: boolean;
  /** Where the built frontend lives, or `null` when it is not bundled. */
  staticDir: string | null;
}

function envFlag(name: string): boolean {
  const value = process.env[name];
  return value === '1' || value?.toLowerCase() === 'true';
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function splitOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function loadConfig(argv = process.argv.slice(2)): Config {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      host: { type: 'string' },
      port: { type: 'string', short: 'p' },
      token: { type: 'string' },
      shell: { type: 'string' },
      cwd: { type: 'string' },
      'session-ttl-minutes': { type: 'string' },
      'max-sessions': { type: 'string' },
      'allowed-origin': { type: 'string', multiple: true },
      'secure-cookie': { type: 'boolean' },
      'insecure-no-auth': { type: 'boolean' },
      'static-dir': { type: 'string' },
    },
  });

  const noAuth = values['insecure-no-auth'] === true || envFlag('WEBSH_INSECURE_NO_AUTH');
  const ttlMinutes =
    Number(values['session-ttl-minutes']) || envInt('WEBSH_SESSION_TTL_MINUTES', 720);

  return {
    // Loopback on purpose: this process hands out an interactive shell, so
    // exposing it to a network has to be a deliberate act.
    host: values.host ?? process.env.WEBSH_HOST ?? '127.0.0.1',
    port: Number(values.port) || envInt('WEBSH_PORT', 8999),
    token: noAuth ? null : (values.token ?? process.env.WEBSH_TOKEN ?? null),
    shell: values.shell ?? process.env.WEBSH_SHELL ?? null,
    cwd: values.cwd ?? process.env.WEBSH_CWD ?? null,
    sessionTtlMs: Math.max(1, ttlMinutes) * 60_000,
    maxSessions: Number(values['max-sessions']) || envInt('WEBSH_MAX_SESSIONS', 8),
    allowedOrigins: [
      ...(values['allowed-origin'] ?? []),
      ...splitOrigins(process.env.WEBSH_ALLOWED_ORIGINS),
    ],
    secureCookie: values['secure-cookie'] === true || envFlag('WEBSH_SECURE_COOKIE'),
    staticDir: values['static-dir'] ?? process.env.WEBSH_STATIC_DIR ?? null,
  };
}

export const USAGE = `
Usage: node-websh [options]

  --host <addr>                 Address to bind (default 127.0.0.1)
  -p, --port <n>                Port to bind (default 8999)
  --token <token>               Access token. Generated and printed when unset.
  --shell <path>                Shell to spawn (default $SHELL)
  --cwd <path>                  Working directory for new sessions
  --session-ttl-minutes <n>     Session lifetime (default 720)
  --max-sessions <n>            Concurrent terminals (default 8)
  --allowed-origin <origin>     Extra origin allowed to open a WebSocket
  --secure-cookie               Force Secure on the session cookie
  --insecure-no-auth            Disable authentication entirely
  --static-dir <path>           Directory holding the built frontend

Every option can also be set through WEBSH_* environment variables.
`.trim();
