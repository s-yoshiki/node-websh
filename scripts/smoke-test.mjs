#!/usr/bin/env node
/**
 * End-to-end check of the built node-websh server.
 *
 * Starts the bundle on a spare port, drives the real HTTP and WebSocket
 * surface, and runs a command in a real shell. This covers the seams the unit
 * tests cannot: cookie handling, the origin check, the WebSocket close codes,
 * and whether the built frontend is actually being served.
 *
 *   node scripts/smoke-test.mjs [--entry path] [--port 8991] [--sea]
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const SEA = args.includes('--sea');
const argValue = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const SEA_ENTRY =
  process.platform === 'win32' ? 'apps/server/dist/node-websh.exe' : 'apps/server/dist/node-websh';
const ENTRY = argValue('entry', SEA ? SEA_ENTRY : 'apps/server/dist/main.js');
const PORT = Number(argValue('port', '8991'));
const TOKEN = 'smoke-test-token-not-a-secret';
const SHELL = process.platform === 'win32' ? undefined : '/bin/sh';
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  const mark = pass ? '[32mPASS[0m' : '[31mFAIL[0m';
  console.log(`${mark}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** Opens a socket, drives it, and resolves once `finish` is called. */
function withSocket(headers, run, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closing.
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish({ timedOut: true }), timeoutMs);
    run(socket, finish);
    socket.onerror = () => finish({ error: true });
  });
}

async function waitForServer(deadlineMs = 20_000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(`${BASE}/api/info`);
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await sleep(200);
  }
  return false;
}

const server = spawn(
  SEA ? ENTRY : process.execPath,
  SEA ? ['--port', String(PORT)] : [ENTRY, '--port', String(PORT)],
  {
    env: {
      ...process.env,
      WEBSH_TOKEN: TOKEN,
      ...(SHELL ? { WEBSH_SHELL: SHELL } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
server.stderr.on('data', (chunk) => process.stderr.write(chunk));

let exitCode = 1;
try {
  if (!(await waitForServer())) {
    console.error(`${ENTRY} never started listening on ${PORT}`);
    process.exit(1);
  }

  // --- Public metadata ---
  const info = await (await fetch(`${BASE}/api/info`)).json();
  check('GET /api/info reports auth is required', info.authRequired === true, JSON.stringify(info));

  // --- Rejections ---
  const anonymous = await (await fetch(`${BASE}/api/auth/session`)).json();
  check('an anonymous session is not authenticated', anonymous.authenticated === false);

  const wrong = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'wrong-token' }),
  });
  check('a wrong token is refused with 401', wrong.status === 401, `status ${wrong.status}`);

  const unauthenticated = await withSocket({}, (socket, finish) => {
    socket.onclose = (event) => finish(event.code);
  });
  check(
    'an unauthenticated WebSocket closes with 4001',
    unauthenticated === 4001,
    `code ${unauthenticated}`,
  );

  // --- Sign in ---
  const login = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN }),
  });
  check('the correct token is accepted', login.status === 200, `status ${login.status}`);

  const setCookie = login.headers.get('set-cookie') ?? '';
  check(
    'the session cookie is HttpOnly and SameSite=Strict',
    setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Strict'),
    setCookie.split(';').slice(1).join(';').trim(),
  );
  const cookie = setCookie.split(';')[0];

  const session = await (
    await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookie } })
  ).json();
  check('the session validates with the cookie', session.authenticated === true);

  // --- CSRF ---
  const crossOrigin = await withSocket(
    { Cookie: cookie, Origin: 'http://evil.example' },
    (socket, finish) => {
      socket.onclose = (event) => finish(event.code);
    },
  );
  check(
    'a cross-origin WebSocket is refused even with a valid cookie',
    crossOrigin === 4001,
    `code ${crossOrigin}`,
  );

  // --- A real shell ---
  const shellRun = await withSocket({ Cookie: cookie, Origin: ORIGIN }, (socket, finish) => {
    let output = '';
    let ready = null;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'ready') {
        ready = message;
        socket.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
        socket.send(
          JSON.stringify({ type: 'input', data: 'echo MARKER-$((6*7)); stty size; exit\n' }),
        );
      }
      if (message.type === 'output') output += message.data;
      if (message.type === 'exit') finish({ output, ready, exitCode: message.exitCode });
    };
  });
  check('the server announces the session', shellRun.ready?.type === 'ready');
  check('a command runs in the shell', shellRun.output?.includes('MARKER-42') === true);
  check('a resize reaches the PTY', shellRun.output?.includes('30 100') === true);
  check('the shell exit is reported', shellRun.exitCode === 0, `exitCode ${shellRun.exitCode}`);

  // Multi-byte output has to survive being reassembled across read boundaries.
  const utf8Run = await withSocket({ Cookie: cookie, Origin: ORIGIN }, (socket, finish) => {
    let output = '';
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'ready') {
        socket.send(JSON.stringify({ type: 'input', data: 'printf "日本語テスト\\n"; exit\n' }));
      }
      if (message.type === 'output') output += message.data;
      if (message.type === 'exit') finish(output);
    };
  });
  check('multi-byte output round-trips intact', String(utf8Run).includes('日本語テスト'));

  // --- Sign out ---
  await fetch(`${BASE}/api/auth/session`, { method: 'DELETE', headers: { Cookie: cookie } });
  const revoked = await (
    await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookie } })
  ).json();
  check('signing out revokes the session', revoked.authenticated === false);

  // --- Embedded frontend ---
  const page = await fetch(`${BASE}/`);
  const html = await page.text();
  check(
    'the built frontend is served',
    page.ok && html.includes('<div id="root">'),
    `status ${page.status}`,
  );

  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  exitCode = failed.length === 0 ? 0 : 1;
} finally {
  server.kill('SIGTERM');
}

process.exit(exitCode);
