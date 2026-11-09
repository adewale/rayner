import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Rectangle } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Mobject } from '../src/index.ts';
import { stage, palette } from '../explain/index.ts';
import type { LayoutDirection } from '../explain/index.ts';
import { Card } from '../explain/panels.ts';
import { card } from '../explain/drawing.ts';
import { useDiagrams } from '../integrations/agentic-mermaid/snapshot.ts';
import { fixedSnapshot, square } from './lib/random-snapshot.ts';
import { fc, params } from './lib/pbt.ts';

await loadFonts();
const scene = () => new Scene(new NullSink(), { skipUntil: Infinity });
const colors = palette('nord');
const EPS = 3e-5;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < EPS, `${actual} != ${expected}`);
const direction = fc.constantFrom<LayoutDirection>('ltr', 'rtl');
const words = fc.oneof(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 40 }), fc.constantFrom('مرحبا 123', 'שלום 42', 'cache[12] = ٣٤', '__proto__'));
const rows = fc.uniqueArray(fc.tuple(words, words), { selector: ([label]) => label, minLength: 1, maxLength: 5 });

/** Full glyph geometry relative to its anchor: moving a word must never reflect its ink. */
function sameInk(a: Text, b: Text) {
  assert.equal(a.text, b.text);
  const ap = a.anchorPoint(), bp = b.anchorPoint();
  const aa = a.family().flatMap((m) => m.pointArrays()), ba = b.family().flatMap((m) => m.pointArrays());
  assert.equal(aa.length, ba.length);
  for (let j = 0; j < aa.length; j++) {
    assert.equal(aa[j]!.length, ba[j]!.length);
    for (let i = 0; i < aa[j]!.length; i += 2) {
      near(aa[j]![i]! - ap[0], ba[j]![i]! - bp[0]);
      near(aa[j]![i + 1]! - ap[1], ba[j]![i + 1]! - bp[1]);
    }
  }
}
const geometry = (m: Mobject) => m.family().map((x) => x.pointArrays().map((a) => [...a]));

test('explicit LTR is the default, including exact geometry and reader order', () => {
  const r = [['label', '123'], ['long field', 'cache[42]']] as const;
  const a = new Card(scene(), colors, r, { title: 'Values', width: 4 });
  const b = new Card(scene(), colors, r, { title: 'Values', width: 4, direction: 'ltr' });
  assert.deepEqual(geometry(a), geometry(b));
  assert.deepEqual(a.describe(), b.describe());
});

test('RTL swaps field edges, retaining every glyph and logical row order', async () => {
  await fc.assert(fc.asyncProperty(rows, fc.double({ min: 1.9, max: 10, noNaN: true }), words, async (r, width, replacement) => {
    const ltr = new Card(scene(), colors, r, { width, title: 'Title 123' });
    const rtl = new Card(scene(), colors, r, { width, title: 'Title 123', direction: 'rtl' });
    const lb = ltr.panel.box()!, rb = rtl.panel.box()!;
    near(lb[0], rb[0]); near(lb[2], rb[2]);
    for (const [label] of r) {
      const ll = ltr.labels.get(label)!, rl = rtl.labels.get(label)!;
      const lv = ltr.values.get(label)!, rv = rtl.values.get(label)!;
      near(ll.box()![0], lb[0] + 0.28);
      near(rl.box()![2], rb[2] - 0.28);
      near(lv.box()![2], lb[2] - 0.28);
      near(rv.box()![0], rb[0] + 0.28);
      // The anchors differ by a translation, so compare ink using one anchor kind.
      const translated = rl.copy(); translated.anchor = 'start';
      sameInk(ll, translated);
      const translatedValue = rv.copy(); translatedValue.anchor = 'end';
      sameInk(lv, translatedValue);
      assert.ok(ll.box()![2] < lv.box()![0] && rv.box()![2] < rl.box()![0], 'label and value keep their gap');
    }
    const titleL = ltr.children.find((m) => m instanceof Text && m.text === 'Title 123') as Text;
    const titleR = rtl.children.find((m) => m instanceof Text && m.text === 'Title 123') as Text;
    near(titleL.box()![0], lb[0] + 0.28);
    near(titleR.box()![2], rb[2] - 0.28);
    assert.deepEqual(ltr.describe(), rtl.describe());
    // The same card drawn from a later state: its first value replaced and that row lit.
    const first = r[0]![0];
    const later = r.map(([label, value], i) => [label, i === 0 ? replacement : value] as const);
    const ltrLit = new Card(scene(), colors, later, { width, title: 'Title 123', lit: { row: first } });
    const rtlLit = new Card(scene(), colors, later, { width, title: 'Title 123', direction: 'rtl', lit: { row: first } });
    assert.deepEqual(ltrLit.describe(), rtlLit.describe());
    const litBox = rtlLit.panel.box()!;
    near(rtlLit.bar.center()[1], rtlLit.values.get(first)!.anchorPoint()[1]);
    assert.ok(rtlLit.values.get(first)!.box()![0] >= litBox[0] + 0.28 - EPS);
  }), params(300));
});

