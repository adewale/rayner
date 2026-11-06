// Henge's 3D pictures: New York's sky as a sphere around the observer, seen from outside (the dome)
// and from its centre (the street), and Earth seen from beside its orbit. Every direction on them
// comes from the ERFA-checked model in ./model.ts: a day's path is the model's sky() swept
// through the hour angle, ending at the model's own sunset hour angle. The dome and the street are
// separate steps rather than one camera move: a perspective eye must stay outside the sphere, and
// `between` joins only viewpoints of one kind, so the move to the street is the gnomonic tilt from the
// sky. The tilted Earths are seen from one viewpoint beside the orbit, so the axis keeps one direction
// on screen; it is dashed inside the translucent body.
import { Group, Rectangle, Polygon, Circle, VMobject, Arrow } from '../../../src/index.ts';
import type { Vec, Text } from '../../../src/index.ts';
import { seenFrom, project, circleOn, greatArc, label, keyed } from '../../../explain/drawing.ts';
import type { Part, Viewpoint, Vec3, SeenOptions } from '../../../explain/drawing.ts';
import { sky, LATITUDE } from './model.ts';

export const INK = '#1e293b', SUN = '#c77900', SUMMER = '#a03b22', WINTER = '#235d9b', MUTED = '#64748b', ROAD = '#eef2f6';
const SKY = '#dcebf7', GROUND = '#e4dccb', WALL = '#d8e0e8', NIGHT = '#33415c';
const rad = Math.PI / 180;

/**
 * Which way the sky sphere is seen. From `outside`, model x, y and z are east, north and up, so the
 * dome keeps the sky's handedness. seenFrom's view from the centre (gnomonic) draws the sphere as a
 * map does, east of its centre to the right as seen from outside; a camera at the centre sees that
 * mirrored, so `inside` turns north into south, and a street-level camera facing west has north on
 * its right.
 */
export type Side = 'outside' | 'inside';
type Enu = { east: number; north: number; up: number };
export const onSphere = ({ east, north, up }: Enu, side: Side): Vec3 => (side === 'outside' ? [east, north, up] : [east, -north, up]);
/** The direction at an azimuth (north 0, east 90) and altitude, in degrees. */
export const azAlt = (azimuth: number, altitude: number, side: Side): Vec3 =>
  onSphere({ east: Math.sin(azimuth * rad) * Math.cos(altitude * rad), north: Math.cos(azimuth * rad) * Math.cos(altitude * rad), up: Math.sin(altitude * rad) }, side);
/** The viewpoint facing an azimuth and altitude: seenFrom's yaw is the model longitude there. */
export const facing = (kind: Viewpoint['kind'], azimuth: number, altitude: number, side: Side, extra: Partial<Viewpoint> = {}): Viewpoint =>
  ({ kind, yaw: side === 'outside' ? 90 - azimuth : azimuth - 90, pitch: altitude, ...extra });
/** A day's path, by the model's sky() from hour angle `from` to `to` (degrees, west positive), a point at least every `step`. */
export function dayPath(declination: number, from: number, to: number, side: Side, step = 2): Vec3[] {
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
  return Array.from({ length: n + 1 }, (_, i) => onSphere(sky(LATITUDE, declination, from + ((to - from) * i) / n), side));
}
/** The street's vertical circle above the ground: from the horizon at its bearing, over the zenith, to its other end. */
export function streetCircle(bearing: number, side: Side): Vec3[] {
  const zenith: Vec3 = [0, 0, 1];
  return [...greatArc(azAlt(bearing, 0, side), zenith, 2), ...greatArc(zenith, azAlt(bearing + 180, 0, side), 2).slice(1)];
}
/** A small round marker lying on the sphere around `p`, `size` degrees across. */
const marker = (key: string, p: Vec3, color: string, size: number, fillOpacity = 1): Part =>
  ({ kind: 'face', key, rings: [circleOn(p, size / 2, 1, 12)], fill: color, fillOpacity, stroke: color, width: 0.012, hidden: 'behind' });

