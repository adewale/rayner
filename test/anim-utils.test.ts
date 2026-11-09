// saveState/restore and Restore, TransformFromCopy, Succession: the end states
// they promise, their timing against plain play() calls, and seek equality.
import { test } from 'node:test';
import { Square, Restore, TransformFromCopy } from '../src/extras.ts';
import assert from 'node:assert/strict';
import { Scene, Mobject, Group, Rectangle, Circle, Polygon, Text, Code, Transform, FadeIn, FadeOut, Create, AnimationGroup, LaggedStart, Succession, TransformMatchingText } from '../src/index.ts';
import { StringSink, SnapshotSink, toSvgString, renderFrame } from '../src/output.ts';
import { MotionSink, analyzeMotion, loadFonts, traceScene } from '../explain/testing.ts';
import { Indicate, Flash } from './lib/transient.ts';
import type { SceneOptions, Sink } from '../src/index.ts';
import type { Vec } from '../src/index.ts';
// Manim's values, which the package no longer exports.
const BLUE = '#58c4dd';
const DOWN: Vec = [0, -1];
const GREEN = '#83c167';
const LEFT: Vec = [-1, 0];
const RED = '#fc6255';
const RIGHT: Vec = [1, 0];
const UP: Vec = [0, 1];

await loadFonts();
Scene.captionWpm = Infinity;

/** Every family member's points and style, as plain data. */
const data = (m: Mobject) => m.family().map((f) => ({
  cls: f.constructor.name,
  points: f.pointArrays().map((a) => Array.from(a)),
  style: { ...f.style },
  text: (f as { text?: string }).text,
}));

/** A scene whose construct() is `body`. */
const sceneOf = (body: (s: Scene) => Promise<void>) => class extends Scene {
  override async construct() { await body(this); }
};

/** The same mobjects, copied into a new scene: a copy hits none of its original's render caches. */
const fresh = (scene: Scene): Scene => new Scene(new StringSink()).add(...scene.mobjects.map((m) => m.copy()));

const run = async (body: (s: Scene) => Promise<void>, sink: Sink = new StringSink(), opts: SceneOptions = {}) => {
  const S = sceneOf(body);
  const s = new S(sink, opts);
  await s.run();
  return s;
};

// ---- saveState / restore ----------------------------------------------------

test('restore() returns points, style and text to the saved state, keeping the children', () => {
  const box = new Rectangle({ width: 2, height: 1 });
  const dot = new Circle({ radius: 0.2 }).shift(RIGHT);
  const label = new Text('12');
  const g: Group & { part?: Mobject } = new Group(box, dot, label);
  g.part = box; // a reference to a part, as panels keep
  g.saveState();
  const before = data(g);
  g.shift(UP).scale(1.5);
  box.setFill(RED, 0.5);
  dot.setOpacity(0.3);
  dot.clipBox = [0, 0, 1, 1];
  g.part = dot;
  label.setText('34'); // same glyph count: same shape, different string
  assert.notDeepEqual(data(g), before);
  g.restore();
  assert.deepEqual(data(g), before);
  assert.equal(dot.clipBox, undefined, 'a field set after the save is gone');
  assert.equal(g.children[0], box, 'same structure: the children are the same objects');
  assert.equal(g.part, box, 'a reference to a part is restored too, to the same object');
  assert.equal(label.text, '12');
  assert.ok(box.parent === g && g.children.every((c) => c.parent === g));
  // The saved state is untouched, so restore() runs again
  g.shift(DOWN); g.restore();
  assert.deepEqual(data(g), before);
});

test('restore() on a Code keeps `lines` naming its own children, not the saved copy\'s', async () => {
  // Code.copy() rebinds `lines` to the copy's children, so the saved state's lines are
  // another family's; adopting them verbatim left spans drawing each line twice
  // (found by an explainer's text-collision check).
  await loadFonts();
  const code = new Code(['a = 1', 'b = 2']);
  code.saveState();
  code.lines[0]!.setFill(RED);
  code.restore();
  assert.equal(code.lines.length, 2);
  code.lines.forEach((l, i) => assert.equal(l, code.children[i], `line ${i} is the child, not a detached copy`));
  assert.equal(code.lines[0]!.children[0]!.style.fill, '#1f2328', 'the colour is restored (the neutral ink, as a Code without a colour has)');
  // The same through the Restore animation
  const scene = new Scene(new SnapshotSink());
  scene.add(code);
  code.lines[1]!.setFill(BLUE);
  await scene.play(new Restore(code, { runTime: 0.2 }));
  code.lines.forEach((l, i) => assert.equal(l, code.children[i]));
  assert.equal(code.span(1, 0, 1).box() !== null, true, 'spans still address the live glyphs');
});

