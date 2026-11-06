import { Circle, Line, Text, Group, Polygon, Dot, Arc, Arrow } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { percent } from '../lib/format.ts';

// How the seasons explainer draws one state: Earth from the side at a solstice, with the place's
// latitude circle and its noon ray, and the two noon beams set down on one stretch of level ground.

export const TILT = 23.44;
export const SUN = '#e0af68',
  EARTH = '#3d59a1',
  NIGHT = '#16161e',
  AXIS = '#9ece6a',
  PLACE = '#f7768e',
  DIMLINE = '#565f89';
export const RAD = Math.PI / 180;
export const degrees = (d: number) => d.toFixed(1) + '°';
/** A share of overhead sunlight as a whole percentage. */
export const pct = (x: number) => percent(x, { digits: 0, rounding: 'Math.round' });
export const metres = (x: number) => x.toFixed(2) + ' m';

/** The stage's colours a state is drawn in. */
export type Ink = { ink: string; soft: string; muted: string };

/** Words on the stage: 0.22 units and the stage's soft colour unless told otherwise, centred on `at` or on its `edge`. */
export const labeller = (soft: string) => (text: string, at: Vec, opts: { size?: number; color?: string; edge?: Vec } = {}) =>
  new Text(text, {
    fontSize: opts.size ?? 0.22,
    color: opts.color ?? soft,
  }).moveTo(at, opts.edge ?? [0, 0]);

/**
 * Side view of Earth at noon for one season. The drawing plane holds the
 * rotation axis and the Sun direction, so a latitude circle projects to a
 * chord and the terminator is the line through the centre facing the Sun.
 * `side` is the Sun's direction from this Earth (+1 = Sun to the right).
 */
export function sideView(center: Vec, radius: number, side: 1 | -1) {
  const e = TILT * RAD;
  // The axis keeps one direction in space: north leans toward −x.
  const a: Vec = [-Math.sin(e), Math.cos(e)];
  // The equator direction on the noon meridian, pointing toward the Sun.
  const eq: Vec = side < 0 ? [-Math.cos(e), -Math.sin(e)] : [Math.cos(e), Math.sin(e)];
  const at = (u: number, v: number): Vec => [
    center[0] + radius * (u * eq[0] + v * a[0]),
    center[1] + radius * (u * eq[1] + v * a[1]),
  ];
  /** The noon point at a latitude: cos φ along the equator, sin φ along the axis. */
  const noon = (lat: number) => at(Math.cos(lat * RAD), Math.sin(lat * RAD));
  /** A latitude circle's chord, split where it crosses the terminator. */
  const chord = (lat: number) => {
    const c = Math.cos(lat * RAD),
      sn = Math.sin(lat * RAD);
    // Sun-side component of a point: sn·(a·s) + t·(eq·s); eq·s = cos ε.
    const as = a[0] * side;
    const t0 = Math.max(-c, Math.min(c, (-sn * as) / Math.cos(e)));
    return {
      day: [at(t0, sn), at(c, sn)] as [Vec, Vec],
      night: [at(-c, sn), at(t0, sn)] as [Vec, Vec],
      far: at(-c - 0.16, sn),
    };
  };
  return { a, eq, at, noon, chord };
}

// The side views from the June step on: each solstice's Earth, its radius and where it sits.
export const R = 1.75,
  CY = 0.8,
  JUNE_C: Vec = [4.3, CY],
  DEC_C: Vec = [-4.3, CY];
export type Result = { altitude: number; daylight: number };
/** The model's state from the June step on: the fields each view reads. */
export type SeasonState = {
  place: string;
  latitude: number;
  june: Result;
  december?: Result;
  noonShare?: { june: number; december?: number };
  patch?: { june: number | null; december: number | null };
  daylightTable?: Record<'june' | 'december', Record<string, string>>;
  daylight?: number[];
  polarDay?: number;
  polarNight?: number;
  events?: { name: string; hours: number }[];
  mirror?: number[];
  distance?: { nearest: number; farthest: number };
  bars?: { tilt: [number, number]; distance: [number, number] };
};

