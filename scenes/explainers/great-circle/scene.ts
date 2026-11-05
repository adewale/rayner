import { Scene, Group, Rectangle, Circle, VMobject, Follow, SetState, Succession, view } from '../../../src/index.ts';
import type { Vec, Text } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { StagedStep } from '../../../explain/index.ts';
import { seenFrom, depthOrder, seenPictures, project, latLon, toLatLon, circleOn, label, keyed } from '../../../explain/drawing.ts';
import type { Model3D, Part, Viewpoint, Vec3, SeenOptions, SeenPicture, Seen } from '../../../explain/drawing.ts';
import { LAND } from './land.ts';
import { greatCircle, rhumbLine, pole, london, madrid, haversine, rhumb, tens, RADIUS_KM } from '../lib/great-circle.ts';
import type { Place, Route } from '../lib/great-circle.ts';

const INK = '#1f2328', SOFT = '#59636e', ROUTE = '#b42318', RULER = '#0757b8', LANDLINE = '#6b7d4a', GRID = '#d0d7de';
const OCEAN = '#eef5fb', SHEET = '#b42318';
const ANSWER = 'The flat map has bent the shortest route out of shape';
const D = Math.PI / 180;
const at3 = (p: Place, r = 1): Vec3 => latLon(p.lat, p.lon, r);
const range = (from: number, to: number, step: number) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

// ---------------------------------------------------------------- the model every picture is seen from
const land: Part = { kind: 'path', lines: LAND.map((ring) => ring.map(([lon, lat]) => latLon(lat, lon))), closed: true, color: LANDLINE, width: 0.022 };
/**
 * Meridians and parallels every `step` degrees, the parallels from `south`. The globe's start at the
 * equator: drawn as one stroke, a southern parallel slipping over the horizon mid-turn would move
 * the stroke's extent at once, where the equator, always in sight, keeps it moving smoothly.
 */
const grid = (step: number, south = -90 + step): Part[] => [
  { kind: 'path', lines: range(-180, 180 - step, step).map((lon) => range(-80, 80, 2).map((lat) => latLon(lat, lon))), color: GRID, width: 0.014 },
  { kind: 'path', lines: range(south, 90 - step, step).map((lat) => circleOn([0, 0, 1], 90 - lat)), closed: true, color: GRID, width: 0.014 },
];
const equator: Part = { kind: 'path', key: 'equator', lines: [circleOn([0, 0, 1], 90)], closed: true, color: SOFT, width: 0.03, hidden: 'dashed' };
/** Two places with codes: what a route, its circle and its sheet are drawn from. */
type Ends = { from: Place & { code: string }; to: Place & { code: string } };
const city = (p: Place & { code: string }): Part => ({ kind: 'point', key: `city:${p.code}`, at: at3(p), color: INK, radius: 0.085 });
/** The shortest route, the string pulled tight. */
const arc = (r: Ends): Part => ({ kind: 'path', key: `route:${r.from.code}-${r.to.code}`, lines: [greatCircle(r.from, r.to, 160).map((p) => at3(p))], color: ROUTE, width: 0.07, hidden: 'dashed' });
/** The ruler's line: one compass heading, straight on Mercator's map. */
const ruler = (r: Ends): Part => ({ kind: 'path', key: `ruler:${r.from.code}-${r.to.code}`, lines: [rhumbLine(r.from, r.to, 160).map((p) => at3(p))], color: RULER, width: 0.05, dashArray: '0.16 0.1' });
/** The whole great circle the route lies on, and the sheet through it and the Earth's centre. */
const circleOf = (r: Ends): Part => ({ kind: 'path', key: `circle:${r.from.code}-${r.to.code}`, lines: [circleOn(pole(r.from, r.to), 90)], closed: true, color: ROUTE, width: 0.025, hidden: 'dashed' });
const sheetOf = (r: Ends): Part => ({
  kind: 'face', key: `sheet:${r.from.code}-${r.to.code}`, rings: [circleOn(pole(r.from, r.to), 90, 1.22), circleOn(pole(r.from, r.to), 90, 1)],
  fill: SHEET, fillOpacity: 0.13, stroke: SHEET, width: 0.018, hidden: 'behind',
});
const body = { radius: 1, fill: OCEAN, fillOpacity: 0.82, stroke: SOFT, strokeWidth: 0.03, key: 'globe:body' };
const model = (parts: Part[]): Model3D => ({ body, parts });

