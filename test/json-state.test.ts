import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene} from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import {canonicalJson, jsonObject} from '../src/json.ts';
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
  assert.deepEqual(scene.stateJson(), {count: 1});
  for (const bad of [NaN, Infinity, -Infinity, ()=>1, Symbol('x'), 1n, new Date(), new Map(), new Set(), {[Symbol('key')]: 1}, [undefined], Array(1)]) {
    assert.throws(() => jsonObject({answer: bad}), /state.answer/);
    assert.throws(() => scene.record('example', {answer: bad}), /this\.record\(\): data\.answer[.\w\[\]]* must/);
    assert.equal(scene.evidence.length, 0);
  }
  for (const bad of [null, 4, Symbol('data'), ()=>1, [], new Date()])
    assert.throws(() => scene.record('example', bad as never), /this\.record\(\): data must/);
  assert.equal(scene.evidence.length, 0);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.throws(() => jsonObject(cyclic), /state.self/);
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

/** A JSON value with every object's keys in reverse order. */
const reordered = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(reordered) : v && typeof v === 'object'
    ? JSON.parse(`{${Object.keys(v).reverse().map((k) => `${JSON.stringify(k)}:${JSON.stringify(reordered((v as Record<string, unknown>)[k]))}`).join(',')}}`)
    : v;
test('canonicalJson: equal JSON values give equal text whatever their key order, and different values different text', () => {
  fc.assert(fc.property(fc.jsonValue(), fc.jsonValue(), (a, b) => {
    assert.equal(canonicalJson(reordered(a)), canonicalJson(a));
    assert.deepEqual(JSON.parse(canonicalJson(a)), JSON.parse(JSON.stringify(a)));
    // Text equality is value equality (the generated values have no -0, which JSON writes as 0).
    let equal = true;
    try { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))); } catch { equal = false; }
    assert.equal(canonicalJson(a) === canonicalJson(b), equal);
  }), params(200));
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: 4 } }), '{"a":{"c":4,"d":[1,{"e":3,"f":2}]},"b":1}');
  // Keys are ordered by code unit, never by locale: "Z" before "a", "ä" after "z".
  assert.equal(canonicalJson({ 'ä': 1, z: 2, a: 3, Z: 4 }), '{"Z":4,"a":3,"z":2,"ä":1}');
  assert.equal(canonicalJson(JSON.parse('{"__proto__":1,"a":2}')), '{"__proto__":1,"a":2}');
  // The deliberate defect: plain JSON.stringify tells the same state apart by key order.
  assert.notEqual(JSON.stringify({ a: 1, b: 2 }), JSON.stringify({ b: 2, a: 1 }));
});
