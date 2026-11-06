import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARS, LINEUP, intOf, predicates } from './model.ts';

test('the answer’s claim: of the lineup, isdigit() passes and int() rejects ² alone', () => {
  assert.deepEqual(
    LINEUP.filter((k) => predicates(CHARS[k]).isdigit && !('value' in intOf(CHARS[k]))),
    ['super'],
  );
});