// ---------------------------------------------------------------- viewpoints: state, turned by a Follow
const L = london(), M = madrid();
/** The route's midpoint: looking straight at it, the eye lies in the route's plane. */
const middle = greatCircle(L.from, L.to, 2)[1]!;
const EDGE_ON: Viewpoint = { kind: 'orthographic', yaw: middle.lon, pitch: middle.lat };
const HELD: Viewpoint = { ...EDGE_ON, pitch: EDGE_ON.pitch - 38 };
const PAST: Viewpoint = { ...EDGE_ON, pitch: EDGE_ON.pitch + 20 };
const TILTED: Viewpoint = { kind: 'orthographic', yaw: -55, pitch: 18 };
const ATLANTIC: Viewpoint = { kind: 'orthographic', yaw: -38, pitch: 36 };
const MERCATOR: Viewpoint = { kind: 'mercator', yaw: -60, pitch: 0, limit: 80 };
const TROPICS: Viewpoint = { kind: 'mercator', yaw: -40, pitch: 0, limit: 80 };
const GNOMONIC: Viewpoint = { kind: 'gnomonic', yaw: -58, pitch: 50, limit: 51 };

/** Where each map goes: a lon/lat box placed in scene units. */
function mapPlacement(vp: Viewpoint, lon: [number, number], lat: [number, number], bottom: number, scale: number): SeenOptions {
  const north = (l: number) => Math.log(Math.tan(Math.PI / 4 + (l * D) / 2));
  const y0 = bottom - scale * north(lat[0]);
  const x = (l: number) => scale * (l - vp.yaw) * D;
  return { at: [0, y0], scale, window: [x(lon[0]), bottom, x(lon[1]), y0 + scale * north(lat[1])] };
}
const NORTH_MAP = mapPlacement(MERCATOR, [-132, 12], [22, 72], -3.85, 4.7);
const EQUATOR_MAP = mapPlacement(TROPICS, [-110, 30], [-35, 35], -3.85, 4.7);
const GLOBE: SeenOptions = { at: [-0.6, -0.45], scale: 3.35 };
const WEST_GLOBE: SeenOptions = { at: [-1.7, -0.45], scale: 3.35 };
const GNOMON: SeenOptions = { at: [-3.8, -0.5], scale: 2.75 };

