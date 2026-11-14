import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fc, params } from '../lib/pbt.ts';
import { skipOracle } from '../lib/oracle.ts';
import { FIRST, ROWS, bell, bellArea, binOf, boardStory, chance, pile, pileAfter, routes, routesTo, share, spread, within } from './model.ts';
import type { Turn } from './model.ts';

interface Oracle {
  python: string;
  pile: Record<string, number[]>;
  density: Record<string, number[]>;
  area: Record<string, { middle: number; edge: number; beyond: number }>;
  bent: Record<string, [number, number][]>;
}
const python = spawnSync('python3', ['-I', '-c', 'import statistics, sys; assert sys.version_info >= (3, 8)'], { encoding: 'utf8' });
const missing = python.status !== 0 && 'no python3 (3.8 or later) on PATH';
let cached: Oracle | undefined;
/** Python's answers, computed now: math.comb, fractions.Fraction and statistics.NormalDist. */
const oracle = (): Oracle => (cached ??= JSON.parse(execFileSync('python3', ['-I', fileURLToPath(new URL('./oracle/galton.py', import.meta.url))], { encoding: 'utf8' })) as Oracle);

test('the routes to each bin, counted one by one, number what Python’s math.comb says', (t) => {
  if (skipOracle(t, missing)) return;
  for (const [rows, counts] of Object.entries(oracle().pile)) assert.deepEqual(pile(Number(rows)), counts, `${rows} rows`);
});

test('the bell curve’s height and its areas are those of Python’s statistics.NormalDist', (t) => {
  if (skipOracle(t, missing)) return;
  const o = oracle();
  for (const [rows, heights] of Object.entries(o.density)) {
    const n = Number(rows);
    heights.forEach((h, i) => assert.ok(Math.abs(bell(n, (i - 4) / 4) - h) < 1e-12, `${rows} rows at ${(i - 4) / 4}`));
  }
  for (const [rows, a] of Object.entries(o.area)) {
    const n = Number(rows), sd = spread(n).sd;
    assert.ok(Math.abs(bellArea(n, n / 2 - 1.5, n / 2 + 1.5) - a.middle) < 1e-9, `${rows} rows, the middle`);
    assert.ok(Math.abs(bellArea(n, -0.5, 0.5) - a.edge) < 1e-9, `${rows} rows, an edge bin`);
    assert.ok(Math.abs(bellArea(n, n + 0.5, n + 0.5 + 12 * sd) - a.beyond) < 1e-9, `${rows} rows, beyond the last bin`);
  }
});

test('at a bent peg a bin’s chance is the sum of its routes’ chances, as Python’s exact fractions give it', (t) => {
  if (skipOracle(t, missing)) return;
  for (const [rows, bins] of Object.entries(oracle().bent))
    bins.forEach(([num, den], bin) => assert.ok(Math.abs(chance(Number(rows), bin, 0.75) - num / den) < 1e-12, `${rows} rows, bin ${bin}`));
});

const rowsArb = fc.integer({ min: 0, max: 10 });

test('every route is listed once, and its bin is how many times it went right', () => {
  fc.assert(fc.property(rowsArb, (rows) => {
    const all = routes(rows);
    assert.equal(all.length, 2 ** rows);
    assert.equal(new Set(all.map((r) => r.join(''))).size, 2 ** rows);
    for (const r of all) {
      assert.equal(r.length, rows);
      assert.equal(binOf(r), r.join('').split('R').length - 1);
    }
    // One ball down every route: the pile holds them all.
    assert.equal(pile(rows).reduce((a, b) => a + b, 0), 2 ** rows);
  }), params(50));
});

test('more routes lead to the middle bins than to the edges', () => {
  fc.assert(fc.property(fc.integer({ min: 2, max: 12 }), (rows) => {
    const counts = pile(rows), half = Math.floor(rows / 2);
    // From an edge to the middle each bin holds more than the one before, and the pile is its own mirror image.
    for (let k = 1; k <= half; k++) assert.ok(counts[k]! > counts[k - 1]!, `${rows} rows, bin ${k}`);
    assert.deepEqual([...counts].reverse(), counts);
    assert.equal(counts[0], 1);
  }), params(50));
});

