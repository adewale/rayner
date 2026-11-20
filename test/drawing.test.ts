// The drawing kit published as rayner/drawing: its exact names, which the collection's scenes import
// directly; the type scale and its floor, colour roles, words, tiles, plates, connectors, routes and
// transitions in beats; and that the Poppy series' kit (scenes/explainers/lib/poppy-kit.ts), which
// builds on it, draws its lanes with the drawing kit's connector and plate, and keeps its frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from '../explain/drawing.ts';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../tools/lib/roots.ts';
import { entryPoints } from '../tools/lib/entry-points.ts';
import { stage } from '../explain/index.ts';
import type { Stage } from '../explain/index.ts';
import { choreograph } from '../explain/choreograph.ts';
import { MARGIN, PLATE_HEIGHT, RADIUS, SPACE, STROKE, TYPE, addAll, beats, connector, flight, keyedParts, label, pass, plate, route, tile, tones } from '../explain/drawing.ts';
import * as poppy from '../scenes/explainers/lib/poppy-kit.ts';
import { Scene, Group, Line, Text } from '../src/index.ts';
import type { Box, Mobject, Vec } from '../src/index.ts';
import { NullSink } from '../src/timeline.ts';
import { StringSink, toSvgString } from '../src/svg.ts';

test('rayner/drawing exports exactly the kit, and package.json publishes it', () => {
  assert.deepEqual(Object.keys(drawing).sort(), [
    'MARGIN', 'PLATE_HEIGHT', 'RADIUS', 'SPACE', 'STROKE', 'TYPE', 'addAll', 'bars', 'beats', 'callout', 'card', 'code', 'connector', 'described', 'dimension', 'emphasised',
    'flight', 'flow', 'keyedParts', 'label', 'legend', 'pass', 'pin', 'plate', 'route', 'stat', 'table', 'tile', 'tones',
  ]);
  const exports = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).exports;
  assert.deepEqual(exports['./drawing'], { types: './dist/explain/drawing.d.ts', default: './dist/explain/drawing.js' });
  assert.equal(exports['./kit'], undefined, 'one drawing API: rayner/kit, which no release published, is folded into rayner/drawing');
});

test('a keyed composite keys its parts under its own key, and an unkeyed one keys none', async () => {
  const { Scene } = await import('../src/index.ts'); const { NullSink } = await import('../src/timeline.ts'); const { loadFonts } = await import('../explain/testing.ts');
  await loadFonts();
  const { stage } = await import('../explain/index.ts');
  const s = stage(new Scene(new NullSink()));
  const node = drawing.tile(s, 'A', { width: 1, height: 1, key: 'node:A' });
  assert.equal(node.key, 'node:A');
  assert.deepEqual(node.children.map((m) => m.key), ['node:A:box', 'node:A:label']);
  const plain = drawing.tile(s, 'A', { width: 1, height: 1 });
  assert.equal(plain.key, undefined);
  assert.ok(plain.family().every((m) => m.key === undefined), 'an unkeyed picture keys none of its parts');
  const box = drawing.tile(s, 'x', { at: [1, 2], width: 2, height: 1, key: 'slot' });
  assert.deepEqual(box.children.map((m) => m.key), ['slot:box', 'slot:label']);
  assert.deepEqual(box.find('slot:box')!.center(), [1, 2]);
  const big = drawing.stat(s, 'Reads', 3, { at: [2, 0], key: 'reads' });
  assert.deepEqual(big.children.map((m) => m.key), ['reads:title', 'reads:value']);
  assert.ok(Math.abs(big.find('reads:value')!.center()[0] - 2) < 1e-9);
  // `at` moves a whole layout: a flow's row, bars, a table's columns and header row.
  const row = drawing.flow(s, ['a', 'b'], { key: 'f' }), shifted = drawing.flow(s, ['a', 'b'], { at: [1, 0], key: 'f' });
  assert.deepEqual(row.family().map((m) => m.key).filter(Boolean), ['f', 'f:0', 'f:0:box', 'f:0:label', 'f:1', 'f:1:box', 'f:1:label', 'f:1:arrow']);
  const dx = shifted.box()![0] - row.box()![0], dy = shifted.box()![1] - row.box()![1];
  assert.ok(Math.abs(dx - 1) < 1e-9 && Math.abs(dy + 1) < 1e-9);
  const chart = drawing.bars(s, [{ label: 'a', value: 1, display: '1' }], 2, { at: [1, 0], key: 'b' });
  assert.deepEqual(chart.children.map((m) => m.key), ['b:0:label', 'b:0:track', 'b:0:bar', 'b:0:value']);
  assert.ok(Math.abs(chart.find('b:0:label')!.box()![0] + 3) < 1e-9, 'the label starts at x − 4');
  const t = drawing.table(s, ['A'], [['x']], { columns: [0], at: [2, 1], key: 't' });
  assert.ok(Math.abs(t.find('t:head:A')!.center()[0] - 2) < 1e-6 && Math.abs(t.find('t:head:A')!.center()[1] - 1) < 1e-6);
  // Kit text takes the scene's shaping, as the scene's own text does.
  assert.equal(drawing.label(s, 'x').shaping, new Text('x', { shaping: s.scene.textShaping }).shaping);
});

