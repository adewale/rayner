// A small model of drawing a laid-out chart by hand, after the method of pele-art-diagrams as
// described in rheos/secondunit-videos' study of the page: the layout read back as marks, a hand
// that follows each line like a damped spring with tremor, pencil hatching clipped to a shape,
// scenery drawn far to near only on paper the chart does not own, and Hershey single-stroke
// letters. It models the method, not the page's code, which carries no licence.
import { SIMPLEX } from './hershey-simplex.ts';

export type Pt = [number, number];
export type Box = [number, number, number, number];

/** A made-up world of this explainer's own; the page draws four others. */
export const WORLD = [
  'timeline',
  '  Dusk : Lamp lit',
  '  Midnight : Wick trimmed',
  '  Small hours : Fog bell rung',
  '  Dawn : Lamp put out',
].join('\n');
export const TITLE = "The lamp-keeper's night";

/** The four plates on the page and their chart types, from the study. */
export const PLATES: readonly [string, string][] = [
  ["The wind's day", 'radar'],
  ['The vesper bell', 'state'],
  ['Bottling thunder', 'sankey'],
  ["The comet's long way home", 'timeline'],
];

/** mulberry32: a seeded generator, so a drawing repeats exactly for the same seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periods and their events, in order: the only facts a timeline's text gives the layout. */
export function timelineFacts(source: string): { period: string; events: string[] }[] {
  return source
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('title'))
    .map((line) => {
      const [period, ...events] = line.split(':').map((part) => part.trim());
      return { period: period!, events };
    });
}

