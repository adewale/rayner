import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Rectangle, Line, TransformMatching, matchByKey } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Mobject } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { table } from '../explain/drawing.ts';
import { bars, flow } from '../explain/drawing.ts';
import { fc, params } from './lib/pbt.ts';
import { beginAnimation } from '../src/animation.ts';

await loadFonts();
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test('comparison tables align text starts and numeric ends, including their headers', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          name: fc.constantFrom('Cache', 'Exact store', 'Database'),
          value: fc.integer({ min: 0, max: 1000000 }),
        }),
        { minLength: 2, maxLength: 5 },
      ),
      (rows) => {
        const drawing = table(
          stage(new Scene(new NullSink())),
          ['Source', 'Reads'],
          rows.map((r) => [r.name, r.value]),
          { columns: [-4, 4], key: 'comparison' },
        );
        const texts = drawing.family().filter((m): m is Text => m instanceof Text);
        assert.deepEqual(
          texts.map((t) => t.text),
          ['Source', 'Reads', ...rows.flatMap((r) => [r.name, String(r.value)])],
        );
        assert.deepEqual(
          texts.slice(0, 2).map((t) => t.weight),
          ['bold', 'bold'],
        );
        const names = texts.filter((_, i) => i % 2 === 0),
          values = texts.filter((_, i) => i % 2 === 1);
        for (const t of names) near(t.box()![0], names[0]!.box()![0]);
        for (const t of values) near(t.box()![2], values[0]!.box()![2]);
        assert.ok(
          Math.max(...names.map((t) => t.box()![2])) < Math.min(...values.map((t) => t.box()![0])),
          'columns remain separate',
        );
        const rules = drawing.children.filter((m): m is Line => m instanceof Line);
        assert.equal(rules.length, 1);
        assert.ok(rules[0]!.box()![3] < Math.min(...texts.slice(0, 2).map((t) => t.box()![1])));
        assert.ok(rules[0]!.box()![1] > Math.max(...texts.slice(2, 4).map((t) => t.box()![3])));
      },
    ),
    params(200),
  );
});

test('wrapping a flow label preserves equal peer boxes and keeps every word inside its box', () => {
  const names = ['Route', 'Trip', 'Service date'],
    drawing = flow(stage(new Scene(new NullSink())), names, { key: 'reader-flow' });
  const nodes = names.map((_, i) => drawing.find(`reader-flow:${i}`)!);
  const boxes = nodes.map((n) => n.children.find((m): m is Rectangle => m instanceof Rectangle)!);
  for (const box of boxes) near(box.height(), boxes[0]!.height());
  for (const [i, node] of nodes.entries()) {
    const texts = node.children.filter((m): m is Text => m instanceof Text);
    assert.equal(texts.map((t) => t.text).join(' '), names[i]);
    const b = boxes[i]!.box()!;
    for (const text of texts) {
      const t = text.box()!;
      assert.ok(t[0] > b[0] && t[2] < b[2] && t[1] > b[1] && t[3] < b[3]);
    }
  }
});

test('bar labels share the zero edge and displayed numbers share a right edge', () => {
  const drawing = bars(
    stage(new Scene(new NullSink())),
    [
      { label: 'Before', value: 0, display: '0' },
      { label: 'On arrival: add elapsed × rate', value: 0.5, display: '0.5' },
      { label: 'After', value: 5, display: '5' },
    ],
    5,
    { key: 'reader-bars' },
  );
  const labels = drawing.children.filter((m) => m.key?.endsWith(':label'));
  const values = drawing.children.filter((m) => m.key?.endsWith(':value'));
  assert.equal(labels.length, 3);
  assert.equal(values.length, 3);
  for (const label of labels) near(label.box()![0], -4);
  for (const value of values) near(value.box()![2], values[0]!.box()![2]);
});

test('a table placed by its edges spreads its measured columns with equal gaps and spans exactly those edges', () => {
  const s = stage(new Scene(new NullSink()));
  const headers = ['Key', 'Hash', 'In binary', 'Start slot'],
    rows = [['a', 12, '01100', 4], ['bb', 3, '00011', 3]];
  const fixed = table(s, headers, rows, { key: 'comparison', columns: [-6, -2, 2, 6] });
  const spread = table(s, headers, rows, { key: 'comparison', columns: { left: -6, right: 6 } });
  const widths = headers.map((_, c) => Math.max(...fixed.family().filter((m): m is Text => m instanceof Text).filter((_, i) => i % 4 === c).map((t) => t.width())));
  const rule = spread.children.find((m): m is Line => m instanceof Line)!;
  near(rule.box()![0], -6);
  near(rule.box()![2], 6);
  near(spread.box()![0], -6);
  near(spread.box()![2], 6);
  const texts = spread.family().filter((m): m is Text => m instanceof Text);
  const columnBox = (c: number) => {
    const col = texts.filter((_, i) => i % 4 === c);
    return [Math.min(...col.map((t) => t.box()![0])), Math.max(...col.map((t) => t.box()![2]))];
  };
  const gaps = headers.slice(1).map((_, c) => columnBox(c + 1)[0]! - columnBox(c)[1]!);
  for (const g of gaps) near(g, gaps[0]!);
  near(gaps[0]!, (12 - widths.reduce((a, w) => a + w, 0)) / 3);
  const beside = table(s, headers, rows, { key: 'comparison', columns: { left: 1.5, gap: 0.7 } });
  const bTexts = beside.family().filter((m): m is Text => m instanceof Text);
  near(beside.box()![0], 1.5);
  for (let c = 1; c < 4; c++)
    near(Math.min(...bTexts.filter((_, i) => i % 4 === c).map((t) => t.box()![0])) - Math.max(...bTexts.filter((_, i) => i % 4 === c - 1).map((t) => t.box()![2])), 0.7);
});

