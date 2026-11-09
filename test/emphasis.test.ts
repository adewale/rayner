// Emphasis that stays: shape matchers, braces and Circumscribe. Geometry is
// checked against the target's box; motion against the verifier; time against
// a seek, which must reproduce a full run's frame byte for byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Rectangle, Text, Code, Create, FadeOut, Circumscribe, SurroundingRectangle, Cross, Brace, BraceLabel, VMobject, Line } from '../src/index.ts';
import { StringSink, SnapshotSink, renderFrame } from '../src/output.ts';
import { MotionSink, analyzeMotion, loadFonts } from '../explain/testing.ts';
import type { Box, Mobject, Vec } from '../src/index.ts';

/** A line 0.1 under `m`'s box, left to right. */
const underline = (m: Mobject) => { const [x0, y0, x1] = m.box()!; return new Line([x0, y0 - 0.1], [x1, y0 - 0.1]); };
// Manim's values, which the package no longer exports.
const DOWN: Vec = [0, -1];
const LEFT: Vec = [-1, 0];
const RIGHT: Vec = [1, 0];
const UP: Vec = [0, 1];

await loadFonts();
// Caption holds are thousands of identical frames; the hold rule has its own test
Scene.captionWpm = Infinity;

const near = (a: number, b: number, msg: string, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
const nearVec = (a: Readonly<Vec>, b: Readonly<Vec>, msg: string, eps = 1e-5) => { near(a[0], b[0], `${msg} x`, eps); near(a[1], b[1], `${msg} y`, eps); };
const nearBox = (a: Box, b: Box, msg: string) => a.forEach((v, i) => near(v, b[i]!, `${msg}[${i}]`));
const grow = (b: Box, k: number): Box => [b[0] - k, b[1] - k, b[2] + k, b[3] + k];
const ends = (m: VMobject, i = 0): [Vec, Vec] => { const a = m.subpaths[i]!; return [[a[0]!, a[1]!], [a[a.length - 2]!, a[a.length - 1]!]]; };

test('SurroundingRectangle is the target box grown by buff, for a mobject or a Box', () => {
  const t = new Text('emphasis', { fontSize: 0.4 }).shift([1.3, -0.7]);
  const r = new SurroundingRectangle(t);
  nearBox(r.box()!, grow(t.box()!, 0.15), 'default buff');
  assert.equal(r.style.stroke, '#0969da', 'the neutral emphasis colour'); assert.deepEqual(r.defaultColors, { stroke: 'emphasis' }, "which becomes the scene's emphasis colour"); assert.equal(r.style.fill, 'none');
  nearBox(new SurroundingRectangle(t, { buff: 0.4, cornerRadius: 0.1 }).box()!, grow(t.box()!, 0.4), 'rounded, buff 0.4');
  const box: Box = [-2, 1, 3, 1.5];
  nearBox(new SurroundingRectangle(box, { buff: 0 }).box()!, box, 'a Box target');
  // A snapshot: moving the target later leaves it where it was
  const before = r.box()!.slice() as Box; t.shift([2, 0]);
  nearBox(r.box()!, before, 'snapshot');
  const c = r.copy();
  assert.ok(c instanceof SurroundingRectangle); nearBox(c.box()!, before, 'copy');
});

test('Cross diagonals span the box corners; scale shrinks them about the center', () => {
  const sq = new Rectangle({ width: 2, height: 2 }).shift([1, 1]);   // box [0, 0, 2, 2]
  const x = new Cross(sq);
  assert.equal(x.subpaths.length, 2); assert.deepEqual(x.defaultColors, { stroke: 'bad' }, "the scene's colour for rejected");
  const [a0, a1] = ends(x, 0), [b0, b1] = ends(x, 1);
  nearVec(a0, [0, 2], 'UL'); nearVec(a1, [2, 0], 'DR'); nearVec(b0, [2, 2], 'UR'); nearVec(b1, [0, 0], 'DL');
  nearBox(new Cross([0, 0, 2, 2], { scale: 0.5 }).box()!, [0.5, 0.5, 1.5, 1.5], 'scaled');
});

test('Brace tip: middle of the chosen edge, buff + depth out, in all four directions', () => {
  const b: Box = [-1, -0.5, 2, 1.5];   // center (0.5, 0.5)
  // [direction, tip, first end, last end]: the ends sit on the edge, buff out, spanning it.
  // Built pointing DOWN from left to right, then turned, so the ends' order turns too.
  const cases: Array<[Vec, Vec, Vec, Vec]> = [
    [DOWN, [0.5, -0.8], [-1, -0.6], [2, -0.6]],
    [UP, [0.5, 1.8], [2, 1.6], [-1, 1.6]],
    [LEFT, [-1.3, 0.5], [-1.1, 1.5], [-1.1, -0.5]],
    [RIGHT, [2.3, 0.5], [2.1, -0.5], [2.1, 1.5]],
  ];
  for (const [dir, tip, first, last] of cases) {
    const br = new Brace(b, dir);
    nearVec(br.tip(), tip, `tip ${dir}`);
    assert.deepEqual(br.direction(), dir, `direction ${dir}`);
    const [p, q] = ends(br);
    nearVec(p, first, `first end ${dir}`); nearVec(q, last, `last end ${dir}`);
  }
  nearVec(new Brace(b, DOWN, { buff: 0.3, depth: 0.5 }).tip(), [0.5, -0.5 - 0.3 - 0.5], 'buff and depth');
});

test('a vertical brace is the horizontal one, rotated', () => {
  const down = new Brace([-1, -0.5, 1, 0.5], DOWN);
  const right = new Brace([-0.5, -1, 0.5, 1], RIGHT);
  down.rotate(Math.PI / 2, { aboutPoint: [0, 0] });
  assert.equal(down.subpaths[0]!.length, right.subpaths[0]!.length);
  const a = down.subpaths[0]!, b = right.subpaths[0]!;
  for (let i = 0; i < a.length; i++) near(a[i]!, b[i]!, `point ${i >> 1} ${i & 1 ? 'y' : 'x'}`);
});

test('Brace: tip and direction follow the points through copies and moves; short braces stay well formed', () => {
  const br = new Brace(new Rectangle({ width: 1, height: 1 }), DOWN);
  const c = br.copy().shift([3, 1]);
  nearVec(c.tip(), [3, -0.5 - 0.3 + 1], 'copied, shifted tip');
  nearVec(br.tip(), [0, -0.8], 'original untouched');
  c.rotate(Math.PI, { aboutPoint: c.tip() });
  assert.deepEqual(c.direction(), [0, 1], 'turned over: points up');
  // Narrower than its curls: they shrink so the straight runs never reverse
  const a = new Brace([0, 0, 0.1, 0.1], DOWN).subpaths[0]!;
  for (let i = 6; i < a.length; i += 6) assert.ok(a[i]! >= a[i - 6]! - 1e-6, `anchor ${i / 6} is not left of the one before`);
});

test('BraceLabel puts its label beyond the tip; parts read by index on copies', () => {
  const t = new Text('payload', { fontSize: 0.4 });
  const bl = new BraceLabel(t, '7 bytes', DOWN, { fontSize: 0.25 });
  const tip = bl.brace.tip();
  near(bl.label.top()[1], tip[1] - 0.15, 'below the tip by labelBuff');
  near(bl.label.center()[0], tip[0], 'centered on the tip');
  assert.equal(bl.label.text, '7 bytes');
  const side = new BraceLabel([0, 0, 1, 2], 'n', RIGHT, { color: '#ff862f' });
  near(side.label.left()[0], side.brace.tip()[0] + 0.15, 'right of the tip');
  near(side.label.center()[1], 1, 'level with the tip');
  assert.equal(side.brace.style.stroke, '#ff862f');
  const c = bl.copy();
  assert.notEqual(c.brace, bl.brace); assert.ok(c.children.includes(c.label));
});

test('matchers box a span of code lines given as a Box', () => {
  const code = new Code(['let a = 1;', 'let b = 2;', 'return a + b;']);
  const top = code.lines[0]!.box()!, bottom = code.lines[1]!.box()!, all = code.box()!;
  const span: Box = [all[0], bottom[1], all[2], top[3]];
  const r = new SurroundingRectangle(span, { buff: 0.05 });
  nearBox(r.box()!, grow(span, 0.05), 'two lines');
  assert.ok(r.box()![1] > code.lines[2]!.box()![3] - 0.05, 'the third line is outside');
});

// ---- motion ----

const watch = async (body: (s: Scene) => Promise<void>): Promise<{ sink: MotionSink; scene: Scene; events: string[] }> => {
  const sink = new MotionSink();
  const scene = new Scene(sink, { fps: 30 });
  scene.construct = async function (this: Scene) { await body(this); };
  await scene.run();
  return { sink, scene, events: analyzeMotion(sink).map((e) => `${e.t}s ${e.kind} ${e.what}: ${e.detail}`) };
};

/** The outline's sampled alpha, frame by frame (0 where it was not drawn). */
const alphas = (sink: MotionSink, m: Mobject): number[] => Array.from({ length: sink.frames.length }, (_, f) => sink.frames.leaves(f).get(m.id)?.a ?? 0);

test('Create draws braces and brace labels in without jumps', async () => {
  const { events } = await watch(async (s) => {
    const sq = new Rectangle({ width: 1.5, height: 1.5 }); s.add(sq);
    await s.play(new Create(new Brace(sq, DOWN)));
    await s.play(new Create(new Brace(sq, LEFT, { stroke: '#58c4dd' })));
    await s.play(new Create(new BraceLabel(sq, 'side', RIGHT)));
    await s.play(new Create(new SurroundingRectangle(sq)), new Create(new Line([-3, 1.9], [-1, 1.9])), new Create(new Cross([1, 2, 3, 3])));
  });
  assert.deepEqual(events, []);
});

test('Circumscribe draws in, then fades and is gone; nothing jumps', async () => {
  let c!: Circumscribe;
  const { sink, scene, events } = await watch(async (s) => {
    const sq = new Rectangle({ width: 1.5, height: 1.5 }); s.add(sq);
    c = new Circumscribe(sq);
    await s.play(c);
    await s.wait(0.2);
  });
  assert.deepEqual(events, []);
  assert.ok(!scene.mobjects.includes(c.outline), 'removed after the play');
  const a = alphas(sink, c.outline), peak = a.indexOf(Math.max(...a));
  assert.ok(Math.max(...a) > 0.99, 'reaches full strength');
  assert.ok(a.slice(1, peak).some((x) => x > 0.02 && x < 0.5), 'rises through partial alpha: a draw-in, not a cut');
  assert.ok(a.slice(peak).some((x) => x > 0.02 && x < 0.5), 'falls through partial alpha: a fade, not a cut');
  assert.equal(a[a.length - 1], 0);
  assert.equal(c.outline.style.drawFraction, undefined, 'restored for reuse');
  assert.equal(c.outline.style.opacity, 1);
});

test('Circumscribe keep: the outline stays drawn and stays in the scene', async () => {
  let c!: Circumscribe;
  const { sink, scene, events } = await watch(async (s) => {
    const t = new Text('stays', { fontSize: 0.5 }); s.add(t);
    c = new Circumscribe(t, { keep: true, color: '#ff862f' });
    await s.play(c);
    await s.wait(0.3);
    await s.play(new FadeOut(c.outline));
  });
  assert.deepEqual(events, []);
  const a = alphas(sink, c.outline);
  // Drawn by the end of the play (30 frames), held through the wait
  assert.ok(a.slice(31, 40).every((x) => x > 0.99), 'held at full strength after the play');
  assert.equal(c.outline.style.drawFraction, undefined, 'a plain shape once drawn');
  assert.ok(!scene.mobjects.includes(c.outline), 'FadeOut removes it later');
  const { scene: s2 } = await watch(async (s) => {
    const t = new Text('stays', { fontSize: 0.5 }); s.add(t);
    c = new Circumscribe(t, { keep: true, shape: 'circle' });
    await s.play(c);
  });
  assert.ok(s2.mobjects.includes(c.outline), 'in scene.mobjects after play');
});

test('Circumscribe cases: circle, retract instead of fade, a Box target, inside a group', async () => {
  const { events } = await watch(async (s) => {
    const sq = new Rectangle({ width: 2, height: 1 }); s.add(sq);
    await s.play(new Circumscribe(sq, { shape: 'circle' }));
    await s.play(new Circumscribe(sq, { fadeOut: false, cornerRadius: 0.1 }));
    await s.play(new Circumscribe([-4, -3, -2, -2], { runTime: 1.5 }), new Circumscribe(sq, { keep: true, buff: 0.3 }));
  });
  assert.deepEqual(events, []);
});

test('Circumscribe retracts the path at full opacity instead of fading a complete path', () => {
  const retract = new Circumscribe([0, 0, 2, 1], { fadeOut: false });
  const fade = new Circumscribe([0, 0, 2, 1]);
  for (const c of [retract, fade]) {
    c.outline.style.opacity = 0.8;
    c.begin();
    c.interpolate(5 / 6);
  }
  assert.ok(retract.outline.style.drawFraction! > 0 && retract.outline.style.drawFraction! < 1);
  assert.equal(retract.outline.style.opacity, 0.8);
  assert.equal(fade.outline.style.drawFraction, 1);
  assert.ok(fade.outline.style.opacity > 0 && fade.outline.style.opacity < 0.8);
});

test('Circumscribe fits the target where it is when the play starts', async () => {
  let c!: Circumscribe;
  await watch(async (s) => {
    const sq = new Rectangle({ width: 1, height: 1 }); s.add(sq);
    c = new Circumscribe(sq, { keep: true, buff: 0.1 });
    sq.shift([3, -1]);
    await s.play(c);
  });
  nearBox(c.outline.box()!, [2.4, -1.6, 3.6, -0.4], 'refitted at begin()');
  const r = new Circumscribe([0, 0, 3, 4], { shape: 'circle', buff: 0 });
  r.begin();
  nearBox(r.outline.box()!, [-1, -0.5, 4, 4.5], 'circle through the corners');
});

// ---- time ----

class EmphasisScene extends Scene {
  override async construct(): Promise<void> {
    const code = new Code(['const x = read();', 'if (x > limit) drop(x);', 'else keep(x);']).shift([-2, 1]);
    const sq = new Rectangle({ width: 1.2, height: 1.2 }).shift([3, -1]);
    this.add(code, sq);
    await this.step('pulse');
    await this.play(new Circumscribe(code.lines[1]!));
    await this.step('keep');
    const kept = new Circumscribe(sq, { keep: true, shape: 'circle' });
    await this.play(kept, new Create(new BraceLabel(sq, 'limit', DOWN)));
    await this.step('more');
    await this.play(new Circumscribe(code, { fadeOut: false }), new Create(underline(code.lines[2]!)));
    await this.play(new FadeOut(kept.outline));
  }
}

test('seeking into and past Circumscribe renders the frame a full run produces', async () => {
  const full = new StringSink(); await new EmphasisScene(full).run();
  assert.ok(full.frames.length > 120);
  // Frames: pulse 1-30, keep 31-60, more 61-90, fade-out 91-120. Mid draw-in, the
  // hand-over to fading, mid fade, the pulse's end, mid keep, held, mid retract, mid fade-out, the end
  for (const k of [7, 20, 25, 30, 45, 61, 75, 100, full.frames.length - 1]) {
    const snap = new SnapshotSink();
    await renderFrame(EmphasisScene, k, snap);
    assert.equal(snap.svg, full.frames[k], `frame ${k}`);
  }
});

test('emphasis can name a part by its key: the part on the stage now, and nothing when it is not there', async () => {
  const { emphasises, emphasisOf } = await import('../explain/look.ts');
  const { Scene, Circle } = await import('../src/index.ts'); const { NullSink } = await import('../src/output.ts');
  const scene = new Scene(new NullSink());
  const ring = Object.assign(new Circle(), { key: 'ring:3' });
  scene.add(ring);
  emphasises(scene, () => [['ring:3', 'outlined'], ['ring:9', 'not drawn'], [ring, 'also the mobject']]);
  const marks = emphasisOf(scene);
  assert.deepEqual([...marks.entries()].map(([m, what]) => [m.key, what]), [['ring:3', 'outlined; also the mobject']]);
});
