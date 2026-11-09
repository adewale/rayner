import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NumberLine, Axes, VMobject, Rectangle, Text, Scene, Create, Transform, FadeIn,
  } from '../src/index.ts';
import { StringSink, renderFrame } from '../src/output.ts';
import { SnapshotSink } from '../src/svg.ts';
import { MotionSink, analyzeMotion, loadFonts } from '../explain/testing.ts';
import { fc, params } from './lib/pbt.ts';
import type { Vec } from '../src/index.ts';
// Manim's values, which the package no longer exports.
const GOLD = '#f0ac5f';
const RED = '#fc6255';

// Labels shape on glyph outlines; scenes load fonts in run(), bare tests do it here
await loadFonts();

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const nearVec = (a: Readonly<Vec>, b: Readonly<Vec>, eps: number, msg = '') => { near(a[0], b[0], eps, msg + ' x'); near(a[1], b[1], eps, msg + ' y'); };
const anchors = (m: VMobject, i = 0): Vec[] => {
  const a = m.subpaths[i]!, out: Vec[] = [];
  for (let j = 0; j < a.length; j += 6) out.push([a[j]!, a[j + 1]!]);
  return out;
};

test('NumberLine: n2p and p2n round-trip, and follow the line after shift and rotate', () => {
  const nl = new NumberLine({ range: [-2, 6, 0.5], length: 8, includeNumbers: true });
  nearVec(nl.n2p(-2), [-4, 0], 1e-6, 'min is the left end');
  nearVec(nl.n2p(6), [4, 0], 1e-6, 'max is the right end');
  assert.equal(nl.ticks.children.length, 17);
  assert.equal(nl.numbers.children.length, 17);
  assert.equal((nl.numbers.children[4] as Text).text, '0.0', 'decimals follow the step');
  nl.shift([1, -2]).rotate(0.7);
  for (const x of [-2, -0.25, 0, 1.5, 6, 9]) near(nl.p2n(nl.n2p(x)), x, 1e-5, `round trip ${x}`);
  // n2p reads the moved line, not the constructor's numbers
  nearVec(nl.n2p(-2), nl.line.start(), 1e-6, 'min is still the start');
  const tick0 = nl.ticks.children[0]!.center();
  nearVec(tick0, nl.n2p(-2), 1e-5, 'first tick sits on n2p(min)');
  // A copy reads its own children
  const c = nl.copy().shift([3, 0]);
  nearVec(c.n2p(0), [nl.n2p(0)[0] + 3, nl.n2p(0)[1]], 1e-5, 'copy maps through its own line');
});

test('Axes: c2p and p2c round-trip; c2p(0, 0) is the origin point where the axes cross', () => {
  const ax = new Axes({ xRange: [-3, 5, 1], yRange: [-1, 4, 1], width: 8, height: 5 });
  const o = ax.originPoint();
  nearVec(ax.c2p(0, 0), o, 0);
  // The axes meet at the origin: the x axis' 0 and the y axis' 0 are one point
  nearVec(ax.xAxis.n2p(0), o, 1e-6, 'x axis passes through the origin');
  nearVec(ax.yAxis.n2p(0), o, 1e-6, 'y axis passes through the origin');
  // The lines span exactly width × height about the scene origin
  const b = ax.box()!;
  [-4, -2.5, 4, 2.5].forEach((v, i) => near(b[i]!, v, 1e-5, `box ${i}`));
  const check = (label: string) => {
    for (const [x, y] of [[0, 0], [-3, -1], [5, 4], [1.25, 2.5], [7, -2]] as const) {
      const [u, v] = ax.p2c(ax.c2p(x, y));
      near(u, x, 1e-5, `${label} x`); near(v, y, 1e-5, `${label} y`);
    }
  };
  check('fresh');
  const before = ax.c2p(1, 2);
  ax.shift([1.5, -0.75]);
  nearVec(ax.c2p(1, 2), [before[0] + 1.5, before[1] - 0.75], 1e-5, 'c2p follows a shift');
  check('shifted');
  ax.rotate(0.3).scale(0.8);
  check('rotated and scaled');
});

test('Axes: when zero is outside a range, the axes cross at the range end', () => {
  const ax = new Axes({ xRange: [1, 12, 1], yRange: [0, 24, 6] });
  nearVec(ax.xAxis.n2p(1), ax.yAxis.n2p(0), 1e-6, 'y axis stands at x = 1');
  nearVec(ax.c2p(1, 0), ax.xAxis.line.start(), 1e-6);
  near(ax.originPoint()[0], ax.c2p(1, 0)[0] - ax.xAxis.unitSize(), 1e-5, 'origin point is one unit left of the axes');
});

