import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Rectangle } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Mobject } from '../src/index.ts';
import { stage, palette } from '../explain/index.ts';
import type { LayoutDirection, StageOptions, CardOptions } from '../explain/index.ts';
import { Card } from '../explain/panels.ts';
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
    const first = r[0]![0];
    await ltr.set(Object.fromEntries([[first, replacement]]));
    await rtl.set(Object.fromEntries([[first, replacement]]));
    await ltr.mark(first); await rtl.mark(first);
    assert.deepEqual(ltr.describe(), rtl.describe());
    near(rtl.bar.center()[1], rtl.values.get(first)!.anchorPoint()[1]);
    assert.ok(rtl.values.get(first)!.box()![0] >= rb[0] + 0.28 - EPS);
  }), params(300));
});

test('value replacement follows a moved, scaled and rotated card without accumulating fitted shrink', async () => {
  await fc.assert(fc.asyncProperty(direction, fc.double({ min: 0.15, max: 3, noNaN: true }), fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), async (d, scale, angle) => {
    const s = scene(), k = new Card(s, colors, [['field', 'long value requiring a smaller face']], { width: 3, direction: d });
    s.add(k);
    const old = k.values.get('field')!;
    k.scale(scale).rotate(angle).shift([2, -1]);
    const anchor = old.anchorPoint();
    await k.set({ field: '123' });
    const next = k.values.get('field')!;
    near(next.anchorPoint()[0], anchor[0]); near(next.anchorPoint()[1], anchor[1]);
    near(next.textSize(), 0.24 * 1.04 * scale);
    near(Math.sin(next.angle()), Math.sin(angle));
    near(Math.cos(next.angle()), Math.cos(angle));
    assert.equal(next.text, '123');
    await k.mark('field');
    // Local row centre before the affine map: half a card width minus padding
    // from the value's anchored side, along its transformed horizontal axis.
    const sign = d === 'ltr' ? 1 : -1;
    near(k.bar.center()[0], anchor[0] - sign * (1.5 - 0.28) * scale * Math.cos(angle));
    near(k.bar.center()[1], anchor[1] - sign * (1.5 - 0.28) * scale * Math.sin(angle));
  }), params(300));
});

test('empty and nonempty labels retain independent affine value and highlight geometry', async () => {
  const positive = fc.double({ min: 0.15, max: 3, noNaN: true });
  const digits = fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 6 }).map((xs) => xs.join(''));
  const cases = fc.oneof(
    fc.constant({ label: '', before: '123', after: '456' }),
    fc.constant({ label: '', before: '', after: '456' }),
    fc.constant({ label: '', before: '123', after: '' }),
    fc.record({ label: fc.constantFrom('', 'field'), before: digits, after: digits }),
  );
  await fc.assert(fc.asyncProperty(direction, cases, positive, positive, fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), async (d, row, sx, sy, shear, angle) => {
    const sc = scene(), expectedScene = scene();
    const actual = new Card(sc, colors, [[row.label, row.before]], { width: 3, direction: d });
    const expected = new Card(expectedScene, colors, [[row.label, row.after]], { width: 3, direction: d });
    sc.add(actual); expectedScene.add(expected);
    // The oracle builds the final value and row mark before any spatial change.
    // The tested card must reach that same geometry by updating after the map.
    await expected.mark(row.label);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const affine = [cos * sx, sin * sx, (cos * shear - sin) * sy, (sin * shear + cos) * sy, 2, -1] as const;
    actual.applyAffine(...affine, { aboutPoint: [0, 0] });
    expected.applyAffine(...affine, { aboutPoint: [0, 0] });
    await actual.set(Object.fromEntries([[row.label, row.after]]));
    await actual.mark(row.label);
    for (const [made, reference] of [[actual.values.get(row.label)!, expected.values.get(row.label)!], [actual.bar, expected.bar]] as const) {
      const a = geometry(made), b = geometry(reference);
      assert.equal(a.length, b.length);
      for (let i = 0; i < a.length; i++) {
        assert.equal(a[i]!.length, b[i]!.length);
        for (let j = 0; j < a[i]!.length; j++) {
          assert.equal(a[i]![j]!.length, b[i]![j]!.length);
          for (let n = 0; n < a[i]![j]!.length; n++) near(a[i]![j]![n]!, b[i]![j]![n]!);
        }
      }
    }
    assert.deepEqual(actual.describe(), expected.describe());
  }), params<[LayoutDirection, { label: string; before: string; after: string }, number, number, number, number]>(300, { examples: [
    ['rtl', { label: '', before: '123', after: '456' }, 2, 1, 0, 0],
    ['ltr', { label: '', before: '', after: '456' }, 2, 1, 0.5, 0.7],
    ['rtl', { label: '', before: '123', after: '' }, 0.5, 2, -0.5, -0.7],
  ] }));
});

