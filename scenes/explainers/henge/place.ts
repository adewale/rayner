// Henge's pictures of real places: the view down a real street at real moments, and the globe the place
// stands on. Every direction comes from the ephemeris in ./model.ts, checked against Skyfield and DE440s.
//
// The street view is the sky seen from its centre (gnomonic), where the horizon is a straight line, with
// the Sun's disc drawn at true size where the model puts it on each evening, lifted by the standard
// refraction so half Sun sits on the horizon. The buildings are two walls of one height either side of a
// street 30.5 m wide, running from the viewpoint to the far point its bearing was measured to; each wall is
// placed by the same pinhole as the sky, so the slot between their far ends is the street's real angular
// width. A disc the walls hide is outlined, dashed.
//
// The globe is Earth seen from space (orthographic): the place at its latitude and longitude, the street
// carried on along the ground as a great circle, and the ring of places a quarter of the way round from it
// (90° plus the 34′ of refraction), where the Sun stands overhead at the place's half Sun. Coastlines are Natural
// Earth 1:110m (land.ts, from oracle/land.py), coarse at this scale.
import { Group, Rectangle, Circle, VMobject, Arrow, keyed } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import type { Part, Vec3, Viewpoint, SeenOptions } from '../../../explain/geo.ts';
import { seenFrom, project, circleOn, greatArc, latLon, toLatLon } from '../../../explain/geo.ts';
import { label } from '../../../explain/drawing.ts';
import type { Stage } from '../../../explain/index.ts';
import { LAND } from './land.ts';
import { REFRACTION, TILT, along } from './model.ts';
import { INK, SUN, SUMMER, MUTED, ROAD, WALL, azAlt, facing, pinhole, flat, canyon, shape } from './sky.ts';
import type { Canyon } from './sky.ts';

const rad = Math.PI / 180;
/** Label size: 12 px on a 390 px phone's whole picture. */
const NAME = 0.54;
/** The globe's labels: large enough that a phone's opening holds the globe and its key together. */
const BIG = 0.6;

// ---------------------------------------------------------------- the street at real moments
/** One evening's Sun as the street view draws it: azimuth, apparent altitude (refraction added) and semidiameter. */
export interface Disc { key: string; name: string; azimuth: number; altitude: number; semidiameter: number }
/** A street view's state: the street, the Suns it shows, and one Sun too far aside to show, named at the edge. */
export interface StreetState { bearing: number; metres: number; suns: readonly Disc[]; aside?: { name: string; azimuth: number } }
/** Where a street view goes on the stage, and how wide its view is: `field` degrees either side of the street. */
export interface Frame { at: Vec; width: number; height: number; field: number; horizon: number }
/** The street in metres: 42nd Street's 100 ft, walls of one height, the eye at standing height. */
const street = (metres: number): Canyon => ({ half: 15.25, height: 60, near: 20, far: metres, eye: 1.7 });

/** The view's lens: the eye at the sky's centre, level, facing down the street, `field` degrees to each side edge. */
export function lensOf(frame: Frame, bearing: number): { vp: Viewpoint; o: { at: Vec; scale: number } } {
  return { vp: facing('gnomonic', bearing, 0, 'inside', { limit: 80 }),
    o: { at: [frame.at[0], frame.at[1] + frame.horizon], scale: frame.width / 2 / Math.tan(frame.field * rad) } };
}
/**
 * One street view, unmasked: the sky (the horizon and each Sun's disc), the ground, the road, the walls,
 * each disc's outline where the walls hide it, the date under each disc and the far Sun at the edge.
 */
