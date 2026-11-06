import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inside } from './model.ts';
import { OPEN, OPENING, OPEN_ROW, RAW, ROOMY_700 } from './answers.ts';

test('the check answers’ words: the mapped chroma does not fit as written, the raw leader is another family, and the roomiest 700 is outside', () => {
  // The answers' words: the mapped chroma does not fit at the written lightness and hue; the raw leader is
  // another family, on a higher edge; the roomiest 500 family's 700 shade lies outside sRGB.
  assert.ok(!inside(OPENING.L, OPEN_ROW.shown, OPENING.h, 'srgb'));
  assert.notEqual(OPEN.furthest.family, OPEN.mostOfSrgb.family);
  assert.ok(RAW.srgb > OPEN_ROW.srgb);
  assert.ok(ROOMY_700.outsideSrgb);
});