test('restore() after the family changed shape takes the saved children wholesale', () => {
  const label = new Text('ab');
  const outer = new Group(label);
  const parent = new Group(outer);
  outer.saveState();
  const before = data(outer);
  label.setText('a much longer string');
  outer.add(new Square());
  outer.restore();
  assert.deepEqual(data(outer), before);
  assert.equal(outer.parent, parent, 'keeps its parent');
  assert.ok(outer.children.every((c) => c.parent === outer));
  assert.equal(outer.children.length, 1);
  assert.throws(() => new Square().restore(), /saveState/);
});

test('copy() does not carry the saved state', () => {
  const s = new Square().saveState();
  assert.ok(s.saved);
  assert.equal(s.copy().saved, undefined);
  assert.equal(new Group(s).copy().children[0]!.saved, undefined);
});

// ---- Restore -----------------------------------------------------------------

test('Restore after Indicate and after an .animate change lands on the saved frame byte for byte', async () => {
  let saved = '';
  let box!: Rectangle;
  await run(async (s) => {
    box = new Rectangle({ width: 2, height: 1, fill: BLUE, fillOpacity: 0.5 });
    await s.play(new FadeIn(box));
    box.saveState();
    saved = toSvgString(s);
    const pts = data(box);
    await s.play(new Indicate(box));
    await s.play(new Restore(box));
    assert.equal(toSvgString(s), saved, 'after Indicate');
    assert.equal(toSvgString(fresh(s)), saved, 'after Indicate, rendered without caches');
    await s.play(box.animate.setFill(RED).scale(1.5).shift(RIGHT));
    assert.notEqual(toSvgString(s), saved);
    await s.play(new Restore(box));
    assert.equal(toSvgString(s), saved, 'after .animate');
    assert.equal(toSvgString(fresh(s)), saved, 'after .animate, rendered without caches');
    assert.deepEqual(data(box), pts);
    // A structural change since the save: the morph aligns, the end is exact anyway
    await s.play(new Transform(box, new Circle({ radius: 1 }).shift(LEFT)));
    await s.play(new Restore(box));
    assert.equal(toSvgString(s), saved, 'after a morph into a circle');
    assert.equal(toSvgString(fresh(s)), saved, 'after a morph into a circle, rendered without caches');
    assert.deepEqual(data(box), pts);
  });
});

test('Restore without saveState() says what to do', async () => {
  await assert.rejects(run(async (s) => { await s.play(new Restore(new Square())); }), /saveState/);
});

// ---- TransformFromCopy -------------------------------------------------------

test('TransformFromCopy leaves the source alone and the scene holding the target', async () => {
  await run(async (s) => {
    const a = new Square({ side: 1 }).shift([-2, 0]);
    const b = new Circle({ radius: 0.6 }).shift([3, 1]);
    s.add(a);
    const aBefore = data(a), bBefore = data(b);
    await s.play(new TransformFromCopy(a, b));
    assert.deepEqual(data(a), aBefore, 'source unchanged');
    assert.deepEqual(data(b), bBefore, 'target is exactly as built');
    assert.deepEqual(s.mobjects, [a, b], 'no copy left behind');
  });
});

test('TransformFromCopy and an animation on the source share a play', async () => {
  await run(async (s) => {
    const a = new Square().shift([-2, 0]), b = new Square().shift([2, 0]);
    s.add(a);
    const aBefore = data(a);
    await s.play(new TransformFromCopy(a, b), new Indicate(a));
    assert.deepEqual(data(a), aBefore, 'Indicate went there and back');
    assert.deepEqual(s.mobjects, [a, b]);
  });
});

