import test from 'node:test';
import { isRefusal } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { MOVES, next, solve, start, type Tower } from './model.ts';

/** Every arrangement reachable from the start, and the fewest moves to the finished tower on C. */
function search(n: number) {
  const key = (t: Tower) => JSON.stringify(t.pegs), depth = new Map([[key(start(n)), 0]]);
  for (const queue = [start(n)]; queue.length; ) {
    const t = queue.shift()!;
    for (const m of MOVES) {
      const after = next(t, m);
      if (!isRefusal(after) && !depth.has(key(after))) { depth.set(key(after), depth.get(key(t))! + 1); queue.push(after); }
    }
  }
  return { arrangements: depth.size, fewest: depth.get(key({ pegs: [[], [], start(n).pegs[0]!] })) };
}

test('no route is shorter than 7 moves for three disks, 15 for four or 31 for five', () => {
  assert.deepEqual(search(3), { arrangements: 27, fewest: 7 });
  assert.deepEqual(search(4), { arrangements: 81, fewest: 15 });
  assert.deepEqual(search(5), { arrangements: 243, fewest: 31 });
});

test('disk 1 moves first to C when the number of disks is odd, and to B when it is even', () => {
  assert.deepEqual([3, 4, 5].map((n) => solve(n)[0]), ['A→C', 'A→B', 'A→C']);
});

test('solve() keeps the rules, finishes on C, and takes the fewest moves', () => {
  for (const n of [3, 4, 5]) {
    let tower = start(n);
    for (const m of solve(n)) {
      const after = next(tower, m);
      assert.ok(!isRefusal(after), `${n} disks: ${m} is refused`);
      tower = after;
    }
    assert.deepEqual(tower.pegs, [[], [], start(n).pegs[0]]);
    assert.equal(solve(n).length, search(n).fewest);
  }
});

test('a disk on a smaller disk, or a move from an empty peg, is refused with the rule', () => {
  const onSmaller = next({ pegs: [[2], [1], []] }, 'A→B'), fromEmpty = next({ pegs: [[], [1], []] }, 'A→C');
  assert.ok(isRefusal(onSmaller) && onSmaller.reason === 'disk 2 cannot sit on the smaller disk 1');
  assert.ok(isRefusal(fromEmpty) && fromEmpty.reason === 'peg A is empty');
});
