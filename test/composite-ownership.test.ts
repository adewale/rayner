import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene, NullSink, Text, Group, Code, StateReadout, loadFonts} from '../src/index.ts';
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
    const ownBefore = original.values.get('Count')!;
    await copied.set({Count: after}, {runTime: 0});
    assert.equal(original.values.get('Count'), ownBefore);
    assert.equal(ownBefore.text, String(before));
    assert.ok(original.family().includes(ownBefore));
    assert.equal(original.describe().parts[0]!.name, `Count: ${before}`);
    assert.equal(copied.describe().parts[0]!.name, `Count: ${after}`);
    assert.equal(copied.cells.get('Count')![0], copied.values.get('Count'));
    assert.ok(copied.family().includes(copied.cells.get('Count')![0]!));
    await copied.mark('Count', {runTime: 0});
    assert.ok(emphasisOf(scene).has(copied.bar));
    assert.equal(original.bar.style.opacity, 0);
    copied.saveState();
    await copied.set({Count: before}, {runTime: 0});
    copied.restore();
    assert.equal(copied.values.get('Count')!.text, String(after));
    assert.ok(copied.family().includes(copied.values.get('Count')!));
    await copied.set({Count: before}, {runTime: 0});
    assert.equal(copied.describe().parts[0]!.name, `Count: ${before}`);
  }), params(12));
});
test('code composites rebind named lines, marks and panels when copied and restored', async () => {
  await loadFonts();
  const scene = new Scene(new NullSink());
  const original = new CodeBlock(scene, palette('nord'), ['+ added', '- removed'], {diff: true, title: 'Change'});
  const copy = new Group(original).copy().children[0] as CodeBlock;
  for (const component of [copy.code, copy.panel, copy.bar, ...copy.marks.map(m => m.mob), ...copy.code.lines])
    assert.ok(copy.family().includes(component));
  assert.notEqual(copy.marks, original.marks);
  await copy.focus(0, {runTime: 0});
  assert.equal(original.bar.style.opacity, 0);
  assert.ok(emphasisOf(scene).has(copy.bar));
  const code = new Code(['one', 'two']);
  code.saveState(); code.lines[0]!.setText('three'); code.restore();
  assert.equal(code.lines[0]!.text, 'one');
  assert.ok(code.family().includes(code.lines[0]!));
});

test('a copied StateReadout owns its key index and exposes prototype-sensitive labels as own values', async () => {
  await loadFonts();
  const original = new StateReadout([['__proto__', 1], ['constructor', 2]]), copy = original.copy();
  assert.notEqual(copy.keys, original.keys);
  for (const key of original.keys) {
    assert.ok(Object.hasOwn(copy.values, key));
    assert.notEqual(copy.values[key], original.values[key]);
    assert.ok(copy.family().includes(copy.values[key]!));
  }
});
