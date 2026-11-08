// seenFrom: a 3D model drawn through a viewpoint as ordinary keyed 2D mobjects. Part of the
// drawing kit (`rayner/drawing`); nothing here animates, registers or reads scene state.
//
// The viewpoint is plain JSON state, `{ kind, yaw, pitch }`. A camera move is a Follow over its
// values, so every frame is `seenFrom(model, viewpoint(t))`: a pure function of time that seeks
// like any other play. There is no second renderer and no z-buffer. Depth is an explicit order:
//
//   1. far:     what the body hides, drawn first (culled, or dashed and dimmed when a part asks)
//   2. body:    the sphere's disc
//   3. surface: what lies on the near side of the sphere (faces, then paths, then points)
//   4. above:   what stands off the sphere on the near side, in model order
//
// On a convex body nothing on the near surface can hide anything else there, so the only order
// that matters is far, body, near, and it never depends on a sort. `depthOrder(picture)` checks it
// for any picture seenFrom drew, at rest or mid-Follow.
import { Group, VMobject, Dot, Circle } from '../src/index.ts';
import type { Mobject, Vec, Box } from '../src/index.ts';
import { center } from '../src/box.ts';

/** A point in the model: x toward latitude 0, longitude 0; y toward longitude 90° E; z toward the north pole. */
export type Vec3 = readonly [number, number, number];

/**
 * Where the model is seen from. `yaw` and `pitch` are the longitude and latitude, in degrees, of the
 * point that faces the viewer (north stays up). `orthographic` looks from far away; `perspective`
 * from `distance` sphere radii from the centre (default 3); `gnomonic` from the sphere's centre onto
 * the plane touching it at (pitch, yaw), out to `limit` degrees (default 60); `mercator` unrolls the
 * sphere onto a cylinder with `yaw` as its central meridian, out to `limit` degrees of latitude
 * (default 80), and ignores `pitch`. Plain JSON: it is state, and a Follow turns it.
 */
export interface Viewpoint {
  kind: 'orthographic' | 'perspective' | 'gnomonic' | 'mercator';
  yaw: number;
  pitch: number;
  distance?: number;
  limit?: number;
}

/**
 * How a part's far pieces are drawn, before the body: not at all (`cull`, the default); dashed and
 * dimmed (`dashed`, seen through a translucent body); or in the part's own style (`behind`), so the
 * body covers what it hides and what sticks out past the limb still shows.
 */
export type Hidden = 'cull' | 'dashed' | 'behind';
/** A dot at a point. */
export interface PointPart { kind: 'point'; key?: string; at: Vec3; color: string; radius?: number; hidden?: Hidden }
/** Polylines drawn as one stroke; `closed` joins each line's last point to its first. */
export interface PathPart {
  kind: 'path'; key?: string; lines: readonly (readonly Vec3[])[]; closed?: boolean;
  color: string; width?: number; opacity?: number; dashArray?: string; hidden?: Hidden;
}
/**
 * A filled region: an outer ring and any holes (even-odd). A face either lies on the sphere or
 * stands off it; it must not pass through the body.
 */
export interface FacePart {
  kind: 'face'; key?: string; rings: readonly (readonly Vec3[])[];
  fill: string; fillOpacity?: number; stroke?: string; width?: number; hidden?: Hidden;
}
export type Part = PointPart | PathPart | FacePart;
/** The sphere every part is seen against, centred at the origin. */
export interface Body { radius: number; fill: string; fillOpacity?: number; stroke: string; strokeWidth?: number; key?: string }
/** A 3D model: a body and the parts on and around it, all plain JSON. */
export interface Model3D { body: Body; parts: readonly Part[] }

/** Where the drawing goes on the stage: its centre, scene units per model unit, and for Mercator a clipping box in scene units. */
export interface SeenOptions { at?: Vec; scale?: number; window?: Box; key?: string }

export type Layer = 'far' | 'body' | 'surface' | 'above';
/** What seenFrom records on each piece it draws, so depthOrder can check it: an own field, so Follow's become() carries it. */
export interface SeenPiece { part: string; layer: Layer; surface: boolean; lines: Vec3[][]; shown: boolean }
/** What seenFrom records on the picture it returns. */
export interface SeenPicture { viewpoint: Viewpoint; radius: number; at: Vec; scale: number; window?: Box }

