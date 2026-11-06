import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NARROW15, ONE, SMALL_INT, TWO, WIDE15 } from './answers.ts';

test('the check answers’ wording: each changed row costs what its comparison row costs', () => {
  assert.equal(TWO.perRow, ONE.perRow);
  assert.equal(SMALL_INT.perRow, ONE.perRow);
  assert.equal(NARROW15.perRow, WIDE15.perRow);
});