test('Axes drop a crossing label only where the other axis runs through it', () => {
  const texts = (g: { children: readonly unknown[] }) => g.children.map((t) => (t as Text).text);
  const corner = new Axes({ xRange: [0, 3, 1], yRange: [0, 2, 1], axisStyle: { includeNumbers: true } });
  assert.deepEqual(texts(corner.xAxis.numbers), ['0', '1', '2', '3'], 'axes meet at a corner: both zeros stay');
  assert.deepEqual(texts(corner.yAxis.numbers), ['0', '1', '2']);
  const cross = new Axes({ xRange: [-2, 2, 1], yRange: [0, 2, 1], axisStyle: { includeNumbers: true } });
  assert.deepEqual(texts(cross.xAxis.numbers), ['-2', '-1', '0', '1', '2'], 'nothing runs below the x axis');
  assert.deepEqual(texts(cross.yAxis.numbers), ['1', '2'], 'the x axis runs through the y axis\' zero');
});

test('plot passes through c2p(x, fn(x)) at every sample, and draws left to right', () => {
  const ax = new Axes({ xRange: [0, 10, 1], yRange: [-2, 2, 1] }).shift([0.5, -0.25]);
  const fn = (x: number) => Math.sin(x) * 1.5 + 0.1 * x - 0.5;
  const samples = 64, plot = ax.plot(fn, { samples });
  const pts = anchors(plot);
  assert.equal(pts.length, samples);
  pts.forEach((p, i) => { const x = 10 * i / (samples - 1); nearVec(p, ax.c2p(x, fn(x)), 1e-6, `sample ${i}`); });
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i]![0] > pts[i - 1]![0], 'x increases along the path');
  // Between samples the curve stays close to fn (monotone slopes trade a little accuracy for no overshoot)
  for (let c = 0; c < plot.numCurves(); c++) {
    const [x, y] = ax.p2c(plot.pointOnCurve(0, c, 0.5));
    near(y, fn(x), 1e-2, `midpoint of curve ${c}`);
  }
});

test('plot never overshoots a clamped function between samples (monotone cubic, not Catmull-Rom)', () => {
  // Daylight hours at a polar latitude: flat at 0 and 24 for weeks, with kinks
  const lat = 69.65 * Math.PI / 180;
  const daylight = (m: number) => {
    const c = -Math.tan(lat) * Math.tan(23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (m - 2) / 12));
    return c <= -1 ? 24 : c >= 1 ? 0 : 24 * Math.acos(c) / Math.PI;
  };
  const ax = new Axes({ xRange: [0, 12, 1], yRange: [0, 24, 6] });
  const plot = ax.plot(daylight, { samples: 25 });
  for (let c = 0; c < plot.numCurves(); c++) {
    for (let k = 1; k < 16; k++) {
      const y = ax.p2c(plot.pointOnCurve(0, c, k / 16))[1];
      assert.ok(y >= -1e-4 && y <= 24 + 1e-4, `curve ${c} stays in [0, 24]: ${y}`);
    }
  }
});

test('plot splits at non-finite values', () => {
  const ax = new Axes({ xRange: [-2, 2, 1], yRange: [-4, 4, 1] });
  const p = ax.plot((x) => 1 / x, { samples: 41 });  // x = 0 is sample 20
  assert.equal(p.subpaths.length, 2);
});

test('lineGraph preserves every point in input order, including repeats', () => {
  const ax = new Axes({ xRange: [-2, 2, 1], yRange: [-4, 4, 1] });
  const points: Vec[] = [[-2, 1], [0, 3], [0, 3], [2, -1], [-1, 2]];
  const lg = ax.lineGraph(points);
  assert.equal(anchors(lg).length, points.length);
  anchors(lg).forEach((p, i) => nearVec(p, ax.c2p(...points[i]!), 1e-6));
});

