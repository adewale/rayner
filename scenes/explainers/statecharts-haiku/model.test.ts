import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COFFEE,
  COFFEE_COPIED,
  PLAYER,
  booleanRun,
  bothTrue,
  flatten,
  flattenRegions,
  nameOf,
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

test('a POWER_OFF from any child is handled by the box, which leaves to off', () => {
  for (const s of COFFEE_STATES) assert.deepEqual(send(COFFEE, s, 'POWER_OFF'), { handledBy: 'on', to: 'off' });
});

test('a child arrow is tried before its parent, and only unhandled events go up', () => {
  const c = { ...COFFEE, arrows: [...COFFEE.arrows, { from: 'brewing', event: 'POWER_OFF', to: 'ready' }] };
  assert.equal(send(c, 'brewing', 'POWER_OFF')?.handledBy, 'brewing');
  assert.equal(send(c, 'idle', 'POWER_OFF')?.handledBy, 'on');
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

test('the regions and their flat machine end in the same state on every event sequence up to six', () => {
  const flat = flattenRegions(PLAYER);
  const start = nameOf(startOf(PLAYER));
  const check = (events: string[]) => {
    assert.equal(runFlat(flat, start, events), nameOf(runRegions(PLAYER, events)), events.join(' '));
  };
  const walk = (events: string[], depth: number) => {
    check(events);
    if (depth === 0) return;
    for (const e of EVENTS) walk([...events, e], depth - 1);
  };
  walk([], 6);
});

test('PLAY, PAUSE, PLAY with a boolean that is not cleared leaves both flags true', () => {
  const flags = booleanRun(['PLAY', 'PAUSE', 'PLAY']);
  assert.deepEqual(flags, { isPlaying: true, isPaused: true, isMuted: false });
  assert.equal(bothTrue(flags), true);
});