test('a kit function keys an empty key exactly as keyed() does', async () => {
  const { Scene, Circle, keyed } = await import('../src/index.ts'); const { NullSink } = await import('../src/timeline.ts'); const { loadFonts } = await import('../explain/testing.ts');
  await loadFonts();
  const s = stage(new Scene(new NullSink()));
  const outcome = (make: () => { key: string | undefined }): string => {
    try {
      return `keyed ${JSON.stringify(make().key)}`;
    } catch (e) {
      return (e as Error).constructor.name;
    }
  };
  const expected = outcome(() => keyed(new Circle(), ''));
  assert.deepEqual(
    [
      outcome(() => keyed(drawing.label(s, 'x'), '')),
      outcome(() => drawing.tile(s, 'x', { width: 2, height: 1, key: '' })),
      outcome(() => drawing.callout(s, [0, 0], 'x', { key: '' })),
      outcome(() => drawing.dimension(s, [0, 0], [1, 0], 'x', { key: '' })),
      outcome(() => drawing.pin(s, [0, 0], { key: '' })),
    ],
    Array(5).fill(expected),
  );
});

test('keyedParts keys each part in order, groups them, and refuses a key used twice', async () => {
  const { keyedParts } = await import('../explain/drawing.ts');
  const { Circle } = await import('../src/index.ts');
  const p = keyedParts();
  const a = p.add(new Circle(), 'slot:0'), b = p.add(new Circle(), 'slot:1');
  assert.deepEqual(p.group().children.map((m) => m.key), ['slot:0', 'slot:1']);
  assert.equal(a.key, 'slot:0'); assert.equal(b.key, 'slot:1');
  assert.throws(() => p.add(new Circle(), 'slot:0'), /keyedParts\(\)\.add\(\): two parts are keyed "slot:0"/);
});

test('callout keys its parts, and dimension and pin describe themselves', async () => {
  const { Scene, Rectangle } = await import('../src/index.ts'); const { NullSink } = await import('../src/timeline.ts'); const { loadFonts } = await import('../explain/testing.ts');
  const { describesItself, seenSource } = await import('../explain/look.ts');
  await loadFonts();
  const s = stage(new Scene(new NullSink()));
  const target = new Rectangle({ width: 1, height: 0.5 }).moveTo([1, 1]);
  const built = drawing.callout(s, target, 'here', { side: 'above', gap: 0.3, key: 'note' });
  assert.equal(built.key, 'note');
  const line = drawing.dimension(s, [0, 0], [2, 0], '2 units', { offset: -0.4 });
  assert.deepEqual(built.children.map((m) => m.key), ['note:line', 'note:dot', 'note:backing', 'note:text']);
  const stuck = drawing.pin(s, [3, 1], { label: 'centre', key: 'stuck' });
  assert.deepEqual(stuck.children.map((m) => m.key), ['stuck:needle', 'stuck:head', 'stuck:label']);
  // A callout is described by its words; a dimension line and a pin say what they are.
  assert.equal(describesItself(built), false);
  assert.ok(describesItself(line) && describesItself(stuck));
  assert.equal((line as unknown as Record<symbol, () => { what: string }>)[seenSource]!().what, 'A dimension line marked “2 units”');
  assert.equal((stuck as unknown as Record<symbol, () => { what: string }>)[seenSource]!().what, 'A pin marked “centre”');
  assert.equal(drawing.pin(s, [0, 0]).key, undefined);
  // side: 'left' puts the label's end beside the head instead of its start, mirrored about the needle.
  const left = drawing.pin(s, [3, 1], { label: 'centre', side: 'left', key: 'left' });
  const [rightLabel, leftLabel] = [stuck.find('stuck:label')!, left.find('left:label')!].map((m) => m.box()!) as [Box, Box];
  assert.ok(leftLabel[2] < 3 && rightLabel[0] > 3, 'the left label ends before the needle; the right one starts after it');
  assert.ok(Math.abs((3 - leftLabel[2]) - (rightLabel[0] - 3)) < 1e-6, 'both labels stand off the needle by the same gap');
});

