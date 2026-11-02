/** Fixed-tilt teaching geometry, not an ephemeris. Angles are degrees; azimuth is north=0, east=90. */
export const LATITUDE = 40.75;
export const TILT = 23.44;
export const STREET = 299.1;
export const SUN_RADIUS = 0.2666;
export type Street = 'manhattan' | 'west';
const rad = Math.PI / 180;
const deg = 180 / Math.PI;
const clamp = (n: number) => Math.max(-1, Math.min(1, n));
/** Equatorial direction projected onto the observer's east, north and up axes. Hour angle is west-positive. */
export function sky(latitude: number, declination: number, hourAngle: number) {
  const p = latitude * rad, d = declination * rad, h = hourAngle * rad;
  const east = -Math.cos(d) * Math.sin(h);
  const north = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.cos(h) * Math.sin(p);
  const up = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(h) * Math.cos(p);
  return { east, north, up, altitude: Math.asin(clamp(up)) * deg,
    azimuth: (Math.atan2(east, north) * deg + 360) % 360 };
}
/** Solar direction through an idealised circular orbit, longitude 0 at the March equinox. */
export const declination = (longitude: number) => Math.asin(Math.sin(TILT * rad) * Math.sin(longitude * rad)) * deg;
/** The sunset point for the centre of the Sun on a flat geometric horizon; no atmospheric refraction. */
export function sunset(decl: number) {
  const hour = Math.acos(clamp(-Math.tan(LATITUDE * rad) * Math.tan(decl * rad))) * deg;
  return { declination: decl, hourAngle: hour, ...sky(LATITUDE, decl, hour) };
}
/** At a fixed western bearing and height, solve the spherical altitude/azimuth relation for solar declination. */
export function crossings(bearing: number, altitude = 0) {
  const p = LATITUDE * rad, a = altitude * rad, az = bearing * rad;
  const d = Math.asin(clamp(Math.sin(p) * Math.sin(a) + Math.cos(p) * Math.cos(a) * Math.cos(az))) * deg;
  const ratio = Math.sin(d * rad) / Math.sin(TILT * rad);
  if (Math.abs(ratio) > 1) return [];
  const raw = (Math.asin(ratio) * deg + 360) % 360;
  const first = Math.abs(raw - 360) < 1e-10 || raw < 1e-10 ? 0 : raw;
  return [first, (180 - first + 360) % 360].sort((x, y) => x - y);
}
export function henge(street: Street) {
  if (street !== 'manhattan' && street !== 'west') throw new Error('Choose manhattan or west');
  const bearing = street === 'manhattan' ? STREET : 270;
  const seasons = [-TILT, 0, TILT].map((d) => ({ ...sunset(d),
    path: Array.from({ length: 49 }, (_, i) => sky(LATITUDE, d, sunset(d).hourAngle * i / 48)) }));
  return { street, bearing, latitude: LATITUDE, tilt: TILT, radius: SUN_RADIUS, seasons,
    annual: Array.from({ length: 145 }, (_, i) => ({ longitude: i * 2.5, ...sunset(declination(i * 2.5)) })),
    half: crossings(bearing), full: crossings(bearing, SUN_RADIUS) };
}
