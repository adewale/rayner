import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Scene, Rectangle, Dot, Circle, FadeIn, Transform, toSvgString } from '../src/index.ts';
import type { EndedStep, Sink, Step } from '../src/index.ts';
import { NullSink, renderFrame } from '../src/timeline.ts';
import { StringSink, DomSink } from '../src/svg.ts';
import { renderText } from '../src/ascii.ts';
import { StopScene } from '../src/scene.ts';
import { SnapshotSink } from '../src/svg.ts';
import { traceScene, TraceSink } from '../explain/testing.ts';
import { Fixture } from './lib/scenes.ts';

// The trace is what agents read and what fidelity tests compare: its records, timing and
// state at every step boundary. The file holds the whole trace, so a change shows as a diff.
test('the golden trace of the fixture is unchanged (UPDATE_GOLDEN=1 rewrites it after a deliberate change)', async () => {
  const file = new URL('./golden-traces.json', import.meta.url);
  const now = { fixture: await traceScene(Fixture) };
  if (process.env.UPDATE_GOLDEN === '1') writeFileSync(file, JSON.stringify(now, null, 2) + '\n');
  assert.deepEqual(now, JSON.parse(readFileSync(file, 'utf8')));
});

test('text renderer shows the lit code line, the arrow and the dot', async () => {
  const end = (await traceScene(Fixture)).steps.find((s) => s.step === 'end')!;
  const scene = await renderFrame(Fixture, end.frame0, new SnapshotSink());
  const txt = renderText(scene);
  assert.match(txt, /▌\s*while \(count < 3\) count\+\+;/);
  assert.match(txt, /▶/);
  assert.match(txt, /●/);
  assert.match(txt, /A fixture for the engine tests/);
});

// A construct() that swallows StopScene in a broad catch (the ring buffer's bug)
class Swallows extends Scene {
  override async construct() {
    const box = new Rectangle({ width: 2, height: 1 });
    try { await this.play(new FadeIn(box)); } catch { /* swallows the seek's stop too */ }
    try { await this.play(box.animate.shift([2, 0])); } catch { /* and again */ }
    try { await this.wait(0.5); } catch { /* and again */ }
  }
}

test('a swallowed StopScene cannot emit frames: a seek still renders the played frame', async () => {
  const full = new StringSink(); await new Swallows(full).run();
  for (const frame of [0, 12, 30, 45, 66]) {
    const snap = new SnapshotSink();
    let forwarded = 0;
    const counting = { async frame(scene: Scene, dt: number) { forwarded++; await snap.frame(scene); void dt; } };
    const scene = await renderFrame(Swallows, frame, counting);
    assert.equal(forwarded, 1, `one frame reaches the sink at frame ${frame}`);
    assert.equal(scene.phase, 'stopped');
    assert.equal(snap.svg, full.frames[frame], `frame ${frame}`);
  }
});

test('after a stop, play(), wait() and step() reject at once without reaching the sink', async () => {
  let calls = 0;
  const sink = { async frame() { if (++calls === 3) throw new StopScene(); } };
  const scene = new Swallows(sink);
  await scene.run();
  assert.equal(calls, 3);
  assert.equal(scene.phase, 'stopped');
  const box = new Rectangle();
  const before = scene.time;
  await assert.rejects(scene.play(new FadeIn(box)), StopScene);
  await assert.rejects(scene.wait(1), StopScene);
  await assert.rejects(scene.step('later'), StopScene);
  assert.equal(calls, 3, 'the sink saw nothing more');
  assert.equal(scene.time, before, 'and the clock did not move');
  assert.ok(!scene.mobjects.includes(box), 'nothing began');
});

test("a sink's skip time must be a time: NaN or a negative time is refused where a play reads it", async () => {
  class Skips extends NullSink {
    override readonly skipUntil: number;
    constructor(skipUntil: number) { super(); this.skipUntil = skipUntil; }
  }
  const plays = (sink: NullSink) => new (class extends Scene {
    override async construct() { await this.play(new FadeIn(new Rectangle())); }
  })(sink).run();
  await assert.rejects(plays(new Skips(NaN)), /^RangeError: sink\.skipUntil: .*NaN/);
  await assert.rejects(plays(new Skips(-0.5)), /^RangeError: sink\.skipUntil: .*-0\.5/);
  await assert.rejects(plays({ skipUntil: NaN, async frame() {} } as NullSink), /^RangeError: sink\.skipUntil: .*NaN/);
  // A time, 0 or Infinity is taken.
  for (const t of [0, 0.4, Infinity]) assert.ok(await plays(new Skips(t)));
});