test('legend draws swatches with words, keyed by label, describes itself as its swatch→meaning pairs', async () => {
  const { Scene } = await import('../src/index.ts'); const { NullSink } = await import('../src/timeline.ts'); const { loadFonts } = await import('../explain/testing.ts');
  const { describesItself, seenSource } = await import('../explain/look.ts');
  await loadFonts();
  const s = stage(new Scene(new NullSink()));
  const items = [
    { label: 'cat’s bits', fill: '#8250df' },
    { label: 'the browser', stroke: '#0969da', dashed: true },
    { label: 'removed', fill: 'none', stroke: '#cf222e', dashed: true },
  ];
  const key = drawing.legend(s, items, { at: [-6, 3], key: 'k' });
  assert.equal(key.key, 'k');
  assert.deepEqual(key.children.map((c) => c.key), ['k:cat’s bits', 'k:the browser', 'k:removed']);
  assert.ok(describesItself(key));
  assert.equal(
    (key as unknown as Record<symbol, () => { what: string }>)[seenSource]!().what,
    'Key: purple fill, cat’s bits; dashed blue line, the browser; dashed red outline, removed',
  );
  // A column steps down from its first entry, which starts at `at`, the swatch centred on that line; a row steps right.
  assert.deepEqual(key.find('k:cat’s bits')!.children.map((c) => c.key), ['k:cat’s bits:swatch', 'k:cat’s bits:text']);
  const swatch = key.find('k:cat’s bits:swatch')!.box()!;
  assert.ok(Math.abs(swatch[0] + 6) < 1e-6 && Math.abs((swatch[1] + swatch[3]) / 2 - 3) < 1e-6);
  const tops = key.children.map((c) => c.box()![3]);
  assert.ok(tops[0]! > tops[1]! && tops[1]! > tops[2]!);
  const row = drawing.legend(s, items, { stack: 'row', key: 'row' });
  const lefts = row.children.map((c) => c.box()![0]);
  assert.ok(lefts[0]! < lefts[1]! && lefts[1]! < lefts[2]!);
  // The words are in the stage's ink, the dash on the swatch.
  assert.ok(key.family().some((m) => m.style.dashArray));
  assert.throws(() => drawing.legend(s, [], { key: 'k' }), /^RangeError: legend\(\): a legend needs at least one entry/);
  assert.throws(() => drawing.legend(s, [items[0]!, items[0]!], { key: 'k' }), /two entries say "cat’s bits"/);
  assert.throws(() => drawing.legend(s, [{ label: 'nothing' }], { key: 'k' }), /needs a fill or a stroke/);
});

/** A stage to draw with, styled as `options` say, on a scene that has run. */
async function stageOf(options: Parameters<typeof stage>[1] = {}): Promise<Stage> {
  const scene = new Scene(new NullSink());
  await scene.run();
  return stage(scene, options);
}
const poppyStage = () => stageOf({ palette: { ...poppy.PALETTE }, heading: false });
/** What some mobjects show, as one SVG drawing. */
const drawn = (...parts: Mobject[]) => {
  const scene = new Scene(new NullSink());
  scene.add(...parts);
  return toSvgString(scene);
};