test('TransformFromCopy copies its source before anything in its play begins, in either argument order', async () => {
  // Create's begin() hides its mobject: a copy taken after it would morph from nothing
  const body = (copyFirst: boolean, onScreen: boolean) => async (s: Scene) => {
    const a = new Square({ side: 1 }).shift([-3, 0]), b = new Circle({ radius: 0.5 }).shift([3, 0]);
    if (onScreen) s.add(a);
    const anims = [new TransformFromCopy(a, b), new Create(a)];
    await s.play(...(copyFirst ? anims : anims.reverse()));
    await s.wait(0.1);
  };
  // Mobjects new to the scene are drawn in argument order, so there compare the set of paths
  const paths = (svg: string) => (svg.match(/<path[^>]*>/g) ?? []).sort().join('\n');
  for (const onScreen of [true, false]) {
    const x = new StringSink(), y = new StringSink();
    await run(body(true, onScreen), x);
    await run(body(false, onScreen), y);
    if (onScreen) assert.deepEqual(y.frames, x.frames);
    else assert.deepEqual(y.frames.map(paths), x.frames.map(paths));
  }
  // and a seek lands on the frame the full run drew
  const S = sceneOf(body(false, true)), full = new StringSink();
  await new S(full).run();
  for (const frame of [3, 15, 27, 32]) {
    const snap = new SnapshotSink();
    await renderFrame(S, frame, snap);
    assert.equal(snap.svg, full.frames[frame], `seek to frame ${frame}`);
  }
});

// ---- Succession --------------------------------------------------------------

/** The same three animations, as one Succession or as three plays. */
const chain = (together: boolean) => async (s: Scene) => {
  await s.step('setup');
  const box = new Square({ side: 1, fill: BLUE, fillOpacity: 0.6 });
  const c = new Circle({ radius: 0.4 }).shift([3, 0]);
  await s.play(new FadeIn(box));
  await s.step('chain');
  const anims = () => [
    new Indicate(box, { runTime: 0.5 }),
    box.animate.shift([-2, 1]),
    new FadeIn(c, { shift: UP }),
    new FadeOut(box, { runTime: 0.7 }),
  ];
  if (together) await s.play(new Succession(anims()));
  else for (const a of anims()) await s.play(a);
  await s.step('after');
  await s.wait(0.5);
};

test('a Succession runs like consecutive plays: same frames, same step times', async () => {
  const a = new StringSink(), b = new StringSink();
  const sa = await run(chain(true), a), sb = await run(chain(false), b);
  assert.equal(sa.frameCount, sb.frameCount);
  assert.equal(sa.time, sb.time);
  assert.deepEqual(sa.mobjects.map((m) => m.constructor.name), ['Circle'], 'the FadeOut member removed the box');
  assert.deepEqual(a.frames, b.frames);
  const ia = await traceScene(sceneOf(chain(true))), ib = await traceScene(sceneOf(chain(false)));
  assert.deepEqual(ia.steps.map((x) => [x.step, x.t0, x.frame0]), ib.steps.map((x) => [x.step, x.t0, x.frame0]));
  assert.equal(ia.duration, ib.duration);
});

test('a lagRatio passed to play() leaves a Succession sequential', async () => {
  const succession = new Succession([new FadeIn(new Square(), { runTime: 1 }), new FadeIn(new Circle(), { runTime: 1 })]);
  const s = await run(async (s) => { await s.play(succession, { lagRatio: 0.5 }); });
  assert.deepEqual(succession.timings, [[0, 1], [1, 2]]);
  assert.equal(succession.runTime, 2);
  assert.equal(Math.round(s.time * s.fps), 60);
});

test('seeking into a Succession whose member brings an updater matches the full run', async () => {
  // The Flash member adds b, which has an updater, a second into the play: from that
  // frame on, the full run integrates it, so a seek must stop skipping there too.
  const S = sceneOf(async (s) => {
    const a = new Square({ side: 1 });
    const b = new Circle({ radius: 0.5 }).shift([-3, 0]);
    b.addUpdater((m, dt) => { m.shift([dt, 0]); });
    await s.play(new Succession([new Create(a), new Flash(b)]));
    await s.wait(0.2);
  });
  const full = new StringSink();
  await new S(full).run();
  for (let i = 1; i < full.frames.length; i += 4) {
    const snap = new SnapshotSink();
    const scene = await renderFrame(S, i, snap);
    const k = Math.round(scene.time * scene.fps);
    assert.equal(snap.svg, full.frames[k], `seek to frame ${k}`);
  }
});

test('Succession run time is the sum of its members', () => {
  const s = new Succession([new FadeIn(new Square(), { runTime: 0.5 }), new FadeIn(new Circle(), { runTime: 1.25 })]);
  assert.equal(s.runTime, 1.75);
});