/** One season at a latitude: Earth, night half, axis, the place's latitude circle and the noon ray. */
export function drawSeason(month: string, center: Vec, side: 1 | -1, lat: number, name: string, result: Result, { ink, soft, muted }: Ink) {
  const label = labeller(soft);
  const v = sideView(center, R, side);
  const ball = new Circle({
    radius: R,
    fill: EARTH,
    stroke: 'none',
  }).moveTo(center);
  ball.key = `${month.toLowerCase()}-globe`;
  const half: Vec[] = [];
  for (let i = 0; i <= 40; i++) {
    const th = -Math.PI / 2 + (Math.PI * i) / 40;
    half.push([center[0] - side * R * Math.cos(th), center[1] + R * Math.sin(th)]);
  }
  const night = new Polygon(half, {
    fill: NIGHT,
    fillOpacity: 0.62,
    stroke: 'none',
  });
  // The axis reaches past the north pole to carry its N; past the south pole it stops short,
  // clear of the table the latitude step sets under the globe.
  const tip = 1.2 * R,
    foot = 1.08 * R;
  const axis = new Line(
    [center[0] - foot * v.a[0], center[1] - foot * v.a[1]],
    [center[0] + tip * v.a[0], center[1] + tip * v.a[1]],
    { stroke: AXIS, strokeWidth: 0.035 },
  );
  axis.key = `${month.toLowerCase()}-axis`;
  const north = label('N', [center[0] + (tip + 0.2) * v.a[0], center[1] + (tip + 0.2) * v.a[1]], {
    size: 0.28,
    color: AXIS,
  });
  north.key = `${month.toLowerCase()}-north`;
  const equator = new Line(v.at(-1, 0), v.at(1, 0), {
    stroke: muted,
    strokeWidth: 0.02,
    dashArray: '0.08 0.06',
  });
  const ch = v.chord(lat);
  const dayLine = new Line(ch.day[0], ch.day[1], {
    stroke: SUN,
    strokeWidth: 0.07,
  });
  dayLine.key = `${month.toLowerCase()}-daylight-latitude`;
  const nightLine = new Line(ch.night[0], ch.night[1], {
    stroke: DIMLINE,
    strokeWidth: 0.05,
  });
  nightLine.key = `${month.toLowerCase()}-night-latitude`;
  const p = v.noon(lat);
  const zen: Vec = [(p[0] - center[0]) / R, (p[1] - center[1]) / R];
  const tangent: Vec = [-zen[1], zen[0]];
  const horizon = new Line(
    [p[0] - 0.55 * tangent[0], p[1] - 0.55 * tangent[1]],
    [p[0] + 0.55 * tangent[0], p[1] + 0.55 * tangent[1]],
    { stroke: ink, strokeWidth: 0.025 },
  );
  horizon.key = `${month.toLowerCase()}-horizon`;
  const dot = new Dot({ radius: 0.09, color: PLACE }).moveTo(p);
  dot.key = `${month.toLowerCase()}-place`;
  const latitude = new Group(nightLine, dayLine);
  latitude.key = `${month.toLowerCase()}-latitude`;
  const drawing = new Group(ball, night, equator, latitude, axis, north, horizon, dot);
  const ray = new Group();
  ray.key = `${month.toLowerCase()}-noon-ray`;
  if (result.altitude > 0) {
    // The noon ray arrives parallel to the Sun direction; its angle to the
    // local horizon is the model's altitude (90° − |latitude − declination|).
    const start: Vec = [side > 0 ? center[0] + R + 1.15 : center[0] - R - 1.15, p[1]];
    ray.add(
      new Arrow([side > 0 ? Math.max(start[0], p[0] + 0.9) : Math.min(start[0], p[0] - 0.9), p[1]], p, {
        stroke: SUN,
        strokeWidth: 0.035,
        tipLength: 0.2,
        tipWidth: 0.16,
      }),
    );
    // Arc between the sunward horizon direction and the ray direction.
    const hz = tangent[0] * side >= 0 ? tangent : ([-tangent[0], -tangent[1]] as Vec);
    const a0 = Math.atan2(hz[1], hz[0]),
      a1 = side > 0 ? 0 : Math.PI;
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    ray.add(
      new Arc({
        center: p,
        radius: 0.5,
        startAngle: a0,
        angle: sweep,
        stroke: SUN,
        strokeWidth: 0.025,
      }),
    );
    const mid = a0 + sweep / 2;
    ray.add(
      label(degrees(result.altitude), [p[0] + 1.0 * Math.cos(mid), p[1] + 1.0 * Math.sin(mid)], {
        size: 0.28,
        color: SUN,
      }),
    );
  } else {
    // The model puts the noon Sun below the horizon: a ray at the place's
    // height meets the day side of the globe first and never reaches it.
    const dy = p[1] - center[1],
      hit: Vec = [center[0] + side * Math.sqrt(Math.max(0, R * R - dy * dy)), p[1]];
    ray.add(
      new Arrow([center[0] + side * (R + 1.15), p[1]], hit, {
        stroke: SUN,
        strokeWidth: 0.035,
        tipLength: 0.2,
        tipWidth: 0.16,
      }),
    );
  }
  const drawn = `Earth in ${month} from the side, ${name}’s latitude circle yellow where lit`;
  const noon =
    result.altitude > 0
      ? `${month}’s noon Sun ray, ${degrees(result.altitude)} above ${name}’s horizon`
      : `${month}’s noon Sun ray, stopped by the globe: below ${name}’s horizon`;
  return {
    month,
    view: v,
    drawing,
    latitude,
    ray,
    dayLine,
    nightLine,
    daySpan: ch.day,
    drawn,
    noon,
    place: p,
    zenith: zen,
    tangent,
  };
}

