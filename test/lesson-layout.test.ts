import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Rectangle, Line, NullSink, loadFonts } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { table } from '../scenes/explainers/lib/lesson-drawing.ts';
import { bars, flow } from '../scenes/explainers/lib/reader-drawing.ts';
import { fc, params } from './lib/pbt.ts';

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
          ['Source', 'Reads'],
          rows.map((r) => [r.name, r.value]),
          stage(new Scene(new NullSink())),
          { xs: [-4, 4] },
        );
        const texts = drawing.children.filter((m): m is Text => m instanceof Text);
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
    drawing = flow(stage(new Scene(new NullSink())), names);
  const nodes = names.map((_, i) => drawing.children.find((m) => m.key === `reader-flow:${i}`)!);
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
  );
  const labels = drawing.children.filter((m) => m.key?.endsWith(':label'));
  const values = drawing.children.filter((m) => m.key?.endsWith(':value'));
  assert.equal(labels.length, 3);
  assert.equal(values.length, 3);
  for (const label of labels) near(label.box()![0], -4);
  for (const value of values) near(value.box()![2], values[0]!.box()![2]);
});
