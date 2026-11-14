import test from 'node:test';
import assert from 'node:assert/strict';
import { sortAsText } from './model.ts';

// The oracle: Node's own Array.prototype.sort, run live each time this test runs.
test('the model agrees with the real system', () => {
  for (const values of [[10, 9, 1], [2, 10, 1], [100, 25, 3, 1000], [-1, -2, 0], [5, 50, 0.5, 5]])
    assert.deepEqual(sortAsText(values), [...values].sort(), `[${values}]`);
});
