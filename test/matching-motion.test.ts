// TransformMatchingText through the motion verifier: a Text is one unit to
// MotionSink, its box the union of every glyph (faded ones too), so a glyph
// waiting or fading outside its line would make the line's extent jump.
//
// MotionSink is a heuristic over sampled line boxes. Staggered, continuous glyph
// movement can hand an edge to another glyph and trigger its spike thresholds;
// lagRatio <= 0.2 is not a universal guarantee that it will stay quiet. Generated
// cases therefore pin authored glyph interpolation and exact endpoints directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Code, VMobject, TransformMatchingText } from '../src/index.ts';
import { StringSink, renderFrame } from '../src/output.ts';
import { SnapshotSink } from '../src/svg.ts';
import { MotionSink, analyzeMotion, loadFonts } from '../explain/testing.ts';
import type { Mobject, Vec } from '../src/index.ts';
import { fc, params } from './lib/pbt.ts';

Scene.captionWpm = Infinity;
await loadFonts();

interface Morph { a: string; b: string; size: number; move: Vec; lag: number; font: 'sans' | 'mono' }

const sceneOf = ({ a, b, size, move, lag, font }: Morph) => class extends Scene {
  override async construct() {
    await this.step('s');
    const src = new Text(a, { font }).shift([-2, 1]);
    this.add(src);
    await this.play(new TransformMatchingText(src, new Text(b, { font, fontSize: size }).shift(move), { lagRatio: lag }), { runTime: 1 });
    await this.wait(0.2);
  }
};

async function jumps(m: Morph): Promise<string[]> {
  const sink = new MotionSink();
  await new (sceneOf(m))(sink).run();
  return analyzeMotion(sink).map((e) => `${e.kind} @${e.frame}: ${e.what} ${e.detail}`);
}

test('the cases the verifier caught: a removed glyph past the end, a lagged morph that moves and grows', async () => {
  for (const m of [
    { a: 'c a', b: 'c', size: 0.4, move: [0, 0], lag: 0, font: 'mono' },
    { a: 'c a', b: 'c', size: 0.6, move: [1, -1], lag: 0, font: 'sans' },
    { a: '(x(a', b: ' ccbx c', size: 0.4, move: [3, -2], lag: 0.44, font: 'mono' },
    { a: '(x(a', b: ' ccbx c', size: 0.6, move: [1, -1], lag: 0.44, font: 'sans' },
  ] as Morph[]) assert.deepEqual(await jumps(m), [], JSON.stringify(m));
});

const word = fc.stringMatching(/^[abcx( ]{0,8}$/);
const morph: fc.Arbitrary<Morph> = fc.record({
  a: word, b: word,
  size: fc.double({ min: 0.25, max: 0.7, noNaN: true }),
  move: fc.tuple(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -2, max: 2, noNaN: true })),
  lag: fc.oneof(fc.constant(0), fc.double({ min: 0, max: 0.2, noNaN: true })),
  font: fc.constantFrom('sans' as const, 'mono' as const),
});

const visibleParts = (m: Mobject) => m.family().filter((p) => p instanceof VMobject && p.hasPoints() && p.style.opacity > 0);
const pointSnapshot = (m: Mobject) => m.pointArrays().map((a) => Array.from(a));
const geometry = (m: Mobject) => visibleParts(m).map(pointSnapshot).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

/** Public pairs select the correspondence; authored snapshots own its geometry.
 * Pair selection itself is independently held to its contracts in matching.test.ts.
 */
