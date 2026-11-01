import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coffeeChart,
  playerChart,
  dispatch,
  flatten,
  flatFor,
  declaredFor,
  run,
  runFlat,
  configName,
  growth,
  FLAGS,
} from './model.ts';

test('a plain coffee machine needs POWER_OFF on each of four states; the chart needs one arrow on the box', () => {
  const chart = coffeeChart();
  assert.equal(flatFor(flatten(chart), 'POWER_OFF'), 4);
  assert.equal(declaredFor(chart, 'POWER_OFF'), 1);
});

test('an event is offered to the child first, then the parent', () => {
  const [asked] = dispatch(coffeeChart(), ['brewing'], 'POWER_OFF').asked;
  assert.deepEqual(asked!.path, ['brewing', 'on']);
  assert.equal(asked!.handledBy, 'on');
  // A child that handles the event keeps it: BREWED never reaches the parent.
  assert.deepEqual(dispatch(coffeeChart(), ['brewing'], 'BREWED').asked[0]!.path, ['brewing']);
});

test('regions each hold one state, and an event moves only the region that handles it', () => {
  const chart = playerChart(2);
  const trace = run(chart, ['PAUSE', 'MUTE', 'PLAY']).map(configName);
  assert.deepEqual(trace, ['playing + unmuted', 'paused + unmuted', 'paused + muted', 'playing + muted']);
});

test('the flattened player has the same behaviour as the statechart on every event sequence of length 4', () => {
  const chart = playerChart(2),
    flat = flatten(chart),
    events = ['PAUSE', 'PLAY', 'MUTE', 'UNMUTE'];
  const sequences = events.flatMap((a) => events.flatMap((b) => events.flatMap((c) => events.map((d) => [a, b, c, d]))));
  for (const seq of sequences) assert.deepEqual(runFlat(flat, seq), run(chart, seq).map(configName), seq.join(' '));
});

test('flat states double with each on/off feature; region states add two', () => {
  const rows = [1, 2, 3, 4, 5].map(growth);
  assert.deepEqual(rows.map((r) => r.flatStates), [2, 4, 8, 16, 32]);
  assert.deepEqual(rows.map((r) => r.regionStates), [2, 4, 6, 8, 10]);
  assert.deepEqual(rows.map((r) => r.regionArrows), [2, 4, 6, 8, 10]);
});

test('two flags can be written four ways but the player has two states', () => {
  assert.equal(FLAGS.length, 4);
  assert.deepEqual(FLAGS.filter((f) => f.state).map((f) => f.state), ['playing', 'paused']);
});
