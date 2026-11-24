import { test } from 'node:test';
import type { View } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { loadProject, assertViewFollowsState } from '../../../explain/testing.ts';
import GreatCircle from './scene.ts';
import { london } from './model.ts';

test('each globe starts with its own London to Los Angeles route', () => {
  const sink = { async frame() {} };
  const first = new GreatCircle(sink).state.route, second = new GreatCircle(sink).state.route;
  assert.deepEqual([first.from.code, first.to.code], ['LHR', 'LAX']);
  assert.deepEqual(first, london());
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  for (const field of ['from', 'to', 'top', 'stretch'] as const) assert.notEqual(first[field], second[field], field);
});

test('the turned globe is a view of its step’s state: it ends edge-on, the route a straight line', async () => {
  const { Scene } = (await loadProject(GreatCircle, 'scenes/explainers/great-circle')).scenario();
  let globe: View | undefined;
  const checked = await assertViewFollowsState(Scene, (scene) => {
    globe ??= scene.mobjects.find((m) => m.key === undefined && (m as View).draw && (m as View).current?.key === 'globe') as View | undefined;
    return globe && scene.mobjects.includes(globe) ? globe : null;
  });
  assert.equal(checked, 1, 'the turn step');
});