/** One day on the sky sphere: its declination and the model's sunset hour angle for it. */
export interface Day { declination: number; hourAngle: number }
/**
 * A day's path in two parts: the day, sunrise to sunset, strong, dashed where the dome hides it;
 * and the night below the horizon, faint and dashed. Each part keeps some of itself in sight from
 * the dome's eye all year (the sunset end) and some hidden (the sunrise end), so as the year turns
 * no piece of it appears or vanishes from one frame to the next.
 */
function dayParts(key: string, d: Day, color: string, side: Side, width = 0.06): Part[] {
  return [
    { kind: 'path', key: `${key}:night`, lines: [dayPath(d.declination, d.hourAngle, 360 - d.hourAngle, side)], color, width: 0.02, opacity: 0.5, dashArray: '0.09 0.07' },
    { kind: 'path', key: `${key}:day`, lines: [dayPath(d.declination, -d.hourAngle, d.hourAngle, side)], color, width, hidden: 'dashed' },
  ];
}
/** The sunset point of a day: where the model's sky() puts the Sun at its sunset hour angle, on the horizon. */
export const sunsetOf = (d: Day, side: Side): Vec3 => onSphere(sky(LATITUDE, d.declination, d.hourAngle), side);
/** The celestial pole: the model's sky() at declination 90°, LATITUDE degrees above the north point. */
const poleOf = (side: Side): Vec3 => onSphere(sky(LATITUDE, 90, 0), side);

// ---------------------------------------------------------------- the dome, seen from outside
const DOME_BODY = { radius: 1, fill: SKY, fillOpacity: 0.3, stroke: MUTED, strokeWidth: 0.03, key: 'henge-dome:body' };
/**
 * A hemisphere as a face of eight sectors, rim to centre, rather than one cap: a cap as large as a
 * hemisphere is cut by the limb at two nearly opposite points, and the arc seenFrom draws between
 * them strays off the limb by more than depthOrder allows. Each sector's cut is short.
 */
function hemisphere(centre: Vec3): Vec3[][] {
  const rim = circleOn(centre, 90, 1, 3);
  return Array.from({ length: 8 }, (_, k) => {
    const edge = Array.from({ length: 16 }, (_, i) => rim[(k * 15 + i) % rim.length]!);
    return [...edge, ...greatArc(edge.at(-1)!, centre, 3).slice(1), ...greatArc(centre, edge[0]!, 3).slice(1, -1)];
  });
}
/** The ground under the horizon, drawn on the near side only, so the dome reads as sky above and earth below. */
const ground: Part = { kind: 'face', key: 'henge-dome:ground', fill: GROUND, fillOpacity: 1, rings: hemisphere([0, 0, -1]) };
const horizon: Part = { kind: 'path', key: 'henge-dome:horizon', lines: [circleOn([0, 0, 1], 90)], closed: true, color: INK, width: 0.035, hidden: 'dashed' };
const street = (bearing: number): Part => ({ kind: 'path', key: 'henge-dome:street', lines: [streetCircle(bearing, 'outside')], color: SUMMER, width: 0.055, hidden: 'behind' });
/**
 * The celestial pole, which every day's path circles, and the axis to it from the observer at the
 * centre, seen through the dome (it stops just short of the sphere, so it is a line through the body).
 */
const pole = marker('henge-dome:pole', poleOf('outside'), INK, 3.4);
const [px, py, pz] = poleOf('outside');
const axis: Part = { kind: 'path', key: 'henge-dome:axis', lines: [[[0, 0, 0], [px * 0.995, py * 0.995, pz * 0.995]]], color: INK, width: 0.03, hidden: 'dashed' };

/**
 * The dome is seen from outside, west of it and above, facing the western sky where every sunset
 * is: from there north is on the left. The eye stays put whichever way the street points, since
 * the sky does not change with it.
 */
export const DOME_VIEW: Viewpoint = facing('orthographic', 282, 28, 'outside');
export const DOME: SeenOptions = { at: [-1.6, -0.6], scale: 2.95 };

