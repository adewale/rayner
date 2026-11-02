import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sky, declination, sunset, crossings, henge, TILT, LATITUDE, STREET, SUN_RADIUS } from '../scenes/explainers/lib/henge.ts';
import { fc, params } from './lib/pbt.ts';
import { collectProject } from '../tools/lib/explain-project.ts';
import { check as checkHengeScene } from './lib/fidelity/henge.ts';

const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} versus ${b}`);
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
  assert.deepEqual(crossings(320),[], 'bearing beyond the northern extreme is never crossed');
  // Independent USNO inverse relation at full-disc height, not just the horizon-specialised sunset function.
  for (const longitude of ny.full) {
    const d=declination(longitude)*Math.PI/180,p=LATITUDE*Math.PI/180,a=SUN_RADIUS*Math.PI/180;
    close(Math.sin(d),Math.sin(p)*Math.sin(a)+Math.cos(p)*Math.cos(a)*Math.cos(STREET*Math.PI/180));
  }
});
test('Henge both street cases expose their geometry at all six resting steps', async () => {
  const project=await collectProject('scenes/explainers/henge',{write:false});
  assert.equal(project.variants.length,2);
  assert.deepEqual(project.variants.map(variant => variant.values.street).sort(), ['manhattan', 'west']);
  for (const variant of project.variants) {
    checkHengeScene(variant.values, variant.trace);
  }
});
