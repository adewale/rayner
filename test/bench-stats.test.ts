// The decisions behind `npm run bench` (tools/repo/lib/bench-stats.ts): the browser half only
// records timestamps, so whether a change fails the gate is decided here.
// Counts: test/lib/pbt.ts (FULL=1 is 10x).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { MIN_PAIRS, PAIRS, blocking, compare, longestGap, median, order, verdict, worstShift } from '../tools/repo/lib/bench-stats.ts';

const rule = { rel: 0.1, floor: 50 };
const ms = fc.integer({ min: 0, max: 5000 });
// 5 to 15 interleaved pairs: enough to be judged.
const pairs = fc.integer({ min: MIN_PAIRS, max: 15 }).chain((n) => fc.tuple(fc.array(ms, { minLength: n, maxLength: n }), fc.array(ms, { minLength: n, maxLength: n })));

test('median: the middle value, the mean of the middle two for an even count, and the input left as it was', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.ok(Number.isNaN(median([])));
  const xs = [3, 1, 2];
  median(xs);
  assert.deepEqual(xs, [3, 1, 2]);
  // An outlier moves a mean, not a median.
  assert.equal(median([100, 101, 102, 103, 5000]), 102);
});

test('blocking: experienced blocking is clipped to both observation edges', () => {
  const tasks = [
    [0, 200], // started before the window: its blocking interval overlaps by100ms
    [100, 80], // 30 over
    [150, 50], // exactly 50: blocks nothing
    [300, 120], // blocking interval [350,420] is clipped to50ms at the end
    [401, 500], // after the window
  ] as const;
  assert.equal(blocking(tasks, 100, 400), 180);
  assert.equal(blocking([], 0, 1000), 0);
});

test('longestGap: the longest wait between frames in the window, counting the wait for the first', () => {
  assert.equal(longestGap([0, 16, 33, 50, 150, 166, 300], 20, 170), 100);
  // The first frame after `from` is 80 ms away: a tap followed by 80 ms of nothing is a hitch.
  assert.equal(longestGap([0, 100, 116], 20, 120), 80);
  assert.equal(longestGap([0, 300], 10, 200), 190);
});

test('order: BASE and HEAD alternate which goes first, so each goes first in half the pairs', () => {
  const firsts = Array.from({ length: 8 }, (_, rep) => order(rep)[0]);
  assert.deepEqual(firsts, ['base', 'head', 'base', 'head', 'base', 'head', 'base', 'head']);
  for (let rep = 0; rep < 8; rep++) assert.deepEqual([...order(rep)].sort(), ['base', 'head']);
});

test('compare: a consistent slowdown past both thresholds regresses', () => {
  const base = [400, 410, 395, 420, 405, 398, 412];
  const c = compare(base, base.map((v) => v + 120), rule);
  assert.equal(c.delta, 120);
  assert.equal(c.slower, 1);
  assert.equal(c.regressed, true);
});

test('compare: under either threshold is not a regression', () => {
  const base = [400, 410, 395, 420, 405, 398, 412];
  // 45 ms is 11% of 405 but under the 50 ms floor.
  assert.equal(compare(base, base.map((v) => v + 45), rule).regressed, false);
  // 300 ms on a 4 s motion is over the floor but 7%, under 10%.
  const long = base.map((v) => v * 10);
  assert.equal(compare(long, long.map((v) => v + 300), rule).regressed, false);
  // Faster is never a regression.
  assert.equal(compare(base, base.map((v) => v - 200), rule).regressed, false);
});

test('compare: a median moved by a few disturbed samples, with HEAD slower in under 70% of pairs, is not a regression', () => {
  const base = [400, 400, 400, 400, 400, 400, 400];
  // Four of seven pairs hit by another job on the machine: the median moves 400 → 900.
  const head = [900, 900, 900, 900, 380, 380, 380];
  const c = compare(base, head, rule);
  assert.equal(c.head, 900);
  assert.equal(c.slower, 4 / 7);
  assert.ok(c.slower < PAIRS);
  assert.equal(c.regressed, false);
  // Five of seven is enough.
  assert.equal(compare(base, [900, 900, 900, 900, 900, 380, 380], rule).regressed, true);
  // A tie is not HEAD being slower: three ties and four slower pairs is 4/7.
  assert.equal(compare(base, [900, 900, 900, 900, 400, 400, 400], rule).slower, 4 / 7);
});

