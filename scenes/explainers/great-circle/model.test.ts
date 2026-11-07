import { test } from 'node:test';
import { seenFrom, depthOrder, latLon } from '../../../explain/geo.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AIRPORTS, RADIUS_KM, haversine, initialBearing, pole, vertex, highest, greatCircle, rhumb, rhumbLine, northing, stretch, overflies, landAt, london, madrid, tens } from './model.ts';
import type { Place } from './model.ts';
import type { VMobject } from '../../../src/index.ts';
import { fc, params } from '../lib/pbt.ts';

const D = Math.PI / 180;

const close = (a: number, b: number, tolerance: number, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what} ${a} versus ${b}`);

const fixture = JSON.parse(readFileSync(new URL('./fixtures/great-circle-geodesic.json', import.meta.url), 'utf8'));

/** The spherical law of cosines: a second formula for the same distance, independent of the haversine. */
const cosines = (a: Place, b: Place) => RADIUS_KM * Math.acos(Math.sin(a.lat * D) * Math.sin(b.lat * D) + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.cos((b.lon - a.lon) * D));

const places = fc.record({ lat: fc.double({ min: -85, max: 85, noNaN: true }), lon: fc.double({ min: -180, max: 180, noNaN: true }) });

test('the model uses the airports and the 6,371 km sphere the fixture was solved on', () => {
  assert.equal(RADIUS_KM, fixture.radiusKm);
  for (const [code, [lat, lon]] of Object.entries(fixture.airports as Record<string, [number, number]>)) {
    assert.equal(AIRPORTS[code as keyof typeof AIRPORTS].lat, lat);
    assert.equal(AIRPORTS[code as keyof typeof AIRPORTS].lon, lon);
  }
});

test('route distances, bearings and highest points match GeographicLib on the sphere and the law of cosines', () => {
  for (const row of fixture.rows as { route: string; sphere: { km: number; azimuth: number; top: Place }; wgs84: { km: number } }[]) {
    const [from, to] = row.route.split('-') as [keyof typeof AIRPORTS, keyof typeof AIRPORTS];
    const a = AIRPORTS[from], b = AIRPORTS[to];
    close(haversine(a, b), row.sphere.km, 1e-6, `${row.route} km`);
    close(cosines(a, b), row.sphere.km, 1e-6, `${row.route} km by cosines`);
    close(initialBearing(a, b), row.sphere.azimuth, 1e-9, `${row.route} bearing`);
    // The fixture samples the solved geodesic 20,000 times; the model solves for the vertex.
    const top = highest(a, b);
    close(top.lat, row.sphere.top.lat, 1e-6, `${row.route} highest latitude`);
    close(top.lon, row.sphere.top.lon, 0.02, `${row.route} highest point's longitude`);
    // Clairaut: along a great circle cos(latitude)·sin(bearing) is constant, so cos φmax = |sin θ cos φ1|.
    close(Math.cos(top.lat * D), Math.abs(Math.sin(initialBearing(a, b) * D) * Math.cos(a.lat * D)), 1e-12, 'Clairaut');
    // The flattened Earth changes the distance by a fraction of a per cent (the notes: under 0.6%).
    const change = row.wgs84.km / row.sphere.km - 1;
    assert.ok(change > 0 && change < 0.006, `${row.route}: ellipsoid changes the distance by ${(change * 100).toFixed(2)}%`);
  }
});

test('the rhumb line’s length matches walking it in small steps, and Mercator draws it straight', () => {
  for (const [a, b] of [[AIRPORTS.LHR, AIRPORTS.LAX], [AIRPORTS.MAD, AIRPORTS.JFK]] as const) {
    const steps = rhumbLine(a, b, 20000);
    const walked = steps.slice(1).reduce((sum, p, i) => sum + haversine(steps[i]!, p), 0);
    close(rhumb(a, b).km, walked, 0.01, 'rhumb length');
    // One heading all the way: every step sets off on the same bearing.
    for (const i of [0, 5000, 10000, 19999]) close(initialBearing(steps[i]!, steps[i + 1]!), rhumb(a, b).heading, 0.01, 'constant heading');
  }
});

