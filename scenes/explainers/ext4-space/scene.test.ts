import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sink } from '../../../src/index.ts';
import { diagramOf, loadProject, loadSnapshots } from '../../../explain/testing.ts';
import type { DiagramSnapshot, View } from '../../../explain/index.ts';
import Ext4Space from './scene.ts';
import { TiB, space } from './model.ts';

const store = await loadSnapshots('scenes/explainers/ext4-space');

test('the animated answer pie follows its recorded source in every disk and reserve scenario', async () => {
  const project = await loadProject(Ext4Space, import.meta.dirname);
  let checked = 0;
  for (const { Scene } of project.scenarios) {
    const sink: Sink = {
      skipUntil: Infinity,
      async frame() {},
      async stepEnd(scene, step) {
        if (step.name !== 'df' && step.name !== 'reserve') return;
        const pies = scene.mobjects.filter((m): m is View =>
          'draw' in m && typeof m.draw === 'function' && m.family().some(p => p.key === 'slice:Users can write'));
        assert.equal(pies.length, 1);
        const pie = pies[0]!;
        const words = (picture: ReturnType<View['draw']>) => picture.family().flatMap(m => 'text' in m && typeof m.text === 'string' ? [m.text] : []);
        const landed = words(pie.current);
        assert.ok(landed.length > 0, 'the captured labels are present');
        assert.deepEqual(landed, words(pie.draw(scene.state, scene.shown)));
        assert.ok(pie.family().some(p => p.key === (step.name === 'df' ? 'slice:Not available' : 'slice:Root reserve')));
        if (step.name === 'reserve') {
          const staleState = { ...scene.state, reserve: undefined };
          assert.notDeepEqual(landed, words(pie.draw(staleState, {})), 'the old source must disagree with the landed answer');
        }
        checked++;
      },
    };
    await new Scene(sink).run();
  }
  assert.equal(checked, 18);
});

async function described(text: string) {
  const s = Object.values(store).find((x): x is DiagramSnapshot => x.family === 'pie' && x.spec.source.includes(text));
  assert.ok(s, `no pinned pie with ${text}`);
  return (await diagramOf(s)).describe();
}

// ---------------------------------------------------------------- the captured pies

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
