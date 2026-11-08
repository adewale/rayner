// Whether a stored scene.lettering.json was pinned for a scene's request: one rule, which
// loadProject and the command both read, comparing requests whatever their key order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LETTERING_VERSION, SUBSET_LETTERING_VERSION, pinnedFor } from '../src/lettering-outlines.ts';

test('a lettering pin holds the request it was made for, in any key order, and no other', () => {
  const request = { faces: { sans: 'eb-garamond' }, styles: ['bold', 'italic'] } as const;
  const outline = { version: LETTERING_VERSION, request: { styles: ['bold', 'italic'], faces: { sans: 'eb-garamond' } } };
  assert.equal(pinnedFor(outline, request, true), true, 'key order does not matter');
  // Defects the rule must reject: another version, another request, a subset pin read as outlines.
  assert.equal(pinnedFor({ ...outline, version: LETTERING_VERSION - 1 }, request, true), false);
  assert.equal(pinnedFor({ ...outline, request: { faces: { sans: 'eb-garamond' }, styles: ['bold'] } }, request, true), false);
  assert.equal(pinnedFor({ version: SUBSET_LETTERING_VERSION, scripts: ['Grek'] }, request, true), false);
  assert.equal(pinnedFor(null, request, true), false);
  const scripts = { scripts: ['Grek', 'Cyrl'] } as const;
  assert.equal(pinnedFor({ version: SUBSET_LETTERING_VERSION, scripts: ['Grek', 'Cyrl'] }, scripts, false), true);
  assert.equal(pinnedFor({ version: SUBSET_LETTERING_VERSION, scripts: ['Grek'] }, scripts, false), false);
  assert.equal(pinnedFor({ version: LETTERING_VERSION, scripts: ['Grek', 'Cyrl'] }, scripts, false), false);
});
