// Differential tests against manim itself. test/manim-oracle.json holds manim's own
// answers, computed by tools/oracle/manim_math.py from the pinned checkout it names
// (manim's functions are extracted from its source, not retyped), so these run
// everywhere without Python. With MANIM_DIR=<checkout of 3b1b/manim> (and python3 +
// numpy) the fixture is also checked against the live oracle; UPDATE_ORACLE=1 rewrites it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { VMobject, Rectangle, Circle, Polygon, linear, smooth, rushInto, rushFrom, thereAndBack } from '../src/index.ts';
import type { Vec } from '../src/index.ts';

interface Answers { rates: Record<string, number[]>; distribute: number[][]; partial: Array<Array<[number, number]>>; same_shape: boolean[][] }
interface Fixture {
  manim: string;
  request: { rates: number[]; distribute: Array<{ lengths: number[]; n: number }>; partial: Array<{ points: Vec[]; a: number; b: number }>; same_shape: Vec[][] };
  answers: Answers;
}
const file = new URL('./manim-oracle.json', import.meta.url);
const { request, answers, manim } = JSON.parse(readFileSync(file, 'utf8')) as Fixture;

/**
 * The shapes the same_shape request was made from, in its order. The request holds
 * their points (every subpath's, as one array: what manim's get_all_points reads).
 */
function sameShapeCases(): Array<[string, VMobject]> {
  const polyline = (pts: Vec[]) => { const v = new VMobject().startNewPath(pts[0]!); for (const p of pts.slice(1)) v.addLineTo(p); return v; };
  // Float32 noise: the same square after a chain of moves and scales
  const mapped = new Rectangle({ width: 2, height: 2 });
  for (let i = 0; i < 5; i++) mapped.shift([1.37, -0.71]).scale(1.3);
  return [
    ['square', new Rectangle({ width: 2, height: 2 })],
    ['square, moved and scaled', new Rectangle({ width: 3, height: 3 }).shift([4, -1])],
    ['square, after five maps', mapped],
    ['square, drawn from another corner', new Rectangle({ width: 2, height: 2 }).rotate(Math.PI / 2)],
    ['rectangle 2:1', new Rectangle({ width: 2, height: 1 })],
    ['rectangle 1:2', new Rectangle({ width: 1, height: 2 })],
    ['circle', new Circle({ radius: 1 })],
    ['circle, moved and scaled', new Circle({ radius: 0.3 }).shift([-5, 2])],
    ['triangle', new Polygon([[0, 0], [2, 0], [0.5, 1.5]])],
    ['triangle, mirrored', new Polygon([[0, 0], [-2, 0], [-0.5, 1.5]])],
    ['open polyline', polyline([[0, 0], [1, 1], [2, 0.5]])],
    ['open polyline, moved and scaled', polyline([[0, 0], [1, 1], [2, 0.5]]).scale(2.5).shift([-1, -3])],
  ];
}
const allPoints = (m: VMobject): Vec[] => m.subpaths.flatMap((a) => Array.from({ length: a.length / 2 }, (_, i): Vec => [a[2 * i]!, a[2 * i + 1]!]));

test('the frozen answers are what manim answers now', { skip: process.env.MANIM_DIR ? false : 'set MANIM_DIR to a checkout of 3b1b/manim' }, () => {
  const update = process.env.UPDATE_ORACLE === '1';
  // The same_shape request is our shapes' points, so a refresh asks about the shapes as they are now
  const ask = update ? { ...request, same_shape: sameShapeCases().map(([, m]) => allPoints(m)) } : request;
  const live = JSON.parse(execFileSync('python3', ['-I', new URL('../tools/oracle/manim_math.py', import.meta.url).pathname], { input: JSON.stringify(ask), encoding: 'utf8' })) as Answers;
  if (update) writeFileSync(file, JSON.stringify({ manim, request: ask, answers: live }) + '\n');
  assert.deepEqual(live, answers);
});

test("rate functions equal manim's to 1e-12", () => {
  const ours = { linear, smooth, rush_into: rushInto, rush_from: rushFrom, there_and_back: thereAndBack };
  for (const [name, f] of Object.entries(ours)) {
    request.rates.forEach((t, i) => assert.ok(Math.abs(f(t) - answers.rates[name]![i]!) < 1e-12, `${name}(${t}): ${f(t)} vs manim ${answers.rates[name]![i]!}`));
  }
});

