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
type Packed = { name: string; filename: string; integrity: string };
type Manifest = { sourceCommit: string; packages: Packed[] };
for (const [name, change, message] of [
  ['an escaping archive filename', (m: Manifest) => { m.packages[0]!.filename = '../escape.tgz'; }, /invalid candidate filename/],
  ['an escaping command archive filename', (m: Manifest) => { m.packages[1]!.filename = '../escape.tgz'; }, /invalid candidate filename/],
  ['a missing command archive', (m: Manifest) => { m.packages.pop(); }, /the candidate holds rayner and rayner-cli/],
  ['another source commit', (m: Manifest) => { m.sourceCommit = '0'.repeat(40); }, /candidate comes from another source commit/],
  ['modified archive bytes', (m: Manifest) => { m.packages[0]!.integrity = 'sha512-incorrect'; }, /candidate archive integrity mismatch/],
  ['modified command archive bytes', (m: Manifest) => { m.packages[1]!.integrity = 'sha512-incorrect'; }, /candidate archive integrity mismatch/],
] as const) {
  test(`package smoke rejects ${name} before installation`, async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rayner-candidate-'));
    try {
      const commit = (await run('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).stdout.trim();
      const manifest = join(folder, 'manifest.json');
      const archives: Packed[] = [];
      for (const pkg of ['rayner', 'rayner-cli']) {
        const bytes = Buffer.from(`not installed: ${pkg}`);
        await writeFile(join(folder, `${pkg}.tgz`), bytes);
        archives.push({ name: pkg, filename: `${pkg}.tgz`, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') });
      }
      const candidate: Manifest = { sourceCommit: commit, packages: archives };
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
