// The drawing kit published as rayner/drawing: its exact names, which the collection's scenes import directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from '../explain/drawing.ts';
import { readFileSync } from 'node:fs';
import { stage } from '../explain/index.ts';
import type { Box } from '../src/index.ts';

test('rayner/drawing exports exactly the kit, and package.json publishes it', () => {
  assert.deepEqual(Object.keys(drawing).sort(), ['bars', 'callout', 'card', 'code', 'dimension', 'dot', 'emphasised', 'flow', 'keyed', 'keyedParts', 'label', 'legend', 'pin', 'segment', 'stat', 'table', 'tile']);
  const exports = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).exports;
  assert.deepEqual(exports['./drawing'], { types: './dist/explain/drawing.d.ts', default: './dist/explain/drawing.js' });
});

test('keyed sets a key and returns the mobject; segment and dot take keys like the rest of the kit, and a keyed composite keys its parts', async () => {
  const { Scene, Circle } = await import('../src/index.ts'); const { NullSink } = await import('../src/output.ts'); const { loadFonts } = await import('../explain/testing.ts');
  await loadFonts();
  const { stage } = await import('../explain/index.ts');
  const s = stage(new Scene(new NullSink()));
  const c = new Circle();
  assert.equal(drawing.keyed(c, 'sun'), c);
  assert.equal(c.key, 'sun');
  assert.equal(drawing.segment(s, [0, 0], [1, 0], { color: s.look.soft, key: 'axis' }).key, 'axis');
  const node = drawing.dot(s, 'A', { key: 'node:A' });
  assert.equal(node.key, 'node:A');
  assert.deepEqual(node.children.map((m) => m.key), ['node:A:circle', 'node:A:label']);
  const plain = drawing.dot(s, 'A');
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
  assert.equal(drawing.label(s, 'x').shaping, s.scene.text('x').shaping);
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

test('callout builds the picture s.callout draws in, and dimension and pin describe themselves', async () => {
  const { Scene, Rectangle } = await import('../src/index.ts'); const { NullSink } = await import('../src/output.ts'); const { loadFonts } = await import('../explain/testing.ts');
  const { describesItself, seenSource } = await import('../explain/look.ts');
  await loadFonts();
  const s = stage(new Scene(new NullSink()));
  const { paintDefaults } = await import('../src/mobject.ts');
  // As each part would be on the stage: a colour left out takes the stage's when the picture enters it.
  const points = (m: import('../src/index.ts').Mobject) => (paintDefaults(m, s.scene.colors), JSON.stringify(m.family().map((x) => [x.constructor.name, x.box(), x.style])));
  const target = new Rectangle({ width: 1, height: 0.5 }).moveTo([1, 1]);
  const built = drawing.callout(s, target, 'here', { side: 'above', gap: 0.3, key: 'note' });
  assert.equal(built.key, 'note');
  assert.equal(points(built), points(await s.callout(target, 'here', { side: 'above', gap: 0.3 })));
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
  const { Scene } = await import('../src/index.ts'); const { NullSink } = await import('../src/output.ts'); const { loadFonts } = await import('../explain/testing.ts');
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
