import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { henge, sunset, declination, type Street } from './model.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { assertSteps } from '../../../test/lib/steps.ts';

/** The coordinate model has an independent ERFA oracle; this binds each published scenario to it. */
export function check(trace: Trace, values: Record<string, string>): void {
  const model = henge(values.street as Street);
  const [december, , june] = model.seasons;
  const day = (d: { declination: number; hourAngle: number }) => ({ declination: d.declination, hourAngle: d.hourAngle });
  assertSteps(trace, ['street', 'overhead', 'sky', 'sweep', 'crossings', 'tilt', 'look', 'disc']);
  assertStepState(trace, 'street', { bearing: model.bearing });
  assertStepState(trace, 'overhead', { alignment: model.alignment, backCrossings: model.backCrossings });
  // The globes cut New York's daily circle at the model's own sunset hour angles for the solstices.
  assertStepState(trace, 'tilt', { latitude: model.latitude, tilt: model.tilt, june: day(june!), december: day(december!) });
  assertStepState(trace, 'sky', {
    bearing: model.bearing,
    days: model.seasons.map(({ declination, azimuth, hourAngle }) => ({ declination, hourAngle, azimuth })),
  });
  // The year's turn ends a full orbit after the December solstice, having passed both crossings.
  assertStepState(trace, 'sweep', { bearing: model.bearing, start: -90, longitude: 270, crossings: model.half });
  assertStepState(trace, 'crossings', { bearing: model.bearing, crossings: model.half });
  // The camera ends at street level, on the half-Sun evening of the first alignment season.
  assertStepState(trace, 'look', { bearing: model.bearing, pitch: 3, day: day(sunset(declination(model.half[0]!))) });
  assertStepState(trace, 'disc', { half: model.half, full: model.full, radius: model.radius, gapDays: model.gapDays });
  const caption = trace.steps.find(step => step.step === 'disc')!.meta.caption as string;
  assert.match(caption, model.street === 'west' ? /March.*September/ : /May.*July/);
  if (model.street === 'west') assert.doesNotMatch(caption, /May|July/);
}
