// The henge explainer's model, in two parts.
//
// The real Sun, for two real places in 2026. A low-precision solar ephemeris (Meeus, Astronomical
// Algorithms, 2nd ed., ch. 25, with the apparent longitude and obliquity of that chapter, the equation of
// the equinoxes and the Sun's 8.8″ parallax) gives the Sun's direction at any instant; sky() turns it
// into azimuth and altitude at the place. Half Sun is the evening moment the Sun's centre is 34′ below a
// flat horizon, where standard refraction lifts it onto the horizon; full Sun is one semidiameter later in
// altitude, its lower edge on the horizon. The ephemeris, the events and the alignment dates are checked
// against Skyfield 1.55 with JPL's DE440s (fixtures/henge-sun.json, from oracle/sun.py); the places'
// coordinates and bearings are OpenStreetMap nodes and GeographicLib geodesics recorded there too.
// Left out: the day's weather (refraction is the standard 34′), terrain and buildings above the flat
// horizon, the observer's height, UT1 − UTC (under a second) and ΔT's drift (fixed at 69.2 s).
//
// The idealised sky, for the dome, the year's turn, the camera and the tilted Earths: a fixed 23.44° tilt
// and a circular orbit, longitude 0 at the March equinox, the Sun's centre at a flat geometric horizon. It
// shows the geometry of a sunset sweeping north and back; its calendar is conceptual. sky() is checked
// against ERFA's hd2ae (fixtures/henge-erfa.json, from oracle/henge.py).
/** Angles are degrees; azimuth is north=0, east=90; hour angle is west-positive; times are UTC milliseconds. */
export const TILT = 23.44;
/** Days in a year: the idealised orbit's mean rate turns longitude into days, 365.2422 for 360°. */
export const YEAR = 365.2422;
/** Standard refraction at the horizon: what lifts a Sun whose centre is 34′ down onto a flat horizon. */
export const REFRACTION = 34 / 60;
/** The Sun's radius in km, which with its distance gives the semidiameter (15′59.6″ at 1 au). */
export const SUN_KM = 696000;
const AU_KM = 149597870.7;
/** TT − UT in 2026, in seconds: the ephemeris runs on TT, the clock on UT. */
export const DELTA_T = 69.2;

export type Place = 'manhattan' | 'chicago';
export interface Where {
  /** The viewpoint, as the captions name it. */
  name: string; street: string; city: string;
  /** The viewpoint (an OpenStreetMap node), geodetic, east-positive longitude. */
  latitude: number; longitude: number;
  /** The street's bearing toward its western end, and how far its buildings run that way, in metres (to the far node). */
  bearing: number; metres: number;
  /** The far node the bearing is measured to. */
  far: string;
  /** Hours from UTC to the clocks in force on the dates shown (daylight time, 8 March to 1 November 2026). */
  utcOffset: number; zone: string;
}
/** Two viewpoints, from fixtures/henge-sun.json: the OSM nodes and GeographicLib's WGS84 bearing and length between them. */
export const PLACES: Record<Place, Where> = {
  manhattan: { name: 'the Tudor City overpass', street: '42nd Street', city: 'New York', latitude: 40.749124, longitude: -73.9705351,
    bearing: 299.0264, metres: 2685.8, far: '11th Avenue', utcOffset: -4, zone: 'EDT' },
  chicago: { name: 'Randolph Street at Michigan Avenue', street: 'Randolph Street', city: 'Chicago', latitude: 41.8844844, longitude: -87.6243714,
    bearing: 269.7734, metres: 1914.6, far: 'Halsted Street', utcOffset: -5, zone: 'CDT' },
};
export const placeOf = (place: Place): Where => {
  const where = PLACES[place];
  if (!where) throw new Error('Choose manhattan or chicago');
  return where;
};

const rad = Math.PI / 180;
const deg = 180 / Math.PI;
const clamp = (n: number) => Math.max(-1, Math.min(1, n));
const wrap = (a: number) => ((a % 360) + 360) % 360;
/** Equatorial direction projected onto the observer's east, north and up axes. Hour angle is west-positive. */
export function sky(latitude: number, declination: number, hourAngle: number) {
  const p = latitude * rad, d = declination * rad, h = hourAngle * rad;
  const east = -Math.cos(d) * Math.sin(h);
  const north = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.cos(h) * Math.sin(p);
  const up = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(h) * Math.cos(p);
  return { east, north, up, altitude: Math.asin(clamp(up)) * deg,
    azimuth: (Math.atan2(east, north) * deg + 360) % 360 };
}

