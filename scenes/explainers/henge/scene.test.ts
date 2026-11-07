import { test } from 'node:test';
import type { Seen } from '../../../explain/geo.ts';
import { depthOrder, project } from '../../../explain/geo.ts';
import type { View } from '../../../explain/index.ts';
import { stage } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { declination, sunset, henge, TILT, LATITUDE } from './model.ts';
import { collectProject, defaultScenario } from '../../../tools/lib/explain-project.ts';
import { check as checkHengeScene } from './fidelity.ts';
import { Scene, Transform } from '../../../src/index.ts';
import { loadFonts } from '../../../explain/testing.ts';
import type { Mobject, VMobject, Sink } from '../../../src/index.ts';
import { azAlt, sunsetOf, dome, year, crossedBy, look, lookView, globes } from './sky.ts';
import { assertViewFollowsState } from '../../../test/lib/view-fidelity.ts';

const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} versus ${b}`);

const dayOf = (longitude: number) => { const d = sunset(declination(longitude)); return { declination: d.declination, hourAngle: d.hourAngle, azimuth: d.azimuth }; };

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

test('Henge both street scenarios expose their geometry at all eight resting steps', async () => {
  const project=await collectProject('scenes/explainers/henge',{write:false});
  assert.equal(project.scenarios.length,2);
  assert.deepEqual(project.scenarios.map(scenario => scenario.values.street).sort(), ['manhattan', 'west']);
  for (const scenario of project.scenarios) {
    checkHengeScene(scenario.trace, scenario.values);
  }
});

// ---------------------------------------------------------------- the 3D pictures (scenes/explainers/henge/sky.ts)
await loadFonts();
/** A stage for the pictures' text, on a scene of its own. */
const s = stage(bare());

test('Henge dome and year are drawn in depth order at every longitude; a day circle drawn in front where the dome hides it fails (a deliberate defect)', () => {
  for (const model of [henge('manhattan'), henge('west')]) {
    const days = model.seasons.map(({ declination, hourAngle, azimuth }) => ({ declination, hourAngle, azimuth }));
    assert.equal(depthOrder(dome({ bearing: model.bearing, days }, s)), true);
    const start = { bearing: model.bearing, start: -90, longitude: -90, crossings: model.half };
    for (let i = 0; i <= 72; i++) assert.equal(depthOrder(year({ ...start, longitude: -90 + 5 * i }, dayOf, s)), true, `${model.street}, longitude ${-90 + 5 * i}`);
    // The sunset passes the street twice a year: on the way north and on the way back.
    assert.deepEqual([-90, 0, 90, 180, 270].map((longitude) => crossedBy({ ...start, longitude })), model.street === 'manhattan' ? [0, 0, 1, 2, 2] : [0, 1, 1, 2, 2]);
  }
  // The defect: June's path, whose noon lies on the far side of the dome, drawn in front of it.
  const model = henge('manhattan');
  const picture = dome({ bearing: model.bearing, days: model.seasons.map(({ declination, hourAngle, azimuth }) => ({ declination, hourAngle, azimuth })) }, s);
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
      const st = eye(street, i / 40), g = look(st, '#ffffff', { day: 'May' }, s);
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
  const first = look(eye('manhattan', 0), '#ffffff', { day: 'May' }, s), last = look(eye('manhattan', 1), '#ffffff', { day: 'May' }, s);
  bare().add(first);
  const morph = new Transform(first, last);
  morph.begin();
  morph.interpolate(0.5);
  assert.equal(typeof depthOrder(first), 'string', 'a half-morphed street view is drawn from no viewpoint');
  // The year's turn by morph fails the same way: drawn from no day's circle.
  const model = henge('manhattan'), start = { bearing: model.bearing, start: -90, longitude: -90, crossings: model.half };
  const a = year(start, dayOf, s), b = year({ ...start, longitude: 90 }, dayOf, s);
  bare().add(a);
  const turn = new Transform(a, b);
  turn.begin();
  turn.interpolate(0.5);
  assert.equal(typeof depthOrder(a), 'string', 'a half-morphed year is drawn from no viewpoint’s rules');
});

test('Henge globes: the gold arc of New York’s daily circle is exactly its sunlit part and the dark arc its night, cut at the model’s sunset hour angle; the axis is dashed inside Earth', () => {
  const model = henge('manhattan'), [december, , june] = model.seasons;
  const g = globes({ tilt: model.tilt, latitude: model.latitude, june: june!, december: december! }, s);
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
