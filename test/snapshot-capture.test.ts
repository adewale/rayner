// Committed snapshots are what capture produces now. Snapshots are not keyed to a hash of Rayner's
// own code, so this is what notices a code change that would capture something else: each test
// captures afresh, writes nothing, and compares with the committed files. Missing inputs fail
// sooner and on their own (a diagram source or a drawn string with no snapshot names the command
// that captures it); these tests catch the snapshots that exist but would now come out different.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { collectProject, readSnapshots, ROOT } from '../tools/lib/explain-project.ts';

/** As the snapshot files hold it: compared by value, whatever kind of object holds it in memory. */
const asStored = (value: unknown) => JSON.parse(JSON.stringify(value));
const tracked = (pattern: string) =>
  execFileSync('git', ['ls-files', '-z', pattern], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean).map((f) => join(ROOT, f));

test('every committed diagram snapshot is what capture produces now', { skip: process.env.EXPLAIN_BROWSER !== '1' && 'set EXPLAIN_BROWSER=1 to capture diagrams' }, async () => {
  const folders = tracked('*scene.snapshots/index.json').map((index) => dirname(dirname(index)));
  assert.ok(folders.length > 20, `${folders.length} folders`);
  for (const folder of folders) {
    // Lettering is replayed from its own committed snapshot; the next test captures that, a process per snapshot.
    const fresh = await collectProject(folder, { refresh: true, captureLettering: false, write: false });
    assert.deepEqual(asStored(fresh.store), asStored(await readSnapshots(join(folder, 'scene'))), `${folder}: run rayner snapshots --refresh, and review what changed`);
  }
});

test('every committed lettering snapshot is what capture produces now', { skip: (process.env.EXPLAIN_LETTERING !== '1' || process.env.EXPLAIN_BROWSER !== '1') && 'set EXPLAIN_LETTERING=1 and EXPLAIN_BROWSER=1 to capture lettering' }, async () => {
  const files = [];
  for (const file of tracked('*scene.lettering.json'))
    if ('runs' in JSON.parse(await readFile(file, 'utf8'))) files.push(file); // outline snapshots, not subset requests
  assert.ok(files.length >= 9, `${files.length} snapshots`);
  for (const file of files) {
    const out = execFileSync(process.execPath, [join(ROOT, 'test/lib/capture-lettering.ts'), file], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 << 20 });
    assert.deepEqual(JSON.parse(out.trim().split('\n').pop()!), [], `${file}: run rayner snapshots --refresh, and review what changed`);
  }
});