test('compare: needs pairs, one sample on each side for each, and judges no fewer than five', () => {
  assert.throws(() => compare([1, 2], [1], rule));
  assert.throws(() => compare([], [], rule));
  // Four pairs each 300 ms slower are shown, not judged; five are judged.
  assert.equal(MIN_PAIRS, 5);
  const short = compare([100, 100, 100, 100], [400, 400, 400, 400], rule);
  assert.equal(short.judged, false);
  assert.equal(short.regressed, false);
  assert.equal(verdict(short), 'inconclusive');
  assert.equal(compare([100, 100, 100, 100, 100], [400, 400, 400, 400, 400], rule).regressed, true);
});

test('compare: the same samples on both sides never regress, and neither do HEAD samples no slower than BASE', () => {
  fc.assert(
    fc.property(pairs, ([base]) => !compare(base, base, rule).regressed),
    params(),
  );
  fc.assert(
    fc.property(pairs, ([base, d]) => !compare(base, base.map((v, i) => Math.max(0, v - d[i]!)), rule).regressed),
    params(),
  );
});

test('compare: every pair slower by more than both thresholds always regresses', () => {
  fc.assert(
    fc.property(pairs, ([base, extra]) => {
      const worst = Math.max(...base);
      const head = base.map((v, i) => v + Math.max(rule.floor, rule.rel * worst) + 1 + extra[i]!);
      return compare(base, head, rule).regressed;
    }),
    params(),
  );
});

test('compare: a regression is the same regression whichever order the pairs were taken in', () => {
  fc.assert(
    fc.property(pairs, fc.integer({ min: 0, max: 14 }), ([base, head], k) => {
      const n = base.length,
        rot = <T>(xs: T[]) => [...xs.slice(k % n), ...xs.slice(0, k % n)];
      assert.deepEqual(compare(base, head, rule), compare(rot(base), rot(head), rule));
    }),
    params(),
  );
});

test('verdict: a regression must show on both rounds', () => {
  const base = [100, 100, 100, 100, 100];
  const slow = compare(base, [300, 300, 300, 300, 300], rule),
    fine = compare(base, base, rule);
  assert.equal(verdict(fine), 'ok');
  assert.equal(verdict(fine, slow), 'ok');
  assert.equal(verdict(slow, fine), 'not reproduced');
  assert.equal(verdict(slow), 'not reproduced');
  assert.equal(verdict(slow, slow), 'regression');
  const short = compare([100], [300], rule);
  assert.equal(verdict(slow, short), 'inconclusive');
  assert.equal(verdict(fine, short), 'inconclusive');
});

test('median: every finite repeated value survives, including subnormals and maximal magnitudes', () => {
  fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.integer({ min: 1, max: 15 }), (value, count) => {
    assert.equal(median(Array(count).fill(value)), value);
  }), params());
  for (const value of [Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, 0, -0]) assert.equal(median([value, value]), value);
  assert.equal(median([Number.MIN_VALUE, 2 * Number.MIN_VALUE]), 2 * Number.MIN_VALUE);
  assert.equal(median([-Number.MAX_VALUE, Number.MAX_VALUE]), 0);
  assert.equal(median([Number.MAX_VALUE / 2, Number.MAX_VALUE]), Number.MAX_VALUE * 0.75);
});

test('median: input permutations preserve the middle order statistics and never mutate the input', () => {
  fc.assert(fc.property(fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 30 }), (values) => {
    const before = [...values], sorted = [...values].sort((a, b) => a - b), got = median(values);
    assert.deepEqual(values, before);
    assert.ok(Number.isFinite(got));
    assert.ok(got >= sorted[Math.floor((values.length - 1) / 2)]! && got <= sorted[Math.floor(values.length / 2)]!);
    assert.ok(got === median([...values].reverse()));
    if (values.length % 2) assert.equal(got, sorted[Math.floor(values.length / 2)]);
  }), params());
});