const D = Math.PI / 180;
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const unit3 = (a: Vec3): Vec3 => { const n = len3(a); return [a[0] / n, a[1] / n, a[2] / n]; };
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Longitude difference wrapped to [-180, 180). */
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** The point at a latitude and longitude (degrees) on a sphere of `radius`. */
export function latLon(lat: number, lon: number, radius = 1): Vec3 {
  const p = lat * D, l = lon * D;
  return [radius * Math.cos(p) * Math.cos(l), radius * Math.cos(p) * Math.sin(l), radius * Math.sin(p)];
}
/** A point's latitude and longitude in degrees. */
export function toLatLon(p: Vec3): { lat: number; lon: number } {
  return { lat: Math.asin(Math.max(-1, Math.min(1, p[2] / len3(p)))) / D, lon: Math.atan2(p[1], p[0]) / D };
}
/** The shorter great-circle arc from a to b on their sphere, a point at least every `step` degrees, both ends included. */
export function greatArc(a: Vec3, b: Vec3, step = 1): Vec3[] {
  const r = len3(a), u = unit3(a), w = unit3(b);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot3(u, w))));
  const n = Math.max(1, Math.ceil(angle / D / step));
  const s = Math.sin(angle);
  return Array.from({ length: n + 1 }, (_, i) => {
    if (i === 0) return a;
    if (i === n) return b;
    const t = i / n, ka = Math.sin((1 - t) * angle) / s, kb = Math.sin(t * angle) / s;
    return [r * (ka * u[0] + kb * w[0]), r * (ka * u[1] + kb * w[1]), r * (ka * u[2] + kb * w[2])] as Vec3;
  });
}
/** The circle `angle` degrees from `pole` on a sphere of `radius` (90 gives a great circle), a point every `step` degrees, not repeated at the end. */
export function circleOn(pole: Vec3, angle: number, radius = 1, step = 2): Vec3[] {
  const n = unit3(pole);
  const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = unit3(cross3(helper, n)), w = cross3(n, u);
  const c = Math.cos(angle * D), s = Math.sin(angle * D), count = Math.ceil(360 / step);
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * 2 * Math.PI, cu = Math.cos(t) * s, cw = Math.sin(t) * s;
    return [radius * (c * n[0] + cu * u[0] + cw * w[0]), radius * (c * n[1] + cu * u[1] + cw * w[1]), radius * (c * n[2] + cu * u[2] + cw * w[2])] as Vec3;
  });
}
/** The viewpoint a fraction `t` of the way from a to b (same kind): yaw turns the short way. */
export function between(a: Viewpoint, b: Viewpoint, t: number): Viewpoint {
  if (a.kind !== b.kind) throw new Error(`between(): a ${a.kind} and a ${b.kind} viewpoint have nothing in between; give two viewpoints of one kind`);
  if (t <= 0) return a;
  if (t >= 1) return b;
  const v: Viewpoint = { kind: a.kind, yaw: a.yaw + wrap(b.yaw - a.yaw) * t, pitch: a.pitch + (b.pitch - a.pitch) * t };
  if (a.distance !== undefined || b.distance !== undefined) v.distance = (a.distance ?? 3) + ((b.distance ?? 3) - (a.distance ?? 3)) * t;
  if (a.limit !== undefined || b.limit !== undefined) v.limit = (a.limit ?? 60) + ((b.limit ?? 60) - (a.limit ?? 60)) * t;
  return v;
}

/** The viewpoint's axes: toward the eye, screen right (east) and screen up (north). */
function axes(vp: Viewpoint) {
  const p = vp.pitch * D, l = vp.yaw * D;
  const toward: Vec3 = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  const right: Vec3 = [-Math.sin(l), Math.cos(l), 0];
  const up: Vec3 = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)];
  return { toward, right, up };
}

/** Points within this fraction of the radius of a boundary count as on it, for drawing and for checking. */
const EDGE = 1e-7;

