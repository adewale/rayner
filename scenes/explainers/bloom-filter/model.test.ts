import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listed } from '../lib/format.ts';
import { CLEARED, EEL } from './answers.ts';

test('the check answers’ words: eel’s bits are 23, 20 and 1, and clearing dog refuses cat at 16 bits only', () => {
  // The first answer's words name eel's bits: 23 now from eel, and eel set bit 20.
  assert.equal(listed(EEL.at), '23, 20 and 1');
  // The answer's words take the verdicts as given: cat refused at 16 bits, still maybe at 32.
  assert.deepEqual(CLEARED.map((c) => c.cat), [false, true]);
});
