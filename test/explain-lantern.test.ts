// The engine rules the lantern explainer states about seeking: the fixed clock, sinks that only
// read, an animation blended by its share of its run time, and a still that skips the frames
// before t unless the scene has updaters. Each is asserted over every frame of small scenes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Scene,
  Rectangle,
  Dot,
  Circle,
  Square,
  Group,
  FadeIn,
  Transform,
  StringSink,
  SnapshotSink,
  NullSink,
  SeekSink,
  TraceSink,
  MotionSink,
  DomSink,
  StopScene,
  renderAt,
  toSvgString,
  smooth,
} from '../src/index.ts';
import type { Mobject, Sink, Step, Vec } from '../src/index.ts';

Scene.captionWpm = Infinity;
const FPS = 30;

/** A scene built only from Rayner's own animations: a fade, a morph, a move, a wait. */
class TimeOnly extends Scene {
  override async construct() {
    await this.step('one', { title: 'One' });
    const box = new Rectangle({ width: 2, height: 1, stroke: '#222222', fill: '#88aadd', fillOpacity: 0.4 }).moveTo([-3, 1]);
    const dot = new Dot({ radius: 0.3 }).moveTo([-5, -2]);
    await this.play(new FadeIn(box), new FadeIn(dot), { runTime: 0.5 });
    await this.play(new Transform(box, new Square({ side: 2.5, stroke: '#222222' }).moveTo([2, 1])), dot.animate.moveTo([5, -2]), { runTime: 1 });
    await this.step('two', { title: 'Two' });
    await this.play(new Transform(box, new Circle({ radius: 1, stroke: '#222222' }).moveTo([0, 0])), { runTime: 0.7 });
    await this.wait(0.3);
  }
}

/** Every frame of a full run, by frame number, as SVG. */
async function played(S: import('../src/index.ts').SceneClass): Promise<string[]> {
  const frames: string[] = [];
  await new S({ async frame(s: Scene) { frames[s.frameCount] = toSvgString(s); } }).run();
  return frames;
}

test('clock: frame k is t = k / fps in every run, whatever the sink’s pace, and a seek to k / fps lands on frame k', async () => {
  /** The scene time at each frame number, from a sink that takes `pause` before returning each frame. */
  const times = async (pause: () => Promise<void>) => {
    const at: number[] = [];
    await new TimeOnly({
      async frame(s: Scene) {
        await pause();
        assert.equal(s.time, s.frameCount / s.fps, `frame ${s.frameCount}`);
        at[s.frameCount] = s.time;
      },
    }).run();
    return at;
  };
  const fast = await times(async () => {});
  // A sink that waits a varying number of macrotasks, as a browser sink waits for display ticks.
  let n = 0;
  const slow = await times(() => new Promise<void>((done) => { let k = n++ % 3; const go = () => (k-- > 0 ? setImmediate(go) : done()); go(); }));
  assert.deepEqual(slow, fast);
  assert.ok(fast.length > 60);
  for (let k = 1; k < fast.length; k++) {
    const scene = await renderAt(TimeOnly, k / FPS, new NullSink());
    assert.equal(scene.frameCount, k, `renderAt(${k}/${FPS})`);
    assert.equal(scene.time, fast[k]);
  }
});

/** A small document that DomSink can patch: elements with attributes, text and ordered children. */
function fakeDocument() {
  type El = { tagName: string; attrs: Record<string, string>; children: El[]; parent: El | null; style: Record<string, string>; textContent: string } & Record<string, unknown>;
  const make = (tagName: string): El => {
    const el = { tagName, attrs: {}, children: [], parent: null, style: {}, textContent: '' } as unknown as El;
    const detach = (c: El) => { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = null; };
    Object.assign(el, {
      setAttribute: (k: string, v: string) => { el.attrs[k] = v; },
      removeAttribute: (k: string) => { delete el.attrs[k]; },
      appendChild: (c: El) => { detach(c); el.children.push(c); c.parent = el; return c; },
      insertBefore: (c: El, ref: El | null) => {
        detach(c);
        const i = ref ? el.children.indexOf(ref) : -1;
        el.children.splice(i < 0 ? el.children.length : i, 0, c);
        c.parent = el;
        return c;
      },
      replaceChildren: (...cs: El[]) => { for (const c of [...el.children]) detach(c); for (const c of cs) (el.appendChild as (c: El) => El)(c); },
      remove: () => detach(el),
    });
    Object.defineProperty(el, 'firstChild', { get: () => el.children[0] ?? null });
    Object.defineProperty(el, 'nextSibling', { get: () => (el.parent ? el.parent.children[el.parent.children.indexOf(el) + 1] ?? null : null) });
    return el;
  };
  const doc = { createElementNS: (_ns: string, tag: string) => make(tag) };
  const container = make('div');
  (container as Record<string, unknown>).ownerDocument = doc;
  return container as unknown as Element;
}