/**
 * One viewpoint, ready to classify and place points. `near(p)` is the rule depthOrder holds every
 * picture to: for the globe kinds, a point is near when the body does not hide it from the eye.
 */
function lens(vp: Viewpoint, radius: number, { at = [0, 0], scale = 1 }: SeenOptions, api = 'seenFrom()') {
  if (!['orthographic', 'perspective', 'gnomonic', 'mercator'].includes(vp.kind)) throw new RangeError(`${api}: ${JSON.stringify(vp.kind)} is not a viewpoint kind; use orthographic, perspective, gnomonic or mercator`);
  if (![vp.yaw, vp.pitch].every(Number.isFinite)) throw new RangeError(`${api}: yaw and pitch must be finite degrees`);
  const { toward, right, up } = axes(vp);
  const distance = (vp.distance ?? 3) * radius;
  const limit = vp.limit ?? (vp.kind === 'mercator' ? 80 : 60);
  if (vp.kind === 'perspective' && !(distance > radius)) throw new RangeError(`${api}: a perspective eye must be outside the sphere, so distance must be more than 1`);
  if (vp.kind === 'gnomonic' && !(limit > 0 && limit < 89)) throw new RangeError(`${api}: a gnomonic limit must be between 0 and 89 degrees`);
  if (vp.kind === 'mercator' && !(limit > 0 && limit < 89)) throw new RangeError(`${api}: a Mercator limit must be between 0 and 89 degrees`);
  const globe = vp.kind === 'orthographic' || vp.kind === 'perspective';
  /** The silhouette plane: points on the eye's side of it are never behind the sphere. */
  const horizon = vp.kind === 'perspective' ? (radius * radius) / distance : 0;
  const tol = EDGE * radius;
  const onSphere = (p: Vec3) => Math.abs(len3(p) - radius) <= tol * 10;
  /** Signed: positive on the near side of the silhouette plane (or, for gnomonic, inside the cone). */
  const side = (p: Vec3): number => {
    if (vp.kind === 'gnomonic') return dot3(p, toward) / len3(p) - Math.cos(limit * D);
    if (vp.kind === 'mercator') return limit - Math.abs(toLatLon(p).lat);
    return dot3(p, toward) - horizon;
  };
  /**
   * How far a point is inside the seen region (positive) or outside it (negative), in model units
   * (cosines for gnomonic, degrees of latitude for Mercator). For the globe kinds a point is seen when
   * it is on the eye's side of the silhouette plane and not inside the body; a surface part is judged
   * by the plane alone, since its chords stand for arcs on the sphere.
   */
  const margin = (p: Vec3, surface: boolean): number => {
    const s = side(p);
    if (!globe) return s;
    let m = s;
    if (!surface) m = Math.min(m, len3(p) - radius);
    if (vp.kind === 'perspective') m = Math.min(m, distance - dot3(p, toward));
    return m;
  };
  const near = (p: Vec3, surface: boolean): boolean => margin(p, surface) >= -tol;
  const place = (x: number, y: number): Vec => [at[0] + scale * x, at[1] + scale * y];
  const yMax = radius * Math.log(Math.tan(Math.PI / 4 + (limit * D) / 2));
  /** Where a point lands on the stage. */
  const project = (p: Vec3): Vec => {
    if (vp.kind === 'mercator') {
      const { lat, lon } = toLatLon(p);
      const clamped = Math.max(-limit, Math.min(limit, lat));
      return place(radius * wrap(lon - vp.yaw) * D, radius * Math.log(Math.tan(Math.PI / 4 + (clamped * D) / 2)));
    }
    const x = dot3(p, right), y = dot3(p, up);
    if (vp.kind === 'orthographic') return place(x, y);
    const depth = dot3(p, toward);
    if (vp.kind === 'perspective') { const k = distance / Math.max(distance - depth, tol); return place(x * k, y * k); }
    // Outside the cone a point has no place on the paper: it waits, unseen, on the rim in its direction.
    if (depth < Math.cos(limit * D) * len3(p)) {
      const h = Math.hypot(x, y) || 1, rim = radius * Math.tan(limit * D);
      return place((x / h) * rim, (y / h) * rim);
    }
    const k = radius / depth;
    return place(x * k, y * k);
  };
  /** The inverse of a Mercator placement, for points a window clip makes. */
  const unproject = (q: Vec): Vec3 => {
    const x = (q[0] - at[0]) / scale, y = (q[1] - at[1]) / scale;
    return latLon((2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) / D, vp.yaw + x / radius / D, radius);
  };
  /** The body's outline on the stage: the limb's radius, or null for the map kinds. */
  const limb = vp.kind === 'orthographic' ? radius * scale
    : vp.kind === 'perspective' ? (scale * radius * distance) / Math.sqrt(distance * distance - radius * radius) : null;
  return { vp, radius, at, scale, globe, toward, side, margin, near, onSphere, project, unproject, limb, limit, yMax, tol };
}
type Lens = ReturnType<typeof lens>;