export interface SkyState { bearing: number; days: (Day & { azimuth: number })[] }
const DAY_NAMES = ['December', 'Equinox', 'June'];
const DAY_COLORS = [WINTER, MUTED, SUN];
/** A label beside a point on the dome, drawn from the same viewpoint. */
function nameAt(text: string, p: Vec3, vp: Viewpoint, o: SeenOptions, offset: Vec, anchor: -1 | 0 | 1, color: string, size = 0.52): Text {
  const { at } = project(p, vp, 1, o);
  return label(text, 0, 0, color, size).moveTo([at[0] + offset[0], at[1] + offset[1]], [anchor, 0]);
}
/** Compass points just outside the horizon, away from the dome's centre. */
function compass(vp: Viewpoint, o: SeenOptions, side: Side): Text[] {
  const c = project([0, 0, 0], vp, 1, o).at;
  return ([['N', 0], ['S', 180], ['W', 270]] as const).map(([name, az]) => {
    const p = project(azAlt(az, 0, side), vp, 1, o).at, dx = p[0] - c[0], dy = p[1] - c[1], h = Math.hypot(dx, dy) || 1;
    return label(name, p[0] + (dx / h) * 0.36, p[1] + (dy / h) * 0.36, MUTED, 0.52);
  });
}
/** Where the horizon's name goes: beside the horizon's southern end, outside the dome. */
const horizonLabelAt = (): Vec => { const p = project(azAlt(205, 0, 'outside'), DOME_VIEW, 1, DOME).at; return [p[0] + 0.55, p[1] - 0.15]; };
/** The street's name, beside its circle low on its western side, where the sky is clear of the day's paths. */
const streetName = (bearing: number, key: string) =>
  keyed(new Group(nameAt('Street', azAlt(bearing, 16, 'outside'), DOME_VIEW, DOME, [-0.22, 0], 1, SUMMER)), key);

/** The sky step: December's, the equinox's and June's paths on the dome, each ending at its sunset, with the street's vertical circle. */
export function dome(st: SkyState): Group {
  const vp = DOME_VIEW, side: Side = 'outside';
  const parts: Part[] = [ground, horizon];
  st.days.forEach((d, i) => parts.push(...dayParts(`henge-dome:${DAY_NAMES[i]!.toLowerCase()}`, d, DAY_COLORS[i]!, side)));
  parts.push(street(st.bearing), axis, pole);
  st.days.forEach((d, i) => parts.push(marker(`henge-dome:sunset:${i}`, sunsetOf(d, side), DAY_COLORS[i]!, 3.6)));
  const picture = seenFrom({ body: DOME_BODY, parts }, vp, { ...DOME, key: 'henge-dome:seen' });
  const g = new Group(picture, ...compass(vp, DOME, side));
  // Each path is named beside its highest point, noon.
  st.days.forEach((d, i) => g.add(nameAt(DAY_NAMES[i]!, onSphere(sky(LATITUDE, d.declination, 0), side), vp, DOME, [0.2, 0.3], -1, DAY_COLORS[i]!)));
  g.add(streetName(st.bearing, 'henge-dome-street'),
    nameAt('Pole', poleOf(side), vp, DOME, [-0.18, 0], 1, INK, 0.52),
    keyed(new Group(label('New York’s horizon', 0, 0, INK, 0.52).moveTo(horizonLabelAt(), [-1, 0])), 'henge-dome-horizon'));
  return keyed(g, 'henge-dome');
}

// ---------------------------------------------------------------- the year: one day's path, turned by the declination
export interface YearState { bearing: number; longitude: number; start: number; crossings: number[] }
/** The day at an orbital longitude, through the model: its declination, sunset hour angle and sunset azimuth. */
export type DayAt = (longitude: number) => Day & { azimuth: number };
/** How far along the horizon the sunsets have reached between `start` and `longitude`: the southmost and northmost azimuths. */
function reach(dayAt: DayAt, start: number, longitude: number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  const n = Math.max(1, Math.ceil(longitude - start));
  for (let i = 0; i <= n; i++) {
    const a = dayAt(start + ((longitude - start) * i) / n).azimuth;
    lo = Math.min(lo, a); hi = Math.max(hi, a);
  }
  return [lo, hi];
}
/** The crossings passed between `start` and `longitude`. */
export const crossedBy = (st: YearState) => st.crossings.filter((c) => c > st.start && c <= st.longitude).length;
/**
 * The sweep step at one orbital longitude: that day's path and sunset, the stretch of horizon the
 * sunsets have covered since `start`, and the street's circle, marked once the sunset has crossed it.
 */
