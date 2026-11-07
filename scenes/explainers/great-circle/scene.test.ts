import { test } from 'node:test';
import type { View } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { assertViewFollowsState } from '../../../test/lib/view-fidelity.ts';
import { collectProject, defaultScenario } from '../../../tools/lib/explain-project.ts';

test('the turned globe is a view of its step’s state: it ends edge-on, the route a straight line', async () => {
  const project = await collectProject('scenes/explainers/great-circle', { write: false });
  const { Scene } = defaultScenario(project);
  let globe: View | undefined;
  const checked = await assertViewFollowsState(Scene, (scene) => {
    globe ??= scene.mobjects.find((m) => m.key === undefined && (m as View).draw && (m as View).current?.key === 'globe') as View | undefined;
    return globe && scene.mobjects.includes(globe) ? globe : null;
  });
  assert.equal(checked, 1, 'the turn step');
});
