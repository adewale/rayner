import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { SHADES, rows, summarize } from '../../../scenes/explainers/lib/tailwind-gamut.ts';
import type { Shade } from '../../../scenes/explainers/lib/tailwind-gamut.ts';

/** Every case's step state equals the gamut model's answers for that shade and screen. */
export function check(trace: Trace, values: Record<string, string>): void {
  const shade = values.shade as Shade,
    screen = values.screen;
  assert.ok(SHADES.includes(shade), `unknown shade ${shade}`);
  assert.ok(screen === 'srgb' || screen === 'p3', `unknown screen ${screen}`);
  const all = rows(shade),
    sum = summarize(shade);

  assertStepState(trace, 'oklch', { palette: all.map((r) => [r.family, r.L, r.C, r.h]) });
  assertStepState(trace, 'srgb-edge', { srgbEdge: all.map((r) => r.srgb) });
  assertStepState(trace, 'palette', { outsideSrgb: sum.outsideSrgb, furthest: sum.furthest });
  assertStepState(trace, 'share', { ofSrgb: all.map((r) => r.ofSrgb) });
  assertStepState(trace, 'p3-edge', { outsideP3: [], nearestP3: sum.nearestP3, p3OfSrgb: all.map((r) => r.p3OfSrgb) });
  if (screen === 'srgb') assertStepState(trace, 'srgb-screen', { shown: all.map((r) => [r.family, r.shown, r.hueShift, r.shownOfSrgb]) });
  else assertStepState(trace, 'p3-screen', { ofP3: all.map((r) => r.ofP3), srgbOfP3: all.map((r) => r.srgbOfP3) });

  // The headings say the model's counts.
  const title = (step: string) => String(trace.steps.find((s) => s.step === step)!.meta.title);
  assert.ok(title('palette').startsWith(`${sum.outsideSrgb.length} of the ${all.length} ${shade} shades`), title('palette'));
  assert.ok(title('share').endsWith(`${sum.mostOfSrgb.value.toFixed(1)}%`), title('share'));
  assert.deepEqual(
    trace.steps.map((s) => s.step),
    ['reader-edge', 'reader-display', 'oklch', 'srgb-edge', 'palette', 'share', 'p3-edge', screen === 'srgb' ? 'srgb-screen' : 'p3-screen'],
  );
}
