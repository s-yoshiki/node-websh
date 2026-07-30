/**
 * Bundles the server into a single file.
 *
 * Everything is bundled except `node-pty`, which is a native addon and has to
 * stay a real dependency resolved at runtime. That keeps a deployment down to
 * `dist/`, a `package.json` with one dependency, and the built frontend.
 */

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = resolve(root, 'dist');
const webDist = resolve(root, '../web/dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/main.ts')],
  outfile: resolve(dist, 'main.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  minify: true,
  // A native addon cannot be bundled; it is required from node_modules.
  external: ['node-pty'],
  banner: {
    // Some bundled dependencies still reach for CommonJS globals.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});

// The frontend is copied next to the bundle so the server can serve it from a
// path relative to itself, wherever the release is unpacked.
await cp(webDist, resolve(dist, 'public'), { recursive: true }).catch(() => {
  console.warn('apps/web/dist is missing; the bundle will serve no frontend.');
});

// A minimal manifest so `npm install --omit=dev` in the release pulls only the
// native addon.
const pkg = JSON.parse(
  await import('node:fs').then((fs) => fs.promises.readFile(resolve(root, 'package.json'), 'utf8')),
);
await writeFile(
  resolve(dist, 'package.json'),
  `${JSON.stringify(
    {
      name: 'node-websh',
      version: pkg.version,
      private: true,
      type: 'module',
      main: 'main.js',
      scripts: { start: 'node main.js' },
      dependencies: { 'node-pty': pkg.dependencies['node-pty'] },
      engines: pkg.engines ?? { node: '>=20' },
    },
    null,
    2,
  )}\n`,
);

console.log('built apps/server/dist');
