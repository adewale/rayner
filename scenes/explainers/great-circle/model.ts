// The great-circle explainer's model: routes on a sphere of the Earth's mean radius, the rhumb line a
// Mercator ruler draws, the Mercator stretch, and where a route crosses land. No drawing here; the
// scene draws these numbers and points through seenFrom. Angles are degrees, distances kilometres.
import { LAND, LANDMASS } from './land.ts';

/** The Earth's mean radius (IUGG), the sphere every figure here is computed on. */
export const RADIUS_KM = 6371;
export interface Place { lat: number; lon: number }
export interface Airport extends Place { code: string; city: string }
/** Airport reference points (published coordinates, degrees). */
export const AIRPORTS = {
  LHR: { code: 'LHR', city: 'London', lat: 51.47, lon: -0.4543 },
  LAX: { code: 'LAX', city: 'Los Angeles', lat: 33.9416, lon: -118.4085 },
  MAD: { code: 'MAD', city: 'Madrid', lat: 40.4983, lon: -3.5676 },
  JFK: { code: 'JFK', city: 'New York', lat: 40.6413, lon: -73.7781 },
} as const satisfies Record<string, Airport>;
export type Code = keyof typeof AIRPORTS;

const D = Math.PI / 180;
type V3 = [number, number, number];
const vec = ({ lat, lon }: Place): V3 => [Math.cos(lat * D) * Math.cos(lon * D), Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D)];
const place = (v: V3): Place => ({ lat: Math.atan2(v[2], Math.hypot(v[0], v[1])) / D, lon: Math.atan2(v[1], v[0]) / D });
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const n = Math.hypot(...a); return [a[0] / n, a[1] / n, a[2] / n]; };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Longitude difference wrapped to [-180, 180). */
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** Great-circle distance by the haversine formula (its atan2 form, which keeps its precision near the antipodes). */
export function haversine(a: Place, b: Place): number {
  const h = Math.sin(((b.lat - a.lat) * D) / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(((b.lon - a.lon) * D) / 2) ** 2;
  return 2 * RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
/** The compass bearing to set off on along the great circle, clockwise from north. */
export function initialBearing(a: Place, b: Place): number {
  const y = Math.sin((b.lon - a.lon) * D) * Math.cos(b.lat * D);
  const x = Math.cos(a.lat * D) * Math.sin(b.lat * D) - Math.sin(a.lat * D) * Math.cos(b.lat * D) * Math.cos((b.lon - a.lon) * D);
  return ((Math.atan2(y, x) / D) % 360 + 360) % 360;
}
/** The unit normal of the plane through a, b and the Earth's centre, on the northern side. */
export function pole(a: Place, b: Place): V3 {
  const n = unit(cross(vec(a), vec(b)));
  return n[2] < 0 ? [-n[0], -n[1], -n[2]] : n;
}
/** The northernmost point of the great circle through a and b: where the plane's tilt toward the pole peaks. */
export function vertex(a: Place, b: Place): Place {
  const n = pole(a, b);
  // The equator has no single highest point: every point on it is as high as any other.
  if (1 - n[2] * n[2] < 1e-24) return { lat: 0, lon: a.lon };
  return place(unit([-n[2] * n[0], -n[2] * n[1], 1 - n[2] * n[2]]));
}
/** Points along the shorter great-circle arc from a to b, `count` intervals. */
export function greatCircle(a: Place, b: Place, count = 120): Place[] {
  const u = vec(a), w = vec(b), angle = Math.acos(Math.max(-1, Math.min(1, dot(u, w)))), s = Math.sin(angle);
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, ka = Math.sin((1 - t) * angle) / s, kb = Math.sin(t * angle) / s;
    return place([ka * u[0] + kb * w[0], ka * u[1] + kb * w[1], ka * u[2] + kb * w[2]]);
  });
}
/** The highest latitude on the arc between a and b (the vertex, when it lies between them). */
export function highest(a: Place, b: Place): Place {
  const v = vertex(a, b), n = pole(a, b), va = vec(a), vb = vec(b), vv = vec(v);
  // Between a and b on the shorter arc: a→v and v→b both turn the same way about n as a→b.
  const between = dot(cross(va, vv), n) > 0 === dot(cross(va, vb), n) > 0 && dot(cross(vv, vb), n) > 0 === dot(cross(va, vb), n) > 0;
  return between ? v : a.lat >= b.lat ? a : b;
}
/** Mercator's northing for a latitude: the ruler line is straight in (longitude, northing). */
export const northing = (lat: number) => Math.atanh(Math.sin(lat * D)); // = ln tan(45° + φ/2), without its rounding near the equator
/** The rhumb line: one compass heading all the way, a straight line on Mercator's map. */
export function rhumb(a: Place, b: Place): { km: number; heading: number } {
  const dLat = (b.lat - a.lat) * D, dLon = wrap(b.lon - a.lon) * D, dPsi = northing(b.lat) - northing(a.lat);
  // dLat / dPsi tends to cos φ; for a tiny change of latitude the quotient loses its digits, so take the limit.
  const q = Math.abs(dLat) > 1e-8 ? dLat / dPsi : Math.cos(((a.lat + b.lat) / 2) * D);
  return { km: RADIUS_KM * Math.hypot(dLat, q * dLon), heading: ((Math.atan2(dLon, dPsi) / D) % 360 + 360) % 360 };
}
/** Points along the rhumb line from a to b: evenly spaced in Mercator's coordinates. */
export function rhumbLine(a: Place, b: Place, count = 120): Place[] {
  const dLon = wrap(b.lon - a.lon), ya = northing(a.lat), yb = northing(b.lat);
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, y = ya + (yb - ya) * t;
    return { lat: (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / D, lon: wrap(a.lon + dLon * t) };
  });
}
/** How much wider Mercator draws an east–west distance at a latitude than at the equator. */
export const stretch = (lat: number) => 1 / Math.cos(lat * D);

