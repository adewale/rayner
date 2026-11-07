// How the great-circle explainer draws one state: one 3D model (graticule, coastlines, keyed city dots,
// the route, the ruler's line, the whole great circle and the sheet through it), seen through the step's
// viewpoint by seenFrom. Mercator's map, the globe and the gnomonic map are three viewpoint kinds of
// that same model; the gnomonic map is the eye at the Earth's centre.
//
// Visual decisions: no lighting, shading or depth of field, which would add realism and nothing to the
// argument. City dots keep their keys from map to globe, but the scene clears and enters on a change of
// projection rather than morphing: a morph's middle frames come from no viewpoint, so parts on their way
// behind the globe would cross its face, which the depth check rejects. The globe's graticule starts at
// the equator (see grid). Coastlines are Natural Earth 1:110m, coarse at this scale.
import { Group, Rectangle, Circle } from '../../../src/index.ts';
import type { Model3D, Part, Viewpoint, Vec3, SeenOptions } from '../../../explain/geo.ts';
import { seenFrom, project, latLon, circleOn } from '../../../explain/geo.ts';
import type { Vec, Text } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { label, keyed, pin } from '../../../explain/drawing.ts';
import { LAND } from './land.ts';
import { greatCircle, rhumbLine, pole, tens, RADIUS_KM } from './model.ts';
import type { Place, Route } from './model.ts';
import { grouped } from '../lib/format.ts';

const INK = '#1f2328', SOFT = '#59636e', ROUTE = '#b42318', RULER = '#0757b8', LANDLINE = '#6b7d4a', GRID = '#d0d7de';
const OCEAN = '#eef5fb', SHEET = '#b42318';
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