// ---------------------------------------------------------------- pictures, each from its step's state
/** Label sizes: large enough to read at 12 px on a phone in a step's opening view. */
const NAME = 0.68, NUMBER = 0.68;
/** A name beside a point, drawn from the same viewpoint; transparent where the point is out of sight. */
function nameAt(text: string, p: Place, vp: Viewpoint, o: SeenOptions, offset: Vec, anchor: -1 | 0 | 1, color = INK, key?: string, size = NAME): Text {
  const { at, seen } = project(at3(p), vp, 1, o);
  const t = label(text, 0, 0, color, size, key).moveTo([at[0] + offset[0], at[1] + offset[1]], [anchor, 0]);
  if (!seen) t.setOpacity(0);
  return t;
}
/** The middle of a route, where its number goes. */
const middleOf = (r: Ends): Place => greatCircle(r.from, r.to, 2)[1]!;
const frameOf = (o: SeenOptions) => {
  const w = o.window!;
  return new Rectangle({ width: w[2] - w[0], height: w[3] - w[1], fill: 'none', stroke: SOFT, strokeWidth: 0.025 }).moveTo([(w[0] + w[2]) / 2, (w[1] + w[3]) / 2]);
};
interface MapState { viewpoint: Viewpoint; route: Route }
/** Mercator's map with the seat-back route and the ruler's line; numbers when the step gives them. */
function mercator(st: MapState, numbers: boolean, extra: Part[] = []): Group {
  const r = st.route;
  const map = seenFrom(model([...grid(15), land, ruler(r), arc(r), ...extra, city(r.from), city(r.to)]), st.viewpoint, { ...NORTH_MAP, key: 'map' });
  const g = new Group(frameOf(NORTH_MAP), map,
    nameAt(r.from.city, r.from, st.viewpoint, NORTH_MAP, [-0.25, -0.62], 0),
    nameAt(r.to.city, r.to, st.viewpoint, NORTH_MAP, [0.2, -0.4], -1));
  if (numbers) {
    const top = project(at3(r.top), st.viewpoint, 1, NORTH_MAP).at;
    g.add(keyed(new Group(label(`String: ${tens(r.km)} km`, top[0], top[1] + 0.55, ROUTE, NUMBER)), 'label:route'),
      keyed(new Group(label(`Ruler: ${tens(r.rhumbKm)} km`, 1.2, -2.15, RULER, NUMBER)), 'label:ruler'));
  }
  return keyed(g, 'mercator');
}
interface StretchState extends MapState { stretch: { from: number; top: number }; km: number }
/** The same 1,000 km of a parallel at the equator, at London and at the route's top, measured on the map. */
function stretched(st: StretchState): Group {
  const r = st.route;
  const span = (lat: number, lon: number, key: string): Part => {
    const half = (st.km / 2 / (RADIUS_KM * Math.cos(lat * D))) / D;
    return { kind: 'path', key, lines: [range(-1, 1, 0.1).map((t) => latLon(lat, lon + half * t))], color: INK, width: 0.09 };
  };
  const g = mercator(st, false, [span(r.from.lat, r.from.lon - 24, 'stretch:from'), span(r.top.lat, r.top.lon, 'stretch:top')]);
  const at = (p: Place) => project(at3(p), st.viewpoint, 1, NORTH_MAP).at;
  const a = at({ lat: r.from.lat, lon: r.from.lon - 24 }), b = at(r.top);
  const unit = (st.km / RADIUS_KM) * NORTH_MAP.scale!; // 1,000 km of the equator, at the map's scale
  g.add(keyed(new Group(label(`×${st.stretch.from.toFixed(1)}`, a[0], a[1] + 0.45, INK, NUMBER)), 'label:stretch-from'),
    keyed(new Group(label(`×${st.stretch.top.toFixed(1)}`, b[0], b[1] + 0.45, INK, NUMBER)), 'label:stretch-top'),
    keyed(new Group(
      new Rectangle({ width: unit, height: 0.09, fill: INK, stroke: 'none' }).moveTo([-5.5 + unit / 2, 2.45]),
      label(`×1: ${st.km.toLocaleString('en-GB')} km at the equator`, 0, 0, INK, NAME).moveTo([-5.5 + unit + 0.2, 2.45], [-1, 0]),
    ), 'label:equator-scale'));
  return g;
}
interface GlobeState { viewpoint: Viewpoint; route: Route }
/** The globe: string, cities, and the sheet the string lies in, seen from the step's viewpoint. */
function globe(st: GlobeState, { sheet = true, top = false, equatorLine = false } = {}): Group {
  const r = st.route, vp = st.viewpoint;
  const parts = [...grid(30, 0), land, ...(equatorLine ? [equator] : []), ...(sheet ? [sheetOf(r), circleOf(r)] : []), arc(r), city(r.from), city(r.to),
    ...(top ? [{ kind: 'point', key: 'route:top', at: at3(r.top), color: ROUTE, radius: 0.07 } as Part] : [])];
  const g = new Group(seenFrom(model(parts), vp, { ...GLOBE, key: 'globe:seen' }),
    nameAt(r.from.city, r.from, vp, GLOBE, [0.2, 0.32], -1, INK, 'name:from'),
    nameAt(r.to.city, r.to, vp, GLOBE, [-0.2, -0.34], 1, INK, 'name:to'));
  if (top) g.add(nameAt(`${Math.round(r.top.lat)}° N`, r.top, vp, GLOBE, [0, 0.42], 0, ROUTE, 'name:top', NUMBER));
  return keyed(g, 'globe');
}
interface MadridState { viewpoint: Viewpoint; route: Route; westKm: number }
/** Madrid to New York: the great circle against the line of latitude, a smaller circle. */
function westward(st: MadridState): Group {
  const r = st.route, vp = st.viewpoint;
  const parallel: Part = { kind: 'path', key: 'parallel', lines: [circleOn([0, 0, 1], 90 - r.from.lat)], closed: true, color: RULER, width: 0.025, hidden: 'dashed' };
  const west: Part = { kind: 'path', key: `ruler:${r.from.code}-${r.to.code}`, lines: [rhumbLine(r.from, r.to, 120).map((p) => at3(p))], color: RULER, width: 0.06, dashArray: '0.16 0.1' };
  const at = WEST_GLOBE;
  const g = new Group(seenFrom(model([...grid(30, 0), land, equator, parallel, west, circleOf(r), arc(r), city(r.from), city(r.to)]), vp, { ...at, key: 'globe:seen' }),
    nameAt(r.from.city, r.from, vp, at, [0.2, -0.42], 0, INK, 'name:from'),
    nameAt(r.to.city, r.to, vp, at, [-0.2, -0.42], 0, INK, 'name:to'),
    nameAt(`${Math.round(r.top.lat)}° N`, r.top, vp, at, [0, 0.45], 0, ROUTE, 'name:top', NUMBER),
    keyed(new Group(
      label(`Red: ${tens(r.km)} km`, 0, 0, ROUTE, NUMBER).moveTo([2.4, -1.6], [-1, 0]),
      label(`Blue: ${tens(st.westKm)} km`, 0, 0, RULER, NUMBER).moveTo([2.4, -2.5], [-1, 0]),
    ), 'legend'));
  return keyed(g, 'globe');
}
interface GnomonicState { viewpoint: Viewpoint; routes: Route[] }
/** The gnomonic map: the eye at the Earth's centre, every great circle a straight line. */
function gnomonic(st: GnomonicState): Group {
  const vp = st.viewpoint;
  const parts: Part[] = [...grid(15), land];
  for (const r of st.routes) parts.push(ruler(r), arc(r));
  for (const r of st.routes) parts.push(city(r.from), city(r.to));
  const radius = GNOMON.scale! * Math.tan((vp.limit ?? 60) * D);
  const g = new Group(new Circle({ radius, fill: OCEAN, stroke: SOFT, strokeWidth: 0.025 }).moveTo(GNOMON.at!),
    seenFrom(model(parts), vp, { ...GNOMON, key: 'gnomonic:seen' }));
  const offsets: Record<string, [Vec, -1 | 0 | 1]> = { LHR: [[0.18, 0.28], -1], LAX: [[0.1, 0.4], -1], MAD: [[0.18, -0.3], -1], JFK: [[0.1, -0.4], -1] };
  for (const r of st.routes) for (const c of [r.from, r.to]) g.add(nameAt(c.city, c, vp, GNOMON, offsets[c.code]![0], offsets[c.code]![1], INK, `name:${c.code}`));
  g.add(keyed(new Group(...([['Red: great circles', ROUTE], ['Blue: ruler lines', RULER]] as const)
    .map(([text, color], i) => label(text, 0, 0, color, NAME).moveTo([0.6, -2.4 - i * 0.9], [-1, 0]))), 'legend'));
  return keyed(g, 'gnomonic');
}
interface Pair { from: Place & { code: string; city: string }; to: Place & { code: string; city: string }; km: number; rhumbKm: number }
interface EquatorState { viewpoint: Viewpoint; pairs: Pair[] }
/** Two routes Mercator's ruler gets right: one along the equator, one due north. */
function onEquator(st: EquatorState): Group {
  const parts: Part[] = [...grid(15), land, { ...equator, hidden: undefined }];
  for (const p of st.pairs) parts.push(arc(p), ruler(p), city(p.from), city(p.to));
  const g = new Group(frameOf(EQUATOR_MAP), seenFrom(model(parts), st.viewpoint, { ...EQUATOR_MAP, key: 'map' }));
  st.pairs.forEach((p, i) => {
    // Along the equator: names and length above the line. Running north: beside it.
    const along = p.from.lat === p.to.lat;
    const [offset, anchor]: [Vec, -1 | 0] = along ? [[0, 0.4], 0] : [[0.25, 0], -1];
    g.add(nameAt(p.from.city, p.from, st.viewpoint, EQUATOR_MAP, offset, anchor, INK, `name:${p.from.code}`),
      nameAt(p.to.city, p.to, st.viewpoint, EQUATOR_MAP, offset, anchor, INK, `name:${p.to.code}`),
      nameAt(`${tens(p.km)} km either way`, middleOf(p), st.viewpoint, EQUATOR_MAP, along ? [0, -0.45] : [-0.25, -1.6], along ? 0 : 1, INK, `label:pair:${i}`, NUMBER));
  });
  return keyed(g, 'mercator');
}


