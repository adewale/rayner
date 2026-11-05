import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sky, declination, sunset, sunrise, crossings, henge, TILT, LATITUDE, STREET, SUN_RADIUS } from '../scenes/explainers/lib/henge.ts';
import { fc, params } from './lib/pbt.ts';
import { collectProject, defaultScenario } from '../tools/lib/explain-project.ts';
import { check as checkHengeScene } from './lib/fidelity/henge.ts';
import { Scene, Transform } from '../src/index.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Mobject, VMobject, Sink, View } from '../src/index.ts';
import { depthOrder, project } from '../explain/drawing.ts';
import type { Seen } from '../explain/drawing.ts';
import { onSphere, azAlt, dayPath, streetCircle, sunsetOf, dome, year, crossedBy, look, lookView, globes } from '../scenes/explainers/henge/sky.ts';
import { assertViewFollowsState } from './lib/view-fidelity.ts';

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
test('Henge both street scenarios expose their geometry at all eight resting steps', async () => {
  const project=await collectProject('scenes/explainers/henge',{write:false});
  assert.equal(project.scenarios.length,2);
  assert.deepEqual(project.scenarios.map(scenario => scenario.values.street).sort(), ['manhattan', 'west']);
  for (const scenario of project.scenarios) {
    checkHengeScene(scenario.values, scenario.trace);
  }
});

