// The seasons explainer's model: the Sun's height, daylight and distance through the year, from a cosine approximation of its declination.
// Its limits: daylight times the Sun's centre above a flat horizon, leaving out refraction, the Sun's disc and hills
// or buildings, so almanac days are longer and polar nights shorter; noon sunlight leaves out the atmosphere's
// absorption; no weather or temperature is modelled. The tilt is fixed at 23.44°, the year is 365 days, and the
// yearly curve comes from the declination approximation, not an almanac checked date by date.
export function sunlight(latitude: number, declination: number): { altitude: number; daylight: number } {
  const rad = Math.PI / 180;
  const cos = -Math.tan(latitude * rad) * Math.tan(declination * rad);
  return {
    altitude: 90 - Math.abs(latitude - declination),
    daylight: cos <= -1 ? 24 : cos >= 1 ? 0 : (24 * Math.acos(cos)) / Math.PI,
  };
}
/**
 * Sunlight on one square metre of flat ground at noon, as a share of what an overhead Sun gives:
 * sin of the noon altitude, and 0 when the Sun is below the horizon. The beam that would cover
 * one square metre with the Sun overhead is spread over 1 / sin(altitude) square metres. The air,
 * which absorbs more at low angles, is left out.
 */
export function noonShare(latitude: number, declination: number): number {
  return Math.max(0, Math.sin((sunlight(latitude, declination).altitude * Math.PI) / 180));
}
/**
 * The length of level ground, in metres along the Sun's direction, that a noon beam one metre
 * across (measured at right angles to its rays) lands on: 1 / sin of the noon altitude, so the
 * share per square metre is 1 / patch. Null when the noon Sun is below the horizon.
 */
export function noonPatch(latitude: number, declination: number): number | null {
  const { altitude } = sunlight(latitude, declination);
  return altitude > 0 ? 1 / Math.sin((altitude * Math.PI) / 180) : null;
}
/**
 * Earth's distance from the Sun in astronomical units on a day of the year (0 = 1 January):
 * R = 1.00014 − 0.01671 cos g − 0.00014 cos 2g (Wikipedia, Position of the Sun), with the mean
 * anomaly g = 360° × (day − 2) / 365, zero at perihelion about 2 days after 1 January, as that
 * article's (N − 2) term puts it.
 */
export function sunDistance(day: number): number {
  const g = (2 * Math.PI * (day - 2)) / 365;
  return 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
}
/** Day of the year (0 = 1 January) of each month's 15th, in a common year. */
export const MID_MONTH = [14, 45, 73, 104, 134, 165, 195, 226, 257, 287, 318, 348] as const;
/** The Sun's declination in degrees, from the usual cosine approximation: −23.44° × cos(360° × (day + 10) / 365). */
export const declinationOn = (day: number) => -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365);
/** Daylight hours on the 15th of each month. */
export function daylightYear(latitude: number): number[] {
  return MID_MONTH.map((day) => Math.round(sunlight(latitude, declinationOn(day)).daylight * 10) / 10);
}
