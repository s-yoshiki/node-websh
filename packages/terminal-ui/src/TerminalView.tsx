import type { ServerMessage, TerminalTransport, TransportState } from '@node-websh/protocol';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { type ITheme, Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import { DEFAULT_FONT_FAMILY, darkTheme } from './theme';

export interface TerminalViewProps {
  /** Carries frames to a PTY. The web app uses a WebSocket, desktop uses IPC. */
  transport: TerminalTransport;
  theme?: ITheme;
  fontFamily?: string;
  fontSize?: number;
  className?: string;
  /** Called on every transport state change, for status UI. */
  onTransportState?: (state: TransportState) => void;
  /** Called once the server confirms the session. */
  onReady?: (message: Extract<ServerMessage, { type: 'ready' }>) => void;
  /** Called when the shell exits. */
  onExit?: (exitCode: number) => void;
}

/**
 * An xterm.js terminal bound to a transport.
 *
 * The terminal is created once and torn down on unmount. Everything that can
 * change at runtime (theme, font size) is pushed onto the live instance
 * instead, because recreating it would wipe the scrollback and kill the shell.
 */
export function TerminalView({
  transport,
  theme = darkTheme,
  fontFamily = DEFAULT_FONT_FAMILY,
  fontSize = 14,
  className,
  onTransportState,
  onReady,
  onExit,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Callbacks are read through a ref so a caller passing inline arrow
  // functions does not tear down and respawn the terminal on every render.
  const handlers = useRef({ onTransportState, onReady, onExit });
  handlers.current = { onTransportState, onReady, onExit };

  // biome-ignore lint/correctness/useExhaustiveDependencies: theme, fontFamily and fontSize are read once to seed the terminal. Adding them here would recreate it — wiping the scrollback and killing the shell — so the effect below pushes changes onto the live instance instead.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily,
      fontSize,
      theme,
      scrollback: 10_000,
      macOptionIsMeta: true,
    });

    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new SearchAddon());
    terminal.loadAddon(new WebLinksAddon());
    terminal.loadAddon(new ClipboardAddon());

    const unicode11 = new Unicode11Addon();
    terminal.loadAddon(unicode11);
    // Width calculation for CJK and emoji is wrong without this, which shows
    // up immediately as misaligned columns in any TUI.
    terminal.unicode.activeVersion = '11';

    terminal.open(container);

    // WebGL is a large speed-up but is unavailable in some environments
    // (software rendering, older GPUs); canvas rendering is the fallback.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      // Intentionally silent: the terminal works fine without it.
    }

    terminalRef.current = terminal;
    fitRef.current = fit;

    // `fit()` derives the geometry from the container size and the measured
    // character width, so it has to run once both are real. Deferring to the
    // next frame, and again once fonts resolve, keeps the first size the PTY
    // ever sees from being a guess.
    let fitFrame: number | null = null;
    const requestFit = () => {
      if (fitFrame !== null) cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(() => {
        fitFrame = null;
        safeFit(fit, container);
      });
    };

    const stopInput = terminal.onData((data) => {
      transport.send({ type: 'input', data });
    });

    const stopResize = terminal.onResize(({ cols, rows }) => {
      transport.send({ type: 'resize', cols, rows });
    });

    const offMessage = transport.onMessage((message) => {
      switch (message.type) {
        case 'output':
          terminal.write(message.data);
          break;
        case 'ready':
          handlers.current.onReady?.(message);
          // The PTY starts at the protocol default; fitting here reports the
          // real geometry, and `onResize` above forwards it.
          requestFit();
          terminal.focus();
          break;
        case 'exit':
          handlers.current.onExit?.(message.exitCode);
          terminal.write(`\r\n\x1b[90m[process exited with code ${message.exitCode}]\x1b[0m\r\n`);
          break;
        case 'error':
          terminal.write(`\r\n\x1b[31m[${message.code}] ${message.message}\x1b[0m\r\n`);
          break;
        case 'pong':
          break;
      }
    });

    const offState = transport.onStateChange((state) => {
      handlers.current.onTransportState?.(state);
    });

    const observer = new ResizeObserver(requestFit);
    observer.observe(container);
    requestFit();

    // Metrics change again when a custom monospace font finishes loading.
    void document.fonts?.ready.then(requestFit).catch(() => {});

    transport.connect();

    return () => {
      if (fitFrame !== null) cancelAnimationFrame(fitFrame);
      observer.disconnect();
      offMessage();
      offState();
      stopInput.dispose();
      stopResize.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // Recreating the terminal would destroy scrollback and kill the shell, so
    // this deliberately depends only on the transport identity. Theme and font
    // changes are applied to the live instance by the effect below.
  }, [transport]);

  // Live-update the options that are safe to change in place.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = theme;
    terminal.options.fontFamily = fontFamily;
    terminal.options.fontSize = fontSize;
    safeFit(fitRef.current, containerRef.current);
  }, [theme, fontFamily, fontSize]);

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />;
}

/**
 * Fits the terminal to its container, but only once the container has a size.
 *
 * With a zero-sized container — a hidden tab, a collapsed panel, a layout that
 * has not settled — `FitAddon` clamps to its 2x1 floor rather than failing.
 * Forwarding that to the PTY makes the shell rewrap its prompt two characters
 * at a time, and the mangled output stays in the scrollback long after the
 * real size arrives. Waiting for the `ResizeObserver` costs nothing.
 */
function safeFit(fit: FitAddon | null, container: HTMLElement | null) {
  if (!fit || !container) return;
  if (container.clientWidth < 1 || container.clientHeight < 1) return;
  try {
    fit.fit();
  } catch {
    // Dimensions still unusable; the ResizeObserver will call again.
  }
}
