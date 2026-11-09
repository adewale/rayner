// The camera (scene.frame) is a box the sinks use as the viewBox. Points are
// the truth: moving the camera must not touch a single element record, seeking
// through a camera move must be byte-identical, and the verifier must see
// what a reader sees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Scene, Frame, Code, Rectangle, Circle, Dot, Group, FadeIn, linear,
} from '../src/index.ts';
import { NullSink, DomSink, renderElements, renderFrame, renderText, toSvgString, SnapshotSink } from '../src/output.ts';
import { MotionSink, analyzeMotion } from '../explain/testing.ts';
import type { Box, Sink } from '../src/index.ts';
import type { ElementRecord } from '../src/output.ts';

Scene.captionWpm = Infinity;

/** Zoom onto a code block, pan to a box, go closer, then reset: every way scenes will move the camera. */
class CameraScene extends Scene {
  override async construct(): Promise<void> {
    const code = new Code(['function inc(x) {', '  return x + 1;', '}']).shift([-3, 1]);
    const box = new Rectangle({ width: 2, height: 1, stroke: '#ffcc00' }).shift([4, -2]);
    await this.step('show');
    await this.play(new FadeIn(code), new FadeIn(box));
    await this.step('zoom');
    await this.play(this.frame.animate.fit(code, { margin: 0.5 }));
    await this.step('pan');
    await this.play(this.frame.animate.moveTo(box), { runTime: 0.8 });
    await this.step('closer');
    await this.play(this.frame.animate.scale(0.5).moveTo(box));
    await this.step('reset');
    await this.play(this.frame.animate.reset(), { rateFunc: linear });
    await this.wait(0.3);
  }
}

/** Every frame of a full run, with its time. */
class Recorder implements Sink {
  frames: Array<{ t: number; svg: string }> = [];
  async frame(scene: Scene): Promise<void> { this.frames.push({ t: scene.time, svg: toSvgString(scene) }); }
}

const viewBox = (svg: string): string => /<svg[^>]*viewBox="([^"]+)"/.exec(svg)![1]!;

test('seeking through a camera move renders the frame a full run produces', async () => {
  const full = new Recorder();
  await new CameraScene(full).run();
  const n = full.frames.length;
  // Mid-zoom, mid-pan, mid-closer, mid-reset, a step boundary and the end
  const picks = [1, 20, 37, 45, 52, 70, 80, 95, 110, n - 1].filter((k) => k < n);
  const seen = new Set<string>();
  for (const k of picks) {
    const snap = new SnapshotSink();
    await renderFrame(CameraScene, k, snap);
    assert.equal(snap.svg, full.frames[k]!.svg, `frame ${k}`);
    seen.add(viewBox(snap.svg));
  }
  assert.ok(seen.size >= 5, 'the picks land on distinct camera positions');
  assert.equal(viewBox(full.frames[n - 1]!.svg), '-8000 -4500 16000 9000', 'reset() ends on the default frame');
});

