// The drawing kit published as rayner/drawing: its exact names, and the collection's scene
// libraries handing out the very same functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as drawing from '../explain/drawing.ts';
import * as lesson from '../scenes/explainers/lib/lesson-drawing.ts';
import * as reader from '../scenes/explainers/lib/reader-drawing.ts';
import { readFileSync } from 'node:fs';

test('rayner/drawing exports exactly the kit, and package.json publishes it', () => {
  assert.deepEqual(Object.keys(drawing).sort(), ['bars', 'between', 'circleOn', 'depthOrder', 'dot', 'flow', 'greatArc', 'keyed', 'label', 'latLon', 'project', 'seenFrom', 'seenPictures', 'segment', 'stat', 'table', 'tile', 'toLatLon']);
  const exports = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).exports;
  assert.deepEqual(exports['./drawing'], { types: './dist/explain/drawing.d.ts', default: './dist/explain/drawing.js' });
});

test('the scene libraries re-export the published functions rather than copies', () => {
  for (const name of ['keyed', 'label', 'tile', 'segment', 'dot', 'table', 'stat', 'flow', 'bars'] as const)
    assert.equal((lesson as Record<string, unknown>)[name], drawing[name], `lesson-drawing ${name}`);
  for (const name of ['label', 'tile', 'table', 'flow', 'bars'] as const)
    assert.equal((reader as Record<string, unknown>)[name], drawing[name], `reader-drawing ${name}`);
});

test('keyed sets a key and returns the mobject; segment and dot take keys like the rest of the kit', async () => {
  const { Scene, NullSink, Circle, loadFonts } = await import('../src/index.ts');
  await loadFonts();
  const { stage } = await import('../explain/index.ts');
  const s = stage(new Scene(new NullSink()));
  const c = new Circle();
  assert.equal(drawing.keyed(c, 'sun'), c);
  assert.equal(c.key, 'sun');
  assert.equal(drawing.segment([0, 0], [1, 0], s.soft, 0.04, 'axis').key, 'axis');
  assert.equal(drawing.dot('A', 0, 0, s, false, 'node:A').key, 'node:A');
  assert.equal(drawing.dot('A', 0, 0, s).key, undefined);
});
