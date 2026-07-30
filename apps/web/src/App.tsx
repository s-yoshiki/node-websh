import type { TransportState } from '@node-websh/protocol';
import { WebSocketTransport } from '@node-websh/protocol/browser';
import { TerminalView } from '@node-websh/terminal-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchServerInfo, fetchSession, signIn, signOut, takeTokenFromFragment } from './api';
import { LoginScreen } from './components/LoginScreen';
import { StatusBar } from './components/StatusBar';

type Phase =
  | { kind: 'loading' }
  | { kind: 'signed-out'; error: string | null }
  | { kind: 'signed-in' }
  | { kind: 'unavailable'; message: string };

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [authRequired, setAuthRequired] = useState(true);
  const [transportState, setTransportState] = useState<TransportState>({ status: 'idle' });
  const [shell, setShell] = useState<string | null>(null);

  // A new transport per sign-in: `TerminalView` keys its whole lifecycle off
  // this identity, so a fresh one gives a genuinely fresh terminal.
  const [sessionKey, setSessionKey] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionKey is not read inside; bumping it is how a new sign-in forces a brand new transport.
  const transport = useMemo(
    () => (phase.kind === 'signed-in' ? new WebSocketTransport() : null),
    [phase.kind, sessionKey],
  );

  useEffect(() => () => transport?.dispose(), [transport]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const info = await fetchServerInfo();
        if (cancelled) return;
        setAuthRequired(info.authRequired);

        if (!info.authRequired) {
          setPhase({ kind: 'signed-in' });
          return;
        }

        // A `#token=` link from the server banner signs in without the user
        // having to copy anything by hand.
        const fragmentToken = takeTokenFromFragment();
        if (fragmentToken) {
          try {
            await signIn(fragmentToken);
            if (!cancelled) setPhase({ kind: 'signed-in' });
            return;
          } catch (cause) {
            if (cancelled) return;
            setPhase({
              kind: 'signed-out',
              error: cause instanceof Error ? cause.message : 'That link is no longer valid.',
            });
            return;
          }
        }

        const session = await fetchSession();
        if (cancelled) return;
        setPhase(
          session.authenticated ? { kind: 'signed-in' } : { kind: 'signed-out', error: null },
        );
      } catch {
        if (!cancelled) {
          setPhase({
            kind: 'unavailable',
            message: 'Cannot reach the websh server. Is it still running?',
          });
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignIn = useCallback(async (token: string) => {
    await signIn(token);
    setSessionKey((key) => key + 1);
    setPhase({ kind: 'signed-in' });
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } finally {
      setShell(null);
      setTransportState({ status: 'idle' });
      setPhase({ kind: 'signed-out', error: null });
    }
  }, []);

  // An expired or revoked session closes the socket with 4001; drop straight
  // back to the login screen rather than letting it retry forever.
  useEffect(() => {
    if (transportState.unauthorized) {
      setPhase({ kind: 'signed-out', error: 'Your session expired. Sign in again.' });
    }
  }, [transportState.unauthorized]);

  if (phase.kind === 'loading') {
    return <main className="splash">Connecting…</main>;
  }

  if (phase.kind === 'unavailable') {
    return (
      <main className="splash splash--error" role="alert">
        {phase.message}
      </main>
    );
  }

  if (phase.kind === 'signed-out') {
    return <LoginScreen onSubmit={handleSignIn} initialError={phase.error} />;
  }

  return (
    <div className="app">
      <StatusBar
        state={transportState}
        shell={shell}
        onSignOut={handleSignOut}
        authRequired={authRequired}
      />
      <div className="app__terminal">
        {transport && (
          <TerminalView
            transport={transport}
            onTransportState={setTransportState}
            onReady={(message) => setShell(message.shell)}
          />
        )}
      </div>
    </div>
  );
}