test('a Succession of groups runs like consecutive plays of them', async () => {
  const body = (together: boolean) => async (s: Scene) => {
    const p = new Square({ side: 1 }).shift([-3, 0]), q = new Circle({ radius: 0.5 }).shift([3, 0]);
    const anims = () => [
      new AnimationGroup([new FadeIn(p), new Create(q)]),
      new LaggedStart([new Transform(p, p.copy().shift(UP)), new Transform(q, q.copy().shift(UP))]),
      new Succession([new Indicate(p), new FadeOut(q)]),
    ];
    if (together) await s.play(new Succession(anims()));
    else for (const a of anims()) await s.play(a);
    await s.wait(0.2);
  };
  const a = new StringSink(), b = new StringSink();
  const sa = await run(body(true), a), sb = await run(body(false), b);
  assert.equal(sa.frameCount, sb.frameCount);
  assert.deepEqual(a.frames, b.frames);
  assert.deepEqual(sa.mobjects.map((m) => m.constructor.name), ['Square']);
});

test('a Succession inside a group runs beside the other members', async () => {
  let p!: Square, q!: Circle;
  const s = await run(async (s) => {
    p = new Square({ side: 1 }).shift([-3, 0]); q = new Circle({ radius: 0.5 }).shift([3, 0]);
    await s.play(new AnimationGroup([
      new Succession([new FadeIn(p), p.animate.shift(RIGHT), new Indicate(p)]),
      new FadeIn(q, { runTime: 2 }),
    ], { rateFunc: (t) => t }));
  });
  assert.equal(Math.round(s.time * s.fps), 90);
  assert.deepEqual(s.mobjects, [p, q], 'listed order, each added as it begins');
  assert.deepEqual(p.center().map((x) => Math.round(x * 1e6) / 1e6), [-2, 0]);
  assert.equal(q.style.opacity, 1);
});

test('play() still refuses two animations on one mobject, through a Succession', async () => {
  await assert.rejects(run(async (s) => {
    const a = new Square(); s.add(a);
    await s.play(new Succession([new Indicate(a)]), new Indicate(a));
  }), /both animate/);
  await assert.rejects(run(async (s) => {
    const a = new Square(); s.add(a);
    await s.play(new Succession([new AnimationGroup([new Indicate(a), new FadeOut(a)])]));
  }), /both animate/);
  // Members of one Succession may share a mobject: they never overlap in time
  await run(async (s) => {
    const a = new Square(); s.add(a);
    await s.play(new Succession([new Indicate(a), a.animate.shift(RIGHT), new Indicate(a)]));
    assert.deepEqual(a.center().map((x) => Math.round(x * 1e6) / 1e6), [1, 0]);
    // An .animate member builds its target when its turn comes, from where the last one left off
    await s.play(new Succession([a.animate.shift(RIGHT), a.animate.shift(UP)]));
    assert.deepEqual(a.center().map((x) => Math.round(x * 1e6) / 1e6), [2, 1]);
  });
});

// ---- seek equality and motion -------------------------------------------------

class AllThree extends Scene {
  override async construct() {
    const box = new Rectangle({ width: 2, height: 1, fill: BLUE, fillOpacity: 0.5 }).shift([-3, 1]);
    const dot = new Circle({ radius: 0.3, fill: GREEN, fillOpacity: 1 }).shift([3, -1]);
    const label = new Text('hello').shift([0, 2.5]);
    const tile = new Square({ side: 0.8, fill: GREEN, fillOpacity: 0.4 }).shift([3, 2]);
    await this.step('show');
    await this.play(new FadeIn(box), new Create(dot), new FadeIn(label));
    box.saveState();
    await this.step('change');
    await this.play(box.animate.setFill(RED).scale(1.3).shift([1, -1]));
    await this.play(new Transform(box, new Circle({ radius: 0.8 }).shift([0, -1])));
    await this.step('copy');
    await this.play(new TransformFromCopy(dot, tile), new Indicate(dot));
    await this.step('sequence');
    await this.play(new Succession([new Indicate(label), dot.animate.shift([-1, 0]), new Restore(box)]));
    await this.step('end');
    await this.wait(0.5);
  }
}

