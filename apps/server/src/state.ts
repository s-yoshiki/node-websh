import type { AuthStore } from './auth.ts';
import type { Config } from './config.ts';

/** Everything the request handlers share. */
export interface AppState {
  config: Config;
  auth: AuthStore;
  /** Number of terminals currently open. */
  activeSessions: number;
}

/**
 * Decides whether an upgrade or request may proceed, based on `Origin`.
 *
 * Cookie-authenticated WebSockets need this. `SameSite=Strict` already stops
 * most cross-site upgrades, but the guarantee is not uniform across clients,
 * and without the check any page the user visits could open a shell on their
 * machine. Requests with no `Origin` are allowed: that means a non-browser
 * client, and therefore no ambient cookie to abuse.
 */
export function isOriginAllowed(
  state: AppState,
  origin: string | undefined,
  host: string | undefined,
): boolean {
  if (!origin) return true;
  if (state.config.allowedOrigins.includes(origin)) return true;

  const authority = origin.split('://')[1];
  return authority !== undefined && host !== undefined && authority === host;
}

/**
 * `Secure` cookies are dropped over plain HTTP, which would break the common
 * `http://localhost` case, so it is set only when the request really did
 * arrive over TLS or the operator forced it on.
 */
export function useSecureCookie(state: AppState, forwardedProto: string | undefined): boolean {
  if (state.config.secureCookie) return true;
  return forwardedProto?.toLowerCase() === 'https';
}
