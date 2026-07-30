// Consumers get the terminal styles by importing this package, so neither app
// has to remember to pull them in separately.
import '@xterm/xterm/css/xterm.css';

export { TerminalView, type TerminalViewProps } from './TerminalView';
export { DEFAULT_FONT_FAMILY, darkTheme, lightTheme } from './theme';
