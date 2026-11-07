import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { Scene, Text } from '../../../src/index.ts';
import type { Sink } from '../../../src/index.ts';
import { pictureHtml } from '../../../explain/trace.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { textOf } from '../../../test/lib/fidelity.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';
import { sunlight, noonShare, noonPatch, sunDistance, daylightYear } from './model.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>, { scenario }: FidelityRun): Promise<void> {
  const lat = ({ tromso: 69.65, london: 51.5, quito: 0, sydney: -33.87 } as Record<string, number>)[
    values.place!
  ]!;
  assertStepState(trace, 'june', { latitude: lat, june: sunlight(lat, 23.44) });
  assertStepState(trace, 'december', { december: sunlight(lat, -23.44) });
  // The noon sunlight per square metre said under each globe, and the orbit's extremes the distance step argues from.
  assertStepState(trace, 'december', { noonShare: { june: noonShare(lat, 23.44), december: noonShare(lat, -23.44) } });
  // The ground each 1 m noon beam lands on, drawn side by side; null where the noon Sun is down (Tromsø's December).
  assertStepState(trace, 'spread', { patch: { june: noonPatch(lat, 23.44), december: noonPatch(lat, -23.44) } });
  assert.equal(lat === 69.65, (trace.steps.find((s) => s.step === 'spread')!.after!.patch as { december: number | null }).december === null);
  const orbit = Array.from({ length: 365 }, (_, d) => sunDistance(d));
  assertStepState(trace, 'distance', { distance: { nearest: Math.min(...orbit), farthest: Math.max(...orbit) } });
  // The first check question: London's December-solstice noon share, 26% at average distance, is about 27% once
  // the solstice's distance (day 355, the model's declination minimum) is counted, about 3% stronger sunlight.
  if (values.place === 'london') {
    const solstice = sunDistance(365 - 10), share = noonShare(51.5, -23.44);
    assert.equal(Math.round(share * 100), 26);
    assert.equal(solstice.toFixed(3), '0.984');
    assert.equal(Math.round((1 / solstice ** 2 - 1) * 100), 3);
    assert.equal(Math.round((share / solstice ** 2) * 100), 27);
    const { checks } = (scenario.Scene as unknown as { meta: { checks: { answer: string }[] } }).meta;
    assert.match(checks[0]!.answer, /^About 27%\. On the solstice Earth is about 0\.984 of its average distance/);
    // The second: an axis that always leans north toward the Sun gives December June's values, 16.4 h and 88%.
    assert.equal(sunlight(51.5, 23.44).daylight.toFixed(1), '16.4');
    assert.equal(Math.round(noonShare(51.5, 23.44) * 100), 88);
    assert.match(checks[1]!.answer, /^The same as in June: 16\.4 h of daylight and 88% of overhead sunlight at noon\./);
  }
  assertStepState(trace, 'year', { daylight: daylightYear(lat) });
  // The chart samples the model through the year, and its counts of polar days run it on every day, with
  // daylightYear's own declination, δ = −23.44° × cos(360° × (day + 10) / 365), which the scene restates
  // (seasons/model.ts does not export it): on each month's 15th it gives daylightYear's value.
  const declination = (day: number) => -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365);
  const fifteenths = [14, 45, 73, 104, 134, 165, 195, 226, 257, 287, 318, 348];
  assert.deepEqual(
    fifteenths.map((d) => Math.round(sunlight(lat, declination(d)).daylight * 10) / 10),
    daylightYear(lat),
  );
  // The chart counts the model's days of polar day and night over one year.
  const days = Array.from({ length: 365 }, (_, d) => sunlight(lat, declination(d)).daylight);
  assertStepState(trace, 'year', {
    polarDay: days.filter((h) => h === 24).length,
    polarNight: days.filter((h) => h === 0).length,
  });
  if (lat === 69.65) assert.ok((trace.steps.find((s) => s.step === 'year')!.after!.polarDay as number) > 50);
  await seasonsArithmetic(trace, scenario.Scene);
}

/**
 * seasons' printed arithmetic holds as printed: the noon formula drawn on the close-up, and the
 * year chart's "longest − shortest" dimension against the two solstice values on the curve.
 */
