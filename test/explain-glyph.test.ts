// The glyph explainer's sentences about "Hello, outlines" and its check answers, measured
// with the embedded Inter and JetBrains Mono shapers rather than read from the scene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFonts, shaperFor } from '../src/index.ts';
import GlyphExplainer from '../scenes/explainers/glyph/scene.ts';

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

test('glyph: the check answers’ widths are the shapers’ own', async () => {
  await loadFonts();
  const answers = GlyphExplainer.meta.checks.map((c) => c.answer).join(' ');
  // “illicit” and “mammoth”: seven cells each in JetBrains Mono; thin stems against wide m’s in Inter.
  for (const word of ['illicit', 'mammoth']) assert.equal(width('mono', word).toFixed(2), '3.78');
  assert.equal(width('sans', 'illicit').toFixed(2), '1.90');
  assert.equal(width('sans', 'mammoth').toFixed(2), '4.24');
  assert.equal(advances('sans', 'm')[0]!.ax.toFixed(3), '0.788');
  for (const quoted of ['3.78', '1.90', '4.24', '0.788']) assert.ok(answers.includes(quoted), quoted);
  // The diagram-measurement question (a label measured in Inter, drawn in Mono) left with the diagram step.
  assert.ok(!answers.includes('recorded width'));
});
