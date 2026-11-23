// Public-input counterexamples from the adversarial review. Native pixels, independently of
// detector boxes and transition bookkeeping, decide whether each promised mark actually paints.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Resvg} from '@resvg/resvg-js';
import {Group, Line, Rectangle, Scene, Succession, Text, Transform, VMobject, keyed, linear, toSvgString} from '../src/index.ts';
import type {Animation} from '../src/index.ts';
import {beginAnimation, interpolateAnimation, finishAnimation} from '../src/animation.ts';
import {choreograph} from '../explain/choreograph.ts';
import {Machine, view} from '../explain/index.ts';
import {ViewSync} from '../explain/view.ts';
import {pass} from '../explain/drawing.ts';
import {loadFonts} from '../explain/testing.ts';
import {KeyedMotionSink} from '../src/internal.ts';
import {MachineMotionCheck} from '../tools/lib/explain-motion-rules.ts';
import {exploreMachines} from '../tools/lib/explain-check.ts';

await loadFonts();
const sink = {async frame() {}};
const solid = (w = 4, h = 1.3, color = '#224466') => new Rectangle({width: w, height: h, fill: color, stroke: 'none'});
const word = (text = 'ABCD', color = '#ff0000', size = 0.8) => new Text(text, {fontSize: size, color}).moveTo([0, 0]);
const pixels = (scene: Scene, cull = false) => new Resvg(toSvgString(scene, {width: 800, cull}), {font: {loadSystemFonts: false}}).render().pixels;
function ink(bytes: Uint8Array, channel: number): number {
  let n = 0;
  for (let i = 0; i < bytes.length; i += 4) if (bytes[i + channel]! > 160 && bytes[i + (channel + 1) % 3]! < 90 && bytes[i + (channel + 2) % 3]! < 90) n++;
  return n;
}
const center = (scene: Scene, x = 0) => [...pixels(scene).subarray(4 * (225 * 800 + 400 + x), 4 * (225 * 800 + 400 + x) + 3)];

test('nested entrants occupy target sibling slots throughout native playback, in either construction order', () => {
  for (const order of [['ink', 'top'], ['top', 'ink']]) {
    const base = keyed(solid(2, 2, '#ff0000'), 'base'), reference = keyed(solid(0.3, 0.3, '#00ff00').moveTo([3, 0]), 'reference');
    const wrapper = new Group(base, reference), current = new Group(wrapper);
    const target = new Group(new Group(base.copy(), keyed(solid(1, 1, '#0000ff'), 'ink'), reference.copy(), keyed(solid(0.2, 0.2).moveTo([-3, 0]), 'top')));
    const c = choreograph(current, target), entries = order.map(key => c.enter(key));
    assert.equal(c.from('ink').parent, wrapper);
    assert.deepEqual(wrapper.children.map(m => m.key), ['base', 'ink', 'reference', 'top']);
    for (const entry of entries) { beginAnimation(entry); interpolateAnimation(entry, 1); finishAnimation(entry); }
    assert.deepEqual(center(new Scene(sink).add(current)), [0, 0, 255]);
  }
  // The same construction also keeps the clip on an entirely new wrapper.
  const current = new Group(), wrapper = new Group(keyed(solid(1, 1, '#0000ff'), 'ink'));
  wrapper.clipBox = [3, 1, 4, 2];
  const c = choreograph(current, new Group(wrapper)), entry = c.enter('ink');
  beginAnimation(entry); interpolateAnimation(entry, 1);
  assert.equal(ink(pixels(new Scene(sink).add(current)), 2), 0);
});

test('whole-picture fade has native quarter and blank midpoint frames and restores relative dimming', () => {
  const scene = Object.assign(new Scene(sink), {state: {changed: false}});
  const picture = view(scene, st => new Group(new Group(solid(1, 1, st.changed ? '#0000ff' : '#ff0000')
    .moveTo([st.changed ? 2 : -2, 0]).setOpacity(st.changed ? 0.8 : 0.4))), {place: false});
  scene.add(picture); scene.state.changed = true;
  const sync = new ViewSync(picture, {how: 'fade', rateFunc: linear});
  beginAnimation(sync);
  interpolateAnimation(sync, 0.25);
  assert.deepEqual(center(scene, -100), [255, 204, 204]);
  assert.deepEqual(center(scene, 100), [255, 255, 255]);
  interpolateAnimation(sync, 0.5);
  assert.ok(pixels(scene).every(value => value === 255), 'all grouped contents reach blank paper');
  interpolateAnimation(sync, 0.75);
  assert.deepEqual(center(scene, -100), [255, 255, 255]);
  assert.deepEqual(center(scene, 100), [153, 153, 255]);
  finishAnimation(sync);
  assert.equal(picture.current.children[0]!.children[0]!.style.opacity, 0.8);
});