test('empty and nonempty labels and values can be lit, in either direction, with the bar on their row', async () => {
  const digits = fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 6 }).map((xs) => xs.join(''));
  await fc.assert(fc.asyncProperty(direction, fc.constantFrom('', 'field'), digits, async (d, label, value) => {
    const k = new Card(scene(), colors, [[label, value]], { width: 3, direction: d, lit: { row: label } });
    near(k.bar.center()[1], k.values.get(label)!.anchorPoint()[1]);
    near(k.bar.center()[0], k.panel.center()[0]);
    assert.equal(k.bar.style.opacity, 1);
    assert.equal(k.describe().parts[0]!.mark, 'marked');
  }), params(60));
});

test('stage direction resolves logical card/code/carry regions and preserves physical regions and code', async () => {
  for (const d of ['ltr', 'rtl'] as const) {
    const s = stage(scene(), { direction: d, heading: false });
    assert.equal(s.direction, d);
    for (const [at, x] of [['start', d === 'ltr' ? -3.85 : 3.85], ['end', d === 'ltr' ? 3.85 : -3.85], ['left', -3.85], ['right', 3.85]] as const) {
      const k = await s.card([['field', '123']], { at, width: 3 });
      near(k.panel.center()[0], x);
      assert.equal(k.direction, d);
      // The kit's card, for a view's draw, is placed and laid out as the stage's.
      const drawn = card(s, [['field', '123']], { at, width: 3 });
      near(drawn.panel.center()[0], x);
      assert.equal(drawn.direction, d);
      const code = await s.code(['x[12] = 34;'], { at });
      near(code.panel.center()[0], x);
      assert.equal(code.code.lines[0]!.text, 'x[12] = 34;');
      assert.ok(code.code.lines[0]!.frameBox[6]! > code.code.lines[0]!.frameBox[0]!, 'code glyphs stay unmirrored');
      const native = new Rectangle({ width: 1, height: 1 });
      s.scene.add(native);
      await s.carry(native, at);
      near(native.center()[0], x);
    }
    const override = await s.card([['field', '123']], { at: 'start', direction: d === 'ltr' ? 'rtl' : 'ltr' });
    assert.equal(override.direction, d === 'ltr' ? 'rtl' : 'ltr');
    near(override.panel.center()[0], d === 'ltr' ? -3.85 : 3.85);
  }
});

test('logical diagram placement preserves authored graph direction and node order', async () => {
  const spec = { source: 'graph LR\nA --> B', style: 'nord' };
  for (const d of ['ltr', 'rtl'] as const) {
    const sc = scene();
    let captured = '';
    useDiagrams(sc, { diagram: async (input) => {
      captured = input.source;
      return fixedSnapshot(input, [
        { id: 'A', role: 'node', kind: 'shape', shapes: [square(-1, { fill: '#fff' })] },
        { id: 'B', role: 'node', kind: 'shape', shapes: [square(1, { fill: '#fff' })] },
      ], { palette: colors });
    } });
    const s = stage(sc, { direction: d, heading: false });
    const diagram = await s.show(spec, { box: 'start' });
    assert.equal(captured, spec.source);
    assert.ok(diagram.get('A').center()[0] < diagram.get('B').center()[0]);
    assert.ok(d === 'ltr' ? diagram.get('B').box()![2] < 0 : diagram.get('A').box()![0] > 0);
  }
});
