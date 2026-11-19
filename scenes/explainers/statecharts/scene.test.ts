import { test } from 'node:test';
import assert from 'node:assert/strict';
import Statecharts from './scene.ts';
import { NullSink } from '../../../src/timeline.ts';
import { loadFonts } from '../../../explain/testing.ts';
import { exploreMachines } from '../../../tools/lib/explain-check.ts';

await loadFonts();

test('every live coffee and frother configuration reads on a whole phone picture with clear routes', async () => {
  const machines = await exploreMachines(await new Statecharts(new NullSink()).run(), Statecharts);
  assert.equal(machines.length, 2);
  assert.deepEqual(machines.map(machine => machine.states), [5, 9]);
  for (const machine of machines) {
    assert.deepEqual(machine.problems, []);
    assert.deepEqual(machine.phoneWarnings, []);
  }
});