test('sinks only read a frame: after each of Rayner’s sinks takes it, the scene draws the same SVG and keeps the same state', async () => {
  const sinks: Record<string, () => Sink> = {
    string: () => new StringSink(),
    snapshot: () => new SnapshotSink(),
    null: () => new NullSink(),
    trace: () => new TraceSink(),
    motion: () => new MotionSink(),
    seek: () => new SeekSink(new StringSink(), 0.8),
    browser: () => new DomSink(fakeDocument(), { realtime: false }),
  };
  const reference = await played(TimeOnly);
  for (const [name, make] of Object.entries(sinks)) {
    const inner = make();
    const seen: string[] = [];
    const look = (s: Scene) => toSvgString(s) + JSON.stringify(s.describe());
    const guard = async (s: Scene, call: () => Promise<void> | void, what: string) => {
      const before = look(s);
      await call();
      assert.equal(look(s), before, `the ${name} sink changed the scene in ${what} at frame ${s.frameCount}`);
    };
    try {
      await new TimeOnly({
        async frame(s: Scene, dt: number) {
          await guard(s, () => inner.frame(s, dt), 'frame');
          seen[s.frameCount] = toSvgString(s);
        },
        async stepBegin(s: Scene, st: Step) { await guard(s, () => inner.stepBegin?.(s, st), 'stepBegin'); },
        async stepEnd(s: Scene, st: Step) { await guard(s, () => inner.stepEnd?.(s, st), 'stepEnd'); },
      }).run();
    } catch (e) {
      if (!(e instanceof StopScene)) throw e;
    }
    assert.deepEqual(seen, reference, `with the ${name} sink`);
    if (inner instanceof DomSink) assert.ok(inner.nodes.size > 0, 'the browser sink patched its document');
  }
});

/** A Transform that records the alpha each interpolation is handed and the frame it is handed at. */
class Probe extends Transform {
  scene: Scene | null = null;
  calls: { frame: number; alpha: number }[] = [];
  override begin(): void {
    super.begin();
    this.calls.length = 0; // begin() interpolates once at 0; that is not a frame
  }
  override interpolate(alpha: number): void {
    super.interpolate(alpha);
    if (this.scene) this.calls.push({ frame: this.scene.frameCount + 1, alpha });
  }
  // finish() lands on the end once more after the last frame; that is not a frame either.
  override finish(alpha?: number): void {
    this.scene = null;
    super.finish(alpha);
  }
}

test('an animation blends its start and end by its elapsed share of its run time alone, however many frames ran before', async () => {
  for (const runTime of [0.4, 1, 1.37]) {
    const probes: Probe[] = [];
    class Blend extends Scene {
      override async construct() {
        const dot = new Dot().moveTo([-4, 0]);
        this.add(dot);
        await this.wait(0.5);
        const p = new Probe(dot, new Dot().moveTo([4, 0]), { runTime });
        p.scene = this;
        probes.push(p);
        await this.play(p);
        await this.wait(0.2);
      }
    }
    const full = await played(Blend);
    const n = Math.max(1, Math.round(runTime * FPS)),
      start = Math.round(0.5 * FPS);
    // Played: frame start + f is handed smooth(f / n), the last frame smooth(1).
    const playedCalls = probes[0]!.calls;
    assert.deepEqual(
      playedCalls.map((c) => c.frame),
      Array.from({ length: n }, (_, i) => start + i + 1),
    );
    playedCalls.forEach((c, i) => {
      const t = i === n - 1 ? runTime : Math.min((i + 1) * (1 / FPS), runTime);
      assert.equal(c.alpha, smooth(Math.min(t / runTime, 1)), `runTime ${runTime}, frame ${c.frame}`);
    });
    // Seeked to each frame of the play: the one frame computed gets the played alpha and draws the played frame.
    for (let f = 1; f <= n; f++) {
      probes.length = 0;
      const k = start + f,
        snap = new SnapshotSink();
      await renderAt(Blend, k / FPS, snap);
      assert.deepEqual(probes[0]!.calls, [playedCalls[f - 1]], `runTime ${runTime}, frame ${k}`);
      assert.equal(snap.svg, full[k], `runTime ${runTime}, frame ${k}`);
    }
  }
});

test('seek: unless the scene has updaters, a still computes no frame before t, and matches playback when each frame depends on the time alone', async () => {
  const full = await played(TimeOnly);
  for (let k = 1; k < full.length; k++) {
    // Frames a run seeking to k hands its sink before k: none (frame 0, the empty stage, computes nothing).
    const before: number[] = [];
    await new TimeOnly(
      {
        async frame(s: Scene) {
          if (s.frameCount > 0 && s.frameCount < k) before.push(s.frameCount);
          if (s.frameCount >= k) throw new StopScene();
        },
      },
      { skipUntil: k / FPS },
    ).run();
    assert.deepEqual(before, [], `seeking to frame ${k}`);
    const snap = new SnapshotSink();
    await renderAt(TimeOnly, k / FPS, snap);
    assert.equal(snap.svg, full[k], `frame ${k}`);
  }
});

test('seek: in a scene with updaters a still computes every frame before t, so a nudge written as an updater seeks exactly', async () => {
  const step: Vec = [0.2, 0];
  class Nudged extends Scene {
    override async construct() {
      const box = new Rectangle({ width: 1, height: 1, stroke: '#222222' }).moveTo([-4, 1]);
      const dot = new Dot({ radius: 0.3 }).moveTo([-6, -2]);
      // A nudge each frame, as an updater: the scene computes every frame while it is attached.
      dot.addUpdater((m: Mobject) => { m.shift(step); });
      await this.play(new FadeIn(new Group(box, dot)), { runTime: 0.5 });
      await this.play(new Transform(box, new Square({ side: 2, stroke: '#222222' }).moveTo([3, 1])), { runTime: 1 });
      dot.clearUpdaters();
    }
  }
  const full = await played(Nudged);
  assert.ok(full.length > 40);
  for (let k = 1; k < full.length; k++) {
    const computed: number[] = [];
    await new Nudged(
      {
        async frame(s: Scene) {
          if (s.frameCount > 0) computed.push(s.frameCount);
          if (s.frameCount >= k) throw new StopScene();
        },
      },
      { skipUntil: k / FPS },
    ).run();
    assert.deepEqual(computed, Array.from({ length: k }, (_, i) => i + 1), `seeking to frame ${k}`);
    const snap = new SnapshotSink();
    await renderAt(Nudged, k / FPS, snap);
    assert.equal(snap.svg, full[k], `frame ${k}`);
  }
});
