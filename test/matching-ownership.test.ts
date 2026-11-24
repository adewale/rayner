import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { Circle, Group, Rectangle, Scene, Text, Transform, keyed, toSvgString } from '../src/index.ts';
import type { Box } from '../src/index.ts';
import { KeyedMotionSink } from '../src/keyed-motion.ts';
import { renderFrame } from '../src/timeline.ts';
import { loadFonts } from '../explain/testing.ts';

await loadFonts();

/** Reproduce the old admission order: new text frames joined before their backing paths. */
class FramesFirst extends Transform {
  protected override doBegin(): void {
    super.doBegin();
    const plate = this.mobject.children.find(m => m instanceof Rectangle);
    assert.ok(plate, 'the matched transform admitted the new card');
    this.mobject.add(plate);
  }
}

function example(poison: boolean, nested: boolean) {
  return class extends Scene {
    override async construct() {
      await this.step('owner');
      const anchor = () => keyed(new Circle({ radius: 0.1 }).shift([-5, 0]), 'anchor');
      const current = keyed(new Group(anchor()), 'picture');
      const content = new Group(
        new Rectangle({ width: 5, height: 1.2, fill: '#224466', stroke: 'none' }),
        new Text('account owner', { fontSize: 0.7, color: '#ff0000' }),
      );
      const owner = keyed(nested ? new Group(keyed(content, 'account')) : content, 'owner:card');
      this.add(current);
      await this.wait(0.1);
      const target = keyed(new Group(anchor(), owner), 'picture');
      const Animation = poison ? FramesFirst : Transform;
      await this.play(new Animation(current, target, { match: 'key', runTime: 2 }));
      await this.wait(0.2);
    }
  };
}

/** Painted red glyph ink, independent of the motion check's geometry and metadata. */
function redInk(svg: string): number {
  const pixels = new Resvg(svg, { font: { loadSystemFonts: false } }).render().pixels;
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i]! > 160 && pixels[i + 1]! < 90 && pixels[i + 2]! < 90) count++;
  return count;
}

test('matched text keeps its omitted keyed owner for an attributed native paint-order rejection', async () => {
  for (const nested of [false, true]) {
    for (const poison of [false, true]) {
      const motion = new KeyedMotionSink(() => 'owner');
      const pictures: string[] = [];
      let omitted = 0;
      const Source = example(poison, nested);
      await new Source({ async frame(s, dt) {
        const svg = toSvgString(s, { width: 480 });
        pictures.push(svg);
        if (s.time > 1 && s.time < 2 && !s.find('owner:card')) {
          omitted++;
          // This remains the real renderer tree. Diagnostics must not reparent it,
          // manufacture public keys or infer ownership from repeated wording.
          assert.ok(s.mobjects.some(root => root.family().some(m => m instanceof Text && m.text === 'account owner')));
          assert.ok(!s.findAll(k => k.includes('/')).length);
        }
        await motion.frame(s, dt);
      } }).run();
      assert.ok(omitted > 15, 'the probe exercises an actually omitted keyed container');
      const findings = motion.finish().filter(f => f.kind === 'occluded words');
      if (poison) {
        assert.equal(findings.length, 1, JSON.stringify(findings));
        assert.equal(findings[0]!.path, nested ? 'picture/owner:card/account' : 'picture/owner:card');
        assert.match(findings[0]!.detail, /account owner/);
        assert.ok(redInk(pictures[60]!) < 10, 'the wrong paint order actually loses the letters');
      } else {
        assert.deepEqual(findings, []);
        assert.ok(redInk(pictures[60]!) > 100, 'the target-order admission keeps painted letters');
      }
      assert.ok(redInk(pictures.at(-1)!) > 100, 'the final authored card is readable');

      // Seeking rebuilds the temporary tree, not only its final target. Repeat
      // enough consecutive samples to exercise the same temporal finding.
      const seeks = new KeyedMotionSink(() => 'owner');
      for (let frame = 42; frame <= 66; frame++) {
        await renderFrame(Source, frame, { async frame(s, dt) {
          assert.equal(toSvgString(s, { width: 480 }), pictures[frame], `seek frame ${frame}`);
          await seeks.frame(s, dt);
        } });
      }
      const sought = seeks.finish().filter(f => f.kind === 'occluded words');
      assert.deepEqual(sought.map(f => [f.kind, f.path]), findings.map(f => [f.kind, f.path]));
    }
  }
});