/** Points every `step` along a polyline, keeping its corners. */
export function resample(line: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!,
      [bx, by] = line[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

export interface HandOptions {
  /** How fast the point the pen chases moves along the line, units per second. */
  speed: number;
  /** The spring's natural frequency, in hertz: how hard the pen is pulled toward that point. */
  frequency: number;
  /** Damping ratio; under 1 the pen overshoots a little before it settles. */
  damping: number;
  /** The largest tremor added to the point the pen chases, in units. */
  tremor: number;
  /** Simulation step, in seconds. */
  dt: number;
  /** Keep one simulated point in this many. */
  every: number;
}
export const HAND: HandOptions = { speed: 1.2, frequency: 8, damping: 0.6, tremor: 0.006, dt: 1 / 240, every: 3 };

/**
 * The pen's path along `line`. A point moves along the line at `speed`, shaken by low-passed
 * tremor; the pen is a mass on a damped spring pulled toward it, starting at rest on the first
 * point. The pen lifts after the point reaches the end and the spring has had a moment to settle.
 */
export function hand(line: readonly Pt[], o: HandOptions, rand: () => number): Pt[] {
  const targets = resample(line, o.speed * o.dt);
  const w = 2 * Math.PI * o.frequency,
    k = w * w,
    c = 2 * o.damping * w;
  let [px, py] = line[0]!,
    vx = 0,
    vy = 0,
    nx = 0,
    ny = 0;
  const out: Pt[] = [[px, py]];
  const settle = Math.ceil(0.06 / o.dt);
  for (let i = 1; i < targets.length + settle; i++) {
    const [tx, ty] = targets[Math.min(i, targets.length - 1)]!;
    // Low-passed noise stays within ±1, so the tremor stays within ±tremor on each axis.
    nx = 0.85 * nx + 0.15 * (rand() * 2 - 1);
    ny = 0.85 * ny + 0.15 * (rand() * 2 - 1);
    const ax = k * (tx + o.tremor * nx - px) - c * vx,
      ay = k * (ty + o.tremor * ny - py) - c * vy;
    vx += ax * o.dt;
    vy += ay * o.dt;
    px += vx * o.dt;
    py += vy * o.dt;
    if (i % o.every === 0) out.push([px, py]);
  }
  out.push([px, py]);
  return out;
}

export interface FreehandOptions {
  /** The largest turn of each move away from the direction intended, in degrees. */
  angle: number;
  /** The largest stretch or shrink of each move, as a fraction of its intended length. */
  length: number;
}
/**
 * A hand that places its own strokes, the failure a fixed layout prevents: an assumption of this
 * explainer, not pele's method. Each corner is drawn where the last move ended, turned by up to
 * ±`angle` and stretched by up to ±`length`.
 */
export const FREEHAND: FreehandOptions = { angle: 2, length: 0.03 };
/** The corners a free hand reaches from `start` by relative `moves`; each error is carried into every later corner. */
export function freehand(start: Pt, moves: readonly Pt[], o: FreehandOptions, rand: () => number): Pt[] {
  let [x, y] = start;
  const out: Pt[] = [[x, y]];
  for (const [dx, dy] of moves) {
    const a = ((rand() * 2 - 1) * o.angle * Math.PI) / 180,
      k = 1 + (rand() * 2 - 1) * o.length;
    x += k * (Math.cos(a) * dx - Math.sin(a) * dy);
    y += k * (Math.sin(a) * dx + Math.cos(a) * dy);
    out.push([x, y]);
  }
  return out;
}

/** Pen pressure for each of `n` strokes in drawing order: a random walk kept between 0.8 and 1.2. */
export function pressures(n: number, rand: () => number): number[] {
  let p = 1;
  return Array.from({ length: n }, () => {
    p = Math.min(1.2, Math.max(0.8, p + (rand() - 0.5) * 0.12));
    return p;
  });
}

/** A pencil's line width for its `i`th stroke: it dulls to 1.6 times as wide, then is re-sharpened. */
export const pencilWidth = (i: number, sharp: number, every: number) => sharp * (1 + 0.6 * ((i % every) / every));

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** The farthest any point of `stroke` lies from the polyline `line`. */
export function deviation(stroke: readonly Pt[], line: readonly Pt[]): number {
  let worst = 0;
  for (const p of stroke) {
    let near = line.length === 1 ? Math.hypot(p[0] - line[0]![0], p[1] - line[0]![1]) : Infinity;
    for (let i = 1; i < line.length; i++) near = Math.min(near, segmentDistance(p, line[i - 1]!, line[i]!));
    worst = Math.max(worst, near);
  }
  return worst;
}

export const boxPolygon = (b: Box): Pt[] => [
  [b[0], b[1]],
  [b[2], b[1]],
  [b[2], b[3]],
  [b[0], b[3]],
];

/** The part of the line through `p` along `d` inside the convex polygon `poly` (Cyrus–Beck). */
function clipConvex(p: Pt, d: Pt, poly: readonly Pt[]): [Pt, Pt] | null {
  let t0 = -Infinity,
    t1 = Infinity;
  // Signed area tells which side is inside.
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area > 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!;
    // Inward normal of edge a→b.
    const n: Pt = [-(b[1] - a[1]) * sign, (b[0] - a[0]) * sign];
    const num = n[0] * (p[0] - a[0]) + n[1] * (p[1] - a[1]),
      den = n[0] * d[0] + n[1] * d[1];
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (t1 <= t0) return null;
  return [
    [p[0] + d[0] * t0, p[1] + d[1] * t0],
    [p[0] + d[0] * t1, p[1] + d[1] * t1],
  ];
}

export interface HatchOptions {
  /** Angle of the strokes from horizontal, in degrees. */
  angle: number;
  /** Distance between neighbouring strokes. */
  spacing: number;
  /** Each end stops short of the edge by up to this much, as a hand does. */
  shortfall: number;
}

/** Parallel pencil strokes across a convex polygon, each clipped to it and shortened at both ends by chance. */
export function hatch(poly: readonly Pt[], o: HatchOptions, rand: () => number): [Pt, Pt][] {
  const a = (o.angle * Math.PI) / 180,
    d: Pt = [Math.cos(a), Math.sin(a)],
    n: Pt = [-d[1], d[0]];
  const b = boundsOf([poly]);
  const c: Pt = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const reach = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2;
  const out: [Pt, Pt][] = [];
  for (let k = Math.ceil(-reach / o.spacing); k * o.spacing <= reach; k++) {
    const seg = clipConvex([c[0] + n[0] * k * o.spacing, c[1] + n[1] * k * o.spacing], d, poly);
    if (!seg) continue;
    const [s, e] = seg,
      len = Math.hypot(e[0] - s[0], e[1] - s[1]);
    const cut0 = rand() * o.shortfall,
      cut1 = rand() * o.shortfall;
    if (len - cut0 - cut1 < o.spacing) continue;
    out.push([
      [s[0] + d[0] * cut0, s[1] + d[1] * cut0],
      [e[0] - d[0] * cut1, e[1] - d[1] * cut1],
    ]);
  }
  return out;
}

export const inside = (p: Pt, b: Box, eps = 1e-9) =>
  p[0] >= b[0] - eps && p[0] <= b[2] + eps && p[1] >= b[1] - eps && p[1] <= b[3] + eps;

/** Inside a convex polygon, edges included. */
export function insidePolygon(p: Pt, poly: readonly Pt[], eps = 1e-9): boolean {
  let pos = false,
    neg = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!,
      b = poly[(i + 1) % poly.length]!;
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cross > eps) pos = true;
    if (cross < -eps) neg = true;
  }
  return !(pos && neg);
}

