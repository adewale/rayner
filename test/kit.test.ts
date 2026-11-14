// rayner/kit (explain/kit.ts): the type scale and its floor, colour roles, words, boxes, plates,
// connectors, routes and transitions in beats; and, for the parts it took from the Poppy series' kit
// (scenes/explainers/lib/poppy-kit.ts), that the two still draw and play the same marks and frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../tools/lib/roots.ts';
import { entryPoints } from '../tools/lib/entry-points.ts';
import { Scene, Group, Line, Text } from '../src/index.ts';
import type { Box, Mobject, Vec } from '../src/index.ts';
import { NullSink, StringSink, toSvgString } from '../src/output.ts';
import { stage } from '../explain/index.ts';
import type { Stage } from '../explain/index.ts';
import { choreograph } from '../explain/choreograph.ts';
import { keyedParts } from '../explain/drawing.ts';
import { MARGIN, MIN_TEXT, PLATE_HEIGHT, RADIUS, SPACE, STROKE, TYPE, addAll, beats, box, connector, flight, pass, plate, route, tones, words } from '../explain/kit.ts';
import * as poppy from '../scenes/explainers/lib/poppy-kit.ts';

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

test('the type scale has a phone-safe floor, and words refuses text under it', async () => {
  const s = await stageOf();
  assert.deepEqual(TYPE, { small: 0.56, label: 0.64, title: 0.8, display: 1.6 });
  assert.equal(MIN_TEXT, TYPE.small);
  // 0.56 units on a 358 px phone stage, 16 units wide, is 12.5 px: above the review's 12 px floor.
  assert.ok((MIN_TEXT * 358) / 16 >= 12);
  assert.ok(Object.values(SPACE).every((v) => Math.abs(v / 0.14 - Math.round(v / 0.14)) < 1e-9), 'spacing is in multiples of 0.14');
  assert.ok(STROKE.hair < STROKE.fine && STROKE.fine < STROKE.line && STROKE.line < STROKE.bold);
  assert.ok(RADIUS.sharp < RADIUS.small && RADIUS.small < RADIUS.panel && RADIUS.panel < RADIUS.round);
  assert.ok(MARGIN.right - MARGIN.left < 16 && MARGIN.top - MARGIN.bottom < 9, 'the margin lies inside the 16 × 9 stage');
  assert.throws(() => words(s, 'too small', { size: 0.5 }), /words\(\): "too small" at 0\.5 units is under MIN_TEXT \(0\.56\)/);
  assert.throws(() => words(s, 'not a size', { size: Number.NaN }), RangeError);
  const t = words(s, 'Unauthorized');
  assert.ok(t instanceof Text);
  assert.equal(t.text, 'Unauthorized');
  assert.equal(t.key, undefined, 'a single part comes unkeyed');
});

test('words anchors the start, middle or end of the line at `at`, at its vertical centre, in the stage ink', async () => {
  const s = await stageOf({ style: 'nord' });
  const at: Vec = [1, -2];
  const [start, middle, end] = (['start', 'middle', 'end'] as const).map((align) => words(s, 'cache line', { at, align }).box()!) as [Box, Box, Box];
  assert.ok(Math.abs(start[0] - at[0]) < 1e-6, 'start: the left edge is at x');
  assert.ok(Math.abs(end[2] - at[0]) < 1e-6, 'end: the right edge is at x');
  assert.ok(Math.abs((middle[0] + middle[2]) / 2 - at[0]) < 1e-6, 'middle: centred on x');
  for (const b of [start, middle, end]) assert.ok(Math.abs((b[1] + b[3]) / 2 - at[1]) < 1e-6, 'centred on y');
  assert.ok(Math.abs(start[2] - start[0] - words(s, 'cache line').width()) < 1e-6, 'width() is the measured width');
  assert.match(drawn(words(s, 'ink')), new RegExp(`fill="${s.look.ink}"`, 'i'));
  const plain = drawn(words(s, 'x = 1'));
  assert.notEqual(drawn(words(s, 'x = 1', { bold: true })), plain, 'bold draws other glyphs');
  assert.notEqual(drawn(words(s, 'x = 1', { mono: true })), plain, 'mono draws other glyphs');
  assert.equal(drawn(words(s, 'x = 1', { color: '#ff0000' })).includes('fill="#ff0000"'), true);
});