/** Inside a [lon, lat] ring, by ray casting in degrees (Natural Earth's own coordinates). */
function inside(p: Place, ring: readonly (readonly [number, number])[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i]!, [x2, y2] = ring[j]!;
    if (y1 > p.lat !== y2 > p.lat && p.lon < ((x2 - x1) * (p.lat - y1)) / (y2 - y1) + x1) hit = !hit;
  }
  return hit;
}
const NAMES = Object.fromEntries(Object.entries(LANDMASS).map(([name, i]) => [i, name])) as Record<number, string>;
/** The landmass under a point: its name, 'land' for an unnamed one, or null for sea. */
export function landAt(p: Place): string | null {
  const i = LAND.findIndex((ring) => inside(p, ring));
  return i < 0 ? null : NAMES[i] ?? 'land';
}
/** What a route passes over, in order: runs of land or sea with where each begins and ends. */
export function overflies(points: readonly Place[]): { over: string | null; from: Place; to: Place }[] {
  const out: { over: string | null; from: Place; to: Place }[] = [];
  for (const p of points) {
    const over = landAt(p), last = out.at(-1);
    if (last && last.over === over) last.to = p;
    else out.push({ over, from: p, to: p });
  }
  return out;
}

/** Everything the explainer says about one route, from the formulas above. */
export function route(from: Code, to: Code) {
  const a = AIRPORTS[from], b = AIRPORTS[to];
  const km = haversine(a, b), ruler = rhumb(a, b), top = highest(a, b);
  return {
    from: { code: a.code, city: a.city, lat: a.lat, lon: a.lon },
    to: { code: b.code, city: b.city, lat: b.lat, lon: b.lon },
    km, rhumbKm: ruler.km, extraKm: ruler.km - km, heading: ruler.heading,
    bearing: initialBearing(a, b), top,
    stretch: { from: stretch(a.lat), top: stretch(top.lat) },
  };
}
export type Route = ReturnType<typeof route>;
/** The two routes the script compares. */
export const london = () => route('LHR', 'LAX');
export const madrid = () => route('MAD', 'JFK');
/** Rounded as the script says them: kilometres to the nearest ten, degrees to the nearest whole. */
export const tens = (km: number) => (Math.round(km / 10) * 10).toLocaleString('en-GB');
