// How the henge explainer draws its flat pictures: the overhead grid with the Sun's directions, and the
// year's sunset directions against the street. The street views and the globe are in ./place.ts; the
// idealised 3D pictures (the dome, the year's turn, the camera and the tilted Earths) in ./sky.ts.
//
// Visual decisions: the overhead grid is schematic, turned to the street's bearing, not the city's real
// blocks; its sunrise direction is the idealised day's path reached at the opposite hour angle.
import { Group, Circle, Dot, Line, Arrow, VMobject, keyed } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { label } from '../../../explain/drawing.ts';
import type { Henge } from './model.ts';
import { INK, SUN, SUMMER, MUTED } from './sky.ts';

const rad = Math.PI / 180;
/** Words at (x, y) on stage `s`, in INK at the picture's size unless told otherwise. */
const writer = (s: Stage) => (text: string, x: number, y: number, color = INK, size = 0.58) => label(s, text, { at: [x, y], color, size });
const line = (a: Vec, b: Vec, color = MUTED, width = 0.035) => new Line(a, b, { stroke: color, strokeWidth: width });
function path(points: Vec[], color: string, width = 0.07) {
  const p = new VMobject({ stroke: color, strokeWidth: width, fill: 'none' });
  p.startNewPath(points[0]!);
  for (const point of points.slice(1)) p.addLineTo(point);
  return p;
}
/** A bearing as words: "29.0° north of west", or "due west" within 0.05°. */
export const offWest = (az: number) => Math.abs(az - 270) < 0.05 ? 'due west' : `${Math.abs(az - 270).toFixed(1)}° ${az > 270 ? 'north' : 'south'} of west`;
export const offEast = (az: number) => Math.abs(az - 90) < 0.05 ? 'due east' : `${Math.abs(az - 90).toFixed(1)}° ${az < 90 ? 'north' : 'south'} of east`;

/** The chart's state: the street, each evening's half-Sun azimuth through 2026, and the alignment evenings. */
export interface AnnualState { bearing: number; street: string; year: { date: string; azimuth: number }[]; crossings: { date: string; name: string }[] }
/** The year's half-Sun directions against the street, each evening of 2026, with the evenings the curve crosses it. */
export function annual(st: AnnualState, s: Stage): Group {
  const words = writer(s);
  const day = (date: string) => st.year.findIndex((d) => d.date === date);
  const x = (i: number) => -6 + (i / (st.year.length - 1)) * 12;
  const y = (bearing: number) => (bearing - 270) / 35 * 2.35;
  const streetY = y(st.bearing), north = st.bearing - 270 > 5;
  const g = new Group(line([-6, 0], [6, 0], MUTED),
    path(st.year.map((p, i) => [x(i), y(p.azimuth)]), SUN),
    line([-6, streetY], [6, streetY], SUMMER, 0.045),
    words('Gold: the half Sun’s direction, 2026', 0, -3.5, SUN));
  if (north) g.add(words('due west', 5.0, 0.42, MUTED));
  [['Jan', '2026-01-01'], ['Apr', '2026-04-01'], ['Jul', '2026-07-01'], ['Oct', '2026-10-01'], ['Dec', '2026-12-31']].forEach(([name, date]) => g.add(words(name!, x(day(date!)), -2.8)));
  // The street's name under its line where the curve leaves room: early in the year for a street far north
  // of west, between the crossings, where the curve is above it, for one near west.
  const nameX = north ? -4.8 : (x(day(st.crossings[0]!.date)) + x(day(st.crossings[1]!.date))) / 2;
  // Far north of west, the curve leaves room for the name alone; the title and the overhead view give the angle.
  g.add(keyed(new Group(words(st.street, nameX, streetY - 0.55, SUMMER), ...(north ? [] : [words(offWest(st.bearing), nameX, streetY - 1.23, SUMMER)])), 'henge-annual-street'));
  // Each date sits above the street, outside its dot, where the curve is below the line.
  st.crossings.forEach(({ date, name }, i) => {
    const side = i === 0 ? -1 : 1, at: Vec = [x(day(date)) + side * 0.12, streetY + 0.6];
    g.add(new Dot({ radius: 0.13, color: SUMMER }).moveTo([x(day(date)), streetY]),
      keyed(words(name, 0, 0, SUMMER).moveTo(at, [-side, 0]), `henge-annual-date:${i}`));
  });
  return keyed(g, 'henge-annual');
}