// ---------------------------------------------------------------- the real Sun
/** The Sun at an instant: its declination, where it stands overhead, its distance and semidiameter. */
export function sun(utc: number) {
  const jd = utc / 86400000 + 2440587.5, d = jd - 2451545;
  const T = (d + DELTA_T / 86400) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * rad;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * rad;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * rad;
  const epsilon = (23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega)) * rad;
  const au = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(M + C * rad));
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda)) * deg;
  const rightAscension = wrap(Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * deg);
  // Greenwich apparent sidereal time: mean (IAU 1982, UT taken for UT1) plus the equation of the equinoxes.
  const gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38710000;
  const gast = wrap(gmst + (-0.00478 * Math.sin(omega) - 0.00037 * Math.sin(2 * (280.4665 + 36000.7698 * T) * rad)) * Math.cos(epsilon));
  return { declination, rightAscension, gast, au, semidiameter: Math.asin(SUN_KM / (au * AU_KM)) * deg,
    /** Where the Sun stands overhead: latitude is the declination, longitude east-positive. */
    overhead: { lat: declination, lon: ((rightAscension - gast + 540) % 360) - 180 } };
}
/** The Sun seen from a place at an instant: geometric (no refraction), from the place itself (parallax included). */
export function sunFrom(place: Place, utc: number) {
  const where = placeOf(place), s = sun(utc);
  const hourAngle = ((s.gast + where.longitude - s.rightAscension + 540) % 360) - 180;
  const v = sky(where.latitude, s.declination, hourAngle);
  const parallax = (8.794 / 3600 / s.au) * Math.cos(v.altitude * rad);
  return { utc, azimuth: v.azimuth, altitude: v.altitude - parallax, declination: s.declination, hourAngle, semidiameter: s.semidiameter, overhead: s.overhead };
}
export type Seen = ReturnType<typeof sunFrom>;
export type Kind = 'half' | 'full';
/** How far below the flat horizon the Sun's centre is at each event: refraction lifts it by REFRACTION. */
export const target = (kind: Kind, semidiameter: number) => -REFRACTION + (kind === 'full' ? semidiameter : 0);
const DAY = 86400000;
/** The UTC midnight that starts a date, 'YYYY-MM-DD'. */
export const midnight = (date: string) => Date.parse(`${date}T00:00:00Z`);
/** A date moved by `days`. */
export const shifted = (date: string, days: number) => new Date(midnight(date) + days * DAY).toISOString().slice(0, 10);
/**
 * The evening moment of half or full Sun at a place on a date: bisection on the Sun's altitude between the
 * place's mean solar noon and twelve hours later, where it only falls, once. `lift` raises the horizon by that many
 * degrees (refraction kept at 34′), for asking how buildings or terrain above the flat horizon would move the dates.
 */
export function moment(place: Place, date: string, kind: Kind, lift = 0): Seen & { date: string; kind: Kind } {
  const noon = midnight(date) + (12 - placeOf(place).longitude / 15) * 3600000;
  let lo = noon, hi = noon + DAY / 2;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2, s = sunFrom(place, mid);
    if (s.altitude > target(kind, s.semidiameter) + lift) lo = mid; else hi = mid;
  }
  return { ...sunFrom(place, (lo + hi) / 2), date, kind };
}
/** Every date of 2026. */
export const DATES = Array.from({ length: 365 }, (_, i) => shifted('2026-01-01', i));
/**
 * The evenings when the Sun's azimuth at half (or full) Sun is nearest the street's bearing: one either
 * side of each change of sign, as the oracle picks them.
 */
export function aligned(place: Place, kind: Kind, evenings = DATES.map((date) => moment(place, date, kind))) {
  const bearing = placeOf(place).bearing, off = evenings.map((e) => e.azimuth - bearing);
  const found: typeof evenings = [];
  for (let i = 0; i + 1 < evenings.length; i++)
    if (off[i]! > 0 !== off[i + 1]! > 0) found.push(evenings[Math.abs(off[i]!) < Math.abs(off[i + 1]!) ? i : i + 1]!);
  return found;
}
/** A moment's clock time where the place is, "8:13 pm", for dates while daylight time is in force (8 March to 1 November 2026). */
export function clock(place: Place, utc: number): string {
  const date = new Date(utc).toISOString().slice(0, 10);
  if (date < '2026-03-08' || date > '2026-10-31') throw new RangeError(`clock(): ${date} is outside daylight time, the only offset the model knows`);
  const t = new Date(utc + placeOf(place).utcOffset * 3600000 + 30000);
  const h = t.getUTCHours(), m = t.getUTCMinutes();
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "25 May". */
export const dayName = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
/** The point `distance` degrees from (lat, lon) along `bearing`, on a sphere. */
export function along(lat: number, lon: number, bearing: number, distance: number) {
  const p = lat * rad, b = bearing * rad, d = distance * rad;
  const q = Math.asin(clamp(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b)));
  const l = lon * rad + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(q));
  return { lat: q * deg, lon: ((l * deg + 540) % 360) - 180 };
}

