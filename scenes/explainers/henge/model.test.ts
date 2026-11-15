import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sky, declination, sunset, sunrise, crossings, henge, sunFrom, moment, aligned, along, clock, DATES, PLACES, TILT, REFRACTION, type Place } from './model.ts';
import { fc, params } from '../lib/pbt.ts';
import { azAlt, dayPath, streetCircle, sunsetOf, poleOf } from './sky.ts';

const close = (a: number, b: number, tolerance = 1e-10, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what} ${a} versus ${b}`);
const turn = (a: number) => ((a + 540) % 360) - 180;
const rad = Math.PI / 180;
const angle = (a: readonly number[], b: readonly number[]) => Math.acos(Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * 180 / Math.PI;
const PLACE_KEYS = ['manhattan', 'chicago'] as const;

const sunFixture = JSON.parse(readFileSync(new URL('./fixtures/henge-sun.json', import.meta.url), 'utf8'));
type Row = [string, number, number];
const models = Object.fromEntries(PLACE_KEYS.map((p) => [p, henge(p)])) as Record<Place, ReturnType<typeof henge>>;

// ---------------------------------------------------------------- the real Sun, against Skyfield 1.55 with DE440s
test('Henge places are the OpenStreetMap nodes the oracle measured, with GeographicLib’s bearings and lengths', () => {
  assert.equal(sunFixture.versions.skyfield, '1.55');
  assert.equal(sunFixture.versions.ephemeris, 'de440s.bsp');
  assert.equal(sunFixture.versions.geographiclib, '2.1');
  close(REFRACTION, sunFixture.refraction, 1e-12, 'refraction');
  for (const place of PLACE_KEYS) {
    const p = sunFixture.places[place], where = PLACES[place];
    assert.equal(where.latitude, p.at.lat);
    assert.equal(where.longitude, p.at.lon);
    assert.equal(where.bearing, p.bearing);
    assert.equal(where.metres, p.metres);
  }
  // 42nd Street points 29.0° north of west; Randolph Street 0.2° south of it.
  close(PLACES.manhattan.bearing - 270, 29.0, 0.05);
  close(PLACES.chicago.bearing - 270, -0.23, 0.01);
});

test('Henge ephemeris matches Skyfield and DE440s at 74 instants, day and night, to 0.015°', () => {
  for (const place of PLACE_KEYS) {
    for (const row of sunFixture.places[place].instants as { utc: number; azimuth: number; altitude: number }[]) {
      const s = sunFrom(place, row.utc * 1000);
      close(s.altitude, row.altitude, 0.015, `${place} altitude at ${row.utc}`);
      // An azimuth error matters by how far round the sky it moves the Sun: scaled by cos(altitude).
      close(turn(s.azimuth - row.azimuth) * Math.cos(row.altitude * rad), 0, 0.015, `${place} azimuth at ${row.utc}`);
    }
  }
});

test('Henge half Sun and full Sun on every evening of 2026 match Skyfield’s to 5 s and 0.01°', () => {
  for (const place of PLACE_KEYS) {
    for (const kind of ['half', 'full'] as const) {
      const rows = sunFixture.places[place][kind] as Row[];
      assert.deepEqual(rows.map((r) => r[0]), DATES);
      for (const [date, utc, azimuth] of rows) {
        const m = moment(place, date, kind);
        close(m.utc / 1000, utc, 5, `${place} ${kind} time on ${date}`);
        close(m.azimuth, azimuth, 0.01, `${place} ${kind} azimuth on ${date}`);
      }
    }
  }
});

test('Henge alignment evenings are the oracle’s: 25 and 27 May, 15 and 16 July on 42nd Street; 18 and 19 March and 23 September on Randolph Street', () => {
  for (const place of PLACE_KEYS)
    for (const kind of ['half', 'full'] as const)
      assert.deepEqual(models[place].aligned[kind].map((m) => m.date), sunFixture.places[place].alignments[kind], `${place} ${kind}`);
  assert.deepEqual(models.manhattan.aligned.half.map((m) => m.date), ['2026-05-25', '2026-07-16']);
  assert.deepEqual(models.manhattan.aligned.full.map((m) => m.date), ['2026-05-27', '2026-07-15']);
  assert.deepEqual(models.chicago.aligned.half.map((m) => m.date), ['2026-03-18', '2026-09-23']);
  assert.deepEqual(models.chicago.aligned.full.map((m) => m.date), ['2026-03-19', '2026-09-23']);
  // On each, the Sun's centre is within a fifth of a degree of the street, inside the slot the far buildings leave.
  for (const place of PLACE_KEYS) {
    const slot = Math.atan(15.25 / PLACES[place].metres) / rad;
    for (const m of [...models[place].aligned.half, ...models[place].aligned.full]) assert.ok(Math.abs(m.azimuth - PLACES[place].bearing) < Math.min(0.25, slot), `${place} ${m.date}`);
  }
  assert.equal(clock('manhattan', models.manhattan.aligned.half[0]!.utc), '8:14 pm');
  assert.equal(clock('chicago', models.chicago.aligned.half[0]!.utc), '6:59 pm');
});

test('Henge Hayden Planetarium cross-check: at its four published 2026 minutes the Sun is just north of 42nd Street, and its dates are nearer the solstice than a flat horizon’s', () => {
  const bearing = PLACES.manhattan.bearing;
  for (const row of sunFixture.amnh as { date: string; kind: string; utc: number; azimuth: number; altitude: number }[]) {
    const s = sunFrom('manhattan', row.utc * 1000);
    close(s.azimuth, row.azimuth, 0.01, `${row.date} azimuth`);
    close(s.altitude, row.altitude, 0.01, `${row.date} altitude`);
    // Within half a solar diameter of the street, north of it, and within a degree of the horizon.
    assert.ok(s.azimuth - bearing > 0 && s.azimuth - bearing < 0.25, `${row.date}: ${s.azimuth - bearing}° from the street`);
    assert.ok(Math.abs(s.altitude) < 1, `${row.date}: altitude ${s.altitude}`);
  }
  // AMNH's half and full Sun evenings, against the model's: two to four days nearer the June solstice.
  const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
  const amnh = { half: ['2026-05-28', '2026-07-12'], full: ['2026-05-29', '2026-07-11'] };
  for (const kind of ['half', 'full'] as const) {
    const [may, july] = models.manhattan.aligned[kind];
    const toward = [days(may!.date, amnh[kind][0]!), days(amnh[kind][1]!, july!.date)];
    for (const d of toward) assert.ok(d >= 2 && d <= 4, `${kind}: ${toward}`);
  }
  // A horizon raised half a degree, as buildings or terrain beyond the street can raise it, moves the May dates onto AMNH's.
  for (const kind of ['half', 'full'] as const)
    assert.equal(aligned('manhattan', kind, DATES.map((date) => moment('manhattan', date, kind, 0.5)))[0]!.date, amnh[kind][0]);
});

test('Henge globe: the Sun sets toward the place it stands overhead, and the street carried on meets that place on the alignment evening', () => {
  fc.assert(fc.property(fc.integer({ min: Date.parse('2026-01-01'), max: Date.parse('2026-12-31') }), fc.constantFrom(...PLACE_KEYS), (utc, place) => {
    const s = sunFrom(place, utc), { latitude: p1, longitude: l1 } = PLACES[place], p2 = s.overhead.lat, dl = (s.overhead.lon - l1) * rad;
    // The initial great-circle bearing from the place to the point under the Sun, and the arc between them.
    const bearing = Math.atan2(Math.sin(dl) * Math.cos(p2 * rad), Math.cos(p1 * rad) * Math.sin(p2 * rad) - Math.sin(p1 * rad) * Math.cos(p2 * rad) * Math.cos(dl)) / rad;
    const arc = Math.acos(Math.sin(p1 * rad) * Math.sin(p2 * rad) + Math.cos(p1 * rad) * Math.cos(p2 * rad) * Math.cos(dl)) / rad;
    if (Math.abs(s.altitude) < 89) close(turn(s.azimuth - bearing), 0, 1e-8, 'azimuth is the bearing to the overhead point');
    // 90° less the altitude; the Sun's parallax, at most 8.8″, is the difference.
    close(arc, 90 - s.altitude, 0.003, 'arc');
  }), params(200));
  for (const place of PLACE_KEYS) {
    const m = models[place], first = m.aligned.half[0]!;
    // `meets` is a quarter-turn plus refraction along the street, where the ring of half-Sun points is.
    const ring = along(m.latitude, m.where.longitude, m.bearing, 90 + REFRACTION);
    close(ring.lat, m.meets.lat, 1e-12);
    // On the alignment evening the point under the Sun is within 0.2° of where the street meets the ring.
    const d = Math.acos(Math.sin(first.overhead.lat * rad) * Math.sin(m.meets.lat * rad) + Math.cos(first.overhead.lat * rad) * Math.cos(m.meets.lat * rad) * Math.cos((first.overhead.lon - m.meets.lon) * rad)) / rad;
    assert.ok(d < 0.2, `${place}: ${d}°`);
  }
  // The caption's latitude: 42nd Street meets the ring at 21.2° N, Randolph Street at 0.5° S.
  close(models.manhattan.meets.lat, 21.2, 0.05);
  close(models.chicago.meets.lat, -0.5, 0.05);
});

test('Henge street views: a week either side the Sun sets behind the buildings; the next evening it is partly out of the slot', () => {
  for (const place of PLACE_KEYS) {
    const m = models[place], { bearing, metres } = PLACES[place], slot = Math.atan(15.25 / metres) / rad;
    const ev = Object.fromEntries(m.evenings.map((e) => [e.role, e]));
    // The disc's edge past the slot's edge: on the walls.
    for (const r of ['before', 'after']) assert.ok(Math.abs(ev[r]!.azimuth - bearing) - ev[r]!.semidiameter > slot, `${place} ${r}`);
    assert.ok(Math.abs(ev.next!.azimuth - bearing) + ev.next!.semidiameter > slot, `${place} next evening`);
    // The other city's evening is far outside the five degrees the view shows.
    assert.ok(Math.abs(ev.other!.azimuth - bearing) > 25, `${place} other`);
  }
});

// ---------------------------------------------------------------- the idealised sky
test('Henge horizon coordinates match 48 independently captured ERFA vectors', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/henge-erfa.json', import.meta.url), 'utf8'));
  assert.equal(fixture.version, '2.0.1.5');
  assert.equal(fixture.rows.length, 48);
  for (const row of fixture.rows) {
    const value = sky(row.latitude, row.declination, row.hourAngle);
    // Azimuth at zenith is undefined: compare vectors there rather than impose an arbitrary bearing.
    close(value.altitude, row.altitude);
    if (Math.abs(row.altitude - 90) > 1e-8) close(((value.azimuth - row.azimuth + 540) % 360) - 180, 0);
  }
});

test('Henge geometry obeys the USNO spherical altitude formula over observer and sky angles', () => {
  fc.assert(fc.property(fc.double({ min: -89, max: 89, noNaN: true }), fc.double({ min: -89, max: 89, noNaN: true }),
    fc.double({ min: -180, max: 180, noNaN: true }), (latitude, dec, hour) => {
      const p = sky(latitude, dec, hour);
      close(Math.sin(p.altitude * rad), Math.cos(hour * rad) * Math.cos(dec * rad) * Math.cos(latitude * rad) + Math.sin(dec * rad) * Math.sin(latitude * rad));
      close(p.east * p.east + p.north * p.north + p.up * p.up, 1);
    }), params(200));
});

test('Henge idealised sweep crosses 42nd Street twice near the northern solstice and Randolph Street twice near the equinoxes', () => {
  close(declination(0), 0); close(declination(90), TILT); close(declination(180), 0); close(declination(270), -TILT);
  const ny = models.manhattan, chi = models.chicago;
  close(sunset(ny.latitude, 0).azimuth, 270);
  assert.equal(ny.ideal.length, 2); assert.equal(chi.ideal.length, 2);
  assert.ok(ny.ideal[0]! > 50 && ny.ideal[0]! < 90 && ny.ideal[1]! > 90 && ny.ideal[1]! < 130);
  // Randolph Street points 0.2° south of west, so it waits for a Sun just south of the equator: just before the
  // March equinox's longitude, in the turn's year, and just after September's.
  assert.ok(chi.ideal[0]! < 0 && chi.ideal[0]! > -1 && chi.ideal[1]! > 180 && chi.ideal[1]! < 181);
  for (const model of [ny, chi]) {
    assert.ok(model.ideal.every((c) => c > -90 && c <= 270), 'both crossings in the year the turn runs');
    for (const longitude of model.ideal) close(sunset(model.latitude, declination(longitude)).azimuth, model.bearing, 1e-9);
  }
  // The sky step says June's sunset lies a little north of 42nd Street and December's far south of it.
  assert.ok(ny.seasons[2]!.azimuth > ny.bearing && ny.seasons[2]!.azimuth - ny.bearing < 5);
  assert.ok(ny.seasons[0]!.azimuth < 270);
  assert.deepEqual(crossings(ny.latitude, 320), [], 'bearing beyond the northern extreme is never crossed');
});

test('Henge overhead view: 42nd Street aligns sunset only, Randolph Street sunrise and sunset on nearly the same days', () => {
  const ny = models.manhattan, chi = models.chicago;
  // Sunrise is the same path reached at the opposite hour: on any day it mirrors sunset across north.
  fc.assert(fc.property(fc.double({ min: -TILT, max: TILT, noNaN: true }), (d) => {
    close(sunrise(ny.latitude, d).azimuth, 360 - sunset(ny.latitude, d).azimuth, 1e-9);
    close(sunrise(ny.latitude, d).altitude, 0, 1e-9);
  }), params(100));
  close(ny.alignment.sunset, ny.bearing);
  close(ny.alignment.back, ny.bearing - 180);
  close(ny.alignment.sunrise, 360 - ny.bearing, 1e-9);
  // The map says sunrise misses the street's other end by about 58 degrees, north of east against south of east.
  const miss = ny.alignment.back - ny.alignment.sunrise;
  assert.ok(miss > 57.9 && miss < 58.2, `miss ${miss}`);
  assert.ok(ny.alignment.sunrise < 90 && ny.alignment.back > 90);
  // That end faces sunrise on two winter mornings, either side of the December solstice (longitude 270).
  assert.equal(ny.backCrossings.length, 2);
  assert.ok(ny.backCrossings[0]! > 180 && ny.backCrossings[0]! < 270 && ny.backCrossings[1]! > 270 && ny.backCrossings[1]! < 360);
  for (const longitude of ny.backCrossings) close(sunrise(ny.latitude, declination(longitude)).azimuth, ny.alignment.back, 1e-9);
  // Randolph Street: the alignment day's Sun rises within half a degree of the street's other end.
  assert.ok(Math.abs(chi.alignment.back - chi.alignment.sunrise) < 0.5);
});

test('Henge dome: each day’s path is the model’s sky() on a circle about the celestial pole, ending on the horizon at the model’s sunset', () => {
  for (const model of [models.manhattan, models.chicago]) {
    const latitude = model.latitude;
    for (const side of ['outside', 'inside'] as const) {
      const pole = poleOf(latitude, side);
      // The pole stands the latitude's degrees above the north point.
      close(angle(pole, azAlt(0, 0, side)), latitude, 1e-9);
      fc.assert(fc.property(fc.double({ min: -TILT, max: TILT, noNaN: true }), (d) => {
        const s = sunset(latitude, d), path = dayPath(latitude, d, -s.hourAngle, s.hourAngle, side);
        for (const p of path) close(angle(p, pole), 90 - d, 1e-6);
        const end = path.at(-1)!;
        close(angle(end, [0, 0, 1]), 90, 1e-6);
        close(angle(end, azAlt(s.azimuth, 0, side)), 0, 1e-5);
      }), params(100));
    }
    // An alignment is a day's circle meeting the horizon where the street's circle does.
    const foot = streetCircle(model.bearing, 'outside')[0]!;
    for (const longitude of model.ideal) close(angle(sunsetOf(sunset(latitude, declination(longitude)), 'outside'), foot), 0, 1e-5);
  }
});