test('matched new paper stays below retained text through staggered admissions and owner clips constrain every entering frame', () => {
  const source = new Group(keyed(word('KEEP'), 'label'));
  const target = new Group(keyed(solid(), 'paper'), keyed(word('KEEP'), 'label'),
    ...[-4, 4, 5].map((x, i) => keyed(solid(0.3, 0.3).moveTo([x, 2]), `later-${i}`)));
  const scene = new Scene(sink).add(source), match = new Transform(source, target, {match: 'key', lagRatio: 0.7, rateFunc: linear});
  beginAnimation(match);
  for (let i = 0; i <= 30; i++) { interpolateAnimation(match, i / 30); assert.ok(ink(pixels(scene), 0) > 100, `frame ${i} retains KEEP`); }
  for (const clipOwner of ['root', 'leaf']) {
    const anchor = () => keyed(solid(0.4, 0.4, '#ff0000').moveTo([-5, 0]), 'anchor');
    const source = new Group(anchor()), entering = keyed(solid(2, 1, '#00ff00'), 'entrant'), target = new Group(anchor(), entering);
    (clipOwner === 'root' ? target : entering).clipBox = [-6, -1, -4, 1];
    const scene = new Scene(sink).add(source), match = new Transform(source, target, {match: 'key', rateFunc: linear});
    beginAnimation(match);
    for (let i = 0; i <= 20; i++) { interpolateAnimation(match, i / 20); assert.equal(ink(pixels(scene), 1), 0, `${clipOwner}, frame ${i}`); }
  }
});

async function motion(draw: (scene: Scene) => Promise<void>, observe?: (scene: Scene) => void) {
  const check = new KeyedMotionSink(() => 'counterexample');
  class Example extends Scene { override async construct() { await draw(this); } }
  await new Example({async frame(scene, dt) { observe?.(scene); await check.frame(scene, dt); }}).run();
  return check.finish();
}

