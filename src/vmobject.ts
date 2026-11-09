// VMobject: a vector path made of cubic Bézier subpaths.
//
// Each subpath is a Float32Array of 2*(3k+1) numbers: an anchor, then k runs of
// (handle, handle, anchor). Consecutive curves share their anchor, so curve n
// starts at point 3n. That is the whole record-layout contract; the SVG `d`
// serializer and the alignment code both read it directly.

import { Mobject, defaultColors, alignData, pointsVersion } from './mobject.ts';
import type { Style } from './mobject.ts';
import * as V from './vec.ts';
import type { Vec } from './vec.ts';
import { perf } from './perf.ts';
import { center, pointsBox } from './box.ts';
import { UNITS } from './units.ts';

/** SVG path data: `d` relative to (tx, ty), or absolute with a zero translation. */
export interface PathData { d: string; tx: number; ty: number }

interface RoundedPath { ints: Int32Array; lens: Int32Array; tx: number; ty: number }

/** pathData()'s memo; see there. */
interface PathCache {
  owner: VMobject;
  relative: boolean;
  v: number | undefined;
  arrays: Float32Array[];
  closed: boolean[];
  closedAtFormat?: boolean[];
  ints?: Int32Array;
  lens?: Int32Array;
  pd: PathData;
}

type Cubic = [Vec, Vec, Vec, Vec];

/** @internal The number of curves in subpath `i` of `v`, or in its whole path: what an arc's ascii drawing and a diagram's route check read. */
export function curveCount(v: VMobject, i: number | null = null): number {
  if (i != null) return (v.subpaths[i]!.length / 2 - 1) / 3;
  return v.subpaths.reduce((s, _, j) => s + curveCount(v, j), 0);
}

export class VMobject extends Mobject {
  subpaths: Float32Array[];
  closed: boolean[];

  constructor(style: Style = {}) {
    super(style);
    // A path drawn without a stroke takes the scene's ink. A container's own style is never drawn, so only paths are marked.
    if (style.stroke === undefined) this[defaultColors] = { stroke: 'ink' };
    this.subpaths = [];
    this.closed = [];
    this.initPoints();
  }

  /** Subclasses build their geometry here, from the constructor (before their own fields are set). */
  protected initPoints(): void {}

  override pointArrays(): Float32Array[] { return this.subpaths; }
  override pointKind(): string { return 'path'; }

  /** `src` is the mobject this one was copied from: same class. */
  protected override copyData(src: Mobject): void {
    const s = src as VMobject;
    this.subpaths = s.subpaths.map((a) => new Float32Array(a));
    this.closed = [...s.closed];
  }

  /** Points blend; a subpath's closed flag switches to the target's halfway through. */
  override interpolate(a: Mobject, b: Mobject, alpha: number): this {
    super.interpolate(a, b, alpha);
    // Either side may be a non-path (alignment pairs by index): then it has no `closed`
    const ac = (a as Partial<Pick<VMobject, 'closed'>>).closed, bc = (b as Partial<Pick<VMobject, 'closed'>>).closed;
    if (ac && bc && bc.length === this.closed.length) {
      const from = alpha < 0.5 ? ac : bc;
      for (let i = 0; i < this.closed.length; i++) this.closed[i] = from[i]!;
    }
    return this;
  }

  // ---- building ----------------------------------------------------------

  startNewPath(p: Readonly<Vec>): this {
    this.subpaths.push(new Float32Array([p[0], p[1]]));
    this.closed.push(false);
    this.invalidateBox();
    return this;
  }

  addCubic(h1: Readonly<Vec>, h2: Readonly<Vec>, anchor: Readonly<Vec>): this {
    const i = this.subpaths.length - 1;
    const a = this.subpaths[i]!;
    const n = new Float32Array(a.length + 6);
    n.set(a);
    n.set([h1[0], h1[1], h2[0], h2[1], anchor[0], anchor[1]], a.length);
    this.subpaths[i] = n;
    this.invalidateBox();
    return this;
  }

  addLineTo(p: Readonly<Vec>): this {
    const a = this.subpaths[this.subpaths.length - 1]!;
    const last: Vec = [a[a.length - 2]!, a[a.length - 1]!];
    return this.addCubic(V.lerp(last, p, 1 / 3), V.lerp(last, p, 2 / 3), p);
  }

