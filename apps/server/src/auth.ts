/**
 * Token sign-in and session tracking.
 *
 * A client proves it knows the access token once, over `POST
 * /api/auth/session`, and gets back an opaque random session id in an httpOnly
 * cookie. Sessions live in this process only: they are revocable immediately,
 * there is no signing key to manage or leak, and a restart invalidates
 * everything, which is the right default for a process that hands out shells.
 *
 * The token is never accepted on the WebSocket URL. Query strings end up in
 * proxy logs, browser history and `Referer` headers, and a token that grants
 * shell access does not belong in any of them.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Name of the session cookie. */
export const COOKIE_NAME = 'websh_session';

/** Failed sign-ins allowed per client address within the window. */
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 60_000;

export type LoginOutcome = 'ok' | 'bad_token' | 'rate_limited';

export interface LoginResult {
  outcome: LoginOutcome;
  session?: { id: string; expiresAt: number };
}

interface Attempts {
  failures: number;
  windowStart: number;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function randomId(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export class AuthStore {
  /** `null` disables authentication. */
  readonly #tokenDigest: Buffer | null;
  readonly #ttlMs: number;
  readonly #sessions = new Map<string, number>();
  readonly #attempts = new Map<string, Attempts>();

  constructor(token: string | null, ttlMs: number) {
    this.#tokenDigest = token === null ? null : digest(token);
    this.#ttlMs = ttlMs;
  }

  get authRequired(): boolean {
    return this.#tokenDigest !== null;
  }

  /**
   * Verifies the token and, on success, mints a session.
   *
   * Comparison runs over SHA-256 digests, so it is constant time and leaks
   * neither the token nor its length.
   */
  login(client: string, token: string): LoginResult {
    if (this.#tokenDigest === null) {
      return { outcome: 'ok', session: this.#create() };
    }

    if (this.#isRateLimited(client)) {
      return { outcome: 'rate_limited' };
    }

    if (timingSafeEqual(digest(token), this.#tokenDigest)) {
      this.#attempts.delete(client);
      return { outcome: 'ok', session: this.#create() };
    }

    this.#recordFailure(client);
    return { outcome: 'bad_token' };
  }

  /** Returns the expiry when `sessionId` names a live session. */
  validate(sessionId: string | undefined): number | null {
    if (this.#tokenDigest === null) return Date.now() + this.#ttlMs;
    if (!sessionId) return null;

    const expiresAt = this.#sessions.get(sessionId);
    if (expiresAt === undefined) return null;
    if (expiresAt <= Date.now()) {
      this.#sessions.delete(sessionId);
      return null;
    }
    return expiresAt;
  }

  revoke(sessionId: string | undefined): void {
    if (sessionId) this.#sessions.delete(sessionId);
  }

  /** Drops expired entries so neither map can grow without bound. */
  sweep(): void {
    const now = Date.now();
    for (const [id, expiresAt] of this.#sessions) {
      if (expiresAt <= now) this.#sessions.delete(id);
    }
    for (const [client, attempts] of this.#attempts) {
      if (now - attempts.windowStart >= LOCKOUT_WINDOW_MS) this.#attempts.delete(client);
    }
  }

  #create(): { id: string; expiresAt: number } {
    const id = randomId();
    const expiresAt = Date.now() + this.#ttlMs;
    this.#sessions.set(id, expiresAt);
    return { id, expiresAt };
  }

  #isRateLimited(client: string): boolean {
    const attempts = this.#attempts.get(client);
    if (!attempts) return false;
    if (Date.now() - attempts.windowStart >= LOCKOUT_WINDOW_MS) return false;
    return attempts.failures >= MAX_FAILED_ATTEMPTS;
  }

  #recordFailure(client: string): void {
    const now = Date.now();
    const attempts = this.#attempts.get(client);
    if (!attempts || now - attempts.windowStart >= LOCKOUT_WINDOW_MS) {
      this.#attempts.set(client, { failures: 1, windowStart: now });
      return;
    }
    attempts.failures += 1;
  }
}

/** Extracts one cookie value from a raw `Cookie` header. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === name) return pair.slice(index + 1).trim();
  }
  return undefined;
}

/**
 * Builds the `Set-Cookie` header for a new session.
 *
 * `SameSite=Strict` keeps another site from riding the cookie into a WebSocket
 * upgrade; the explicit `Origin` check in `ws.ts` covers the same ground for
 * clients where that guarantee is weaker.
 */
export function sessionCookie(value: string, maxAgeMs: number, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(secure: boolean): string {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
