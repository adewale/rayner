// The font-metrics explainer's rulers step: the sentence its caption states about the two faces' advances.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectProject } from '../tools/lib/explain-project.ts';

test('font metrics: every Garamond glyph in the phrase advances less than a JetBrains Mono cell', async () => {
  const project = await collectProject('scenes/explainers/font-metrics', { write: false });
  for (const { trace } of project.scenarios) {
    const step = trace.steps.find((s) => s.step === 'rulers')!;
    const { measured, drawn } = step.after!.rulers as { measured: number[]; drawn: number[] };
    const advances = (stops: number[]) => stops.slice(1).map((x, i) => x - stops[i]!);
    const cells = advances(measured),
      glyphs = advances(drawn);
    // JetBrains Mono is monospaced: 12 cells of 0.54 at size 0.9, the width the caption quotes.
    assert.equal(cells.length, 12);
    for (const cell of cells) assert.ok(Math.abs(cell - 0.54) < 1e-5, `Mono cell ${cell}`);
    assert.ok(String(step.meta.caption).includes('advances less than Mono’s 0.54'), String(step.meta.caption));
    // Each Garamond glyph, spaces included, moves the pen on by less than its Mono cell.
    assert.equal(glyphs.length, cells.length);
    glyphs.forEach((glyph, i) => assert.ok(glyph > 0 && glyph < cells[i]!, `glyph ${i}: Garamond ${glyph}, Mono ${cells[i]}`));
  }
});
