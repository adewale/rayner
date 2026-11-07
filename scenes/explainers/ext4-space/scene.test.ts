import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../../../src/index.ts';
import { NullSink } from '../../../src/output.ts';
import { loadFonts, loadSnapshots } from '../../../explain/testing.ts';
import { Diagram } from '../../../explain/index.ts';
import type { DiagramSnapshot } from '../../../explain/index.ts';
import { TiB, space } from './model.ts';

const store = await loadSnapshots('scenes/explainers/ext4-space');

async function described(text: string) {
  const s = Object.values(store).find((x): x is DiagramSnapshot => x.family === 'pie' && x.spec.source.includes(text));
  assert.ok(s, `no pinned pie with ${text}`);
  const d = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), s.spec, s, {});
  await d.build();
  return d.describe();
}

// ---------------------------------------------------------------- the captured pies
await loadFonts();

test('the captured 1 TiB pie says what users can write, as the model does', async () => {
  const sp = space(TiB, 5);
  // The answer's pie, not the opening's two-slice one, which also names what users can write.
  const seen = await described(`"Users can write" : ${sp.users}\n  "Root reserve" : ${sp.root}\n`);
  assert.equal(seen.what, 'Pie chart “Every 4 KiB block of 1 TiB”: 3 slices');
  assert.deepEqual(
    seen.parts.map((p) => p.name),
    ['Metadata: 1.7%', 'Users can write: 93.3%', 'Root reserve: 5.0%'],
  );
});

test('the captured 1 TiB opening pie says only what users can write and what they cannot', async () => {
  const sp = space(TiB, 5);
  const seen = await described(`"Not available" : ${sp.layout.blocks - sp.users}\n`);
  assert.equal(seen.what, 'Pie chart “Every 4 KiB block of 1 TiB”: 2 slices');
  assert.deepEqual(
    seen.parts.map((p) => p.name),
    ['Not available: 6.7%', 'Users can write: 93.3%'],
  );
});
