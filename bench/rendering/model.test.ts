import test from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from '../../test/lib/pbt.ts';
import { PACKETS, searchStep, queueStep } from './shared.ts';
import type { Search, Queue } from './shared.ts';

test('lower bound agrees with Array.findIndex, including duplicates, absence and empty inputs', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: -20, max: 20 }), { maxLength: 30 }), fc.integer({ min: -25, max: 25 }), (input, target) => {
    const values = [...input].sort((a, b) => a - b);
    let s: Search = { kind: 'search', values, target, lo: 0, hi: values.length, mid: null };
    for (let n = 0; s.lo !== s.hi; n++) { assert.ok(n < 10); s = searchStep(s); }
    const expected = values.findIndex((v) => v >= target);
    assert.equal(s.lo, expected < 0 ? values.length : expected);
  }), params(300));
});
test('circular storage agrees with a separate push/shift FIFO across wraps and refusals', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 5 }), fc.array(fc.option(fc.integer({ min: 0, max: 9 }), { nil: null }), { maxLength: 80 }), (capacity, events) => {
    let s: Queue = { kind: 'queue', slots: Array<number | null>(capacity).fill(null), head: 0, tail: 0, size: 0 };
    const oracle: number[] = [];
    for (const value of events) {
      const allowed = value === null ? oracle.length > 0 : oracle.length < capacity;
      if (allowed) { if (value === null) oracle.shift(); else oracle.push(value); }
      const result = queueStep(s, value === null ? 'pop' : { push: value });
      assert.equal(!result.reason, allowed);
      s = result.state;
      assert.equal(s.size, oracle.length);
      assert.deepEqual(Array.from({ length: s.size }, (_, i) => s.slots[(s.head + i) % capacity]), oracle);
      assert.equal(s.slots.filter((v) => v !== null).length, s.size);
    }
  }), params(300));
});
test('frozen packets include a changed-condition countercase and complete distinct step inventories', () => {
  assert.equal(PACKETS.length, 2);
  for (const p of PACKETS) {
    assert.equal(p.cases.length, 2);
    for (const c of p.cases) {
      assert.ok(c.steps.length >= 4);
      assert.equal(new Set(c.steps.map((s) => s.id)).size, c.steps.length);
    }
    assert.notDeepEqual(p.cases[0]!.steps.map((s) => s.state), p.cases[1]!.steps.map((s) => s.state));
  }
});
