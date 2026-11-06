import test from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal } from '../../../src/index.ts';
import { MOVES, next, start, type Tower } from './model.ts';

test('the fewest moves that carry three disks from A to C is seven, 2³ − 1', () => {
  const key = (t: Tower) => JSON.stringify(t.pegs);
  const depth = new Map([[key(start()), 0]]);
  for (const queue = [start()]; queue.length; ) {
    const t = queue.shift()!;
    for (const m of MOVES) {
      const n = next(t, m);
      if (!isRefusal(n) && !depth.has(key(n))) { depth.set(key(n), depth.get(key(t))! + 1); queue.push(n); }
    }
  }
  assert.equal(depth.size, 27);
  assert.equal(depth.get(key({ pegs: [[], [], [3, 2, 1]] })), 7);
});
