# node-websh

[![CI](https://github.com/s-yoshiki/node-websh/actions/workflows/ci.yml/badge.svg)](https://github.com/s-yoshiki/node-websh/actions/workflows/ci.yml)
[![Documentation](https://img.shields.io/badge/docs-GitHub%20Pages-0969da)](https://s-yoshiki.github.io/node-websh/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

English | [日本語](README.ja.md)

A real interactive shell on a pseudo terminal, rendered in the browser with
[xterm.js](https://xtermjs.org/). TypeScript end to end:
[Hono](https://hono.dev/) and
[node-pty](https://github.com/microsoft/node-pty) on the server, React in the
browser.

node-websh is useful when you need temporary browser access to a shell on a
machine you control: a development box, home server, container, or remote host
behind a private network. It is intentionally small and single-user.

**[Documentation](https://s-yoshiki.github.io/node-websh/)** ·
[Configuration](https://s-yoshiki.github.io/node-websh/configuration.html) ·
[Deployment](https://s-yoshiki.github.io/node-websh/deployment.html) ·
[Security](https://s-yoshiki.github.io/node-websh/security.html)

> [!WARNING]
> node-websh gives every authenticated client an interactive shell as the user
> running the server. It binds to `127.0.0.1` by default. Before making it
> reachable from another machine, put it behind HTTPS, run it as an
> unprivileged user, and read the
> [security guide](https://s-yoshiki.github.io/node-websh/security.html).

## Features

- A real PTY: interactive programs, job control, colors, cursor movement, and
  terminal resizing work as they do in a local terminal.
- A responsive xterm.js frontend with Unicode 11 width handling, 10,000 lines
  of scrollback, clickable links, clipboard support, and WebGL acceleration
  with a canvas fallback.
- One shared, runtime-validated wire protocol used by both the browser and the
  server.
- Token sign-in exchanged for an `HttpOnly; SameSite=Strict` session cookie.
- Origin checks, constant-time token comparison, sign-in rate limiting, a
  strict Content-Security-Policy, and a loopback-only default bind.
- Automatic WebSocket reconnection for transient network interruptions.
- A self-contained production directory: one bundled server file, the built
  frontend, and `node-pty` as the only runtime dependency.

## Requirements

| Requirement | Version / notes |
| --- | --- |
| Node.js | 20 or newer |
| pnpm | 11 or newer |
| Browser | A current browser with WebSocket support |
| Native tools | Usually not needed; `node-pty` provides prebuilt binaries for common platforms. Python and a C++ toolchain are needed if it must compile locally. |

The CI workflow runs the full lint, typecheck, unit, build, and end-to-end suite
on Node.js 22 and Ubuntu.

## Quick start

```bash
git clone https://github.com/s-yoshiki/node-websh.git
cd node-websh
pnpm install
pnpm dev
```

Open <http://localhost:5173>. Development mode starts:

- the Hono and WebSocket server on `127.0.0.1:8999`;
- the Vite frontend on `127.0.0.1:5173`, proxying API and WebSocket requests to
  the server.

On startup, the server prints a random access token and a ready-to-open URL:

```text
node-websh 0.2.0 — terminal over the web

Open:  http://127.0.0.1:8999/#token=...
Token: ...
```

When using development mode, copy the token into the login form at
<http://localhost:5173>. The printed `:8999` link is intended for a production
build, where the server also serves the frontend.

For a repeatable local token:

```bash
WEBSH_TOKEN=local-development-token pnpm dev
```

## Production build

```bash
pnpm build
pnpm start
```

Open the URL printed by the server, normally <http://127.0.0.1:8999>. The
`#token=...` fragment is read by the browser, exchanged for a session cookie,
and immediately removed from the address bar. URL fragments are not sent in
HTTP requests, so the token does not enter server or proxy logs as a query
string would.

`pnpm build` creates the following deployable directory:

```text
apps/server/dist/
├── main.js
├── main.js.map
├── package.json
└── public/
```

To run it on another compatible host:

```bash
scp -r apps/server/dist user@example.com:/opt/node-websh
ssh user@example.com
cd /opt/node-websh
npm install --omit=dev
WEBSH_TOKEN="replace-with-a-long-random-token" npm start
```

The target host must use the same operating system and CPU architecture as the
installed `node-pty` binary. Running `npm install --omit=dev` on the target, as
shown above, ensures the correct native package is selected.

### Single executable application

An experimental Node.js
[Single Executable Application](https://nodejs.org/api/single-executable-applications.html)
build packages the server, frontend, Node.js runtime, and platform-specific
`node-pty` files into one executable:

```bash
pnpm build:sea
./apps/server/dist/node-websh
```

On Windows the output is `apps/server/dist/node-websh.exe`. The executable is
specific to the operating system and CPU architecture of the Node.js binary
used to build it. Node.js does not need to be installed on the target host.

SEA generation requires an official Node.js 22.20 or newer binary. Node.js
25.5 and newer use the built-in `--build-sea` command; earlier supported
versions automatically use `postject`. Homebrew disables SEA because its Node
formula uses a shared `libnode`, so point the build at a Node.js binary from
[nodejs.org](https://nodejs.org/en/download), a version manager, or another
official distribution:

```bash
NODE_SEA_EXECUTABLE=/path/to/official/node pnpm build:sea
```

`node-pty` contains native code that the operating system cannot load directly
from the executable. At startup, the SEA extracts its embedded frontend and
native runtime files into a private temporary directory and removes the
directory on normal exit.

Verify the generated executable with:

```bash
pnpm test:e2e:sea
```

## Configuration

Every server option is available as a command-line flag and a `WEBSH_*`
environment variable. Flags take precedence over environment variables, which
take precedence over defaults.

| Flag | Environment variable | Default | Purpose |
| --- | --- | --- | --- |
| `--host <address>` | `WEBSH_HOST` | `127.0.0.1` | Address to bind. Keep this on loopback when using a reverse proxy. |
| `-p, --port <number>` | `WEBSH_PORT` | `8999` | HTTP and WebSocket port. |
| `--token <token>` | `WEBSH_TOKEN` | generated | Access token. Set it explicitly for a long-running deployment. |
| `--shell <path>` | `WEBSH_SHELL` | `$SHELL` | Shell executable for new terminals. |
| `--cwd <path>` | `WEBSH_CWD` | home directory | Initial working directory for new terminals. |
| `--session-ttl-minutes <n>` | `WEBSH_SESSION_TTL_MINUTES` | `720` | Session lifetime in minutes. |
| `--max-sessions <n>` | `WEBSH_MAX_SESSIONS` | `8` | Maximum number of concurrent terminals. |
| `--allowed-origin <origin>` | `WEBSH_ALLOWED_ORIGINS` | none | Extra browser origin allowed to use the API and WebSocket. Repeat the flag or comma-separate the variable. |
| `--secure-cookie` | `WEBSH_SECURE_COOKIE=1` | off | Force the `Secure` session-cookie attribute. HTTPS is also detected from `X-Forwarded-Proto`. |
| `--insecure-no-auth` | `WEBSH_INSECURE_NO_AUTH=1` | off | Disable built-in authentication. See the warning below. |
| `--static-dir <path>` | `WEBSH_STATIC_DIR` | auto-detected | Directory containing the built frontend. |

After building, print the same list in the terminal with:

```bash
node apps/server/dist/main.js --help
```

Common examples:

```bash
# Use zsh and start each terminal in a project directory.
pnpm start --shell /bin/zsh --cwd /srv/project

# Use a fixed, randomly generated token.
WEBSH_TOKEN="$(openssl rand -hex 24)" pnpm start

# Allow one short-lived terminal.
pnpm start --max-sessions 1 --session-ttl-minutes 60
```

> [!CAUTION]
> `--insecure-no-auth` gives anyone who can reach the port a shell without
> signing in. Only use it when a trusted upstream system already provides
> authentication and network access control.

See the
[configuration reference](https://s-yoshiki.github.io/node-websh/configuration.html)
for detailed notes and additional examples.

## Deploying safely

For anything beyond local-only access:

1. Run node-websh as a dedicated, unprivileged operating-system user.
2. Keep `WEBSH_HOST=127.0.0.1` and place a reverse proxy in front.
3. Terminate TLS at the proxy and forward WebSocket upgrades.
4. Preserve the original `Host` header and forward
   `X-Forwarded-Proto: https`.
5. Set a long random `WEBSH_TOKEN` rather than relying on a token printed to
   service logs.
6. Restrict reachability with a firewall, VPN, or private network.

Caddy needs only:

```caddyfile
websh.example.com {
    reverse_proxy 127.0.0.1:8999
}
```

For nginx, Docker, systemd, proxy timeouts, and a full deployment checklist,
see the
[deployment guide](https://s-yoshiki.github.io/node-websh/deployment.html).

## Security model

The access token is presented once to `POST /api/auth/session`. A successful
sign-in creates an opaque session ID stored in memory and returned as an
`HttpOnly; SameSite=Strict` cookie. Restarting the server invalidates every
session and ends every child shell.

The server also provides:

- constant-time comparison of token digests;
- a limit of ten failed sign-ins per client address per minute;
- explicit `Origin` validation for WebSocket upgrades and state-changing API
  requests;
- secure response headers, including a strict Content-Security-Policy;
- a configurable cap on concurrent terminal sessions.

node-websh deliberately does **not** provide:

- TLS termination;
- multiple users, accounts, or per-user permissions;
- shell sandboxing or privilege separation;
- recording or audit logging of terminal input and output.

The shell inherits the permissions and most of the environment of the server
process. Treat deployment of node-websh with the same care as SSH access. Read
the full [security guide](https://s-yoshiki.github.io/node-websh/security.html)
before exposing it to a network.

To report a vulnerability, use a
[private GitHub security advisory](https://github.com/s-yoshiki/node-websh/security/advisories/new)
instead of a public issue.

## Architecture

```text
Browser
  React app
    └── TerminalView (xterm.js)
          └── TerminalTransport
                └── WebSocket
                      └── Hono server
                            └── node-pty
                                  └── interactive shell
```

```text
apps/
├── server/       Hono + node-pty + WebSocket; serves the built frontend
└── web/          React application
packages/
├── protocol/     Wire protocol, runtime guards, and transport interface
└── terminal-ui/  Reusable xterm.js React component
configs/
├── tsconfig/     Shared TypeScript configuration
└── biome/        Shared Biome configuration
docs/             Static documentation site published with GitHub Pages
```

`TerminalView` depends only on the `TerminalTransport` interface; it does not
know whether frames travel over a WebSocket or another transport. The protocol
is declared once in `packages/protocol` and imported by both ends, keeping
message shapes and validation in sync.

For message formats, close codes, and HTTP endpoints, see the
[wire protocol reference](https://s-yoshiki.github.io/node-websh/protocol.html).
For a deeper walkthrough, see
[Architecture](https://s-yoshiki.github.io/node-websh/architecture.html).

## Development

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the server on `:8999` and Vite on `:5173`. |
| `pnpm build` | Builds the frontend, then bundles the server and frontend together. |
| `pnpm build:sea` | Builds a platform-specific single executable application. |
| `pnpm start` | Runs the built server. |
| `pnpm lint` | Checks the workspace with Biome. |
| `pnpm lint:fix` | Applies safe Biome fixes. |
| `pnpm format` | Formats the workspace with Biome. |
| `pnpm format:check` | Checks formatting without changing files. |
| `pnpm typecheck` | Runs `tsc --noEmit` in each package. |
| `pnpm test` | Runs unit tests, including tests against a real PTY. |
| `pnpm test:e2e` | Tests auth, cookies, origins, WebSockets, UTF-8, resizing, and a real shell against the production build. |
| `pnpm test:e2e:sea` | Runs the same end-to-end checks against the SEA executable. |
| `pnpm clean` | Removes generated build output. |

Before submitting a change, run:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The end-to-end test expects `apps/server/dist/`, so run it after `pnpm build`.
More detail is available in the
[development guide](https://s-yoshiki.github.io/node-websh/development.html).

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| The login works but the status stays at “Reconnecting…” | The reverse proxy is not forwarding the WebSocket upgrade, or its idle timeout is too short. |
| You are immediately returned to the login screen | The proxy rewrote the `Host` header, the request origin is not allowed, or a `Secure` cookie was set over plain HTTP. |
| Every terminal fails with `posix_spawnp failed` | The executable bit on node-pty's `spawn-helper` was lost. Re-run `pnpm install`, which runs `scripts/postinstall.mjs`. |
| The page loads but no terminal appears | Build the frontend with `pnpm build`, or set `WEBSH_STATIC_DIR` to a directory containing `index.html`. |
| The shell starts in the wrong directory | Set `WEBSH_CWD` or pass `--cwd`. |
| A connection is refused while other terminals are open | Increase `WEBSH_MAX_SESSIONS`, or close an existing terminal. |
| Development UI cannot reach the backend | Check that ports `5173` and `8999` are free and that `WEBSH_BACKEND` points to the Hono server if it is not using the default address. |

## Documentation

| Page | Contents |
| --- | --- |
| [Overview](https://s-yoshiki.github.io/node-websh/) | Project overview and first run |
| [Development](https://s-yoshiki.github.io/node-websh/development.html) | Monorepo setup and the development loop |
| [Deployment](https://s-yoshiki.github.io/node-websh/deployment.html) | Build output, systemd, reverse proxies, and Docker |
| [Architecture](https://s-yoshiki.github.io/node-websh/architecture.html) | Components and data flow |
| [Wire protocol](https://s-yoshiki.github.io/node-websh/protocol.html) | Frames, close codes, and HTTP endpoints |
| [Security](https://s-yoshiki.github.io/node-websh/security.html) | Authentication model, hardening, and limitations |
| [Configuration](https://s-yoshiki.github.io/node-websh/configuration.html) | Flags, environment variables, defaults, and examples |

## Related project

[majin](https://github.com/s-yoshiki/majin) explores the same idea with a Rust
core, a self-contained binary, and a Tauri desktop application.

## Built with

[xterm.js](https://github.com/xtermjs/xterm.js) ·
[Hono](https://hono.dev/) ·
[node-pty](https://github.com/microsoft/node-pty) ·
[React](https://react.dev/) ·
[Vite](https://vite.dev/) ·
[Turborepo](https://turborepo.com/) ·
[Biome](https://biomejs.dev/)

## License

[MIT](LICENSE)