/** The turning globe in words: how the string looks from the viewpoint the state holds. */
function turnWords(vp: Viewpoint): string {
  const n = pole(L.from, L.to), v = latLon(vp.pitch, vp.yaw), tilt = Math.asin(n[0] * v[0] + n[1] * v[1] + n[2] * v[2]) / D;
  const shape = Math.abs(tilt) < 0.5 ? 'a straight line through the middle of the globe: the eye lies in the sheet' : `an arc bowing ${tilt > 0 ? 'north' : 'south'}, the eye ${Math.abs(tilt).toFixed(0)}° out of the sheet`;
  return `The globe seen from ${vp.pitch.toFixed(0)}° N, ${Math.abs(vp.yaw).toFixed(0)}° W. The red string from London to Los Angeles looks like ${shape}.`;
}

// ---------------------------------------------------------------- checks every frame is held to
/** A great circle seen with the eye in its plane (or on the gnomonic map) must be drawn straight. */
function straight(scene: Scene): true | string | undefined {
  let checked: true | undefined;
  for (const g of scene.mobjects.flatMap((m) => seenPictures(m))) {
    const meta = (g as Group & { seenPicture: SeenPicture }).seenPicture;
    for (const piece of g.children) {
      if (!piece.key?.startsWith('route:') || piece.key.endsWith(':hidden') || !(piece instanceof VMobject)) continue;
      const pts = (piece as VMobject & { seen: Seen }).seen.lines.flat();
      if (pts.length < 3) continue;
      const n = pole(toLatLon(pts[0]!), toLatLon(pts.at(-1)!));
      const v = latLon(meta.viewpoint.pitch, meta.viewpoint.yaw);
      const edgeOn = meta.viewpoint.kind === 'gnomonic' || (meta.viewpoint.kind === 'orthographic' && Math.abs(n[0] * v[0] + n[1] * v[1] + n[2] * v[2]) < 1e-6);
      if (!edgeOn) continue;
      const drawn = piece.subpaths.flatMap((a) => Array.from({ length: (a.length - 2) / 6 + 1 }, (_, i) => [a[i * 6]!, a[i * 6 + 1]!] as Vec));
      const a = drawn[0]!, b = drawn.at(-1)!, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (const q of drawn) {
        const off = Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / len;
        if (off > 1e-3) return `${piece.key} is seen edge-on from ${meta.viewpoint.kind} yaw ${meta.viewpoint.yaw}, pitch ${meta.viewpoint.pitch} but drawn ${off.toFixed(3)} off a straight line`;
      }
      checked = true;
    }
  }
  return checked;
}

