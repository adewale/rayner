import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shaperFor } from '../../../src/index.ts';
import { loadFonts } from '../../../explain/testing.ts';

const SIZE = 0.9;

const advances = (font: 'sans' | 'mono', text: string) => shaperFor(font)(text, SIZE).glyphs.map((g) => ({ ch: text[g.cluster]!, ax: g.ax }));

const width = (font: 'sans' | 'mono', text: string) => shaperFor(font)(text, SIZE).width;

test('glyph: Inter gives l and i its narrowest advance, and only the H is wider than JetBrains Mono’s cell', async () => {
  await loadFonts();
  const sans = advances('sans', 'Hello, outlines'),
    mono = advances('mono', 'Hello, outlines');
  const cell = mono[0]!.ax;
  assert.ok(mono.every((g) => Math.abs(g.ax - cell) < 1e-9), 'JetBrains Mono: one advance for every character');
  const narrowest = Math.min(...sans.map((g) => g.ax));
  assert.equal(narrowest.toFixed(3), '0.218');
  assert.deepEqual(
    sans.filter((g) => Math.abs(g.ax - narrowest) < 1e-9).map((g) => g.ch),
    ['l', 'l', 'l', 'i'],
  );
  assert.deepEqual(
    sans.filter((g) => g.ax > cell).map((g) => g.ch),
    ['H'],
  );
  // The groups the measure step's caption and card add up.
  const gain = (chars: (c: string, i: number) => boolean) =>
    sans.reduce((n, g, i) => (chars(g.ch, i) ? n + cell - g.ax : n), 0);
  assert.equal(gain((c) => c === 'l' || c === 'i').toFixed(2), '1.29');
  assert.equal(gain((c) => c === ',' || c === ' ' || c === 't').toFixed(2), '0.81');
  assert.equal(gain((c) => c === 'H').toFixed(2), '-0.13');
  assert.equal((width('mono', 'Hello, outlines') - width('sans', 'Hello, outlines')).toFixed(2), '2.08');
});
