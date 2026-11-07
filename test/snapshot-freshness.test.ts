// The committed store must contain exactly the diagrams executed by today's scenarios.
// Input hashes remain capture provenance and build-cache keys, not a frozen implementation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectProject, readSnapshots, writeSnapshots, ROOT} from '../tools/lib/explain-project.ts';
import {fixture} from './lib/page-snapshot-fixture.ts';

test('committed snapshot stores cover the diagrams used by every current scenario', async () => {
  let checked = 0;
  for (const id of (await readdir(join(ROOT, 'scenes/explainers'))).sort()) {
    const base = join(ROOT, 'scenes/explainers', id, 'scene');
    if (!(await readFile(base + '.snapshots/index.json', 'utf8').catch(() => null))) continue;
    const committed = await readSnapshots(base);
    const project = await collectProject(base + '.ts', {write: false});
    assert.deepEqual(project.store, committed, `${id}: diagram inputs changed; review and recapture the affected diagrams`);
    checked++;
  }
  assert.ok(checked > 30, `checked ${checked} explainers`);
});

test('unchanged captured diagrams preserve provenance across implementation refactors', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-snapshot-provenance-'));
  const base = join(folder, 'scene');
  try {
    const store = fixture([0, 1]);
    await writeSnapshots(base, store, 'captured-source');
    const before = await readFile(base + '.snapshots/index.json', 'utf8');
    await writeSnapshots(base, structuredClone(store), 'refactored-source');
    assert.equal(await readFile(base + '.snapshots/index.json', 'utf8'), before);
    const changed = fixture([0, 2]);
    await writeSnapshots(base, changed, 'changed-capture');
    const index = JSON.parse(await readFile(base + '.snapshots/index.json', 'utf8'));
    assert.equal(index.sourceHash, 'changed-capture');
    assert.deepEqual(await readSnapshots(base), changed);
  } finally { await rm(folder, {recursive: true, force: true}); }
});