// The player sends a playing run on to a later step by raising its sink's skipUntil mid-play; from
// there it must skip exactly as a seek does, so the next frame drawn is the seek's frame.
test('skipUntil raised mid-run: the first frame drawn at or after it is the frame a seek there draws', async () => {
  const { frames, fps } = await traceScene(Fixture);
  const at = [0.1, 0.35, 0.8, 1.3, 2, 2.9].map((f) => Math.round(f * (frames / 3)));
  for (const raise of at)
    for (const target of at.filter((f) => f > raise + 0.2 * fps)) {
      let drawn: string | undefined;
      const snap = new SnapshotSink();
      // The sink moves its own skip time on mid-run, as the player's runner does for the next step.
      const sink = {
        skipUntil: 0,
        async frame(scene: Scene) {
          if (scene.frameCount >= raise && sink.skipUntil < target / fps) sink.skipUntil = target / fps;
          if (scene.frameCount < target) return;
          await snap.frame(scene);
          drawn = snap.svg;
          throw new StopScene();
        },
      };
      await new Fixture(sink).run();
      const seek = new SnapshotSink();
      await renderFrame(Fixture, target, seek);
      assert.equal(drawn, seek.svg, `raised at frame ${raise} to frame ${target}`);
    }
});

// A step's resting picture is reached by its frame number, as the trace records it, never by a
// rounded time: renderFrame(Scene, step.frame1, sink).
test('renderFrame draws the frame a step records by its number, the frame a full run draws there; past the end the last', async () => {
  const full = new StringSink(); await new Fixture(full).run();
  const trace = await traceScene(Fixture);
  for (const k of [0, 1, 2, 17, Math.floor(trace.frames / 2), trace.frames - 1, trace.frames, trace.frames + 10]) {
    const sink = new SnapshotSink();
    const scene = await renderFrame(Fixture, k, sink);
    assert.equal(sink.svg, full.frames[Math.min(k, trace.frames)], `frame ${k}`);
    assert.equal(scene.frameCount, Math.min(k, trace.frames), `frame ${k} lands on its count`);
  }
  for (const s of trace.steps) {
    const sink = new SnapshotSink();
    await renderFrame(Fixture, s.frame1, sink);
    assert.equal(sink.svg, full.frames[s.frame1], `${s.step}'s resting frame`);
  }
  // The frame number is the scene's own: a class that runs at 60 fps is sought at 60 fps.
  class Fast extends Fixture { constructor(sink: ConstructorParameters<typeof Fixture>[0]) { super(sink, { fps: 60 }); } }
  assert.equal((await renderFrame(Fast, 45, new NullSink())).frameCount, 45);
  for (const bad of [-1, 1.5, NaN]) await assert.rejects(renderFrame(Fixture, bad, new NullSink()), (e: unknown) => e instanceof RangeError && e.message.startsWith('renderFrame(): ') && e.message.includes(String(bad)));
});

// Rayner's own sinks only read a frame (the lantern explainer says so, and names this test): each of
// them, the browser's DomSink included, leaves the scene drawing the same SVG and holding the same state.
/** A scene built only from Rayner's own animations: a fade, a morph, a move, a wait. */
class TimeOnly extends Scene {
  override async construct() {
    await this.step('one');
    const box = new Rectangle({ width: 2, height: 1, stroke: '#222222', fill: '#88aadd', fillOpacity: 0.4 }).moveTo([-3, 1]);
    const dot = new Dot({ radius: 0.3 }).moveTo([-5, -2]);
    await this.play(new FadeIn(box), new FadeIn(dot), { runTime: 0.5 });
    await this.play(new Transform(box, new Rectangle({ width: 2.5, height: 2.5, stroke: '#222222' }).moveTo([2, 1])), dot.animate.moveTo([5, -2]), { runTime: 1 });
    await this.step('two');
    await this.play(new Transform(box, new Circle({ radius: 1, stroke: '#222222' }).moveTo([0, 0])), { runTime: 0.7 });
    await this.wait(0.3);
  }
}

/** Every frame of a full run, by frame number, as SVG. */
async function played(S: typeof TimeOnly): Promise<string[]> {
  const frames: string[] = [];
  await new S({ async frame(s: Scene) { frames[s.frameCount] = toSvgString(s); } }).run();
  return frames;
}

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
    null: () => new NullSink(),
    trace: () => new TraceSink(),
    browser: () => new DomSink(fakeDocument(), { realtime: false }),
  };
  const reference = await played(TimeOnly);
  for (const [name, make] of Object.entries(sinks)) {
    const inner = make();
    const seen: string[] = [];
    const look = (s: Scene) => toSvgString(s) + JSON.stringify(s.stateJson());
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
        async stepEnd(s: Scene, st: EndedStep) { await guard(s, () => inner.stepEnd?.(s, st), 'stepEnd'); },
      }).run();
    } catch (e) {
      if (!(e instanceof StopScene)) throw e;
    }
    assert.deepEqual(seen, reference, `with the ${name} sink`);
    // The fake document's elements keep their children in a list (fakeDocument).
    if (inner instanceof DomSink) assert.ok((inner.svg as unknown as { children: unknown[] }).children.length > 0, 'the browser sink patched its document');
  }
});
