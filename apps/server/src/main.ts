/**
 * node-websh: serves the terminal UI and a PTY over WebSocket.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createNodeWebSocket } from '@hono/node-ws';
import type { ApiError, LoginRequest, ServerInfo, SessionStatus } from '@node-websh/protocol';
import { PROTOCOL_VERSION } from '@node-websh/protocol';
import { type Context, Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import {
  AuthStore,
  COOKIE_NAME,
  clearCookie,
  cookieValue,
  randomId,
  sessionCookie,
} from './auth.ts';
import { loadConfig, USAGE } from './config.ts';
import { defaultShell } from './pty.ts';
import { type AppState, isOriginAllowed, useSecureCookie } from './state.ts';
import { createWebSocketHandlers } from './ws.ts';

const VERSION = '0.2.0';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}

const config = loadConfig();

// An explicitly generated token is far safer than a default one, and printing
// it is the only way the operator can use it.
const token = config.token ?? (process.env.WEBSH_INSECURE_NO_AUTH ? null : randomId(24));
const authRequired = token !== null;

const state: AppState = {
  config,
  auth: new AuthStore(token, config.sessionTtlMs),
  activeSessions: 0,
};

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = config.staticDir ?? findStaticDir(here);

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// A terminal needs no third-party anything, so the policy can be strict.
// `unsafe-inline` for styles is unavoidable: xterm sets inline styles on the
// elements it renders.
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    referrerPolicy: 'no-referrer',
    xFrameOptions: 'DENY',
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginResourcePolicy: 'same-origin',
  }),
);

/**
 * Origin check for state-changing API calls.
 *
 * The session lives in a cookie, so without this any site the user visits
 * could post to `/api/auth/session` on their behalf.
 */
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    if (!isOriginAllowed(state, c.req.header('origin'), c.req.header('host'))) {
      return apiError(c, 403, 'forbidden_origin', 'Request origin is not allowed.');
    }
  }
  await next();
});

// --- Routes -----------------------------------------------------------------

app.get('/api/info', (c) =>
  c.json<ServerInfo>({
    version: VERSION,
    protocolVersion: PROTOCOL_VERSION,
    authRequired,
  }),
);

app.get('/api/auth/session', (c) => {
  const expiresAt = state.auth.validate(cookieValue(c.req.header('cookie'), COOKIE_NAME));
  return c.json<SessionStatus>(
    expiresAt === null
      ? { authenticated: false, expiresAt: null }
      : { authenticated: true, expiresAt },
  );
});

app.post('/api/auth/session', async (c) => {
  let body: LoginRequest;
  try {
    body = await c.req.json<LoginRequest>();
  } catch {
    return apiError(c, 400, 'bad_request', 'Expected a JSON body with a token.');
  }

  if (typeof body?.token !== 'string') {
    return apiError(c, 400, 'bad_request', 'Expected a JSON body with a token.');
  }

  const client = clientAddress(c);
  const result = state.auth.login(client, body.token);

  if (result.outcome === 'rate_limited') {
    return apiError(
      c,
      429,
      'rate_limited',
      'Too many failed attempts. Wait a minute and try again.',
    );
  }
  if (result.outcome === 'bad_token' || !result.session) {
    return apiError(c, 401, 'invalid_token', 'That token is not valid.');
  }

  c.header(
    'Set-Cookie',
    sessionCookie(
      result.session.id,
      config.sessionTtlMs,
      useSecureCookie(state, c.req.header('x-forwarded-proto')),
    ),
  );
  return c.json<SessionStatus>({ authenticated: true, expiresAt: result.session.expiresAt });
});

app.delete('/api/auth/session', (c) => {
  state.auth.revoke(cookieValue(c.req.header('cookie'), COOKIE_NAME));
  c.header('Set-Cookie', clearCookie(useSecureCookie(state, c.req.header('x-forwarded-proto'))));
  return c.json<SessionStatus>({ authenticated: false, expiresAt: null });
});

app.get('/ws', upgradeWebSocket(createWebSocketHandlers(state)));

// --- Static frontend --------------------------------------------------------

if (staticDir) {
  app.use(
    '/*',
    serveStatic({
      root: relativeToCwd(staticDir),
      // Vite fingerprints every asset except the entry document, so those can
      // be cached hard while index.html must always be revalidated.
      onFound: (path, c) => {
        c.header(
          'Cache-Control',
          path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
        );
      },
    }),
  );

  // Anything not matched is a client-side route, so hand back the SPA shell.
  // It is read once rather than per request; the file cannot change under a
  // running server.
  const indexHtml = readFile(resolve(staticDir, 'index.html'), 'utf8');
  app.notFound(async (c) => {
    c.header('Cache-Control', 'no-cache');
    return c.html(await indexHtml);
  });
}

// --- Start ------------------------------------------------------------------

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  printBanner(info.address, info.port);
});
injectWebSocket(server);

const sweeper = setInterval(() => state.auth.sweep(), 60_000);
sweeper.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    // Do not wait forever on sockets that will not drain.
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

// --- Helpers ----------------------------------------------------------------

function apiError(c: Context, status: 400 | 401 | 403 | 429 | 500, error: string, message: string) {
  return c.json<ApiError>({ error, message }, status);
}

/**
 * Identifies the client for rate limiting.
 *
 * Behind a proxy this comes from `X-Forwarded-For`, which the client can forge
 * unless the proxy overwrites it — so this is a way to keep honest clients
 * from hammering the endpoint, not a security boundary.
 */
function clientAddress(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

/** Locates the built frontend, whether running from source or from `dist/`. */
function findStaticDir(base: string): string | null {
  const candidates = [
    resolve(base, 'public'), // bundled release: dist/public
    resolve(base, '../../web/dist'), // running from source
  ];
  return candidates.find((dir) => existsSync(resolve(dir, 'index.html'))) ?? null;
}

/** `serveStatic` resolves `root` relative to the working directory. */
function relativeToCwd(dir: string): string {
  const path = relative(process.cwd(), resolve(dir));
  return path.length > 0 ? path : '.';
}

function printBanner(address: string, port: number): void {
  const host = address === '::' || address === '0.0.0.0' ? 'localhost' : address;
  const base = `http://${host}:${port}`;

  console.log();
  console.log(`  node-websh ${VERSION} — terminal over the web`);
  console.log();

  if (token) {
    console.log(`  Open:  ${base}/#token=${token}`);
    console.log();
    console.log(`  Token: ${token}`);
    console.log('  The link carries the token in the URL fragment, which browsers');
    console.log('  never send to a server. It is cleared from the address bar as');
    console.log('  soon as the page exchanges it for a session cookie.');
  } else {
    console.log(`  Open:  ${base}`);
    console.log();
    console.log('  !! Authentication is DISABLED (--insecure-no-auth).');
    console.log('  !! Anyone who can reach this port gets a shell.');
  }

  if (config.host !== '127.0.0.1' && config.host !== 'localhost' && config.host !== '::1') {
    console.log();
    console.log(`  !! Listening on ${config.host}, which is reachable beyond this machine.`);
    console.log('  !! Put it behind TLS; the session cookie and every keystroke');
    console.log('  !! travel in clear text over plain HTTP.');
  }

  if (!staticDir) {
    console.log();
    console.log('  Note: no frontend was found. Build it with `pnpm build`, or use');
    console.log('  the Vite dev server on port 5173.');
  }

  console.log();
  console.log(`  Shell: ${config.shell ?? defaultShell()}`);
  console.log();
}
