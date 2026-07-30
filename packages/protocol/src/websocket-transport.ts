/**
 * Browser-side WebSocket transport used by the web app.
 *
 * Authentication is *not* handled here: the session lives in an httpOnly
 * cookie that the browser attaches to the upgrade request automatically. If
 * the server rejects it we get a 4001 close and stop retrying, because no
 * amount of reconnecting will produce a valid cookie.
 */

import { decodeServerMessage, encode } from './codec.ts';
import { type ClientMessage, CloseCode } from './messages.ts';
import { BaseTransport } from './transport.ts';

export interface WebSocketTransportOptions {
  /** Absolute or protocol-relative URL. Defaults to `/ws` on the current origin. */
  url?: string;
  /** Attempt to reconnect after an unclean close. Defaults to true. */
  reconnect?: boolean;
  maxRetries?: number;
  /** Base delay for exponential backoff, in milliseconds. */
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
}

/** Resolves `/ws` against the page origin, upgrading http(s) to ws(s). */
export function defaultWebSocketUrl(path = '/ws'): string {
  const protocol = globalThis.location?.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = globalThis.location?.host ?? 'localhost';
  return `${protocol}//${host}${path}`;
}

export class WebSocketTransport extends BaseTransport {
  #socket: WebSocket | null = null;
  #url: string;
  #reconnect: boolean;
  #maxRetries: number;
  #retryBaseDelayMs: number;
  #retryMaxDelayMs: number;
  #attempt = 0;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;

  constructor(options: WebSocketTransportOptions = {}) {
    super();
    this.#url = options.url ?? defaultWebSocketUrl();
    this.#reconnect = options.reconnect ?? true;
    this.#maxRetries = options.maxRetries ?? 8;
    this.#retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.#retryMaxDelayMs = options.retryMaxDelayMs ?? 10_000;
  }

  connect(): void {
    if (this.#disposed) return;
    if (this.#socket && this.#socket.readyState <= WebSocket.OPEN) return;

    this.setState({ status: this.#attempt === 0 ? 'connecting' : 'reconnecting' });

    const socket = new WebSocket(this.#url);
    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#attempt = 0;
      this.setState({ status: 'open' });
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      const message = decodeServerMessage(event.data);
      if (message) this.emitMessage(message);
    });

    socket.addEventListener('close', (event) => {
      this.#socket = null;
      if (this.#disposed) return;

      if (event.code === CloseCode.unauthorized) {
        this.setState({
          status: 'error',
          detail: 'Session expired or invalid. Please sign in again.',
          unauthorized: true,
        });
        return;
      }

      if (event.code === CloseCode.normal || event.code === CloseCode.shellExited) {
        this.setState({ status: 'closed', detail: event.reason || 'Session ended.' });
        return;
      }

      this.#scheduleReconnect(event.reason || `Connection closed (${event.code}).`);
    });

    socket.addEventListener('error', () => {
      // `close` always follows `error`, so retry scheduling happens there.
      // Surfacing state here would just flash a message that close overwrites.
    });
  }

  send(message: ClientMessage): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) return;
    this.#socket.send(encode(message));
  }

  override dispose(): void {
    this.#disposed = true;
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
    this.#socket?.close(CloseCode.normal, 'client disposed');
    this.#socket = null;
    super.dispose();
  }

  #scheduleReconnect(detail: string): void {
    if (!this.#reconnect || this.#attempt >= this.#maxRetries) {
      this.setState({ status: 'closed', detail });
      return;
    }

    const delay = Math.min(this.#retryMaxDelayMs, this.#retryBaseDelayMs * 2 ** this.#attempt);
    this.#attempt += 1;
    this.setState({ status: 'reconnecting', detail });
    this.#retryTimer = setTimeout(() => this.connect(), delay);
  }
}
