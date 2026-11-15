import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { henge, dayName, clock, sunset, declination, REFRACTION, type Place, type Seen } from './model.ts';
import { assertStepState, assertSteps } from '../../../explain/testing.ts';

/** The ephemeris is checked against Skyfield and DE440s, the sky against ERFA; this binds each published scenario to the model. */
export function check(trace: Trace, values: Record<string, string>): void {
  const model = henge(values.place as Place);
  const [december, , june] = model.seasons;
  const day = (d: { latitude: number; declination: number; hourAngle: number }) => ({ latitude: d.latitude, declination: d.declination, hourAngle: d.hourAngle });
  const disc = (key: string, e: Seen & { date: string }) => ({ key, name: dayName(e.date), azimuth: e.azimuth, altitude: e.altitude + REFRACTION, semidiameter: e.semidiameter });
  const [firstHalf, secondHalf] = model.aligned.half, [firstFull] = model.aligned.full;
  const ev = Object.fromEntries(model.evenings.map((e) => [e.role, e]));
  assertSteps(trace, ['street', 'evenings', 'overhead', 'globe', 'sky', 'sweep', 'crossings', 'tilt', 'look', 'disc']);
  // The street views draw the Sun where the ephemeris puts it at half Sun, lifted by the standard refraction.
  assertStepState(trace, 'street', { bearing: model.bearing, metres: model.where.metres, suns: [disc('aligned', firstHalf!)] });
  assertStepState(trace, 'evenings', { suns: (['before', 'aligned', 'next', 'after'] as const).map((r) => disc(r, ev[r]!)), aside: { name: dayName(ev.other!.date), azimuth: ev.other!.azimuth } });
  assertStepState(trace, 'overhead', { alignment: model.alignment, backCrossings: model.backCrossings });
  // The globe meets the ring where the model's street, carried on, does, with the Sun overhead where the ephemeris puts it.
  assertStepState(trace, 'globe', { latitude: model.latitude, longitude: model.where.longitude, bearing: model.bearing, meets: model.meets,
    suns: [{ key: 'aligned', name: dayName(firstHalf!.date), ...firstHalf!.overhead }, { key: 'other', name: dayName(ev.other!.date), ...ev.other!.overhead }] });
  // The globes cut the place's daily circle at the model's own sunset hour angles for the solstices.
  assertStepState(trace, 'tilt', { latitude: model.latitude, tilt: model.tilt, june: day(june!), december: day(december!) });
  assertStepState(trace, 'sky', {
    bearing: model.bearing, latitude: model.latitude,
    days: model.seasons.map(({ latitude, declination, azimuth, hourAngle }) => ({ latitude, declination, hourAngle, azimuth })),
  });
  // The year's turn ends a full orbit after the December solstice, having passed both crossings.
  assertStepState(trace, 'sweep', { bearing: model.bearing, latitude: model.latitude, start: -90, longitude: 270, crossings: model.ideal });
  assertStepState(trace, 'crossings', { bearing: model.bearing, year: model.year, crossings: [firstHalf!, secondHalf!].map((e) => ({ date: e.date, name: dayName(e.date) })) });
  // The camera ends at street level, on the idealised evening the street is first crossed.
  assertStepState(trace, 'look', { bearing: model.bearing, pitch: 3, day: day(sunset(model.latitude, declination(model.ideal[0]!))) });
  assertStepState(trace, 'disc', { half: { ...disc('half', firstHalf!), date: dayName(firstHalf!.date), clock: clock(model.place, firstHalf!.utc) },
    full: { ...disc('full', firstFull!), date: dayName(firstFull!.date), clock: clock(model.place, firstFull!.utc) } });
  const caption = trace.steps.find(step => step.step === 'crossings')!.meta.caption as string;
  assert.match(caption, model.place === 'chicago' ? /March.*September/ : /May.*July/);
}