test('invalid samples, decision rules, windows and traces reject before producing a verdict', () => {
  for (const bad of [NaN, Infinity, -Infinity]) assert.throws(() => median([1, bad]), RangeError);
  for (const bad of [NaN, Infinity, -Infinity, -1]) {
    assert.throws(() => compare([bad], [1], rule), RangeError);
    assert.throws(() => compare([1], [bad], rule), RangeError);
    assert.throws(() => compare([1], [1], { rel: bad, floor: 0 }), RangeError);
    assert.throws(() => compare([1], [1], { rel: 0, floor: bad }), RangeError);
    for (const metric of [blocking, longestGap]) {
      assert.throws(() => metric([], bad, 10), RangeError);
      assert.throws(() => metric([], 0, bad), RangeError);
      assert.throws(() => metric([], 10, 0), RangeError);
    }
    assert.throws(() => blocking([[bad, 60]], 0, 10), RangeError);
    assert.throws(() => blocking([[0, bad]], 0, 10), RangeError);
    assert.throws(() => longestGap([bad], 0, 10), RangeError);
  }
  assert.throws(() => longestGap([30, 20], 0, 10), RangeError, 'out-of-window observations must also be chronological');
});

test('compare: varied rules use strict absolute and relative thresholds with an inclusive slower share', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 100 }), fc.integer({ min: 1, max: 15 }), (baseValue, delta, floor, percent, count) => {
    const varied = { rel: percent / 100, floor }, c = compare(Array(count).fill(baseValue), Array(count).fill(baseValue + delta), varied);
    assert.equal(c.base, baseValue); assert.equal(c.head, baseValue + delta); assert.equal(c.delta, delta);
    assert.equal(c.slower, delta > 0 ? 1 : 0); assert.equal(c.judged, count >= 5);
    assert.equal(c.regressed, count >= 5 && delta > floor && delta > baseValue * percent / 100);
  }), params());
  for (const count of [4, 5]) {
    const c = compare(Array(count).fill(100), Array(count).fill(150), { floor: 50, rel: 0 });
    assert.equal(c.regressed, false, 'equal absolute threshold is not a regression');
    assert.equal(compare(Array(count).fill(100), Array(count).fill(150), { floor: 0, rel: 0.5 }).regressed, false);
  }
  const base = Array(10).fill(100);
  assert.equal(compare(base, [...Array(7).fill(300), ...Array(3).fill(100)], rule).slower, 0.7);
  assert.equal(compare(base, [...Array(7).fill(300), ...Array(3).fill(100)], rule).regressed, true);
  assert.equal(compare(base, [...Array(6).fill(300), ...Array(4).fill(100)], rule).regressed, false);
});

test('blocking: independent interval lengths clip both edges and include pre-window long tasks', () => {
  fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 200 })), { maxLength: 20 }), fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 200 }), (tasks, from, width) => {
    // Integer timestamps allow an independent unit-cell count of the intersection.
    let expected = 0;
    for (let tick = from; tick < from + width; tick++) for (const [start, duration] of tasks) if (tick >= start + 50 && tick < start + duration) expected++;
    assert.equal(blocking(tasks, from, from + width), expected);
  }), params());
  assert.equal(blocking([[0, 200]], 100, 120), 20);
  assert.equal(blocking([[0, 200]], 200, 220), 0);
  assert.equal(blocking([[100, 50]], 100, 200), 0);
  assert.equal(blocking([[100, 51]], 150, 151), 1);
  assert.equal(blocking([[100, 51]], 150, 150), 0);
});

test('longestGap: partition the full window including the final tail and empty-frame case', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 500 }), { maxLength: 25 }), fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 200 }), (input, from, width) => {
    const frames = [...input].sort((a, b) => a - b), boundaries = [from, ...frames.filter((t) => t >= from && t <= from + width), from + width];
    const gaps = boundaries.slice(1).map((value, i) => value - boundaries[i]!);
    assert.equal(longestGap(frames, from, from + width), Math.max(...gaps));
  }), params());
  assert.equal(longestGap([], 10, 80), 70);
  assert.equal(longestGap([10, 20, 20], 10, 100), 80);
  assert.equal(longestGap([10], 10, 10), 0);
});

test('compare: a malformed observation anywhere in an otherwise valid batch rejects', () => {
  const invalid = fc.oneof(fc.constantFrom(NaN, Infinity, -Infinity), fc.double({ min: -Number.MAX_VALUE, max: -Number.MIN_VALUE, noNaN: true }));
  fc.assert(fc.property(fc.array(ms, { minLength: 1, maxLength: 15 }), invalid, fc.nat(), fc.boolean(), (values, bad, index, inBase) => {
    const base = [...values], head = [...values];
    (inBase ? base : head)[index % values.length] = bad;
    assert.throws(() => compare(base, head, rule), RangeError);
    assert.throws(() => compare(values, values, { rel: bad, floor: 0 }), RangeError);
    assert.throws(() => compare(values, values, { rel: 0, floor: bad }), RangeError);
  }), params());
});

