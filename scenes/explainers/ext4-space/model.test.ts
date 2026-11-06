import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BELOW, BIG, ONE, T0, T5, TWO } from './answers.ts';

test('the check answers’ words: 2 GiB doubles the journal and falls short, 4 TiB has less metadata, -m 0 frees the reserve', () => {
  // The answers' words: 2 GiB doubles the journal and its reserve falls short; 4 TiB is the first big disk,
  // with less metadata than the disk 128 MiB smaller; -m 0 frees exactly the root reserve.
  assert.equal(TWO.layout.journal, 2 * ONE.layout.journal);
  assert.ok(TWO.root < TWO.layout.metadata);
  assert.equal(BELOW.layout.type, 'default');
  assert.equal(BIG.layout.type, 'big');
  assert.ok(BIG.layout.metadata < BELOW.layout.metadata);
  assert.equal(T0.users - T5.users, T5.root);
  assert.equal(T0.layout.metadata, T5.layout.metadata);
});
