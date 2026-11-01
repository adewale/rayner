import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COFFEE,
  COFFEE_COPIED,
  FROTHER,
  PLAYER,
  booleanRun,
  bothTrue,
  dispatchTrace,
  flagRows,
  flatten,
  flattenRegions,
  growthOf,
  nameOf,
  readingOf,
  runFlat,
  runRegions,
  send,
  startOf,
  type Arrow,
} from './model.ts';

const COFFEE_STATES = ['idle', 'grinding', 'brewing', 'ready'];
const EVENTS = ['PLAY', 'PAUSE', 'MUTE', 'UNMUTE'];
const sorted = (arrows: Arrow[]) =>
  arrows.map((a) => `${a.from} ${a.event} ${a.to}`).sort();

/** Every event sequence up to `depth` long, over `events`, with its end checked by `check`. */
const eachSequence = (events: string[], depth: number, check: (seq: string[]) => void) => {
  const walk = (seq: string[], left: number) => {
    check(seq);
    if (left === 0) return;
    for (const e of events) walk([...seq, e], left - 1);
  };
  walk([], depth);
};

test('a POWER_OFF from any child is handled by the box, which leaves to off', () => {
  for (const s of COFFEE_STATES) assert.deepEqual(send(COFFEE, s, 'POWER_OFF'), { handledBy: 'on', to: 'off' });
});

test('a child arrow is tried before its parent, and only unhandled events go up', () => {
  const c = { ...COFFEE, arrows: [...COFFEE.arrows, { from: 'brewing', event: 'POWER_OFF', to: 'ready' }] };
  assert.equal(send(c, 'brewing', 'POWER_OFF')?.handledBy, 'brewing');
  assert.equal(send(c, 'idle', 'POWER_OFF')?.handledBy, 'on');
});

test('dispatch from brewing checks brewing first, then on, which handles POWER_OFF', () => {
  assert.deepEqual(dispatchTrace(COFFEE, 'brewing', 'POWER_OFF'), [
    { state: 'brewing', handles: false },
    { state: 'on', handles: true },
  ]);
  assert.equal(dispatchTrace(COFFEE, 'brewing', 'POWER_OFF').at(-1)?.state, send(COFFEE, 'brewing', 'POWER_OFF')?.handledBy);
});

test('dispatch stops at the first state that handles the event, even when its parent also has an arrow', () => {
  const c = { ...COFFEE, arrows: [...COFFEE.arrows, { from: 'brewing', event: 'POWER_OFF', to: 'ready' }] };
  assert.deepEqual(dispatchTrace(c, 'brewing', 'POWER_OFF'), [{ state: 'brewing', handles: true }]);
});

test('dispatch with no handler checks every state on the way up and stops with none handling', () => {
  assert.deepEqual(dispatchTrace(COFFEE, 'brewing', 'NOPE'), [
    { state: 'brewing', handles: false },
    { state: 'on', handles: false },
  ]);
  assert.equal(send(COFFEE, 'brewing', 'NOPE'), null);
});

test('the box draws one arrow where the copied machine draws four, with the same behaviour', () => {
  assert.equal(COFFEE.arrows.filter((a) => a.event === 'POWER_OFF').length, 1);
  assert.equal(COFFEE_COPIED.arrows.filter((a) => a.event === 'POWER_OFF').length, 4);
  for (const s of [...COFFEE_STATES, 'off'])
    assert.equal(send(COFFEE, s, 'POWER_OFF')?.to ?? s, send(COFFEE_COPIED, s, 'POWER_OFF')?.to ?? s);
});

test('flattening the box gives the copied machine', () => {
  assert.deepEqual(sorted(flatten(COFFEE).arrows), sorted(COFFEE_COPIED.arrows));
});

test('two on/off features: four flat states, eight flat arrows, four region arrows', () => {
  const flat = flattenRegions(PLAYER);
  assert.equal(Object.keys(flat.parent).length, 4);
  assert.equal(flat.arrows.length, 8);
  assert.equal(Object.values(PLAYER).reduce((n, r) => n + r.arrows.length, 0), 4);
  assert.equal(Object.values(PLAYER).reduce((n, r) => n * r.states.length, 1), 4);
});

test('each region arrow is copied into both states of the other region in the flat machine', () => {
  const flat = flattenRegions(PLAYER);
  for (const event of EVENTS) assert.equal(flat.arrows.filter((a) => a.event === event).length, 2, event);
});

test('the regions and their flat machine end in the same state on every event sequence up to six', () => {
  const flat = flattenRegions(PLAYER);
  const start = nameOf(startOf(PLAYER));
  eachSequence(EVENTS, 6, (events) => {
    assert.equal(runFlat(flat, start, events), nameOf(runRegions(PLAYER, events)), events.join(' '));
  });
});

test('the same five events from the start give the same name at every row of the table', () => {
  const flat = flattenRegions(PLAYER);
  const start = nameOf(startOf(PLAYER));
  const events = ['PLAY', 'MUTE', 'PAUSE', 'UNMUTE', 'PAUSE'];
  events.forEach((_, i) => {
    const prefix = events.slice(0, i + 1);
    assert.equal(runFlat(flat, start, prefix), nameOf(runRegions(PLAYER, prefix)));
  });
  // The fifth PAUSE finds no arrow out of paused, so the state stays where it was.
  assert.equal(runFlat(flat, start, events), runFlat(flat, start, events.slice(0, 4)));
});

test('a milk frother beside the coffee cycle: 4 x 2 = 8 flat states, 6 region states, 16 flat arrows', () => {
  const flat = flattenRegions(FROTHER);
  assert.equal(Object.keys(flat.parent).length, 8);
  assert.equal(flat.arrows.length, 16);
  assert.equal(Object.values(FROTHER).reduce((n, r) => n + r.states.length, 0), 6);
  assert.equal(Object.values(FROTHER).reduce((n, r) => n + r.arrows.length, 0), 6);
});

test('the frother machine flattens to the same behaviour as its regions on every sequence up to five', () => {
  const flat = flattenRegions(FROTHER);
  const start = nameOf(startOf(FROTHER));
  const events = ['START', 'GROUND', 'BREWED', 'TAKE', 'FROTH_ON', 'FROTH_OFF'];
  eachSequence(events, 5, (seq) => {
    assert.equal(runFlat(flat, start, seq), nameOf(runRegions(FROTHER, seq)), seq.join(' '));
  });
});

test('n on/off features: flat states double, region states add two', () => {
  assert.deepEqual(growthOf(2), { flat: 4, regions: 4 });
  assert.deepEqual(growthOf(3), { flat: 8, regions: 6 });
  assert.deepEqual(growthOf(4), { flat: 16, regions: 8 });
  assert.deepEqual(growthOf(5), { flat: 32, regions: 10 });
});

test('PLAY, PAUSE, PLAY with a boolean that is not cleared leaves both flags true', () => {
  const flags = booleanRun(['PLAY', 'PAUSE', 'PLAY']);
  assert.deepEqual(flags, { isPlaying: true, isPaused: true, isMuted: false });
  assert.equal(bothTrue(flags), true);
});

test('of the four flag pairs, only true-and-true is impossible, and only false-and-false names no state', () => {
  const rows = flagRows();
  assert.deepEqual(
    rows.map((r) => r.reading),
    ['playing', 'paused', 'impossible', 'neither'],
  );
  assert.equal(readingOf({ isPlaying: true, isPaused: true }), 'impossible');
});