/** Overhead, north up: a schematic grid turned to the street's bearing, and the Sun's direction at sunset and sunrise
 *  on the first alignment day. East is +x, north is +y; an azimuth points along (sin az, cos az). */
export function overhead({ bearing, alignment }: { bearing: number; alignment: Henge['alignment'] }, s: Stage): Group {
  const words = writer(s);
  const dir = (az: number): Vec => [Math.sin(az * rad), Math.cos(az * rad)];
  const o: Vec = [0, -0.5];
  const at = (p: Vec, along: Vec, t: number): Vec => [p[0] + along[0] * t, p[1] + along[1] * t];
  const u = dir(bearing), v: Vec = [u[1], -u[0]];
  const streetsHalf = 2.6, avenuesHalf = 1.05;
  const grid = new Group();
  for (let k = -4; k <= 4; k++) {
    const c = at(o, v, (k * avenuesHalf) / 4);
    grid.add(line(at(c, u, -streetsHalf), at(c, u, streetsHalf), '#cbd5e1', k === 0 ? 0 : 0.03));
  }
  for (let j = -3; j <= 3; j++) {
    const c = at(o, u, (j * streetsHalf) / 3);
    grid.add(line(at(c, v, -avenuesHalf), at(c, v, avenuesHalf), '#cbd5e1', 0.05));
  }
  const north = keyed(new Group(new Arrow([-6.4, -3.4], [-6.4, -2.2], { stroke: INK, strokeWidth: 0.05 }), words('N', -6.4, -1.75)), 'henge-map-north');
  // Drawn over the Sun's rays, thinner than them, so a ray along the street still shows the street inside it.
  const street = keyed(new Group(line(at(o, u, -streetsHalf - 0.6), at(o, u, streetsHalf + 0.6), SUMMER, 0.04)), 'henge-map-street');
  const ray = (az: number, length: number, dashed: boolean) => {
    const a = new Arrow(at(o, dir(az), 0.25), at(o, dir(az), length), { stroke: SUN, strokeWidth: 0.07 });
    if (dashed) a.style.dashArray = '0.22 0.14';
    return a;
  };
  const { sunset, sunrise, back } = alignment;
  // Each Sun's name and bearing sit above its disc, on the outer side, clear of the ray that reaches it from below.
  const disc = (az: number) => at(o, dir(az), 4.1);
  const tag = (name: string, detail: string, az: number, side: -1 | 1) => {
    // A ray near the horizontal would put its words on the grid: they stay a grid's height above the centre.
    const d: Vec = [0, Math.max(disc(az)[1], o[1] + 1.5)], x = side * 6.6;
    return new Group(words(name, 0, 0, SUN).moveTo([x, d[1] + 1.22], [side, 0]), words(detail, 0, 0, SUN).moveTo([x, d[1] + 0.54], [side, 0]));
  };
  const sun = keyed(new Group(
    ray(sunset, 3.8, false), ray(sunrise, 3.8, true),
    new Circle({ radius: 0.2, fill: SUN, stroke: SUN }).moveTo(disc(sunset)),
    new Circle({ radius: 0.2, fill: SUN, stroke: SUN }).moveTo(disc(sunrise)),
    tag('Sunset', offWest(sunset), sunset, -1), tag('Sunrise', offEast(sunrise), sunrise, 1),
  ), 'henge-map-sun');
  const notes = [words('East end', 0, 0, SUMMER).moveTo([6.6, -2.55], [1, 0]), words(offEast(back), 0, 0, SUMMER).moveTo([6.6, -3.23], [1, 0]),
    words(`Sunrise misses that end by ${Math.abs(back - sunrise).toFixed(1)}°`, 0, -3.9)];
  return keyed(new Group(grid, sun, street, new Dot({ radius: 0.12, color: INK }).moveTo(o), north, ...notes), 'henge-map');
}