test('the script’s numbers, as the model rounds them', () => {
  const L = london(), M = madrid();
  assert.equal(tens(L.km), '8,760');
  assert.equal(tens(L.rhumbKm), '9,730');
  assert.equal(tens(L.extraKm), '970');
  assert.equal(Math.round(L.top.lat), 62);
  assert.equal(L.stretch.from.toFixed(1), '1.6');
  assert.ok(L.stretch.top > 1.9 && L.stretch.top < 2.3, `about twice: ${L.stretch.top}`);
  assert.equal(L.stretch.top.toFixed(1), '2.1');
  assert.equal(tens(M.rhumbKm), '5,930');
  assert.equal(tens(M.km), '5,760');
  assert.equal(Math.round(M.top.lat), 46);
  assert.equal(tens(M.rhumbKm - M.km), '170');
  // Leaves Heathrow heading north-west; the ruler heads west-south-west; Madrid's great circle starts
  // west-north-west, while due west from Madrid is within a fifth of a degree of west.
  const point = (deg: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(deg / 22.5) % 16];
  assert.equal(point(L.bearing), 'NW');
  assert.equal(point(L.heading), 'WSW');
  assert.equal(point(M.bearing), 'WNW');
  close(M.heading, 270, 0.2, 'due west');
  // Mercator's stretch is sec φ: the rate its northing grows, which equals its east–west scale.
  for (const lat of [0, 33.9, 51.47, 62.27]) close((northing(lat + 1e-6) - northing(lat - 1e-6)) / (2e-6 * D), stretch(lat), 1e-6, `stretch at ${lat}`);
});

test('the route crosses Great Britain, Ireland, southern Greenland at its highest point, and Hudson Bay', () => {
  const L = london();
  const runs = overflies(greatCircle(L.from, L.to, 400));
  const over = runs.map((r) => r.over);
  assert.deepEqual(over, ['Great Britain', null, 'Ireland', null, 'Greenland', null, 'North America', null, 'North America']);
  const greenland = runs.find((r) => r.over === 'Greenland')!;
  // Greenland spans about 60° N to 83° N; the route is over its southern part, and peaks there.
  assert.ok(greenland.from.lat < 65 && greenland.to.lat < 65);
  assert.ok(L.top.lon <= greenland.from.lon && L.top.lon >= greenland.to.lon, 'the highest point is over Greenland');
  assert.equal(landAt(L.top), 'Greenland');
  // Hudson Bay: the sea between two stretches of North America, inside 51–64° N, 77–95° W.
  const bay = runs[7]!;
  assert.equal(bay.over, null);
  for (const p of [bay.from, bay.to]) assert.ok(p.lat > 51 && p.lat < 64 && p.lon > -95 && p.lon < -77, JSON.stringify(p));
  // North of both cities until Greenland, then south all the way to California.
  const path = greatCircle(L.from, L.to, 400), peak = path.findIndex((p) => p.lon < L.top.lon);
  assert.ok(path.slice(peak).every((p, i, rest) => i === 0 || p.lat < rest[i - 1]!.lat));
  // The ruler's line never reaches Greenland.
  assert.ok(!overflies(rhumbLine(L.from, L.to, 400)).some((r) => r.over === 'Greenland'));
});

test('Mercator stretches north–south as much as east–west, so headings stay true', () => {
  fc.assert(fc.property(fc.double({ min: -80, max: 80, noNaN: true }), fc.double({ min: 0, max: 359, noNaN: true }), (lat, heading) => {
    // A short step on the sphere at this heading, and the same step on the map: the map's angle is the heading.
    const step = 1e-4, dLat = step * Math.cos(heading * D), dLon = (step * Math.sin(heading * D)) / Math.cos(lat * D);
    const east = dLon * D, north = northing(lat + dLat) - northing(lat);
    close(((Math.atan2(east, north) / D - heading + 540) % 360) - 180, 0, 1e-3, 'heading on the map');
    // The map draws a parallel of radius R cos φ as wide as the equator, a sideways stretch of sec φ;
    // its northing grows at the same rate, which is what keeps the angle.
    close((northing(lat + 1e-6) - northing(lat - 1e-6)) / (2e-6 * D), stretch(lat), 1e-5 * stretch(lat), 'north–south stretch');
  }), params(300));
});

