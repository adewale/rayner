// How the henge explainer draws its flat pictures: the street seen from its middle, the overhead grid
// with the Sun's directions, the year's sunset directions against the street, and the half- and
// full-Sun discs. The 3D pictures (the dome, the year's turn, the camera and the tilted Earths) are in
// ./sky.ts.
//
// Visual decisions: the overhead grid is schematic, turned to the street's bearing, not Manhattan's real
// blocks; its sunrise direction is the same day's path reached at the opposite hour angle. The street
// views enlarge the Sun's disc and simplify the buildings.
import { Group, Circle, Dot, Line, Polygon, Rectangle, Arrow, VMobject } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { label } from '../../../explain/drawing.ts';
import type { henge, Street } from './model.ts';
import { INK, SUN, SUMMER, MUTED, ROAD } from './sky.ts';

type Model = ReturnType<typeof henge>;
/** The two alignment seasons each street gets: May and July for Manhattan's, the equinoxes for due west. */
const SEASONS: Record<Street, readonly [string, string]> = { manhattan: ['May', 'July'], west: ['March', 'September'] };
export const seasonsOf = (street: Street) => SEASONS[street];
/** Each street's name under its picture. */
const STREET_NAME: Record<Street, string> = { manhattan: '42nd Street: about 29° north of west', west: 'A street pointing due west' };

const rad = Math.PI / 180;
const words = (text: string, x: number, y: number, color = INK, size = 0.58) => label(text, x, y, color, size);
const line = (a: Vec, b: Vec, color = MUTED, width = 0.035) => new Line(a, b, { stroke: color, strokeWidth: width });
function path(points: Vec[], color: string, width = 0.07) {
  const p = new VMobject({ stroke: color, strokeWidth: width, fill: 'none' });
  p.startNewPath(points[0]!);
  for (const point of points.slice(1)) p.addLineTo(point);
  return p;
}
function tagged<T extends Group>(g: T, key: string): T { g.key = key; return g; }

/** Street perspective: a visible horizon clips the disc; the two walls keep its bearing fixed.
 *  The ground below the horizon is the page itself, with the roadway drawn on it, so it has no panel edge. */
function streetView(half: boolean, paper: string, cx = 0, scale = 1, cy = 0) {
  const at = (x: number, y: number): Vec => [cx + x * scale, cy + y * scale];
  const horizon = -0.55, radius = 0.8, centre = horizon + (half ? 0 : radius);
  return new Group(
    new Circle({ radius: radius * scale, fill: SUN, stroke: SUN }).moveTo(at(0, centre)),
    new Rectangle({ width: 2.4 * radius * scale, height: 1.2 * radius * scale, fill: paper, stroke: 'none' })
      .moveTo(at(0, horizon - 0.6 * radius)),
    new Polygon([at(-3.1, -3), at(-0.25, horizon), at(0.25, horizon), at(3.1, -3)], { fill: ROAD, stroke: 'none' }),
    new Polygon([at(-6, -3), at(-6, 2.8), at(-1.3, 0.4), at(-1.3, horizon)], { fill: '#d8e0e8', stroke: MUTED }),
    new Polygon([at(6, -3), at(6, 2.8), at(1.3, 0.4), at(1.3, horizon)], { fill: '#d8e0e8', stroke: MUTED }),
    line(at(-6, horizon), at(6, horizon), INK),
    line(at(-3.1, -3), at(-0.25, horizon)), line(at(3.1, -3), at(0.25, horizon)),
    new Dot({ radius: 0.06 * scale, color: INK }).moveTo(at(0, half ? centre : centre - radius)),
  );
}

/** The opening picture: the street seen from its middle, the full Sun between its walls, and the street's name. */
export function drawStreet(st: { street: Street }, s: Stage): Group {
  return tagged(new Group(streetView(false, s.look.paper), words(STREET_NAME[st.street], 0, -3.7)), 'henge-street');
}

/** The year's sunset directions against the street; with `crossings`, the days the curve crosses it. */
export function annual(st: { bearing: number; street: Street; annual: { longitude: number; azimuth: number }[]; crossings?: number[] }): Group {
  const manhattan = st.street === 'manhattan', seasonNames = seasonsOf(st.street);
  const x = (longitude: number) => -6 + longitude / 360 * 12;
  const y = (bearing: number) => (bearing - 270) / 35 * 2.35;
  const streetY = y(st.bearing);
  const g = new Group(line([-6, 0], [6, 0], MUTED),
    path(st.annual.map((p) => [x(p.longitude), y(p.azimuth)]), SUN),
    line([-6, streetY], [6, streetY], SUMMER, 0.045),
    words(manhattan ? 'Street: 29° N of west' : 'Street: due west', 3.5, streetY + 0.6, SUMMER),
    words('Yellow: sunset direction', 0, -3.5, SUN));
  if (manhattan) g.add(words('due west', -4.9, -0.45, MUTED));
  ['Mar', 'Jun', 'Sep', 'Dec', 'Mar'].forEach((label, i) => g.add(words(label, -6 + i * 3, -2.8)));
  // Each name sits on the side of its dot that the curve leaves empty: the first crossing rises
  // through the street, the second falls. Manhattan's names go above, due west's below.
  const above = manhattan;
  st.crossings?.forEach((longitude, i) => {
    const side = (i === 0) === above ? -1 : 1, at: Vec = [x(longitude) + side * 0.12, streetY + (above ? 0.6 : -0.55)];
    g.add(new Dot({ radius: 0.13, color: SUMMER }).moveTo([x(longitude), streetY]),
      words(seasonNames[i]!, 0, 0, SUMMER).moveTo(at, [-side, 0]));
  });
  return tagged(g, 'henge-annual');
}

