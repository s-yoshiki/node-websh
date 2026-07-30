/**
 * The seam between the terminal UI and whatever carries bytes to a PTY.
 *
 * The web build sends frames over a WebSocket; the Tauri build hands them to
 * Rust over IPC. `TerminalView` only ever sees this interface, which is what
 * lets both apps share the exact same component.
 */

import type { ClientMessage, ServerMessage } from './messages.ts';

export type TransportStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export interface TransportState {
  status: TransportStatus;
  /** Human-readable detail for the UI; set on `error` and unclean `closed`. */
  detail?: string;
  /** True when the failure is terminal and reconnecting cannot help. */
  unauthorized?: boolean;
}

export type MessageListener = (message: ServerMessage) => void;
export type StateListener = (state: TransportState) => void;
export type Unsubscribe = () => void;

export interface TerminalTransport {
  readonly state: TransportState;
  connect(): void;
  send(message: ClientMessage): void;
  onMessage(listener: MessageListener): Unsubscribe;
  onStateChange(listener: StateListener): Unsubscribe;
  dispose(): void;
}

/**
 * Listener bookkeeping shared by the concrete transports. Subclasses push
 * frames in with `emitMessage` / `setState` and never touch the sets directly.
 */
export abstract class BaseTransport implements TerminalTransport {
  #messageListeners = new Set<MessageListener>();
  #stateListeners = new Set<StateListener>();
  #state: TransportState = { status: 'idle' };

  get state(): TransportState {
    return this.#state;
  }

  abstract connect(): void;
  abstract send(message: ClientMessage): void;

  onMessage(listener: MessageListener): Unsubscribe {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  onStateChange(listener: StateListener): Unsubscribe {
    this.#stateListeners.add(listener);
    listener(this.#state);
    return () => this.#stateListeners.delete(listener);
  }

  dispose(): void {
    this.#messageListeners.clear();
    this.#stateListeners.clear();
  }

  protected emitMessage(message: ServerMessage): void {
    for (const listener of this.#messageListeners) listener(message);
  }

  protected setState(state: TransportState): void {
    this.#state = state;
    for (const listener of this.#stateListeners) listener(state);
  }
}
