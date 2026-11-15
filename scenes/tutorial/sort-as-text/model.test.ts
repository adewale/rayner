import test from 'node:test';
import assert from 'node:assert/strict';
import { ADDS, EVENTS, bound, next, sorted, start, type Compare, type State } from './model.ts';

// The oracle: Node's own Array.prototype.sort, run live each time this test runs.
const real = (values: readonly number[], compare: Compare) => (compare === 'none' ? [...values].sort() : [...values].sort((a, b) => a - b));

test('the model sorts as Node sorts, with no compare function and with (a, b) => a - b', () => {
  for (const values of [[10, 9, 1], [2, 10, 1], [100, 25, 3, 1000], [-1, -2, 0], [5, 50, 0.5, 5], [1e21, 2, 30]])
    for (const compare of ['none', 'numbers'] as const) assert.deepEqual(sorted(values, compare), real(values, compare), `[${values}] with ${compare}`);
});

test('every array the live step reaches sorts as Node sorts it', () => {
  const seen: State[] = [];
  for (const queue = [start('none')]; queue.length; ) {
    const state = queue.shift()!;
    seen.push(state);
    for (const event of EVENTS) if (!bound(state, event)) queue.push(next(state, event));
  }
  assert.equal(seen.length, 1 + 3 + 6 + 6, 'each order of adding 2, 25 and 100, or some of them');
  for (const { values } of seen) for (const compare of ['none', 'numbers'] as const) assert.deepEqual(sorted(values, compare), real(values, compare));
});

test('the live step adds each number once, at the end of the array', () => {
  assert.deepEqual(next(start('none'), 'add 100').values, [10, 9, 1, 100]);
  assert.equal(bound(next(start('none'), 'add 2'), 'add 2'), 'the array holds 2 already, and this picture shows each number once');
  assert.deepEqual(ADDS.map((n) => bound(start('none'), `add ${n}`)), [undefined, undefined, undefined]);
});
