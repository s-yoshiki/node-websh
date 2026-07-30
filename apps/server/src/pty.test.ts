import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnPty } from './pty.ts';

/** Collects output until the shell exits, or the timeout fires. */
function run(input: string, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve) => {
    const pty = spawnPty({ shell: '/bin/sh', size: { cols: 100, rows: 30 } });
    let output = '';
    const timer = setTimeout(() => {
      pty.kill();
      resolve(output);
    }, timeoutMs);

    pty.onData((data) => {
      output += data;
    });
    pty.onExit(() => {
      clearTimeout(timer);
      resolve(output);
    });
    pty.write(input);
  });
}

describe('spawnPty', { skip: process.platform === 'win32' }, () => {
  it('runs a command and reports its output', async () => {
    const output = await run('echo MARKER-$((6*7)); exit\n');
    assert.match(output, /MARKER-42/);
  });

  it('gives the shell the geometry it was spawned with', async () => {
    const output = await run('stty size; exit\n');
    assert.match(output, /30 100/);
  });

  it('follows a resize', async () => {
    const output = await new Promise<string>((resolve) => {
      const pty = spawnPty({ shell: '/bin/sh', size: { cols: 80, rows: 24 } });
      let collected = '';
      const timer = setTimeout(() => {
        pty.kill();
        resolve(collected);
      }, 10_000);

      pty.onData((data) => {
        collected += data;
      });
      pty.onExit(() => {
        clearTimeout(timer);
        resolve(collected);
      });

      pty.resize({ cols: 120, rows: 40 });
      pty.write('stty size; exit\n');
    });
    assert.match(output, /40 120/);
  });

  it('clamps an absurd geometry instead of passing it through', async () => {
    const pty = spawnPty({ shell: '/bin/sh', size: { cols: 99_999, rows: 0 } });
    assert.equal(pty.size.cols, 1000);
    assert.equal(pty.size.rows, 1);
    pty.kill();
  });

  it('handles multi-byte text end to end', async () => {
    // Only passes if the child got a UTF-8 locale; under LC_CTYPE=C readline
    // mangles the typed bytes into completion requests.
    const output = await run("printf '日本語 %s\\n' テスト; exit\n");
    assert.match(output, /日本語 テスト/);
  });
});