test('bar heights are value × scale, standing on y = 0; negatives hang below the axis', () => {
  const ax = new Axes({ xRange: [0, 4, 1], yRange: [-2, 5, 1], height: 7 });
  const values = [3, 0, -1.5, 4.25];
  const bars = ax.bar(values, { colors: [GOLD, RED], labels: ['a', 'b', 'c', 'd'] });
  assert.equal(bars.children.length, 8, 'bars, then labels');
  const unit = ax.yAxis.unitSize(), axisY = ax.c2p(0, 0)[1];
  values.forEach((v, i) => {
    const r = bars.children[i] as Rectangle;
    assert.ok(r instanceof Rectangle);
    assert.equal(r.numCurves(), 4, 'four corners even for a zero bar');
    const [, y0, , y1] = r.box()!;
    near(y1 - y0, Math.abs(v) * unit, 1e-5, `height of bar ${i}`);
    if (v >= 0) near(y0, axisY, 1e-5, `bar ${i} stands on the axis`);
    else { near(y1, axisY, 1e-5, `bar ${i} hangs from the axis`); assert.ok(y0 < axisY); }
    near(r.center()[0], ax.c2p(i + 0.5, 0)[0], 1e-5, `bar ${i} centered at i + 0.5`);
    near(r.width(), 0.6 * ax.xAxis.unitSize(), 1e-5, 'default width is 1 − gap');
  });
  assert.equal(bars.children[0]!.style.fill, GOLD);
  assert.equal(bars.children[3]!.style.fill, RED, 'colors cycle');
  assert.ok((bars.children[6] as Text).top()[1] < ax.c2p(0, -2)[1], 'labels sit under the chart');
});

// ---- motion and time -------------------------------------------------------

/** Axes with every part on, a plot drawn in, then bars morphing through a sign flip. */
class ChartScene extends Scene {
  override async construct() {
    await this.step('axes');
    const ax = new Axes({
      xRange: [0, 6, 1], yRange: [-2, 4, 1], width: 9, height: 5, tips: true, xLabel: 't', yLabel: 'tokens',
      axisStyle: { includeNumbers: true },
    }).shift([0, -0.3]);
    await this.play(new Create(ax), { runTime: 2 });
    await this.step('plot');
    const plot = ax.plot((x) => 3 * Math.exp(-x / 2) * Math.cos(2 * x) + 0.5);
    await this.play(new Create(plot), { runTime: 1.5 });
    await this.step('bars');
    const bars = ax.bar([1, 2.5, 3.5, 0.5, 2, 3]);
    await this.play(new FadeIn(bars), { runTime: 0.6 });
    await this.play(new Transform(bars, ax.bar([3, -1, 2, 3.5, -2, 0])), { runTime: 1 });
    await this.play(new Transform(bars, ax.bar([0.5, 1, 1.5, 2, 2.5, 3], { colors: GOLD })), { runTime: 1 });
    await this.wait(0.3);
  }
}

test('Create(axes), Create(plot) and bar Transforms produce no motion events', async () => {
  const sink = new MotionSink();
  await new ChartScene(sink, { fps: 30 }).run();
  assert.deepEqual(analyzeMotion(sink).map((e) => `${e.kind} ${e.what} ${e.detail}`), []);
});

test('Create(axes) paces itself: default run time without labels, 2 s or lagRatio 0.1 with them', async () => {
  // Create staggers every family member by lagRatio 0.2, glyphs included, so
  // each part's share of the run shrinks as labels are added
  const events = async (opts: ConstructorParameters<typeof Axes>[0], anim: ConstructorParameters<typeof Create>[1] = {}) => {
    const sink = new MotionSink();
    const s = new Scene(sink, { fps: 30 });
    s.construct = async function (this: Scene) { await this.play(new Create(new Axes(opts), anim)); await this.wait(0.2); };
    await s.run();
    return analyzeMotion(sink).map((e) => `${e.kind} ${e.what} ${e.detail}`);
  };
  const ranges = { xRange: [0, 12, 1], yRange: [0, 24, 6] } as const;
  assert.deepEqual(await events({ ...ranges, tips: true }), [], 'ticks only, 1 s');
  assert.deepEqual(await events({ ...ranges, axisStyle: { includeNumbers: true } }, { runTime: 2 }), [], 'numbered, 2 s');
  assert.deepEqual(await events({ ...ranges, axisStyle: { includeNumbers: true } }, { lagRatio: 0.1 }), [], 'numbered, lagRatio 0.1');
});

test('seeking renders the identical frame a full run produces, mid-animation too', async () => {
  const full = new StringSink();
  await new ChartScene(full, { fps: 30 }).run();
  // Mid Create(axes), mid Create(plot), mid FadeIn, mid sign-flip Transform, mid recolor, the end
  for (const frame of [17, 45, 79, 96, 110, 138, 168, full.frames.length - 1]) {
    const snap = new SnapshotSink();
    await renderFrame(ChartScene, frame, snap, { fps: 30 });
    assert.equal(snap.svg, full.frames[frame], `frame ${frame}`);
  }
});

