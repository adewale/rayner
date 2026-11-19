import test from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from '../lib/pbt.ts';
import { emptyCache, initial, request, requestCache, REQUESTS, run } from './model.ts';
import type { Key, Policy } from './model.ts';

// Independent reference: insertion-ordered Map, oldest first. No array recency implementation.
function reference(policy: Policy, keys: readonly Key[]) {
  const entries = new Map<Key, true>();
  let hits = 0, misses = 0, evicted: Key | null = null, hit: boolean | null = null;
  for (const key of keys) {
    hit = entries.has(key); evicted = null;
    if (hit) { hits++; entries.delete(key); }
    else {
      misses++;
      if (entries.size === 3) { const order = [...entries.keys()]; evicted = policy === 'lru' ? order[0]! : order.at(-1)!; entries.delete(evicted); }
    }
    entries.set(key, true);
  }
  return { order: [...entries.keys()].reverse(), hits, misses, evicted, hit };
}

test('the same stream produces the independently worked opposite outcomes', () => {
  const loop = run(REQUESTS.loop), reuse = run(REQUESTS.reuse);
  assert.deepEqual([loop.lru.hits, loop.mru.hits], [0, 3]);
  assert.deepEqual([reuse.lru.hits, reuse.mru.hits], [4, 0]);
  const firstEviction = run([...'ABCD'] as Key[]);
  assert.deepEqual([firstEviction.lru.evicted, firstEviction.mru.evicted], ['A', 'C']);
});

test('both models agree with independent Map policies for arbitrary request streams', () => {
  fc.assert(fc.property(fc.array(fc.constantFrom<Key>('A', 'B', 'C', 'D'), { maxLength: 40 }), keys => {
    const actual = run(keys);
    assert.deepEqual(actual.lru, reference('lru', keys));
    assert.deepEqual(actual.mru, reference('mru', keys));
    assert.deepEqual(actual.history, keys);
  }), params());
});

test('a cache update cannot mutate its input or the other cache instance', () => {
  const before = initial(), frozen = JSON.stringify(before);
  const changed = requestCache('lru', before.lru, 'A');
  assert.deepEqual(before.mru, emptyCache());
  assert.equal(JSON.stringify(before), frozen);
  assert.notEqual(changed.order, before.lru.order);
  const pair = request(before, 'A');
  pair.lru.order.push('B');
  assert.deepEqual(pair.mru.order, ['A']);
});