function streetParts(st: StreetState, frame: Frame, paper: string, s: Stage, key: string, names = true) {
  const { vp, o } = lensOf(frame, st.bearing);
  const left = frame.at[0] - frame.width / 2, right = frame.at[0] + frame.width / 2;
  const bottom = frame.at[1] - frame.height / 2, horizonY = o.at[1];
  const dir = (d: { azimuth: number; altitude: number }) => azAlt(d.azimuth, d.altitude, 'inside');
  const parts: Part[] = [
    // The horizon as far as the window reaches, a great circle, straight from the centre.
    { kind: 'path', key: `${key}:horizon`, lines: [Array.from({ length: 41 }, (_, i) => azAlt(st.bearing + frame.field * (i / 20 - 1), 0, 'inside'))], color: INK, width: 0.03 },
    ...st.suns.map((d): Part => ({ kind: 'face', key: `${key}:sun:${d.key}`, rings: [circleOn(dir(d), d.semidiameter, 1, 10)], fill: SUN, fillOpacity: 1, stroke: SUN, width: 0.01 })),
  ];
  const sky = seenFrom({ body: { radius: 1, fill: 'none', stroke: 'none', key: `${key}:body` }, parts }, vp, { ...o, key: `${key}:seen` });
  const ground = new Rectangle({ width: frame.width, height: horizonY - bottom + 0.02, fill: paper, stroke: 'none' }).moveTo([frame.at[0], (horizonY + bottom - 0.02) / 2]);
  const { road, walls } = canyon(st.bearing, street(st.metres));
  const box = [left, bottom, right, frame.at[1] + frame.height / 2] as const;
  const roadShape = shape(clip(flat(road, vp, o), box), { fill: ROAD, stroke: 'none' });
  const wallShapes = walls.map((w) => shape(clip(flat(w, vp, o), box), { fill: WALL, stroke: MUTED, strokeWidth: 0.02 }));
  // Each disc's outline, dashed, over the walls: where a wall hides the Sun, its outline still shows where it is.
  const outlines = st.suns.map((d) => {
    const c = new Circle({ radius: o.scale * Math.tan(d.semidiameter * rad), fill: 'none', stroke: SUN, strokeWidth: 0.03 }).moveTo(pinhole(dir(d), vp, o));
    c.style.dashArray = '0.07 0.05';
    return c;
  });
  const g = new Group(sky, ground, roadShape, ...wallShapes, ...outlines);
  if (names) {
    // Each disc's date under it, in the first row where it clears the dates already placed.
    const ends: number[] = [];
    for (const d of [...st.suns].sort((a, b) => a.azimuth - b.azimuth)) {
      const x = pinhole(dir(d), vp, o)[0], words = label(s, d.name, { color: SUN, size: NAME }), w = words.width();
      let row = ends.findIndex((end) => x - w / 2 > end + 0.2);
      if (row < 0) row = ends.push(-Infinity) - 1;
      ends[row] = x + w / 2;
      g.add(keyed(words.moveTo([x, horizonY - 0.72 - row * 0.6]), `${key}-name:${d.key}`));
    }
  }
  if (st.aside) {
    const off = st.aside.azimuth - st.bearing, side = off < 0 ? -1 : 1, y = bottom + 0.42;
    const edge = side < 0 ? left : right;
    g.add(keyed(new Group(new Arrow([edge - side * 0.95, y], [edge - side * 0.12, y], { stroke: SUN, strokeWidth: 0.05 }),
      label(s, `${st.aside.name}: ${Math.abs(off).toFixed(1)}° ${side < 0 ? 'left' : 'right'}`, { color: SUN, size: NAME }).moveTo([edge - side * 1.1, y], [side, 0])), `${key}-aside`));
  }
  return { g, box };
}
/** The part of a polygon inside a box (Sutherland–Hodgman), so one view's walls stay out of its neighbour's window. */
function clip(points: Vec[], [l, b, r, t]: readonly [number, number, number, number]): Vec[] {
  const edges: [(p: Vec) => number][] = [[(p) => p[0] - l], [(p) => r - p[0]], [(p) => p[1] - b], [(p) => t - p[1]]];
  let out = points;
  for (const [inside] of edges) {
    const next: Vec[] = [];
    out.forEach((a, i) => {
      const c = out[(i + 1) % out.length]!, da = inside(a), dc = inside(c);
      if (da >= 0) next.push(a);
      if ((da >= 0) !== (dc >= 0)) { const k = da / (da - dc); next.push([a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k]); }
    });
    out = next;
  }
  return out;
}
/** Paper over everything outside the views' windows, and each window's edge. */
function windows(boxes: (readonly [number, number, number, number])[], paper: string, key: string) {
  const mask = new VMobject({ fill: paper, stroke: 'none', fillRule: 'evenodd' });
  const ring = (pts: Vec[]) => { mask.startNewPath(pts[0]!); for (const p of pts.slice(1)) mask.addLineTo(p); mask.closePath(); };
  ring([[-9, -6], [9, -6], [9, 6], [-9, 6]]);
  const edges = boxes.map(([l, b, r, t], i) => {
    ring([[l, b], [r, b], [r, t], [l, t]]);
    return keyed(new Rectangle({ width: r - l, height: t - b, fill: 'none', stroke: MUTED, strokeWidth: 0.025 }).moveTo([(l + r) / 2, (b + t) / 2]), `${key}-window:${i}`);
  });
  return [mask, ...edges];
}
/** The street-view step's window: five degrees either side of the street. */
export const WIDE: Frame = { at: [0, 0.15], width: 11.8, height: 5.2, field: 5, horizon: 0.35 };
/** The street-view step: one view down the street, every Sun the state names at true size. */
export function streetView(st: StreetState & { legend?: string }, s: Stage, key = 'henge-view'): Group {
  const frame = WIDE;
  const { g, box } = streetParts(st, frame, s.look.paper, s, key);
  const parts = [g, ...windows([box], s.look.paper, key)];
  if (st.legend) parts.push(keyed(label(s, st.legend, { color: INK, size: NAME }).moveTo([0, box[1] - 0.42]), `${key}-legend`));
  return keyed(new Group(...parts), key);
}
/** Two close views side by side, a degree either side of the street: each with its Sun and its words above. */
export function closeViews(views: { st: StreetState; title: string; words: string }[], s: Stage, key = 'henge-close'): Group {
  const drawn = views.map(({ st }, i) => {
    const frame: Frame = { at: [i === 0 ? -3.05 : 3.05, -0.2], width: 5.6, height: 3.9, field: 1.1, horizon: -0.9 };
    return streetParts(st, frame, s.look.paper, s, `${key}:${i}`, false);
  });
  // The views, then paper over everything outside their windows, then the words beside the windows.
  const words = views.map(({ title, words }, i) => {
    const box = drawn[i]!.box, x = (box[0] + box[2]) / 2;
    return keyed(new Group(label(s, title, { color: INK, size: 0.58 }).moveTo([x, box[3] + 0.42]),
      label(s, words, { color: SUN, size: NAME }).moveTo([x, box[1] - 0.42])), `${key}-words:${i}`);
  });
  return keyed(new Group(...drawn.map((d) => d.g), ...windows(drawn.map((d) => d.box), s.look.paper, key), ...words), key);
}

