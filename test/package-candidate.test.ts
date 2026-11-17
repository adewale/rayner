import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { ROOT } from '../tools/lib/explain-project.ts';

const run = promisify(execFile);
type Manifest = { name: string; sourceCommit: string; filename: string; integrity: string };
for (const [name, change, message] of [
  ['an escaping archive filename', (m: Manifest) => { m.filename = '../escape.tgz'; }, /invalid candidate filename/],
  ['an archive that is not a tarball', (m: Manifest) => { m.filename = 'rayner.zip'; }, /invalid candidate filename/],
  ['another package', (m: Manifest) => { m.name = 'rayner-cli'; }, /the candidate is the rayner package/],
  ['another source commit', (m: Manifest) => { m.sourceCommit = '0'.repeat(40); }, /candidate comes from another source commit/],
  ['modified archive bytes', (m: Manifest) => { m.integrity = 'sha512-incorrect'; }, /candidate archive integrity mismatch/],
] as const) {
  test(`package smoke rejects ${name} before installation`, async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rayner-candidate-'));
    try {
      const commit = (await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim();
      const manifest = join(folder, 'manifest.json');
      const bytes = Buffer.from('not installed: rayner');
      await writeFile(join(folder, 'rayner.tgz'), bytes);
      const candidate: Manifest = { name: 'rayner', sourceCommit: commit, filename: 'rayner.tgz', integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') };
      change(candidate);
      await writeFile(manifest, JSON.stringify(candidate));
      await assert.rejects(
        run(process.execPath, [join(ROOT, 'tools/repo/explain-package-smoke.ts'), '--manifest', manifest], { cwd: ROOT }),
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