export function year(st: YearState, dayAt: DayAt): Group {
  const vp = DOME_VIEW, side: Side = 'outside', today = dayAt(st.longitude);
  const [lo, hi] = reach(dayAt, st.start, st.longitude);
  const steps = Math.max(1, Math.ceil(hi - lo));
  const crossed = crossedBy(st);
  // The crossing's marker fills over the next few degrees of the orbit, rather than in one frame.
  const fill = Math.max(0, ...st.crossings.filter((c) => c > st.start).map((c) => Math.min(1, (st.longitude - c) / 6)));
  const trail: Part = { kind: 'path', key: 'henge-year:trail', lines: [Array.from({ length: steps + 1 }, (_, i) => azAlt(lo + ((hi - lo) * i) / steps, 0, side))], color: SUN, width: 0.16, opacity: 0.45, hidden: 'behind' };
  const parts: Part[] = [ground, horizon, trail, ...dayParts('henge-year:today', today, SUN, side, 0.07), street(st.bearing), axis, pole,
    marker('henge-year:crossing', azAlt(st.bearing, 0, side), SUMMER, 6, fill),
    marker('henge-year:sunset', sunsetOf(today, side), SUN, 3.6)];
  const picture = seenFrom({ body: DOME_BODY, parts }, vp, { ...DOME, key: 'henge-year:seen' });
  return keyed(new Group(picture, ...compass(vp, DOME, side), streetName(st.bearing, 'henge-year-street'),
    nameAt('Pole', poleOf(side), vp, DOME, [-0.18, 0], 1, INK, 0.52),
    keyed(new Group(label('Gold band:', 0, 0, SUN, 0.52).moveTo([2.3, -1.65], [-1, 0]),
      label('the sunsets so far', 0, 0, SUN, 0.52).moveTo([2.3, -2.3], [-1, 0]),
      label(`Street crossings: ${crossed}`, 0, 0, SUMMER, 0.52).moveTo([2.3, -3.25], [-1, 0])), 'henge-year-count'),
  ), 'henge-year');
}

// ---------------------------------------------------------------- the street, seen from the sphere's centre
/** Looking along the street from its middle, `pitch` degrees up, through a lens `scale` units to the radian. */
export interface LookState { bearing: number; pitch: number; scale: number; day: Day }
/** The street-level camera's window in scene units. */
export const WINDOW = { left: -5.9, right: 5.9, bottom: -3.0, top: 2.75 };
const CENTRE: Vec = [0, 0];
export const lookView = (bearing: number, pitch: number): Viewpoint => facing('gnomonic', bearing, pitch, 'inside', { limit: 80 });
/** The street in the observer's frame, in metres: half its width, the walls' height and far end, the eye's height. */
const CANYON = { half: 15, height: 14, near: 2, far: 80, eye: 1.7 };
/** The view's axes, as seenFrom's gnomonic lens has them. */
function axes(vp: Viewpoint) {
  const p = vp.pitch * rad, l = vp.yaw * rad;
  return {
    toward: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)] as Vec3,
    right: [-Math.sin(l), Math.cos(l), 0] as Vec3,
    up: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)] as Vec3,
  };
}
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/**
 * A point in front of the eye placed as the gnomonic view places it: the camera at the sphere's
 * centre is a pinhole, so the same rule draws the buildings, which are nearer than the sky and hide it.
 */