test('occlusion follows one physical repeated label and a handoff supplies every missing glyph', async () => {
  for (const alternating of [false, true]) for (const rebuilt of [false, true]) {
    const samples: {red: number; green: number}[] = [];
    const findings = await motion(async s => {
      const make = () => keyed(new Group(word('OK').moveTo([-3, 0]), word('OK', '#00ff00').moveTo([3, 0])), 'values');
      let labels = make(); s.add(labels); await s.wait(0.2);
      for (let step = 0; step < 6; step++) {
        if (rebuilt) { s.remove(labels); labels = make(); s.add(labels); }
        const cover = keyed(solid(3, 1.3).moveTo([alternating && step % 2 ? 3 : -3, 0]), 'cover');
        s.add(cover); await s.wait(2 / 30); s.remove(cover);
      }
      await s.wait(0.2);
    }, s => { if (s.find('values')) {const p = pixels(s); samples.push({red: ink(p, 0), green: ink(p, 1)});} });
    assert.ok(samples.length > 20);
    assert.equal(findings.some(f => f.kind === 'occluded words'), !alternating, JSON.stringify({alternating, rebuilt, findings}));
    if (alternating) assert.ok(samples.every(p => p.red > 100 || p.green > 100));
  }
  for (const partial of [false, true]) {
    const findings = await motion(async s => {
      const old = word(), replacement = word('ABCD', '#00ff00'), mask = keyed(solid(), 'mask'), group = keyed(new Group(old), 'reader');
      if (partial) { const a = replacement.children[0]!.box()!; replacement.clipBox = [a[0] - 0.01, -1, a[2] + 0.01, 1]; }
      s.add(group); await s.wait(0.2); group.add(mask, replacement);
      assert.equal(ink(pixels(s), 0), 0);
      assert.ok(ink(pixels(s), 1) > 100);
      await s.wait(0.5); group.remove(mask, replacement); await s.wait(0.2);
    });
    assert.equal(findings.some(f => f.kind === 'occluded words'), partial);
  }
  const swapped = await motion(async s => {
    const original = word('AB'), replacement = word('AB', '#00ff00'), group = keyed(new Group(original), 'reader'), mask = solid();
    const boxes = original.children.map(g => g.box()!);
    replacement.children.forEach((glyph, i) => {
      const box = boxes[1 - i]!;
      glyph.setWidth(box[2] - box[0], true).setHeight(box[3] - box[1], true).moveTo([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
    });
    s.add(group); await s.wait(0.2); group.add(mask, replacement); await s.wait(0.5);
    assert.equal(ink(pixels(s), 0), 0); assert.ok(ink(pixels(s), 1) > 100);
    group.remove(mask, replacement); await s.wait(0.2);
  });
  assert.ok(swapped.some(f => f.kind === 'occluded words'), 'a different letter occupying the same box does not replace the missing glyph');
});

test('duplicate words require two visible glyph occurrences, while contained different-sized copies still reject', async () => {
  for (const mode of ['clear', 'traveller clipped', 'fixed covered', 'traveller covered', 'contained']) {
    const native: [number, number][] = [];
    const findings = await motion(async s => {
      const contained = mode === 'contained', fixed = keyed(word('TOKEN', '#ff0000', contained ? 1.7 : 0.8), 'fixed');
      const traveller = keyed(word('TOKEN', '#00ff00', contained ? 0.55 : 0.8).moveTo([contained ? -0.5 : -1, 0]), 'traveller');
      if (mode === 'traveller clipped') traveller.clipBox = [6, 2, 7, 3];
      const paper = solid(8, 2.3);
      if (mode === 'fixed covered') s.add(fixed, paper, traveller);
      else if (mode === 'traveller covered') s.add(traveller, paper, fixed);
      else s.add(fixed, traveller);
      traveller.setOpacity(0); await s.wait(0.2); traveller.setOpacity(1);
      await s.play(traveller.animate.shift([contained ? 1 : 2, 0]), {runTime: 1, rateFunc: linear});
      traveller.setOpacity(0); await s.wait(0.2);
    }, s => { if (s.find('traveller')?.style.opacity === 1) {const p = pixels(s); native.push([ink(p, 0), ink(p, 1)]);} });
    assert.equal(native.length, 30);
    const expected = mode === 'clear' || mode === 'contained';
    assert.equal(findings.some(f => f.kind === 'duplicate words'), expected, mode);
    if (expected) assert.ok(native.some(([a, b]) => a > 20 && b > 20));
    else assert.ok(native.every(([a, b]) => mode === 'fixed covered' ? a === 0 : b === 0));
  }
});

test('travel coverage respects evenodd holes and the victim viewport and never reports more than all glyph ink', async () => {
  for (const mode of ['solid', 'hole', 'clipped victim']) {
    const findings = await motion(async s => {
      const victim = keyed(word(), 'victim');
      if (mode === 'clipped victim') victim.clipBox = [5, 2, 6, 3];
      const ring = new VMobject({fill: '#224466', stroke: 'none', fillRule: 'evenodd'}).setPolygon([[-4,-1.4],[4,-1.4],[4,1.4],[-4,1.4]]);
      if (mode === 'hole') ring.startNewPath([-3.8,-1.2]).addLineTo([3.8,-1.2]).addLineTo([3.8,1.2]).addLineTo([-3.8,1.2]).closePath();
      const traveller = keyed(ring.shift([-1, 0]), 'traveller');
      s.add(victim); await s.wait(0.2); s.add(traveller);
      await s.play(traveller.animate.shift([2, 0]), {runTime: 1, rateFunc: linear});
      s.remove(traveller); await s.wait(0.2);
    }, s => { if (s.find('traveller')) assert.equal(ink(pixels(s), 0) > 100, mode === 'hole'); });
    const covers = findings.filter(f => f.kind === 'covers' || f.kind === 'occluded words');
    assert.equal(covers.length > 0, mode === 'solid');
    if (mode === 'solid') assert.match(covers[0]!.detail, /at least 100%/);
  }
});

test('native travel proof keeps narrow edge ink and wide offstage strokes and refuses a moving hidden-underlay counterfactual', async () => {
  for (const mode of ['clear', 'edge', 'covered', 'frozen aperture', 'moving aperture']) {
    let trip: Animation | undefined;
    const actual: Buffer[] = [], reds: number[] = [];
    class Delivery extends Scene {
      override state = {sent: false};
      override async construct() {
        const picture = view(this, () => new Group(keyed(solid(0.4, 0.4, '#00ff00').moveTo([0, 2]), 'context')), {place: false});
        const backing = solid(0.55, 0.55).moveTo([-0.35, 0]), driver = new Group();
        const aperture = new VMobject({fill: '#fff', stroke: 'none', fillRule: 'evenodd'}).setPolygon([[-20,-10],[20,-10],[20,10],[-20,10]])
          .startNewPath([-0.4,-0.4]).addLineTo([0.4,-0.4]).addLineTo([0.4,0.4]).addLineTo([-0.4,0.4]).closePath();
        driver.addUpdater(() => {
          if (trip?.phase !== 'begun') return;
          if (mode === 'frozen aperture') backing.moveTo([0.175 * trip.mobject.center()[0], 0]);
          if (mode === 'moving aperture') aperture.moveTo([0.175 * trip.mobject.center()[0], 0]);
        });
        const machine = new Machine(this, {views: [picture], start: this.state, events: ['ship'], next: () => ({sent: true}), runTime: 1.2,
          motion: () => [{view: picture, during: 'parcel', present: ['context']}],
          transition: {ship: t => {
            const c = t.choreograph(picture), parcel = mode.endsWith('aperture') ? solid(9, 1.3) : solid(0.4, 0.4, '#ff0000');
            if (mode === 'frozen aperture') parcel.clipBox = [-1, -0.45, 1, 0.45];
            const x = mode === 'edge' ? -8.18 : 7.7;
            const beats = pass(c, 'parcel', parcel, mode.endsWith('aperture') ? [[-2,0],[2,0]] : [[x,-1.2],[x,1.2]], {appear: 0.1, move: 0.6, leave: 0.1});
            trip = beats[1] as Animation; return new Succession([...beats, c.rest({runTime: 0.1})]);
          }},
        });
        this.add(backing, picture, driver);
        if (mode === 'moving aperture') this.add(aperture);
        if (mode === 'covered') this.add(new Group(new Line([8.7, -2], [8.7, 2], {stroke: '#555555', strokeWidth: 2.6})));
        await this.step('ship'); await this.play(machine.send('ship'));
      }
    }
    const check = new MachineMotionCheck(), scene = new Delivery({async frame(s) {
      await check.frame(s);
      if (trip?.phase !== 'begun') return;
      const p = pixels(s); assert.ok(pixels(s, true).equals(p), `${mode}: conservative culling matches reader paint`);
      actual.push(p); reds.push(ink(p, 0));
    }});
    await check.during(scene, () => scene.run());
    assert.ok(actual.length > 15);
    assert.equal(check.findings.length, mode === 'covered' || mode.endsWith('aperture') ? 1 : 0, mode);
    if (mode === 'frozen aperture') assert.ok(actual.every(p => p.equals(actual[0]!)), 'every complete actual frame is frozen');
    else if (mode === 'moving aperture') assert.ok(actual.some(p => !p.equals(actual[0]!)), 'foreground aperture moves actual ink without revealing traveller motion');
    else assert.ok(reds.every(n => mode === 'covered' ? n === 0 : n > 0), mode);
  }
});

test('the endpoint checker rejects a native stacking reversal and accepts disjoint reordering', async () => {
  for (const overlapping of [true, false]) {
    class Order extends Scene {
      override state = {done: false};
      override async construct() {
        const picture = view(this, () => new Group(keyed(solid(2, 2, '#ff0000'), 'red'), keyed(solid(1, 1, '#0000ff').moveTo([overlapping ? 0 : 3, 0]), 'blue')), {place: false});
        this.add(picture);
        const machine = new Machine(this, {start: this.state, views: [picture], events: ['reverse'], next: s => s.done ? undefined : {done: true},
          transition: {reverse: t => {const c = t.choreograph(picture); picture.current.insert(0, c.from('blue')); return c.rest({runTime: 0.2}); }}});
        await this.step('offer'); machine.offer();
      }
    }
    const [result] = await exploreMachines(await new Order(sink).run(), Order);
    assert.ok(result);
    assert.equal(result.problems.some(p => p.includes('transition ends somewhere other')), overlapping);
  }
});

test('native pruning and motion retain SVG default opacity and diagonal square caps', async () => {
  const strokes = [
    new Line([8.7, -2], [8.7, 2], {stroke: '#ff0000', strokeWidth: 2.6, strokeOpacity: undefined}),
    new Line([8.08, 0], [8.2, 0.12], {stroke: '#ff0000', strokeWidth: 0.2, lineCap: 'square', lineJoin: 'round'}),
  ];
  for (const stroke of strokes) {
    const scene = new Scene(sink).add(new Group(stroke)), actual = pixels(scene);
    assert.ok(ink(actual, 0) > 0, 'the native stroke crosses onto the stage');
    assert.ok(pixels(scene, true).equals(actual), 'conservative bounds retain the same actual native ink');
  }
  const findings = await motion(async s => {
    const label = keyed(word(), 'label'), mask = solid().setStyle({fillOpacity: undefined}).setOpacity(0);
    s.add(label, mask); await s.wait(0.2); mask.setOpacity(1);
    assert.equal(ink(pixels(s), 0), 0, 'the undefined fill opacity paints at SVG’s default one');
    await s.wait(0.5); mask.setOpacity(0); await s.wait(0.2);
  });
  assert.ok(findings.some(f => f.kind === 'occluded words'), 'the motion sample uses the same default opacity');
});
