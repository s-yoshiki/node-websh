/**
 * Wire protocol shared by the browser and the server.
 *
 * Both ends import these types, so a rename on one side is a compile error on
 * the other. That is the whole point: the pre-monorepo code declared the two
 * halves independently, and the browser sent `{ resizer: [...] }` while the
 * server read `msg.resize`. Window resizing silently did nothing, and nothing
 * caught it.
 */

/** Bumped whenever a change would break an older client. */
export const PROTOCOL_VERSION = 1;

/**
 * PTY resize rejects non-positive values, and an unbounded request would make
 * the kernel allocate scrollback buffers sized by whatever the client claims.
 */
export const MIN_COLS = 1;
export const MIN_ROWS = 1;
export const MAX_COLS = 1000;
export const MAX_ROWS = 1000;

/** Terminal geometry in character cells. */
export interface TerminalSize {
  cols: number;
  rows: number;
}

// --- Client -> server -------------------------------------------------------

/** Keystrokes or pasted text typed into the terminal. */
export interface InputMessage {
  type: 'input';
  data: string;
}

/** The viewport changed size and the PTY should follow. */
export interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

/** Liveness probe; the server answers with `pong` carrying the same `at`. */
export interface PingMessage {
  type: 'ping';
  at: number;
}

export type ClientMessage = InputMessage | ResizeMessage | PingMessage;

// --- Server -> client -------------------------------------------------------

/** Sent once, right after the shell is spawned. */
export interface ReadyMessage {
  type: 'ready';
  protocolVersion: number;
  sessionId: string;
  shell: string;
  cols: number;
  rows: number;
}

/** Raw PTY output, forwarded verbatim to xterm. */
export interface OutputMessage {
  type: 'output';
  data: string;
}

/** The shell terminated. The socket closes right after. */
export interface ExitMessage {
  type: 'exit';
  exitCode: number;
}

export type TerminalErrorCode =
  | 'unauthorized'
  | 'spawn_failed'
  | 'session_limit'
  | 'bad_message'
  | 'internal';

/** A failure worth showing the user. */
export interface ErrorMessage {
  type: 'error';
  code: TerminalErrorCode;
  message: string;
}

export interface PongMessage {
  type: 'pong';
  at: number;
}

export type ServerMessage = ReadyMessage | OutputMessage | ExitMessage | ErrorMessage | PongMessage;

// --- HTTP payloads ----------------------------------------------------------

/** Response body of every method on `/api/auth/session`. */
export interface SessionStatus {
  authenticated: boolean;
  /** Unix milliseconds, or `null` when not signed in. */
  expiresAt: number | null;
}

/** Request body of `POST /api/auth/session`. */
export interface LoginRequest {
  token: string;
}

/** Error body returned by every `/api` route that fails. */
export interface ApiError {
  error: string;
  message: string;
}

/** Server metadata the UI reads before sign-in. */
export interface ServerInfo {
  version: string;
  protocolVersion: number;
  authRequired: boolean;
}

// --- Close codes ------------------------------------------------------------

/**
 * WebSocket close codes in the application-private range (4000-4999).
 *
 * `unauthorized` is deliberately distinct so the client can fall back to the
 * login screen instead of retrying a reconnect that can never succeed.
 */
export const CloseCode = {
  normal: 1000,
  unauthorized: 4001,
  sessionLimit: 4002,
  protocolError: 4003,
  shellExited: 4004,
} as const;

export type CloseCode = (typeof CloseCode)[keyof typeof CloseCode];
