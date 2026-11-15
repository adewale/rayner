import { test } from 'node:test';
import type { View as StateView } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { loadProject, assertViewFollowsState as viewFollowsState } from '../../../explain/testing.ts';
import StateMachine from './scene.ts';

test('state-machine: its socket card shows the traced state at every step after the opening, in every scenario', async () => {
  const project = await loadProject(StateMachine, 'scenes/explainers/state-machine');
  for (const scenario of project.scenarios) {
    const expected = scenario.values.when === 'connecting' ? ['ask', 'answer', 'open', 'send'] : ['ask', 'answer', 'closed'];
    assert.deepEqual(scenario.trace.steps.map((s) => s.step), expected);
    const checked = await viewFollowsState(scenario.Scene, (scene) => (scene as unknown as { readout?: StateView }).readout);
    assert.equal(checked, expected.length - 1, `${JSON.stringify(scenario.values)}: the card is checked at every step it is on`);
  }
});
