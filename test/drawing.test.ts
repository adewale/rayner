// The drawing kit published as rayner/drawing: its exact names, and the collection's scene
// libraries handing out the very same functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from '../explain/drawing.ts';
import * as lesson from '../scenes/explainers/lib/lesson-drawing.ts';
import * as reader from '../scenes/explainers/lib/reader-drawing.ts';
import { readFileSync } from 'node:fs';

test('rayner/drawing exports exactly the kit, and package.json publishes it', () => {
  assert.deepEqual(Object.keys(drawing).sort(), ['bars', 'dot', 'flow', 'label', 'segment', 'stat', 'table', 'tile']);
  const exports = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).exports;
  assert.deepEqual(exports['./drawing'], { types: './dist/explain/drawing.d.ts', default: './dist/explain/drawing.js' });
});

test('the scene libraries re-export the published functions rather than copies', () => {
  for (const name of ['label', 'tile', 'segment', 'dot', 'table', 'stat', 'flow', 'bars'] as const)
    assert.equal((lesson as Record<string, unknown>)[name], drawing[name], `lesson-drawing ${name}`);
  for (const name of ['label', 'tile', 'table', 'flow', 'bars'] as const)
    assert.equal((reader as Record<string, unknown>)[name], drawing[name], `reader-drawing ${name}`);
});