test('the type scale has a phone-safe floor, and label refuses text under it', async () => {
  const s = await stageOf();
  assert.deepEqual(TYPE, { small: 0.56, label: 0.64, title: 0.8, display: 1.6 });
  // 0.56 units on a 358 px phone stage, 16 units wide, is 12.5 px: above the review's 12 px floor.
  assert.ok((TYPE.small * 358) / 16 >= 12);
  assert.ok(Object.values(SPACE).every((v) => Math.abs(v / 0.14 - Math.round(v / 0.14)) < 1e-9), 'spacing is in multiples of 0.14');
  assert.ok(STROKE.hair < STROKE.fine && STROKE.fine < STROKE.line && STROKE.line < STROKE.bold);
  assert.ok(RADIUS.sharp < RADIUS.small && RADIUS.small < RADIUS.panel && RADIUS.panel < RADIUS.round);
  assert.ok(MARGIN.right - MARGIN.left < 16 && MARGIN.top - MARGIN.bottom < 9, 'the margin lies inside the 16 × 9 stage');
  assert.throws(() => label(s, 'too small', { size: 0.5 }), /label\(\): "too small" at 0\.5 units is under TYPE\.small \(0\.56\)/);
  assert.throws(() => label(s, 'not a size', { size: Number.NaN }), RangeError);
  assert.throws(() => label(s, 42, { size: 0.42 }), /label\(\): "42" at 0\.42 units/, 'a number is refused as its words');
  const t = label(s, 'Unauthorized');
  assert.ok(t instanceof Text);
  assert.equal(t.text, 'Unauthorized');
  assert.equal(t.key, undefined, 'a single part comes unkeyed');
});

test('label anchors the middle, start or end of the line at `at`, at its vertical centre, in the stage ink', async () => {
  const s = await stageOf({ style: 'nord' });
  const at: Vec = [1, -2];
  const [start, middle, end] = (['start', 'middle', 'end'] as const).map((align) => label(s, 'cache line', { at, align }).box()!) as [Box, Box, Box];
  assert.ok(Math.abs(start[0] - at[0]) < 1e-6, 'start: the left edge is at x');
  assert.ok(Math.abs(end[2] - at[0]) < 1e-6, 'end: the right edge is at x');
  assert.ok(Math.abs((middle[0] + middle[2]) / 2 - at[0]) < 1e-6, 'middle: centred on x');
  for (const b of [start, middle, end]) assert.ok(Math.abs((b[1] + b[3]) / 2 - at[1]) < 1e-6, 'centred on y');
  assert.ok(Math.abs(start[2] - start[0] - label(s, 'cache line').width()) < 1e-6, 'width() is the measured width');
  assert.deepEqual(label(s, 'cache line', { at }).box(), middle, 'centred on at by default');
  assert.match(drawn(label(s, 'ink')), new RegExp(`fill="${s.look.ink}"`, 'i'));
  const plain = drawn(label(s, 'x = 1'));
  assert.notEqual(drawn(label(s, 'x = 1', { bold: true })), plain, 'bold draws other glyphs');
  assert.notEqual(drawn(label(s, 'x = 1', { mono: true })), plain, 'mono draws other glyphs');
  assert.equal(drawn(label(s, 'x = 1', { color: '#ff0000' })).includes('fill="#ff0000"'), true);
});

test('tones names the stage look by role', async () => {
  const s = await stageOf({ style: 'nord' });
  const t = tones(s), l = s.look;
  assert.deepEqual(t, { ground: l.paper, ink: l.ink, soft: l.soft, idle: l.muted, raised: l.raised, rule: l.rule, accent: l.emphasis, good: l.good, bad: l.bad });
});

