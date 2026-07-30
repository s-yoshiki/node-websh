import type { TransportState } from '@node-websh/protocol';

export interface StatusBarProps {
  state: TransportState;
  shell: string | null;
  onSignOut: () => void;
  authRequired: boolean;
}

const LABELS: Record<TransportState['status'], string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  open: 'Connected',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
  error: 'Error',
};

export function StatusBar({ state, shell, onSignOut, authRequired }: StatusBarProps) {
  return (
    <header className="statusbar">
      <span className={`statusbar__dot statusbar__dot--${state.status}`} aria-hidden="true" />
      <span className="statusbar__status">{LABELS[state.status]}</span>
      {shell && <span className="statusbar__shell">{shell}</span>}
      {state.detail && <span className="statusbar__detail">{state.detail}</span>}
      <span className="statusbar__spacer" />
      {authRequired && (
        <button className="statusbar__button" type="button" onClick={onSignOut}>
          Sign out
        </button>
      )}
    </header>
  );
}