test('a bin’s routes are the ways to place its rights among the pegs: moving one right a peg later gives another route to the same bin', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), fc.nat(), (rows, pick) => {
    const all = routes(rows), route = all[pick % all.length]!, bin = binOf(route);
    const to = routesTo(rows, bin).map((r) => r.join(''));
    assert.ok(to.includes(route.join('')));
    const i = route.findIndex((t, j) => t === 'R' && route[j + 1] === 'L');
    if (i >= 0) {
      const swapped = [...route];
      [swapped[i], swapped[i + 1]] = ['L', 'R'];
      assert.ok(to.includes(swapped.join('')));
    }
  }), params(200));
});

test('at fair pegs a bin’s chance is its share of the routes, and the chances of all bins add up to 1 at any peg', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), fc.double({ min: 0, max: 1, noNaN: true }), (rows, right) => {
    const counts = pile(rows);
    let sum = 0;
    for (let bin = 0; bin <= rows; bin++) {
      assert.ok(Math.abs(chance(rows, bin) - counts[bin]! / 2 ** rows) < 1e-12);
      sum += chance(rows, bin, right);
    }
    assert.ok(Math.abs(sum - 1) < 1e-9);
    assert.ok(Math.abs(share(rows, 0, rows) - 1) < 1e-12);
  }), params(100));
});

test('the pile fills as balls drop, one route at a time, and ends as the whole pile', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 8 }), fc.nat(), (rows, n) => {
    const total = 2 ** rows, dropped = n % (total + 1), now = pileAfter(rows, dropped);
    assert.equal(now.reduce((a, b) => a + b, 0), dropped);
    pile(rows).forEach((count, bin) => assert.ok(now[bin]! <= count));
    assert.deepEqual(pileAfter(rows, total), pile(rows));
  }), params(100));
});

test('the board the page shows: six rows, 64 routes, 20 to the middle bin and one to each edge', () => {
  const m = boardStory();
  assert.equal(ROWS, 6);
  assert.deepEqual(m.counts, [1, 6, 15, 20, 15, 6, 1]);
  assert.equal(m.total, 64);
  assert.equal(m.most, 3);
  // The first ball goes right three times, so it lands in the middle bin.
  assert.equal(binOf(FIRST), 3);
  assert.equal(FIRST.length, ROWS);
  // Bins 2 to 4 are within one standard deviation (1.22 bins) of the middle; they hold 50 of the 64.
  assert.deepEqual(within(6), { lo: 2, hi: 4 });
  assert.equal(m.middle, 50);
  assert.equal(m.exact, 50 / 64);
  // The curve over the same three bins is within a quarter of a percentage point of the count.
  assert.ok(Math.abs(m.curve - m.exact) < 0.0025);
  // The curve's error: weight where the board has no bin, and an edge bin given more than its one route.
  assert.ok(m.beyond > 0.002 && m.beyond < 0.0022);
  assert.ok(m.edgeCurve > m.edgeExact);
});

test('the check answers’ cases: four rows, a route’s bin, and pegs bent three to one', () => {
  assert.deepEqual(pile(4), [1, 4, 6, 4, 1]);
  const route: Turn[] = ['L', 'R', 'R', 'L', 'R', 'L'];
  assert.equal(binOf(route), 3);
  assert.equal(routesTo(6, 3).length - 1, 19);
  const bent = Array.from({ length: 7 }, (_, bin) => chance(6, bin, 0.75));
  assert.equal(bent.indexOf(Math.max(...bent)), 5);
  assert.equal((bent[5]! * 100).toFixed(1), '35.6');
  assert.equal((bent[3]! * 100).toFixed(1), '13.2');
});