test('a pure camera move keeps every element record; only the viewBox changes', async () => {
  // One run per record mode: a sink uses one (toSvgString relative, DomSink absolute),
  // and the path cache holds one, so alternating them would rebuild records.
  const cameraRun = async (relative: boolean) => {
    let camera = false;
    const records: ElementRecord[][] = [], svgs: string[] = [];
    const sink: Sink = {
      async frame(scene) {
        if (!camera) return;
        records.push(renderElements(scene, { relative }));
        if (relative) svgs.push(toSvgString(scene));
      },
    };
    const s = new Scene(sink);
    s.construct = async function (this: Scene) {
      const code = new Code(['let a = 1;', 'let b = a + 1;']).shift([-3, 1]);
      const clipped = new Group(new Circle({ radius: 1.2 }).shift([3, 0]));
      clipped.clipBox = [2, -1, 4, 1];                 // a world-coordinate viewport: composes with the camera
      await this.play(new FadeIn(code), new FadeIn(clipped));
      await this.wait(0.1);
      camera = true;
      await this.play(this.frame.animate.fit(code, { margin: 0.3 }));
      await this.play(this.frame.animate.scale(0.5).moveTo([3, 0]));
      await this.play(this.frame.animate.reset());
    };
    await s.run();
    return { records, svgs };
  };
  for (const relative of [true, false]) {
    const { records, svgs } = await cameraRun(relative);
    assert.ok(records.length > 60, `${records.length} camera frames`);
    assert.ok(records[0]!.some((r) => r.attrs['clip-path']), 'the clipped circle is in the frame');
    for (let f = 1; f < records.length; f++) {
      const a = records[f - 1]!, b = records[f]!;
      assert.equal(b.length, a.length);
      b.forEach((rec, i) => assert.equal(rec, a[i], `relative=${relative}: record ${i} at frame ${f} is the same object`));
    }
    if (!relative) continue;
    const body = (svg: string) => svg.replace(/^<svg[^>]*><rect[^>]*\/>/, '');
    assert.ok(svgs.every((svg) => body(svg) === body(svgs[0]!)), 'everything after the viewBox and background is identical');
    assert.ok(new Set(svgs.map(viewBox)).size > 50, 'the viewBox moves every frame');
  }
});

test('fit() is the smallest 16:9 box around the target plus margin; reset() and zoom', () => {
  const f = new Frame();
  assert.deepEqual([...f.box()!], [-8, -4.5, 8, 4.5]);
  assert.equal(f.zoom, 1);
  const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-5, `${what}: ${a} vs ${b}`);
  const check = (target: Box, margin: number, wide: boolean) => {
    const b = f.box()!;
    close((b[2] - b[0]) / (b[3] - b[1]), 16 / 9, 'aspect');
    close((b[0] + b[2]) / 2, (target[0] + target[2]) / 2, 'center x');
    close((b[1] + b[3]) / 2, (target[1] + target[3]) / 2, 'center y');
    assert.ok(b[0] <= target[0] - margin + 1e-5 && b[2] >= target[2] + margin - 1e-5 && b[1] <= target[1] - margin + 1e-5 && b[3] >= target[3] + margin - 1e-5, 'contains target + margin');
    // Smallest: tight on the constraining axis
    if (wide) close(b[2] - b[0], target[2] - target[0] + 2 * margin, 'tight width');
    else close(b[3] - b[1], target[3] - target[1] + 2 * margin, 'tight height');
  };
  const wide = new Rectangle({ width: 4, height: 1 }).shift([2, 1]);
  f.fit(wide, { margin: 0.5 });
  check(wide.box()!, 0.5, true);
  close(f.zoom, 16 / 5, 'zoom');
  const tall: Box = [-1, -3, 0, 1];
  f.fit(tall, { margin: 0.25 });
  check(tall, 0.25, false);
  f.reset();
  assert.deepEqual([...f.box()!], [-8, -4.5, 8, 4.5]);
  assert.equal(f.zoom, 1);
  f.scale(0.5);
  assert.equal(f.zoom, 2);
  assert.throws(() => f.fit(new Group()), /no points/);
});

test('the camera is never drawn and never joins scene.mobjects; it plays like any mobject', async () => {
  const s = new Scene(new NullSink());
  s.construct = async function (this: Scene) {
    const r = new Rectangle({ width: 2, height: 2 }).shift([3, 2]);
    await this.play(new FadeIn(r));
    await this.play(this.frame.animate.fit(r, { margin: 0 }), r.animate.shift([1, 0]));
  };
  await s.run();
  assert.equal(s.mobjects.length, 1);
  assert.ok(!s.familyMembers().includes(s.frame));
  assert.equal(renderElements(s).length, 1);
  assert.ok(Math.abs(s.frame.zoom - 4.5) < 1e-5, `fit the 2 × 2 square, height-bound: zoom ${s.frame.zoom}`);
});

