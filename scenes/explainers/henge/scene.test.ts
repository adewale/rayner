import { test } from 'node:test';
import type { SeenPiece } from '../../../explain/geo.ts';
import { depthOrder, project } from '../../../explain/geo.ts';
import type { View } from '../../../explain/index.ts';
import { stage } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { declination, sunset, henge, TILT, REFRACTION, PLACES, dayName } from './model.ts';
import type { Place } from './model.ts';
import Henge from './scene.ts';
import { check as checkHengeScene } from './fidelity.ts';
import { Scene, Transform } from '../../../src/index.ts';
import { loadFonts, loadProject, assertViewFollowsState, sampleAnimation } from '../../../explain/testing.ts';
import type { Mobject, VMobject, Sink } from '../../../src/index.ts';
import { azAlt, sunsetOf, dome, year, crossedBy, look, lookView, globes } from './sky.ts';
import { streetView, lensOf, globe, globeView, halfAndFull, WIDE } from './place.ts';
import { latLon } from '../../../explain/geo.ts';

const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} versus ${b}`);

const dayAt = (latitude: number) => (longitude: number) => { const d = sunset(latitude, declination(longitude)); return { latitude, declination: d.declination, hourAngle: d.hourAngle, azimuth: d.azimuth }; };

type Piece = Mobject & { seen?: SeenPiece };

const piece = (g: Mobject, key: string) => g.family().find((m) => m.key === key) as Piece | undefined;

/** The look step's camera, as the scene moves it: pitch 78° to 3°, the lens narrowing from 2.4 to 6.5 units per radian. */
function eye(place: Place, t: number) {
  const model = henge(place), { latitude, declination, hourAngle } = dayAt(model.latitude)(model.ideal[0]!);
  return { bearing: model.bearing, pitch: 78 + (3 - 78) * t, scale: 2.4 * (6.5 / 2.4) ** t, day: { latitude, declination, hourAngle } };
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

test('Henge both place scenarios expose their geometry at all ten resting steps', async () => {
  const project=await loadProject(Henge,'scenes/explainers/henge');
  assert.equal(project.scenarios.length,2);
  assert.deepEqual(project.scenarios.map(scenario => scenario.values.place).sort(), ['chicago', 'manhattan']);
  for (const scenario of project.scenarios) {
    checkHengeScene(scenario.trace, scenario.values);
  }
});

// ---------------------------------------------------------------- the 3D pictures (scenes/explainers/henge/sky.ts)
await loadFonts();
/** A stage for the pictures' text, on a scene of its own. */
const s = stage(bare());

test('Henge dome and year are drawn in depth order at every longitude; a day circle drawn in front where the dome hides it fails (a deliberate defect)', () => {
  for (const model of [henge('manhattan'), henge('chicago')]) {
    const days = model.seasons.map(({ latitude, declination, hourAngle, azimuth }) => ({ latitude, declination, hourAngle, azimuth }));
    assert.equal(depthOrder(dome({ bearing: model.bearing, latitude: model.latitude, city: model.where.city, days }, s.drawing)), true);
    const start = { bearing: model.bearing, latitude: model.latitude, start: -90, longitude: -90, crossings: model.ideal };
    for (let i = 0; i <= 72; i++) assert.equal(depthOrder(year({ ...start, longitude: -90 + 5 * i }, dayAt(model.latitude), s.drawing)), true, `${model.place}, longitude ${-90 + 5 * i}`);
    // The sunset passes the street twice a year: on the way north and on the way back.
    assert.deepEqual([-90, 0, 90, 180, 270].map((longitude) => crossedBy({ ...start, longitude })), model.place === 'manhattan' ? [0, 0, 1, 2, 2] : [0, 1, 1, 1, 2]);
  }
  // The defect: June's path, whose noon lies on the far side of the dome, drawn in front of it.
  const model = henge('manhattan');
  const picture = dome({ bearing: model.bearing, latitude: model.latitude, city: model.where.city, days: model.seasons.map(({ latitude, declination, hourAngle, azimuth }) => ({ latitude, declination, hourAngle, azimuth })) }, s.drawing);
  const seen = picture.family().find((m) => m.key === 'henge-dome:seen')!;
  const hidden = piece(seen, 'henge-dome:june:day:hidden')!;
  assert.ok(hidden.seen!.lines.length > 0, 'part of June’s path is behind the dome');
  hidden.seen!.layer = 'surface';
  seen.remove(hidden);
  const body = seen.children.findIndex((m) => m.key === 'henge-dome:body');
  seen.insert(body + 1, hidden);
  assert.match(depthOrder(picture) as string, /^henge-dome:june:day is drawn in front from orthographic .*, but part of it is on the far side of the body/);
});

test('Henge street view from the centre: the street’s circle and the horizon stay straight at every pitch, the alignment sunset sits where the street points, and a move by morph fails (a deliberate defect)', () => {
  for (const street of ['manhattan', 'chicago'] as const) {
    for (let i = 0; i <= 40; i++) {
      const st = eye(street, i / 40), g = look(st, '#ffffff', { day: 'May' }, s.drawing);
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
  const first = look(eye('manhattan', 0), '#ffffff', { day: 'May' }, s.drawing), last = look(eye('manhattan', 1), '#ffffff', { day: 'May' }, s.drawing);
  bare().add(first);
  sampleAnimation(new Transform(first, last), 0.5);
  assert.equal(typeof depthOrder(first), 'string', 'a half-morphed street view is drawn from no viewpoint');
  // The year's turn by morph fails the same way: drawn from no day's circle.
  const model = henge('manhattan'), start = { bearing: model.bearing, latitude: model.latitude, start: -90, longitude: -90, crossings: model.ideal };
  const a = year(start, dayAt(model.latitude), s.drawing), b = year({ ...start, longitude: 90 }, dayAt(model.latitude), s.drawing);
  bare().add(a);
  sampleAnimation(new Transform(a, b), 0.5);
  assert.equal(typeof depthOrder(a), 'string', 'a half-morphed year is drawn from no viewpoint’s rules');
});

test('Henge globes: the gold arc of the place’s daily circle is exactly its sunlit part and the dark arc its night, cut at the model’s sunset hour angle; the axis is dashed inside Earth', () => {
  const model = henge('manhattan'), [december, , june] = model.seasons;
  const g = globes({ tilt: model.tilt, latitude: model.latitude, city: model.where.city, june: june!, december: december! }, s.drawing);
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
    for (const p of [...day, ...night]) close(Math.asin(dot(p, axis)) * 180 / Math.PI, model.latitude, 0.01);
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
  const { Scene: S } = (await loadProject(Henge, 'scenes/explainers/henge')).scenario();
  for (const key of ['henge-year', 'henge-look']) {
    let found: View | undefined;
    const checked = await assertViewFollowsState(S, (scene) => {
      found ??= scene.mobjects.find((m) => (m as View).draw && (m as View).current?.key === key) as View | undefined;
      return found && scene.mobjects.includes(found) ? found : null;
    });
    assert.equal(checked, 1, key);
  }
});

// ---------------------------------------------------------------- the real places (scenes/explainers/henge/place.ts)
const toward = (a: readonly number[], b: readonly number[]) => Math.acos(Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * 180 / Math.PI;
const discOf = (key: string, e: { date: string; azimuth: number; altitude: number; semidiameter: number }) =>
  ({ key, name: dayName(e.date), azimuth: e.azimuth, altitude: e.altitude + REFRACTION, semidiameter: e.semidiameter });

test('Henge street views: each Sun is drawn true size where the ephemeris puts it, half Sun centred on the straight horizon, full Sun resting on it', () => {
  for (const place of ['manhattan', 'chicago'] as const) {
    const model = henge(place), { metres } = PLACES[place];
    const suns = model.evenings.filter((e) => e.role !== 'other').map((e) => discOf(e.role, e));
    const g = streetView({ bearing: model.bearing, metres, suns }, s.drawing);
    assert.equal(depthOrder(g), true, place);
    const horizon = piece(g, 'henge-view:horizon')!;
    assert.ok(offLine(anchors(horizon)) < 1e-4, `${place}: the horizon is straight from the centre`);
    for (const d of suns) {
      const ring = piece(g, `henge-view:sun:${d.key}`)!.seen!.lines.flat(), centre = azAlt(d.azimuth, d.altitude, 'inside');
      for (const p of ring) close(toward(p, centre), d.semidiameter, 1e-9);
      // Half Sun: the centre 34' down, lifted by refraction onto the horizon.
      close(d.altitude, 0, 1e-5);
    }
    // In the window, the aligned Sun's centre is a fifth of a degree or less from the street's vanishing point.
    const { vp, o } = lensOf(WIDE, model.bearing), first = model.aligned.half[0]!;
    const at = project(azAlt(first.azimuth, 0, 'inside'), vp, 1, o).at, middle = project(azAlt(model.bearing, 0, 'inside'), vp, 1, o).at;
    close(at[1], middle[1], 1e-9);
    assert.ok(Math.abs(at[0] - middle[0]) < o.scale * Math.tan(0.2 * Math.PI / 180), `${place}: ${at[0] - middle[0]}`);
    // Full Sun rests its lower edge on the horizon: its centre one semidiameter up.
    const full = model.aligned.full[0]!;
    close(full.altitude + REFRACTION, full.semidiameter, 1e-5);
    const pair = halfAndFull({ bearing: model.bearing, metres, zone: PLACES[place].zone,
      half: { ...discOf('half', first), date: dayName(first.date), clock: '' }, full: { ...discOf('full', full), date: dayName(full.date), clock: '' } }, s.drawing);
    assert.equal(depthOrder(pair), true);
  }
});

test('Henge globe: the place, the street carried on and the Sun overhead are where the model puts them, in depth order', () => {
  for (const place of ['manhattan', 'chicago'] as const) {
    const model = henge(place), first = model.aligned.half[0]!;
    const st = { name: model.where.city, latitude: model.latitude, longitude: model.where.longitude, bearing: model.bearing, meets: model.meets,
      suns: [{ key: 'aligned', name: dayName(first.date), ...first.overhead }] };
    const g = globe(st, s.drawing);
    assert.equal(depthOrder(g), true, place);
    const here = latLon(model.latitude, model.where.longitude), meets = latLon(model.meets.lat, model.meets.lon);
    // Both ends are in sight from the viewpoint, which faces the middle of the street's arc.
    const vp = globeView(st);
    assert.ok(project(here, vp).seen && project(meets, vp).seen);
    // The street runs along one great circle from the place to the ring: every point in the plane through both and the centre.
    const n = [here[1] * meets[2] - here[2] * meets[1], here[2] * meets[0] - here[0] * meets[2], here[0] * meets[1] - here[1] * meets[0]];
    const street = [piece(g, 'henge-globe:street')!, piece(g, 'henge-globe:street:hidden')].flatMap((p) => p?.seen?.lines.flat() ?? []);
    assert.ok(street.length > 50);
    for (const p of street) close(p[0] * n[0]! + p[1] * n[1]! + p[2] * n[2]!, 0, 1e-9);
    close(toward(here, meets), 90 + REFRACTION, 1e-9);
    // The Sun overhead at half Sun is a quarter-turn and the refraction from the place, within its 8.8" parallax, and next to the street's end.
    const sun = piece(g, 'henge-globe:sun:aligned')!.seen!.lines[0]![0]!;
    close(toward(here, sun), 90 + REFRACTION, 0.003);
    assert.ok(toward(sun, meets) < 0.2);
  }
});
