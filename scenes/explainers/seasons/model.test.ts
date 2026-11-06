import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from '../lib/pbt.ts';
import { sunlight, daylightYear, noonShare, noonPatch, sunDistance } from './model.ts';

test('noon sunlight per square metre is sin of the noon altitude, and the orbit is about 3.4% farther in July', () => {
  fc.assert(fc.property(
    fc.double({ min: -90, max: 90, noNaN: true }),
    fc.double({ min: -23.44, max: 23.44, noNaN: true }),
    (latitude, declination) => {
      const share = noonShare(latitude, declination), altitude = sunlight(latitude, declination).altitude;
      assert.ok(share >= 0 && share <= 1);
      // A beam one metre across at right angles to the rays lights 1 / sin(altitude) metres of level ground.
      if (altitude > 0) assert.ok(Math.abs(share - 1 / (1 / Math.sin((altitude * Math.PI) / 180))) < 1e-12);
      else assert.equal(share, 0);
    },
  ), params(300));
  // By hand: London's June noon Sun at 61.94° gives sin 61.94° = 0.882; December's 15.06° gives 0.260.
  assert.ok(Math.abs(noonShare(51.5, 23.44) - 0.882) < 0.001);
  assert.ok(Math.abs(noonShare(51.5, -23.44) - 0.26) < 0.001);
  assert.equal(noonShare(69.65, -23.44), 0);
  // Wikipedia's R = 1.00014 − 0.01671 cos g − 0.00014 cos 2g: 0.98329 AU at perihelion (g = 0) and
  // 1.01671 AU half a year later (g = 180°), 3.4% farther, so sunlight is (1.01671 / 0.98329)² = 1.069 times stronger in January.
  assert.ok(Math.abs(sunDistance(2) - 0.98329) < 1e-9);
  assert.ok(Math.abs(sunDistance(2 + 365 / 2) - 1.01671) < 1e-9);
  const days = Array.from({ length: 365 }, (_, d) => sunDistance(d));
  assert.equal(days.indexOf(Math.min(...days)), 2, 'nearest in early January');
  assert.ok([184, 185].includes(days.indexOf(Math.max(...days))), 'farthest in early July');
  assert.ok(Math.abs(sunDistance(2 + 365 / 2) / sunDistance(2) - 1.034) < 0.001);
});

test('a noon beam one metre across lights the stretch of level ground its two edge rays meet, and none when the Sun is down', () => {
  const rad = Math.PI / 180;
  fc.assert(fc.property(
    fc.double({ min: -90, max: 90, noNaN: true }),
    fc.double({ min: -23.44, max: 23.44, noNaN: true }),
    (latitude, declination) => {
      const altitude = sunlight(latitude, declination).altitude, patch = noonPatch(latitude, declination);
      if (altitude <= 0) return assert.equal(patch, null);
      // Geometry, not the formula: one edge ray lands at the origin, travelling (cos a, −sin a); the other runs
      // parallel, one metre away at right angles, through (sin a, cos a). Where it meets the ground, y = 0.
      const a = altitude * rad, t = Math.cos(a) / Math.sin(a);
      const x = Math.sin(a) + t * Math.cos(a);
      assert.ok(patch !== null && Math.abs(patch - x) < 1e-9 * Math.max(1, x), `${latitude}, ${declination}: ${patch} against ${x}`);
      assert.ok(patch >= 1 - 1e-12, 'no patch is shorter than the beam is wide');
      assert.ok(Math.abs(patch * noonShare(latitude, declination) - 1) < 1e-9, 'the share per m² is one over the patch');
    },
  ), params(300));
  // London: 1.13 m in June against 3.85 m in December, 3.4 times as long; Tromsø's December noon Sun is down;
  // Quito's June and December patches are one length.
  assert.equal(noonPatch(51.5, 23.44)!.toFixed(2), '1.13');
  assert.equal(noonPatch(51.5, -23.44)!.toFixed(2), '3.85');
  assert.equal((noonPatch(51.5, -23.44)! / noonPatch(51.5, 23.44)!).toFixed(1), '3.4');
  assert.equal(noonPatch(69.65, -23.44), null);
  assert.equal(noonPatch(0, 23.44), noonPatch(0, -23.44));
});

test('sunlight follows the sunrise equation: bounded, hemisphere-symmetric, polar extremes and mid-latitude hours', () => {
  fc.assert(fc.property(
    fc.double({ min: -90, max: 90, noNaN: true }),
    fc.double({ min: -23.44, max: 23.44, noNaN: true }),
    (latitude, declination) => {
      const value = sunlight(latitude, declination);
      assert.ok(Number.isFinite(value.daylight) && value.daylight >= 0 && value.daylight <= 24);
      assert.ok(Math.abs(value.daylight - sunlight(-latitude, -declination).daylight) < 1e-10);
      // Opposite seasons partition one rotation, including polar day/night.
      assert.ok(Math.abs(value.daylight + sunlight(latitude, -declination).daylight - 24) < 1e-10);
      assert.equal(value.altitude, 90 - Math.abs(latitude - declination));
    },
  ), params(300));
  assert.equal(sunlight(69.65, 23.44).daylight, 24);
  assert.equal(sunlight(69.65, -23.44).daylight, 0);
  assert.deepEqual(daylightYear(0), Array(12).fill(12));
  // By hand from cos ω = −tan φ · tan δ, hours = ω / 7.5°: at φ = 51.5°, tan φ · tan 23.44° = 1.2572 × 0.4336
  // = 0.5451, so ω = acos(−0.5451) = 123.03° and the day is 16.40 h; in December it is 24 − 16.40 = 7.60 h.
  assert.ok(Math.abs(sunlight(51.5, 23.44).daylight - 16.4) < 0.01);
  assert.ok(Math.abs(sunlight(51.5, -23.44).daylight - 7.6) < 0.01);
  assert.ok(sunlight(-33.87, 23.44).daylight < 12);
  // Mid-month declinations, δ = −23.44° × cos(360° × (day + 10) / 365): 15 June (day 165) puts the
  // Arctic Circle in full day and 15 December (day 348) in full night; at 65°N on 15 December
  // δ = −23.27°, so ω = acos(2.1445 × 0.4301) = 22.71° and the day is 3.0 h.
  assert.equal(daylightYear(69.65)[5], 24);
  assert.equal(daylightYear(69.65)[11], 0);
  assert.equal(daylightYear(65)[11], 3);
  // Near the equinox δ moves fastest, so this pins the day offset: on 15 March (day 73) δ = −3.32°,
  // ω = acos(2.1445 × 0.0580) = 82.86° and the day at 65°N is 11.0 h (a day's shift gives 11.2).
  assert.equal(daylightYear(65)[2], 11);
});

test('on the equator the day–night line cuts the circle in half: 12 hours at every declination and on every day of the year', () => {
  // The seasons page says the equator's circle is always cut in half; it draws only the two solstices.
  fc.assert(fc.property(
    fc.double({ min: -23.44, max: 23.44, noNaN: true }),
    (declination) => assert.ok(Math.abs(sunlight(0, declination).daylight - 12) < 1e-12, `${declination}°`),
  ), params(300));
  // daylightYear's declination, δ = −23.44° × cos(360° × (day + 10) / 365), on each of the 365 days.
  const declination = (day: number) => -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365);
  for (let day = 0; day < 365; day++) assert.ok(Math.abs(sunlight(0, declination(day)).daylight - 12) < 1e-12, `day ${day}`);
  assert.deepEqual(daylightYear(0), Array(12).fill(12));
});