test('new matching frames and paths inherit every omitted parent clip during playback and independent seeks', async () => {
  const cases: { name: string; outer: Box; inner: Box; own: Box; expected: Box; visible: boolean; keyedOuter: boolean }[] = [
    { name: 'three intersecting clips', outer: [-2, -1, 0.5, 1], inner: [-2, -0.1, 2, 1], own: [-0.5, -1, 2, 0.2],
      expected: [-0.5, -0.1, 0.5, 0.2], visible: true, keyedOuter: true },
    { name: 'disjoint parent clips', outer: [-2, -1, -0.2, 1], inner: [0.2, -1, 2, 1], own: [-2, -1, 2, 1],
      expected: [0.2, -1, 0.2, 1], visible: false, keyedOuter: false },
    { name: 'zero-height parent clip', outer: [-2, -1, 2, 1], inner: [-2, 0, 2, 0], own: [-1, -1, 1, 1],
      expected: [-1, 0, 1, 0], visible: false, keyedOuter: true },
  ];
  const raster = (s: Scene) => Buffer.from(new Resvg(toSvgString(s, { width: 480 }), { font: { loadSystemFonts: false } }).render().pixels);
  const selected = [42, 52, 60, 68];
  for (const sample of cases) {
    const make = (explicit: boolean) => class extends Scene {
      override async construct() {
        await this.step('clip');
        const anchor = () => keyed(new Circle({ radius: 0.1 }).shift([-5, 0]), 'anchor');
        const source = keyed(new Group(anchor()), 'picture');
        const label = new Text('MMMMMM', { fontSize: 0.8, color: '#ff0000' });
        const paper = new Rectangle({ width: 4, height: 1.3, fill: '#00ff00', stroke: 'none' });
        // The reference applies the independently calculated intersection directly
        // to both drawable owners. Every pass otherwise has identical target geometry.
        label.clipBox = [...(explicit ? sample.expected : sample.own)];
        paper.clipBox = [...(explicit ? sample.expected : sample.own)];
        const inner = new Group(paper, label), outer = new Group(inner);
        keyed(sample.keyedOuter ? outer : inner, 'omitted');
        if (!explicit) { outer.clipBox = [...sample.outer]; inner.clipBox = [...sample.inner]; }
        this.add(source);
        await this.wait(0.1);
        await this.play(new Transform(source, keyed(new Group(anchor(), outer), 'picture'), { match: 'key', runTime: 2 }));
        await this.wait(0.2);
      }
    };
    const expected = new Map<number, Buffer>(), Source = make(false);
    await new (make(true))({ async frame(s) { if (selected.includes(s.frameCount)) expected.set(s.frameCount, raster(s)); } }).run();
    assert.equal(expected.size, selected.length);
    const compare = (s: Scene, frame: number) => {
      const picture = raster(s);
      assert.ok(picture.equals(expected.get(frame)!), `${sample.name}, native frame ${frame} differs from the explicit clipping reference`);
      if (frame === 60 || frame === 68) {
        let red = 0, green = 0;
        for (let i = 0; i < picture.length; i += 4) {
          if (picture[i]! > 160 && picture[i + 1]! < 90 && picture[i + 2]! < 90) red++;
          if (picture[i + 1]! > 160 && picture[i]! < 90 && picture[i + 2]! < 90) green++;
        }
        assert.equal(red > 10, sample.visible, `${sample.name}: glyph ink`);
        assert.equal(green > 10, sample.visible, `${sample.name}: backing-path ink`);
        if (!sample.visible) assert.equal(red + green, 0);
      }
    };
    await new Source({ async frame(s) {
      if (!selected.includes(s.frameCount)) return;
      if (s.frameCount < 63) assert.equal(s.find('omitted'), undefined, 'the actual point-free container is absent during admission');
      compare(s, s.frameCount);
    } }).run();
    for (const frame of [...selected].reverse()) await renderFrame(Source, frame, { async frame(s) { compare(s, frame); } });
  }
});