/** The nearest key at or above a part: the component a keyed morph pairs it by. */
const owner = (m: Mobject) => {
  let p: Mobject | null = m;
  while (p && p.key === undefined) p = p.parent;
  return p?.key;
};

test('a keyed table names each part by row and column, and a keyed morph pairs a moved row with itself', () => {
  const s = stage(new Scene(new NullSink()));
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.constantFrom('cat', 'dog', 'owl', 'wolf', 'ant', 'bee'), { minLength: 2, maxLength: 6 }),
      fc.integer({ min: 0, max: 1000 }),
      (names, seed) => {
        // Move one row to another place: the rest shift by one.
        const from = seed % names.length, to = (from + 1 + (Math.floor(seed / names.length) % (names.length - 1))) % names.length;
        const moved = [...names];
        moved.splice(to, 0, moved.splice(from, 1)[0]!);
        const rows = (order: string[]) => order.map((name) => ({ key: name, cells: [name, name.length] }));
        const before = table(s, ['Name', 'Letters'], rows(names), { key: 't' });
        const after = table(s, ['Name', 'Letters'], rows(moved), { key: 't' });
        // Every part answers to its row and column: the table, its header row and headers, each row and cell, the rule.
        for (const name of names) {
          assert.equal((after.find(`t:${name}:Name`) as Text).text, name);
          assert.equal((after.find(`t:${name}:Letters`) as Text).text, String(name.length));
          assert.equal(after.find(`t:${name}`)!.children.length, 2);
        }
        assert.equal((after.find('t:head:Name') as Text).text, 'Name');
        assert.ok(after.find('t:rule') instanceof Line);
        // The moved row's cell is the same part in both pictures, though its place changed.
        const name = names[from]!;
        assert.notEqual(before.find(`t:${name}:Name`)!.box()![1], after.find(`t:${name}:Name`)!.box()![1]);
        const keyed = new TransformMatching(before, after, { key: matchByKey() });
        beginAnimation(keyed);
        assert.equal(keyed.removed.length + keyed.added.length, 0, 'every glyph has its partner');
        for (const [a, b] of keyed.pairs) assert.equal(owner(a), owner(b));
        const text = (m: Mobject) => (m.parent instanceof Text ? m.parent.text : null);
        assert.ok(keyed.pairs.filter(([a]) => text(a) === name).every(([a, b]) => text(b) === text(a)), `${name} pairs with ${name}`);
        // Keyed by index instead, the row at the moved place pairs with whichever row is there now.
        const byPlace = new TransformMatching(
          table(s, ['Name', 'Letters'], names.map((n) => [n, n.length]), { key: 't' }),
          table(s, ['Name', 'Letters'], moved.map((n) => [n, n.length]), { key: 't' }),
          { key: matchByKey() },
        );
        beginAnimation(byPlace);
        const atTo = byPlace.pairs.filter(([a]) => owner(a) === `t:${to}:Name`);
        assert.ok(atTo.length > 0);
        assert.ok(atTo.every(([a, b]) => text(a) === names[to] && text(b) === moved[to] && names[to] !== moved[to]), 'index keys pair different rows');
      },
    ),
    params(100),
  );
});

test('a table refuses two rows with one key, a row keyed as its own head or rule, and two columns with one header', () => {
  const s = stage(new Scene(new NullSink()));
  assert.throws(() => table(s, ['Key'], [{ key: 'a', cells: ['x'] }, { key: 'a', cells: ['y'] }], { key: 'dup' }), /^Error: table\(\): the table "dup" has two rows keyed "a"; a row's key is its identity/);
  // A bare row is keyed by its index, so it collides with a keyed row that takes the same name.
  assert.throws(() => table(s, ['Key'], [['x'], { key: '0', cells: ['y'] }], { key: 'comparison' }), /table\(\): the table "comparison" has two rows keyed "0"/);
  for (const reserved of ['head', 'rule'])
    assert.throws(() => table(s, ['Key'], [{ key: reserved, cells: ['x'] }], { key: 't' }), new RegExp(`table\\(\\): a row of the table "t" cannot be keyed "${reserved}"`));
  assert.throws(() => table(s, ['Key', 'Key'], [['x', 'y']], { key: 't' }), /table\(\): the table "t" has two columns headed "Key"/);
  // Distinct keys in any order are accepted, and each row keeps its own.
  const ok = table(s, ['Key'], [{ key: 'b', cells: ['y'] }, ['x'], { key: 'a', cells: ['z'] }], { key: 't' });
  assert.deepEqual(ok.children.slice(2).map((r) => r.key), ['t:b', 't:1', 't:a']);
});