test('no route between two places is shorter than the great circle', () => {
  fc.assert(fc.property(places, places, places, (a, b, c) => {
    const direct = haversine(a, b);
    // Near the antipodes every route is nearly as short, and the formulas' last digits blur.
    fc.pre(direct < 19000);
    assert.ok(direct <= haversine(a, c) + haversine(c, b) + 1e-6, 'a detour through a third place');
    assert.ok(direct <= rhumb(a, b).km + 1e-6, 'the rhumb line');
  }), params(500));
});

test('the string lies in one plane through the centre', () => {
  fc.assert(fc.property(places, places, (a, b) => {
    fc.pre(haversine(a, b) > 10 && haversine(a, b) < 19000);
    const n = pole(a, b);
    for (const p of greatCircle(a, b, 40)) {
      const v = latLon(p.lat, p.lon);
      close(n[0] * v[0] + n[1] * v[1] + n[2] * v[2], 0, 1e-9, 'off the sheet');
    }
    // Its highest latitude is the angle between the sheet's pole and the Earth's axis.
    close(vertex(a, b).lat, Math.acos(n[2]) / D, 1e-6, 'vertex');
  }), params(300));
});

test('lines of latitude are smaller circles', () => {
  fc.assert(fc.property(fc.integer({ min: -85, max: 85 }), fc.integer({ min: 1, max: 179 }), (lat, dLon) => {
    fc.pre(lat !== 0);
    // A parallel's radius is R cos φ, smaller than the Earth's; its centre is on the axis, not at the middle.
    assert.ok(RADIUS_KM * Math.cos(lat * D) < RADIUS_KM);
    // So following it is longer than the great circle between the same two places.
    const along = RADIUS_KM * Math.cos(lat * D) * dLon * D;
    assert.ok(along > haversine({ lat, lon: 0 }, { lat, lon: dLon }));
  }), params(300));
});

test('the gnomonic map draws every great circle straight', () => {
  fc.assert(fc.property(places, places, (a, b) => {
    // Two places nearly opposite have no one shortest route between them, so none to draw.
    fc.pre(haversine(a, b) > 200 && haversine(a, b) < 19000);
    const vp = { kind: 'gnomonic' as const, yaw: -58, pitch: 50, limit: 51 };
    const g = seenFrom({ body: { radius: 1, fill: 'none', stroke: '#000' }, parts: [{ kind: 'path', key: 'arc', lines: [greatCircle(a, b, 200).map((p) => latLon(p.lat, p.lon))], color: '#000' }] }, vp, { scale: 2.75 });
    assert.equal(depthOrder(g), true);
    for (const s of (g.children.find((m) => m.key === 'arc') as VMobject).subpaths) {
      const pts = Array.from({ length: (s.length - 2) / 6 + 1 }, (_, i) => [s[6 * i]!, s[6 * i + 1]!] as const);
      const [x0, y0] = pts[0]!, [x1, y1] = pts.at(-1)!, len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 0.01) continue;
      for (const [x, y] of pts) assert.ok(Math.abs((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) / len < 2e-3);
    }
  }), params(300));
});

test('the ruler line is the shortest only along the equator or a meridian', () => {
  // Along the equator or a meridian, one heading is a great circle: the two lengths agree.
  for (const [a, b] of [[{ lat: 0, lon: -75 }, { lat: 0, lon: -15 }], [{ lat: -25, lon: 10 }, { lat: 25, lon: 10 }], [{ lat: 0, lon: 170 }, { lat: 0, lon: -170 }]])
    close(rhumb(a!, b!).km, haversine(a!, b!), 1e-6, 'equator or meridian');
  // Anywhere else the ruler's line is longer.
  fc.assert(fc.property(fc.integer({ min: -80, max: 80 }), fc.integer({ min: -80, max: 80 }), fc.integer({ min: 1, max: 179 }), (lat1, lat2, dLon) => {
    fc.pre(lat1 !== 0 || lat2 !== 0);
    // Short routes near the equator differ by a fraction of a millimetre, still far above the arithmetic's rounding.
    const direct = haversine({ lat: lat1, lon: 0 }, { lat: lat2, lon: dLon });
    assert.ok(rhumb({ lat: lat1, lon: 0 }, { lat: lat2, lon: dLon }).km > direct * (1 + 1e-11));
  }), params(500));
});