/** Overhead, north up: a schematic grid turned to the street's bearing, and the Sun's direction at sunset and sunrise
 *  on the first alignment day. East is +x, north is +y; an azimuth points along (sin az, cos az). */
export function overhead({ bearing, street: which, alignment }: { bearing: number; street: Street; alignment: Model['alignment'] }): Group {
  const manhattan = which === 'manhattan';
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
  const north = tagged(new Group(new Arrow([-6.4, -3.4], [-6.4, -2.2], { stroke: INK, strokeWidth: 0.05 }), words('N', -6.4, -1.75)), 'henge-map-north');
  // Drawn over the Sun's rays, thinner than them, so a ray along the street still shows the street inside it.
  const street = tagged(new Group(line(at(o, u, -streetsHalf - 0.6), at(o, u, streetsHalf + 0.6), SUMMER, 0.04)), 'henge-map-street');
  const ray = (az: number, length: number, dashed: boolean) => {
    const a = new Arrow(at(o, dir(az), 0.25), at(o, dir(az), length), { stroke: SUN, strokeWidth: 0.07 });
    if (dashed) a.style.dashArray = '0.22 0.14';
    return a;
  };
  const { sunset, sunrise, back } = alignment;
  const offWest = (az: number) => Math.abs(az - 270) < 0.05 ? 'due west' : `${Math.abs(az - 270).toFixed(1)}° ${az > 270 ? 'north' : 'south'} of west`;
  const offEast = (az: number) => Math.abs(az - 90) < 0.05 ? 'due east' : `${Math.abs(az - 90).toFixed(1)}° ${az < 90 ? 'north' : 'south'} of east`;
  // Each Sun's name and bearing sit above its disc, on the outer side, clear of the ray that reaches it from below.
  const disc = (az: number) => at(o, dir(az), 4.1);
  const tag = (name: string, detail: string, az: number, side: -1 | 1) => {
    const d = disc(az), x = side * 6.6;
    return new Group(words(name, 0, 0, SUN).moveTo([x, d[1] + 1.22], [side, 0]), words(detail, 0, 0, SUN).moveTo([x, d[1] + 0.54], [side, 0]));
  };
  const sun = tagged(new Group(
    ray(sunset, 3.8, false), ray(sunrise, 3.8, true),
    new Circle({ radius: 0.2, fill: SUN, stroke: SUN }).moveTo(disc(sunset)),
    new Circle({ radius: 0.2, fill: SUN, stroke: SUN }).moveTo(disc(sunrise)),
    tag('Sunset', offWest(sunset), sunset, -1), tag('Sunrise', offEast(sunrise), sunrise, 1),
  ), 'henge-map-sun');
  const notes = manhattan
    ? [words('East end', 0, 0, SUMMER).moveTo([6.6, -2.55], [1, 0]), words(offEast(back), 0, 0, SUMMER).moveTo([6.6, -3.23], [1, 0]),
      words(`Sunrise misses that end by ${(back - sunrise).toFixed(1)}°`, 0, -3.9)]
    : [words('Sunrise and sunset both run along the street', 0, -3.7)];
  return tagged(new Group(grid, sun, street, new Dot({ radius: 0.12, color: INK }).moveTo(o), north, ...notes), 'henge-map');
}

/** Half Sun and full Sun side by side, each centred down the street, and the order each season brings them in. */
export function disc({ street }: { street: Street }, s: Stage): Group {
  const seasonNames = seasonsOf(street);
  return tagged(new Group(
    streetView(true, s.look.paper, -3.5, 0.5, 0.5), streetView(false, s.look.paper, 3.5, 0.5, 0.5),
    words('Half Sun', -3.5, 2.45), words('Full Sun', 3.5, 2.45),
    words('Centre on horizon', -3.5, -1.6), words('Bottom on horizon', 3.5, -1.6),
    words(`${seasonNames[0]}: half → full`, 0, -2.5, SUMMER),
    words(`${seasonNames[1]}: full → half`, 0, -3.2, SUMMER),
  ), 'henge-disc');
}
