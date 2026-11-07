import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sky, declination, sunset, sunrise, crossings, henge, TILT, LATITUDE, STREET, SUN_RADIUS } from './model.ts';
import { fc, params } from '../lib/pbt.ts';
import { onSphere, azAlt, dayPath, streetCircle, sunsetOf } from './sky.ts';

const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} versus ${b}`);

const dayOf = (longitude: number) => { const d = sunset(declination(longitude)); return { declination: d.declination, hourAngle: d.hourAngle, azimuth: d.azimuth }; };

const angle = (a: readonly number[], b: readonly number[]) => Math.acos(Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * 180 / Math.PI;

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
  const r = Math.PI / 180;
  fc.assert(fc.property(fc.double({min:-89,max:89,noNaN:true}), fc.double({min:-89,max:89,noNaN:true}),
    fc.double({min:-180,max:180,noNaN:true}), (latitude, dec, hour) => {
      const p = sky(latitude, dec, hour);
      close(Math.sin(p.altitude*r), Math.cos(hour*r)*Math.cos(dec*r)*Math.cos(latitude*r)+Math.sin(dec*r)*Math.sin(latitude*r));
      close(p.east*p.east+p.north*p.north+p.up*p.up,1);
    }),params(200));
});

test('Henge annual sweep crosses Manhattan twice near the northern solstice and due west at equinoxes', () => {
  close(declination(0),0); close(declination(90),TILT); close(declination(180),0); close(declination(270),-TILT);
  close(sunset(0).azimuth,270);
  const ny = henge('manhattan'), west = henge('west');
  assert.equal(ny.half.length,2); assert.equal(west.half.length,2);
  assert.ok(ny.half[0]!>50&&ny.half[0]!<90); assert.ok(ny.half[1]!>90&&ny.half[1]!<130);
  close(west.half[0]!,0); close(west.half[1]!,180);
  assert.deepEqual(west.annual,ny.annual, 'rotating the street must not change the sky');
  for (const model of [ny,west]) {
    for (const longitude of model.half) close(sunset(declination(longitude)).azimuth,model.bearing);
    assert.ok(model.full[0]!>model.half[0]!, 'northward sweep: full after half');
    assert.ok(model.full[1]!<model.half[1]!, 'southward sweep: full before half');
  }
  // The disc step says how far apart half and full Sun fall at the mean orbital rate: about one evening to the next
  // at Manhattan's bearing, under half a day due west, where the declination changes fastest.
  for (const model of [ny,west]) {
    close(model.gapDays,(model.full[0]!-model.half[0]!)*365.2422/360);
    close(model.gapDays,(model.half[1]!-model.full[1]!)*365.2422/360);
  }
  assert.ok(ny.gapDays>1&&ny.gapDays<1.5,`Manhattan: ${ny.gapDays} days`);
  assert.ok(west.gapDays>0&&west.gapDays<0.5,`due west: ${west.gapDays} days`);
  // The paths step says June's sunset lies a little north of Manhattan's street and December's far south of it.
  assert.ok(ny.seasons[2]!.azimuth>STREET&&ny.seasons[2]!.azimuth-STREET<5);
  assert.ok(ny.seasons[0]!.azimuth<270);
  assert.deepEqual(crossings(320),[], 'bearing beyond the northern extreme is never crossed');
  // Independent USNO inverse relation at full-disc height, not just the horizon-specialised sunset function.
  for (const longitude of ny.full) {
    const d=declination(longitude)*Math.PI/180,p=LATITUDE*Math.PI/180,a=SUN_RADIUS*Math.PI/180;
    close(Math.sin(d),Math.sin(p)*Math.sin(a)+Math.cos(p)*Math.cos(a)*Math.cos(STREET*Math.PI/180));
  }
});

test('Henge overhead view: Manhattan aligns sunset only, a due-west street aligns sunrise and sunset on the same days', () => {
  const ny = henge('manhattan'), west = henge('west');
  // Sunrise is the same path reached at the opposite hour: on any day it mirrors sunset across north.
  fc.assert(fc.property(fc.double({min:-TILT,max:TILT,noNaN:true}), (d) => {
    close(sunrise(d).azimuth, 360 - sunset(d).azimuth, 1e-9);
    close(sunrise(d).altitude, 0, 1e-9);
  }), params(100));
  close(ny.alignment.sunset, STREET);
  close(ny.alignment.back, STREET - 180);
  close(ny.alignment.sunrise, 360 - STREET, 1e-9);
  // The map says sunrise misses the street's other end by about 58 degrees, north of east against south of east.
  const miss = ny.alignment.back - ny.alignment.sunrise;
  assert.ok(miss > 58 && miss < 58.5, `miss ${miss}`);
  assert.ok(ny.alignment.sunrise < 90 && ny.alignment.back > 90);
  // That end faces sunrise on two winter mornings, either side of the December solstice (longitude 270).
  assert.equal(ny.backCrossings.length, 2);
  assert.ok(ny.backCrossings[0]! > 180 && ny.backCrossings[0]! < 270 && ny.backCrossings[1]! > 270 && ny.backCrossings[1]! < 360);
  for (const longitude of ny.backCrossings) close(sunrise(declination(longitude)).azimuth, ny.alignment.back, 1e-9);
  // Due west: the equinox Sun rises due east, up the street's other end, on the alignment days themselves.
  close(west.alignment.sunrise, 90, 1e-9);
  close(west.alignment.back, 90);
  assert.deepEqual(west.backCrossings, west.half);
});

test('Henge dome: each day’s path is the model’s sky() on a circle about the celestial pole, ending on the horizon at the model’s sunset', () => {
  for (const side of ['outside', 'inside'] as const) {
    const pole = onSphere(sky(LATITUDE, 90, 0), side);
    // The pole stands LATITUDE degrees above the north point.
    close(angle(pole, azAlt(0, 0, side)), LATITUDE, 1e-9);
    fc.assert(fc.property(fc.double({ min: -TILT, max: TILT, noNaN: true }), (d) => {
      const s = sunset(d), path = dayPath(d, -s.hourAngle, s.hourAngle, side);
      for (const p of path) close(angle(p, pole), 90 - d, 1e-6);
      const end = path.at(-1)!;
      close(angle(end, [0, 0, 1]), 90, 1e-6);
      close(angle(end, azAlt(s.azimuth, 0, side)), 0, 1e-5);
    }), params(100));
  }
  // An alignment is a day's circle meeting the horizon where the street's circle does.
  for (const model of [henge('manhattan'), henge('west')]) {
    const foot = streetCircle(model.bearing, 'outside')[0]!;
    for (const longitude of model.half) close(angle(sunsetOf(dayOf(longitude), 'outside'), foot), 0, 1e-5);
  }
});
