import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Scene, Rectangle, FadeIn } from '../src/index.ts';
import { NullSink, StringSink, renderFrame, renderText, StopScene } from '../src/output.ts';
import { SnapshotSink } from '../src/svg.ts';
import { traceScene } from '../explain/testing.ts';
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