/**
 * Region ownership: the pieces of a polyline that lie on paper no box owns. The line is resampled
 * every `step`, and each run of free points becomes one piece.
 */
export function unowned(line: readonly Pt[], owned: readonly Box[], step: number): Pt[][] {
  const pieces: Pt[][] = [];
  let run: Pt[] = [];
  for (const p of resample(line, step))
    if (owned.some((b) => inside(p, b))) {
      if (run.length > 1) pieces.push(run);
      run = [];
    } else run.push(p);
  if (run.length > 1) pieces.push(run);
  return pieces;
}

/** A text as Hershey strokes on the 21-unit capital grid, from x = 0; `width` is the summed advance. */
export function hershey(text: string): { strokes: Pt[][]; width: number } {
  const strokes: Pt[][] = [];
  let x = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const glyph = SIMPLEX[code - 32];
    if (glyph == null) throw new Error(`Hershey Simplex has no glyph for U+${code.toString(16).toUpperCase()}`);
    const [advance, body] = glyph.split(';') as [string, string];
    for (const stroke of body ? body.split('|') : [])
      strokes.push(
        stroke.split(' ').map((xy) => {
          const [gx, gy] = xy.split(',').map(Number) as [number, number];
          return [x + gx, gy];
        }),
      );
    x += Number(advance);
  }
  return { strokes, width: x };
}

/** The bounding box of a set of strokes. */
export function boundsOf(strokes: readonly (readonly Pt[])[]): Box {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of strokes)
    for (const [x, y] of s) {
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
  return b;
}

/** Strokes scaled to fit inside `box` (as tall as it, unless that makes them too wide) and centred in it. */
export function fit(strokes: readonly (readonly Pt[])[], box: Box): Pt[][] {
  const b = boundsOf(strokes),
    k = Math.min((box[3] - box[1]) / (b[3] - b[1]), (box[2] - box[0]) / (b[2] - b[0]));
  const cx = (b[0] + b[2]) / 2,
    cy = (b[1] + b[3]) / 2,
    tx = (box[0] + box[2]) / 2,
    ty = (box[1] + box[3]) / 2;
  return strokes.map((s) => s.map(([x, y]) => [tx + (x - cx) * k, ty + (y - cy) * k] as Pt));
}

/** A luggage tag inside `box`, hanging from the middle of its top edge: the top corners cut off. */
export function tag(box: Box): Pt[] {
  const [x0, y0, x1, y1] = box,
    cut = Math.min((y1 - y0) * 0.45, (x1 - x0) * 0.2);
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1 - cut],
    [x1 - cut, y1],
    [x0 + cut, y1],
    [x0, y1 - cut],
  ];
}

export interface Layer {
  name: string;
  /** Pen outlines, traced by the hand. */
  pen: Pt[][];
  /** Pencil strokes, straight. */
  pencil: [Pt, Pt][];
  /** The pencil's colour key. */
  tint: string;
}

/**
 * The made-up world around the chart, far to near: hills, the sea, a rock with a lighthouse and its
 * beam, gulls. `frame` is the paper the scene may use; nothing is kept inside an `owned` box.
 */