test('coordinate inverses follow independent nonsingular affine transforms', () => {
  fc.assert(fc.property(fc.double({ min: -4, max: 4, noNaN: true }), fc.double({ min: -4, max: 4, noNaN: true }), fc.double({ min: -2, max: 2, noNaN: true }), (x, y, shear) => {
    const ax = new Axes({ xRange: [1, 5, 1], yRange: [-3, 2, 1], width: 7, height: 3 });
    const before = ax.c2p(x, y);
    ax.applyAffine(1, 0, shear, 1, 2, -1, { aboutPoint: [0, 0] });
    nearVec(ax.c2p(x, y), [before[0] + shear * before[1] + 2, before[1] - 1], 1e-5);
    nearVec(ax.p2c(ax.c2p(x, y)), [x, y], 1e-5);
    const nl = new NumberLine({ range: [1, 5, 1], length: 7 });
    nl.shift([2, -1]).rotate(shear).scale(0.75);
    nearVec(nl.n2p(1), nl.line.start(), 0);
    nearVec(nl.n2p(5), nl.line.end(), 1e-6);
    near(nl.p2n(nl.n2p(x)), x, 1e-5);
  }), params(200));
});

test('areaUnder closes on the data baseline and rejects nonfinite function samples', () => {
  fc.assert(fc.property(fc.double({ min: -3, max: 3, noNaN: true }), fc.integer({ min: 2, max: 12 }), (slope, samples) => {
    const ax = new Axes({ xRange: [-2, 3, 1], yRange: [-4, 4, 1] }).rotate(0.3).shift([1, -1]);
    const area = ax.areaUnder((x) => slope * x + 1, [-1, 2], { samples });
    assert.equal(area.closed[0], true);
    const ps = anchors(area);
    nearVec(ps[0]!, ax.c2p(-1, 1 - slope), 1e-6);
    nearVec(ps[samples - 1]!, ax.c2p(2, 1 + 2 * slope), 1e-6);
    nearVec(ps[samples]!, ax.c2p(2, 0), 1e-6);
    nearVec(ps[samples + 1]!, ax.c2p(-1, 0), 1e-6);
    nearVec(ps.at(-1)!, ps[0]!, 0);
  }), params(200));
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => new Axes().areaUnder(() => value, [0, 1]), RangeError);
});

test('bar interpolation fixes baseline while the top moves linearly through zero', () => {
  fc.assert(fc.property(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (a, b, alpha) => {
    const ax = new Axes({ xRange: [-2, 2, 1], yRange: [-4, 4, 1] }).rotate(0.3).shift([1, -1]);
    const bars = ax.bar([a], { x: [0.5], width: 0.8 }), target = ax.bar([b], { x: [0.5], width: 0.8 });
    const transform = new Transform(bars, target); transform.begin(); transform.interpolate(alpha);
    const pts = anchors(bars.children[0] as VMobject), top = a + (b - a) * alpha;
    [[0.1, top], [0.9, top], [0.9, 0], [0.1, 0]].forEach(([x, y], i) => nearVec(pts[i]!, ax.c2p(x!, y!), 1e-6));
  }), params(200));
});

test('plot samples once per x and every segment stays between neighboring sampled values', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: -10, max: 10 }), { minLength: 2, maxLength: 24 }), (values) => {
    const ax = new Axes({ xRange: [0, values.length - 1, 1], yRange: [-10, 10, 1], width: values.length - 1, height: 20 });
    let calls = 0;
    const plot = ax.plot((x) => { calls++; return values[Math.round(x)]!; }, { samples: values.length });
    assert.equal(calls, values.length);
    assert.equal(plot.numCurves(), values.length - 1);
    anchors(plot).forEach((p, i) => assert.deepEqual(p, ax.c2p(i, values[i]!)));
    for (let c = 0; c < values.length - 1; c++) for (const t of [0, 0.125, 0.25, 0.5, 0.75, 0.875, 1]) {
      const y = ax.p2c(plot.pointOnCurve(0, c, t))[1];
      // Unit y scale and integer anchors make these bounds exact; no epsilon.
      assert.ok(y >= Math.min(values[c]!, values[c + 1]!) && y <= Math.max(values[c]!, values[c + 1]!), `${c} at ${t}: ${y}`);
    }
  }), params(200));
});
