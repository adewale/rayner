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

test('a lettering\'s measurement cache key is the same for one request in any key order, and differs for another', async () => {
  const { measurementKey } = await import('../tools/lib/lettering.ts');
  const fonts = { 'b.woff2': 'h2', 'a.woff2': 'h1' };
  const key = measurementKey('builder', 'shaper', { faces: { sans: 'eb-garamond' }, styles: ['bold', 'italic'] }, fonts);
  assert.equal(measurementKey('builder', 'shaper', { styles: ['bold', 'italic'], faces: { sans: 'eb-garamond' } }, { 'a.woff2': 'h1', 'b.woff2': 'h2' }), key);
  // A different request, or the same styles in another order (a list keeps its order), is another key.
  assert.notEqual(measurementKey('builder', 'shaper', { faces: { sans: 'eb-garamond' }, styles: ['italic', 'bold'] }, fonts), key);
  assert.notEqual(measurementKey('builder', 'shaper', { faces: { sans: 'inter' }, styles: ['bold', 'italic'] }, fonts), key);
});