test('the frame\'s zoom is the stage\'s (zoomOf): out of 16:9, the tighter side sets it', async () => {
  const { zoomOf } = await import('../src/units.ts');
  const s = new Scene(new NullSink());
  assert.equal(s.frame.zoom, 1);
  s.frame.scale(0.5);
  assert.ok(Math.abs(s.frame.zoom - 2) < 1e-6);
  // Half as wide and as high as it was: the width alone would say 4, but the stage letterboxes it at 2.
  s.frame.stretch(0.5, 0);
  assert.ok(Math.abs(s.frame.zoom - 2) < 1e-6, `zoom ${s.frame.zoom}`);
  assert.equal(s.frame.zoom, zoomOf(s.frame.box()!));
});

test('an updater on the frame follows a moving mobject', async () => {
  const s = new Scene(new NullSink());
  let dot!: Dot;
  s.construct = async function (this: Scene) {
    dot = new Dot();
    this.add(dot);
    this.frame.scale(0.5).addUpdater((f) => f.moveTo(dot));
    await this.play(dot.animate.shift([4, 1]));
  };
  await s.run();
  const [fx, fy] = s.frame.center(), [dx, dy] = dot.center();
  assert.ok(Math.hypot(fx - dx, fy - dy) < 1e-6 && Math.abs(dx - 4) < 1e-6, `frame at ${fx},${fy}; dot at ${dx},${dy}`);
  assert.ok(Math.abs(s.frame.zoom - 2) < 1e-6, 'following pans; it does not zoom');
});

test('motion verifier: a smooth camera move is quiet, a camera jump teleports everything', async () => {
  const run = async (body: (s: Scene) => Promise<void>) => {
    const sink = new MotionSink();
    const s = new Scene(sink);
    s.construct = async function (this: Scene) {
      const a = new Rectangle().shift([-4, 2]), b = new Circle().shift([3, -2]);
      await this.play(new FadeIn(a), new FadeIn(b));
      await body(this);
    };
    await s.run();
    return analyzeMotion(sink);
  };
  assert.deepEqual(await run(async (s) => {
    await s.play(s.frame.animate.scale(0.5).moveTo([3, -2]));
    await s.play(s.frame.animate.reset(), { rateFunc: linear });
  }), []);
  const jump = await run(async (s) => {
    s.frame.scale(0.5).moveTo([3, -2]);               // set between plays: no motion in between
    await s.wait(0.3);
  });
  const teleported = new Set(jump.filter((e) => e.kind === 'teleport').map((e) => e.what));
  assert.equal(teleported.size, 2, `both leaves jump on screen: ${JSON.stringify(jump)}`);
});

test('renderText shows the frame: zoomed content reads larger', async () => {
  const s = new Scene(new NullSink());
  s.add(new Rectangle({ width: 2, height: 1 }));
  const span = () => { const row = renderText(s).split('\n').find((l) => l.includes('┌'))!; return row.indexOf('┐') - row.indexOf('┌'); };
  const before = span();
  s.frame.scale(0.5);
  assert.equal(span(), 2 * before);
});

test('DomSink writes the viewBox only when the camera moved', async () => {
  const writes: Array<[string, string]> = [];
  const el = { setAttribute: (k: string, v: string) => writes.push([k, v]), style: {}, firstChild: null };
  const container = { ownerDocument: { createElementNS: () => el }, appendChild() {} } as unknown as Element;
  const dom = new DomSink(container, { realtime: false });
  writes.length = 0;
  const s = new Scene(new NullSink());
  dom.patch(s);
  assert.deepEqual(writes, [], 'the camera at home: the viewBox written at construction stands');
  s.frame.scale(0.5);
  dom.patch(s);
  dom.patch(s);
  assert.deepEqual(writes, [['viewBox', '-4000 -2250 8000 4500']], 'one write for the move, none for the frame after');
  // apply() without a viewBox leaves the camera alone; with the same one, writes nothing
  writes.length = 0;
  dom.apply([]);
  dom.apply([], '-4000 -2250 8000 4500');
  assert.deepEqual(writes, []);
  dom.apply([], '-8000 -4500 16000 9000');
  assert.deepEqual(writes, [['viewBox', '-8000 -4500 16000 9000']]);
});

