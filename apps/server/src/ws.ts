/**
 * The `/ws` endpoint: one WebSocket, one PTY.
 */

import {
  CloseCode,
  decodeClientMessage,
  encode,
  PROTOCOL_VERSION,
  type ServerMessage,
  type TerminalErrorCode,
} from '@node-websh/protocol';
import type { Context } from 'hono';
import type { WSContext } from 'hono/ws';
import { COOKIE_NAME, cookieValue, randomId } from './auth.ts';
import { spawnPty } from './pty.ts';
import { type AppState, isOriginAllowed } from './state.ts';

interface Refusal {
  code: number;
  errorCode: TerminalErrorCode;
  message: string;
}

function refusalFor(state: AppState, c: Context): Refusal | null {
  const origin = c.req.header('origin');
  if (!isOriginAllowed(state, origin, c.req.header('host'))) {
    return {
      code: CloseCode.unauthorized,
      errorCode: 'unauthorized',
      message: 'Request origin is not allowed.',
    };
  }

  if (state.auth.authRequired) {
    const sessionId = cookieValue(c.req.header('cookie'), COOKIE_NAME);
    if (state.auth.validate(sessionId) === null) {
      return {
        code: CloseCode.unauthorized,
        errorCode: 'unauthorized',
        message: 'Not signed in, or the session expired.',
      };
    }
  }

  if (state.activeSessions >= state.config.maxSessions) {
    return {
      code: CloseCode.sessionLimit,
      errorCode: 'session_limit',
      message: 'Too many terminals are already open.',
    };
  }

  return null;
}

function send(ws: WSContext, message: ServerMessage): void {
  try {
    ws.send(encode(message));
  } catch {
    // The socket closed underneath us; nothing useful to do.
  }
}

/**
 * Builds the per-connection handlers.
 *
 * The upgrade is accepted even when the request is refused: a browser cannot
 * read the status code of a failed handshake, but it can read a close code,
 * which is how the client knows to show the login screen instead of retrying
 * forever.
 */
export function createWebSocketHandlers(state: AppState) {
  return (c: Context) => {
    const refusal = refusalFor(state, c);
    const sessionId = randomId(8);
    let pty: ReturnType<typeof spawnPty> | null = null;
    let counted = false;

    const release = () => {
      if (counted) {
        state.activeSessions -= 1;
        counted = false;
      }
      pty?.kill();
      pty = null;
    };

    return {
      onOpen(_event: Event, ws: WSContext) {
        if (refusal) {
          send(ws, { type: 'error', code: refusal.errorCode, message: refusal.message });
          ws.close(refusal.code, 'refused');
          return;
        }

        state.activeSessions += 1;
        counted = true;

        try {
          pty = spawnPty({
            shell: state.config.shell,
            cwd: state.config.cwd,
            size: { cols: 80, rows: 24 },
          });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          send(ws, { type: 'error', code: 'spawn_failed', message });
          ws.close(CloseCode.protocolError, 'spawn failed');
          release();
          return;
        }

        pty.onData((data) => send(ws, { type: 'output', data }));
        pty.onExit((exitCode) => {
          send(ws, { type: 'exit', exitCode });
          ws.close(CloseCode.shellExited, 'shell exited');
          release();
        });

        send(ws, {
          type: 'ready',
          protocolVersion: PROTOCOL_VERSION,
          sessionId,
          shell: pty.shell,
          cols: pty.size.cols,
          rows: pty.size.rows,
        });
      },

      onMessage(event: MessageEvent, ws: WSContext) {
        if (!pty || typeof event.data !== 'string') return;

        const message = decodeClientMessage(event.data);
        if (!message) {
          // A malformed frame is dropped, never fatal: a buggy client should
          // not be able to kill someone else's shell.
          return;
        }

        switch (message.type) {
          case 'input':
            pty.write(message.data);
            break;
          case 'resize':
            pty.resize({ cols: message.cols, rows: message.rows });
            break;
          case 'ping':
            send(ws, { type: 'pong', at: message.at });
            break;
        }
      },

      onClose() {
        release();
      },

      onError() {
        release();
      },
    };
  };
}
