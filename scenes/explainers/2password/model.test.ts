import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query, result } from './answers.ts';

test('the first check’s query matches no title and suggests none', () => {
  assert.equal(query, 'cloud key');
  assert.equal(result.matches.length, 0);
  assert.ok(!result.suggestions);
});
