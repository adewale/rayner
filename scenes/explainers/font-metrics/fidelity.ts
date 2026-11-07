import assert from 'node:assert/strict';
import { pictureWordsAt } from '../../../explain/testing.ts';
import type { Trace } from '../../../explain/testing.ts';
import { assertSteps } from '../../../test/lib/steps.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>, { scenario, project }: FidelityRun): Promise<void> {
  // Independent uharfbuzz runs over @fontsource/eb-garamond@5.3.0's
  // original latin WOFF2 files, before subsetting or snapshot capture.
  const em = {Regular: 4.901, Bold: 5.386, Italic: 4.71};
  // Text's advance box uses float32 endpoints; allow their rounding,
  // while keeping the printed hundredths independently exact below.
  // The ruler measures the opening's lower row again, at its size 0.9.
  assert.ok(Math.abs(Number(trace.steps.find(s => s.step === 'advance')!.after!.advance) - em.Regular * 0.9) < 1e-6);
  // The first check reverses the opening: measured in Garamond, drawn in JetBrains Mono (12 cells of 0.54),
  // the marker 0.5 after the measured width lands 1.57 before the drawn phrase ends.
  const layout = trace.steps.find(s => s.step === 'layout')!.after!.layout as { wrong: number; actual: number };
  assert.ok(Math.abs(layout.wrong - 12 * 0.54) < 1e-5 && Math.abs(layout.actual - em.Regular * 0.9) < 1e-6);
  const overlap = (layout.wrong - (layout.actual + 0.5)).toFixed(2);
  assert.equal(overlap, '1.57');
  assert.ok(String((project.Scene as unknown as { meta: { questions: { answer: string }[] } }).meta.questions[0]!.answer).includes(`about ${overlap} units before the phrase ends`));
  // The rulers step draws both measurements under the opening's upper row, pen stop by pen stop from the
  // phrase's start: JetBrains Mono's 12 cells of 0.54 and Garamond's own advances. Every Garamond advance is
  // narrower than the cell, so the gap between matching stops grows at each glyph, ending at the opening's
  // 2.07; the marker sits 0.5 past the Mono ruler's end, where the opening's upper row put it.
  const rulers = trace.steps.find(s => s.step === 'rulers')!.after!.rulers as { measured: number[]; drawn: number[]; markers: { measured: number; drawn: number } };
  assert.equal(rulers.measured.length, 13);
  assert.equal(rulers.drawn.length, 13);
  rulers.measured.forEach((x, i) => assert.ok(Math.abs(x - i * 0.54) < 1e-5, `Mono stop ${i}: ${x}`));
  assert.ok(Math.abs(rulers.drawn[12]! - em.Regular * 0.9) < 1e-5);
  const drift = rulers.measured.map((x, i) => x - rulers.drawn[i]!);
  for (let i = 1; i < drift.length; i++) assert.ok(drift[i]! > drift[i - 1]!, `drift falls at glyph ${i}: ${drift}`);
  assert.equal(drift[12]!.toFixed(2), (layout.wrong - layout.actual).toFixed(2));
  assert.ok(Math.abs(rulers.markers.measured - (layout.wrong + 0.5)) < 1e-5 && Math.abs(rulers.markers.drawn - (layout.actual + 0.5)) < 1e-5);
  assertSteps(trace, ['rulers', 'cuts']);
  const expected = Object.fromEntries(Object.entries(em).map(([cut, width]) => [cut, width * 0.9]));
  const actual = trace.steps.find(s => s.step === 'cuts')!.after!.advances as Record<string, number>;
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
  for (const [cut, advance] of Object.entries(expected)) assert.ok(Math.abs(actual[cut]! - advance) < 1e-6, `${cut}: raw-font advance ${advance}, scene ${actual[cut]}`);
  const shown = pictureWordsAt(trace, 'cuts').full;
  for (const [cut, width] of Object.entries(expected)) assert.ok(shown.includes(`${cut}, advance ${width.toFixed(2)}`), shown);
  // Independent original-font measurements, recorded with source SHA in
  // docs/evidence/authoring-layout/font-vectors.json. No Text measurement
  // is used as the expected diagram width.
  // Two diagrams of the same source: measured in the drawn face (natural), and
  // laid out from Agentic Mermaid's default Inter estimates (recorded).
  const diagrams = Object.values(project.store);
  assert.equal(diagrams.length, 2);
  const runsOf = (d: (typeof diagrams)[number]) => d.parts.flatMap(p => p.shapes.flatMap(s => s.textRun ? [s.textRun] : []));
  const natural = diagrams.find(d => d.spec.lettering === 'natural')!,
    recorded = diagrams.find(d => d.spec.lettering === undefined)!;
  assert.ok(natural && recorded);
  assert.equal(natural.spec.source, recorded.spec.source);
  const runs = runsOf(natural);
  assert.deepEqual(runs.map(r => r.text).sort(), ['Ink', 'Paper']);
  const diagramEm: Record<string, number> = {Ink: 1.337, Paper: 2.144};
  for (const run of runs) {
    assert.equal(run.natural, true);
    assert.ok(Math.abs(run.width! - diagramEm[run.text]! * run.size) < 0.001, `${run.text}: layout reserves the actual source-font advance`);
  }
  // The step's notes say each word's stretch: none when measured, more than none from Inter estimates,
  // each the recorded width over the source-font advance at the run's size.
  const stretch = trace.steps.find(s => s.step === 'diagram')!.after!.stretch as Record<string, number>;
  const diagramShown = pictureWordsAt(trace, 'diagram').full;
  for (const run of values.widths === 'natural' ? runs : runsOf(recorded)) {
    const k = run.width! / (diagramEm[run.text]! * run.size);
    assert.ok(Math.abs(stretch[run.text]! - k) < 0.002, `${run.text}: stretch ${stretch[run.text]}, from the source font ${k}`);
    if (values.widths === 'natural') assert.equal(k.toFixed(3), '1.000');
    else assert.ok(k > 1.1, `${run.text}: Inter estimates stretch the Garamond word (${k})`);
    assert.ok(diagramShown.includes(`stretched ×${stretch[run.text]!.toFixed(3)}`), diagramShown);
  }
  // The recorded scenario's caption: Paper is stretched more than Ink, so no single factor converts the faces.
  if (values.widths === 'recorded') {
    assert.ok(stretch.Paper! > stretch.Ink! + 0.1, `Paper ${stretch.Paper}, Ink ${stretch.Ink}`);
    assert.match(String(trace.steps.find(s => s.step === 'diagram')!.meta.caption), /Paper’s is larger than Ink’s/);
  }
}