export function scenery(frame: Box, owned: readonly Box[], rand: () => number): Layer[] {
  const [x0, y0, x1, y1] = frame;
  const horizon = y0 + (y1 - y0) * 0.28;
  const free = (lines: Pt[][]) => lines.flatMap((l) => unowned(l, owned, 0.02));
  const freeSegs = (segs: [Pt, Pt][]) =>
    segs.flatMap(([a, b]) => unowned([a, b], owned, 0.02).map((p) => [p[0]!, p.at(-1)!] as [Pt, Pt]));
  const layers: Layer[] = [];

  // Far hills on the left: a ridge, hatched down to the horizon along the slope.
  const hx0 = x0 + 0.3,
    hx1 = x0 + (x1 - x0) * 0.55;
  const ridge = (x: number) => {
    const u = (x - hx0) / (hx1 - hx0);
    return horizon + (y1 - horizon) * 0.3 * (Math.sin(Math.PI * u) ** 1.5 * (0.75 + 0.25 * Math.sin(5 * u + 1)));
  };
  const ridgeLine = resample([[hx0, horizon], [hx1, horizon]], 0.08).map(([x]) => [x, ridge(x)] as Pt);
  const hillHatch: [Pt, Pt][] = [];
  for (let x = hx0 + 0.1; x < hx1 - 0.1; x += 0.085) {
    const top = ridge(x) - 0.03 - rand() * 0.05;
    if (top - horizon > 0.12) hillHatch.push([[x, horizon + 0.02], [x + (top - horizon) * 0.35, top]]);
  }
  layers.push({ name: 'hills', pen: free([ridgeLine]), pencil: freeSegs(hillHatch), tint: 'hills' });

  // The sea: rows of short horizontal strokes, closer together near the horizon.
  const sea: [Pt, Pt][] = [];
  for (let y = horizon - 0.07, gap = 0.06; y > y0; y -= gap, gap *= 1.18)
    for (let x = x0 + 0.2 + rand() * 0.4; x < x1 - 0.4; x += 0.5 + rand() * 0.6)
      sea.push([[x, y], [x + 0.18 + rand() * 0.3, y]]);
  layers.push({ name: 'sea', pen: free([[[x0 + 0.2, horizon], [x1 - 0.2, horizon]]]), pencil: freeSegs(sea), tint: 'sea' });

  // A rock and a lighthouse on the right.
  const lx = x0 + (x1 - x0) * 0.8,
    base = horizon + 0.12,
    tall = (y1 - horizon) * 0.72;
  const rock: Pt[] = [
    [lx - 1.1, horizon - 0.05],
    [lx - 0.7, base + 0.05],
    [lx - 0.2, base + 0.12],
    [lx + 0.5, base + 0.08],
    [lx + 0.95, base - 0.04],
    [lx + 1.2, horizon - 0.05],
  ];
  const rockHatch = hatch(rock, { angle: 30, spacing: 0.07, shortfall: 0.05 }, rand);
  layers.push({ name: 'rock', pen: free([rock]), pencil: freeSegs(rockHatch), tint: 'rock' });
  const tower: Pt[] = [
    [lx - 0.3, base + 0.1],
    [lx + 0.3, base + 0.1],
    [lx + 0.19, base + tall],
    [lx - 0.19, base + tall],
  ];
  const lamp: Box = [lx - 0.24, base + tall, lx + 0.24, base + tall + 0.3];
  const cap: Pt[] = [
    [lx - 0.3, lamp[3]],
    [lx, lamp[3] + 0.22],
    [lx + 0.3, lamp[3]],
  ];
  // Two painted bands across the tower, each its own clipped hatch.
  const band = (f0: number, f1: number): Pt[] => {
    const at = (f: number, side: number): Pt => [lx + side * (0.3 - 0.11 * f), base + 0.1 + (tall - 0.1) * f];
    return [at(f0, -1), at(f0, 1), at(f1, 1), at(f1, -1)];
  };
  const bands = [band(0.2, 0.36), band(0.58, 0.74)].flatMap((p) => hatch(p, { angle: 70, spacing: 0.045, shortfall: 0.02 }, rand));
  layers.push({
    name: 'lighthouse',
    pen: free([[...tower, tower[0]!], boxPolygon(lamp).concat([[lamp[0], lamp[1]]]), cap]),
    pencil: freeSegs(bands),
    tint: 'bands',
  });
  // The beam: long, light strokes fanning out to the left.
  const beam: [Pt, Pt][] = [];
  const src: Pt = [lx - 0.24, (lamp[1] + lamp[3]) / 2];
  for (let i = 0; i < 7; i++) {
    const ang = Math.PI + (i / 6 - 0.5) * 0.22;
    beam.push([src, [src[0] + Math.cos(ang) * 3.2, src[1] + Math.sin(ang) * 3.2]]);
  }
  layers.push({ name: 'beam', pen: [], pencil: freeSegs(beam), tint: 'beam' });

  // Gulls: two strokes each, high over the sea.
  const gulls: Pt[][] = [];
  for (let i = 0; i < 3; i++) {
    const gx = x0 + (x1 - x0) * (0.58 + 0.07 * i) + rand() * 0.2,
      gy = horizon + (y1 - horizon) * (0.55 + 0.12 * ((i * 7) % 3)),
      s = 0.1 + rand() * 0.04;
    gulls.push([[gx - s, gy + s * 0.5], [gx - s * 0.4, gy + s * 0.6], [gx, gy]], [[gx, gy], [gx + s * 0.4, gy + s * 0.6], [gx + s, gy + s * 0.5]]);
  }
  layers.push({ name: 'gulls', pen: free(gulls), pencil: [], tint: 'sea' });
  return layers;
}
