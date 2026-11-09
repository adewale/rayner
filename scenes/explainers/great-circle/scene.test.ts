import { test } from 'node:test';
import type { View } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { loadProject, assertViewFollowsState } from '../../../explain/testing.ts';
import GreatCircle from './scene.ts';

test('the turned globe is a view of its step’s state: it ends edge-on, the route a straight line', async () => {
  const { Scene } = (await loadProject(GreatCircle, 'scenes/explainers/great-circle')).scenario();
  let globe: View | undefined;
  const checked = await assertViewFollowsState(Scene, (scene) => {
    globe ??= scene.mobjects.find((m) => m.key === undefined && (m as View).draw && (m as View).current?.key === 'globe') as View | undefined;
    return globe && scene.mobjects.includes(globe) ? globe : null;
  });
  assert.equal(checked, 1, 'the turn step');
});
