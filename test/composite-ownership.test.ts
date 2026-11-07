import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene, Group, Code} from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import {Card, CodeBlock} from '../explain/panels.ts';
import {emphasisOf} from '../explain/look.ts';
import {palette} from '../explain/palettes.ts';
import {fc, params} from './lib/pbt.ts';

test('copied and restored cards own their readouts, geometry and mutable row indexes', async () => {
  await loadFonts();
  await fc.assert(fc.asyncProperty(fc.integer({min: 1, max: 99}), fc.integer({min: 100, max: 999}), async (before, after) => {
    const scene = new Scene(new NullSink());
    const original = new Card(scene, palette('nord'), [['Count', before]]);
    const wrapper = new Group(original), copied = wrapper.copy().children[0] as Card;
    scene.add(wrapper, copied);
    copied.shift([4, 0]);
    assert.notEqual(copied.values, original.values);
    for (const component of [copied.panel, copied.bar, ...copied.values.values(), ...copied.labels.values()])
      assert.ok(copied.family().includes(component));
    // A change to the copy's own value reaches only the copy: its description reads its own text.
    const ownBefore = original.values.get('Count')!;
    copied.values.get('Count')!.setText(String(after));
    assert.equal(original.values.get('Count'), ownBefore);
    assert.equal(ownBefore.text, String(before));
    assert.ok(original.family().includes(ownBefore));
    assert.equal(original.describe().parts[0]!.name, `Count: ${before}`);
    assert.equal(copied.describe().parts[0]!.name, `Count: ${after}`);
    assert.equal(copied.cells.get('Count')![0], copied.values.get('Count'));
    assert.ok(copied.family().includes(copied.cells.get('Count')![0]!));
    // Restoring rebinds the copy's rows to the restored members.
    copied.saveState();
    copied.values.get('Count')!.setText(String(before));
    copied.restore();
    assert.equal(copied.values.get('Count')!.text, String(after));
    assert.ok(copied.family().includes(copied.values.get('Count')!));
    assert.equal(copied.describe().parts[0]!.name, `Count: ${after}`);
    // A lit card's copy reports its own bar, not the original's.
    const lit = new Card(scene, palette('nord'), [['Count', before]], {lit: {row: 'Count'}});
    const litCopy = new Group(lit).copy().children[0] as Card;
    scene.add(litCopy);
    assert.ok(emphasisOf(scene).has(litCopy.bar));
    assert.ok(!emphasisOf(scene).has(lit.bar));
  }), params(12));
});
test('code composites rebind named lines, marks and panels when copied and restored', async () => {
  await loadFonts();
  const scene = new Scene(new NullSink());
  const original = new CodeBlock(scene, palette('nord'), ['+ added', '- removed'], {diff: true, title: 'Change', lit: {lines: 0}});
  const copy = new Group(original).copy().children[0] as CodeBlock;
  for (const component of [copy.code, copy.panel, copy.bar, ...copy.marks.map(m => m.mob), ...copy.code.lines])
    assert.ok(copy.family().includes(component));
  assert.notEqual(copy.marks, original.marks);
  scene.add(copy);
  // The copy reports its own focus bar and line bars, not the original's.
  const highlighted = emphasisOf(scene);
  assert.equal(highlighted.get(copy.bar), 'lines 0-0: + added');
  assert.ok(!highlighted.has(original.bar));
  for (const mark of copy.marks) assert.ok(highlighted.has(mark.mob));
  for (const mark of original.marks) assert.ok(!highlighted.has(mark.mob));
  const code = new Code(['one', 'two']);
  code.saveState(); code.lines[0]!.setText('three'); code.restore();
  assert.equal(code.lines[0]!.text, 'one');
  assert.ok(code.family().includes(code.lines[0]!));
});

test('a copied Card owns its rows and names prototype-sensitive labels as ordinary rows', async () => {
  await loadFonts();
  const scene = new Scene(new NullSink());
  const original = new Card(scene, palette('nord'), [['__proto__', 1], ['constructor', 2]]), copy = original.copy();
  for (const key of ['__proto__', 'constructor']) {
    assert.notEqual(copy.values.get(key), original.values.get(key));
    assert.ok(copy.family().includes(copy.values.get(key)!));
  }
});

test('live copied panels expose inherited highlights without registering temporary copies', async () => {
  await loadFonts();
  const scene = new Scene(new NullSink()), colors = palette('nord');
  const card = new Card(scene, colors, [['Count', 1]], {lit: {row: 'Count'}});
  const code = new CodeBlock(scene, colors, ['+ added', '- removed'], {diff: true, lit: {lines: 0}});
  const copies = new Group(card, code).copy();
  const [copiedCard, copiedCode] = copies.children as [Card, CodeBlock];
  scene.removeAll(); scene.add(copies);
  const highlighted = emphasisOf(scene);
  assert.equal(highlighted.get(copiedCard.bar), 'row Count: 1');
  assert.equal(highlighted.get(copiedCode.bar), 'lines 0-0: + added');
  assert.equal(copiedCode.marks.length, 2);
  for (const mark of copiedCode.marks) assert.equal(highlighted.get(mark.mob), `${mark.kind} ${mark.line}`);
  assert.equal(highlighted.has(card.bar), false);
  assert.equal(highlighted.has(code.bar), false);
  for (let i = 0; i < 10; i++) copies.copy();
  assert.deepEqual(emphasisOf(scene), highlighted, 'temporary copies contribute no reader metadata');
  copiedCard.saveState();
  copiedCard.restore();
  assert.equal(emphasisOf(scene).get(copiedCard.bar), 'row Count: 1');
  const added = copiedCode.copy(); copies.add(added);
  assert.equal(emphasisOf(scene).get(added.bar), 'lines 0-0: + added');
  copiedCode.remove(copiedCode.bar);
  assert.equal(emphasisOf(scene).get(copiedCode.bar), 'lines 0-0: + added', 'a missing highlight stays declared so story checks can reject it');
  scene.removeAll();
  assert.equal(emphasisOf(scene).size, 0);
});

test('repeated card labels keep last-value lookup for ordinary and prototype-sensitive keys', async () => {
  await loadFonts();
  const scene = new Scene(new NullSink());
  fc.assert(fc.property(fc.constantFrom('same', '__proto__', 'constructor'), fc.integer(), fc.integer(), (key, first, last) => {
    const card = new Card(scene, palette('nord'), [[key, first], [key, last]]), copy = card.copy();
    assert.equal(card.values.get(key)!.text, String(last));
    assert.equal(copy.values.get(key)!.text, String(last));
    assert.ok(copy.family().includes(copy.values.get(key)!));
    assert.notEqual(copy.values.get(key), card.values.get(key));
  }), params(24));
});
