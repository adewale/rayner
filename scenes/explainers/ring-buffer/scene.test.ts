import { test } from 'node:test';
import type { View as StateView } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { describeExplainer, loadFonts as loadViewFonts, withIntent, withSettings as viewSettings, assertViewFollowsState as viewFollowsState } from '../../../explain/testing.ts';
import type { Scene as ViewScene } from '../../../src/index.ts';
import RingBufferScene from './scene.ts';
import { readFileSync } from 'node:fs';
const RingBufferExplainer = withIntent(RingBufferScene, readFileSync('scenes/explainers/ring-buffer/script.md', 'utf8'), 'scenes/explainers/ring-buffer/script.md');

test('ring-buffer views show the traced state at every step, in both scenarios', async () => {
  await loadViewFonts();
  for (const operations of ['wrap', 'full']) {
    const Ring = viewSettings(RingBufferExplainer, { operations });
    for (const name of ['ring', 'readout', 'results'] as const) {
      const pick = (scene: ViewScene) => (scene as unknown as Record<typeof name, StateView | undefined>)[name];
      assert.equal(await viewFollowsState(Ring, pick), 4, `${operations}: ${name} checked at all four steps`);
    }
  }
});

test('the reading path asks about five pushes and invites the reader to act at the live result', async () => {
  await loadViewFonts();
  const { scenarios } = await describeExplainer(RingBufferExplainer, { drawings: false });
  assert.deepEqual(scenarios.map(s => s.values.operations), ['wrap', 'full']);
  for (const scenario of scenarios) {
    const slots = scenario.steps.find(s => s.step === 'slots')!;
    assert.match(slots.predict?.prompt ?? '', /after five pushes.*head.*tail/i);
    assert.equal(slots.predict!.reveal, 'fill');
    const fill = scenario.steps.find(s => s.step === 'fill')!;
    assert.deepEqual([fill.state.head, fill.state.tail], [0, 0]);
    assert.equal(slots.predict!.options[slots.predict!.answer], 'Both at slot 0');
    const invitations = scenario.steps.filter(s => /\b(?:push|pop) (?:below|buttons?)\b/i.test(s.caption)).map(s => s.step);
    assert.deepEqual(invitations, ['result'], scenario.name);
    const live = scenario.machines?.find(m => m.step === 'result' && m.live);
    assert.deepEqual(live?.events, ['push', 'pop']);
  }
});
