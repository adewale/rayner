// The statecharts explainer's model, against XState for every chart the explainer draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { player, muteWhilePlaying, initial, send, run, events, flatten, flatName, activeStates, FOLLOW } from '../scenes/explainers/lib/statecharts.ts';
import { XSTATE_VERSION, FIXTURE, CHARTS, PREEMPT } from '../tools/oracle/statecharts.ts';
import type { Expected, Explored } from '../tools/oracle/statecharts.ts';

// Captured by `node tools/oracle/statecharts.ts <dir>` with the pinned XState; see that file.
const xstate = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Expected;
/** XState's transitions as "from EVENT to", each configuration named as the model names a flat state. */
const named = (x: Explored) => {
  const names = x.configurations.map(flatName);
  return x.transitions.map(([from, event, to]) => `${names[from]} ${event} ${names[to]}`).sort();
};

test('flattening each drawn chart reaches the configurations and transitions XState reaches', () => {
  assert.equal(xstate.xstate, XSTATE_VERSION);
  assert.deepEqual(Object.keys(xstate.charts), Object.keys(CHARTS));
  for (const [name, chart] of Object.entries(CHARTS)) {
    const x = xstate.charts[name]!,
      flat = flatten(chart);
    assert.deepEqual(events(chart), x.events, `${name}: events`);
    assert.equal(flat.initial, flatName(x.initial), `${name}: initial`);
    assert.deepEqual([...flat.states].sort(), x.configurations.map(flatName).sort(), `${name}: states`);
    assert.deepEqual(flat.transitions.map((t) => `${t.from} ${t.event} ${t.to}`).sort(), named(x), `${name}: transitions`);
    // `can` and `handled` agree everywhere, including the events a configuration ignores.
    for (const config of x.configurations)
      for (const event of x.events)
        assert.equal(send(chart, config, event).handled, named(x).some((t) => t.startsWith(`${flatName(config)} ${event} `)), `${name}: ${flatName(config)} ${event}`);
    assert.deepEqual(run(chart, FOLLOW).map((s) => ({ event: s.event, can: s.handled, config: s.config })), x.follow, `${name}: follow`);
  }
});

test('XState finds each statechart and its boxed flat machine behave exactly like the flat machine', () => {
  // The flat machine is what XState explores; the claim "same behaviour" is that the other drawings explore to it.
  assert.deepEqual(named(xstate.charts.boxedMute!), named(xstate.charts.mute!));
  assert.deepEqual(named(xstate.charts.boxedMuteWhilePlaying!), named(xstate.charts.muteWhilePlaying!));
  assert.equal(named(xstate.charts.mute!).length, 13);
  assert.equal(named(xstate.charts.muteWhilePlaying!).length, 9);
});

test('POWER from inside on is taken by on, leaving every state inside at once', () => {
  for (const chart of [player(2), muteWhilePlaying()]) {
    const last = run(chart, FOLLOW).at(-1)!;
    assert.deepEqual(last.sources, ['on']);
    assert.deepEqual(last.config, ['off']);
  }
  assert.deepEqual(run(player(2), FOLLOW)[2]!.exited, ['unmuted'], 'MUTE leaves the playback region alone');
});

test('active states name the boxes a configuration is in, ancestors included, regions left out', () => {
  assert.deepEqual(activeStates(player(2), ['playing', 'muted']), ['on', 'playing', 'muted']);
  assert.deepEqual(activeStates(muteWhilePlaying(), ['muted']), ['on', 'playing', 'muted']);
  assert.deepEqual(activeStates(player(2), ['off']), ['off']);
});

test('a child that handles an event itself preempts its parent, as in XState, and an event no state handles changes nothing', () => {
  assert.deepEqual(send(PREEMPT, ['a1'], 'GO').sources, ['a1']);
  assert.deepEqual(send(PREEMPT, ['a2'], 'GO').sources, ['a']);
  assert.deepEqual(send(PREEMPT, ['b'], 'GO'), { event: 'GO', handled: false, sources: [], exited: [], entered: [], config: ['b'] });
  assert.deepEqual(named(xstate.preempt), flatten(PREEMPT).transitions.map((t) => `${t.from} ${t.event} ${t.to}`).sort());
});

test('charts that break the model’s rules are refused', () => {
  assert.throws(() => player(0), RangeError);
  assert.throws(() => player(3), RangeError);
  assert.throws(() => initial({ id: 'r', type: 'compound', initial: 'x', children: [{ id: 'a', type: 'atomic' }] }), /initial is not a child/);
  assert.throws(() => initial({ id: 'r', type: 'compound', initial: 'a', children: [{ id: 'a', type: 'atomic', on: { GO: 'z' } }] }), /unknown state z/);
  assert.throws(() => initial({ id: 'r', type: 'compound', initial: 'a', children: [{ id: 'a', type: 'atomic' }, { id: 'a', type: 'atomic' }] }), /Duplicate/);
});