test('Restore, TransformFromCopy and Succession seek to the frame a full run produces', async () => {
  const full = new StringSink();
  await new AllThree(full).run();
  const ix = await traceScene(AllThree);
  assert.equal(full.frames.length, ix.frames + 1);
  const frames = [12, 36, 45, 69, ...ix.steps.map((s) => s.frame0), ix.steps[3]!.frame0 + 18, ix.steps[3]!.frame0 + 42, ix.steps[3]!.frame0 + 75, ix.frames];
  for (const i of frames) {
    const snap = new SnapshotSink();
    await renderFrame(AllThree, i, snap);
    assert.equal(snap.svg, full.frames[i], `seek to frame ${i}`);
  }
});

test('the motion verifier finds no teleport, pop or cut in these animations', async () => {
  const sink = new MotionSink();
  await new AllThree(sink).run();
  assert.deepEqual(analyzeMotion(sink), []);
  const chained = new MotionSink();
  await run(chain(true), chained);
  assert.deepEqual(analyzeMotion(chained), []);
  const saved = new MotionSink();
  await run(async (s) => {
    const a = new Square().shift([-2, 0]); s.add(a);
    a.saveState();
    await s.wait(0.2);
    await s.play(a.animate.shift([3, 0]).setFill(RED, 1));
    await s.play(new Restore(a));
    await s.play(new TransformFromCopy(a, new Circle().shift([2, 1])), new Indicate(a));
    await s.wait(0.2);
  }, saved);
  assert.deepEqual(analyzeMotion(saved), []);
});

test('brighter shapes over faint ones and far-away arrivals are cut-ins', async () => {
  const kinds = async (body: (s: Scene) => Promise<void>) => {
    const sink = new MotionSink();
    await run(body, sink);
    return analyzeMotion(sink).map((e) => e.kind);
  };
  assert.deepEqual(await kinds(async (s) => {
    const a = new Square({ fill: BLUE, fillOpacity: 0.2, strokeOpacity: 0.2 }); s.add(a);
    await s.wait(0.2);
    s.add(new Square({ fill: RED, fillOpacity: 1 }));
    await s.wait(0.2);
  }), ['cut-in']);
  assert.deepEqual(await kinds(async (s) => {
    s.add(new Square().shift([-3, 0]));
    await s.wait(0.2);
    s.add(new Square().shift([3, 0]));
    await s.wait(0.2);
  }), ['cut-in']);
});

test('a cut-in is exempt over a staying leaf only when it is a copy of it or looks the same', async () => {
  const kinds = async (body: (s: Scene) => Promise<void>) => {
    const sink = new MotionSink();
    await run(body, sink);
    return analyzeMotion(sink).map((e) => e.kind);
  };
  // A filled square popping in, with no outline and inside a stroke-only one: a cut-in either way
  for (const outline of [false, true]) {
    assert.deepEqual(await kinds(async (s) => {
      if (outline) s.add(new Square({ side: 2, stroke: '#ffffff', fill: 'none' }));
      await s.wait(0.2);
      s.add(new Square({ side: 1.8, fill: RED, fillOpacity: 1, stroke: 'none' }));
      await s.wait(0.2);
    }), ['cut-in'], outline ? 'inside an outline' : 'on its own');
  }
  // A copy over its source is none, also when aligning to the target changed its points
  assert.deepEqual(await kinds(async (s) => {
    const a = new Square({ fill: RED, fillOpacity: 1 }); s.add(a);
    await s.wait(0.2);
    const hexagon = new Polygon([[0, 1], [0.87, 0.5], [0.87, -0.5], [0, -1], [-0.87, -0.5], [-0.87, 0.5]]).shift([3, 0]);
    await s.play(new TransformFromCopy(a, hexagon));
    await s.wait(0.2);
  }), []);
  // nor are the pieces of a copied text taking off from it (glyphs keep their shapes as they move)
  assert.deepEqual(await kinds(async (s) => {
    const t = new Text('hello world'); s.add(t);
    await s.wait(0.2);
    await s.play(new TransformMatchingText(t.copy(), new Text('low hello').shift([0, -1])));
    await s.wait(0.2);
  }), []);
});

test('play() with a lone .animate builder animates it (it is not the options object)', async () => {
  await run(async (s) => {
    const a = new Square(); s.add(a);
    await s.play(a.animate.shift(RIGHT));
    assert.equal(Math.round(s.time * s.fps), 30);
    assert.deepEqual(a.center().map((x) => Math.round(x * 1e6) / 1e6), [1, 0]);
  });
});