test('stage direction resolves logical card/code/carry regions and preserves physical regions and code', async () => {
  for (const d of ['ltr', 'rtl'] as const) {
    const s = stage(scene(), { direction: d, heading: false });
    for (const [at, x] of [['start', d === 'ltr' ? -3.85 : 3.85], ['end', d === 'ltr' ? 3.85 : -3.85], ['left', -3.85], ['right', 3.85]] as const) {
      const k = await s.card([['field', '123']], { at, width: 3, enter: false });
      near(k.panel.center()[0], x);
      assert.equal(k.direction, d);
      const code = await s.code(['x[12] = 34;'], { at, enter: false });
      near(code.panel.center()[0], x);
      assert.equal(code.code.lines[0]!.text, 'x[12] = 34;');
      assert.ok(code.code.lines[0]!.frameBox[6]! > code.code.lines[0]!.frameBox[0]!, 'code glyphs stay unmirrored');
      const native = new Rectangle({ width: 1, height: 1 });
      s.scene.add(native);
      await s.carry(native, at);
      near(native.center()[0], x);
    }
    const override = await s.card([['field', '123']], { at: 'start', direction: d === 'ltr' ? 'rtl' : 'ltr', enter: false });
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

test('direction rejects malformed, boxed, inherited and coercing values before drawing', async () => {
  let coerced = 0;
  const coercing = { toString() { coerced++; throw new Error('must not coerce'); } };
  const cases: unknown[] = [null, 0, 1, false, '', 'RTL', 'auto', 'constructor', '__proto__', new String('rtl'), coercing, [], {}];
  for (const direction of cases) {
    const sc = scene();
    assert.throws(() => stage(sc, { direction } as StageOptions), /Layout direction must/);
    assert.equal(sc.mobjects.length, 0);
    assert.throws(() => new Card(sc, colors, [['field', '123']], { direction } as CardOptions), /Layout direction must/);
    const s = stage(sc, { heading: false });
    const count = sc.familyMembers().length, time = sc.time;
    await assert.rejects(s.card([['field', '123']], { direction } as CardOptions), /Layout direction must/);
    assert.equal(sc.familyMembers().length, count); assert.equal(sc.time, time);
  }
  for (const options of [Object.create({ direction: 'rtl' }), Object.create({ direction: coercing })]) {
    assert.throws(() => stage(scene(), options), /must be an own option/);
    assert.throws(() => new Card(scene(), colors, [['field', '123']], options), /must be an own option/);
    await assert.rejects(stage(scene()).card([['field', '123']], options), /must be an own option/);
  }
  const getter = Object.defineProperty({}, 'direction', { get() { coerced++; return 'rtl'; } });
  assert.throws(() => stage(scene(), getter), /must be a data option/);
  assert.throws(() => new Card(scene(), colors, [['field', '123']], getter), /must be a data option/);
  await assert.rejects(stage(scene()).card([['field', '123']], getter), /must be a data option/);
  for (const malformed of [null, 1, false, 'rtl', []]) {
    assert.throws(() => stage(scene(), malformed as StageOptions), /Layout options must be an object/);
    assert.throws(() => new Card(scene(), colors, [['field', '123']], malformed as CardOptions), /Layout options must be an object/);
  }
  assert.equal(coerced, 0);
});