/** Where a point lands and whether it is seen: for a label beside a part, drawn from the same viewpoint. */
export function project(p: Vec3, viewpoint: Viewpoint, radius = 1, options: SeenOptions = {}): { at: Vec; seen: boolean } {
  const l = lens(viewpoint, radius, options, 'project()');
  let seen = l.near(p, l.onSphere(p));
  if (seen && viewpoint.kind === 'mercator' && options.window) {
    const q = l.project(p), w = options.window;
    seen = q[0] >= w[0] && q[0] <= w[2] && q[1] >= w[1] && q[1] <= w[3];
  }
  return { at: l.project(p), seen };
}

/** The parameter in (0, 1) where `test` changes along a→b: bisection, so any classifier works. */
function crossing(a: Vec3, b: Vec3, test: (p: Vec3) => boolean): number {
  const start = test(a);
  let lo = 0, hi = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (test(mix3(a, b, mid)) === start) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
/**
 * The point where a→b crosses from one side to the other. A segment between two points on the
 * sphere stands for the arc between them, so its crossing is put back on the sphere.
 */
function cut(a: Vec3, b: Vec3, test: (p: Vec3) => boolean, l: { onSphere: (p: Vec3) => boolean; radius: number }): Vec3 {
  if (!l.onSphere(a) || !l.onSphere(b)) return mix3(a, b, crossing(a, b, test));
  const lift = (p: Vec3): Vec3 => { const k = l.radius / len3(p); return [p[0] * k, p[1] * k, p[2] * k]; };
  return lift(mix3(a, b, crossing(a, b, (p) => test(lift(p)))));
}

/**
 * Split a polyline into its near runs and its far runs, each boundary point shared by both sides.
 * An off-surface segment can cross the sphere twice, so it is sampled before it is split.
 */
function split(line: readonly Vec3[], closed: boolean, l: Lens, surface: boolean): { near: Vec3[][]; far: Vec3[][] } {
  const pts = closed && line.length > 2 ? [...line, line[0]!] : [...line];
  const dense: Vec3[] = [];
  pts.forEach((p, i) => {
    if (i && !surface && l.globe) for (let k = 1; k < 16; k++) dense.push(mix3(pts[i - 1]!, p, k / 16));
    dense.push(p);
  });
  const isNear = (p: Vec3) => l.near(p, surface);
  const near: Vec3[][] = [], far: Vec3[][] = [];
  let run: Vec3[] = [], runNear = dense.length ? isNear(dense[0]!) : true;
  if (dense.length) run.push(dense[0]!);
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1]!, b = dense[i]!, bNear = isNear(b);
    if (bNear !== runNear) {
      const edge = cut(a, b, isNear, l);
      run.push(edge);
      (runNear ? near : far).push(run);
      run = [edge];
      runNear = bNear;
    }
    run.push(b);
  }
  if (run.length) (runNear ? near : far).push(run);
  // A closed line whose start and end are on the same side is one run there, not two.
  for (const runs of [near, far]) {
    if (closed && runs.length > 1 && dense.length > 2) {
      const first = runs[0]!, last = runs[runs.length - 1]!;
      if (first[0] === dense[0] && last[last.length - 1] === dense[dense.length - 1]) {
        runs[0] = [...last, ...first.slice(1)];
        runs.pop();
      }
    }
  }
  return { near: near.filter((r) => r.length > 1), far: far.filter((r) => r.length > 1) };
}

