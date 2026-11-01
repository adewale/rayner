import test from 'node:test';
import assert from 'node:assert/strict';
import { describeExplainer } from '../../../explain/index.ts';
import { variantsOf } from '../../../explain/index.ts';
import Scene from './scene.ts';
import { coffee, counts, flatten, growth, player } from './model.ts';

const d = await describeExplainer(Scene, { drawings: false });
const get = (button: string, regions: string) => d.cases.find((c) => c.values.button === button && c.values.regions === regions)!;
const step = (c: ReturnType<typeof get>, name: string) => c.steps.find((s) => s.step === name)!;

test('every case is built', () => assert.equal(d.cases.length, variantsOf(Scene).length));

test('the power button steps show the model\'s counts', () => {
  const c = get('power', 'two');
  const want = counts(coffee('power'));
  assert.equal(step(c, 'button').state.flatArrows, want.flatArrows);
  assert.equal(step(c, 'group').state.chartArrows, want.chartArrows);
  assert.equal(step(c, 'history-flat').state.flatStates, 8);
  assert.equal(step(c, 'history-flat').state.flatArrows, 12);
});

test('BACK saves nothing, and its steps say so with the model\'s numbers', () => {
  const c = get('back', 'two');
  const want = counts(coffee('back'));
  assert.equal(want.flatArrows, want.chartArrows);
  assert.equal(step(c, 'group').state.chartArrows, want.chartArrows);
  assert.ok(!c.steps.some((s) => s.step === 'flatten' || s.step === 'history'));
  assert.match(step(c, 'group').caption, /7 arrows either way/);
});

test('the player steps show the model\'s counts for each case', () => {
  for (const [regions, k] of [['two', 2], ['three', 3]] as const) {
    const c = get('power', regions);
    const want = counts(player(k));
    assert.equal(step(c, 'regions').state.chartArrows, want.chartArrows);
    assert.equal(step(c, 'product').state.flatStates, flatten(player(k)).states.length);
    assert.equal(step(c, 'product').state.flatArrows, want.flatArrows);
    assert.match(step(c, 'regions').caption, new RegExp(`${want.chartArrows}`));
  }
});

test('the growth step quotes the last row of the model', () => {
  const last = growth(6).at(-1)!;
  const c = get('power', 'two');
  assert.equal(step(c, 'growth').state.flatStates, last.flatStates);
  assert.match(step(c, 'growth').caption, new RegExp(`${last.flatStates} states`));
});

test('together ends in the state the model reaches', () => {
  assert.equal(step(get('power', 'two'), 'together').state.current, 'paused · muted');
  assert.equal(step(get('power', 'three'), 'together').state.current, 'paused · muted · looping');
});
