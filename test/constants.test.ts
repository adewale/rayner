// Constants that more than one module needs have one source, which the modules import: the stage's
// frame and units in src/units.ts, the page's own query keys in explain/page-query.ts, the numeric
// alphabet beside the test it answers for. These tests hold what each source must agree with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME, STAGE_BOX, UNITS } from '../src/units.ts';
import { PAGE_QUERY } from '../explain/page-query.ts';
import { isNumericText, numericAlphabet } from '../src/lettering-outlines.ts';

test('the frame, its home box and the units agree', () => {
  assert.deepEqual([...STAGE_BOX], [-FRAME.w / 2, -FRAME.h / 2, FRAME.w / 2, FRAME.h / 2]);
  assert.equal(FRAME.w / FRAME.h, 16 / 9);
  assert.ok(Number.isInteger(UNITS) && UNITS > 0);
  assert.equal(new Set(Object.values(PAGE_QUERY)).size, Object.keys(PAGE_QUERY).length);
});

test('every character numeric text may hold is in the numeric alphabet the lettering keeps', () => {
  const missing: string[] = [];
  for (let cp = 0; cp <= 0xffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCodePoint(cp);
    if (isNumericText(`${c}1`) || isNumericText(`1${c}`) || isNumericText(`1${c}1`) || isNumericText(`1e${c}1`)) {
      if (!numericAlphabet.includes(c) && !/\d/u.test(c)) missing.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  }
  assert.deepEqual(missing, []);
});
