import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../../../explain/testing.ts';
import PenAndPencil from './scene.ts';
import type { Scene, VMobject } from '../../../src/index.ts';

// The marks step says the marks "are the same in both drawings", and the plate step that the second
// drawing lands in the boxes the first used: the layout's marks owe nothing to the seed.
test('both drawings trace the same marks: the construction strokes match path for path, so the boxes are shared', async () => {
  const project = await loadProject(PenAndPencil, 'scenes/explainers/pen-and-pencil');
  assert.deepEqual(project.scenarios.map((v) => v.values), [{ hand: 'first' }, { hand: 'second' }]);
  const marks: number[][][][] = [];
  for (const scenario of project.scenarios) {
    let paths: number[][][] | undefined;
    await new scenario.Scene({
      async frame() {},
      async stepEnd(scene: Scene, step: { name: string }) {
        if (step.name !== 'marks') return;
        const traced = scene.familyMembers().filter((m) => m.key === 'construction:marks');
        assert.equal(traced.length, 1);
        paths = traced[0]!.children.map((m) => (m as VMobject).subpaths.map((a) => [...a]));
      },
    }).run();
    assert.ok(paths && paths.length === 53, `${scenario.values.hand}: ${paths?.length} construction strokes`);
    marks.push(paths);
  }
  assert.deepEqual(marks[1], marks[0]);
});
