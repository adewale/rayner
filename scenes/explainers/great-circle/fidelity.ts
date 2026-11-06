import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { london, madrid, haversine, rhumb, tens } from './model.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { assertSteps } from '../../../test/lib/steps.ts';

/** Every number a step draws or says comes from the route model; the model has its own GeographicLib oracle. */
export function check(trace: Trace, values: Record<string, string>): void {
  const L = london(), M = madrid();
  assertSteps(trace, ['question', 'shorter', 'stretch', 'globe', 'turn', 'north', 'another', 'gnomonic', 'limits']);
  for (const step of ['question', 'shorter', 'globe', 'turn', 'north', 'limits']) assertStepState(trace, step, { route: L });
  assertStepState(trace, 'stretch', { route: L, stretch: L.stretch, km: 1000 });
  assertStepState(trace, 'gnomonic', { routes: [L, M] });
  // The turn ends with the eye in the route's plane: the viewpoint faces the route's midpoint.
  const turn = trace.steps.find((step) => step.step === 'turn')!.after! as { viewpoint: { kind: string; yaw: number; pitch: number } };
  assert.equal(turn.viewpoint.kind, 'orthographic');
  assert.ok(Math.abs(haversine(L.from, { lat: turn.viewpoint.pitch, lon: turn.viewpoint.yaw }) - L.km / 2) < 1e-6);
  assert.ok(Math.abs(haversine(L.to, { lat: turn.viewpoint.pitch, lon: turn.viewpoint.yaw }) - L.km / 2) < 1e-6);
  const caption = (step: string) => trace.steps.find((s) => s.step === step)!.meta.caption as string;
  assert.match(caption('shorter'), /8,760 kilometres against 9,730/);
  assert.match(caption('north'), /62 degrees north, over southern Greenland/);
  // The second route is the reader's: Madrid–New York beside its line of latitude, or two equator-map routes.
  if (values.second === 'madrid') {
    assertStepState(trace, 'another', { route: M, westKm: rhumb(M.from, M.to).km });
    assert.match(caption('another'), /5,930 kilometres.*46 degrees north.*5,760/);
    return;
  }
  assert.equal(values.second, 'equator');
  // Where the ruler and the string are the same length.
  const pairs = trace.steps.find((step) => step.step === 'another')!.after!.pairs as { from: { lat: number; lon: number }; to: { lat: number; lon: number }; km: number; rhumbKm: number }[];
  assert.equal(pairs.length, 2);
  for (const p of pairs) {
    assert.equal(p.km, haversine(p.from, p.to));
    assert.ok(Math.abs(p.rhumbKm - p.km) < 1e-6, 'the ruler line is the great circle here');
  }
  assert.match(caption('another'), new RegExp(`${tens(pairs[0]!.km)} km either way`));
}
