import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { Group, Polygon, Rectangle, Scene, Text, keyed, toSvgString, type Mobject } from '../../../src/index.ts';
import { loadFonts } from '../../../explain/testing.ts';
import { routeInkCheck } from './route-ink/fidelity.ts';

await loadFonts();

test('an outlined carrier can surround its destination lettering and an opaque carrier hides it', () => {
  const scene = new Scene({ async frame() {} }), word = new Text('Approve', { fontSize: 0.5 });
  const carrier = keyed(new Rectangle({ width: 5, height: 1.5, fill: 'none', stroke: '#ff6600' }), 'carrier');
  scene.add(word, carrier);
  const run = () => {
    const check = routeInkCheck();
    for (const x of [0, 0.3]) {
      carrier.moveTo([x, 0]);
      check.frame(scene, 'carrier', [word]);
    }
    return check;
  };
  const open = run();
  open.assertClear('outline docking', ['Approve']);
  assert.throws(() => open.assertClear('absent label', ['Approve', 'Missing']), /no painted witness for "Missing"/);
  carrier.setFill('#ff6600', 1);
  assert.throws(() => run().assertClear('opaque docking', ['Approve']), /hides [1-9]\d* painted text pixels/);
});

test('clearance includes descendant strokes, miter tips and the protected drawing’s own stroke', () => {
  const word = () => new Text('TEST', {fontSize: 0.6, color: '#ff0000'});
  const outline = (stroke: string) => new Rectangle({width: 1, height: 1.4, fill: 'none', stroke, strokeWidth: 1.4});
  const corner = (lineJoin: 'miter' | 'round') => new Polygon([[0,0], [2,0.2], [2,-0.2]], {
    fill: 'none', stroke: '#333333', strokeWidth: 0.2, lineJoin, miterLimit: 16,
  });
  const redPixels = (scene: Scene) => {
    const {pixels} = new Resvg(toSvgString(scene, {width: 800}), {font: {loadSystemFonts: false}}).render();
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i]! > 190 && pixels[i + 1]! < 70 && pixels[i + 2]! < 70) count++;
    return count;
  };
  const cases: [string, Mobject, Mobject, number, boolean][] = [
    ['grouped wide stroke', word(), new Group(outline('#333333')), 0.25, true],
    ['sharp miter', word(), corner('miter'), 0.45, true],
    ['rounded corner', word(), corner('round'), 0.45, false],
    ['outlined subject', outline('#ff0000'), new Rectangle({width: 0.4, height: 0.8, fill: '#333333', stroke: 'none'}), 0.25, true],
  ];
  for (const [name, drawing, traveller, gap, hidesInk] of cases) {
    const scene = new Scene({async frame() {}}), check = routeInkCheck();
    scene.add(keyed(drawing, 'focus'), keyed(traveller, 'carrier'));
    // Witness an unobstructed moving carrier before the test of the broad-phase rejection.
    for (const x of [-5, -4]) { traveller.moveTo([x,0]); check.frame(scene, 'carrier', [drawing]); }
    const before = redPixels(scene);
    assert.ok(before > 100);
    traveller.moveTo([drawing.box()![2] + gap + traveller.width() / 2, 0]);
    const covered = redPixels(scene);
    check.frame(scene, 'carrier', [drawing]);
    traveller.setOpacity(0);
    assert.equal(redPixels(scene), before, `${name}: removing only the carrier restores all the original red ink`);
    assert.equal(covered < before, hidesInk, name);
    const verify = () => check.assertClear(name, [drawing instanceof Text ? drawing.text : 'focus']);
    if (hidesInk) assert.throws(verify, /hides [1-9]\d* painted (text|drawing) pixels/);
    else verify();
  }
});

test('a carrier must visibly change position, including when an aperture stays fixed over moving geometry', () => {
  for (const clipped of [true, false]) {
    const scene = new Scene({async frame() {}}), check = routeInkCheck();
    const word = new Text('TEST', {fontSize: 0.6, color: '#ff0000'}).moveTo([0,2]);
    const carrier = keyed(new Rectangle({width: 10, height: 0.35, fill: '#333333', stroke: 'none'}), 'carrier');
    if (clipped) carrier.clipBox = [-0.075, -0.075, 0.075, 0.075];
    scene.add(word, carrier);
    const image = () => new Resvg(toSvgString(scene, {width: 800}), {font: {loadSystemFonts: false}}).render().pixels;
    const frames: Buffer[] = [];
    for (const x of [-2, 2]) {
      carrier.moveTo([x,0]);
      check.frame(scene, 'carrier', [word]);
      const drawn = image();
      carrier.setOpacity(0);
      assert.ok(!image().equals(drawn), 'the aperture exposes actual carrier pixels in both samples');
      carrier.setOpacity(1);
      frames.push(drawn);
    }
    assert.equal(frames[0]!.equals(frames[1]!), clipped);
    const verify = () => check.assertClear('crossing', ['TEST']);
    if (clipped) assert.throws(verify, /must paint the traveller at two distinct screen positions/);
    else verify();
  }
});
