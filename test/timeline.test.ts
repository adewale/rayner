import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Scene, Rectangle, FadeIn } from '../src/index.ts';
import { SnapshotSink, StringSink, indexScene, stepTime, renderAt, renderText, StopScene } from '../src/output.ts';
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
  const ix = await indexScene(Fixture);
  const scene = await renderAt(Fixture, stepTime(ix, 'end')!, new SnapshotSink());
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
  for (const t of [0, 0.4, 1, 1.5, 2.2]) {
    const snap = new SnapshotSink();
    let forwarded = 0;
    const counting = { async frame(scene: Scene, dt: number) { forwarded++; await snap.frame(scene); void dt; } };
    const scene = await renderAt(Swallows, t, counting);
    assert.equal(forwarded, 1, `one frame reaches the sink at t=${t}`);
    assert.ok(scene.stopped);
    assert.equal(snap.svg, full.frames[Math.round(t * scene.fps)], `frame at t=${t}`);
  }
});

test('after a stop, play(), wait() and step() reject at once without reaching the sink', async () => {
  let calls = 0;
  const sink = { async frame() { if (++calls === 3) throw new StopScene(); } };
  const scene = new Swallows(sink);
  await scene.run();
  assert.equal(calls, 3);
  assert.ok(scene.stopped);
  const box = new Rectangle();
  const before = scene.time;
  await assert.rejects(scene.play(new FadeIn(box)), StopScene);
  await assert.rejects(scene.wait(1), StopScene);
  await assert.rejects(scene.step('later'), StopScene);
  assert.equal(calls, 3, 'the sink saw nothing more');
  assert.equal(scene.time, before, 'and the clock did not move');
  assert.ok(!scene.mobjects.includes(box), 'nothing began');
});

// The player sends a playing run on to a later step by raising its skipUntil mid-play; from
// there it must skip exactly as a seek does, so the next frame drawn is the seek's frame.
test('skipUntil raised mid-run: the first frame drawn at or after it is the frame a seek there draws', async () => {
  const ix = await indexScene(Fixture);
  const times = [0.1, 0.35, 0.8, 1.3, 2, 2.9].map((f) => f * (ix.duration / 3));
  for (const raise of times)
    for (const target of times.filter((t) => t > raise + 0.2)) {
      let drawn: string | undefined;
      const snap = new SnapshotSink();
      const sink = {
        async frame(scene: Scene) {
          if (scene.time + 1e-9 >= raise && scene.skipUntil < target) scene.skipUntil = target;
          if (scene.time + 1e-9 < target) return;
          await snap.frame(scene);
          drawn = snap.svg;
          throw new StopScene();
        },
      };
      await new Fixture(sink).run();
      const seek = new SnapshotSink();
      await renderAt(Fixture, target, seek);
      assert.equal(drawn, seek.svg, `raised at ${raise.toFixed(2)} s to ${target.toFixed(2)} s`);
    }
});