/** Both noon beams on one stretch of ground, from the state's altitudes, patches and shares. */
export function drawSpread(st: SeasonState, { ink, soft }: Ink) {
  const label = labeller(soft);
  const spread = new Group();
  spread.key = 'spread';
  // Ground at y0; 1 m of beam is W units; each beam is drawn L units long on its sun-side edge. The words
  // under each patch sit in a column at ±COLUMN, so the comparison stays narrow enough for a phone to open
  // on it whole with its words at a readable size.
  const y0 = -2.6,
    W = 0.5,
    L = 1.5,
    COLUMN = 1.9,
    size = 0.34;
  const ground = new Line([-3.4, y0], [3.4, y0], { stroke: ink, strokeWidth: 0.03 });
  ground.key = 'spread-ground';
  spread.add(ground);
  /**
   * One noon beam landing on the ground, with its words in a column at `column`. `s` is the Sun's side
   * (+1 = right). The patch is centred under the column and runs patch × W away from the Sun; the beam's
   * far end is cut square to its rays, so it shows the beam's 1 m width.
   */
  const beam = (month: string, column: number, s: 1 | -1, alt: number, patch: number | null, share: number) => {
    const g = new Group();
    g.key = `spread-${month.toLowerCase()}`;
    const words = patch === null ? [month, 'Sun below the horizon'] : [`${month}, ${degrees(alt)}`, metres(patch), `${pct(share)} per m²`];
    g.add(...words.map((t, i) => label(t, [column, y0 - 0.38 - i * 0.44], { size, color: i === 1 ? SUN : ink })));
    if (patch === null) return g;
    const a = alt * RAD,
      up: Vec = [s * Math.cos(a), Math.sin(a)],
      across: Vec = [-s * Math.sin(a), Math.cos(a)];
    const near: Vec = [column + (s * patch * W) / 2, y0],
      far: Vec = [column - (s * patch * W) / 2, y0],
      t1: Vec = [near[0] + L * up[0], near[1] + L * up[1]],
      t2: Vec = [t1[0] + W * across[0], t1[1] + W * across[1]];
    const band = new Polygon([near, t1, t2, far], { fill: SUN, fillOpacity: 0.4, stroke: 'none' });
    band.key = `spread-${month.toLowerCase()}-beam`;
    const lit = new Line(near, far, { stroke: SUN, strokeWidth: 0.07 });
    lit.key = `spread-${month.toLowerCase()}-patch`;
    g.add(
      band,
      new Line(t1, t2, { stroke: SUN, strokeWidth: 0.03 }),
      lit,
      label('1 m', [(t1[0] + t2[0]) / 2 + 0.34 * up[0], (t1[1] + t2[1]) / 2 + 0.34 * up[1]], { size, color: ink }),
    );
    return g;
  };
  // December's Sun is to the right of its globe and June's to the left, as drawn above: December's beam
  // lands on the left half of the ground and June's on the right, both leaning toward the Sun between them.
  spread.add(
    beam('December', -COLUMN, 1, st.december!.altitude, st.patch!.december, st.noonShare!.december!),
    beam('June', COLUMN, -1, st.june.altitude, st.patch!.june, st.noonShare!.june),
  );
  return spread;
}