// ---------------------------------------------------------------- the 3D pictures (scenes/explainers/henge/sky.ts)
await loadFonts();
const dayOf = (longitude: number) => { const d = sunset(declination(longitude)); return { declination: d.declination, hourAngle: d.hourAngle, azimuth: d.azimuth }; };
const angle = (a: readonly number[], b: readonly number[]) => Math.acos(Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * 180 / Math.PI;
type Piece = Mobject & { seen?: Seen };
const piece = (g: Mobject, key: string) => g.family().find((m) => m.key === key) as Piece | undefined;
/** The look step's camera, as the scene moves it: pitch 78° to 3°, the lens narrowing from 2.4 to 6.5 units per radian. */
function eye(street: 'manhattan' | 'west', t: number) {
  const model = henge(street), { declination, hourAngle } = dayOf(model.half[0]!);
  return { bearing: model.bearing, pitch: 78 + (3 - 78) * t, scale: 2.4 * (6.5 / 2.4) ** t, day: { declination, hourAngle } };
}
/** A piece's drawn anchors, all subpaths together. */
const anchors = (m: Mobject) => (m as VMobject).subpaths.flatMap((a) => Array.from({ length: (a.length - 2) / 6 + 1 }, (_, i) => [a[i * 6]!, a[i * 6 + 1]!] as const));
/** How far the drawn points stray from the line through the first and last. */
function offLine(points: readonly (readonly [number, number])[]): number {
  const a = points[0]!, b = points.at(-1)!, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return Math.max(...points.map((q) => Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / length));
}
const sink: Sink = { async frame() {} };
const bare = () => new (class extends Scene { override async construct() {} })(sink);

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

test('Henge dome and year are drawn in depth order at every longitude; a day circle drawn in front where the dome hides it fails (a deliberate defect)', () => {
  for (const model of [henge('manhattan'), henge('west')]) {
    const days = model.seasons.map(({ declination, hourAngle, azimuth }) => ({ declination, hourAngle, azimuth }));
    assert.equal(depthOrder(dome({ bearing: model.bearing, days })), true);
    const start = { bearing: model.bearing, start: -90, longitude: -90, crossings: model.half };
    for (let i = 0; i <= 72; i++) assert.equal(depthOrder(year({ ...start, longitude: -90 + 5 * i }, dayOf)), true, `${model.street}, longitude ${-90 + 5 * i}`);
    // The sunset passes the street twice a year: on the way north and on the way back.
    assert.deepEqual([-90, 0, 90, 180, 270].map((longitude) => crossedBy({ ...start, longitude })), model.street === 'manhattan' ? [0, 0, 1, 2, 2] : [0, 1, 1, 2, 2]);
  }
  // The defect: June's path, whose noon lies on the far side of the dome, drawn in front of it.
  const model = henge('manhattan');
  const picture = dome({ bearing: model.bearing, days: model.seasons.map(({ declination, hourAngle, azimuth }) => ({ declination, hourAngle, azimuth })) });
  const seen = picture.family().find((m) => m.key === 'henge-dome:seen')!;
  const hidden = piece(seen, 'henge-dome:june:day:hidden')!;
  assert.ok(hidden.seen!.lines.length > 0, 'part of June’s path is behind the dome');
  hidden.seen!.layer = 'surface';
  seen.remove(hidden);
  const body = seen.children.findIndex((m) => m.key === 'henge-dome:body');
  seen.children.splice(body + 1, 0, hidden);
  hidden.parent = seen;
  assert.match(depthOrder(picture) as string, /^henge-dome:june:day is drawn in front from orthographic .*, but part of it is on the far side of the body/);
});

test('Henge street view from the centre: the street’s circle and the horizon stay straight at every pitch, the alignment sunset sits where the street points, and a move by morph fails (a deliberate defect)', () => {
  for (const street of ['manhattan', 'west'] as const) {
    for (let i = 0; i <= 40; i++) {
      const st = eye(street, i / 40), g = look(st, '#ffffff', { day: 'May' });
      assert.equal(depthOrder(g), true, `${street}, frame ${i}`);
      for (const key of ['henge-look:street', 'henge-look:horizon']) {
        const p = piece(g, key)!;
        if (p.seen!.lines.flat().length < 3) continue;
        assert.ok(offLine(anchors(p)) < 1e-4, `${key} is straight at pitch ${st.pitch}`); // anchors are stored as 32-bit floats
      }
    }
    // At street level the Sun's centre is on the horizon, straight down the street.
    const end = eye(street, 1), vp = lookView(end.bearing, end.pitch), o = { at: [0, 0] as [number, number], scale: end.scale };
    const sun = project(sunsetOf(end.day, 'inside'), vp, 1, o);
    assert.ok(sun.seen);
    close(sun.at[0], 0, 1e-6);
    close(sun.at[1], project(azAlt(end.bearing, 0, 'inside'), vp, 1, o).at[1], 1e-6);
  }
  // The defect: the camera moved by morphing its first picture into its last, not by a Follow over the pitch.
  const first = look(eye('manhattan', 0), '#ffffff', { day: 'May' }), last = look(eye('manhattan', 1), '#ffffff', { day: 'May' });
  bare().add(first);
  const morph = new Transform(first, last);
  morph.begin();
  morph.interpolate(0.5);
  assert.equal(typeof depthOrder(first), 'string', 'a half-morphed street view is drawn from no viewpoint');
  // The year's turn by morph fails the same way: drawn from no day's circle.
  const model = henge('manhattan'), start = { bearing: model.bearing, start: -90, longitude: -90, crossings: model.half };
  const a = year(start, dayOf), b = year({ ...start, longitude: 90 }, dayOf);
  bare().add(a);
  const turn = new Transform(a, b);
  turn.begin();
  turn.interpolate(0.5);
  assert.equal(typeof depthOrder(a), 'string', 'a half-morphed year is drawn from no viewpoint’s rules');
});

test('Henge globes: the gold arc of New York’s daily circle is exactly its sunlit part and the dark arc its night, cut at the model’s sunset hour angle; the axis is dashed inside Earth', () => {
  const model = henge('manhattan'), [december, , june] = model.seasons;
  const g = globes({ tilt: model.tilt, latitude: model.latitude, june: june!, december: december! });
  assert.equal(depthOrder(g), true);
  const t = TILT * Math.PI / 180, axis = [Math.sin(t), 0, Math.cos(t)];
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  /** Every point drawn for a part, in sight or behind Earth. */
  const drawn = (key: string) => [piece(g, key)!, piece(g, `${key}:hidden`)!].flatMap((p) => p.seen!.lines.flat());
  // June's Earth is left of the Sun, which lies along +x from it; December's is right, the Sun along -x.
  for (const [season, sun, d] of [['june', [1, 0, 0], june!], ['december', [-1, 0, 0], december!]] as const) {
    const day = drawn(`henge-earth:${season}:day`), night = drawn(`henge-earth:${season}:night`);
    assert.ok(day.length > 10 && night.length > 10);
    // On New York's circle: the points seenFrom adds where a piece crosses the limb lie on the 3° chord between two, lifted to the sphere.
    for (const p of [...day, ...night]) close(Math.asin(dot(p, axis)) * 180 / Math.PI, LATITUDE, 0.01);
    // Gold is in sunlight and dark in night; both reach the terminator, at sunset and sunrise.
    assert.ok(day.every((p) => dot(p, sun) > -1e-12) && night.every((p) => dot(p, sun) < 1e-12));
    close(Math.min(...day.map((p) => Math.abs(dot(p, sun)))), 0, 1e-12);
    // The share of the circle in sunlight is the share of the Sun's day circle above the horizon, 2H/360.
    // Each point's angle round the axis from noon: noon faces the Sun as far as the axis allows; y is east or west of it.
    const k = dot(sun, axis), noon = [sun[0] - k * axis[0]!, sun[1] - k * axis[1]!, sun[2] - k * axis[2]!].map((v) => v / Math.sqrt(1 - k * k));
    const along = (p: readonly number[]) => Math.atan2(dot(p, [0, 1, 0]), dot(p, noon));
    const span = Math.max(...day.map(along)) - Math.min(...day.map(along));
    close(span * 180 / Math.PI, 2 * d.hourAngle, 1e-6);
    // In June the north leans sunward, in December away, with one axis direction.
    assert.equal(dot(axis, sun) > 0, season === 'june');
  }
  assert.ok(june!.hourAngle > 90 && december!.hourAngle < 90, 'more than half the circle is in sunlight in June, less in December');
  // The axis inside Earth is seen through it, dashed: drawn before the body, never in front.
  const inside = piece(g, 'henge-earth:june:axis:hidden')!, front = piece(g, 'henge-earth:june:axis')!;
  assert.ok(inside.seen!.lines.length === 1 && front.seen!.lines.length === 0);
  assert.equal(inside.style.dashArray, '0.1 0.08');
});

test('Henge the year and the camera are views of their step’s state', async () => {
  const project = await collectProject('scenes/explainers/henge', { write: false });
  const { Scene: S } = defaultScenario(project);
  for (const key of ['henge-year', 'henge-look']) {
    let found: View | undefined;
    const checked = await assertViewFollowsState(S, (scene) => {
      found ??= scene.mobjects.find((m) => (m as View).draw && (m as View).current?.key === key) as View | undefined;
      return found && scene.mobjects.includes(found) ? found : null;
    });
    assert.equal(checked, 1, key);
  }
});
