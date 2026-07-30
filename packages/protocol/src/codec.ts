/**
 * Runtime validation for the wire protocol.
 *
 * The types in `messages.ts` describe the shapes but vanish at runtime, and
 * frames arriving off a socket are untrusted input. These guards are the
 * boundary where an unknown frame becomes a typed one, or gets dropped.
 */

import {
  type ClientMessage,
  MAX_COLS,
  MAX_ROWS,
  MIN_COLS,
  MIN_ROWS,
  type ServerMessage,
  type TerminalSize,
} from './messages.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'input':
      return typeof value.data === 'string';
    case 'resize':
      return isInt(value.cols) && isInt(value.rows);
    case 'ping':
      return typeof value.at === 'number';
    default:
      return false;
  }
}

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'ready':
      return (
        typeof value.sessionId === 'string' &&
        typeof value.shell === 'string' &&
        isInt(value.cols) &&
        isInt(value.rows)
      );
    case 'output':
      return typeof value.data === 'string';
    case 'exit':
      return isInt(value.exitCode);
    case 'error':
      return typeof value.code === 'string' && typeof value.message === 'string';
    case 'pong':
      return typeof value.at === 'number';
    default:
      return false;
  }
}

export function encode(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

/** Parses and validates a frame, returning `null` for anything malformed. */
export function decodeServerMessage(raw: string): ServerMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isServerMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Parses and validates a frame, returning `null` for anything malformed. */
export function decodeClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isClientMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Mirrors `TerminalSize::clamped` on the Rust side. */
export function clampSize(size: TerminalSize): TerminalSize {
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.floor(value)));
  return {
    cols: clamp(size.cols, MIN_COLS, MAX_COLS),
    rows: clamp(size.rows, MIN_ROWS, MAX_ROWS),
  };
}