test('cull: true leaves out what the camera cannot show; off by default', async () => {
  // resvg 2.6 aborts on an element with opacity whose visible box is empty, which a
  // zoomed camera and a fading, off-screen label produce (found by the seasons video)
  const scene = new Scene(new NullSink());
  const inside = new Rectangle({ width: 1, height: 1 });
  const outside = new Dot().moveTo([7, -4]).setOpacity(0.05);
  const straddling = new Rectangle({ width: 2, height: 1 }).moveTo([2.5, 0]);
  const group = new Group(new Dot().moveTo([7, 4]), new Dot().moveTo([7.5, 4]));
  scene.add(inside, outside, straddling, group);
  scene.frame.fit([-2, -1.125, 2, 1.125] as Box, { margin: 0 });
  const all = renderElements(scene), culled = renderElements(scene, { cull: true });
  assert.equal(all.length, 5, 'default: every leaf');
  assert.deepEqual(culled.map((r) => r.id).sort(), [inside.id, straddling.id].sort(), 'culled: the visible box and the one on the edge');
  // Records keep identity, so a DOM sink could cull too without re-creating nodes
  for (const r of culled) assert.ok(all.includes(r));
  assert.ok(toSvgString(scene, { cull: true }).length < toSvgString(scene).length);
  // Home camera: nothing on the 16 x 9 stage is culled
  scene.frame.reset();
  assert.equal(renderElements(scene, { cull: true }).length, 5);
});

test('cull: a stroke reaching into the view is kept; a sliver under 2 output pixels is not', () => {
  const s = new Scene(new NullSink());
  // View x in [-2, 2] (4 units across 1280 px, so 1 px = 1/320 unit). The rectangle's right
  // edge is at -2.05, but its 0.3-wide stroke reaches -1.9: 32 px into the view.
  const stroked = new Rectangle({ width: 1, height: 1, strokeWidth: 0.3 }).moveTo([-2.55, 0]);
  // A translucent fill-only rectangle overlapping the view by half a pixel
  const sliver = new Rectangle({ width: 1, height: 1, stroke: 'none', fill: '#fff', fillOpacity: 1 }).moveTo([2.5 - 0.5 / 320, 0]).setOpacity(0.3);
  s.add(stroked, sliver);
  s.frame.fit([-2, -1.125, 2, 1.125] as Box, { margin: 0 });
  const ids = renderElements(s, { cull: true }).map((r) => r.id);
  assert.ok(ids.includes(stroked.id), 'the visible stroke was culled');
  assert.ok(!ids.includes(sliver.id), 'the half-pixel sliver was kept');
});

test('cull: 2 pixels of the output width, so a wider output keeps a thinner strip', () => {
  const s = new Scene(new NullSink());
  // Home camera, 16 units wide: a strip 0.02 units wide is 1.6 px at 1280 and 4.8 px at 3840
  const strip = new Rectangle({ width: 1, height: 1, stroke: 'none', fill: '#fff', fillOpacity: 1 }).moveTo([-8.5 + 0.02, 0]);
  s.add(strip);
  assert.ok(!renderElements(s, { cull: true }).some((r) => r.id === strip.id), 'under 2 px at the default 1280');
  assert.ok(renderElements(s, { cull: true, width: 3840 }).some((r) => r.id === strip.id), '4.8 px at 3840 is kept');
  assert.equal(toSvgString(s, { cull: true }).match(/<path/g)?.length ?? 0, 0);
  assert.equal(toSvgString(s, { cull: true, width: 3840 }).match(/<path/g)?.length ?? 0, 1, 'toSvgString culls for its own width');
});
