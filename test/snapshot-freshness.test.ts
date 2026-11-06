// Every explainer's committed scene.snapshots/index.json records the source hash of the scene it
// was written for. A change to a scene, or to anything it bundles (the engine, the explain kit, a
// shared model), changes that hash; the catalog build then rewrites the index, and the story review,
// on a fresh checkout, finds the scene's files changed under it and fails far from the cause. This
// test fails here instead, naming each stale scene: refresh with `rayner snapshots <scene>`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadScene, ROOT } from '../tools/lib/explain-project.ts';

test('every committed snapshot index matches the source of the scene it was written for', async () => {
  const stale: string[] = [];
  let checked = 0;
  for (const id of (await readdir(join(ROOT, 'scenes/explainers'))).sort()) {
    const folder = join(ROOT, 'scenes/explainers', id);
    const index = await readFile(join(folder, 'scene.snapshots/index.json'), 'utf8').catch(() => null);
    if (index === null) continue;
    const { sourceHash } = await loadScene(join(folder, 'scene.ts'));
    if ((JSON.parse(index) as { sourceHash?: string }).sourceHash !== sourceHash) stale.push(id);
    checked++;
  }
  // Only scenes with diagrams keep an index (writeSnapshots).
  assert.ok(checked > 15, `checked ${checked} explainers`);
  assert.deepEqual(stale, [], `stale snapshot indexes; run \`node tools/explain.ts snapshots scenes/explainers/<id>/scene.ts\` for each`);
});