/** A Mercator run cut where it crosses the map's edge meridian, so no stroke spans the map. */
function seams(run: Vec3[], l: Lens): Vec3[][] {
  const out: Vec3[][] = [];
  let cur: Vec3[] = [run[0]!];
  for (let i = 1; i < run.length; i++) {
    const a = toLatLon(run[i - 1]!), b = toLatLon(run[i]!);
    const la = wrap(a.lon - l.vp.yaw), lb = wrap(b.lon - l.vp.yaw);
    if (Math.abs(lb - la) > 180) {
      const edge = la > 0 ? 180 : -180, lb2 = lb + (la > 0 ? 360 : -360);
      const t = (edge - la) / (lb2 - la), lat = a.lat + (b.lat - a.lat) * t;
      cur.push(latLon(lat, l.vp.yaw + edge - (edge > 0 ? 1e-9 : -1e-9), l.radius));
      out.push(cur);
      cur = [latLon(lat, l.vp.yaw - edge + (edge > 0 ? 1e-9 : -1e-9), l.radius)];
    }
    cur.push(run[i]!);
  }
  out.push(cur);
  return out;
}

/** Liang–Barsky: the part of a→b inside the box, as parameters, or null. */
function clipSegment(a: Vec, b: Vec, w: Box): [number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - w[0]], [dx, w[2] - a[0]], [-dy, a[1] - w[1]], [dy, w[3] - a[1]]] as const) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}
/** A Mercator run's pieces inside the window, as 3D points (clip points mapped back through the projection). */
function windowed(run: Vec3[], l: Lens, w: Box): Vec3[][] {
  const out: Vec3[][] = [];
  let cur: Vec3[] = [];
  for (let i = 1; i < run.length; i++) {
    const a = l.project(run[i - 1]!), b = l.project(run[i]!);
    const c = clipSegment(a, b, w);
    // A segment that only touches the window is outside it: whether its point lands a hair inside
    // or out is rounding, and must not decide how many strokes the map draws.
    if (!c || (c[1] - c[0]) * Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-7) { if (cur.length > 1) out.push(cur); cur = []; continue; }
    const pa = c[0] === 0 ? run[i - 1]! : l.unproject([a[0] + (b[0] - a[0]) * c[0], a[1] + (b[1] - a[1]) * c[0]]);
    const pb = c[1] === 1 ? run[i]! : l.unproject([a[0] + (b[0] - a[0]) * c[1], a[1] + (b[1] - a[1]) * c[1]]);
    if (!cur.length || c[0] > 0) { if (cur.length > 1) out.push(cur); cur = [pa]; }
    cur.push(pb);
    if (c[1] < 1) { out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** The near (or far) part of a ring, clipped against one side (Sutherland–Hodgman). Surface faces follow the horizon between their cuts. */
function clipRing(ring: readonly Vec3[], keep: (p: Vec3) => boolean, l: Lens, surface: boolean): Vec3[] {
  const out: Vec3[] = [];
  const cuts = new Set<Vec3>();
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!, ka = keep(a), kb = keep(b);
    if (ka) out.push(a);
    if (ka !== kb) { const e = cut(a, b, keep, l); cuts.add(e); out.push(e); }
  }
  if (!surface || !l.globe || cuts.size < 2) return out;
  // Between an exit and the next entry the region runs along the horizon, not straight across the disc.
  const arced: Vec3[] = [];
  out.forEach((p, i) => {
    arced.push(p);
    const q = out[(i + 1) % out.length]!;
    if (cuts.has(p) && cuts.has(q)) arced.push(...greatArc(p, q, 2).slice(1, -1));
  });
  return arced;
}

const isSurface = (points: readonly Vec3[], l: Lens) => points.every((p) => l.onSphere(p));
function path(style: ConstructorParameters<typeof VMobject>[0], lines: Vec3[][], l: Lens, closed = false): VMobject {
  const m = new VMobject(style);
  for (const line of lines) {
    m.startNewPath(l.project(line[0]!));
    for (const p of line.slice(1)) m.addLineTo(l.project(p));
    if (closed) m.closePath();
  }
  return m;
}
function piece<M extends Mobject>(m: M, seen: SeenPiece, key: string | undefined): M {
  Object.assign(m, { seen });
  if (key !== undefined) m.key = key;
  return m;
}
const hiddenKey = (key: string | undefined) => (key === undefined ? undefined : `${key}:hidden`);

/**
 * The model seen from the viewpoint: a Group of keyed pieces in depth order (far, body, surface,
 * above). Each part gives the same pieces at every viewpoint, so a Follow can redraw it frame by
 * frame: its near piece keyed `key`, and, when the part asks for hidden pieces, a far piece keyed
 * `key:hidden`. A point is always a Dot, transparent where it cannot be seen. The map kinds draw
 * only the parts that lie on the sphere, and no body. Pure: the same model and viewpoint draw the
 * same picture.
 */
export function seenFrom(model: Model3D, viewpoint: Viewpoint, options: SeenOptions = {}): Group {
  const radius = model.body.radius;
  if (!(radius > 0)) throw new RangeError('seenFrom(): the body needs a positive radius');
  const l = lens(viewpoint, radius, options);
  const window = viewpoint.kind === 'mercator'
    ? [Math.max(options.window?.[0] ?? -Infinity, l.project(latLon(0, viewpoint.yaw - 179.999999, radius))[0]),
      Math.max(options.window?.[1] ?? -Infinity, l.at[1] - l.scale * l.yMax),
      Math.min(options.window?.[2] ?? Infinity, l.project(latLon(0, viewpoint.yaw + 179.999999, radius))[0]),
      Math.min(options.window?.[3] ?? Infinity, l.at[1] + l.scale * l.yMax)] as Box
    : undefined;
  const far: Mobject[] = [], faces: Mobject[] = [], paths: Mobject[] = [], points: Mobject[] = [], above: Mobject[] = [];
  model.parts.forEach((part, index) => {
    const name = part.key ?? `part ${index}`;
    const all = part.kind === 'point' ? [part.at] : part.kind === 'path' ? part.lines.flat() : part.rings.flat();
    const surface = isSurface(all, l);
    if (!l.globe && !surface) return; // a map draws the sphere's surface only
    const nearLayer: Layer = surface ? 'surface' : 'above';
    if (part.kind === 'point') {
      const shown = project(part.at, viewpoint, radius, { ...options, window });
      const r = part.radius ?? 0.08;
      if (part.hidden && part.hidden !== 'cull' && l.globe)
        far.push(piece(new Circle({ radius: r, fill: 'none', stroke: part.color, strokeWidth: 0.025, dashArray: '0.05 0.04', opacity: shown.seen ? 0 : 0.6 }).moveTo(shown.at),
          { part: name, layer: 'far', surface, lines: [[part.at]], shown: !shown.seen }, hiddenKey(part.key)));
      (surface ? points : above).push(piece(new Dot({ radius: r, color: part.color, opacity: shown.seen ? 1 : 0 }).moveTo(shown.at),
        { part: name, layer: nearLayer, surface, lines: [[part.at]], shown: shown.seen }, part.key));
      return;
    }
    if (part.kind === 'path') {
      const nearRuns: Vec3[][] = [], farRuns: Vec3[][] = [];
      for (const line of part.lines) {
        const { near, far: back } = split(line, !!part.closed, l, surface);
        let runs = near;
        if (viewpoint.kind === 'mercator') runs = runs.flatMap((r) => seams(r, l)).flatMap((r) => windowed(r, l, window!));
        nearRuns.push(...runs.filter((r) => r.length > 1));
        farRuns.push(...back);
      }
      const whole = nearRuns.length === part.lines.length && !!part.closed && farRuns.length === 0 && viewpoint.kind !== 'mercator';
      const style = { stroke: part.color, strokeWidth: part.width ?? 0.04, fill: 'none', ...(part.opacity !== undefined ? { opacity: part.opacity } : {}), ...(part.dashArray ? { dashArray: part.dashArray } : {}) };
      if (part.hidden && part.hidden !== 'cull' && l.globe)
        far.push(piece(path(part.hidden === 'behind' ? style : { ...style, dashArray: '0.1 0.08', opacity: 0.45 * (part.opacity ?? 1) }, farRuns, l),
          { part: name, layer: 'far', surface, lines: farRuns, shown: farRuns.length > 0 }, hiddenKey(part.key)));
      (surface ? paths : above).push(piece(path(style, nearRuns, l, whole), { part: name, layer: nearLayer, surface, lines: nearRuns, shown: nearRuns.length > 0 }, part.key));
      return;
    }
    if (!l.globe && viewpoint.kind === 'mercator' && part.rings.some((ring) => ring.some((p, i) => i && Math.abs(wrap(toLatLon(p).lon - toLatLon(ring[i - 1]!).lon)) > 90)))
      throw new Error(`seenFrom(): the face ${name} crosses the Mercator map's edge; split it in two there`);
    // Faces are cut by the silhouette plane alone, so one must not pass through the body.
    const keepNear = (p: Vec3) => l.near(p, true);
    const nearRings = part.rings.map((ring) => clipRing(ring, keepNear, l, surface)).filter((r) => r.length > 2);
    const farRings = l.globe ? part.rings.map((ring) => clipRing(ring, (p) => !keepNear(p), l, surface)).filter((r) => r.length > 2) : [];
    const style = { fill: part.fill, fillOpacity: part.fillOpacity ?? 1, stroke: part.stroke ?? 'none', strokeWidth: part.width ?? 0.02, fillRule: 'evenodd' as const };
    if (part.hidden && part.hidden !== 'cull' && l.globe)
      far.push(piece(path(part.hidden === 'behind' ? style : { ...style, fillOpacity: (part.fillOpacity ?? 1) * 0.4, dashArray: '0.1 0.08' }, farRings, l, true),
        { part: name, layer: 'far', surface, lines: farRings, shown: farRings.length > 0 }, hiddenKey(part.key)));
    (surface ? faces : above).push(piece(path(style, nearRings, l, true), { part: name, layer: nearLayer, surface, lines: nearRings, shown: nearRings.length > 0 }, part.key));
  });
  const b = model.body;
  const body = l.limb === null ? [] : [piece(new Circle({ radius: l.limb, fill: b.fill, fillOpacity: b.fillOpacity ?? 1, stroke: b.stroke, strokeWidth: b.strokeWidth ?? 0.04 }).moveTo(l.at),
    { part: b.key ?? 'body', layer: 'body', surface: true, lines: [], shown: true }, b.key)];
  const g = new Group(...far, ...body, ...faces, ...paths, ...points, ...above);
  const picture: SeenPicture = { viewpoint: { ...viewpoint }, radius, at: [...l.at] as Vec, scale: l.scale, ...(window ? { window } : {}) };
  Object.assign(g, { seenPicture: picture });
  if (options.key) g.key = options.key;
  return g;
}

const RANK: Record<Layer, number> = { far: 0, body: 1, surface: 2, above: 3 };
const seenOf = (m: Mobject) => (m as Mobject & { seen?: SeenPiece }).seen;
/** The seenFrom pictures in `m`'s family (m included), outermost first. */
export function seenPictures(m: Mobject): Group[] {
  return m.family().filter((x): x is Group => !!(x as Mobject & { seenPicture?: SeenPicture }).seenPicture);
}
const fmt = (vp: Viewpoint) => `${vp.kind} yaw ${vp.yaw.toFixed(1)}°, pitch ${vp.pitch.toFixed(1)}°`;
/** A piece's drawn anchors, subpath by subpath. */
function anchors(m: Mobject): Vec[][] {
  if (m instanceof Circle) {
    const b = m.box();
    return b ? [[center(b)]] : [];
  }
  if (!(m instanceof VMobject)) return [];
  return m.subpaths.map((a) => {
    const out: Vec[] = [];
    for (let i = 0; i < a.length; i += 6) out.push([a[i]!, a[i + 1]!]);
    return out;
  });
}

/**
 * Hold a picture seenFrom drew to its depth order: true when it held, a message naming the first
 * part out of order, or undefined when `picture` holds no seenFrom drawing. For each drawing it
 * checks, against the viewpoint the drawing records:
 *
 * - the layers come in order: far, then the body, then the near side;
 * - every vertex of a far piece is hidden by the body, and every vertex of a near piece is seen;
 * - a point that cannot be seen is transparent;
 * - each piece is drawn where that viewpoint puts its points (a picture morphed between two
 *   viewpoints is drawn from neither, and parts on their way behind the body would cross in front).
 *
 * A viewpoint change that reaches a picture without redrawing it fails the second rule: what was
 * near is now behind the body, still drawn in front.
 */
export function depthOrder(picture: Mobject): true | string | undefined {
  const drawings = seenPictures(picture);
  if (!drawings.length) return undefined;
  for (const g of drawings) {
    const meta = (g as Group & { seenPicture: SeenPicture }).seenPicture;
    const l = lens(meta.viewpoint, meta.radius, { at: meta.at, scale: meta.scale }, 'depthOrder()');
    const tolerance = 1e-4 * Math.max(1, meta.scale * meta.radius);
    const slack = 1e-6 * (meta.viewpoint.kind === 'mercator' ? 1 : meta.radius);
    const pieces = g.children.filter((m) => seenOf(m)).map((m) => [m, seenOf(m)!] as const);
    // Depth first: the order of the layers, and which side of the body each piece's points are on.
    let rank = 0, last = 'the start';
    for (const [m, s] of pieces) {
      if (RANK[s.layer] < rank) return `${s.part} (${s.layer}) is drawn after ${last}: depth order is far, body, surface, above`;
      rank = RANK[s.layer];
      last = `${s.part} (${s.layer})`;
      if (s.layer === 'body') continue;
      if (m instanceof Circle) {
        const p = s.lines[0]![0]!, seen = l.near(p, s.surface), visible = m.style.opacity !== 0;
        const q = l.project(p), w = meta.window;
        const inWindow = !w || (q[0] >= w[0] - tolerance && q[0] <= w[2] + tolerance && q[1] >= w[1] - tolerance && q[1] <= w[3] + tolerance);
        if (s.layer !== 'far' && visible && !(seen && inWindow)) return `${s.part} is drawn in front from ${fmt(meta.viewpoint)}, but the body hides it there`;
        if (s.layer === 'far' && visible && seen) return `${s.part} is drawn as hidden from ${fmt(meta.viewpoint)}, but it is in sight there`;
        continue;
      }
      // Judged as its part was drawn: all on the sphere (by the silhouette plane alone), or not.
      for (const line of s.lines)
        for (const p of line) {
          const margin = l.margin(p, s.surface);
          if (s.layer === 'far' && margin > slack) return `${s.part}'s hidden piece holds a point in sight from ${fmt(meta.viewpoint)}`;
          if (s.layer !== 'far' && margin < -slack) return `${s.part} is drawn in front from ${fmt(meta.viewpoint)}, but part of it is on the far side of the body`;
        }
    }
    // Then placement: each piece drawn where the recorded viewpoint puts its points.
    for (const [m, s] of pieces) {
      if (s.layer === 'body') continue;
      const drawn = anchors(m), want = s.lines.map((line) => line.map((p) => l.project(p)));
      if (drawn.length !== want.length) return `${s.part} is drawn as ${drawn.length} strokes, not the ${want.length} that ${fmt(meta.viewpoint)} gives`;
      for (let i = 0; i < want.length; i++) {
        const d = drawn[i]!, w = want[i]!;
        for (let j = 0; j < w.length; j++) {
          const q = d[j];
          if (!q) return `${s.part} is drawn with fewer points than ${fmt(meta.viewpoint)} gives`;
          const off = Math.hypot(q[0] - w[j]![0], q[1] - w[j]![1]);
          if (off > tolerance) return `${s.part} is drawn ${off.toFixed(3)} from where ${fmt(meta.viewpoint)} puts it`;
        }
      }
    }
  }
  return true;
}
