// Lineage tests: bugs and design mistakes reported against this project's
// ancestors (3b1b/manim, ManimCommunity/manim, maloyan/manim-web), each turned
// into a test against Lantern. Every test names the upstream issue or pull
// request it comes from. Properties use fast-check; counts: test/lib/pbt.ts.
import { test } from 'node:test';
import { Square, Write, MoveAlongPath } from '../src/extras.ts';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { Scene, Group, VMobject, Rectangle, Circle, Line, Dot, Arc, Text, Code, DecimalNumber, Transform, FadeIn, FadeOut, Create, AnimationGroup, LaggedStart, linear, smooth, rushInto, rushFrom, thereAndBack, shaperFor } from '../src/index.ts';
import { StringSink, NullSink, toSvgString, renderElements, renderAt, indexScene } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import { Indicate } from './lib/transient.ts';
import type { Mobject, Sink, RateFunc, Style } from '../src/index.ts';

await loadFonts();

// ---- helpers ---------------------------------------------------------------

/** Run `body` as a scene's construct() and collect every frame. */
async function film(body: (s: Scene) => Promise<void>, { fps = 10 } = {}): Promise<{ frames: string[]; scene: Scene }> {
  const sink = new StringSink();
  const S = class extends Scene { override async construct() { await body(this); } };
  const scene = new S(sink, { fps });
  await scene.run();
  return { frames: sink.frames, scene };
}
/** The SVG a fresh scene draws with exactly these mobjects on it. */
function drawn(...mobs: Mobject[]): string {
  const s = new Scene(new NullSink());
  s.add(...mobs);
  return toSvgString(s);
}
const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps;
const finiteFrame = (svg: string) => !/NaN|Infinity|undefined/.test(svg);
// Rate functions an author writes, beside the exported ones: two easings, one that overshoots its end
// and one that swings both ways. The engine must follow any rate function, not only its own.
const easeInQuad: RateFunc = (t) => t * t;
const easeOutQuad: RateFunc = (t) => 1 - (1 - t) * (1 - t);
// Exact at the ends: the polynomial leaves 2.2e-16 at t = 0, so the first frame would not be the start
const easeOutBack: RateFunc = (t) => { if (t <= 0) return 0; if (t >= 1) return 1; const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const wiggle: RateFunc = (t) => thereAndBack(t) * Math.sin(4 * Math.PI * t);
const RATES: Array<[string, RateFunc]> = [
  ['linear', linear], ['smooth', smooth], ['rushInto', rushInto], ['rushFrom', rushFrom], ['thereAndBack', thereAndBack],
  ['easeInQuad', easeInQuad], ['easeOutQuad', easeOutQuad], ['easeOutBack', easeOutBack], ['wiggle', wiggle],
];
const rate = fc.constantFrom(...RATES);
const coord = fc.double({ min: -5, max: 5, noNaN: true });
const vec = fc.tuple(coord, coord);
const hex = fc.integer({ min: 0, max: 0xffffff }).map((n) => '#' + n.toString(16).padStart(6, '0'));
/** Every point of every path in a family, flattened. */
const pointsOf = (m: Mobject) => m.family().flatMap((f) => f.pointArrays().flatMap((a) => Array.from(a)));

// ===========================================================================
// Rate functions and easing composition
// ===========================================================================

test('rate: points follow a rate function past its ends, as easeOutBack and wiggle need (manim #1140, ManimCommunity #158)', () => {
  // https://github.com/3b1b/manim/issues/1140, https://github.com/ManimCommunity/manim/issues/158
  // Clipping alpha to [0, 1] made wiggle move one way only. Lantern clipped at the
  // point level (alpha >= 1 copied the target), so easeOutBack never overshot.
  fc.assert(fc.property(vec, vec, fc.double({ min: -1, max: 2, noNaN: true }), (at, d, alpha) => {
    const a = new Square({ side: 1 }).moveTo(at), b = a.copy().shift(d), m = a.copy();
    m.interpolate(a, b, alpha);
    const c = m.center();
    assert.ok(near(c[0], at[0] + d[0] * alpha, 2e-4) && near(c[1], at[1] + d[1] * alpha, 2e-4), `alpha ${alpha}: ${c} vs ${[at[0] + d[0] * alpha, at[1] + d[1] * alpha]}`);
  }), params(300));
});

test('rate: style blended at any alpha, overshoot included, keeps opacities in [0, 1] and colours parseable (manim #2524)', () => {
  // https://github.com/3b1b/manim/pull/2524: overshooting rate functions turned colours to white or unparseable hex.
  fc.assert(fc.property(hex, hex, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: -2, max: 3, noNaN: true }), (c0, c1, o0, o1, alpha) => {
    const a = new Circle({ fill: c0, stroke: c1, fillOpacity: o0, opacity: o1 }), b = new Circle({ fill: c1, stroke: c0, fillOpacity: o1, opacity: o0 });
    const m = a.copy();
    m.interpolate(a, b, alpha);
    for (const k of ['opacity', 'fillOpacity', 'strokeOpacity'] as const) assert.ok(m.style[k] >= 0 && m.style[k] <= 1, `${k} = ${m.style[k]}`);
    assert.match(m.style.fill, /^#[0-9a-f]{6}$/);
    assert.match(m.style.stroke, /^#[0-9a-f]{6}$/);
    const t = Math.max(0, Math.min(1, alpha));
    const expectedColor = (start: string, end: string) => '#' + [1, 3, 5].map((offset) => {
      const a = Number.parseInt(start.slice(offset, offset + 2), 16), b = Number.parseInt(end.slice(offset, offset + 2), 16);
      return Math.round(a * (1 - t) + b * t).toString(16).padStart(2, '0');
    }).join('');
    assert.equal(m.style.fill, expectedColor(c0, c1));
    assert.equal(m.style.stroke, expectedColor(c1, c0));
    assert.ok(near(m.style.fillOpacity, o0 * (1 - t) + o1 * t, 1e-15));
    assert.ok(near(m.style.opacity, o1 * (1 - t) + o0 * t, 1e-15));
  }), params(500));
});

test('rate: every exported rate function, and each written here, is exact at its ends and finite in between (manim-web #50, #58)', () => {
  // https://github.com/maloyan/manim-web/issues/50, https://github.com/maloyan/manim-web/pull/58 (wrong lingering/runningStart bases)
  for (const [name, f] of RATES) {
    assert.equal(f(0), 0, `${name}(0)`);
    assert.ok(f(1) === (name === 'thereAndBack' || name === 'wiggle' ? 0 : 1), `${name}(1) = ${f(1)}`);
  }
  fc.assert(fc.property(rate, fc.double({ min: 0, max: 1, noNaN: true }), ([name, f], t) => {
    assert.ok(Number.isFinite(f(t)), `${name}(${t})`);

  }), params(500));
});

// ===========================================================================
// AnimationGroup, LaggedStart, lag ratios
// ===========================================================================

test('group: an AnimationGroup of one animation plays exactly like that animation (ManimCommunity #769, #844)', async () => {
  // https://github.com/ManimCommunity/manim/issues/769, https://github.com/ManimCommunity/manim/issues/844
  // manim's AnimationGroup is linear by default; Lantern's was smooth, easing every member twice.
  await fc.assert(fc.asyncProperty(rate, fc.double({ min: 0.2, max: 2, noNaN: true }), vec, async ([, f], runTime, d) => {
    const make = () => { const r = new Rectangle({ width: 1, height: 1 }); return { r, t: new Transform(r, r.copy().shift(d), { rateFunc: f, runTime }) }; };
    const alone = await film(async (s) => { const { r, t } = make(); s.add(r); await s.play(t); });
    const grouped = await film(async (s) => { const { r, t } = make(); s.add(r); await s.play(new AnimationGroup([t])); });
    assert.deepEqual(grouped.frames, alone.frames);
  }), params(40));
});

test('group: a rate function given to play() for a group decides where the members land (ManimCommunity #3542)', async () => {
  // https://github.com/ManimCommunity/manim/pull/3542: finish() reset a reversed group's members to their end state.
  await fc.assert(fc.asyncProperty(rate, fc.double({ min: 0.5, max: 4, noNaN: true }), async ([name, f], dx) => {
    const r = new Rectangle({ width: 1, height: 1 });
    await film(async (s) => { s.add(r); await s.play(new AnimationGroup([new Transform(r, r.copy().shift([dx, 0]))]), { rateFunc: f }); });
    // The member's own rate is smooth; the group's alpha at the end is f(1)
    const want = dx * smooth(Math.min(Math.max(f(1), 0), 1));
    assert.ok(near(r.center()[0], want, 1e-4), `${name}: ended at ${r.center()[0]}, want ${want}`);
  }), params(30));
});

test('group: a lagRatio given to play() staggers a group the way one given to its constructor does (ManimCommunity #2563, #2913)', async () => {
  // https://github.com/ManimCommunity/manim/issues/2563, https://github.com/ManimCommunity/manim/pull/2913:
  // options passed to play() instead of the animation were silently not applied.
  await fc.assert(fc.asyncProperty(fc.double({ min: 0, max: 1.5, noNaN: true }), fc.integer({ min: 2, max: 4 }), async (lag, n) => {
    const members = () => Array.from({ length: n }, (_, i) => new Square({ side: 0.5 }).shift([i - 2, 0]));
    const anims = (ms: Mobject[]) => ms.map((m) => new Transform(m, m.copy().shift([0, 1])));
    const byCtor = await film(async (s) => { const ms = members(); s.add(...ms); await s.play(new AnimationGroup(anims(ms), { lagRatio: lag })); });
    const byPlay = await film(async (s) => { const ms = members(); s.add(...ms); await s.play(new AnimationGroup(anims(ms)), { lagRatio: lag }); });
    assert.equal(byPlay.scene.time, byCtor.scene.time);
    assert.deepEqual(byPlay.frames, byCtor.frames);
  }), params(30));
});

test('group: inside a LaggedStart, a later FadeIn stays invisible until its own start (ManimCommunity #709, #888; manim-web #861)', async () => {
  // https://github.com/ManimCommunity/manim/issues/709, https://github.com/ManimCommunity/manim/issues/888,
  // https://github.com/maloyan/manim-web/issues/861: members appeared at t = 0, before their animation.
  await fc.assert(fc.asyncProperty(fc.double({ min: 0.1, max: 1, noNaN: true }), fc.integer({ min: 2, max: 4 }), async (lag, n) => {
    const dots = Array.from({ length: n }, (_, i) => new Dot({ radius: 0.2 }).shift([i, 0]));
    let violations = 0;
    const S = class extends Scene { override async construct() { await this.play(new LaggedStart(dots.map((d) => new FadeIn(d)), { lagRatio: lag })); } };
    const sink: Sink = { async frame(scene) {
      dots.forEach((d, i) => { if (scene.time < i * lag - 1e-9 && d.style.opacity > 0 && scene.mobjects.includes(d)) violations++; });
    } };
    await new S(sink, { fps: 30 }).run();
    assert.equal(violations, 0);
    for (const d of dots) assert.equal(d.style.opacity, 1);
  }), params(30));
});

test('group: finishing a nested group finishes every member, so Create leaves no temporary border (ManimCommunity #3951)', async () => {
  // https://github.com/ManimCommunity/manim/pull/3951: AnimationGroup.finish skipped members' clean-up.
  const dot = new Dot({ radius: 0.3, color: '#ff0000' }), box = new Rectangle({ fill: '#00ff00', fillOpacity: 1, stroke: 'none' });
  const before = [dot, box].map((m) => ({ ...m.style }));
  await film(async (s) => { await s.play(new AnimationGroup([new LaggedStart([new Create(dot), new AnimationGroup([new Create(box)])])])); });
  assert.deepEqual([dot, box].map((m) => ({ ...m.style })), before);
});

test('group: an instant member (runTime 0) of a group lands on its end, and an explicit group runTime survives a lagRatio (ManimCommunity #4017, #2563)', async () => {
  // https://github.com/ManimCommunity/manim/pull/4017 (run_time = 0 inside groups, the Add animation),
  // https://github.com/ManimCommunity/manim/issues/2563 (options given to play() vs the animation).
  await fc.assert(fc.asyncProperty(fc.double({ min: 0.1, max: 2, noNaN: true }), fc.double({ min: 0, max: 1.5, noNaN: true }), async (rest, lag) => {
    const sq = new Square({ side: 0.5 }).shift([-2, 0]), c = new Circle({ radius: 0.3 });
    await film(async (s) => { s.add(sq); await s.play(new AnimationGroup([new Transform(sq, sq.copy().shift([4, 0]), { runTime: 0 }), new FadeIn(c, { runTime: rest })])); });
    assert.ok(near(sq.center()[0], 2, 1e-5), `instant member ended at ${sq.center()[0]}`);
    const g = new AnimationGroup([new FadeIn(new Dot(), { runTime: 1 }), new FadeIn(new Dot(), { runTime: 2 })], { runTime: 2 });
    g.setOptions({ lagRatio: lag });
    assert.equal(g.runTime, 2);
  }), params(30));
});

// ===========================================================================
// play(): run times, frame counts, updaters, determinism
// ===========================================================================

test('play: a runTime of 0 shows the end state, never a collapsed or NaN frame (ManimCommunity #4004, #4017)', async () => {
  // https://github.com/ManimCommunity/manim/issues/4004, https://github.com/ManimCommunity/manim/pull/4017
  // play() computed alpha = 0 / 0 = NaN, which serialised as 0 and collapsed every path to the origin.
  const { frames, scene } = await film(async (s) => {
    const r = new Rectangle({ width: 2, height: 1 });
    s.add(r);
    await s.play(r.animate.shift([2, 0]), { runTime: 0 });
  });
  const expected = drawn(new Rectangle({ width: 2, height: 1 }).shift([2, 0]));
  assert.ok(frames.length > 1, 'the zero-length play emits a finished frame after the initial frame');
  assert.equal(toSvgString(scene), expected, 'geometry reaches the authored target');
  for (const f of frames.slice(1)) assert.equal(f, expected, 'the zero-length play draws its end state');
});

test('play: the last frame of a play shows the finished animation, whatever runTime × fps is (ManimCommunity #183, #698)', async () => {
  // https://github.com/ManimCommunity/manim/issues/183, https://github.com/ManimCommunity/manim/pull/698:
  // the last rendered frame stopped short of alpha = 1.
  // When runTime·fps rounded down, the last frame was drawn at alpha < 1 and finish() landed after it.
  await fc.assert(fc.asyncProperty(fc.double({ min: 0.05, max: 2, noNaN: true }), async (runTime) => {
    const { frames, scene } = await film(async (s) => {
      const r = new Rectangle({ width: 1, height: 1 });
      s.add(r);
      await s.play(new Transform(r, r.copy().shift([3, 0])), { runTime, rateFunc: linear });
    });
    assert.equal(frames.at(-1), toSvgString(scene), `runTime ${runTime}: last frame is not the finished state`);
  }), params(40));
});

test('play: a play emits round(runTime·fps) frames and the first already moves (ManimCommunity #4912, #3005)', async () => {
  // https://github.com/ManimCommunity/manim/pull/4912: the first frame of every play repeated alpha = 0 (dt = 0).
  await fc.assert(fc.asyncProperty(fc.double({ min: 0.2, max: 2, noNaN: true }), fc.constantFrom(10, 24, 30), async (runTime, fps) => {
    const { frames } = await film(async (s) => {
      const r = new Rectangle({ width: 1, height: 1 });
      s.add(r);
      await s.play(new Transform(r, r.copy().shift([3, 0])), { runTime, rateFunc: linear });
    }, { fps });
    assert.equal(frames.length - 1, Math.max(1, Math.round(runTime * fps)));
    assert.notEqual(frames[1], frames[0], 'the first frame of the play has moved');
  }), params(30));
});

test('updaters: the dt an updater receives adds up to the scene clock across plays and waits (ManimCommunity #4611, manim #2481)', async () => {
  // https://github.com/ManimCommunity/manim/issues/4611, https://github.com/3b1b/manim/pull/2481
  await fc.assert(fc.asyncProperty(fc.array(fc.tuple(fc.boolean(), fc.double({ min: 0.05, max: 1, noNaN: true })), { minLength: 1, maxLength: 6 }), async (ops) => {
    let sum = 0, calls = 0;
    const { frames, scene } = await film(async (s) => {
      const d = new Dot().addUpdater((m, dt) => { sum += dt; calls++; m.shift([dt, 0]); });
      s.add(d);
      for (const [isPlay, t] of ops) {
        if (isPlay) { const r = new Square({ side: 0.3 }); s.add(r); await s.play(new Transform(r, r.copy().shift([1, 0]), { runTime: t })); }
        else await s.wait(t);
      }
    });
    assert.ok(near(sum, scene.time, 1e-9), `${sum} vs ${scene.time}`);
    assert.equal(calls, frames.length - 1);
  }), params(30));
});

test('time: seeking to k/fps lands on frame k in a 40-minute scene (manim #1000, #1189)', async () => {
  // https://github.com/3b1b/manim/issues/1000, https://github.com/3b1b/manim/pull/1189: frame timing drifted from the nominal rate.
  // A clock summed from dt drifted past the seek tolerance at about 29 minutes at 25 fps; it now
  // comes from the frame count.
  const fps = 25, frames = 40 * 60 * fps;
  const S = class extends Scene { override async construct() { await this.wait(40 * 60); } };
  // renderAt(k/fps) must land on frame k, late in the scene as well as early
  for (const k of [1, 2, frames / 2 + 1, frames - 2, frames - 1, frames]) {
    const scene = await renderAt(S, k / fps, new NullSink(), { fps });
    assert.equal(scene.frameCount, k, `renderAt(${k}/${fps}) (${(k / fps / 60).toFixed(1)} min)`);
  }
});

test('run: an exception in an updater or a sink rejects run(), it never hangs or is swallowed (ManimCommunity #4904; manim-web #715)', async () => {
  // https://github.com/ManimCommunity/manim/issues/4904, https://github.com/maloyan/manim-web/pull/715
  const boom = new Error('boom');
  const U = class extends Scene { override async construct() { const d = new Dot(); d.addUpdater(() => { throw boom; }); this.add(d); await this.play(new Transform(d, d.copy().shift([1, 0]))); } };
  await assert.rejects(new U(new NullSink()).run(), (e) => e === boom);
  let n = 0;
  const K = class extends Scene { override async construct() { const d = new Dot(); this.add(d); await this.play(new Transform(d, d.copy().shift([1, 0]))); } };
  await assert.rejects(new K({ async frame() { if (++n === 3) throw boom; } }).run(), (e) => e === boom);
});

// ===========================================================================
// Transform: alignment between different structures
// ===========================================================================

const glyphs = fc.string({ unit: fc.constantFrom('B', 'o', '8', '%', 'i', 'j', 'l', 'a', 'Q', ' ', '@', 'é'), maxLength: 6 });

test('transform: Text(a) morphed into Text(b) draws exactly what Text(b) draws (manim-web #280, #102; ManimCommunity #1468)', async () => {
  // https://github.com/maloyan/manim-web/issues/280 (end state broken when the glyph count changes),
  // https://github.com/maloyan/manim-web/pull/102 (bright dots after transforms),
  // https://github.com/ManimCommunity/manim/issues/1468. Alignment pads glyphs with extra curves
  // and point-sized subpaths; a bold (stroked) glyph left a round-capped dot where a contour vanished.
  await fc.assert(fc.asyncProperty(glyphs, glyphs, fc.constantFrom('normal' as const, 'bold' as const), fc.constantFrom('sans' as const, 'mono' as const), async (a, b, weight, font) => {
    const src = new Text(a, { weight, font }), dst = new Text(b, { weight, font });
    await film(async (s) => { s.add(src); await s.play(new Transform(src, dst)); });
    assert.equal(drawn(src), drawn(dst), `${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  }), params(60));
});

/** A path of `n` separate unit squares, stroked. */
function contours(n: number, x0: number): VMobject {
  const v = new VMobject({ stroke: '#ffffff', strokeWidth: 0.05 });
  for (let i = 0; i < n; i++) { v.startNewPath([x0 + 1.5 * i, 0]); v.addLineTo([x0 + 1.5 * i + 1, 0]); v.addLineTo([x0 + 1.5 * i + 1, 1]); v.closePath(); }
  return v;
}
const degenerate = (v: VMobject) => v.subpaths.filter((p) => p.every((x, i) => x === p[i % 2])).length;

test('transform: a morph between paths with different contour counts lands on one end with no zero-length subpath (manim-web #102)', async () => {
  // https://github.com/maloyan/manim-web/pull/102: stray dots at the end of transforms.
  await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 4 }), fc.constantFrom(smooth, thereAndBack), async (na, nb, f) => {
    const a = contours(na, -3), b = contours(nb, 0);
    await film(async (s) => { s.add(a); await s.play(new Transform(a, b, { rateFunc: f })); });
    const end = f(1) === 1 ? b : contours(na, -3);
    assert.equal(degenerate(a), 0);
    assert.equal(a.toPathD(), end.toPathD());
  }), params(40));
});

test('transform: a path paired with something that draws nothing (a group, a Text) leaves no stray dot (manim-web #102)', async () => {
  // https://github.com/maloyan/manim-web/pull/102. Alignment pairs family members by index; a path opposite a
  // container collapses to a point, and a stroked point draws a round-capped dot.
  await fc.assert(fc.asyncProperty(glyphs, glyphs, fc.boolean(), async (a, b, flip) => {
    const src = flip ? new Group(new Circle(), new Text(a)) : new Group(new Text(a), new Square());
    const dst = flip ? new Group(new Text(b), new Square()) : new Group(new Circle(), new Text(b));
    const { scene } = await film(async (s) => { s.add(src); await s.play(new Transform(src, dst)); });
    for (const el of renderElements(scene)) {
      const nums = (el.attrs.d ?? '').split(/[^-\d]+/).filter(Boolean);
      assert.ok(new Set(nums).size > 2 || el.attrs.stroke === 'none' || el.attrs['stroke-width'] === '0', `zero-extent stroked path ${el.attrs.d}`);
    }
  }), params(40));
});

test('transform: from an empty path into a circle and back out stays finite and lands each time (ManimCommunity #4020, #4320)', async () => {
  // https://github.com/ManimCommunity/manim/issues/4020 (Point -> Circle raised), https://github.com/ManimCommunity/manim/pull/4320
  const e = new VMobject(), c = new Circle({ radius: 1.5 });
  const { frames } = await film(async (s) => {
    s.add(e);
    await s.play(new Transform(e, c));
    assert.equal(e.toPathD(), c.toPathD());
    await s.play(new Transform(e, new VMobject()));
  });
  assert.ok(frames.every(finiteFrame));
  assert.equal(e.hasPoints(), false, 'morphed into nothing, it draws nothing');
});

test('transform: replace=true with the target already on screen leaves one copy of it (ManimCommunity #4238, #4242, #4372)', async () => {
  // https://github.com/ManimCommunity/manim/issues/4238, https://github.com/ManimCommunity/manim/pull/4242,
  // https://github.com/ManimCommunity/manim/pull/4372 (chained ReplacementTransforms).
  // replace() used to splice the target in without removing its own entry, so it drew twice.
  const a = new Rectangle(), b = new Circle().shift([3, 0]), c = new Square().shift([-3, 0]);
  const { scene } = await film(async (s) => {
    s.add(a, b, c);
    await s.play(new Transform(a, b, { replace: true }));
    await s.play(new Transform(b, c, { replace: true }));
  });
  assert.deepEqual(scene.mobjects, [c]);
});

test('transform: replace=true on a mobject inside an on-screen group leaves no ghost behind (ManimCommunity #2507)', async () => {
  // https://github.com/ManimCommunity/manim/issues/2507: replacing a submobject left the old one drawn.
  // replace() used to look only at top-level mobjects, leaving a grouped source behind.
  const a = new Rectangle(), g = new Group(a, new Square().shift([3, 0])), t = new Circle().shift([-3, 0]);
  const { scene } = await film(async (s) => { s.add(g); await s.play(new Transform(a, t, { replace: true })); });
  const ids = renderElements(scene).map((e) => e.id);
  assert.equal(ids.length, 2, 'the square and the circle, not the old rectangle too');
  assert.ok(ids.includes(t.id), 'replacement target is drawn');
  assert.ok(!ids.includes(a.id), 'grouped source is removed');
});

test('play: animating a new Group of mobjects already on screen draws each once, in its place (manim #2500, #2352)', async () => {
  // https://github.com/3b1b/manim/pull/2500, https://github.com/3b1b/manim/issues/2352
  // A new wrapper group of on-screen mobjects used to be added, drawing its members twice.
  const a = new Rectangle({ fill: '#ff0000', fillOpacity: 1 }), b = new Circle({ fill: '#0000ff', fillOpacity: 1 }), top = new Square({ side: 3 });
  const { scene } = await film(async (s) => { s.add(a, b, top); await s.play(new Indicate(new Group(a, b))); });
  const ids = renderElements(scene).map((e) => e.id);
  assert.deepEqual(ids, [a.id, b.id, top.id], 'each drawn once, and the square still on top');
});

test('play: every .animate builder given to play() animates, the last one too (ManimCommunity #4865, #1129; manim #1618)', async () => {
  // https://github.com/ManimCommunity/manim/issues/4865 (one of two .animate calls silently dropped),
  // https://github.com/ManimCommunity/manim/issues/1129 (.animate with several animations), https://github.com/3b1b/manim/issues/1618.
  // play() takes a trailing object whose prototype is Object.prototype as its options; a
  // builder's Proxy reported Object.prototype, so play(m.animate.shift(v)) did nothing at all.
  await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 4 }), vec, async (n, d) => {
    const ms = Array.from({ length: n }, (_, i) => new Square({ side: 0.5 }).shift([i, 0]));
    const { scene } = await film(async (s) => { s.add(...ms); await s.play(...ms.map((m) => m.animate.shift(d))); });
    ms.forEach((m, i) => assert.ok(near(m.center()[0], i + d[0], 1e-4) && near(m.center()[1], d[1], 1e-4), `square ${i} of ${n}`));
    assert.ok(near(scene.time, 1, 1e-9), 'the play ran for the default second');
  }), params(30));
});

test('play: playing never reorders what is already on screen; what it brings in is drawn on top (ManimCommunity #843, #3110, #1001)', async () => {
  // https://github.com/ManimCommunity/manim/issues/843 (ReplacementTransform put the object at the wrong depth),
  // https://github.com/ManimCommunity/manim/issues/3110, https://github.com/ManimCommunity/manim/issues/1001
  await fc.assert(fc.asyncProperty(fc.array(fc.constantFrom('indicate', 'fadeIn', 'move', 'create', 'new'), { minLength: 1, maxLength: 6 }), fc.nat({ max: 3 }), async (ops, pick) => {
    const kids = [0, 1, 2, 3].map((i) => new Circle({ radius: 0.5, fill: '#ff0000', fillOpacity: 1 }).shift([i * 0.4, 0]));
    const added: Mobject[] = [];
    const { scene } = await film(async (s) => {
      s.add(...kids);
      for (const o of ops) {
        const k = kids[pick]!;
        if (o === 'indicate') await s.play(new Indicate(k));
        else if (o === 'fadeIn') await s.play(new FadeIn(k));
        else if (o === 'move') await s.play(k.animate.shift([0, 0.1]));
        else if (o === 'create') await s.play(new Create(k));
        else { const n = new Square({ side: 0.5 }); added.push(n); await s.play(new FadeIn(n)); }
      }
    });
    assert.deepEqual(scene.mobjects, [...kids, ...added]);
  }), params(50));
});

test('play: two animations of one family in one play() are refused rather than one silently winning (ManimCommunity #4865, #1129)', async () => {
  // https://github.com/ManimCommunity/manim/issues/4865, https://github.com/ManimCommunity/manim/issues/1129
  const a = new Square(), g = new Group(a, new Circle());
  await assert.rejects(film(async (s) => { s.add(g); await s.play(g.animate.shift([1, 0]), a.animate.setFill('#ff0000')); }), /both animate/);
  await assert.rejects(film(async (s) => { s.add(g); await s.play(new Indicate(g), new FadeOut(a)); }), /both animate/);
});

test('animate: chained .animate calls accumulate and the target is built when played (manim-web #299; ManimCommunity #3502)', async () => {
  // https://github.com/maloyan/manim-web/pull/299, https://github.com/ManimCommunity/manim/pull/3502
  await fc.assert(fc.asyncProperty(vec, vec, vec, async (d1, d2, moved) => {
    const r = new Square({ side: 1 });
    await film(async (s) => { s.add(r); const b = r.animate.shift(d1).shift(d2); r.shift(moved); await s.play(b); });
    const c = r.center();
    assert.ok(near(c[0], d1[0] + d2[0] + moved[0], 1e-4) && near(c[1], d1[1] + d2[1] + moved[1], 1e-4));
  }), params(30));
});

// ===========================================================================
// Fades, opacity, Create
// ===========================================================================

test('fade: FadeOut with a shift or scale, then FadeIn, shows the mobject where and as it was (ManimCommunity #1526; manim-web #107)', async () => {
  // https://github.com/ManimCommunity/manim/pull/1526, https://github.com/maloyan/manim-web/pull/107.
  // manim's FadeOut interpolates back to alpha 0 once removed; Lantern restored only opacity, so a
  // re-shown mobject came back displaced and resized.
  await fc.assert(fc.asyncProperty(vec, fc.double({ min: 0.2, max: 3, noNaN: true }), fc.double({ min: 0.05, max: 1, noNaN: true }), async (shift, scale, opacity) => {
    const r = new Rectangle({ width: 2, height: 1, fill: '#336699', fillOpacity: 0.5 }).setOpacity(opacity);
    const before = pointsOf(r);
    await film(async (s) => { s.add(r); await s.play(new FadeOut(r, { shift, scale })); await s.play(new FadeIn(r)); });
    pointsOf(r).forEach((x, i) => assert.ok(near(x, before[i]!, 1e-5), `point ${i}: ${x} vs ${before[i]}`));
    assert.equal(r.style.opacity, opacity);
  }), params(30));
});

test('fade: FadeIn and FadeOut keep each family member\'s own opacity, 0 included (manim-web #467, #502)', async () => {
  // https://github.com/maloyan/manim-web/issues/467 (opacity 0 added as 1), https://github.com/maloyan/manim-web/pull/502
  await fc.assert(fc.asyncProperty(fc.array(fc.constantFrom(0, 0.14, 0.5, 1), { minLength: 1, maxLength: 4 }), async (ops) => {
    const kids = ops.map((o, i) => new Circle({ radius: 0.3 }).shift([i, 0]).setOpacity(o));
    const g = new Group(...kids);
    await film(async (s) => {
      await s.play(new FadeIn(g));
      await s.play(new FadeOut(g));
      assert.ok(!s.mobjects.includes(g), 'FadeOut takes the group off the screen');
      await s.play(new FadeIn(g));
    });
    assert.deepEqual(kids.map((k) => k.style.opacity), ops);
  }), params(30));
});

const paint: fc.Arbitrary<Style> = fc.record({
  fill: fc.oneof(fc.constant('none'), hex), stroke: fc.oneof(fc.constant('none'), hex),
  fillOpacity: fc.double({ min: 0, max: 1, noNaN: true }), strokeWidth: fc.double({ min: 0, max: 0.2, noNaN: true }), opacity: fc.double({ min: 0, max: 1, noNaN: true }),
});

test('create: Create and Write leave every member\'s style and points as they were (manim-web #501, #502; ManimCommunity #4439)', async () => {
  // https://github.com/maloyan/manim-web/issues/501 (fill-only children left invisible), https://github.com/maloyan/manim-web/pull/502,
  // https://github.com/ManimCommunity/manim/issues/4439 (Create moved points to the origin).
  await fc.assert(fc.asyncProperty(fc.array(paint, { minLength: 1, maxLength: 4 }), fc.boolean(), async (styles, write) => {
    const kids = styles.map((st, i) => new Rectangle({ width: 1, height: 1, ...st }).shift([i * 1.2 - 2, 0]));
    const g = new Group(...kids, new Text('ab', { fontSize: 0.5 }).shift([0, 1.5]));
    const before = g.family().map((m) => ({ ...m.style })), pts = pointsOf(g);
    await film(async (s) => { await s.play(write ? new Write(g) : new Create(g)); });
    assert.deepEqual(g.family().map((m) => ({ ...m.style })), before);
    assert.deepEqual(pointsOf(g), pts);
  }), params(40));
});

test('create: Create\'s stagger does not depend on how the drawn shapes are grouped (manim-web #544)', async () => {
  // https://github.com/maloyan/manim-web/issues/544 (wrong lag for composite mobjects). manim staggers
  // the family members that have points; Lantern gave every container (Group, Text) a slot too,
  // so wrapping shapes in one more Group delayed them.
  await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 4 }), fc.integer({ min: 1, max: 3 }), fc.double({ min: 0.05, max: 1, noNaN: true }), async (n, cut, lag) => {
    const shapes = () => Array.from({ length: n }, (_, i) => new Circle({ radius: 0.3 }).shift([i - 1.5, 0]));
    const k = Math.min(cut, n - 1);
    const flat = await film(async (s) => { await s.play(new Create(new Group(...shapes()), { lagRatio: lag })); });
    const nested = await film(async (s) => { const m = shapes(); await s.play(new Create(new Group(new Group(...m.slice(0, k)), new Group(new Group(...m.slice(k)))), { lagRatio: lag })); });
    assert.deepEqual(nested.frames, flat.frames);
  }), params(20));
});

test('create: wrapping Text in a Group preserves Write stagger', async () => {
  const word = await film(async (s) => { await s.play(new Write(new Text('lag'))); });
  const wrapped = await film(async (s) => { await s.play(new Write(new Group(new Text('lag')))); });
  assert.deepEqual(wrapped.frames, word.frames);
});

test('create: the temporary outline Write draws on text scales with the text (ManimCommunity #4220, #4222)', () => {
  // https://github.com/ManimCommunity/manim/issues/4220, https://github.com/ManimCommunity/manim/pull/4222:
  // a fixed outline width is a hairline on large text and a smear on small text.
  fc.assert(fc.property(fc.double({ min: 0.1, max: 3, noNaN: true }), fc.double({ min: 0.25, max: 4, noNaN: true }), (size, k) => {
    const border = (t: Text) => { const c = new Write(t); c.begin(); c.interpolate(0.3); return t.children[0]!.style.strokeWidth; };
    const built = border(new Text('Hi', { fontSize: size * k })), scaled = border(new Text('Hi', { fontSize: size }).scale(k));
    assert.ok(near(built, scaled, 1e-6 * size * k), `${built} vs ${scaled}`);
    // Text sizes are read back from Float32 points: equal to about 1e-7, relatively
    assert.ok(near(built / (size * k) / (border(new Text('Hi')) / 0.4), 1, 1e-5), 'proportional to the font size');
  }), params(200));
});

test('indicate: Indicate on a group of differently coloured children returns each child to its own colour (manim-web #856)', async () => {
  // https://github.com/maloyan/manim-web/issues/856
  await fc.assert(fc.asyncProperty(fc.array(fc.tuple(hex, hex), { minLength: 1, maxLength: 4 }), async (cs) => {
    const kids = cs.map(([f, s], i) => new Circle({ radius: 0.3, fill: f, stroke: s, fillOpacity: 1 }).shift([i, 0]));
    const g = new Group(...kids);
    await film(async (s) => { s.add(g); await s.play(new Indicate(g)); });
    assert.deepEqual(kids.map((k) => [k.style.fill, k.style.stroke]), cs);
  }), params(30));
});

// ===========================================================================
// Seeking, steps, partial rendering
// ===========================================================================

type Op = { kind: 'fadeIn' | 'fadeOut' | 'indicate' | 'lagged' | 'nested' | 'move' | 'create' | 'wait' | 'step'; i: number; t: number };
const op: fc.Arbitrary<Op> = fc.record({
  kind: fc.constantFrom('fadeIn', 'fadeOut', 'indicate', 'lagged', 'nested', 'move', 'create', 'wait', 'step'),
  i: fc.nat({ max: 3 }), t: fc.double({ min: 0.1, max: 0.6, noNaN: true }),
});
/** A scene class from a list of ops on a group of four coloured shapes; each op plays alone. */
function programScene(ops: readonly Op[]) {
  return class extends Scene {
    override async construct() {
      const kids = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'].map((c, i) => new Circle({ radius: 0.4, fill: c, fillOpacity: 1 }).shift([i * 1.2 - 2, 0]));
      const g = new Group(new Group(kids[0]!, kids[1]!), kids[2]!, kids[3]!);
      const path = new Arc({ radius: 2, angle: Math.PI });
      this.add(g);
      let n = 0;
      for (const o of ops) {
        const k = kids[o.i]!;
        const runTime = o.t;
        if (o.kind === 'step') await this.step(`s${n++}`, { caption: 'a few words to read' });
        else if (o.kind === 'wait') await this.wait(o.t);
        else if (o.kind === 'fadeIn') await this.play(new FadeIn(k, { shift: [0, 0.3] }), { runTime });
        else if (o.kind === 'fadeOut') await this.play(new FadeOut(k, { scale: 0.5 }), { runTime });
        else if (o.kind === 'indicate') await this.play(new Indicate(o.i % 2 ? g : k), { runTime });
        else if (o.kind === 'lagged') await this.play(new LaggedStart(kids.map((x) => new Indicate(x)), { lagRatio: 0.3 }), { runTime });
        else if (o.kind === 'nested') await this.play(new AnimationGroup([new AnimationGroup([new Transform(k, k.copy().shift([0, 0.5]))]), new FadeIn(kids[(o.i + 1) % 4]!)]), { rateFunc: thereAndBack });
        else if (o.kind === 'move') await this.play(new MoveAlongPath(k, path), { runTime });
        else await this.play(new Create(o.i % 2 ? g : k), { runTime });
      }
    }
  };
}

test('seek: a seeked frame equals the played frame across nested groups, Indicate on groups and re-shown FadeOuts (manim-web #854, #856, #861, #866)', async () => {
  // https://github.com/maloyan/manim-web/issues/854, https://github.com/maloyan/manim-web/issues/856,
  // https://github.com/maloyan/manim-web/issues/861, https://github.com/maloyan/manim-web/pull/866:
  // scrubbing showed a state plain playback never shows.
  await fc.assert(fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 7 }), fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 3 }), async (ops, at) => {
    const S = programScene(ops);
    const full = new StringSink();
    await new S(full, { fps: 20 }).run();
    for (const u of at) {
      const snap = { svg: '', async frame(scene: Scene) { this.svg = toSvgString(scene); } };
      const scene = await renderAt(S, u * (full.frames.length - 1) / 20, snap, { fps: 20 });
      assert.equal(snap.svg, full.frames[scene.frameCount], `seek to ${u} of the run`);
    }
  }), params(100));
});

test('seek: a dry-run index puts every step on the frame the full run puts it on (ManimCommunity #2152, #2236, #2449)', async () => {
  // https://github.com/ManimCommunity/manim/pull/2152 (next_section), https://github.com/ManimCommunity/manim/pull/2236
  // (skip_animations per section), https://github.com/ManimCommunity/manim/issues/2449 (timing off after a skipped section).
  await fc.assert(fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 8 }), async (ops) => {
    const S = programScene([{ kind: 'step', i: 0, t: 0.1 }, ...ops]);
    const ix = await indexScene(S, { fps: 20 });
    const live = new S(new NullSink(), { fps: 20 });
    await live.run();
    assert.deepEqual(ix.steps.map((s) => [s.name, s.frame0, s.frame1]), live.steps.map((s) => [s.name, s.frame0, s.frame1]));
    assert.equal(ix.frames, live.frameCount);
  }), params(100));
});

// ===========================================================================
// Paths: proportions, MoveAlongPath, bounding boxes
// ===========================================================================

test('path: pointFromProportion(u) is u of the way along the path by length (ManimCommunity #1274, #1314)', () => {
  // https://github.com/ManimCommunity/manim/pull/1274, https://github.com/ManimCommunity/manim/issues/1314:
  // proportions walked curves by index, so a short and a long segment took equal time and a
  // MoveAlongPath token sped up and slowed down (and left the tip of a Create-drawn edge).
  fc.assert(fc.property(fc.array(fc.double({ min: 0.01, max: 6, noNaN: true }), { minLength: 1, maxLength: 6 }), fc.double({ min: 0, max: 1, noNaN: true }), (lengths, u) => {
    const p = new VMobject();
    let x = 0;
    p.startNewPath([0, 0]);
    for (const l of lengths) { x += l; p.addLineTo([x, 0]); }
    const got = p.pointFromProportion(u);
    assert.ok(near(got[0], u * x, 1e-4 * Math.max(1, x)) && near(got[1], 0), `${got} vs ${u * x}`);
  }), params(500));
});

test('path: inside one curve, pointFromProportion follows length too, so it meets the tip Create reveals (ManimCommunity #1274)', () => {
  // https://github.com/ManimCommunity/manim/pull/1274: proportion is of length, not of the Bézier parameter.
  fc.assert(fc.property(fc.double({ min: 0.5, max: 10, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (len, h1, h2, u) => {
    // A straight curve, unevenly parameterised; handles in order, so it never doubles back
    const [lo, hi] = h1 <= h2 ? [h1, h2] : [h2, h1];
    const p = new VMobject();
    p.startNewPath([0, 0]); p.addCubic([lo * len, 0], [hi * len, 0], [len, 0]);
    assert.ok(near(p.pointFromProportion(u)[0], u * p.arcLength(), 0.03 * len), `x ${p.pointFromProportion(u)[0]} vs ${u * p.arcLength()}`);
  }), params(300));
});

test('path: MoveAlongPath keeps a token on the tip of the stroke Create is drawing (ManimCommunity #1274)', async () => {
  // https://github.com/ManimCommunity/manim/pull/1274: the token and a dash-drawn stroke disagreed on uneven paths.
  const edge = new VMobject({ stroke: '#ffffff' });
  edge.startNewPath([-6, 0]); edge.addLineTo([-5, 0]); edge.addLineTo([5, 0]);
  const token = new Dot().moveTo([-6, 0]);
  let worst = 0;
  const S = class extends Scene { override async construct() { await this.play(new Create(edge, { rateFunc: linear }), new MoveAlongPath(token, edge, { rateFunc: linear })); } };
  await new S({ async frame() {
    const f = edge.style.drawFraction;
    if (f != null) worst = Math.max(worst, Math.abs(token.center()[0] - (-6 + 11 * f)));
  } }, { fps: 30 }).run();
  assert.ok(worst < 1e-3, `token was ${worst} units off the drawn tip`);
});

test('path: pointFromProportion stays finite and exact at its ends on degenerate paths (ManimCommunity #4847, #5019, #4629)', () => {
  // https://github.com/ManimCommunity/manim/pull/4847, https://github.com/ManimCommunity/manim/pull/5019, https://github.com/ManimCommunity/manim/issues/4629
  const pt = fc.tuple(fc.constantFrom(0, 1, 2), fc.constantFrom(0, 1));
  fc.assert(fc.property(fc.array(fc.array(pt, { maxLength: 4 }), { minLength: 1, maxLength: 3 }), fc.double({ min: -1, max: 2 }), (subs, u) => {
    const p = new VMobject();
    for (const s of subs) { p.startNewPath(s[0] ?? [0, 0]); for (const q of s.slice(1)) p.addLineTo(q); }
    const got = p.pointFromProportion(u);
    assert.ok(got.every(Number.isFinite), `${got}`);
    if (p.numCurves() > 0) {
      const a = p.subpaths.find((x) => x.length > 2)!, z = [...p.subpaths].reverse().find((x) => x.length > 2)!;
      assert.deepEqual(p.pointFromProportion(0), [a[0], a[1]]);
      assert.deepEqual(p.pointFromProportion(1), [z[z.length - 2], z[z.length - 1]]);
    }
  }), params(500));
});

test('box: no transform leaves a bounding box inside out, negative stretches included (manim #2496)', () => {
  // https://github.com/3b1b/manim/pull/2496: stretch(-1) left min above max.
  fc.assert(fc.property(fc.oneof(fc.constantFrom(0, -0, Number.MIN_VALUE, -Number.MIN_VALUE), fc.double({ min: -3, max: 3, noNaN: true })), fc.constantFrom(0 as const, 1 as const), fc.double({ min: -4, max: 4, noNaN: true }), (k, axis, angle) => {
    const g = new Group(new Rectangle({ width: 2, height: 1 }), new Text('ab').shift([1, 1]));
    g.box(); // cache it first: a stale cache is what upstream got wrong
    g.stretch(k, axis).rotate(angle);
    const b = g.box()!;
    assert.ok(b[0] <= b[2] && b[1] <= b[3] && g.width() >= 0 && g.height() >= 0, `${b}`);
    assert.ok(g.left()[0] <= g.right()[0]);
  }), params(300));
});

test('box: a path\'s box contains every point it draws (ManimCommunity #3265, #3619, #4943)', () => {
  // https://github.com/ManimCommunity/manim/issues/3265 (box too small), https://github.com/ManimCommunity/manim/issues/3619
  // (box from control points), https://github.com/ManimCommunity/manim/pull/4943. Lantern's box covers every
  // control point, so it is never too small; it can be too large (see the report).
  fc.assert(fc.property(fc.double({ min: 0.2, max: 3, noNaN: true }), fc.double({ min: -7, max: 7, noNaN: true }), fc.double({ min: -4, max: 4, noNaN: true }), (r, angle, turn) => {
    const arc = new Arc({ radius: r, angle }).rotate(turn);
    const b = arc.box()!;
    for (let i = 0; i <= 200; i++) {
      const p = arc.pointFromProportion(i / 200);
      assert.ok(p[0] >= b[0] - 1e-6 && p[0] <= b[2] + 1e-6 && p[1] >= b[1] - 1e-6 && p[1] <= b[3] + 1e-6);
    }
  }), params(200));
});

// ===========================================================================
// Text, glyph metrics, Code panels
// ===========================================================================

const ascii = fc.string({ unit: fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c)), maxLength: 30 });

test('text: a monospace line is exactly one advance per character, spaces included (manim #1036; ManimCommunity #4289)', () => {
  // https://github.com/3b1b/manim/pull/1036 (leading spaces dropped), https://github.com/ManimCommunity/manim/issues/4289 (indented lines off)
  const one = new Text('x', { font: 'mono' }).advance();
  fc.assert(fc.property(ascii, (s) => {
    assert.ok(near(new Text(s, { font: 'mono' }).advance(), s.length * one, 1e-5), JSON.stringify(s));
  }), params(300));
});

test('code: consecutive Code lines sit one pitch apart whatever their ascenders and descenders (ManimCommunity #4692, #4626)', () => {
  // https://github.com/ManimCommunity/manim/pull/4692: lines without ascenders sat lower than lines with them.
  fc.assert(fc.property(fc.array(fc.string({ unit: fc.constantFrom('a', 'g', 'y', 'É', 'b', 'x', ' ', '_', '.'), maxLength: 8 }), { minLength: 2, maxLength: 6 }), fc.double({ min: 0.1, max: 0.6, noNaN: true }), (lines, fontSize) => {
    const c = new Code(lines, { fontSize, lineHeight: 1.5 });
    const base = c.lines.map((l) => l.frameBox[1]! + l.run.descent);
    for (let i = 1; i < base.length; i++) assert.ok(near(base[i - 1]! - base[i]!, fontSize * 1.5, 1e-5), `line ${i}`);
  }), params(200));
});

test('code: a tab advances to the next tab stop, as source editors draw it (manim #1316, #1036)', () => {
  // https://github.com/3b1b/manim/pull/1316 (tabs not processed), https://github.com/3b1b/manim/pull/1036 (tab_width).
  // A tab was shaped as one .notdef advance, so tab-indented code (Go, Makefiles) lost its indentation.
  const col = new Text('x', { font: 'mono', fontSize: 0.26 }).advance();
  /** The column a source editor puts the next character at: a tab moves to the next multiple of the width. */
  const columnAfter = (line: string, w: number) => [...line].reduce((c, ch) => (ch === '\t' ? (Math.floor(c / w) + 1) * w : c + 1), 0);
  fc.assert(fc.property(fc.string({ unit: fc.constantFrom('\t', 'a', ' ', 'b'), maxLength: 10 }), fc.integer({ min: 1, max: 8 }), (line, tabWidth) => {
    const c = new Code([line + 'Z'], { tabWidth });
    const z = c.lines[0]!.children.at(-1)!, left = c.lines[0]!.frameBox[0]!;
    const cols = columnAfter(line, tabWidth);
    assert.ok(near(z.box()![0] - left, cols * col + (new Text('Z', { font: 'mono', fontSize: 0.26 }).children[0]!.box()![0] - new Text('Z', { font: 'mono', fontSize: 0.26 }).frameBox[0]!), 1e-4), JSON.stringify(line));
    assert.equal(c.lines[0]!.text, line + 'Z', 'the line keeps its source text');
  }), params(200));
});

test('code: a Code line re-set to its own text keeps its tab stops; bad tab widths are refused (manim #1316)', () => {
  // https://github.com/3b1b/manim/pull/1316. `.text` keeps the source tabs, so setText must expand them again.
  fc.assert(fc.property(fc.string({ unit: fc.constantFrom('\t', 'a', ' ', 'é', 'é'), maxLength: 8 }), fc.integer({ min: 1, max: 8 }), (line, tabWidth) => {
    const c = new Code([line + 'x'], { tabWidth });
    const l = c.lines[0]!, before = pointsOf(l);
    l.setText(l.text);
    pointsOf(l).forEach((x, i) => assert.ok(near(x, before[i]!, 1e-5)));
  }), params(200));
  // An accented letter is one column, so the tab after it reaches the same stop as after 'x'
  const stop = (text: string) => { const l = new Code([text]).lines[0]!; return l.children.at(-1)!.box()![0] - l.frameBox[0]!; };
  assert.ok(near(stop('\u00e9\tZ'), stop('x\tZ'), 1e-4), 'é + tab reaches the same stop as x + tab');
  for (const w of [0, -1, 2.5, NaN, Infinity, -Infinity]) assert.throws(() => new Code(['\tx'], { tabWidth: w }), RangeError);
});

const anyText = fc.string({ unit: fc.constantFrom('', ' ', '\t', '\n', 'a', 'Q', '😀', '漢', 'a\u0301', '\u200d', '→', '0'), maxLength: 5 });

test('text: empty, blank and unsupported-script strings shape, Write and morph without NaN or throwing (ManimCommunity #2976, #3378, #3230, #2754)', async () => {
  // https://github.com/ManimCommunity/manim/issues/2976 (Write of '' divided by zero), https://github.com/ManimCommunity/manim/issues/3378,
  // https://github.com/ManimCommunity/manim/issues/3230 (a lone "0"), https://github.com/ManimCommunity/manim/issues/2754 (emoji crashed Code)
  await fc.assert(fc.asyncProperty(anyText, anyText, async (a, b) => {
    const { frames } = await film(async (s) => {
      const t = new Text(a);
      await s.play(new Write(t));
      await s.play(new Transform(t, new Text(b).shift([0, 1])));
      await s.play(new FadeOut(t));
      await s.play(new Create(new Code([a, b])));
    });
    assert.ok(frames.every(finiteFrame));
    assert.ok(Number.isFinite(new Text(a).advance()));
  }), params(60));
});

test('text: each glyph\'s cluster indexes the visible character it draws, so string ranges map to glyphs (ManimCommunity #4864)', () => {
  // https://github.com/ManimCommunity/manim/issues/4864: Text indices silently referred to a whitespace-stripped copy.
  fc.assert(fc.property(fc.string({ unit: fc.constantFrom('a', ' ', 'b', '\t', 'é', 'fi', '→', 'W', '😀'), maxLength: 12 }), (s) => {
    const t = new Text(s);
    let prev = -1;
    for (const g of t.children as Array<Mobject & { cluster?: number }>) {
      const c = g.cluster!;
      assert.ok(Number.isInteger(c) && c > prev && c < s.length, `cluster ${c} in ${JSON.stringify(s)}`);
      assert.ok(!/\s/.test(s[c]!), `glyph at ${c} draws whitespace`);
      prev = c;
    }
  }), params(300));
  // An unsupported astral symbol still occupies two UTF-16 code units.
  const afterAstral = new Text('😀a');
  assert.deepEqual(afterAstral.children.map((g) => (g as Mobject & { cluster: number }).cluster), [2]);
});

test('text: layout is scale-free, so letter spacing does not drift with font size (ManimCommunity #2844; manim #1813)', () => {
  // https://github.com/ManimCommunity/manim/issues/2844, https://github.com/3b1b/manim/issues/1813: kerning changed with font size.
  fc.assert(fc.property(fc.string({ unit: fc.constantFrom('A', 'V', 'T', 'o', 'W', 'a', 'y', '.', ' '), minLength: 1, maxLength: 12 }), fc.double({ min: 0.05, max: 4, noNaN: true }), (s, size) => {
    const a = new Text(s, { fontSize: size, anchor: 'start' }), b = new Text(s, { fontSize: 1, anchor: 'start' });
    assert.ok(near(a.advance() / size, b.advance(), 1e-5), `${a.advance() / size} vs ${b.advance()}`);
    a.children.forEach((g, i) => assert.ok(near((g.box()![0] - a.frameBox[0]!) / size, b.children[i]!.box()![0] - b.frameBox[0]!, 1e-4)));
  }), params(300));
});

test('decimal: a DecimalNumber never shows a negative zero (manim-web #869, #870)', () => {
  // https://github.com/maloyan/manim-web/issues/869, https://github.com/maloyan/manim-web/issues/870: the number stuck on 0 around zero.
  // toFixed() gives "-0" and "-0.00" for small negatives, so a count passing zero flickered a minus sign.
  fc.assert(fc.property(fc.double({ min: -2, max: 2, noNaN: true }), fc.integer({ min: 0, max: 4 }), (v, d) => {
    const s = DecimalNumber.format(v, d, '', '');
    assert.doesNotMatch(s, /^-0(\.0*)?$/);
    assert.ok(near(Number(s), v, 0.5 * 10 ** -d + 1e-12));
  }), params(1000));
});

test('decimal: setValue keeps a rotated, scaled number\'s angle and size (ManimCommunity #4843, #4830)', () => {
  // https://github.com/ManimCommunity/manim/pull/4843: set_value on a rotated DecimalNumber lost its rotation and inflated its size.
  fc.assert(fc.property(fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: 0.3, max: 3, noNaN: true }), fc.double({ min: -99, max: 99, noNaN: true }), (angle, k, v) => {
    const d = new DecimalNumber(5, { decimals: 1, anchor: 'start' }).scale(k).rotate(angle).shift([1, 2]);
    const at = d.anchorPoint(), size = d.textSize();
    d.setValue(v);
    const fresh = new DecimalNumber(v, { decimals: 1, fontSize: 0.4 * k, anchor: 'start' });
    assert.ok(near(d.textSize(), size, 1e-4), `size ${d.textSize()} vs ${size}`);
    assert.ok(near(Math.cos(d.angle() - angle), 1, 1e-6), `angle ${d.angle()} vs ${angle}`);
    assert.ok(near(d.anchorPoint()[0], at[0], 1e-4) && near(d.anchorPoint()[1], at[1], 1e-4), 'anchor kept');
    const diag = (t: Text) => Math.hypot(t.frameBox[2]! - t.frameBox[0]!, t.frameBox[3]! - t.frameBox[1]!);
    assert.ok(near(diag(d), diag(fresh), 1e-4), 'the same advance box as the number freshly made at that size');
  }), params(300));
});

test('text: setText with the same string changes no glyph, whatever the text has been turned, mirrored, stretched or sheared by (ManimCommunity #4843)', () => {
  // https://github.com/ManimCommunity/manim/pull/4843: set_value lost what had been done to the number.
  const affine = fc.tuple(fc.double({ min: -2, max: 2, noNaN: true }), fc.double({ min: -2, max: 2, noNaN: true }), fc.double({ min: -2, max: 2, noNaN: true }), fc.double({ min: -2, max: 2, noNaN: true }))
    .filter(([a, b, c, d]) => Math.abs(a * d - b * c) > 0.05);
  fc.assert(fc.property(fc.string({ unit: fc.constantFrom('a', 'W', '1', '.', ' ', 'g'), minLength: 1, maxLength: 6 }), affine, vec, fc.constantFrom('start' as const, 'middle' as const, 'end' as const), (str, [a, b, c, d], at, anchor) => {
    const t = new Text(str, { anchor }).applyAffine(a, b, c, d, at[0], at[1]);
    const before = pointsOf(t);
    t.setText(str);
    const after = pointsOf(t);
    assert.equal(after.length, before.length);
    after.forEach((x, i) => assert.ok(near(x, before[i]!, 1e-4), `${JSON.stringify(str)} [${a}, ${b}, ${c}, ${d}]: point ${i} ${x} vs ${before[i]}`));
    assert.ok(t.textSize() > 0);
  }), params(300));
});

test('fonts: the shaping memo stays bounded however many distinct strings are shaped (ManimCommunity #1959; manim-web #82)', () => {
  // https://github.com/ManimCommunity/manim/issues/1959 (DecimalNumber with an updater got slower and slower),
  // https://github.com/maloyan/manim-web/issues/82 (a counter that grows without bound). A counting
  // DecimalNumber shapes a new string every frame, and the memo kept all of them.
  const shape = shaperFor('sans');
  const idle = shape('idle', 0.4), busy = shape('busy', 0.4);
  assert.equal(shape('idle', 0.4), idle, 'a repeat is memoized');
  for (let i = 0; i < 20_000; i++) {
    new DecimalNumber(i * 0.37, { decimals: 2 });
    if (i % 1000 === 0) shape('busy', 0.4);
  }
  assert.notEqual(shape('idle', 0.4), idle, 'the idle run was let go: the memo is bounded');
  assert.equal(shape('busy', 0.4), busy, 'a run still in use stays memoized (least recently used goes first)');
});

// ===========================================================================
// SVG export and import
// ===========================================================================

/** The stretches along [0, total] a dash array and offset paint, as [from, to] pairs. */
function painted(dash: number[], offset: number, total: number): Array<[number, number]> {
  const list = dash.length % 2 ? [...dash, ...dash] : dash, period = list.reduce((a, b) => a + b, 0);
  const out: Array<[number, number]> = [];
  let s = -(((offset % period) + period) % period), j = 0;
  while (s < total) {
    const e = s + list[j]!;
    if (j % 2 === 0 && e > 0 && e > s) out.push([Math.max(0, s), Math.min(total, e)]);
    s = e; j = (j + 1) % list.length;
  }
  return out.filter(([a, b]) => b > a);
}
/** Total length where two sets of painted stretches disagree. */
function disagreement(a: Array<[number, number]>, b: Array<[number, number]>, total: number): number {
  const xs = [...new Set([0, total, ...a.flat(), ...b.flat()])].sort((x, y) => x - y);
  const inside = (set: Array<[number, number]>, x: number) => set.some(([p, q]) => x > p && x < q);
  let bad = 0;
  for (let i = 1; i < xs.length; i++) { const m = (xs[i - 1]! + xs[i]!) / 2; if (inside(a, m) !== inside(b, m)) bad += xs[i]! - xs[i - 1]!; }
  return bad;
}

test('svg: a dashed stroke keeps its dashes while Create draws it, and shows nothing past the drawn tip (ManimCommunity #3989, #4606; manim #2147)', () => {
  // https://github.com/ManimCommunity/manim/issues/3989 and https://github.com/ManimCommunity/manim/pull/4606 (dashed
  // lines that broke when created or changed), https://github.com/3b1b/manim/pull/2147 (ShowCreation of a DashedLine
  // ignored its timing). Create's reveal replaced stroke-dasharray, so a dashed edge drew in
  // solid and turned dashed with a pop when the animation ended.
  fc.assert(fc.property(fc.array(fc.double({ min: 0.02, max: 0.6, noNaN: true }), { minLength: 1, maxLength: 4 }), fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: 0, max: 0.999, noNaN: true }), fc.double({ min: 1, max: 12, noNaN: true }), (dash, offset, f, len) => {
    const line = new Line([-6, 0], [-6 + len, 0], { stroke: '#ffffff', dashArray: dash.join(' '), dashOffset: offset });
    line.style.drawFraction = f;
    const el = renderElements((() => { const s = new Scene(new NullSink()); s.add(line); return s; })())[0]!;
    const units = (v: string) => v.split(' ').map((x) => Number(x) / 1000);
    const total = line.arcLength() + 0.001, drawnTo = total * f;
    const got = painted(units(el.attrs['stroke-dasharray']!), Number(el.attrs['stroke-dashoffset'] ?? 0) / 1000, total);
    const want = painted(dash, offset, total).map(([a, b]) => [a, Math.min(b, drawnTo)] as [number, number]).filter(([a, b]) => b > a);
    const per = dash.length * 2 + 2; // each boundary rounds to 1/1000 of a unit
    assert.ok(disagreement(got, want, total) < 1e-3 * per * (1 + total / dash.reduce((a, b) => a + b, 0)), `dash ${dash} offset ${offset} f ${f}`);
  }), params(300));
});

test('svg: dash lists with stray separators, commas, odd lengths or "none" serialise as valid patterns (SVG 1.1 §11.4; explain/diagrams.ts scaleStyle)', () => {
  // No single upstream issue: SVGMobject dash handling churned across manim #1052, #1427 and ManimCommunity #1823.
  // `' 0.1, 0.2'.split(/[ ,]+/)` yields a leading '' that serialised as an extra 0-length dash.
  fc.assert(fc.property(fc.array(fc.double({ min: 0.01, max: 1, noNaN: true }), { minLength: 1, maxLength: 5 }), fc.constantFrom(' ', ',', ', ', '  '), fc.boolean(), (nums, sep, pad) => {
    const list = (pad ? ' ' : '') + nums.join(sep) + (pad ? ', ' : '');
    const el = renderElements((() => { const s = new Scene(new NullSink()); s.add(new Line([0, 0], [3, 0], { dashArray: list })); return s; })())[0]!;
    assert.deepEqual(el.attrs['stroke-dasharray']!.split(' ').map(Number), nums.map((v) => Math.round(v * 1000)));
  }), params(300));
  for (const none of ['none', '', '0 0', '-1 2', 'NaN']) {
    const el = renderElements((() => { const s = new Scene(new NullSink()); s.add(new Line([0, 0], [3, 0], { dashArray: none })); return s; })())[0]!;
    assert.equal(el.attrs['stroke-dasharray'], undefined, `${JSON.stringify(none)} is a solid stroke`);
  }
});