export default class GreatCircle extends Scene {
  static meta = {
    id: 'great-circle',
    title: 'Why does a flight from London to Los Angeles pass over Greenland?',
    sources: [
      'https://doi.org/10.1007/s00190-012-0578-z',
      'https://pubs.usgs.gov/publication/pp1395',
      'https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_110m_land.geojson',
      'https://pypi.org/project/geographiclib/2.0/',
    ],
    answer: ANSWER,
    claims: [
      { says: 'the shortest route between two places always runs along one', test: 'test/explain-great-circle.test.ts: no route between two places is shorter than the great circle' },
      { says: 'Every point on the string lies on one flat sheet', test: 'test/explain-great-circle.test.ts: the string lies in one plane through the centre' },
      { says: 'Every line of latitude except the equator is a smaller circle', test: 'test/explain-great-circle.test.ts: lines of latitude are smaller circles' },
      { says: 'Every great circle lies in a plane through the eye', test: 'test/explain-great-circle.test.ts: the gnomonic map draws every great circle straight' },
      { says: 'every shortest route is drawn straight', test: 'test/explain-great-circle.test.ts: the gnomonic map draws every great circle straight' },
      { says: 'Only on the equator, or on a route running due north or south', test: 'test/explain-great-circle.test.ts: the ruler line is the shortest only along the equator or a meridian' },
      { says: 'crosses Hudson Bay and only then turns south', test: 'test/explain-great-circle.test.ts: the route crosses Great Britain, Ireland, southern Greenland at its highest point, and Hudson Bay' },
      { says: 'stretches every place sideways so that compass directions stay true', test: 'test/explain-great-circle.test.ts: Mercator stretches north–south as much as east–west, so headings stay true' },
      { says: 'Is there a flat map on which every shortest route is a ruler’s line', test: 'test/explain-great-circle.test.ts: the gnomonic map draws every great circle straight' },
      { says: 'The route never changes; only where you look from does', shown: true },
      { says: 'The route did not change as the globe turned; only where you stood did', shown: true },
    ],
    checks: [
      { question: 'Two cities lie on the same line of latitude in the southern hemisphere, far apart. Does the shortest route between them bend toward the equator or toward the South Pole, and why?',
        answer: 'Toward the South Pole. The sheet through both cities and the Earth’s centre tips toward the nearer pole, so the great circle swings poleward of the line of latitude, which is a smaller circle and so a longer way round.' },
      { question: 'On the turned globe the London–Los Angeles route looked straight from one angle and curved from others. Did the route change?',
        answer: 'No. How bent it looks depends on where you look from. With the eye in the sheet through the route and the Earth’s centre, the whole great circle is seen edge-on, as a straight line through the middle of the globe.' },
      { question: 'Two airports both lie on the equator. Will the shortest route be drawn bent on Mercator’s map?',
        answer: 'No. The equator is itself a great circle, so the shortest route follows it, and Mercator draws the equator as a straight line: the ruler line and the string agree.' },
    ],
  };