test('a raised tile is a structure\'s body sized to its words, keyed by part, idle or in use; addAll adds its parts by their own keys', async () => {
  const s = await stageOf();
  const raised = (text: string, options: Omit<Parameters<typeof tile>[2], 'raised'>) => tile(s, text, { size: TYPE.small, ...options, raised: true });
  const [body, label] = raised('cache', { at: [2, 1], key: 'c' }).children;
  assert.equal(body!.key, 'c:box');
  assert.equal(label!.key, 'c:label');
  const b = body!.box()!, l = label!.box()!, w = (label as Text).width();
  assert.ok(Math.abs(b[2] - b[0] - (w + 2 * SPACE.m)) < 1e-6, 'as wide as the words and SPACE.m each side');
  assert.ok(Math.abs(b[3] - b[1] - PLATE_HEIGHT) < 1e-6, 'PLATE_HEIGHT tall');
  assert.ok(b[0] < l[0] && l[2] < b[2] && b[1] < l[1] && l[3] < b[3], 'the words sit inside the box');
  assert.ok(Math.abs((b[0] + b[2]) / 2 - 2) < 1e-6 && Math.abs((b[1] + b[3]) / 2 - 1) < 1e-6, 'centred on at');
  assert.equal(body!.style.fill, s.look.raised);
  assert.equal(body!.style.stroke, s.look.muted);
  assert.equal(body!.style.strokeWidth, STROKE.fine);
  const [lit, litLabel] = raised('cache', { key: 'c', active: true, width: 3 }).children;
  assert.equal(lit!.style.stroke, s.look.ink);
  assert.equal(lit!.style.strokeWidth, STROKE.bold);
  assert.notEqual(drawn(litLabel!), drawn(label!.copy().moveTo(litLabel!.center())), 'its words are bold');
  assert.ok(Math.abs(lit!.box()![2] - lit!.box()![0] - 3) < 1e-6, 'a given width');
  // On the paper, as ever: an unraised tile keeps its soft outline and emphasis, and its words their weight.
  const flat = tile(s, 'cache', { key: 'f', width: 3, height: 1, active: true });
  assert.equal(flat.find('f:box')!.style.fill, s.look.paper);
  assert.equal(flat.find('f:box')!.style.stroke, s.look.emphasis);
  assert.equal(drawn(flat.find('f:label')!), drawn(tile(s, 'cache', { key: 'f', width: 3, height: 1 }).find('f:label')!), 'its words are not bold');
  // addAll adds a keyed composite's parts, or a list of parts, by their own keys, and leaves the composite out; an unkeyed part is refused.
  const parts = keyedParts();
  addAll(parts, raised('cache', { key: 'c' }));
  addAll(parts, plate(s, 'lane', { at: [0, -2], key: 'n' }));
  assert.deepEqual(parts.group().children.map((m) => m.key), ['c:box', 'c:label', 'n:plate', 'n:label']);
  assert.throws(() => addAll(keyedParts(), [new Line([0, 0], [1, 0])]), /addAll\(\): a part has no key/);
  assert.throws(() => addAll(keyedParts(), tile(s, 'unkeyed', { width: 2, height: 1 })), /addAll\(\): a part has no key/);
});

test('label sets its words at TYPE.small unless given a size, takes a number as its words, and goes above the floor', async () => {
  const s = await stageOf();
  assert.equal(label(s, 'x').fontSize, TYPE.small, 'TYPE.small by default');
  assert.equal(label(s, 'x', { size: TYPE.display }).fontSize, TYPE.display);
  assert.equal(label(s, 0.5).text, '0.5', 'a number is drawn as its words');
  assert.equal(label(s, 'x', { size: TYPE.small }).fontSize, TYPE.small, 'the floor itself is drawn');
});

test('plate hides what runs behind a label: an opaque plate of the paper under the words, at any alignment', async () => {
  const s = await stageOf();
  for (const align of ['start', 'middle', 'end'] as const) {
    const [back, label] = plate(s, 'lane name', { at: [0, 1], key: 'n', align });
    assert.equal(back!.key, 'n:plate');
    assert.equal(label!.key, 'n:label');
    assert.equal(back!.style.fill, s.look.paper);
    const p = back!.box()!, l = label!.box()!;
    assert.ok(p[0] < l[0] && l[2] < p[2] && p[1] < l[1] && l[3] < p[3], `${align}: the plate covers the words`);
    assert.ok(Math.abs(p[3] - p[1] - PLATE_HEIGHT) < 1e-6);
  }
});

