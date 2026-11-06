import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import {
  Scene,
  Group,
  Rectangle,
  Line,
  Transform,
  } from '../src/index.ts';
import { NullSink, StringSink, SnapshotSink, renderAt, toSvgString, renderElements } from '../src/output.ts';
import type { Box } from '../src/index.ts';

function clipped(group: Group, clipBox: Box) {
  return Object.assign(group, { clipBox });
}
function pixel(svg: string, x: number, y: number) {
  const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render(),
    pixels = image.pixels;
  return Array.from(pixels.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
}

test('nested viewport clips affect paint, not geometry, and survive translated path output', () => {
  const shape = new Rectangle({ width: 6, height: 6, fill: '#ff0000', stroke: 'none' });
  const inner = clipped(new Group(shape), [-2, -0.5, 2, 0.5]);
  const outer = clipped(new Group(inner), [-1, -1, 1, 1]);
  const scene = new Scene(new NullSink());
  scene.add(outer);
  for (const shift of [0, 0.5]) {
    if (shift) outer.shift([shift, 0]);
    const svg = toSvgString(scene, { width: 160, background: '#ffffff' });
    assert.deepEqual(pixel(svg, 80, 45), [255, 0, 0, 255]);
    assert.deepEqual(pixel(svg, 95, 45), [255, 255, 255, 255]);
    assert.deepEqual(pixel(svg, 80, 38), [255, 255, 255, 255]);
    assert.equal(outer.width(), 6);
  }
  const copy = outer.copy();
  copy.clipBox![0] = 0;
  assert.equal(outer.clipBox[0], -1);
  const before = renderElements(scene)[0]!;
  outer.clipBox[0] = 0;
  const after = renderElements(scene)[0]!;
  assert.deepEqual(before.clipBox, [-1, -0.5, 1, 0.5]);
  assert.deepEqual(after.clipBox, [0, -0.5, 1, 0.5]);
  assert.notEqual(before, after);
  outer.clipBox[2] = NaN;
  assert.throws(() => renderElements(scene), /finite ordered/);
});
test('seeking through a fixed viewport is byte-identical to playing it', async () => {
  class Moving extends Scene {
    override async construct() {
      const group = clipped(
        new Group(new Rectangle({ width: 2, height: 1, fill: '#ff0000', stroke: 'none' }).moveTo([-2, 0])),
        [-1, -1, 1, 1],
      );
      await this.step('move');
      await this.play(new Transform(group, group.copy().shift([4, 0]), { runTime: 1 }));
    }
  }
  const played = new StringSink({ width: 160, background: '#ffffff' });
  await new Moving(played, { fps: 20 }).run();
  const seek = new SnapshotSink({ width: 160, background: '#ffffff' });
  await renderAt(Moving, 0.5, seek, { fps: 20 });
  assert.equal(seek.svg, played.frames[10]);
  assert.deepEqual(pixel(seek.svg, 80, 45), [255, 0, 0, 255]);
});

test('a translucent leaf wholly outside its clip is not written, and the frame still rasterizes', () => {
  // Minimised from a lantern frame that aborted resvg 2.6.2: a clipped paper rectangle plus a
  // faint ruled line that the clip leaves no area at all.
  const paper = new Rectangle({ width: 4, height: 4, fill: '#f7f5ef', stroke: 'none' });
  const ruled = new Line([-3, 3], [3, 3], { stroke: '#26262b', strokeWidth: 0.025 });
  ruled.style.opacity = 0.14;
  const scene = new Scene(new NullSink());
  scene.add(clipped(new Group(paper, ruled), [-1, -1, 1, 1]));
  const ids = renderElements(scene).map((r) => r.id);
  assert.ok(ids.includes(paper.id) && !ids.includes(ruled.id));
  assert.equal(pixel(toSvgString(scene, { width: 160 }), 80, 45)[0], 0xf7);
});
