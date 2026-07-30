import type { ITheme } from '@xterm/xterm';

/** Default palette, tuned for legibility on a dark background. */
export const darkTheme: ITheme = {
  background: '#11141a',
  foreground: '#d7dae0',
  cursor: '#7aa2f7',
  cursorAccent: '#11141a',
  selectionBackground: '#2b3245',
  black: '#1b1e24',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#c0caf5',
  brightBlack: '#565f89',
  brightRed: '#ff899d',
  brightGreen: '#b9f27c',
  brightYellow: '#ffc777',
  brightBlue: '#8db0ff',
  brightMagenta: '#c7a9ff',
  brightCyan: '#a4daff',
  brightWhite: '#e7ecfb',
};

export const lightTheme: ITheme = {
  background: '#fbfbfd',
  foreground: '#343b58',
  cursor: '#2e7de9',
  cursorAccent: '#fbfbfd',
  selectionBackground: '#d6dbe6',
  black: '#e9e9ed',
  red: '#f52a65',
  green: '#587539',
  yellow: '#8c6c3e',
  blue: '#2e7de9',
  magenta: '#9854f1',
  cyan: '#007197',
  white: '#6172b0',
  brightBlack: '#a1a6c5',
  brightRed: '#f52a65',
  brightGreen: '#587539',
  brightYellow: '#8c6c3e',
  brightBlue: '#2e7de9',
  brightMagenta: '#9854f1',
  brightCyan: '#007197',
  brightWhite: '#3760bf',
};

/** Fonts that actually ship with a full box-drawing and powerline range. */
export const DEFAULT_FONT_FAMILY =
  '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
