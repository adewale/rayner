import test from 'node:test';
import assert from 'node:assert/strict';
import { agree, coffee, counts, flatten, flatStep, growth, initialConfig, lookup, player, powerScaling, run, send } from './model.ts';

const names = (cs: ReturnType<typeof run>) => cs.map((c) => c.leaves.join('+'));

test('the power button: every working state needs its own arrow when flat, one when grouped', () => {
  const c = counts(coffee('power'));
  assert.deepEqual(c, { chartStates: 5, chartArrows: 6, flatStates: 5, flatArrows: 9 });
});

test('a button whose arrows disagree on the target saves nothing', () => {
  const c = counts(coffee('back'));
  assert.deepEqual(c, { chartStates: 4, chartArrows: 7, flatStates: 4, flatArrows: 7 });
});

test('the parent handles an event its child does not (Khourshid: "Parent states handle transitions if their children don\'t")', () => {
  const chart = coffee('power');
  const at = run(chart, ['START', 'GROUND']).at(-1)!;
  assert.deepEqual(at.leaves, ['brewing']);
  const [l] = lookup(chart, at, 'POWER_OFF');
  assert.deepEqual(l!.asked, ['brewing', 'on']);
  assert.equal(l!.handler?.from, 'on');
  assert.deepEqual(names(run(chart, ['START', 'GROUND', 'POWER_OFF'])), ['idle', 'grinding', 'brewing', 'off']);
});

test('the child wins when both have an arrow for the event', () => {
  const chart = coffee('power');
  chart.edges.push({ from: 'brewing', event: 'POWER_OFF', to: 'ready' });
  assert.equal(names(run(chart, ['START', 'GROUND', 'POWER_OFF'])).at(-1), 'ready');
});

test('events nobody handles leave the machine where it is', () => {
  const chart = coffee('power');
  const s = send(chart, initialConfig(chart), 'BREWED');
  assert.equal(s.handled, false);
  assert.deepEqual(s.config, initialConfig(chart));
});

test('without history POWER_ON restarts at idle; with history it resumes where the machine was', () => {
  const events = ['START', 'GROUND', 'POWER_OFF', 'POWER_ON'];
  assert.equal(names(run(coffee('power'), events)).at(-1), 'idle');
  assert.equal(names(run(coffee('power', { history: true }), events)).at(-1), 'brewing');
  // Switched off before anything happened, a history state has nothing to remember: it falls back to the initial child.
  assert.equal(names(run(coffee('power', { history: true }), ['POWER_OFF', 'POWER_ON'])).at(-1), 'idle');
});

test('history costs no arrow in the chart and a copy of off per remembered state when flat', () => {
  const plain = counts(coffee('power'));
  const h = counts(coffee('power', { history: true }));
  assert.equal(h.chartArrows, plain.chartArrows);
  assert.deepEqual([h.flatStates, h.flatArrows], [8, 12]);
});

test('parallel regions: an event moves one region and leaves the others alone', () => {
  const chart = player(2);
  const trail = run(chart, ['PLAY', 'MUTE', 'PAUSE', 'UNMUTE']);
  assert.deepEqual(names(trail), ['paused+unmuted', 'playing+unmuted', 'playing+muted', 'paused+muted', 'paused+unmuted'].map((s) => s.split('+').sort().join('+')));
});

test('a flat player has a state per combination and an arrow per (state, event)', () => {
  assert.deepEqual(counts(player(2)), { chartStates: 4, chartArrows: 4, flatStates: 4, flatArrows: 8 });
  assert.deepEqual(counts(player(3)), { chartStates: 6, chartArrows: 6, flatStates: 8, flatArrows: 24 });
});

test('growth: flat states double with each region, a chart adds two', () => {
  const g = growth(6);
  assert.deepEqual(g.map((r) => r.flatStates), [2, 4, 8, 16, 32, 64]);
  assert.deepEqual(g.map((r) => r.chartStates), [2, 4, 6, 8, 10, 12]);
  assert.deepEqual(g.map((r) => r.flatArrows), [2, 8, 24, 64, 160, 384]);
  assert.deepEqual(g.map((r) => r.chartArrows), [2, 4, 6, 8, 10, 12]);
});

test('power scaling: one more state is one more flat arrow, and no more chart arrows for the button', () => {
  const rows = powerScaling(8);
  assert.deepEqual(rows.map((r) => r.flatArrows - r.chartArrows), rows.map((r) => r.states - 1));
});

test('every statechart flattens to a state machine with the same behaviour on every event sequence', () => {
  for (const chart of [coffee('power'), coffee('power', { history: true }), coffee('back'), player(2), player(3)])
    assert.ok(agree(chart, flatten(chart), 5) > 0);
});

test('the agreement check can fail: break the flat machine and it notices', () => {
  const chart = player(2);
  const flat = flatten(chart);
  flat.edges[0]!.to = flat.states.at(-1)!.id;
  assert.throws(() => agree(chart, flat, 3));
});

test('flat transitions are a function: the flat machine is deterministic', () => {
  for (const chart of [coffee('power', { history: true }), player(3)]) {
    const flat = flatten(chart);
    const seen = new Set<string>();
    for (const e of flat.edges) {
      const k = e.from + '|' + e.event;
      assert.ok(!seen.has(k));
      seen.add(k);
    }
    assert.equal(flatStep(flat, flat.initial, 'nothing'), flat.initial);
  }
});
