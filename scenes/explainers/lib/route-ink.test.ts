import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAsync } from '@resvg/resvg-js';
import { Group, Polygon, Rectangle, Scene, Text, VMobject, keyed, toSvgString, type Mobject } from '../../../src/index.ts';
import { loadFonts } from '../../../explain/testing.ts';
import { routeInkCheck } from './route-ink/fidelity.ts';

await loadFonts();

test('an outlined carrier can surround its destination lettering and an opaque carrier hides it', async () => {
  const scene = new Scene({ async frame() {} }), word = new Text('Approve', { fontSize: 0.5 });
  const carrier = keyed(new Rectangle({ width: 5, height: 1.5, fill: 'none', stroke: '#ff6600' }), 'carrier');
  scene.add(word, carrier);
  const run = async () => {
    const check = routeInkCheck();
    for (const x of [0, 0.3]) {
      carrier.moveTo([x, 0]);
      await check.frame(scene, 'carrier', [word]);
    }
    return check;
  };
  const open = await run();
  open.assertClear('outline docking', ['Approve']);
  assert.throws(() => open.assertClear('absent label', ['Approve', 'Missing']), /no painted witness for "Missing"/);
  carrier.setFill('#ff6600', 1);
  const opaque = await run();
  assert.throws(() => opaque.assertClear('opaque docking', ['Approve']), /hides [1-9]\d* painted text pixels/);
});

test('incremental clearance can run before departure without certifying a missing final trip', async () => {
  const check = routeInkCheck(), scene = new Scene({async frame() {}}), subject = new Text('KEEP');
  check.assertUnobstructed('before departure');
  assert.throws(() => check.assertClear('unfinished route', []), /no traveller occurrence/);
  scene.add(subject); await check.frame(scene, 'carrier', [subject]);
  scene.add(keyed(new Rectangle({width: 4, height: 1.5, fill: '#224466', stroke: 'none'}), 'carrier'));
  await check.frame(scene, 'carrier', [subject]);
  assert.throws(() => check.assertUnobstructed('instant obstruction'), /hides [1-9]\d* painted text pixels/);
});

test('clearance includes descendant strokes, miter tips and the protected drawing’s own stroke', async () => {
  const word = () => new Text('TEST', {fontSize: 0.6, color: '#ff0000'});
  const outline = (stroke: string) => new Rectangle({width: 1, height: 1.4, fill: 'none', stroke, strokeWidth: 1.4});
  const corner = (lineJoin?: 'miter' | 'round') => new Polygon([[0,0], [2,0.2], [2,-0.2]], {
    fill: 'none', stroke: '#333333', strokeWidth: 0.2, lineJoin, miterLimit: 16,
  });
  const redPixels = async (scene: Scene) => {
    const {pixels} = await renderAsync(toSvgString(scene, {width: 800}), {font: {loadSystemFonts: false}});
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i]! > 190 && pixels[i + 1]! < 70 && pixels[i + 2]! < 70) count++;
    return count;
  };
  const cases: [string, Mobject, Mobject, number, boolean][] = [
    ['grouped wide stroke', word(), new Group(outline('#333333')), 0.25, true],
    ['sharp miter', word(), corner('miter'), 0.45, true],
    ['default rounded join', word(), corner(), 0.45, false],
    ['rounded corner', word(), corner('round'), 0.45, false],
    ['outlined subject', outline('#ff0000'), new Rectangle({width: 0.4, height: 0.8, fill: '#333333', stroke: 'none'}), 0.25, true],
  ];
  for (const [name, drawing, traveller, gap, hidesInk] of cases) {
    const scene = new Scene({async frame() {}}), check = routeInkCheck();
    scene.add(keyed(drawing, 'focus'), keyed(traveller, 'carrier'));
    // Witness an unobstructed moving carrier before the test of the broad-phase rejection.
    for (const x of [-5, -4]) { traveller.moveTo([x,0]); await check.frame(scene, 'carrier', [drawing]); }
    const before = await redPixels(scene);
    assert.ok(before > 100);
    traveller.moveTo([drawing.box()![2] + gap + traveller.width() / 2, 0]);
    const covered = await redPixels(scene);
    await check.frame(scene, 'carrier', [drawing]);
    traveller.setOpacity(0);
    assert.equal(await redPixels(scene), before, `${name}: removing only the carrier restores all the original red ink`);
    assert.equal(covered < before, hidesInk, name);
    const verify = () => check.assertClear(name, [drawing instanceof Text ? drawing.text : 'focus']);
    if (hidesInk) assert.throws(verify, /hides [1-9]\d* painted (text|drawing) pixels/);
    else verify();
  }
});

