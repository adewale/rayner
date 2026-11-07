import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shaperFor } from '../../../src/index.ts';
import { loadFonts } from '../../../explain/testing.ts';
import GlyphExplainer from './scene.ts';
import { readFileSync } from 'node:fs';
import { withIntent } from '../../../explain/testing.ts';
import type { ExplainerMeta } from '../../../explain/index.ts';

// The scene's metadata with its script's intent adopted, as the command adopts it.
const scriptMeta = withIntent(GlyphExplainer, readFileSync('scenes/explainers/glyph/script.md', 'utf8'), 'scenes/explainers/glyph/script.md').meta as ExplainerMeta;

const SIZE = 0.9;

const advances = (font: 'sans' | 'mono', text: string) => shaperFor(font)(text, SIZE).glyphs.map((g) => ({ ch: text[g.cluster]!, ax: g.ax }));

const width = (font: 'sans' | 'mono', text: string) => shaperFor(font)(text, SIZE).width;

test('glyph: the check answers’ widths are the shapers’ own', async () => {
  await loadFonts();
  const answers = scriptMeta.questions!.map((c) => c.answer).join(' ');
  // “illicit” and “mammoth”: seven cells each in JetBrains Mono; thin stems against wide m’s in Inter.
  for (const word of ['illicit', 'mammoth']) assert.equal(width('mono', word).toFixed(2), '3.78');
  assert.equal(width('sans', 'illicit').toFixed(2), '1.90');
  assert.equal(width('sans', 'mammoth').toFixed(2), '4.24');
  assert.equal(advances('sans', 'm')[0]!.ax.toFixed(3), '0.788');
  for (const quoted of ['3.78', '1.90', '4.24', '0.788']) assert.ok(answers.includes(quoted), quoted);
  // The diagram-measurement question (a label measured in Inter, drawn in Mono) left with the diagram step.
  assert.ok(!answers.includes('recorded width'));
});
