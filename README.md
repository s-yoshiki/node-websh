# node-websh

A real login shell on a pseudo terminal, rendered in the browser with
[xterm.js](https://xtermjs.org/). TypeScript end to end: [Hono](https://hono.dev/)
and [node-pty](https://github.com/microsoft/node-pty) on the server, React on the
front.

**[Documentation](https://s-yoshiki.github.io/node-websh/)**

> [!WARNING]
> This program hands out an interactive shell. It binds to `127.0.0.1` by
> default; read the [security notes](https://s-yoshiki.github.io/node-websh/security.html)
> before it is reachable from anywhere else.

## Quick start

```bash
pnpm install
pnpm dev
```

Open <http://localhost:5173>. The server prints an access token on startup,
along with a link that signs you in directly.

Needs Node.js 20+ and pnpm 11+.

## Running a build

```bash
pnpm build
pnpm start
```

`pnpm build` produces `apps/server/dist/`: the bundled server, the built
frontend beside it, and a `package.json` whose only dependency is `node-pty`.
Copy that directory to a host, run `npm install --omit=dev`, and start it.

## How it fits together

```
apps/
├── server/       Hono + node-pty + WebSocket, serves the built frontend
└── web/          React app
packages/
├── protocol/     Wire protocol, runtime guards, transport interface
└── terminal-ui/  The xterm.js React component
configs/
├── tsconfig/     Shared TypeScript configs
└── biome/        Shared Biome config
docs/             The documentation site (static HTML, GitHub Pages)
```

The terminal UI is one React component that only knows about a
`TerminalTransport` interface, so it has no idea whether frames travel over a
WebSocket or anything else. The protocol is declared once in
`packages/protocol` and imported by both ends, which is the point: the previous
version declared each half separately and got it wrong, sending
`{ resizer: [...] }` from the browser while the server read `msg.resize`.
Window resizing silently did nothing, and nothing caught it.

## Security

Sign-in is a token exchanged once for an opaque session id held in memory and
returned as an `HttpOnly; SameSite=Strict` cookie. The token is never accepted
in a URL query, because query strings reach proxy logs, browser history and
`Referer` headers.

On top of that: a constant-time token comparison, per-address rate limiting,
an explicit `Origin` check on both the WebSocket upgrade and every
state-changing API call, a strict Content-Security-Policy, and a loopback
default bind. The [security page](https://s-yoshiki.github.io/node-websh/security.html)
covers what it deliberately does not do — TLS, multiple users, sandboxing.

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Server on `:8999` and Vite on `:5173` |
| `pnpm build` | Frontend, then the server bundle that serves it |
| `pnpm start` | Runs the built server |
| `pnpm lint` | Biome across the workspace |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm test` | Unit tests, including ones that spawn a real PTY |
| `pnpm test:e2e` | Starts the built server and drives auth, WebSocket and a shell |

## Documentation

| Page | |
| --- | --- |
| [Overview](https://s-yoshiki.github.io/node-websh/) | What it is and how to start |
| [Development](https://s-yoshiki.github.io/node-websh/development.html) | Monorepo setup and the dev loop |
| [Deployment](https://s-yoshiki.github.io/node-websh/deployment.html) | systemd, reverse proxies, Docker |
| [Architecture](https://s-yoshiki.github.io/node-websh/architecture.html) | How the pieces relate |
| [Wire protocol](https://s-yoshiki.github.io/node-websh/protocol.html) | Every frame and endpoint |
| [Security](https://s-yoshiki.github.io/node-websh/security.html) | Auth model and what it does not do |
| [Configuration](https://s-yoshiki.github.io/node-websh/configuration.html) | Every flag and environment variable |

## Related

[majin](https://github.com/s-yoshiki/majin) is the same idea built on a Rust
core, shipping as a single self-contained binary and a Tauri desktop app.

## Built with

[xterm.js](https://github.com/xtermjs/xterm.js) ·
[Hono](https://hono.dev/) ·
[node-pty](https://github.com/microsoft/node-pty) ·
[React](https://react.dev/) ·
[Vite](https://vite.dev/) ·
[Turborepo](https://turborepo.com/) ·
[Biome](https://biomejs.dev/)

## License

MIT
