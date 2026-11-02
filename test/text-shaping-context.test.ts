import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene, Text, Code, NullSink, loadFonts} from '../src/index.ts';
import {bindLettering, textShaping} from '../src/lettering-outlines.ts';
import type {LetteringProvider} from '../src/lettering-outlines.ts';

test('explicit scenes overlap while text, copied text and code retain their own shaping services', {timeout: 15000}, async () => {
  const table = await loadFonts(), embedded = table.sans;
  const before = [Scene.prototype.run, Text.prototype.build, Text.prototype.copy, Code.prototype.copy];
  const seen = {a: [] as string[], b: [] as string[]};
  const provider = (id: 'a' | 'b'): LetteringProvider => ({
    shape(_font, text, size, fallback) {seen[id].push(text); return fallback(text, size);},
    math() {throw new Error('no maths in this test');},
  });
  const a = provider('a'), b = provider('b');
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let both!: () => void, started = 0;
  const entered = new Promise<void>(resolve => both = resolve);
  class A extends Scene { override async construct() {
    this.text('a before'); if (++started === 2) both(); await gate; this.text('a after');
  }}
  class B extends Scene { override async construct() {
    this.text('b before'); if (++started === 2) both(); await gate; this.text('b after');
  }}
  const BoundA = bindLettering(A, a, {explicit: true}), BoundB = bindLettering(B, b, {explicit: true});
  const runs = Promise.all([new BoundA(new NullSink()).run(), new BoundB(new NullSink()).run()]);
  await entered;
  new Text('ordinary concurrent text');
  release(); await runs;
  const first = new Text('a retained', {shaping: textShaping(a)});
  const copied = first.copy(); copied.setText('a copy');
  const code = new Code(['b code'], {shaping: textShaping(b)});
  assert.ok(code.span(0, 0, 1).width() > 0);
  assert.equal(first.text, 'a retained');
  assert.deepEqual(seen.a, ['a before', 'a after', 'a retained', 'a copy']);
  assert.ok(seen.b.length >= 3);
  assert.ok(seen.b.every(text => text.startsWith('b ')));
  assert.equal(table.sans, embedded);
  assert.ok(Object.isFrozen(table));
  assert.deepEqual([Scene.prototype.run, Text.prototype.build, Text.prototype.copy, Code.prototype.copy], before);
});
