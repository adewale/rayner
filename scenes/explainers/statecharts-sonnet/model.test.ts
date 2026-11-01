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
  frotherChart,
  sizes,
  compareAll,
  eventsOf,
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

test('two flags can be written four ways; one row is impossible and one is merely unnamed', () => {
  assert.deepEqual(FLAGS.map((f) => f.verdict), ['playing', 'paused', 'impossible', 'neither?']);
});

test('the full coffee cycle: five states and nine arrows flat, six states and six arrows as a chart', () => {
  assert.deepEqual(sizes(coffeeChart()), { flatStates: 5, flatArrows: 9, chartStates: 6, chartArrows: 6 });
  const flat = flatten(coffeeChart());
  // TAKE closes the loop and POWER_ON returns to the first state, not to a state of its own choosing.
  assert.ok(flat.transitions.some((t) => t.from === 'ready' && t.event === 'TAKE' && t.to === 'idle'));
  assert.ok(flat.transitions.some((t) => t.from === 'off' && t.event === 'POWER_ON' && t.to === 'idle'));
});

test('a milk frother in its own region: the flat machine multiplies and copies POWER_OFF eight times, the chart adds two states', () => {
  const chart = frotherChart();
  assert.deepEqual(sizes(chart), { flatStates: 9, flatArrows: 25, chartStates: 8, chartArrows: 8 });
  assert.equal(flatFor(flatten(chart), 'POWER_OFF'), 8);
  assert.equal(declaredFor(chart, 'POWER_OFF'), 1);
});

test('POWER_OFF from a state with the frother on leaves the whole box, both regions', () => {
  const [a] = dispatch(frotherChart(), ['brewing', 'froth on'], 'POWER_OFF').next;
  assert.equal(a, 'off');
  assert.deepEqual(dispatch(frotherChart(), ['brewing', 'froth on'], 'POWER_OFF').next, ['off']);
});

test('flattened, every chart agrees with its chart on every event sequence tried', () => {
  const player = playerChart(2);
  assert.deepEqual(compareAll(player, eventsOf(player), 4), { tried: 256, agreed: 256 });
  const frother = frotherChart();
  assert.deepEqual(compareAll(frother, eventsOf(frother), 4), { tried: 4096, agreed: 4096 });
  const coffee = coffeeChart();
  assert.deepEqual(compareAll(coffee, eventsOf(coffee), 5), { tried: 6 ** 5, agreed: 6 ** 5 });
});

test('regions shrink the drawing, not the situations: the chart can be in as many situations as the flat machine has states', () => {
  for (const n of [2, 3, 4, 5]) {
    const g = growth(n);
    assert.equal(flatten(playerChart(n)).states.length, 2 ** n);
    assert.equal(g.flatStates, 2 ** n);
    assert.ok(g.regionStates <= g.flatStates);
  }
});

test('flatten reproduces the plain four-state player drawn by hand', () => {
  const byHand: [string, string, string][] = [
    ['playing + unmuted', 'PAUSE', 'paused + unmuted'],
    ['playing + unmuted', 'MUTE', 'playing + muted'],
    ['paused + unmuted', 'PLAY', 'playing + unmuted'],
    ['paused + unmuted', 'MUTE', 'paused + muted'],
    ['playing + muted', 'PAUSE', 'paused + muted'],
    ['playing + muted', 'UNMUTE', 'playing + unmuted'],
    ['paused + muted', 'PLAY', 'playing + muted'],
    ['paused + muted', 'UNMUTE', 'paused + unmuted'],
  ];
  const flat = flatten(playerChart(2)).transitions.map((t) => [t.from, t.event, t.to].join('>'));
  assert.deepEqual([...flat].sort(), byHand.map((t) => t.join('>')).sort());
});