test('tones names the stage look by role', async () => {
  const s = await stageOf({ style: 'nord' });
  const t = tones(s), l = s.look;
  assert.deepEqual(t, { ground: l.paper, ink: l.ink, soft: l.soft, idle: l.muted, raised: l.raised, rule: l.rule, accent: l.emphasis, good: l.good, bad: l.bad });
});

test('box draws a labelled box sized to its words, keyed by part, idle or in use', async () => {
  const s = await stageOf();
  const [body, label] = box(s, 'cache', { at: [2, 1], key: 'c' });
  assert.equal(body!.key, 'c:box');
  assert.equal(label!.key, 'c:label');
  const b = body!.box()!, l = label!.box()!, w = (label as Text).width();
  assert.ok(Math.abs(b[2] - b[0] - (w + 2 * SPACE.m)) < 1e-6, 'as wide as the words and SPACE.m each side');
  assert.ok(Math.abs(b[3] - b[1] - PLATE_HEIGHT) < 1e-6, 'PLATE_HEIGHT tall');
  assert.ok(b[0] < l[0] && l[2] < b[2] && b[1] < l[1] && l[3] < b[3], 'the words sit inside the box');
  assert.ok(Math.abs((b[0] + b[2]) / 2 - 2) < 1e-6 && Math.abs((b[1] + b[3]) / 2 - 1) < 1e-6, 'centred on at');
  assert.equal(body!.style.stroke, s.look.muted);
  assert.equal(body!.style.strokeWidth, STROKE.fine);
  const [lit, litLabel] = box(s, 'cache', { key: 'c', active: true, width: 3 });
  assert.equal(lit!.style.stroke, s.look.ink);
  assert.equal(lit!.style.strokeWidth, STROKE.bold);
  assert.notEqual(drawn(litLabel!), drawn(label!.copy().moveTo(litLabel!.center())), 'its words are bold');
  assert.ok(Math.abs(lit!.box()![2] - lit!.box()![0] - 3) < 1e-6, 'a given width');
  // addAll adds the parts by their own keys; an unkeyed part is refused.
  const parts = keyedParts();
  addAll(parts, box(s, 'cache', { key: 'c' }));
  assert.deepEqual(parts.group().children.map((m) => m.key), ['c:box', 'c:label']);
  assert.throws(() => addAll(keyedParts(), [new Line([0, 0], [1, 0])]), /addAll\(\): a part has no key/);
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
    assert.equal(drawn(words(s, value, options)), drawn(poppy.words(s, value, options)), value);
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
    addAll(parts, box(s, value === '1' ? 'idle' : 'in use', { at: [x, 2], key: 'b', active: value !== '1' }));
    parts.add(words(s, value, { at: [-6, -2] }), 'value');
    parts.add(new Group(words(s, 'request', { at: token, align: 'middle' })), 'token');
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
  const passing = (k: typeof pass) => (c: ReturnType<typeof choreograph>, s: Stage) => beats(c, () => k(c, 'note', words(s, 'note'), [[-6, 3], [6, 3]]));
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

test('the tutorial\'s kit example runs as printed: keyed slots, the newest in use, words no smaller than MIN_TEXT', async () => {
  const doc = readFileSync(join(ROOT, 'docs/TUTORIAL.md'), 'utf8');
  const printed = /<!-- kit example, run by test\/kit\.test\.ts -->\n```ts\n([\s\S]*?)```/.exec(doc)?.[1];
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
    assert.ok(texts.every((t) => t.fontSize >= MIN_TEXT));
    // No two slots overlap, and every slot sits above the shelf.
    const boxes = ['D', 'C', 'B'].map((k) => part(`LRU:${k}:box`).box()!);
    for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i - 1]![2] < boxes[i]![0], 'slots stand apart');
    for (const b of boxes) assert.ok(b[1] > part('LRU:shelf').box()![3]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
