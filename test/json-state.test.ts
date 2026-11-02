import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene, NullSink} from '../src/index.ts';
import {jsonObject} from '../src/json.ts';
import {fc, params} from './lib/pbt.ts';

test('JSON state retains valid values, own prototype-sensitive keys and independent nested data', () => {
  fc.assert(fc.property(fc.jsonValue().filter(v => !!v && typeof v === 'object' && !Array.isArray(v)), value => {
    assert.deepEqual(jsonObject(value), JSON.parse(JSON.stringify(value)));
  }), params(100));
  const source = JSON.parse('{"__proto__":{"value":1},"constructor":2}');
  const copy = jsonObject(source);
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
  assert.ok(Object.hasOwn(copy, '__proto__'));
  assert.notEqual(copy.__proto__, source.__proto__);
  assert.deepEqual(jsonObject({optional: undefined, values: [null, false, 0]}), {values: [null, false, 0]});
});
test('state and evidence refuse silent data loss and cycles with a useful field path', () => {
  const scene = new Scene<{count: number}>(new NullSink());
  scene.state = {count: 1};
  assert.deepEqual(scene.describe(), {count: 1});
  for (const bad of [NaN, Infinity, -Infinity, ()=>1, Symbol('x'), 1n, new Date(), new Map(), new Set(), {[Symbol('key')]: 1}, [undefined], Array(1)]) {
    assert.throws(() => jsonObject({answer: bad}), /state.answer/);
    assert.throws(() => scene.record('example', {answer: bad}), /scene evidence.answer/);
    assert.equal(scene.evidence.length, 0);
  }
  assert.throws(() => scene.record('example', {kind: 4} as never), /must not override kind/);
  assert.throws(() => scene.record(4 as never), /kind must be/);
  for (const bad of [null, 4, Symbol('data'), ()=>1, [], new Date()])
    assert.throws(() => scene.record('example', bad as never), /scene evidence must/);
  assert.equal(scene.evidence.length, 0);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.throws(() => jsonObject(cyclic), /state.self/);
});
test('known step metadata fields fail before the existing step is ended', async () => {
  const scene = new Scene(new NullSink());
  await scene.step('first');
  for (const meta of [{caption: 4}, {title: false}, {line: []}, {detail: 'yes'}])
    await assert.rejects(scene.step('bad', meta as never), /must be/);
  assert.equal(scene.steps.length, 1);
  assert.equal(scene.current?.name, 'first');
});

test('JSON arrays refuse subclasses, inherited entries and iterator substitution', () => {
  class Values extends Array<number> {
    override *[Symbol.iterator]() { yield 99; return undefined; }
  }
  const values = new Values(); values.push(1, 2);
  assert.equal(JSON.stringify({values}), '{"values":[1,2]}');
  assert.throws(() => jsonObject({values}), /state.values must be a JSON/);
  const inherited = Array(1);
  Object.setPrototypeOf(inherited, Object.create(Array.prototype, {0: {value: 7}}));
  assert.throws(() => jsonObject({values: inherited}), /state.values/);
  const substituted = [1, 2];
  substituted[Symbol.iterator] = function* () { yield 99; return undefined; };
  assert.throws(() => jsonObject({values: substituted}), /state.values must use JSON string keys/);
});