test('connector is an open Line through rounded corners, idle or in use; route drops repeated points', async () => {
  const s = await stageOf();
  const points: Vec[] = [[-4, 0], [0, 0], [0, 2], [3, 2]];
  const c = connector(s, points);
  assert.ok(c instanceof Line, 'a Line, which check treats as a connector');
  assert.equal(c.style.stroke, s.look.muted);
  assert.equal(c.style.strokeWidth, STROKE.line);
  const b = c.box()!;
  assert.ok(Math.abs(b[0] + 4) < 0.1 && Math.abs(b[2] - 3) < 0.1 && Math.abs(b[3] - 2) < 0.1, 'it runs from the first point to the last');
  const lit = connector(s, points, { active: true });
  assert.equal(lit.style.stroke, s.look.ink);
  assert.equal(lit.style.strokeWidth, STROKE.bold);
  assert.throws(() => connector(s, [[0, 0]]), /connector\(\): a connector needs at least two points/);
  const r = route([0, 0], [0, 0], [1, 0], [1, 0], [1, 1]);
  assert.ok(r instanceof Line);
  assert.throws(() => route([1, 1], [1, 1]), /route\(\): a route needs two distinct points/);
});

test('words, plates and connectors draw what the Poppy kit draws, on Poppy\'s stage', async () => {
  const s = await poppyStage();
  for (const [value, options] of [['Unauthorized', { size: TYPE.title, bold: true }], ['orders:write', { mono: true, align: 'end' as const, at: [3, -1] as Vec }], ['your agent', { align: 'middle' as const, color: poppy.TONE.soft }]] as const)
    assert.equal(drawn(label(s, value, options)), drawn(poppy.label(s, value, options)), value);
  // A Poppy lane is a connector along laneRoute, with its name on a plate.
  for (const active of [false, true]) {
    const spec = { id: 'orders', name: 'orders', y: 1.5, from: [-4, 0] as Vec, trunk: -2, to: 3, nameX: -1, active };
    const [line, back, name] = poppy.lane(s, spec);
    assert.equal(drawn(connector(s, poppy.laneRoute(spec), { active })), drawn(line!), `lane line, active ${active}`);
    assert.equal(drawn(...plate(s, 'orders', { at: [-1, 1.5], key: 'p', color: active ? poppy.TONE.ink : poppy.TONE.soft, bold: active })), drawn(back!, name!), `lane name, active ${active}`);
  }
  assert.equal(drawn(route([0, 0], [1, 0], [1, 0], [2, 3])), drawn(poppy.route([0, 0], [1, 0], [1, 0], [2, 3])));
});

/** What a picture shows, as its rendered marks in any order (a part that enters again is painted last). */
const marks = (m: Mobject) => drawn(m).split('/>').sort().join('/>');
/** Two pictures of one view: a keyed box whose words change, a value, and a token that moves. */
function pictures(s: Stage) {
  const picture = (x: number, value: string, token: Vec) => {
    const parts = keyedParts();
    addAll(parts, tile(s, value === '1' ? 'idle' : 'in use', { at: [x, 2], key: 'b', raised: true, size: TYPE.small, active: value !== '1' }));
    parts.add(label(s, value, { at: [-6, -2] }), 'value');
    parts.add(new Group(label(s, 'request', { at: token })), 'token');
    return parts.group();
  };
  return { before: picture(-3, '1', [-5, 0]), after: picture(2, '2', [4, 0]) };
}
/**
 * Every frame of playing `make(choreography)` from `before` to `after`, as SVG; with what the current
 * picture shows at the end, and what the target shows, as marks.
 */
async function frames(make: (c: ReturnType<typeof choreograph>, s: Stage) => ReturnType<typeof beats>): Promise<{ frames: string[]; end: string; target: string }> {
  const sink = new StringSink();
  let end = '', target = '';
  class Play extends Scene {
    override async construct() {
      const s = stage(this, { palette: { ...poppy.PALETTE }, heading: false });
      const { before, after } = pictures(s);
      this.add(before);
      await this.step('go');
      await this.play(make(choreograph(before, after), s));
      end = marks(before.copy());
      target = marks(after);
    }
  }
  await new Play(sink).run();
  return { frames: sink.frames, end, target };
}