/** The disc step's state: the first half-Sun and full-Sun moments, with their dates and clock times. */
export interface HalfFullState { bearing: number; metres: number; zone: string; half: Disc & { date: string; clock: string }; full: Disc & { date: string; clock: string } }
/** Half Sun and full Sun, each in its own close view down the street. */
export function halfAndFull(st: HalfFullState, s: Stage): Group {
  const one = (d: HalfFullState['half'], name: string) =>
    ({ st: { bearing: st.bearing, metres: st.metres, suns: [d] }, title: `${name}, ${d.date}`, words: `${d.clock} ${st.zone}` });
  return closeViews([one(st.half, 'Half Sun'), one(st.full, 'Full Sun')], s);
}

// ---------------------------------------------------------------- the globe
/** The globe step's state: the place, its street's bearing, where the street meets the ring, and the Sun overhead on some evenings. */
export interface GlobeState { name: string; latitude: number; longitude: number; bearing: number; meets: { lat: number; lon: number }; suns: readonly { key: string; name: string; lat: number; lon: number }[] }
const OCEAN = '#eef5fb', LANDLINE = '#8a9a6a';
const GLOBE: SeenOptions = { at: [-2.85, -0.35], scale: 2.95 };
const unit = (v: Vec3): Vec3 => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; };
/** The globe's viewpoint: facing the middle of the street's arc, so the place and the ring's crossing are both in sight. */
export function globeView(st: Pick<GlobeState, 'latitude' | 'longitude' | 'meets'>): Viewpoint {
  const a = latLon(st.latitude, st.longitude), b = latLon(st.meets.lat, st.meets.lon);
  const mid = toLatLon(unit([a[0] + b[0], a[1] + b[1], a[2] + b[2]]));
  return { kind: 'orthographic', yaw: mid.lon, pitch: mid.lat };
}
/** The ring's stretch between the tropics on the street's side: where the Sun stands overhead at each half Sun of a year. */
export function yearArc(st: Pick<GlobeState, 'latitude' | 'longitude' | 'bearing'>): Vec3[] {
  const points: Vec3[] = [];
  for (let b = st.bearing - 80; b <= st.bearing + 80; b += 0.5) {
    const p = along(st.latitude, st.longitude, b, 90 + REFRACTION);
    if (Math.abs(p.lat) <= TILT) points.push(latLon(p.lat, p.lon));
  }
  return points;
}
export function globe(st: GlobeState, s: Stage): Group {
  const vp = globeView(st), here = latLon(st.latitude, st.longitude), meets = latLon(st.meets.lat, st.meets.lon);
  const parallel = (lat: number) => circleOn([0, 0, 1], 90 - lat);
  const parts: Part[] = [
    { kind: 'path', key: 'henge-globe:land', lines: LAND.map((ring) => ring.map(([lon, lat]) => latLon(lat, lon))), closed: true, color: LANDLINE, width: 0.02 },
    { kind: 'path', key: 'henge-globe:equator', lines: [parallel(0)], closed: true, color: MUTED, width: 0.025 },
    { kind: 'path', key: 'henge-globe:tropics', lines: [parallel(TILT), parallel(-TILT)], closed: true, color: MUTED, width: 0.02, dashArray: '0.08 0.06' },
    { kind: 'path', key: 'henge-globe:ring', lines: [circleOn(here, 90 + REFRACTION)], closed: true, color: SUN, width: 0.025, opacity: 0.7 },
    { kind: 'path', key: 'henge-globe:year', lines: [yearArc(st)], color: SUN, width: 0.1 },
    { kind: 'path', key: 'henge-globe:street', lines: [greatArc(here, meets, 1)], color: SUMMER, width: 0.06 },
    { kind: 'point', key: 'henge-globe:here', at: here, color: INK, radius: 0.09 },
    ...st.suns.map((d): Part => ({ kind: 'point', key: `henge-globe:sun:${d.key}`, at: latLon(d.lat, d.lon), color: SUN, radius: 0.13 })),
  ];
  const picture = seenFrom({ body: { radius: 1, fill: OCEAN, fillOpacity: 0.9, stroke: MUTED, strokeWidth: 0.03, key: 'henge-globe:body' }, parts }, vp, { ...GLOBE, key: 'henge-globe:seen' });
  const at = (p: Vec3, dx: number, dy: number, anchor: -1 | 1 = -1): [Vec, Vec] => { const q = project(p, vp, 1, GLOBE).at; return [[q[0] + dx, q[1] + dy], [anchor, 0]]; };
  const g = new Group(picture);
  g.add(keyed(label(s, st.name, { color: INK, size: BIG }).moveTo(...at(here, -0.15, 0.3, 1)), 'henge-globe-here'));
  // Each Sun's date beside it, on the side away from the place.
  for (const d of st.suns) {
    const p = latLon(d.lat, d.lon), toward = project(p, vp, 1, GLOBE).at[0] < project(here, vp, 1, GLOBE).at[0] ? -1 : 1;
    g.add(keyed(label(s, d.name, { color: SUN, size: BIG }).moveTo(...at(p, toward * 0.2, -0.3, toward === -1 ? 1 : -1)), `henge-globe-sun:${d.key}`));
  }
  const words = (text: string, y: number, color: string) => label(s, text, { color, size: BIG }).moveTo([0.95, y], [-1, 0]);
  g.add(keyed(new Group(
    words('Red: the street,', 1.9, SUMMER),
    words('carried on', 1.2, SUMMER),
    words('Gold: Sun overhead', 0.2, SUN),
    words('at each half Sun', -0.5, SUN),
    words(`Meeting at ${Math.abs(st.meets.lat).toFixed(1)}° ${st.meets.lat >= 0 ? 'N' : 'S'}`, -1.5, INK),
  ), 'henge-globe-key'));
  return keyed(g, 'henge-globe');
}