  closePath(): this {
    const i = this.subpaths.length - 1;
    const a = this.subpaths[i]!;
    const first: Vec = [a[0]!, a[1]!], last = [a[a.length - 2]!, a[a.length - 1]!];
    if (Math.hypot(first[0] - last[0]!, first[1] - last[1]!) > 1e-6) this.addLineTo(first);
    this.closed[i] = true;
    return this;
  }

  /** Build a closed polygon from corner points. */
  setPolygon(points: ReadonlyArray<Readonly<Vec>>): this {
    this.subpaths = []; this.closed = [];
    this.startNewPath(points[0]!);
    for (let i = 1; i < points.length; i++) this.addLineTo(points[i]!);
    return this.closePath();
  }

  // ---- geometry helpers --------------------------------------------------


  /** Point at parameter t in [0,1] along curve `c` of subpath `i`. */
  pointOnCurve(i: number, c: number, t: number): Vec {
    const a = this.subpaths[i]!, o = 6 * c;
    const u = 1 - t;
    const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
    return [
      b0 * a[o]! + b1 * a[o + 2]! + b2 * a[o + 4]! + b3 * a[o + 6]!,
      b0 * a[o + 1]! + b1 * a[o + 3]! + b2 * a[o + 5]! + b3 * a[o + 7]!,
    ];
  }

  /** Approximate arc length of the whole path (polyline, 8 samples per curve). */
  arcLength(): number {
    let total = 0;
    for (let i = 0; i < this.subpaths.length; i++) {
      const n = curveCount(this, i);
      for (let c = 0; c < n; c++) {
        let prev = this.pointOnCurve(i, c, 0);
        for (let s = 1; s <= 8; s++) {
          const p = this.pointOnCurve(i, c, s / 8);
          total += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
          prev = p;
        }
      }
    }
    return total;
  }

  /**
   * Point at fraction `t` of the whole path's length (manim's point_from_proportion):
   * a short curve takes a short share, so a token moves at an even speed and stays
   * on the tip of a stroke that Create draws by length. Within a curve the length is
   * inverted on the same 8-sample polyline that arcLength() measures. A path of zero
   * length answers its first point.
   */
  pointFromProportion(t: number): Vec {
    const n = curveCount(this);
    if (n === 0) {
      const a = this.subpaths.find((p) => p.length >= 2);
      return a ? [a[0]!, a[1]!] : [0, 0];
    }
    const lengths: Array<[i: number, c: number, len: number]> = [];
    let total = 0;
    for (let i = 0; i < this.subpaths.length; i++) {
      const k = curveCount(this, i);
      for (let c = 0; c < k; c++) { const len = curveLength(this, i, c); lengths.push([i, c, len]); total += len; }
    }
    const u = Math.min(Math.max(Number.isNaN(t) ? 0 : t, 0), 1);
    // The ends are the path's own first and last points, exactly
    if (u === 1) { const [i, c] = lengths[lengths.length - 1]!; return this.pointOnCurve(i, c, 1); }
    if (u === 0 || !(total > 0)) { const [i, c] = lengths[0]!; return this.pointOnCurve(i, c, 0); }
    const goal = u * total;
    let acc = 0;
    for (const [i, c, len] of lengths) {
      if (len > 0 && goal <= acc + len) return this.pointOnCurve(i, c, curveParamAt(this, i, c, goal - acc));
      acc += len;
    }
    // Rounding left the goal past the last curve with length: that is the end
    for (let j = lengths.length - 1; j >= 0; j--) if (lengths[j]![2] > 0) return this.pointOnCurve(lengths[j]![0], lengths[j]![1], 1);
    return this.pointOnCurve(lengths[0]![0], lengths[0]![1], 0);
  }

  // ---- alignment (the core of Transform) ---------------------------------

  /** Make this and `other` have equal subpath counts and equal curves per subpath. */
  /** @internal */
  override [alignData](other: Mobject): void {
    if (!(other instanceof VMobject)) return;
    // Equalize subpath counts: pad with a point-sized subpath at the center
    for (const [m, o] of [[this, other], [other, this]] as const) {
      while (m.subpaths.length < o.subpaths.length) {
        const src = o.subpaths[m.subpaths.length]!;
        const c: Vec = m.hasPoints() ? m.center() : [src[0]!, src[1]!];
        m.subpaths.push(new Float32Array([c[0], c[1]]));
        m.closed.push(o.closed[m.subpaths.length - 1]!);
        // The next pad's centre must count this one: a box cached before alignment would not.
        m.invalidateBox();
      }
    }
    for (let i = 0; i < this.subpaths.length; i++) {
      const na = curveCount(this, i), nb = curveCount(other, i);
      if (na < nb) insertCurves(this, i, nb - na);
      else if (nb < na) insertCurves(other, i, na - nb);
    }
    this.invalidateBox(); other.invalidateBox();
  }

