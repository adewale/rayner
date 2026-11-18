import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../../../explain/testing.ts';
import Seasons from './scene.ts';
import { sideOf } from './picture.ts';
import type { SeasonState } from './picture.ts';

test('latitude emphasis is reproduced by a fresh state drawing in every scenario', async () => {
  const project = await loadProject(Seasons, 'scenes/explainers/seasons');
  assert.equal(project.scenarios.length, 4);
  let compared = 0;
  for (const scenario of project.scenarios) await new scenario.Scene({
    skipUntil: Infinity, async frame() {},
    async stepEnd(scene, step) {
      if (step.name !== 'latitude') return;
      const state = scene.state as SeasonState;
      assert.ok(state.daylightTable);
      for (const month of ['June', 'December'] as const) {
        const displayed = scene.find(`${month.toLowerCase()}-latitude`)!;
        const fresh = sideOf(state, month, { ink: '#fff', soft: '#aaa', muted: '#888' }).latitude;
        assert.equal(displayed.children.length, 2);
        assert.deepEqual(displayed.children.map((m) => m.style.strokeWidth), [0.09,0.09]);
        assert.deepEqual(displayed.children.map((m) => m.style.strokeWidth), fresh.children.map((m) => m.style.strokeWidth));
        compared++;
      }
    },
  }).run();
  assert.equal(compared, 8);
});