function pinhole(p: Vec3, vp: Viewpoint, o: { at: Vec; scale: number }): Vec {
  const { toward, right, up } = axes(vp), k = o.scale / dot3(p, toward);
  return [o.at[0] + k * dot3(p, right), o.at[1] + k * dot3(p, up)];
}
/** A flat polygon in the observer's frame, cut where it passes behind the eye, as the pinhole draws it. */
function flat(corners: Vec3[], vp: Viewpoint, o: { at: Vec; scale: number }): Vec[] {
  const { toward } = axes(vp);
  const depth = (p: Vec3) => dot3(p, toward) - 0.5;
  const kept: Vec3[] = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]!, da = depth(a), db = depth(b);
    if (da >= 0) kept.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); kept.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  });
  return kept.map((p) => pinhole(p, vp, o));
}
/** The canyon's surfaces in the model's (inside) frame: the road, then each wall. */
function canyon(bearing: number) {
  const along = azAlt(bearing, 0, 'inside'), across = azAlt(bearing + 90, 0, 'inside');
  const at = (d: number, x: number, z: number): Vec3 => [along[0] * d + across[0] * x, along[1] * d + across[1] * x, along[2] * d + z];
  const { half, height, near, far, eye } = CANYON;
  return {
    road: [at(near, -half * 0.55, -eye), at(far * 60, -half * 0.55, -eye), at(far * 60, half * 0.55, -eye), at(near, half * 0.55, -eye)],
    walls: [-1, 1].map((s) => [at(near, s * half, -eye), at(far, s * half, -eye), at(far, s * half, height - eye), at(near, s * half, height - eye)]),
  };
}
/** A polygon, or an unseen one where the eye sees none of it, so the picture keeps its shape from frame to frame. */
const shape = (points: Vec[], style: ConstructorParameters<typeof Polygon>[1]) =>
  (points.length > 2 ? new Polygon(points, style) : new Polygon([[0, 0], [0.01, 0], [0, 0.01]], { ...style, opacity: 0 }));

/** The disc's drawn radius: enlarged, as on the street views (the Sun is 0.53° across). */
const DISC = 0.42;
/**
 * The look step's picture: the sky sphere from its centre, then what is nearer than the sky (the
 * Sun's disc, the ground, the road and the walls), each placed by the same pinhole, then the frame.
 */
export function look(st: LookState, paper: string, names: { day: string }): Group {
  const vp = lookView(st.bearing, st.pitch), side: Side = 'inside';
  const o = { at: CENTRE, scale: st.scale };
  const parts: Part[] = [
    { kind: 'path', key: 'henge-look:horizon', lines: [circleOn([0, 0, 1], 90)], closed: true, color: INK, width: 0.035 },
    { kind: 'path', key: 'henge-look:street', lines: [circleOn(azAlt(st.bearing + 90, 0, side), 90)], closed: true, color: SUMMER, width: 0.045 },
    { kind: 'path', key: 'henge-look:day', lines: [dayPath(st.day.declination, -st.day.hourAngle, st.day.hourAngle, side)], color: SUN, width: 0.075 },
  ];
  const sky3 = seenFrom({ body: { radius: 1, fill: 'none', stroke: 'none', key: 'henge-look:body' }, parts }, vp, { ...o, key: 'henge-look:seen' });
  // The Sun's disc, centred where the day's path meets the horizon: half Sun.
  const sun = project(sunsetOf(st.day, side), vp, 1, o);
  const disc = new Circle({ radius: DISC, fill: SUN, stroke: SUN, opacity: sun.seen ? 1 : 0 }).moveTo(sun.at);
  // Below the horizon is the ground: it hides each path's night and the lower half of the disc.
  const horizonY = pinhole(azAlt(st.bearing, 0, side), vp, o)[1];
  const top = Math.min(WINDOW.top, Math.max(WINDOW.bottom, horizonY));
  const ground = new Rectangle({ width: WINDOW.right - WINDOW.left, height: top - WINDOW.bottom + 0.02, fill: paper, stroke: 'none' })
    .moveTo([(WINDOW.left + WINDOW.right) / 2, (top + WINDOW.bottom - 0.02) / 2]);
  const { road, walls } = canyon(st.bearing);
  const roadShape = shape(flat(road, vp, o), { fill: ROAD, stroke: 'none' });
  const wallShapes = walls.map((w) => shape(flat(w, vp, o), { fill: WALL, stroke: MUTED, strokeWidth: 0.03 }));
  // Paper outside the camera's window: the sky and the street end at its edge.
  const mask = new VMobject({ fill: paper, stroke: 'none', fillRule: 'evenodd' });
  const ring = (pts: Vec[]) => { mask.startNewPath(pts[0]!); for (const p of pts.slice(1)) mask.addLineTo(p); mask.closePath(); };
  ring([[-9, -6], [9, -6], [9, 6], [-9, 6]]);
  ring([[WINDOW.left, WINDOW.bottom], [WINDOW.right, WINDOW.bottom], [WINDOW.right, WINDOW.top], [WINDOW.left, WINDOW.top]]);
  // The window's edge: what a phone opens on, since the sky's lines run on past it under the paper.
  const border = keyed(new Rectangle({ width: WINDOW.right - WINDOW.left, height: WINDOW.top - WINDOW.bottom, fill: 'none', stroke: MUTED, strokeWidth: 0.025 })
    .moveTo([(WINDOW.left + WINDOW.right) / 2, (WINDOW.top + WINDOW.bottom) / 2]), 'henge-look-window');
  // From the centre, looking along the street, its circle is the vertical line through the middle at every pitch.
  const legend = keyed(new Group(
    label('Street', 0, 0, SUMMER, 0.52).moveTo([CENTRE[0] + 0.2, WINDOW.top - 0.4], [-1, 0]),
    label(`Gold: a ${names.day} evening’s path`, 0, 0, SUN, 0.52).moveTo([CENTRE[0], WINDOW.bottom - 0.45]),
  ), 'henge-look-legend');
  // Facing the street's western end, south is on the left and north on the right.
  const sides = keyed(new Group(label('← south', 0, 0, MUTED, 0.52).moveTo([WINDOW.left + 0.25, WINDOW.bottom + 0.4], [-1, 0]),
    label('north →', 0, 0, MUTED, 0.52).moveTo([WINDOW.right - 0.25, WINDOW.bottom + 0.4], [1, 0])), 'henge-look-sides');
  return keyed(new Group(sky3, keyed(new Group(disc), 'henge-look-sun'), ground, roadShape, ...wallShapes, mask, border, legend, sides), 'henge-look');
}