  // ---- serialization -----------------------------------------------------

  /**
   * A string equal for paths of the same shape at any position, and almost
   * always at any size: the same subpaths (point counts, closed flags) whose
   * points coincide once each path is centered and scaled so its larger side
   * is 1, to within a grid cell of 1/SHAPE_STEPS of that side (about 1.6%;
   * manim's has_same_shape_as allows 1%). A moved copy always shares the key;
   * a scaled copy can split from it when a point lands right on a grid-cell
   * boundary (about 0.02% of scaled copies). "Same shape" is same path data,
   * as in manim: a square drawn from another corner, or one with curves
   * inserted by an earlier Transform, is a different shape. Own points only,
   * not children. A pure function of the points; a zero-size path keys as a point.
   */
  shapeKey(): string {
    const b = pointsBox(this.subpaths);
    let key = this.subpaths.map((a, i) => a.length / 2 + (this.closed[i] ? 'z' : '')).join(',') + ':';
    const size = b ? Math.max(b[2] - b[0], b[3] - b[1]) : 0;
    if (!b || !(size > 1e-6)) return key + 'point';
    const k = SHAPE_STEPS / size, [cx, cy] = center(b);
    for (const a of this.subpaths) for (let i = 0; i < a.length; i += 2) key += Math.round((a[i]! - cx) * k) + ' ' + Math.round((a[i + 1]! - cy) * k) + ' ';
    return key;
  }
}

// Grid cells per unit of a shape's larger side, for shapeKey(). Irrational on
// purpose: with a rational pitch, common values (±1/2, ±1/8 of a side, ratios
// of integer font units) land exactly on a cell boundary, where Float32 noise
// from moving the shape decides which way they round and equal shapes split.
// 100 and 50 steps split 0.04% and 8% of moved copies; this split none of 40k.
const SHAPE_STEPS = 100 / 1.618033988749895;

/**
 * How many pieces each of `k` curves becomes when `n` curves are added, given
 * the curves' chord lengths. Manim's rule: cutting a curve of length L into j
 * pieces leaves pieces of L / j, and the n cuts go to the n largest such
 * values, so the longest pieces anywhere on the path are as short as they can
 * be and anchors stay evenly spread. Zero-length curves (subpath end markers)
 * are never cut unless every curve is zero.
 */
function distributeCurves(lengths: readonly number[], n: number): number[] {
  const k = lengths.length, counts = new Array<number>(k).fill(1);
  if (n <= 0) return counts;
  let total = 0;
  for (const l of lengths) total += l;
  if (total === 0) { for (let j = 0; j < n; j++) counts[j % k]!++; return counts; }
  // Greedy: n times, cut the curve whose current pieces are longest. Same
  // choice as taking the n largest L / j, since L / j only shrinks with j.
  // Ties go to the lower index, and "tie" allows for Float32 noise: four equal
  // sides of a square differ in their last bits after a few transforms, and the
  // structure a Transform builds must not depend on that.
  const eps = 1e-6 * total;
  for (let j = 0; j < n; j++) {
    let best = 0, bestLen = -1;
    for (let c = 0; c < k; c++) { const l = lengths[c]! / counts[c]!; if (l > bestLen + eps) { bestLen = l; best = c; } }
    counts[best]!++;
  }
  return counts;
}

/**
 * Whether the cubic from the point at `o - 2` through the controls at `o` and `o + 2` to `o + 4` is
 * a straight segment drawn at even speed: each control within one unit (10^-3) of its third of the
 * chord, as a line's controls are once all four points are rounded. Such a cubic is written `L`.
 */
function straight(ints: Int32Array, o: number): boolean {
  for (let axis = 0; axis < 2; axis++) {
    const a = ints[o - 2 + axis]!, b = ints[o + 4 + axis]!;
    if (Math.abs(3 * ints[o + axis]! - 2 * a - b) > 3 || Math.abs(3 * ints[o + 2 + axis]! - a - 2 * b) > 3) return false;
  }
  return true;
}

/**
 * Integer-to-string is far cheaper than float-to-string (no shortest-digits search). Straight
 * segments (most of a picture's panels, rules, arrows and boxes) are written as `L`, the rest `C`.
 */
