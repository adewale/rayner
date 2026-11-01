// The explainer benchmark's blinding: deterministic per seed, every author once, one page of each method per pair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { blind } from '../tools/bench-explainers.ts';

test('a seed reproduces its blinding, and each pair holds one author with one page of each method', () => {
  fc.assert(
    fc.property(fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 8 }), fc.integer(), (authors, seed) => {
      const keys = blind(authors, seed);
      assert.deepEqual(blind(authors, seed), keys);
      assert.deepEqual(keys.map((k) => k.author).sort(), [...authors].sort());
      assert.deepEqual(keys.map((k) => k.pair), authors.map((_, i) => `pair${i + 1}`));
      for (const k of keys) assert.deepEqual([k.X, k.Y].sort(), ['plain', 'rayner']);
    }),
  );
});

test('blinding varies the side: over many seeds Rayner is X about half the time', () => {
  let x = 0;
  for (let seed = 0; seed < 400; seed++) x += blind(['a', 'b', 'c'], seed).filter((k) => k.X === 'rayner').length;
  assert.ok(x > 400 * 3 * 0.4 && x < 400 * 3 * 0.6, `Rayner was X ${x} of ${400 * 3} times`);
});

test('bad input is refused', () => {
  assert.throws(() => blind([], 1), /non-empty/);
  assert.throws(() => blind(['a', 'a'], 1), /distinct/);
  assert.throws(() => blind(['a'], 1.5), /integer/);
});