// ---------------------------------------------------------------- Earth beside its orbit
/** The tilt step's state: the tilt, New York's latitude, and the model's sunset hour angle at each solstice. */
export interface GlobeState { tilt: number; latitude: number; june: Day; december: Day }
/** Both Earths are seen from one viewpoint, beside the orbit and above it, so the axis is drawn leaning the same way in each. */
const GLOBE_VIEW: Viewpoint = { kind: 'orthographic', yaw: -82, pitch: 32 };
/**
 * New York's daily circle on one Earth, in a frame fixed to the orbit: model z is the orbit's
 * north, x points along the orbit toward the December side, and the axis leans `tilt` degrees
 * toward +x all year. `sun` points from this Earth to the Sun (+x for June's, left of the Sun;
 * -x for December's), and `atHour(h)` is the point of the circle where the Sun's hour angle is h
 * (degrees, west positive): noon faces the Sun as far as the axis allows, and Earth turns east.
 */
function newYorkCircle(side: 1 | -1, st: Pick<GlobeState, 'tilt' | 'latitude'>) {
  const t = st.tilt * rad, axis: Vec3 = [Math.sin(t), 0, Math.cos(t)];
  const sun: Vec3 = [side, 0, 0];
  const k = dot3(sun, axis), v: Vec3 = [sun[0] - k * axis[0], sun[1] - k * axis[1], sun[2] - k * axis[2]], n = Math.hypot(...v);
  const noon: Vec3 = [v[0] / n, v[1] / n, v[2] / n];
  const east: Vec3 = [axis[1] * noon[2] - axis[2] * noon[1], axis[2] * noon[0] - axis[0] * noon[2], axis[0] * noon[1] - axis[1] * noon[0]];
  const phi = st.latitude * rad;
  const atHour = (h: number): Vec3 => {
    const c = Math.cos(phi) * Math.cos(h * rad), s = Math.cos(phi) * Math.sin(h * rad), z = Math.sin(phi);
    return [noon[0] * c + east[0] * s + axis[0] * z, noon[1] * c + east[1] * s + axis[1] * z, noon[2] * c + east[2] * s + axis[2] * z];
  };
  return { axis, sun, atHour };
}
/**
 * Earth at one solstice. New York's daily circle is cut where the model's sunset hour angle puts
 * its sunset and sunrise: the gold arc is in daylight, the dark one in night.
 */
