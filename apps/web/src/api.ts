import type { ApiError, ServerInfo, SessionStatus } from '@node-websh/protocol';

/**
 * Thrown for any non-2xx `/api` response, carrying the server's own wording so
 * the UI can show it verbatim instead of inventing a message.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    // The session lives in an httpOnly cookie, so every call has to carry it.
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    let body: ApiError | null = null;
    try {
      body = (await response.json()) as ApiError;
    } catch {
      // Not a JSON error body; fall through to a generic message.
    }
    throw new ApiRequestError(
      response.status,
      body?.error ?? 'unknown',
      body?.message ?? `Request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

export function fetchServerInfo(): Promise<ServerInfo> {
  return request<ServerInfo>('/api/info');
}

export function fetchSession(): Promise<SessionStatus> {
  return request<SessionStatus>('/api/auth/session');
}

export function signIn(token: string): Promise<SessionStatus> {
  return request<SessionStatus>('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function signOut(): Promise<SessionStatus> {
  return request<SessionStatus>('/api/auth/session', { method: 'DELETE' });
}

/**
 * Reads a one-shot token out of the URL fragment and removes it.
 *
 * The server prints a `#token=…` link at startup. A fragment never leaves the
 * browser — it is not sent in the request, so it cannot appear in server logs,
 * proxy logs or a `Referer` header the way a query parameter would. It is
 * still visible in the address bar and in history, so it is cleared as soon as
 * it has been read, and it is only ever exchanged for a cookie once.
 */
export function takeTokenFromFragment(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;

  const token = new URLSearchParams(hash).get('token');
  if (!token) return null;

  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return token;
}