  static settings = [{ id: 'second', label: 'Second route', default: 'madrid', options: [
    { value: 'madrid', label: 'Madrid to New York' }, { value: 'equator', label: 'Two cities on the equator' },
  ] }];

  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.6 });
    const second = settingsOf(this).second as 'madrid' | 'equator';
    const westKm = rhumb(M.from, M.to).km;
    const pairs: Pair[] = [
      [{ code: 'A', city: 'A', lat: 0, lon: -75 }, { code: 'B', city: 'B', lat: 0, lon: -15 }],
      [{ code: 'C', city: 'C', lat: -25, lon: 10 }, { code: 'D', city: 'D', lat: 25, lon: 10 }],
    ].map(([from, to]) => ({ from: from!, to: to!, km: haversine(from!, to!), rhumbKm: rhumb(from!, to!).km }));
    const before: StagedStep<any>[] = [
      { id: 'question', title: 'Why does a flight from London to Los Angeles pass over Greenland?', line: 'Predict: which line is shorter, the bent one or the ruler’s?',
        caption: 'Open the seat-back map on a flight from London to Los Angeles. The line it draws leaves Heathrow heading north-west, climbs past the southern tip of Greenland, crosses Hudson Bay and only then turns south toward California. Los Angeles is far to the south of London, yet the plane goes north. Lay a ruler across the same map from Heathrow to LAX and you get a tidy line heading west-south-west across the Atlantic. Which route is shorter?',
        state: { viewpoint: MERCATOR, route: L }, draw: (st: MapState) => mercator(st, false), opening: ['map'] },
      { id: 'shorter', title: `Answer: the bent line, by ${tens(L.extraKm)} km`, line: 'Red: the plane’s route. Blue dashed: the ruler’s line.',
        caption: `The bent one, by a long way: ${tens(L.km)} kilometres against ${tens(L.rhumbKm)}. The ruler’s line is about ${tens(L.extraKm)} kilometres longer. ${ANSWER}. On the globe the shortest route lies along the circle that a flat plane cuts when it passes through both cities and the centre of the Earth. Look at that circle from inside its plane and it is a straight line.`,
        state: { viewpoint: MERCATOR, route: L }, draw: (st: MapState) => mercator(st, true) },
      { id: 'stretch', title: 'Mercator’s map stretches the north sideways', line: 'Each black bar is 1,000 km of the same parallel.',
        caption: `This kind of map, Mercator’s, stretches every place sideways so that compass directions stay true, and the farther from the equator, the more it stretches: about ${L.stretch.from.toFixed(1)} times at London’s latitude, about twice where the route crosses Greenland. The Earth is narrower up there, so a route that goes north takes a shortcut, and the map draws that narrow part widest, so the shortcut looks like a detour. The ruler’s line keeps one compass heading: easy to steer, longer to fly.`,
        state: { viewpoint: MERCATOR, route: L, km: 1000, stretch: L.stretch }, draw: stretched },
      { id: 'globe', title: 'On a globe, a tight string swings north', line: 'The pale sheet passes through both cities and the Earth’s centre.',
        caption: 'Now hold a globe, pin London and Los Angeles, and pull a string tight between them. A tight string takes the shortest path along the surface, and it swings north of both pins. Every point on the string lies on one flat sheet through London, Los Angeles and the centre of the globe. That sheet cuts the largest circle the sphere can hold, a great circle, and the shortest route between two places always runs along one.',
        state: { viewpoint: HELD, route: L }, draw: (st: GlobeState) => globe(st), opening: ['globe:seen'] },
    ];
    const after: StagedStep<any>[] = [
      { id: 'north', title: `The sheet tips north, so the route peaks at ${Math.round(L.top.lat)}° N`, line: 'Grey: the equator, the one line of latitude that is a great circle.',
        caption: `That also explains the northward swing. Both cities lie north of the equator, so the sheet through them and the Earth’s centre tips toward the North Pole, and the great circle rises to its highest point between them: ${Math.round(L.top.lat)} degrees north, over southern Greenland. Lines of latitude are not great circles. Every line of latitude except the equator is a smaller circle, centred on the Earth’s axis rather than its middle, so following one wastes distance.`,
        state: { viewpoint: TILTED, route: L }, draw: (st: GlobeState) => globe(st, { sheet: true, top: true, equatorLine: true }) },
      second === 'madrid'
        ? { id: 'another', title: `Madrid to New York: due west is ${tens(westKm - M.km)} km longer`, line: 'Blue: Madrid’s line of latitude, a smaller circle. Red: the great circle.',
          caption: `Madrid and New York lie almost on the same line of latitude. Heading due west from Madrid covers ${tens(westKm)} kilometres; the great circle starts out west-north-west, reaches ${Math.round(M.top.lat)} degrees north and arrives after ${tens(M.km)}. The saving is smaller because the cities are closer together and farther from the pole. Only on the equator, or on a route running due north or south, do the ruler and the string agree: set the second route to the equator to see it.`,
          state: { viewpoint: ATLANTIC, route: M, westKm }, draw: westward }
        : { id: 'another', title: 'On the equator, the ruler and the string agree', line: 'Red and blue dashed lie on the same line here.',
          caption: `What if both cities sat on the equator? The equator is a great circle, so the shortest route follows it and the ruler’s line is the string: ${tens(pairs[0]!.km)} km either way, no saving at all. A route due north, along a meridian, is the other such case. Only on the equator, or on a route running due north or south, do the two maps draw the same line.`,
          state: { viewpoint: TROPICS, pairs }, draw: onEquator },
      { id: 'gnomonic', title: 'A map seen from the Earth’s centre draws shortest routes straight', line: 'The gnomonic map: the eye at the centre, the paper touching the globe.',
        caption: 'Is there a flat map on which every shortest route is a ruler’s line? Put the eye at the Earth’s centre and project each place onto a flat sheet touching the globe. Every great circle lies in a plane through the eye, and that plane meets the sheet in a straight line. On this map, the gnomonic map, every shortest route is drawn straight: the turned globe’s edge-on view, for every route at once. The price is that it cannot show even half the world.',
        state: { viewpoint: GNOMONIC, routes: [L, M] }, draw: gnomonic, opening: ['gnomonic:seen'] },
      { id: 'limits', title: 'The shortcut over Greenland is the shortest way on a round Earth', line: `${tens(L.km)} km on a sphere of radius ${RADIUS_KM.toLocaleString('en-GB')} km.`,
        caption: 'The plane flies the great circle because on a round Earth it is the shortest way, and the map draws it bent because a flat map has to stretch a round world. Real flights leave the great circle to ride or avoid the jet stream, to stay within reach of airports and out of closed airspace, and the Earth’s slightly flattened shape changes these distances by a fraction of a per cent. The shortcut over Greenland survives all of them.',
        state: { viewpoint: MERCATOR, route: L }, draw: (st: MapState) => mercator(st, true) },
    ];

    // Held on every frame by rayner check, the turn included: nothing behind the globe is drawn in
    // front of it, and a great circle seen edge-on (or on the gnomonic map) is drawn straight.
    this.addInvariant('nothing behind the globe is drawn in front', (scene) => {
      let held: true | undefined;
      for (const m of scene.mobjects) {
        const r = depthOrder(m);
        if (typeof r === 'string') return r;
        if (r) held = true;
      }
      return held;
    });
    this.addInvariant('a great circle seen edge-on is drawn straight', straight);

    await s.steps(before);

    // The aha: the same globe, turned. The viewpoint is state; one Follow over its pitch draws the
    // globe afresh at every angle, so a seek lands on the frame a full play shows.
    await this.step('turn', {
      title: 'Turn the globe: seen edge-on, the route is a straight line',
      line: 'The route never changes; only where you look from does.',
      caption: 'So why does the string look curved? Turn the globe slowly. The route’s arc flattens, then bends the other way. At one angle your eye lies in the sheet itself, and the route becomes a straight line through the middle of the globe. The route did not change as the globe turned; only where you stood did. The flat map is one more viewpoint, and one you cannot turn.',
    });
    await s.clear({ runTime: 0.18 });
    // The step's model starts where the last picture was seen from and ends edge-on.
    this.state = { viewpoint: HELD, route: L, turn: { from: HELD.pitch, via: PAST.pitch, to: EDGE_ON.pitch } } as typeof this.state;
    const picture = view(this, (st) => globe(st as unknown as GlobeState), { place: false });
    s.opening(picture);
    await s.enter(picture, { runTime: 0.24, describe: () => turnWords(this.state.viewpoint as Viewpoint) });
    const pitchTo = (from: number, to: number, runTime: number) =>
      new Follow({ from, to, draw: (pitch) => globe({ viewpoint: { ...EDGE_ON, pitch }, route: L }) }, { targets: [picture.current], runTime });
    await this.play(new Succession([
      pitchTo(HELD.pitch, PAST.pitch, 2.6),
      pitchTo(PAST.pitch, EDGE_ON.pitch, 1.4),
      new SetState(this, (st) => ({ ...st, viewpoint: EDGE_ON })),
    ]));

    await s.steps(after);
  }
}
