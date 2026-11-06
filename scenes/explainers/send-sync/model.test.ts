import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSync } from './model.ts';
import { ARC_GUARD } from './answers.ts';

test('the third check answer’s word “neither”: Arc<MutexGuard<i32>> is not Sync either', () => {
  assert.equal(isSync(ARC_GUARD), false);
});
