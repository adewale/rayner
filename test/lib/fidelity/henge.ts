import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { henge, type Street } from '../../../scenes/explainers/lib/henge.ts';
import { assertStepState } from '../explainer-state.ts';

/** The coordinate model has an independent ERFA oracle; this binds each published case to it. */
export function check(values: Record<string, string>, trace: Trace): void {
  const model = henge(values.street as Street);
  assert.deepEqual(trace.steps.map(step => step.step), ['street', 'tilt', 'paths', 'sweep', 'crossings', 'disc']);
  assertStepState(trace, 'street', { bearing: model.bearing });
  assertStepState(trace, 'tilt', { latitude: model.latitude, tilt: model.tilt });
  assertStepState(trace, 'paths', {
    sunsets: model.seasons.map(({ declination, azimuth, hourAngle }) => ({ declination, azimuth, hourAngle })),
  });
  assertStepState(trace, 'sweep', {
    bearing: model.bearing,
    annual: model.annual.map(({ longitude, azimuth }) => ({ longitude, azimuth })),
  });
  assertStepState(trace, 'crossings', { bearing: model.bearing, crossings: model.half });
  assertStepState(trace, 'disc', { half: model.half, full: model.full, radius: model.radius });
  const caption = trace.steps.find(step => step.step === 'disc')!.meta.caption as string;
  assert.match(caption, model.street === 'west' ? /March.*September/ : /May.*July/);
  if (model.street === 'west') assert.doesNotMatch(caption, /May|July/);
}
