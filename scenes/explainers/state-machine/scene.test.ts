import { test } from 'node:test';
import type { View as StateView } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { loadProject } from '../../../explain/testing.ts';
import StateMachine from './scene.ts';
import { assertViewFollowsState as viewFollowsState } from '../../../test/lib/view-fidelity.ts';

test('state-machine: its Session card shows the traced state at every step, in every scenario', async () => {
  const project = await loadProject(StateMachine, 'scenes/explainers/state-machine');
  for (const scenario of project.scenarios) {
    const checked = await viewFollowsState(
      scenario.Scene,
      (scene) => (scene as unknown as { readout?: StateView }).readout,
    );
    const expected=scenario.values.events==='success'?['machine','connect','opened','close','terminal']:['machine','connect','error','terminal'];
    assert.deepEqual(scenario.trace.steps.filter(s=>s.meta.kind === 'detail').map(s=>s.step),expected);
    assert.equal(checked, expected.length, `${JSON.stringify(scenario.values)}: the Session card is checked at every program-walkthrough step`);
  }
});