function formatInts(ints: Int32Array, lens: Int32Array, closed: readonly boolean[]): string {
  let d = '', r = 0;
  for (let i = 0; i < lens.length; i++) {
    const n = lens[i]!;
    if (n < 2) { r += n; continue; }
    d += 'M' + ints[r] + ' ' + ints[r + 1];
    for (let j = 2; j + 5 < n; j += 6) {
      const o = r + j;
      d += straight(ints, o)
        ? 'L' + ints[o + 4] + ' ' + ints[o + 5]
        : 'C' + ints[o] + ' ' + ints[o + 1] + ' ' + ints[o + 2] + ' ' + ints[o + 3] + ' ' + ints[o + 4] + ' ' + ints[o + 5];
    }
    if (closed[i]) d += 'Z';
    r += n;
  }
  return d;
}

function sameInts(a: Int32Array | undefined, b: Int32Array): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameRefs(a: readonly Float32Array[], b: readonly Float32Array[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function sameFlags(a: readonly boolean[], b: readonly boolean[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Split cubic P (4 points) at t into left and right halves. */
function deCasteljau(P: Cubic, t: number): [Cubic, Cubic] {
  const l = (a: Vec, b: Vec) => V.lerp(a, b, t);
  const p01 = l(P[0], P[1]), p12 = l(P[1], P[2]), p23 = l(P[2], P[3]);
  const p012 = l(p01, p12), p123 = l(p12, p23);
  const mid = l(p012, p123);
  return [[P[0], p01, p012, mid], [mid, p123, p23, P[3]]];
}

// ---- alignment and serialization, the engine's own -----------------------

/** Approximate length of curve `c` of subpath `i` (polyline, 8 samples, as arcLength()). */
function curveLength(v: VMobject, i: number, c: number): number {
  let len = 0, prev = v.pointOnCurve(i, c, 0);
  for (let s = 1; s <= 8; s++) {
    const p = v.pointOnCurve(i, c, s / 8);
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return len;
}

/** The Bézier parameter `s` along curve `c` of subpath `i` is from its start, on the same 8-sample polyline as curveLength(). */
function curveParamAt(v: VMobject, i: number, c: number, s: number): number {
  let prev = v.pointOnCurve(i, c, 0), acc = 0;
  for (let k = 1; k <= 8; k++) {
    const p = v.pointOnCurve(i, c, k / 8), d = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    if (acc + d >= s && d > 0) return (k - 1 + (s - acc) / d) / 8;
    acc += d; prev = p;
  }
  return 1;
}

/**
 * Split curve `c` of `subpath` into `parts` curves of equal parameter
 * span, using de Casteljau. Returns the new Float32Array for the subpath.
 * @internal
 */
export function splitCurve(a: Float32Array, c: number, parts: number): Float32Array {
  const o = 6 * c;
  const P: Cubic = [[a[o]!, a[o + 1]!], [a[o + 2]!, a[o + 3]!], [a[o + 4]!, a[o + 5]!], [a[o + 6]!, a[o + 7]!]];
  const out: Vec[] = [];
  let cur = P;
  for (let k = 0; k < parts - 1; k++) {
    // Split remaining curve at t such that this piece covers 1/(parts-k) of it
    const t = 1 / (parts - k);
    const [l, r] = deCasteljau(cur, t);
    out.push(l[1], l[2], l[3]);
    cur = r;
  }
  out.push(cur[1], cur[2], cur[3]);
  const n = new Float32Array(a.length + 6 * (parts - 1));
  n.set(a.subarray(0, o + 2));
  let w = o + 2;
  for (const p of out) { n[w++] = p[0]; n[w++] = p[1]; }
  n.set(a.subarray(o + 8), w);
  return n;
}

/**
 * Insert `n` extra curves into subpath `i`, the same path traced by more
 * curves. Which curves get cut decides what morphs into what, so this follows
 * manim's rule (VMobject.insert_n_curves_to_point_list): cut by length, see
 * distributeCurves. test/manim.test.ts holds it to manim's own function.
 * @internal
 */
export function insertCurves(v: VMobject, i: number, n: number): void {
  if (n <= 0) return;
  let a = v.subpaths[i]!;
  const k = curveCount(v, i);
  if (k === 0) {
    // A lone point: give it n degenerate curves
    const p = [a[0]!, a[1]!] as const;
    const out = new Float32Array(2 * (3 * n + 1));
    for (let j = 0; j < out.length; j += 2) { out[j] = p[0]; out[j + 1] = p[1]; }
    v.subpaths[i] = out;
    return;
  }
  const lengths = new Array<number>(k);
  for (let c = 0; c < k; c++) lengths[c] = Math.hypot(a[6 * c + 6]! - a[6 * c]!, a[6 * c + 7]! - a[6 * c + 1]!);
  const counts = distributeCurves(lengths, n);
  // Work from the last curve backwards so indices stay valid
  for (let c = k - 1; c >= 0; c--) if (counts[c]! > 1) a = splitCurve(a, c, counts[c]!);
  v.subpaths[i] = a;
  v.invalidateBox();
  return;
}

/** Each path's path data memo (see pathData): the renderer's own, so no field of a path holds it. */
const pathCaches = new WeakMap<VMobject, PathCache>();

/**
 * SVG path data as { d, tx, ty }: integer coordinates (units of 10^-3, the
 * viewBox matches, see svg.ts) relative to the path's first point, plus that
 * point as a translation. With relative = false, absolute coordinates and a
 * zero translation: measured faster for live DOM patching in Chromium
 * (97 vs 129 ms/s main thread), while relative is faster for string output
 * (1.1 vs 1.55 ms/frame), so each sink picks. `d` depends only on the shape, so a path that moves
 * rigidly keeps its string and only `transform` changes (two thirds of all
 * point changes in the example scenes). Still a pure function of the points:
 * output is deterministic and independent of cache history.
 *
 * Two levels of memo:
 *  - points unchanged (version + array identity): return the cached object
 *  - points changed: re-round and compare integers to the cached shape; only
 *    a real shape change formats a new string
 * @internal
 */
export function pathData(v: VMobject, relative = true): PathData {
  const c = pathCaches.get(v);
  if (c && c.owner === v && c.relative === relative && c.v === pointsVersion(v) && sameRefs(c.arrays, v.subpaths) && sameFlags(c.closed, v.closed)) {
    perf.count('path hit');
    return c.pd;
  }
  if (!relative) {
    perf.count('path reshaped');
    const pd = { d: pathD(v), tx: 0, ty: 0 };
    pathCaches.set(v, { owner: v, relative, v: pointsVersion(v), arrays: v.subpaths.slice(), closed: v.closed.slice(), pd });
    return pd;
  }
  const { ints, lens, tx, ty } = roundedRelative(v);
  let d;
  if (c && c.owner === v && c.relative && sameInts(c.ints, ints) && sameInts(c.lens, lens) && sameFlags(c.closedAtFormat!, v.closed)) {
    perf.count('path moved');
    d = c.pd.d;
  } else {
    perf.count('path reshaped');
    d = formatInts(ints, lens, v.closed);
  }
  const pd = c && c.pd.d === d && c.pd.tx === tx && c.pd.ty === ty ? c.pd : { d, tx, ty };
  pathCaches.set(v, {
    owner: v, relative, v: pointsVersion(v), arrays: v.subpaths.slice(), closed: v.closed.slice(), closedAtFormat: v.closed.slice(),
    ints, lens, pd,
  });
  return pd;
}

/** Absolute path data string (for tools and tests; rendering uses pathData). @internal */
export function pathD(v: VMobject): string {
  const { ints, lens, tx, ty } = roundedRelative(v);
  for (let i = 0; i < ints.length; i += 2) { ints[i]! += tx; ints[i + 1]! += ty; }
  return formatInts(ints, lens, v.closed);
}

/**
 * Integer path coordinates for SVG. This is the one place the model's y-up
 * becomes SVG's y-down: y is negated here and nowhere else.
 * @internal
 */
function roundedRelative(v: VMobject): RoundedPath {
  const k = UNITS;
  const first = v.subpaths.find((a) => a.length >= 2);
  const x0 = first ? first[0]! : 0, y0 = first ? first[1]! : 0;
  const tx = Math.round(x0 * k), ty = Math.round(-y0 * k);
  let n = 0;
  for (const a of v.subpaths) n += a.length;
  const ints = new Int32Array(n), lens = new Int32Array(v.subpaths.length);
  let w = 0;
  for (let i = 0; i < v.subpaths.length; i++) {
    const a = v.subpaths[i]!;
    lens[i] = a.length;
    // Round the offset from the first point, not each absolute coordinate: rounding absolutes
    // flips individual digits under sub-unit translations, so a rigidly moving path would look
    // reshaped. Cost: a point may land 1 unit (0.001 scene units) from absolute rounding.
    for (let j = 0; j < a.length; j += 2) { ints[w++] = Math.round((a[j]! - x0) * k); ints[w++] = Math.round((y0 - a[j + 1]!) * k); }
  }
  return { ints, lens, tx, ty };
}
