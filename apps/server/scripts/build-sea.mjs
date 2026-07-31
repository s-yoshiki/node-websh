#!/usr/bin/env node
/**
 * Builds a platform-specific Node.js Single Executable Application.
 *
 * Run through `pnpm build:sea`, which creates the normal production build
 * first. The final executable contains the server, frontend, Node.js runtime,
 * and the node-pty files required by the selected Node.js binary's platform.
 */

import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');
const repositoryRoot = resolve(serverRoot, '../..');
const dist = resolve(serverRoot, 'dist');
const publicDir = resolve(dist, 'public');
const output = resolve(dist, process.platform === 'win32' ? 'node-websh.exe' : 'node-websh');
const workDir = await mkdtemp(join(tmpdir(), 'node-websh-sea-build-'));
const bundledMain = resolve(workDir, 'main.cjs');
const seaConfig = resolve(workDir, 'sea-config.json');
const seaBlob = resolve(workDir, 'sea-prep.blob');
const seaNode = resolve(process.env.NODE_SEA_EXECUTABLE ?? process.execPath);
const seaNodeInfo = inspectNode(seaNode);
const minimumSeaNode = [22, 20, 0];

if (compareVersions(seaNodeInfo.version, minimumSeaNode) < 0) {
  throw new Error(
    `SEA generation requires Node.js ${minimumSeaNode.join('.')} or newer; ` +
      `${seaNode} is ${seaNodeInfo.version.join('.')}.`,
  );
}

if (seaNodeInfo.platform !== process.platform) {
  throw new Error(
    `The SEA Node.js binary targets ${seaNodeInfo.platform}, but this build is running on ${process.platform}.`,
  );
}

try {
  await assertFile(resolve(publicDir, 'index.html'), 'Run `pnpm build` before building the SEA.');

  await build({
    entryPoints: [resolve(serverRoot, 'src/sea-entry.ts')],
    outfile: bundledMain,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    minify: true,
    sourcemap: false,
    // SEA's injected CommonJS module defines __filename as the executable.
    // Source modules use import.meta.url, which esbuild otherwise replaces
    // with undefined in CJS output.
    banner: {
      js: "const __nodeWebshImportMetaUrl = require('node:url').pathToFileURL(__filename).href;",
    },
    define: {
      'import.meta.url': '__nodeWebshImportMetaUrl',
    },
  });

  const assets = {};
  await addTree(assets, publicDir, 'public', () => true);

  const require = createRequire(import.meta.url);
  const nodePtyRoot = dirname(dirname(require.resolve('node-pty')));
  await addTree(
    assets,
    resolve(nodePtyRoot, 'lib'),
    'node-pty/lib',
    (path) => path.endsWith('.js') && !path.endsWith('.test.js'),
  );
  assets['node-pty/package.json'] = resolve(nodePtyRoot, 'package.json');

  const target = `${seaNodeInfo.platform}-${seaNodeInfo.arch}`;
  const prebuildDir = resolve(nodePtyRoot, 'prebuilds', target);
  const releaseDir = resolve(nodePtyRoot, 'build', 'Release');
  const nativeDir = (await directoryExists(prebuildDir)) ? prebuildDir : releaseDir;
  const nativePrefix = (await directoryExists(prebuildDir))
    ? `node-pty/prebuilds/${target}`
    : 'node-pty/build/Release';

  if (!(await directoryExists(nativeDir))) {
    throw new Error(
      `node-pty has no native build for ${target}. Re-run pnpm install for that target.`,
    );
  }
  await addTree(assets, nativeDir, nativePrefix, (path) => !path.endsWith('.pdb'));

  const supportsBuiltInBuild = compareVersions(seaNodeInfo.version, [25, 5, 0]) >= 0;
  await writeFile(
    seaConfig,
    `${JSON.stringify(
      {
        main: bundledMain,
        ...(supportsBuiltInBuild ? { executable: seaNode, output } : { output: seaBlob }),
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
        execArgvExtension: 'none',
        assets,
      },
      null,
      2,
    )}\n`,
  );

  await rm(output, { force: true });
  if (supportsBuiltInBuild) {
    const result = run(seaNode, [`--build-sea=${seaConfig}`], { capture: true });
    if (result.status !== 0) {
      const details = `${result.stdout}${result.stderr}`.trim();
      throw new Error(
        `${details || 'Node.js SEA generation failed.'}\n` +
          'If this is Homebrew Node.js, install an official Node.js distribution and set ' +
          'NODE_SEA_EXECUTABLE to its node binary.',
      );
    }
  } else {
    run(seaNode, [`--experimental-sea-config=${seaConfig}`]);
    await copyFile(seaNode, output);
    if (process.platform === 'darwin') {
      // Official macOS Node.js binaries are signed. Injection changes the file,
      // so remove the signature first and apply an ad-hoc signature afterward.
      spawnSync('codesign', ['--remove-signature', output], { stdio: 'ignore' });
    }

    const require = createRequire(import.meta.url);
    const postject = require.resolve('postject/dist/cli.js');
    const postjectArgs = [
      postject,
      output,
      'NODE_SEA_BLOB',
      seaBlob,
      '--sentinel-fuse',
      'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ];
    if (process.platform === 'darwin') {
      postjectArgs.push('--macho-segment-name', 'NODE_SEA');
    }
    run(process.execPath, postjectArgs);
  }

  if (process.platform === 'darwin') {
    const signed = spawnSync('codesign', ['--force', '--sign', '-', output], { stdio: 'inherit' });
    if (signed.error) throw signed.error;
    if (signed.status !== 0) throw new Error('Ad-hoc code signing failed.');
  }

  if (process.platform !== 'win32') await chmod(output, 0o755);
  const info = await stat(output);
  console.log(`built ${relative(repositoryRoot, output)} (${formatBytes(info.size)}, ${target})`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}

async function addTree(assets, root, assetPrefix, include) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await addTree(assets, path, `${assetPrefix}/${entry.name}`, include);
    } else if (entry.isFile() && include(path)) {
      const key = `${assetPrefix}/${relative(root, path).split(sep).join('/')}`;
      // Recursive calls already extend assetPrefix, so only the basename is
      // relative to their root.
      assets[key] = path;
    }
  }
}

async function assertFile(path, message) {
  try {
    const info = await stat(path);
    if (info.isFile()) return;
  } catch {
    // Report the caller's useful instruction below.
  }
  throw new Error(`${message} Missing: ${path}`);
}

async function directoryExists(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function inspectNode(executable) {
  const result = run(
    executable,
    [
      '-p',
      'JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})',
    ],
    { capture: true },
  );
  const info = JSON.parse(result.stdout.trim());
  return { ...info, version: info.version.split('.').map(Number) };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.capture) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}.`);
  }
  return result;
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