test('beats replaces changed words, flies a part along its route and ends on the target, frame for frame as the Poppy kit does', async () => {
  const kit = await frames((c) => beats(c, flight(c, 'token', [[-5, 0], [0, -1]]), { fresh: ['token'], lead: ['b:box'] }));
  const theirs = await frames((c) => poppy.beats(c, poppy.flight(c, 'token', [[-5, 0], [0, -1]]), { fresh: ['token'], lead: ['b:box'] }));
  assert.ok(kit.frames.length > 30, 'the transition plays over many frames');
  assert.deepEqual(kit.frames, theirs.frames);
  assert.equal(kit.end, kit.target, 'it ends on the target picture');
  assert.ok(new Set(kit.frames).size > 20, 'the frames change as the transition plays');
  // A token that neither picture keeps passes through, as the Poppy kit passes one.
  const passing = (k: typeof pass) => (c: ReturnType<typeof choreograph>, s: Stage) => beats(c, () => k(c, 'note', label(s, 'note'), [[-6, 3], [6, 3]]));
  const passed = await frames(passing(pass));
  assert.deepEqual(passed.frames, (await frames(passing(poppy.pass))).frames);
  assert.equal(passed.end, passed.target, 'the passing token leaves nothing behind');
});

test('beats with no options replaces only the words that changed, and settles the rest onto the target', async () => {
  const played = await frames((c) => beats(c));
  assert.ok(played.frames.length > 10);
  assert.equal(played.end, played.target);
  // Poppy's beats takes its ticket, barrier and answer as fresh by default; told none are, it plays as the kit's default does.
  assert.deepEqual(played.frames, (await frames((c) => poppy.beats(c, undefined, { fresh: [] }))).frames);
});

test('the tutorial\'s kit example runs as printed: keyed slots, the newest in use, words no smaller than TYPE.small', async () => {
  const doc = readFileSync(join(ROOT, 'docs/TUTORIAL.md'), 'utf8');
  const printed = /<!-- kit example, run by test\/drawing\.test\.ts -->\n```ts\n([\s\S]*?)```/.exec(doc)?.[1];
  assert.ok(printed, 'docs/TUTORIAL.md prints the kit example');
  // As printed, with each entry point the library's own module.
  const source = printed.replace(/from '(rayner(?:\/[\w-]+)?)'/g, (_all, entry: string) => `from ${JSON.stringify(pathToFileURL(join(ROOT, entryPoints(ROOT).get(entry)! + '.ts')).href)}`);
  const folder = await mkdtemp(join(tmpdir(), 'rayner-kit-'));
  try {
    await writeFile(join(folder, 'slots.ts'), source);
    const { drawSlots } = await import(pathToFileURL(join(folder, 'slots.ts')).href) as { drawSlots: (s: Stage, policy: string, cache: readonly string[], y: number) => Group };
    const s = await stageOf({ style: 'nord' });
    const picture = drawSlots(s, 'LRU', ['D', 'C', 'B'], 1);
    assert.deepEqual(picture.children.map((m) => m.key), ['LRU:name', 'LRU:D:box', 'LRU:D:label', 'LRU:C:box', 'LRU:C:label', 'LRU:B:box', 'LRU:B:label', 'LRU:shelf']);
    const part = (key: string) => picture.children.find((m) => m.key === key)!;
    assert.equal(part('LRU:D:box').style.stroke, s.look.ink, 'the newest slot is in use');
    assert.equal(part('LRU:C:box').style.stroke, s.look.muted);
    assert.ok(part('LRU:shelf') instanceof Line);
    const texts = picture.family().filter((m): m is Text => m instanceof Text);
    assert.deepEqual(texts.map((t) => t.text), ['LRU', 'D', 'C', 'B']);
    assert.ok(texts.every((t) => t.fontSize >= TYPE.small));
    // No two slots overlap, and every slot sits above the shelf.
    const boxes = ['D', 'C', 'B'].map((k) => part(`LRU:${k}:box`).box()!);
    for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i - 1]![2] < boxes[i]![0], 'slots stand apart');
    for (const b of boxes) assert.ok(b[1] > part('LRU:shelf').box()![3]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