async function seasonsArithmetic(
  trace: { steps: { step: string; meta: Record<string, unknown>; after?: unknown; shown?: Record<string, unknown> }[] },
  Bound: new (sink: Sink) => Scene,
) {
  const texts = await restingTexts(Bound);
  const formulas = (texts.get('noon') ?? []).filter((t) => t.startsWith('90° − |'));
  assert.equal(formulas.length, 1, `one noon formula on the close-up: ${formulas.join(' / ')}`);
  const m = /^90° − \|(-?[\d.]+)° − (-?[\d.]+)°\| = (-?[\d.]+)°$/.exec(formulas[0]!);
  assert.ok(m, formulas[0]!);
  const [lat, decl, result] = m.slice(1).map(Number) as [number, number, number];
  // Evaluated at the precision printed: the result to as many places as its most precise operand.
  const places = Math.max(...m.slice(1).map((v) => v.split('.')[1]?.length ?? 0));
  assert.equal((90 - Math.abs(lat - decl)).toFixed(places), result.toFixed(places), formulas[0]!);
  // The share of overhead sunlight on the close-up is sin of that altitude, to the hundredth it prints.
  const sines = (texts.get('noon') ?? []).filter((t) => t.startsWith('sin '));
  assert.equal(sines.length, 1, `one sine on the close-up: ${sines.join(' / ')}`);
  const sine = /^sin ([\d.]+)° = ([\d.]+)$/.exec(sines[0]!);
  assert.ok(sine, sines[0]!);
  assert.equal(Math.sin(((90 - Math.abs(lat - decl)) * Math.PI) / 180).toFixed(2), sine[2], sines[0]!);
  assert.equal((90 - Math.abs(lat - decl)).toFixed(1), sine[1], sines[0]!);
  // The describe says the same formula.
  const noon = textOf(pictureHtml(trace.steps.find((s) => s.step === 'noon')!.shown));
  assert.ok(noon.includes(formulas[0]!), noon);

  // The side-by-side beams: each patch length printed under its beam, and the share per m² under it, is
  // 1 ÷ that length as printed; the caption's "1 ÷ x = y%" sums hold as printed too.
  const spreadTexts = texts.get('spread') ?? [];
  const lengths = spreadTexts.filter((t) => /^\d+\.\d\d m$/.test(t)), shares = spreadTexts.filter((t) => /^\d+% per m²$/.test(t));
  assert.ok(lengths.length >= 1 && lengths.length === shares.length, `one share under each patch: ${spreadTexts.join(' / ')}`);
  lengths.forEach((length, i) => assert.equal(Math.round(100 / parseFloat(length)) + '% per m²', shares[i], `${length} against ${shares[i]}`));
  const spreadCaption = String(trace.steps.find((s) => s.step === 'spread')!.meta.caption);
  const sums = [...spreadCaption.matchAll(/1 ÷ ([\d.]+) = (\d+)%/g)];
  assert.ok(sums.length >= 1, spreadCaption);
  for (const [, x, y] of sums) {
    assert.equal(Math.round(100 / Number(x)), Number(y), spreadCaption);
    assert.ok(lengths.includes(`${x} m`), `the caption's ${x} m is drawn: ${spreadCaption}`);
  }

  const yearStep = trace.steps.find((s) => s.step === 'year')!,
    year = textOf(pictureHtml(yearStep.shown));
  // The solstice values as the chart labels them at their dots.
  const row = (name: string) => {
    const r = new RegExp(`${name} ([\\d.]+) h`).exec(year);
    assert.ok(r, `${name} in ${year}`);
    return Number(r[1]);
  };
  const june = row('Jun solstice'),
    december = row('Dec solstice');
  // The dimension beside the chart, where the year has one (not at the poles, nor where the
  // curve is flat), measures the gap between them.
  const spread = /A dimension line marked “longest − shortest: ([\d.]+) h”/.exec(year);
  if (spread) assert.equal(Number(spread[1]).toFixed(1), Math.abs(june - december).toFixed(1), year);
  else assert.ok(/flat at 24 h/.test(year) || june === december, `a year with no gap measured: ${year}`);
  // Where the caption names the shortest and longest days, they are the chart's two solstice values.
  const caption = String(yearStep.meta.caption);
  const named =
    /from ([\d.]+) h at the December solstice to ([\d.]+) h|shortest day, ([\d.]+) h, .* longest, ([\d.]+) h/.exec(caption);
  if (named) {
    const [shortest, longest] = named.slice(1).filter(Boolean).map(Number) as [number, number];
    assert.deepEqual([shortest, longest], [Math.min(june, december), Math.max(june, december)], caption);
  }
}

/** The text of every Text on the scene at the end of each step, by step name. */
async function restingTexts(Bound: new (sink: Sink) => Scene): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const sink: Sink = {
    async frame() {},
    async stepEnd(scene, step) {
      out.set(step.name, scene.familyMembers().flatMap((m) => (m instanceof Text ? [m.text] : [])));
    },
  };
  await new Bound(sink).run();
  return out;
}