test('extra curves are distributed across a path the way manim distributes them', () => {
  // The rule picks the n largest values of L / j over all curves and piece counts. When
  // the n-th and (n+1)-th largest tie, either choice is correct and manim's argpartition
  // picks arbitrarily, so a tie is checked on the objective (the longest piece left)
  // and everything else exactly.
  const longestPiece = (lengths: number[], counts: number[]): number => Math.max(...lengths.map((l, c) => l / counts[c]!));
  const ambiguous = (lengths: number[], n: number): boolean => {
    const vals = lengths.flatMap((l) => Array.from({ length: n }, (_, j) => l / (j + 1))).sort((a, b) => b - a);
    return Math.abs(vals[n - 1]! - vals[n]!) < 1e-12;
  };
  request.distribute.forEach(({ lengths, n }, i) => {
    // A straight path along x with curves of these lengths; count the pieces each curve became
    const xs = lengths.reduce((acc, l) => [...acc, acc.at(-1)! + l], [0]);
    const p = new VMobject();
    p.startNewPath([0, 0]);
    for (const x of xs.slice(1)) p.addLineTo([x, 0]);
    p.insertNCurves(0, n);
    const ours = lengths.map(() => 0);
    for (let c = 0; c < p.numCurves(); c++) {
      const a = p.pointOnCurve(0, c, 0)[0], b = p.pointOnCurve(0, c, 1)[0], mid = (a + b) / 2;
      // A zero-length piece belongs to the zero-length curve at its point; any other lies inside its curve
      const k = Math.abs(b - a) < 1e-9 ? lengths.findIndex((l, j) => l === 0 && Math.abs(xs[j]! - a) < 1e-6) : lengths.findIndex((_, j) => mid > xs[j]! && mid < xs[j + 1]!);
      ours[k]!++;
    }
    const theirs = answers.distribute[i]!;
    assert.equal(ours.reduce((a, b) => a + b, 0), lengths.length + n);
    if (ambiguous(lengths, n)) {
      assert.ok(Math.abs(longestPiece(lengths, ours) - longestPiece(lengths, theirs)) < 1e-9, `lengths ${lengths} n=${n}: ${ours} vs manim ${theirs}`);
    } else assert.deepEqual(ours, theirs, `lengths ${lengths} n=${n}`);
  });
});

test("splitting a cubic matches manim's partial_bezier_points piece by piece", () => {
  const parts = request.partial.length, P = request.partial[0]!.points;
  const p = new VMobject();
  p.startNewPath(P[0]!);
  p.addCubic(P[1]!, P[2]!, P[3]!);
  p.insertNCurves(0, parts - 1);
  const split = p.subpaths[0]!;
  for (let j = 0; j < parts; j++) {
    for (let q = 0; q < 4; q++) {
      const x = split[6 * j + 2 * q]!, y = split[6 * j + 2 * q + 1]!, m = answers.partial[j]![q]!;
      assert.ok(Math.abs(x - m[0]) < 1e-5 && Math.abs(y - m[1]) < 1e-5, `piece ${j} point ${q}: (${x}, ${y}) vs manim (${m})`);
    }
  }
});

test("shapeKey() groups shapes as manim's TransformMatchingShapes does (Mobject.has_same_shape_as)", () => {
  const cases = sameShapeCases(), same = answers.same_shape;
  assert.equal(request.same_shape.length, cases.length);
  cases.forEach(([name, m], i) => assert.deepEqual(allPoints(m), request.same_shape[i], `${name}: the shape's points are the ones manim was asked about (UPDATE_ORACLE=1 refreshes them)`));
  cases.forEach(([a, ma], i) => cases.forEach(([b, mb], j) => {
    const manim = same[i]![j]!;
    assert.equal(manim, same[j]![i]!, `manim's relation is symmetric here: ${a} / ${b}`);
    assert.equal(ma.shapeKey() === mb.shapeKey(), manim, `${a} / ${b}: manim says ${manim ? 'same' : 'different'}`);
  }));
  // Not vacuous: some pairs are the same shape and some are not
  const yes = same.flat().filter(Boolean).length;
  assert.ok(yes > cases.length && yes < cases.length ** 2, `${yes} of ${cases.length ** 2} pairs`);
});