function earth(side: 1 | -1, st: GlobeState, at: Vec, key: string): Group {
  const { axis, sun, atHour } = newYorkCircle(side, st);
  const d = side === 1 ? st.june : st.december;
  const arc = (from: number, to: number) => { const n = Math.ceil(Math.abs(to - from) / 3); return Array.from({ length: n + 1 }, (_, i) => atHour(from + ((to - from) * i) / n)); };
  const north: Vec3 = [axis[0] * 1.55, 0, axis[2] * 1.55], south: Vec3 = [-axis[0] * 1.45, 0, -axis[2] * 1.45];
  const parts: Part[] = [
    { kind: 'face', key: `${key}:night-side`, rings: hemisphere([-sun[0], -sun[1], -sun[2]]), fill: NIGHT, fillOpacity: 0.16 },
    { kind: 'path', key: `${key}:equator`, lines: [circleOn(axis, 90)], closed: true, color: MUTED, width: 0.02, opacity: 0.7 },
    { kind: 'path', key: `${key}:terminator`, lines: [circleOn(sun, 90)], closed: true, color: MUTED, width: 0.025, dashArray: '0.08 0.06' },
    { kind: 'path', key: `${key}:night`, lines: [arc(d.hourAngle, 360 - d.hourAngle)], color: NIGHT, width: 0.05, hidden: 'dashed' },
    { kind: 'path', key: `${key}:day`, lines: [arc(-d.hourAngle, d.hourAngle)], color: SUN, width: 0.07, hidden: 'dashed' },
    // The axis: dashed where it runs inside Earth (stopping just short of the surface, so seenFrom
    // takes it for a line through the body, not an arc on it), solid where it stands out of each pole.
    { kind: 'path', key: `${key}:axis`, lines: [[[-axis[0] * 0.995, 0, -axis[2] * 0.995], [axis[0] * 0.995, 0, axis[2] * 0.995]]], color: INK, width: 0.045, hidden: 'dashed' },
    { kind: 'path', key: `${key}:axis-north`, lines: [[axis, north]], color: INK, width: 0.05, hidden: 'behind' },
    { kind: 'path', key: `${key}:axis-south`, lines: [[[-axis[0], 0, -axis[2]], south]], color: INK, width: 0.05, hidden: 'behind' },
    { kind: 'point', key: `${key}:new-york`, at: atHour(0), color: SUMMER, radius: 0.09 },
  ];
  const o: SeenOptions = { at, scale: 1.3 };
  const g = seenFrom({ body: { radius: 1, fill: '#e0edf7', fillOpacity: 0.6, stroke: WINTER, strokeWidth: 0.03, key: `${key}:body` }, parts }, GLOBE_VIEW, { ...o, key: `${key}:seen` });
  const n = project(north, GLOBE_VIEW, 1, o).at;
  return new Group(g, label('N', n[0] + 0.14, n[1] + 0.32, INK, 0.52));
}
/** The tilt step: June's Earth left of the Sun, December's right, one axis direction for both. */
export function globes(st: GlobeState): Group {
  const g = new Group(new Circle({ radius: 0.6, fill: SUN, stroke: SUN }), label('Sun', 0, -1.05, SUN, 0.58),
    new Arrow([0.75, 0], [2.55, 0], { stroke: SUN, strokeWidth: 0.045 }), new Arrow([-0.75, 0], [-2.55, 0], { stroke: SUN, strokeWidth: 0.045 }));
  g.add(earth(1, st, [-4.3, 0], 'henge-earth:june'), earth(-1, st, [4.3, 0], 'henge-earth:december'),
    label('June', -4.3, 2.45, INK, 0.58), label('December', 4.3, 2.45, INK, 0.58),
    label('North sunward', -4.3, -2.05, INK, 0.58), label('North away', 4.3, -2.05, INK, 0.58),
    keyed(new Group(label('Red dot: New York at noon, on its daily circle', 0, -2.85, SUMMER, 0.52),
      label('Gold: the circle in daylight; dark: in night', 0, -3.5, INK, 0.52)), 'henge-earth-legend'));
  return keyed(g, 'henge-orbit');
}
