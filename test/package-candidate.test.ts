import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../tools/lib/explain-project.ts';

const run = promisify(execFile);
for (const [name, change, message] of [
  ['an escaping archive filename', { filename: '../escape.tgz' }, /invalid candidate filename/],
  ['another source commit', { sourceCommit: '0'.repeat(40) }, /candidate comes from another source commit/],
  ['modified archive bytes', { integrity: 'sha512-incorrect' }, /candidate archive integrity mismatch/],
] as const) {
  test(`package smoke rejects ${name} before installation`, async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rayner-candidate-'));
    try {
      const commit = (await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim();
      const manifest = join(folder, 'manifest.json');
      await writeFile(join(folder, 'candidate.tgz'), 'not installed');
      await writeFile(manifest, JSON.stringify(Object.assign({
        filename: 'candidate.tgz', sourceCommit: commit, integrity: 'sha512-unused',
      }, change)));
      await assert.rejects(
        run(process.execPath, [join(ROOT, 'tools/explain-package-smoke.ts'), '--manifest', manifest], { cwd: ROOT }),
        (error) => {
          assert.ok(error && typeof error === 'object' && 'stderr' in error);
          assert.match(String(error.stderr), message);
          return true;
        },
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
}
