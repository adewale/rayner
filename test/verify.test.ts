import { test } from 'node:test';
import type { MoveAlongPathOpts } from '../src/extras.ts';
import { MoveAlongPath } from '../src/extras.ts';
import assert from 'node:assert/strict';
import { Scene, Rectangle, Circle, FadeIn, FadeOut, Transform, Create, Line, linear, thereAndBack } from '../src/index.ts';
import { MotionSink, analyzeMotion } from '../explain/testing.ts';
import type { Vec } from '../src/index.ts';
// Manim's values, which the package no longer exports.
const RIGHT: Vec = [1, 0];

const run = async (body: (s: Scene) => Promise<void>): Promise<string[]> => {
  const sink = new MotionSink();
  const s = new Scene(sink, { fps: 30 });
  s.construct = async function (this: Scene) { await body(this); };
  await s.run();
  return analyzeMotion(sink).map((e) => e.kind);
};

test('quiet on smooth motion: shifts, fades, morphs, draw-ins, fast linear moves', async () => {
  assert.deepEqual(await run(async (s) => {
    const r = new Rectangle();
    await s.play(new FadeIn(r));
    await s.play(r.animate.shift([5, 0]), { runTime: 0.5 });          // fast but smooth
    await s.play(r.animate.shift([-5, 0]), { runTime: 0.5, rateFunc: linear });
    await s.play(new Transform(r, new Circle({ radius: 1 }).shift([1, 1])));
    await s.play(new Create(new Line([-3, 2], [3, 2])));
    await s.play(new FadeOut(r));
  }), []);
});

test('flags a teleport between plays', async () => {
  const kinds = await run(async (s) => {
    const r = new Rectangle(); await s.play(new FadeIn(r));
    r.shift([3, 0]);                                   // no animation: jumps on the next frame
    await s.wait(0.3);
  });
  assert.deepEqual(kinds, ['teleport']);
});

test('MoveAlongPath from off the path: snapping is a teleport, the default blends in', async () => {
  const ride = (opts: MoveAlongPathOpts) => run(async (s) => {
    const r = new Rectangle({ width: 0.5, height: 0.5 }); await s.play(new FadeIn(r));
    await s.play(new MoveAlongPath(r, new Line([4, 2], [6, 2]), opts));  // path starts far from r
  });
  assert.ok((await ride({ fromCurrent: false })).includes('teleport'), 'manim-style snap is flagged');
  assert.deepEqual(await ride({}), [], 'default starts where the mobject is');
});

test('flags hard cuts: a mobject added or removed while opaque', async () => {
  const kinds = await run(async (s) => {
    const r = new Rectangle(); await s.play(new FadeIn(r));
    s.add(new Circle()); await s.wait(0.2);            // cut-in
    s.remove(r); await s.wait(0.2);                    // cut-out
  });
  assert.deepEqual(kinds, ['cut-in', 'cut-out']);
});

test('a ReplacementTransform onto a matching target is a seamless handoff', async () => {
  const kinds = await run(async (s) => {
    const a = new Rectangle(); await s.play(new FadeIn(a));
    await s.play(new Transform(a, new Rectangle().shift(RIGHT), { replace: true }));
    await s.wait(0.2);
  });
  assert.deepEqual(kinds, []);
});

test('thin shapes hand off cleanly (zero-height boxes)', async () => {
  const kinds = await run(async (s) => {
    const l = new Line([-3, 0], [3, 0]); await s.play(new Create(l));
    await s.play(new Transform(l, new Line([-3, 0], [2, 0]), { replace: true }));
    await s.wait(0.2);
  });
  assert.deepEqual(kinds, []);
});

test('a left-anchored counter changing digit count is not a resize', async () => {
  const { DecimalNumber } = await import('../src/index.ts');
  const kinds = await run(async (s) => {
    const n = new DecimalNumber(10, { decimals: 1, anchor: 'start' }); await s.play(new FadeIn(n));
    await s.play(new Transform(n, n.copy().setValue(9)), { runTime: 0.3 });
  });
  assert.deepEqual(kinds, []);
});

// Each kind the verifier reports, seeded once into an otherwise smooth scene: the explain
// check's motion gate fails a scenario on any of them, so each must actually be reported.
const seeded: Array<[string, (s: Scene) => Promise<void>, string[]]> = [
  ['an opacity jump with no fade is a pop', async (s) => { const r = new Rectangle(); await s.play(new FadeIn(r)); r.setOpacity(0.3); await s.wait(0.2); }, ['pop']],
  ['a size jump between plays is a resize', async (s) => { const r = new Rectangle(); await s.play(new FadeIn(r)); r.scale(2); await s.wait(0.3); }, ['resize']],
  ['gone for one frame and back is a flicker', async (s) => { const r = new Rectangle(); await s.play(new FadeIn(r)); s.remove(r); await s.wait(1 / 30); s.add(r); await s.wait(0.2); }, ['flicker', 'cut-in']],
  ['a replacement that lands somewhere else is a handoff', async (s) => {
    const a = new Rectangle({ width: 2, height: 2 }); await s.play(new FadeIn(a));
    await s.play(new Transform(a, new Rectangle({ width: 2, height: 2 }).shift([1, 0]), { replace: true, rateFunc: thereAndBack }));
    await s.wait(0.2);
  }, ['handoff']],
];
for (const [name, body, kinds] of seeded) test(`flags it: ${name}`, async () => assert.deepEqual(await run(body), kinds));

test('MotionSink keeps one sample per drawn leaf and frame in columns, and analyses them as sampled', async () => {
  const sink = new MotionSink();
  const s = new Scene(sink, { fps: 30 });
  let shapes = 0;
  s.construct = async function (this: Scene) {
    const many = Array.from({ length: 40 }, (_, i) => new Rectangle({ width: 0.2, height: 0.2 }).shift([i * 0.3 - 6, 0]));
    shapes = many.length;
    this.add(...many);
    await this.wait(1);
    many[3]!.shift([4, 0]);                             // no animation: a teleport on the next frame
    await this.wait(0.2);
  };
  await s.run();
  const F = sink.frames;
  // Columns, not an object per leaf: 40 samples a frame, each a few numbers.
  // The scene's first frame is drawn before construct adds anything; every later one holds the 40.
  const counts = Array.from({ length: F.length }, (_, f) => F.leaves(f).size);
  assert.deepEqual(counts, [0, ...Array(F.length - 1).fill(shapes)]);
  assert.equal(F.size, shapes * (F.length - 1));
  assert.ok(F.box instanceof Float64Array && F.alpha instanceof Float64Array && F.id instanceof Int32Array);
  const events = analyzeMotion(sink);
  assert.deepEqual(events.map((e) => e.kind), ['teleport']);
  assert.equal(events[0]!.what, 'a Rectangle');
  assert.ok(Math.abs(events[0]!.t - 1) < 0.05, `the teleport is when the shape moved, not at ${events[0]!.t}`);
});