// The flat maps' viewpoints: where each map is placed depends on its centre line.
export const MERCATOR: Viewpoint = { kind: 'mercator', yaw: -60, pitch: 0, limit: 80 };
export const TROPICS: Viewpoint = { kind: 'mercator', yaw: -40, pitch: 0, limit: 80 };

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
function nameAt(s: Stage, text: string, p: Place, vp: Viewpoint, o: SeenOptions, offset: Vec, anchor: -1 | 0 | 1, color = INK, key?: string, size = NAME): Text {
  const { at, seen } = project(at3(p), vp, 1, o);
  const t = label(s, text, { color, size, key }).moveTo([at[0] + offset[0], at[1] + offset[1]], [anchor, 0]);
  if (!seen) t.setOpacity(0);
  return t;
}
/** The middle of a route, where its number goes. */
const middleOf = (r: Ends): Place => greatCircle(r.from, r.to, 2)[1]!;
const frameOf = (o: SeenOptions) => {
  const w = o.window!;
  return new Rectangle({ width: w[2] - w[0], height: w[3] - w[1], fill: 'none', stroke: SOFT, strokeWidth: 0.025 }).moveTo([(w[0] + w[2]) / 2, (w[1] + w[3]) / 2]);
};
export interface MapState { viewpoint: Viewpoint; route: Route }
/** Mercator's map with the seat-back route and the ruler's line; numbers when the step gives them. */
export function mercator(st: MapState, s: Stage, numbers: boolean, extra: Part[] = []): Group {
  const r = st.route;
  const map = seenFrom(model([...grid(15), land, ruler(r), arc(r), ...extra, city(r.from), city(r.to)]), st.viewpoint, { ...NORTH_MAP, key: 'map' });
  const g = new Group(frameOf(NORTH_MAP), map,
    nameAt(s, r.from.city, r.from, st.viewpoint, NORTH_MAP, [-0.25, -0.62], 0),
    nameAt(s, r.to.city, r.to, st.viewpoint, NORTH_MAP, [0.2, -0.4], -1));
  if (numbers) {
    const top = project(at3(r.top), st.viewpoint, 1, NORTH_MAP).at;
    g.add(keyed(new Group(label(s, `String: ${tens(r.km)} km`, { at: [top[0], top[1] + 0.55], color: ROUTE, size: NUMBER })), 'label:route'),
      keyed(new Group(label(s, `Ruler: ${tens(r.rhumbKm)} km`, { at: [1.2, -2.15], color: RULER, size: NUMBER })), 'label:ruler'));
  }
  return keyed(g, 'mercator');
}
interface StretchState extends MapState { stretch: { from: number; top: number }; km: number }
/** The same 1,000 km of a parallel at the equator, at London and at the route's top, measured on the map. */
export function stretched(st: StretchState, s: Stage): Group {
  const r = st.route;
  const span = (lat: number, lon: number, key: string): Part => {
    const half = (st.km / 2 / (RADIUS_KM * Math.cos(lat * D))) / D;
    return { kind: 'path', key, lines: [range(-1, 1, 0.1).map((t) => latLon(lat, lon + half * t))], color: INK, width: 0.09 };
  };
  const g = mercator(st, s, false, [span(r.from.lat, r.from.lon - 24, 'stretch:from'), span(r.top.lat, r.top.lon, 'stretch:top')]);
  const at = (p: Place) => project(at3(p), st.viewpoint, 1, NORTH_MAP).at;
  const a = at({ lat: r.from.lat, lon: r.from.lon - 24 }), b = at(r.top);
  const unit = (st.km / RADIUS_KM) * NORTH_MAP.scale!; // 1,000 km of the equator, at the map's scale
  g.add(keyed(new Group(label(s, `×${st.stretch.from.toFixed(1)}`, { at: [a[0], a[1] + 0.45], color: INK, size: NUMBER })), 'label:stretch-from'),
    keyed(new Group(label(s, `×${st.stretch.top.toFixed(1)}`, { at: [b[0], b[1] + 0.45], color: INK, size: NUMBER })), 'label:stretch-top'),
    keyed(new Group(
      new Rectangle({ width: unit, height: 0.09, fill: INK, stroke: 'none' }).moveTo([-5.5 + unit / 2, 2.45]),
      label(s, `×1: ${grouped(st.km)} km at the equator`, { color: INK, size: NAME }).moveTo([-5.5 + unit + 0.2, 2.45], [-1, 0]),
    ), 'label:equator-scale'));
  return g;
}
export interface GlobeState { viewpoint: Viewpoint; route: Route }
/** The globe: string, cities, and the sheet the string lies in, seen from the step's viewpoint. */
export function globe(st: GlobeState, s: Stage, { sheet = true, top = false, equatorLine = false } = {}): Group {
  const r = st.route, vp = st.viewpoint;
  // The caption pins both cities and pulls a string between them: each city is a pin stuck in where
  // the globe shows it, named by its label, and like a name it is transparent while out of sight.
  const pinned = (p: Place & { city: string }, side: 'left' | 'right', key: string) => {
    const { at, seen } = project(at3(p), vp, 1, GLOBE);
    const g = pin(s, at, { label: p.city, color: INK, size: NAME, side, key });
    if (!seen) g.setOpacity(0);
    return g;
  };
  const parts = [...grid(30, 0), land, ...(equatorLine ? [equator] : []), ...(sheet ? [sheetOf(r), circleOf(r)] : []), arc(r), city(r.from), city(r.to),
    ...(top ? [{ kind: 'point', key: 'route:top', at: at3(r.top), color: ROUTE, radius: 0.07 } as Part] : [])];
  const g = new Group(seenFrom(model(parts), vp, { ...GLOBE, key: 'globe:seen' }),
    pinned(r.from, 'right', 'name:from'),
    pinned(r.to, 'left', 'name:to'));
  if (top) g.add(nameAt(s, `${Math.round(r.top.lat)}° N`, r.top, vp, GLOBE, [0, 0.42], 0, ROUTE, 'name:top', NUMBER));
  return keyed(g, 'globe');
}
interface MadridState { viewpoint: Viewpoint; route: Route; westKm: number }
/** Madrid to New York: the great circle against the line of latitude, a smaller circle. */
export function westward(st: MadridState, s: Stage): Group {
  const r = st.route, vp = st.viewpoint;
  const parallel: Part = { kind: 'path', key: 'parallel', lines: [circleOn([0, 0, 1], 90 - r.from.lat)], closed: true, color: RULER, width: 0.025, hidden: 'dashed' };
  const west: Part = { kind: 'path', key: `ruler:${r.from.code}-${r.to.code}`, lines: [rhumbLine(r.from, r.to, 120).map((p) => at3(p))], color: RULER, width: 0.06, dashArray: '0.16 0.1' };
  const at = WEST_GLOBE;
  const g = new Group(seenFrom(model([...grid(30, 0), land, equator, parallel, west, circleOf(r), arc(r), city(r.from), city(r.to)]), vp, { ...at, key: 'globe:seen' }),
    nameAt(s, r.from.city, r.from, vp, at, [0.2, -0.42], 0, INK, 'name:from'),
    nameAt(s, r.to.city, r.to, vp, at, [-0.2, -0.42], 0, INK, 'name:to'),
    nameAt(s, `${Math.round(r.top.lat)}° N`, r.top, vp, at, [0, 0.45], 0, ROUTE, 'name:top', NUMBER),
    keyed(new Group(
      label(s, `Red: ${tens(r.km)} km`, { color: ROUTE, size: NUMBER }).moveTo([2.4, -1.6], [-1, 0]),
      label(s, `Blue: ${tens(st.westKm)} km`, { color: RULER, size: NUMBER }).moveTo([2.4, -2.5], [-1, 0]),
    ), 'legend'));
  return keyed(g, 'globe');
}
interface GnomonicState { viewpoint: Viewpoint; routes: Route[] }
/** The gnomonic map: the eye at the Earth's centre, every great circle a straight line. */
export function gnomonic(st: GnomonicState, s: Stage): Group {
  const vp = st.viewpoint;
  const parts: Part[] = [...grid(15), land];
  for (const r of st.routes) parts.push(ruler(r), arc(r));
  for (const r of st.routes) parts.push(city(r.from), city(r.to));
  const radius = GNOMON.scale! * Math.tan((vp.limit ?? 60) * D);
  const g = new Group(new Circle({ radius, fill: OCEAN, stroke: SOFT, strokeWidth: 0.025 }).moveTo(GNOMON.at!),
    seenFrom(model(parts), vp, { ...GNOMON, key: 'gnomonic:seen' }));
  const offsets: Record<string, [Vec, -1 | 0 | 1]> = { LHR: [[0.18, 0.28], -1], LAX: [[0.1, 0.4], -1], MAD: [[0.18, -0.3], -1], JFK: [[0.1, -0.4], -1] };
  for (const r of st.routes) for (const c of [r.from, r.to]) g.add(nameAt(s, c.city, c, vp, GNOMON, offsets[c.code]![0], offsets[c.code]![1], INK, `name:${c.code}`));
  g.add(keyed(new Group(...([['Red: great circles', ROUTE], ['Blue: ruler lines', RULER]] as const)
    .map(([text, color], i) => label(s, text, { color, size: NAME }).moveTo([0.6, -2.4 - i * 0.9], [-1, 0]))), 'legend'));
  return keyed(g, 'gnomonic');
}
export interface Pair { from: Place & { code: string; city: string }; to: Place & { code: string; city: string }; km: number; rhumbKm: number }
interface EquatorState { viewpoint: Viewpoint; pairs: Pair[] }
/** Two routes Mercator's ruler gets right: one along the equator, one due north. */
export function onEquator(st: EquatorState, s: Stage): Group {
  const parts: Part[] = [...grid(15), land, { ...equator, hidden: undefined }];
  for (const p of st.pairs) parts.push(arc(p), ruler(p), city(p.from), city(p.to));
  const g = new Group(frameOf(EQUATOR_MAP), seenFrom(model(parts), st.viewpoint, { ...EQUATOR_MAP, key: 'map' }));
  st.pairs.forEach((p, i) => {
    // Along the equator: names and length above the line. Running north: beside it.
    const along = p.from.lat === p.to.lat;
    const [offset, anchor]: [Vec, -1 | 0] = along ? [[0, 0.4], 0] : [[0.25, 0], -1];
    g.add(nameAt(s, p.from.city, p.from, st.viewpoint, EQUATOR_MAP, offset, anchor, INK, `name:${p.from.code}`),
      nameAt(s, p.to.city, p.to, st.viewpoint, EQUATOR_MAP, offset, anchor, INK, `name:${p.to.code}`),
      nameAt(s, `${tens(p.km)} km either way`, middleOf(p), st.viewpoint, EQUATOR_MAP, along ? [0, -0.45] : [-0.25, -1.6], along ? 0 : 1, INK, `label:pair:${i}`, NUMBER));
  });
  return keyed(g, 'mercator');
}


/** The turning globe in words: how the string `r` looks from the viewpoint the state holds. */
export function turnWords(vp: Viewpoint, r: Ends): string {
  const n = pole(r.from, r.to), v = latLon(vp.pitch, vp.yaw), tilt = Math.asin(n[0] * v[0] + n[1] * v[1] + n[2] * v[2]) / D;
  const shape = Math.abs(tilt) < 0.5 ? 'a straight line through the middle of the globe: the eye lies in the sheet' : `an arc bowing ${tilt > 0 ? 'north' : 'south'}, the eye ${Math.abs(tilt).toFixed(0)}° out of the sheet`;
  return `The globe seen from ${vp.pitch.toFixed(0)}° N, ${Math.abs(vp.yaw).toFixed(0)}° W. The red string from London to Los Angeles looks like ${shape}.`;
}