// ---------------------------------------------------------------- the idealised sky
/** Solar declination through an idealised circular orbit, longitude 0 at the March equinox. */
export const declination = (longitude: number) => Math.asin(Math.sin(TILT * rad) * Math.sin(longitude * rad)) * deg;
/** The sunset point for the centre of the Sun on a flat geometric horizon; no atmospheric refraction. */
export function sunset(latitude: number, decl: number) {
  const hour = Math.acos(clamp(-Math.tan(latitude * rad) * Math.tan(decl * rad))) * deg;
  return { latitude, declination: decl, hourAngle: hour, ...sky(latitude, decl, hour) };
}
/** At a fixed western bearing and height, solve the spherical altitude/azimuth relation for solar declination, then the idealised orbit for longitude. */
export function crossings(latitude: number, bearing: number, altitude = 0) {
  const p = latitude * rad, a = altitude * rad, az = bearing * rad;
  const d = Math.asin(clamp(Math.sin(p) * Math.sin(a) + Math.cos(p) * Math.cos(a) * Math.cos(az))) * deg;
  const ratio = Math.sin(d * rad) / Math.sin(TILT * rad);
  if (Math.abs(ratio) > 1) return [];
  const raw = (Math.asin(ratio) * deg + 360) % 360;
  const first = Math.abs(raw - 360) < 1e-10 || raw < 1e-10 ? 0 : raw;
  return [first, (180 - first + 360) % 360].sort((x, y) => x - y);
}
/** The sunrise point for the centre of the Sun on a flat horizon: the same path as sunset, reached at the opposite hour angle. */
export function sunrise(latitude: number, decl: number) {
  const hour = -sunset(latitude, decl).hourAngle;
  return { latitude, declination: decl, hourAngle: hour, ...sky(latitude, decl, hour) };
}

// ---------------------------------------------------------------- one place's story
/** The evenings the street views show: the first alignment a week before and after, the next evening, and the other place's first alignment. */
export const OTHER: Record<Place, Place> = { manhattan: 'chicago', chicago: 'manhattan' };
export function henge(place: Place) {
  const where = placeOf(place), { latitude, bearing } = where;
  const half = DATES.map((date) => moment(place, date, 'half'));
  const halves = aligned(place, 'half', half), fulls = aligned(place, 'full');
  if (halves.length !== 2 || fulls.length !== 2) throw new Error(`henge(): ${place} has ${halves.length} half-Sun alignments in 2026, not two`);
  const first = halves[0]!;
  const otherFirst = aligned(OTHER[place], 'half')[0]!.date;
  const at = (date: string) => half[DATES.indexOf(date)]!;
  const evenings = [
    { role: 'before', ...at(shifted(first.date, -7)) }, { role: 'aligned', ...first },
    { role: 'next', ...at(shifted(first.date, 1)) }, { role: 'after', ...at(shifted(first.date, 7)) },
    { role: 'other', ...at(otherFirst) },
  ];
  // The idealised sky at this latitude, for the dome and the year's turn: the street's crossings as orbital
  // longitudes in the year the turn runs, from the December solstice (-90) to the next (270).
  const ideal = crossings(latitude, bearing).map((c) => (c > 270 ? c - 360 : c)).sort((x, y) => x - y);
  const seasons = [-TILT, 0, TILT].map((d) => sunset(latitude, d));
  // Seen from above on the first alignment day: where the Sun sets and rises, and where the street's other end points.
  const back = (bearing + 180) % 360;
  // Where the street, carried on along the ground, meets the ring of places where the Sun stands at this place's half Sun.
  const meets = along(latitude, where.longitude, bearing, 90 + REFRACTION);
  return { place, where, bearing, latitude, tilt: TILT, seasons, ideal,
    /** Each evening of 2026: its half Sun's azimuth, for the year's chart. */
    year: half.map(({ date, azimuth }) => ({ date, azimuth })),
    aligned: { half: halves, full: fulls }, evenings,
    alignment: { sunset: bearing, sunrise: sunrise(latitude, declination(ideal[0]!)).azimuth, back },
    backCrossings: crossings(latitude, 360 - back),
    meets };
}
export type Henge = ReturnType<typeof henge>;
