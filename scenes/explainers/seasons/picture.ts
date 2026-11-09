import { Circle, Line, Text, Group, Polygon, Dot, Arc, Arrow, Rectangle, Axes, keyed } from '../../../src/index.ts';
import type { Box, Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { card } from '../../../explain/drawing.ts';
import { percent } from '../lib/format.ts';
import { MID_MONTH } from './model.ts';

// How the seasons explainer draws one state: Earth from the side at a solstice, with the place's
// latitude circle and its noon ray, and the two noon beams set down on one stretch of level ground.

export const TILT = 23.44;
export const SUN = '#e0af68',
  EARTH = '#3d59a1',
  NIGHT = '#16161e',
  AXIS = '#9ece6a',
  PLACE = '#f7768e',
  DIMLINE = '#565f89';
const RAD = Math.PI / 180;
export const degrees = (d: number) => d.toFixed(1) + '°';
/** A share of overhead sunlight as a whole percentage. */
export const pct = (x: number) => percent(x, { digits: 0, rounding: 'Math.round' });
export const metres = (x: number) => x.toFixed(2) + ' m';
export const hours = (h: number) => h.toFixed(1) + ' h';
/** A latitude as a reader names it: 51.5° N, 33.9° S. */
export const latitudeName = (lat: number) => `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'S' : 'N'}`;
/** A latitude or angle to the hundredth it is given in, trailing zeros dropped: the noon formula's operands. */
export const exactly = (d: number) => +d.toFixed(2) + '°';
/** Earth drawn lit in the orbit views. */
export const LIT_EARTH = '#7aa2f7';
// The year chart's colours: this place's curve, December's mark, and the mirrored latitude's curve.
const CURVE = '#7aa2f7',
  DEC = '#7dcfff',
  MIRROR = '#bb9af7';

/** The stage's colours a state is drawn in. */
export type Ink = { ink: string; soft: string; muted: string };

/** Words on the stage: 0.22 units and the stage's soft colour unless told otherwise, centred on `at` or on its `edge`. */
const labeller = (soft: string) => (text: string, at: Vec, opts: { size?: number; color?: string; edge?: Vec } = {}) =>
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
function drawSeason(month: string, center: Vec, side: 1 | -1, lat: number, name: string, result: Result, { ink, soft, muted }: Ink) {
  const label = labeller(soft);
  const v = sideView(center, R, side);
  const ball = new Circle({
    radius: R,
    fill: EARTH,
    stroke: 'none',
  }).moveTo(center);
  keyed(ball, `${month.toLowerCase()}-globe`);
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
  keyed(axis, `${month.toLowerCase()}-axis`);
  const north = label('N', [center[0] + (tip + 0.2) * v.a[0], center[1] + (tip + 0.2) * v.a[1]], {
    size: 0.28,
    color: AXIS,
  });
  keyed(north, `${month.toLowerCase()}-north`);
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
  keyed(dayLine, `${month.toLowerCase()}-daylight-latitude`);
  const nightLine = new Line(ch.night[0], ch.night[1], {
    stroke: DIMLINE,
    strokeWidth: 0.05,
  });
  keyed(nightLine, `${month.toLowerCase()}-night-latitude`);
  const p = v.noon(lat);
  const zen: Vec = [(p[0] - center[0]) / R, (p[1] - center[1]) / R];
  const tangent: Vec = [-zen[1], zen[0]];
  const horizon = new Line(
    [p[0] - 0.55 * tangent[0], p[1] - 0.55 * tangent[1]],
    [p[0] + 0.55 * tangent[0], p[1] + 0.55 * tangent[1]],
    { stroke: ink, strokeWidth: 0.025 },
  );
  keyed(horizon, `${month.toLowerCase()}-horizon`);
  const dot = new Dot({ radius: 0.09, color: PLACE }).moveTo(p);
  keyed(dot, `${month.toLowerCase()}-place`);
  const latitude = new Group(nightLine, dayLine);
  keyed(latitude, `${month.toLowerCase()}-latitude`);
  const drawing = new Group(ball, night, equator, latitude, axis, north, horizon, dot);
  const ray = new Group();
  keyed(ray, `${month.toLowerCase()}-noon-ray`);
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
  keyed(spread, 'spread');
  // Ground at y0; 1 m of beam is W units; each beam is drawn L units long on its sun-side edge. The words
  // under each patch sit in a column at ±COLUMN, so the comparison stays narrow enough for a phone to open
  // on it whole with its words at a readable size.
  const y0 = -2.6,
    W = 0.5,
    L = 1.5,
    COLUMN = 1.9,
    size = 0.34;
  const ground = new Line([-3.4, y0], [3.4, y0], { stroke: ink, strokeWidth: 0.03 });
  keyed(ground, 'spread-ground');
  spread.add(ground);
  /**
   * One noon beam landing on the ground, with its words in a column at `column`. `s` is the Sun's side
   * (+1 = right). The patch is centred under the column and runs patch × W away from the Sun; the beam's
   * far end is cut square to its rays, so it shows the beam's 1 m width.
   */
  const beam = (month: string, column: number, s: 1 | -1, alt: number, patch: number | null, share: number) => {
    const g = new Group();
    keyed(g, `spread-${month.toLowerCase()}`);
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
    keyed(band, `spread-${month.toLowerCase()}-beam`);
    const lit = new Line(near, far, { stroke: SUN, strokeWidth: 0.07 });
    keyed(lit, `spread-${month.toLowerCase()}-patch`);
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

/** The common guess: an exaggerated oval orbit with the Sun off centre, Earth nearest at one end and farthest at the other. */
export function drawGuess({ ink, soft, muted }: Ink) {
  const label = labeller(soft);
  const oc: Vec = [0, -0.6],
    orx = 6.2,
    ory = 3.0,
    sunX = oc[0] - 1.9;
  const orbit = new Circle({ radius: 1, stroke: muted, strokeWidth: 0.025 })
    .stretch(orx, 0)
    .stretch(ory, 1)
    .moveTo(oc);
  // Each Earth's words sit inside the orbit beside it, edge toward the Earth, clear of the line.
  const at = (x: number, word: string, edge: Vec) =>
    new Group(
      new Circle({ radius: 0.42, fill: LIT_EARTH, stroke: 'none' }).moveTo([x, oc[1]]),
      label(word, [x - edge[0] * 0.68, oc[1] + 0.25], { size: 0.42, color: ink, edge }),
      label('which month?', [x - edge[0] * 0.68, oc[1] - 0.3], { size: 0.36, color: SUN, edge }),
    );
  const near = at(oc[0] - orx, 'nearest', [-1, 0]),
    far = at(oc[0] + orx, 'farthest', [1, 0]);
  const sun = new Group(
    new Circle({ radius: 0.62, fill: SUN, stroke: 'none' }).moveTo([sunX, oc[1]]),
    label('Sun', [sunX, oc[1] + 1.0], { size: 0.36, color: ink }),
  );
  const g = new Group(orbit, sun, near, far);
  keyed(g, 'nearest-orbit');
  return g;
}

/** The orbit around the Sun, with Earth at each solstice and equinox, its axis tilted the same way each time. */
export function drawOrbit({ ink, soft, muted }: Ink) {
  const label = labeller(soft);
  const c: Vec = [0, -0.55],
    rx = 6.0,
    ry = 2.4;
  const orbit = new Circle({
    radius: 1,
    stroke: muted,
    strokeWidth: 0.02,
  })
    .stretch(rx, 0)
    .stretch(ry, 1)
    .moveTo(c);
  const sun = new Circle({ radius: 0.5, fill: SUN, stroke: 'none' }).moveTo(c);
  /**
   * The name goes under June's and December's Earths, moved sideways by `out` off the orbit line,
   * and beside September's and March's, above or below the line (`below`), clear of the axis.
   */
  const earth = (x: number, y: number, name: string, below: boolean, bright: boolean, out = 0) => {
    const e = TILT * RAD,
      r = 0.44,
      len = 0.74;
    const globe = new Circle({
      radius: r,
      fill: bright ? LIT_EARTH : EARTH,
      stroke: 'none',
    }).moveTo([x, y]);
    keyed(globe, `orbit-earth:${name}`);
    const g = new Group(
      globe,
      new Line([x + len * Math.sin(e), y - len * Math.cos(e)], [x - len * Math.sin(e), y + len * Math.cos(e)], {
        stroke: AXIS,
        strokeWidth: 0.04,
      }),
      label('N', [x - (len + 0.18) * Math.sin(e), y + (len + 0.18) * Math.cos(e)], {
        size: 0.26,
        color: AXIS,
      }),
      label(name, bright ? [x + out, y - 1.05] : [x + 0.62, below ? y - 0.5 : y + 0.5], {
        size: bright ? 0.34 : 0.3,
        color: bright ? ink : soft,
        edge: bright ? [0, 0] : [-1, 0],
      }),
    );
    return g;
  };
  const june = earth(c[0] + rx, c[1], 'June', true, true, 0.35),
    december = earth(c[0] - rx, c[1], 'December', true, true, -0.45),
    september = earth(c[0], c[1] + ry, 'September', false, false),
    march = earth(c[0], c[1] - ry, 'March', true, false);
  return { orbit, sun, june, december, september, march };
}

/** Beside December's Earth: nearest the Sun in early January. */
export function drawNearestNote(soft: string) {
  const label = labeller(soft);
  const note = new Group(
    label('nearest the Sun:', [-6.0, 1.45], { size: 0.32, color: SUN }),
    label('early January', [-6.0, 1.0], { size: 0.32, color: SUN }),
  );
  keyed(note, 'nearest-note');
  return note;
}

/** A solstice's side view, from the state: June's Earth on the right, December's on the left. */
export const sideOf = (st: SeasonState, month: 'June' | 'December', colours: Ink) =>
  month === 'June'
    ? drawSeason('June', JUNE_C, -1, st.latitude, st.place, st.june, colours)
    : drawSeason('December', DEC_C, 1, st.latitude, st.place, st.december!, colours);

/** Where a season's daylight callout points: the middle of the lit part of the place's circle, and the gap down to just under the globe. */
export function daylightAnchor(S: ReturnType<typeof drawSeason>) {
  const [a, b] = S.daySpan;
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return { mid, gap: mid[1] - (CY - R - 0.3) };
}

/** A line said under a keyed callout's words, in the Sun's colour. */
const underCallout = (callout: Mobject, text: string, soft: string) => {
  const under = callout.find(`${callout.key}:text`)!.center();
  return labeller(soft)(text, [under[0], under[1] - 0.44], {
    size: 0.28,
    color: SUN,
  });
};
/** Under a daylight callout: a noon Sun below the horizon, which has no angle to label it. */
export const belowHorizonNote = (callout: Mobject, altitude: number, soft: string) =>
  underCallout(callout, `Noon Sun ${degrees(altitude)}, below the horizon`, soft);
/** Under a daylight callout: that solstice's noon sunlight per square metre. */
export const shareNote = (callout: Mobject, share: number, soft: string) =>
  underCallout(callout, `Noon: ${pct(share)} of overhead sunlight per m²`, soft);

/** The noon altitude as the reader can check it: operands as given, to the hundredth, and their result, exact to the hundredth too. */
export const formulaOf = (st: SeasonState) => `90° − |${exactly(st.latitude)} − ${exactly(TILT)}| = ${exactly(st.june.altitude)}`;

/**
 * The noon close-up from the state: the beam, its patch, the share and the formula, and the camera's
 * view that holds them. Labels read at 14 px even judged without the zoom, which nearly doubles them.
 */
export function drawNoon(st: SeasonState, colours: Ink) {
  const { ink, soft } = colours,
    label = labeller(soft);
  const S = sideOf(st, 'June', colours),
    share = st.noonShare!.june;
  const notes = new Group();
  keyed(notes, 'noon-notes');
  const p = S.place,
    start = Math.min(1.45, p[0] - 0.9);
  const small = 0.2,
    pitch = small * 1.3 * 1.55;
  // The June Sun is to the left (side −1): the horizon's sunward direction points left.
  const t = S.tangent,
    z = S.zenith,
    sunward: Vec = t[0] <= 0 ? t : [-t[0], -t[1]];
  // A beam BEAM wide, at right angles to the rays, lands on BEAM / sin(altitude) of the horizon:
  // from the red dot, along the horizon away from the Sun.
  const BEAM = 0.3,
    spread = BEAM / share,
    q: Vec = [p[0] - spread * sunward[0], p[1] - spread * sunward[1]];
  // The camera comes in on the red dot with the whole globe in view: from just under the globe,
  // or under the beam's label when the place sits low, to just over the north label. The
  // heading and its line stay on screen over a band 1.25 units deep (the stage above
  // y = 3.25), which covers 1.25 / ZOOM of the view, so the view shows 7.75 / ZOOM below it.
  // The ray comes in from the left: the view keeps its start, with room beside the globe for the
  // formula, and ends just past the globe on the right.
  const labelBelow = sunward[1] >= 0,
    bottom = Math.min(CY - R - 0.25, Math.min(p[1], q[1]) - (labelBelow ? 0.5 + small : 0.25)),
    top = S.drawing.box()![3] + 0.12,
    ZOOM = Math.min(1.8, 7.75 / (top - bottom)),
    w = 16 / ZOOM,
    h = 9 / ZOOM,
    cx = JUNE_C[0] + R + 0.4 - w / 2,
    cy = bottom + h / 2;
  const view: Box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
  // The notes go in the view's bottom left corner, or its top left one, under the band,
  // when the place sits low on the globe and its beam would cross them.
  /** Line `n` of four, counted from the top, at the chosen corner. */
  const low = p[1] < CY + 0.3,
    corner = (n: number): { at: Vec; edge: Vec } =>
      low
        ? { at: [view[0] + 0.3, view[3] - 1.25 / ZOOM - 0.25 - n * pitch], edge: [-1, 1] }
        : { at: [view[0] + 0.3, view[1] + 0.3 + (3 - n) * pitch], edge: [-1, -1] };
  const beam = new Polygon(
    [
      [start, p[1]],
      p,
      q,
      [start, q[1]],
    ],
    { fill: SUN, fillOpacity: 0.4, stroke: 'none' },
  );
  keyed(beam, 'noon-beam');
  const patch = new Line(p, q, { stroke: SUN, strokeWidth: 0.06 });
  keyed(patch, 'noon-patch');
  const said = new Group(
    ...['Per m² of ground:', `sin ${degrees(st.june.altitude)} = ${share.toFixed(2)}`, 'of overhead sunlight'].map((line, i) =>
      label(line, corner(i).at, { size: small * 1.3, color: i === 1 ? SUN : ink, edge: corner(i).edge }),
    ),
  );
  keyed(said, 'noon-share');
  notes.add(
    beam,
    new Line([start, q[1]], q, { stroke: SUN, strokeWidth: 0.025 }),
    patch,
    said,
    // Under the horizon line's sunward half, on the ground side.
    label('horizon', [p[0] + 0.72 * sunward[0] - 0.22 * z[0], p[1] + 0.72 * sunward[1] - 0.22 * z[1]], {
      size: small,
      color: ink,
    }),
    // Above the beam, on the side of the ray away from the angle's arc, and short of the horizon.
    sunward[1] < 0
      ? label('noon sunlight', [p[0] - 0.3, Math.max(p[1], q[1]) + 0.12], { size: small, color: SUN, edge: [1, -1] })
      : label('noon sunlight', [p[0] - 0.3, Math.min(p[1], q[1]) - 0.12], { size: small, color: SUN, edge: [1, 1] }),
    // Under the share, clear of the globe and the beam at every latitude.
    label(formulaOf(st), corner(3).at, {
      size: small * 1.3,
      color: ink,
      edge: corner(3).edge,
    }),
  );
  return { notes, view };
}

/** The month over each side view: June on the right, December on the left. */
export function drawSolsticeMonths({ ink, soft }: Ink) {
  const label = labeller(soft);
  const months = new Group(
    label('June', [JUNE_C[0] + R, 2.85], { size: 0.32, color: ink, edge: [1, 0] }),
    label('December', [DEC_C[0] + R, 2.85], { size: 0.32, color: ink, edge: [1, 0] }),
  );
  keyed(months, 'solstice-months');
  return months;
}

/**
 * The other places' latitude circles on both side views, yellow where lit, and every place's name on
 * the December side. `here` marks the place the explainer observes from, whose circle is already drawn.
 */
export function drawLatitudeCircles(places: readonly { name: string; lat: number; here: boolean }[], soft: string) {
  const label = labeller(soft);
  const extra = new Group();
  keyed(extra, 'latitude-circles');
  for (const [center, side] of [
    [JUNE_C, -1],
    [DEC_C, 1],
  ] as const) {
    const v = sideView(center, R, side);
    for (const k of places.filter((k) => !k.here)) {
      const ch = v.chord(k.lat);
      extra.add(
        new Line(ch.night[0], ch.night[1], {
          stroke: DIMLINE,
          strokeWidth: 0.035,
        }),
        new Line(ch.day[0], ch.day[1], {
          stroke: SUN,
          strokeWidth: 0.035,
          strokeOpacity: 0.75,
        }),
      );
    }
    // Name the circles once, on the December side, where their ends are well apart.
    if (side > 0)
      for (const k of places) {
        const ch = v.chord(k.lat);
        extra.add(
          label(k.name, ch.far, {
            size: 0.27,
            color: k.here ? PLACE : soft,
            edge: side < 0 ? [-1, 0] : [1, 0],
          }),
        );
      }
  }
  return extra;
}

/** Where a solstice's daylight table sits: under its globe. */
export const tableBox = (center: Vec): Box => [center[0] - 2.8, -4.2, center[0] + 2.8, CY - R - 0.2];
/** One solstice's daylight at each place, with the observed place's row lit. */
export const drawDaylightTable = (s: Stage, rows: [string, string][], title: string, box: Box, lit: string) =>
  card(s, rows, { at: box, title, size: 0.27, align: 'top', direction: 'ltr', lit: { row: lit } });

// ------------------------------------------------------------------ the year chart
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The 15ths with the year's ends wrapped on: the December before and the January after. */
const KNOTS = [MID_MONTH[11]! - 365, ...MID_MONTH, MID_MONTH[0]! + 365];
/**
 * The chart's x axis is the calendar: month m fills [m, m + 1], and x = m + 0.5
 * is its 15th, the day `daylightYear` samples, with days spread evenly between
 * one 15th and the next. So the plotted curve passes through its twelve values.
 */
export const dayAt = (x: number) => {
  const k = Math.min(12, Math.max(0, Math.floor(x + 0.5))),
    a = KNOTS[k]!,
    b = KNOTS[k + 1]!;
  return a + (x + 0.5 - k) * (b - a);
};
/** The x at which the chart shows a day of the year: dayAt's inverse. */
export const xOn = (day: number) => {
  const k = KNOTS.findIndex((d, i) => day >= d && day < KNOTS[i + 1]!);
  return k - 0.5 + (day - KNOTS[k]!) / (KNOTS[k + 1]! - KNOTS[k]!);
};
/** Where the year chart's longest − shortest dimension stands, right of the chart. */
export const LEVEL_X = 13.1;

/** The year chart's axes, daylight 0 to 24 hours, and the months under them. */
export function drawDaylightAxes({ soft, muted }: Ink) {
  const label = labeller(soft);
  const axes = new Axes({
    xRange: [0, 12, 1],
    yRange: [0, 24, 6],
    width: 7.6,
    height: 5.4,
    axisStyle: { stroke: muted, labelColor: soft, labelFontSize: 0.2 },
    yAxisStyle: { includeNumbers: true },
    yLabel: 'daylight (h)',
    axisLabelFontSize: 0.2,
  });
  axes.shift([-6.6 - axes.c2p(0, 0)[0], -3.5 - axes.c2p(0, 0)[1]]);
  keyed(axes, 'daylight-axes');
  const months = new Group(
    ...MONTHS.map((m, i) => label(m, [axes.c2p(i + 0.5, 0)[0], axes.c2p(0, 0)[1] - 0.3], { size: 0.2 })),
  );
  return { axes, months };
}

/** This place's daylight through the year, `daylight` read at each x of the chart. */
export const drawYearCurve = (axes: Axes, daylight: (x: number) => number) =>
  axes.plot(daylight, { samples: 145, color: CURVE, strokeWidth: 0.05 });

/** A dashed guide and a name at each solstice and equinox, fixed by the calendar. */
export function drawGuides(axes: Axes, events: readonly { day: number; name: string }[], { soft, muted }: Ink) {
  const label = labeller(soft);
  const guides = new Group();
  for (const e of events) {
    const x = xOn(e.day);
    guides.add(
      axes.verticalLine(x, { stroke: muted, strokeWidth: 0.018, dashArray: '0.08 0.07' }),
      label(e.name, [axes.c2p(x, 24)[0], axes.c2p(x, 24)[1] + 0.32], { size: 0.2 }),
    );
  }
  return guides;
}

/** The model's day length at each solstice and equinox (`values`, in the order of `events`), dotted and said on the curve. */
export function drawEventMarks(axes: Axes, values: readonly { name: string; hours: number }[], events: readonly { day: number }[], { ink, soft }: Ink) {
  const label = labeller(soft);
  const g = new Group();
  for (const [i, e] of values.entries()) {
    const x = xOn(events[i]!.day),
      color = e.name === 'Jun solstice' ? SUN : e.name === 'Dec solstice' ? DEC : ink;
    const at = axes.c2p(x, e.hours);
    g.add(
      axes.dot(x, e.hours, { radius: 0.09, color }),
      label(hours(e.hours), [at[0] + 0.15, at[1] + (e.hours > 22 ? -0.22 : 0.2)], {
        size: 0.2,
        color,
        edge: [-1, 0],
      }),
    );
  }
  return g;
}

/** Dashed lines from the shortest and longest of `days` to the right of the chart, where the dimension stands. */
export function drawLevels(axes: Axes, days: readonly number[], shortest: number, longest: number, soft: string) {
  const at = (h: number) => days.findIndex((d) => d === h);
  return new Group(
    ...[shortest, longest].map((h) =>
      axes.horizontalLine(h, { from: xOn(at(h)), to: LEVEL_X, stroke: soft, strokeWidth: 0.018, dashArray: '0.06 0.06' }),
    ),
  );
}

/** 15 January, the first month's sample day (x = 0.5), marked on the chart at its `value`. */
export function drawJanuaryMarker(axes: Axes, value: number) {
  const jan = axes.c2p(0.5, value);
  const point = new Dot({ radius: 0.09, color: SUN }).moveTo(jan);
  keyed(point, 'january-point');
  return new Group(axes.verticalLine(0.5, { stroke: SUN, strokeWidth: 0.025, dashArray: '0.1 0.08' }), point);
}

/**
 * The place's curve named at its end and, away from the equator, the same model at the mirrored
 * latitude: its curve, its 15 January dot at `mirrorJanuary` and its name. `daylightAt(lat)` is the
 * model's daylight at each x of the chart. Its members enter one by one.
 */
export function drawMirror(
  axes: Axes,
  name: string,
  lat: number,
  mirrorJanuary: number,
  daylightAt: (lat: number) => (x: number) => number,
  soft: string,
) {
  const label = labeller(soft);
  const end = (lat: number) => axes.c2p(12, daylightAt(lat)(12));
  const own = label(name, [end(lat)[0] + 0.15, end(lat)[1]], {
    size: 0.2,
    color: CURVE,
    edge: [-1, 0],
  });
  const second = new Group(own);
  let other: Mobject | undefined;
  if (lat !== 0) {
    other = axes.plot(daylightAt(-lat), { samples: 145, color: MIRROR, strokeWidth: 0.035 });
    keyed(other, 'mirror-daylight-curve');
    const point = new Dot({ radius: 0.09, color: MIRROR }).moveTo(axes.c2p(0.5, mirrorJanuary));
    keyed(point, 'mirror-january-point');
    second.add(
      other,
      point,
      label(latitudeName(-lat), [end(-lat)[0] + 0.15, end(-lat)[1]], {
        size: 0.2,
        color: MIRROR,
        edge: [-1, 0],
      }),
    );
  }
  return { own, second, other };
}

/**
 * The two causes on one scale, from the state's bars: how far the tilt moves this place's noon sunlight
 * between the solstices, and how far the distance moves an overhead Sun's between July and January. Both in
 * percent of an overhead Sun at Earth's average distance.
 */
export function drawBars(st: SeasonState, { ink, soft, muted }: Ink) {
  const label = labeller(soft);
  const bars = new Group();
  keyed(bars, 'effect-bars');
  const left = 2.6,
    right = 6.9,
    top = 1.0,
    full = 1.05,
    x = (share: number) => left + ((right - left) * share) / full;
  const [july, january] = st.bars!.distance;
  const [low, high] = st.bars!.tilt,
    lowMonth = st.noonShare!.june <= st.noonShare!.december! ? 'June' : 'December',
    highMonth = st.noonShare!.june <= st.noonShare!.december! ? 'December' : 'June';
  const bar = (from: number, to: number, y: number, color: string) =>
    new Rectangle({ width: Math.max(0.05, x(to) - x(from)), height: 0.4, fill: color, stroke: 'none' }).moveTo(
      [(x(from) + x(to)) / 2, y],
    );
  const track = (y: number) => new Line([x(0), y], [x(full), y], { stroke: muted, strokeWidth: 0.02 });
  const row = (heading: string, from: number, to: number, fromName: string, toName: string, y: number, color: string) => {
    const g = new Group(
      label(heading, [left, y + 0.6], { size: 0.26, color: ink, edge: [-1, 0] }),
      track(y),
      bar(from, to, y, color),
    );
    if (to - from < 0.01) g.add(label(`${fromName} and ${toName}`, [x(to), y - 0.45], { size: 0.24, color }));
    else
      g.add(
        label(fromName, [x(from), y - 0.45], { size: 0.24, color, edge: [1, 0] }),
        label(toName, [x(to), y - 0.45], { size: 0.24, color, edge: [-1, 0] }),
      );
    return g;
  };
  const ticks = new Group(
    ...[0, 0.5, 1].map((t) => label(`${t * 100}%`, [x(t), top - 2.6], { size: 0.22 })),
    ...[0, 0.5, 1].map((t) => new Line([x(t), top - 2.38], [x(t), top - 2.28], { stroke: muted, strokeWidth: 0.02 })),
  );
  bars.add(
    label('Sunlight per m², % of an overhead Sun', [left, top + 1.45], { size: 0.24, color: soft, edge: [-1, 0] }),
    row(
      pct(low) === pct(high) ? `Tilt: ${st.place}’s noon, ${pct(high)} at both` : `Tilt: ${st.place}’s noon, ${pct(low)} to ${pct(high)}`,
      low,
      high,
      lowMonth,
      highMonth,
      top,
      SUN,
    ),
    row(`Distance: overhead Sun, ${pct(july)} to ${pct(january)}`, july, january, 'July', 'January', top - 1.5, CURVE),
    ticks,
  );
  return { bars, lowMonth, highMonth };
}

/**
 * The January values from the state's daylight and its mirror, said beside their dots on tags that read
 * over the curves. On the equator both months give the same day, so 15 July is said there too.
 */
export function drawTags(st: SeasonState, axes: Axes, paper: string) {
  const tag = (x: number, value: number, text: string, color: string) => {
    const p = axes.c2p(x, value),
      t = new Text(text, { fontSize: 0.22, color });
    const bg = new Rectangle({
      width: t.width() + 0.26,
      height: 0.38,
      cornerRadius: 0.06,
      fill: paper,
      fillOpacity: 1,
      stroke: color,
      strokeWidth: 0.014,
    });
    return new Group(bg, t.moveTo(bg.center())).moveTo([p[0] + 0.24 + bg.width() / 2, p[1]]);
  };
  const days = st.daylight!,
    other = st.mirror!;
  const tags: Mobject[] =
    st.latitude !== 0
      ? [tag(0.5, days[0]!, hours(days[0]!), CURVE), tag(0.5, other[0]!, hours(other[0]!), MIRROR)]
      : [tag(0.5, days[0]!, `15 January: ${hours(days[0]!)}`, CURVE), tag(6.5, days[6]!, `15 July: ${hours(days[6]!)}`, CURVE)];
  keyed(tags[0]!, 'january-value');
  keyed(tags[1]!, st.latitude === 0 ? 'july-value' : 'mirror-january-value');
  if (st.latitude === 0) {
    const julyPoint = new Dot({ radius: 0.09, color: CURVE }).moveTo(axes.c2p(6.5, days[6]!));
    keyed(julyPoint, 'july-point');
    tags.push(julyPoint);
  }
  return new Group(...tags);
}