test('blocking: task-local excess survives large finite origins without rounded absolute endpoints', () => {
  assert.equal(blocking([[2 ** 53, 51]], 2 ** 53, 2 ** 53 + 100), 1);
  fc.assert(fc.property(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 51, max: 20000 }), fc.integer({ min: 0, max: 4 }), fc.integer({ min: 1, max: 8 }), (exponent, duration, left, span) => {
    const origin = 2 ** exponent;
    // Multiples of the origin's representable spacing remain exact after
    // translation (and are ordinary integers at small origins).
    const unit = 2 ** Math.max(0, exponent - 52), from = left * unit, to = (left + span) * unit;
    assert.equal((origin + from) - origin, from);
    assert.equal((origin + to) - origin, to);
    assert.equal(blocking([[origin, duration]], origin + from, origin + to), blocking([[0, duration]], from, to));
  }), params());
  fc.assert(fc.property(fc.integer({ min: 53, max: 1000 }), fc.integer({ min: 51, max: 100 }), (exponent, duration) => {
    const origin = 2 ** exponent, width = Math.max(128, 2 ** (exponent - 51));
    assert.equal(blocking([[origin, duration]], origin, origin + width), duration - 50);
  }), params());
});

test('median: constructed dyadic midpoints agree across normal and subnormal scales', () => {
  fc.assert(fc.property(fc.integer({ min: -1074, max: 1000 }), fc.integer({ min: -16, max: 16 }), fc.integer({ min: 0, max: 16 }), (exponent, center, distance) => {
    // Even integer coefficients make both inputs and their mean exactly
    // representable, including at the minimum subnormal quantum.
    const quantum = 2 ** exponent, a = 2 * (center - distance) * quantum, b = 2 * (center + distance) * quantum;
    assert.ok(median([a, b]) === 2 * center * quantum);
  }), params());
});

test('worstShift: a positive confirmation score counts even when every first-round score is zero', () => {
  fc.assert(fc.property(fc.array(fc.constant(0), { minLength: 1, maxLength: 20 }), fc.double({ min: Number.MIN_VALUE, max: Number.MAX_VALUE, noNaN: true }), (first, positive) => {
    assert.equal(worstShift(first, [positive]), positive);
  }), params());
  assert.equal(worstShift([0], [0.01]), 0.01);
});

test('worstShift: maximum is independent of round grouping and preserves both inputs', () => {
  const score = fc.double({ min: 0, max: Number.MAX_VALUE, noNaN: true });
  fc.assert(fc.property(fc.array(score, { minLength: 1, maxLength: 50 }), fc.nat(), (scores, cut) => {
    const split = cut % (scores.length + 1), first = scores.slice(0, split), again = scores.slice(split), before = [first.slice(), again.slice()];
    const sorted = scores.slice().sort((a, b) => a - b), expected = sorted.at(-1)!;
    assert.ok(worstShift(first, again) === expected);
    assert.ok(worstShift(again, first) === expected);
    assert.ok(worstShift(scores) === expected);
    assert.deepEqual([first, again], before);
  }), params());
  assert.equal(worstShift([], [Number.MAX_VALUE]), Number.MAX_VALUE);
  assert.equal(worstShift([0]), 0);
});

test('worstShift: invalid observations in either round reject even below an earlier maximum', () => {
  const invalid = fc.oneof(fc.constantFrom(NaN, Infinity, -Infinity), fc.double({ min: -Number.MAX_VALUE, max: -Number.MIN_VALUE, noNaN: true }));
  fc.assert(fc.property(invalid, fc.boolean(), (bad, inFirst) => {
    assert.throws(() => worstShift(inFirst ? [Number.MAX_VALUE, bad] : [Number.MAX_VALUE], inFirst ? [] : [bad]), RangeError);
  }), params());
  assert.throws(() => worstShift([], []), RangeError);
  assert.throws(() => worstShift([0], [NaN]), RangeError);
  assert.throws(() => worstShift([0], [-1]), RangeError);
});