test('a carrier must visibly change position, including when an aperture stays fixed over moving geometry', async () => {
  for (const clipped of [true, false]) {
    const scene = new Scene({async frame() {}}), check = routeInkCheck();
    const word = new Text('TEST', {fontSize: 0.6, color: '#ff0000'}).moveTo([0,2]);
    const carrier = keyed(new Rectangle({width: 10, height: 0.35, fill: '#333333', stroke: 'none'}), 'carrier');
    if (clipped) carrier.clipBox = [-0.075, -0.075, 0.075, 0.075];
    scene.add(word, carrier);
    const image = async () => (await renderAsync(toSvgString(scene, {width: 800}), {font: {loadSystemFonts: false}})).pixels;
    const frames: Buffer[] = [];
    for (const x of [-2, 2]) {
      carrier.moveTo([x,0]);
      await check.frame(scene, 'carrier', [word]);
      const drawn = await image();
      carrier.setOpacity(0);
      assert.ok(!(await image()).equals(drawn), 'the aperture exposes actual carrier pixels in both samples');
      carrier.setOpacity(1);
      frames.push(drawn);
    }
    assert.equal(frames[0]!.equals(frames[1]!), clipped);
    const verify = () => check.assertClear('crossing', ['TEST']);
    if (clipped) assert.throws(verify, /must paint the traveller at two distinct screen positions/);
    else verify();
  }
});

test('each physical route occurrence needs its own actual movement and a hidden underlay cannot animate a frozen aperture', async () => {
  for (const secondMoves of [false, true]) {
    const scene = new Scene({async frame() {}}), check = routeInkCheck(), label = new Text('KEEP').moveTo([0, 2]);
    scene.add(label);
    for (const occurrence of [0, 1]) {
      const carrier = keyed(new Rectangle({width: 0.5, height: 0.5, fill: '#224466', stroke: 'none'}), 'carrier');
      scene.add(carrier);
      for (const x of [-2, occurrence === 0 || secondMoves ? 2 : -2]) { carrier.moveTo([x, 0]); await check.frame(scene, 'carrier', [label]); }
      scene.remove(carrier); await check.frame(scene, 'carrier', [label]);
    }
    if (secondMoves) check.assertClear('two trips', ['KEEP']);
    else assert.throws(() => check.assertClear('two trips', ['KEEP']), /occurrence 2.+must paint the traveller/);
  }
  const scene = new Scene({async frame() {}}), check = routeInkCheck(), label = new Text('KEEP').moveTo([0, 2]);
  const backing = new Rectangle({width: 0.55, height: 0.55, fill: '#224466', stroke: 'none'});
  const carrier = keyed(new Rectangle({width: 9, height: 1.3, fill: '#224466', stroke: 'none'}), 'carrier');
  carrier.clipBox = [-1, -0.45, 1, 0.45];
  scene.add(backing, label, carrier);
  const images: Buffer[] = [];
  for (const x of [-2, 2]) {
    carrier.moveTo([x, 0]); backing.moveTo([0.175 * x, 0]);
    images.push((await renderAsync(toSvgString(scene, {width: 800}))).pixels);
    await check.frame(scene, 'carrier', [label]);
  }
  assert.deepEqual(images[0], images[1], 'the complete native picture is identical despite world movement and changing knockout contrast');
  assert.throws(() => check.assertClear('frozen underlay', ['KEEP']), /must paint the traveller/);
});

test('moving foreground paper cannot supply a traveller’s movement witness', async () => {
  for (const fill of ['#fff', '#000']) {
    const scene = new Scene({async frame() {}}), check = routeInkCheck(), subject = new Text('KEEP').moveTo([0, 2]);
    const carrier = keyed(new Rectangle({width: 9, height: 1.3, fill: '#224466', stroke: 'none'}), 'carrier');
    const aperture = new VMobject({fill, stroke: 'none', fillRule: 'evenodd'}).setPolygon([[-20,-10],[20,-10],[20,10],[-20,10]])
      .startNewPath([-0.4,-0.4]).addLineTo([0.4,-0.4]).addLineTo([0.4,0.4]).addLineTo([-0.4,0.4]).closePath();
    scene.add(carrier, aperture, subject);
    const images: Buffer[] = [];
    for (const x of [-2, 2]) {
      carrier.moveTo([x, 0]); aperture.moveTo([0.175 * x, 0]);
      images.push((await renderAsync(toSvgString(scene, {width: 800}))).pixels);
      await check.frame(scene, 'carrier', [subject]);
    }
    assert.ok(!images[0]!.equals(images[1]!), 'the aperture exposes different actual pixels');
    assert.throws(() => check.assertClear('moving foreground', ['KEEP']), /must paint the traveller/);
  }
});

test('a foreground drawing clipped away by its ancestor cannot invalidate visible travel', async () => {
  const scene = new Scene({async frame() {}}), check = routeInkCheck(), subject = new Text('KEEP').moveTo([0, 2]);
  const carrier = keyed(new Rectangle({width: 0.5, height: 0.5, fill: '#224466', stroke: 'none'}), 'carrier');
  const paper = new Rectangle({width: 20, height: 10, fill: '#fff', stroke: 'none'});
  const owner = new Group(new Group(paper)); owner.clipBox = [3, -1, 4, 1];
  scene.add(carrier, owner, subject);
  for (const x of [-2, 2]) {
    carrier.moveTo([x, 0]); paper.shift([0.175 * x, 0]);
    await check.frame(scene, 'carrier', [subject]);
  }
  check.assertClear('clipped foreground', ['KEEP']);
});