function assertMorphInterpolation({ a, b, size, move, lag, font }: Morph): void {
  const src = new Text(a, { font }).shift([-2, 1]);
  const target = new Text(b, { font, fontSize: size }).shift(move);
  const before = new Map(visibleParts(src).map((p) => [p, pointSnapshot(p)]));
  const after = new Map(visibleParts(target).map((p) => [p, pointSnapshot(p)]));
  const sourceOpacity = new Map([...before.keys()].map((p) => [p, p.style.opacity]));
  const targetOpacity = new Map([...after.keys()].map((p) => [p, p.style.opacity]));
  const sourceGeometry = geometry(src), targetGeometry = geometry(target), targetFrame = pointSnapshot(target);
  const animation = new TransformMatchingText(src, target, { lagRatio: lag });
  animation.begin();
  const sourcePartition = [...animation.pairs.map(([s]) => s), ...animation.removed];
  const targetPartition = [...animation.pairs.map(([, t]) => t), ...animation.added];
  assert.equal(animation.morphed.length, 0);
  assert.equal(new Set(sourcePartition).size, sourcePartition.length);
  assert.equal(new Set(targetPartition).size, targetPartition.length);
  assert.deepEqual(new Set(sourcePartition), new Set(before.keys()));
  assert.deepEqual(new Set(targetPartition), new Set(after.keys()));
  const slots = animation.pairs.length + animation.removed.length + animation.added.length;
  const slotDuration = 1 / (1 + (slots - 1) * lag);
  assert.equal(animation.fadesIn.length, animation.added.length);
  const phase = (alpha: number, slot: number) => alpha === 1 ? 1 : Math.max(0, Math.min(1, (alpha - slot * lag * slotDuration) / slotDuration));
  const check = (alpha: number) => {
    animation.pairs.forEach(([part, targetPart], i) => {
      const from = before.get(part)!, to = after.get(targetPart)!, actual = pointSnapshot(part);
      const local = phase(alpha, i);
      assert.equal(part.style.opacity, sourceOpacity.get(part), 'matched glyph opacity stays authored');
      assert.equal(actual.length, from.length);
      actual.forEach((points, path) => {
        assert.equal(points.length, from[path]!.length);
        points.forEach((value, j) => {
          const x = from[path]![j]!, y = to[path]![j]!;
          const expected = local === 0 ? x : local === 1 ? y : x * (1 - local) + y * local;
          // One Float32 unit of roundoff at the authored coordinate scale,
          // plus IEEE error for equivalent scheduling/polynomial arithmetic.
          const scale = Math.max(1, Math.abs(x), Math.abs(y));
          const budget = 2 ** -23 * scale + 128 * Number.EPSILON * Math.max(1, slots) * scale;
          assert.ok(Math.abs(value - expected) <= budget, `pair ${i}, alpha ${alpha}, point ${path}:${j}: ${value} vs ${expected}`);
          if (alpha === 0 || alpha === 1) assert.equal(value, expected, 'matched endpoints are exact authored coordinates');
        });
      });
    });
    const opacity = (actual: number, authored: number, local: number, out: boolean) => {
      const expected = authored * (out ? 1 - local : local);
      const budget = 128 * Number.EPSILON * Math.max(1, slots) * Math.max(1, authored);
      assert.ok(Math.abs(actual - expected) <= budget, `fade opacity at alpha ${alpha}: ${actual} vs ${expected}`);
      if (alpha === 0 || alpha === 1) assert.equal(actual, expected, 'fade endpoint opacity is exact');
    };
    animation.removed.forEach((part, i) => opacity(part.style.opacity, sourceOpacity.get(part)!, phase(alpha, animation.pairs.length + i), true));
    animation.added.forEach((part, i) => {
      // Read the public added copy only as the observed object. Expected phase
      // and opacity come from the authored target and documented slot order.
      const actual = animation.fadesIn[i]!.sub.style.opacity;
      opacity(actual, targetOpacity.get(part)!, phase(alpha, animation.pairs.length + animation.removed.length + i), false);
    });
  };
  // Actual default-rate frame samples, independently evaluated as quintic
  // smoothstep; do not call production subAlpha or inspect its internal rows.
  for (let k = 0; k <= 30; k++) {
    const time = k / 30, expectedAlpha = 6 * time ** 5 - 15 * time ** 4 + 10 * time ** 3;
    animation.interpolate(animation.rateFunc(time));
    check(expectedAlpha);
  }
  // Every matched or fading part's waiting/active/finished boundaries, including
  // adjacent alphas, are observed independently of the 30fps sample grid.
  for (let i = 0; i < slots; i++) for (const boundary of [i * lag * slotDuration, i * lag * slotDuration + slotDuration]) {
    for (const offset of [-8 * Number.EPSILON, 0, 8 * Number.EPSILON]) {
      const alpha = Math.max(0, Math.min(1, boundary + offset));
      animation.interpolate(alpha); check(alpha);
    }
  }
  animation.interpolate(0);
  assert.deepEqual(geometry(src), sourceGeometry, 'added glyphs are invisible at the exact authored source endpoint');
  animation.interpolate(1);
  assert.deepEqual(geometry(src), targetGeometry, 'matched and added glyphs reach the entire authored target; removals are invisible');
  assert.deepEqual(pointSnapshot(src), targetFrame, 'the line advance frame reaches the exact authored target');
  assert.deepEqual(geometry(target), targetGeometry, 'target geometry is never modified');
}

test('property: text morph frames and stagger boundaries follow authored glyph interpolation', () => {
  fc.assert(fc.property(morph, assertMorphInterpolation), params(300));
});

test('continuous matched glyphs preserve their law when the line-box motion heuristic reports a spike', () => {
  // FULL found this smooth edge handoff at frame 8. The diagnostic warning is
  // recorded in merge32-motion-triage.md, not required as permanent behavior.
  assertMorphInterpolation({ a: '(ab', b: 'xab', size: 0.25, move: [2.5, 0], lag: 0.2, font: 'sans' });
});

test('seeking into a lagged text morph renders the frame a full run renders', async () => {
  const S = sceneOf({ a: '(x(a', b: ' ccbx c', size: 0.6, move: [1, -1], lag: 0.44, font: 'sans' });
  const full = new StringSink();
  await new S(full).run();
  for (const k of [0, 1, 5, 12, 18, 24, 30, 31, full.frames.length - 1]) {
    const snap = new SnapshotSink();
    await renderFrame(S, k, snap);
    assert.equal(snap.svg, full.frames[k], `frame ${k}`);
  }
});

test('a Code block morphs without jumps too', async () => {
  for (const [a, b] of [[['c a'], ['c']], [['let total = 0;', 'return total;'], ['let t = 0;', 'return t;']]]) {
    const S = class extends Scene {
      override async construct() {
        const src = new Code(a!);
        this.add(src);
        await this.play(new TransformMatchingText(src, new Code(b!).scale(1.3).shift([0.5, -0.5]), { lagRatio: 0.2 }), { runTime: 1 });
        await this.wait(0.2);
      }
    };
    const sink = new MotionSink();
    await new S(sink).run();
    assert.deepEqual(analyzeMotion(sink).map((e) => `${e.kind} @${e.frame}: ${e.what} ${e.detail}`), [], JSON.stringify(a));
  }
});


test('property: text morph replay agrees across lag ratios up to one', async () => {
  const broadLag = fc.tuple(morph, fc.double({ min: 0, max: 1, noNaN: true }), fc.integer({ min: 0, max: 36 }));
  await fc.assert(fc.asyncProperty(broadLag, async ([m, lag, k]) => {
    const S = sceneOf({ ...m, lag });
    const full = new StringSink();
    await new S(full).run();
    const snap = new SnapshotSink();
    await renderFrame(S, k, snap);
    assert.equal(snap.svg, full.frames[k], `lag ${lag}, frame ${k}`);
  }), params(100));
});
