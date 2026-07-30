import { type FormEvent, useState } from 'react';

export interface LoginScreenProps {
  onSubmit: (token: string) => Promise<void>;
  /** Set when a fragment token was tried automatically and rejected. */
  initialError?: string | null;
}

export function LoginScreen({ onSubmit, initialError }: LoginScreenProps) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onSubmit(token.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed.');
      setToken('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={handleSubmit}>
        <h1 className="login__title">node-websh</h1>
        <p className="login__hint">
          Paste the access token printed by <code>websh-server</code> when it started.
        </p>

        <label className="login__label" htmlFor="token">
          Access token
        </label>
        <input
          id="token"
          className="login__input"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          // biome-ignore lint/a11y/noAutofocus: the token field is the only control on this screen.
          autoFocus
          disabled={busy}
        />

        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}

        <button className="login__button" type="submit" disabled={busy || !token.trim()}>
          {busy ? 'Signing in…' : 'Connect'}
        </button>
      </form>
    </main>
  );
}
