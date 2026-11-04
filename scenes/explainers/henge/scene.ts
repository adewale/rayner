import { Scene, Group, Text, Circle, Dot, Line, Polygon, Rectangle, Arrow, VMobject } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import { label } from '../lib/lesson-drawing.ts';
import type { Stage, StagedStep } from '../../../explain/index.ts';
import { henge, TILT, LATITUDE } from '../lib/henge.ts';
import type { Street } from '../lib/henge.ts';
type Sunset = ReturnType<typeof henge>['seasons'][number];

const INK = '#1e293b', SUN = '#c77900', SUMMER = '#a03b22', WINTER = '#235d9b', MUTED = '#64748b', ROAD = '#eef2f6';
const ANSWER = 'The street stays fixed while Earth’s tilt moves the sunset direction across it and back';
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

export default class Henge extends Scene {
  static meta = {
    id: 'henge',
    title: 'Why does sunset line up with Manhattan’s streets?',
    sources: [
      'https://www.amnh.org/research/hayden-planetarium/manhattanhenge',
      'https://aa.usno.navy.mil/faq/alt_az',
      'https://github.com/liberfa/erfa/blob/v2.0.1/src/hd2ae.c',
      'https://www.nesdis.noaa.gov/about/k-12-education/understanding-our-planet/why-does-earth-have-seasons',
      'https://science.nasa.gov/image-article/apod-2014-july-6-manhattanhenge-a-new-york-city-sunset/',
    ],
    answer: ANSWER,
    claims: [
      { says: 'faces the sunrise only on winter mornings', test: 'test/explain-henge.test.ts: Henge overhead view' },
    ],
    checks: [
      { question: 'The Sun is centred down the street, but its centre is above the horizon. Is that enough to identify a half-Sun event?',
        answer: 'No. The horizontal alignment fixes its bearing, not its height. Half Sun puts the centre on the visible horizon; full Sun puts the bottom edge there.' },
      { question: 'Suppose another street points farther north than the northernmost sunset in this model. How many low-Sun alignments does it get?',
        answer: 'None. The annual curve must cross the street’s direction. Moving the street beyond its northern turning point removes both crossings.' },
    ],
  };
  static settings = [{ id: 'street', label: 'Street direction', default: 'manhattan', options: [
    { value: 'manhattan', label: 'Manhattan: 29° north of west' }, { value: 'west', label: 'Due west' },
  ] }];
  override async construct() {
    const m = henge(settingsOf(this).street as Street), manhattan = m.street === 'manhattan';
    const seasonNames = manhattan ? ['May', 'July'] : ['March', 'September'];
    const orbit = () => {
      const g = new Group(new Circle({ radius: 0.6, fill: SUN, stroke: SUN }), words('Sun', 0, -1.2, SUN));
      const axis: Vec = [Math.sin(TILT * rad), Math.cos(TILT * rad)];
      [-4, 4].forEach((x, i) => {
        const side = i === 0 ? 1 : -1;
        const eq: Vec = [side * Math.cos(TILT * rad), -side * Math.sin(TILT * rad)];
        const observer: Vec = [x + Math.cos(LATITUDE * rad) * eq[0] + Math.sin(LATITUDE * rad) * axis[0],
          Math.cos(LATITUDE * rad) * eq[1] + Math.sin(LATITUDE * rad) * axis[1]];
        const radius: Vec = [observer[0] - x, observer[1]];
        g.add(new Circle({ radius: 1, fill: '#e0edf7', stroke: WINTER }).moveTo([x, 0]),
          line([x - axis[0] * 1.5, -axis[1] * 1.5], [x + axis[0] * 1.5, axis[1] * 1.5], INK, 0.06),
          words('N', x + axis[0] * 1.9, axis[1] * 1.9), words(i === 0 ? 'June' : 'December', x, 2.75),
          new Dot({ radius: 0.1, color: SUMMER }).moveTo(observer),
          line([observer[0] - radius[1] * 0.65, observer[1] + radius[0] * 0.65],
            [observer[0] + radius[1] * 0.65, observer[1] - radius[0] * 0.65], SUMMER, 0.045),
          new Arrow([side * 1.1, 0], [x - side * 1.5, 0], { stroke: SUN, strokeWidth: 0.045 }),
          words(i === 0 ? 'North sunward' : 'North away', x, -2.3),
        );
      });
      g.add(words('New York: red dot and horizon.', 0, -3.2, SUMMER));
      return tagged(g, 'henge-orbit');
    };
    const arcs = () => {
      const ground = -2.0;
      const x = (az: number) => -6.4 + (az - 180) / 135 * 12.8;
      const y = (alt: number) => ground + alt / 90 * 5;
      const g = new Group(line([-6.6, ground], [6.6, ground], INK),
        words('New York’s horizon', 0, ground - 1.45), words('south', -5.9, ground - 0.6), words('west', x(270), ground - 0.6), words('northward', 5.4, ground - 0.6));
      // The street's bearing, in the street's red: the line the sunset has to cross.
      g.add(tagged(new Group(line([x(m.bearing), ground], [x(m.bearing), 2.0], SUMMER, 0.05), words('Street', x(m.bearing), 2.45, SUMMER)), 'henge-paths-street'));
      m.seasons.forEach((season, i) => {
        const color = [WINTER, MUTED, SUN][i]!;
        const noon = season.path[0]!;
        g.add(path(season.path.map((p) => [x(p.azimuth), y(p.altitude)]), color),
          new Dot({ radius: 0.1, color }).moveTo([x(season.azimuth), ground]),
          label(['December', 'Equinox', 'June'][i]!, -6.4, y(noon.altitude) + 0.42, color, 0.58).moveTo([-6.4, y(noon.altitude) + 0.42], [-1, 0]));
      });
      return tagged(g, 'henge-arcs');
    };
    const annual = (reveal: boolean) => {
      const x = (longitude: number) => -6 + longitude / 360 * 12;
      const y = (bearing: number) => (bearing - 270) / 35 * 2.35;
      const streetY = y(m.bearing);
      const g = new Group(line([-6, 0], [6, 0], MUTED),
        path(m.annual.map((p) => [x(p.longitude), y(p.azimuth)]), SUN),
        line([-6, streetY], [6, streetY], SUMMER, 0.045),
        words(manhattan ? 'Street: 29° N of west' : 'Street: due west', 3.5, streetY + 0.6, SUMMER),
        words('Yellow: sunset direction', 0, -3.5, SUN));
      if (manhattan) g.add(words('due west', -4.9, -0.45, MUTED));
      ['Mar', 'Jun', 'Sep', 'Dec', 'Mar'].forEach((label, i) => g.add(words(label, -6 + i * 3, -2.8)));
      // Each name sits on the side of its dot that the curve leaves empty: the first crossing rises
      // through the street, the second falls. Manhattan's names go above, due west's below.
      const above = manhattan;
      if (reveal) m.half.forEach((longitude, i) => {
        const side = (i === 0) === above ? -1 : 1, at: Vec = [x(longitude) + side * 0.12, streetY + (above ? 0.6 : -0.55)];
        g.add(new Dot({ radius: 0.13, color: SUMMER }).moveTo([x(longitude), streetY]),
          words(seasonNames[i]!, 0, 0, SUMMER).moveTo(at, [-side, 0]));
      });
      return tagged(g, 'henge-annual');
    };
    /** Overhead, north up: a schematic grid turned to the street's bearing, and the Sun's direction at sunset and sunrise
     *  on the first alignment day. East is +x, north is +y; an azimuth points along (sin az, cos az). */
    const overhead = () => {
      const dir = (az: number): Vec => [Math.sin(az * rad), Math.cos(az * rad)];
      const o: Vec = [0, -0.5];
      const at = (p: Vec, along: Vec, t: number): Vec => [p[0] + along[0] * t, p[1] + along[1] * t];
      const u = dir(m.bearing), v: Vec = [u[1], -u[0]];
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
      const { sunset, sunrise, back } = m.alignment;
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
    };
    const disc = (_: unknown, s: Stage) => tagged(new Group(
      streetView(true, s.palette.paper, -3.5, 0.5, 0.5), streetView(false, s.palette.paper, 3.5, 0.5, 0.5),
      words('Half Sun', -3.5, 2.45), words('Full Sun', 3.5, 2.45),
      words('Centre on horizon', -3.5, -1.6), words('Bottom on horizon', 3.5, -1.6),
      words(`${seasonNames[0]}: half → full`, 0, -2.5, SUMMER),
      words(`${seasonNames[1]}: full → half`, 0, -3.2, SUMMER),
    ), 'henge-disc');
    const west = (bearing: number) => `${Math.abs(bearing - 270).toFixed(1)}° ${bearing > 270 ? 'north' : 'south'} of west`;
    const [december, , june] = m.seasons as [Sunset, Sunset, Sunset];
    const gap = m.gapDays.toFixed(1);
    const frames: StagedStep[] = [
      { id: 'street', title: 'Why does the Sun line up on so few evenings?', line: 'Predict: will the low Sun line up again tomorrow?',
        caption: manhattan
          ? 'Look west down 42nd Street. On a few evenings a year, in late May and mid-July, the low Sun fits between the buildings; the Hayden Planetarium calls it Manhattanhenge. The buildings point the same way all year, so what changes must be where the Sun sets.'
          : 'This case turns the street to point due west and leaves the Sun and sky as they are. Buildings frame a narrow direction, and on some evenings the low Sun fits inside it. The buildings point the same way all year, so what changes must be where the Sun sets.',
        state: { bearing: m.bearing }, draw: (_, s) => tagged(new Group(streetView(false, s.palette.paper), words(manhattan ? '42nd Street: about 29° north of west' : 'A street pointing due west', 0, -3.7)), 'henge-street') },
      { id: 'overhead',
        title: manhattan ? 'From above: sunset lines up with 42nd Street, sunrise does not' : 'From above: a due-west street lines up with sunrise and sunset',
        line: 'North is up. Gold arrows: the Sun at sunset and sunrise on an alignment day.',
        caption: manhattan
          ? `From above, Manhattan’s grid is turned: its cross streets point ${(m.bearing - 270).toFixed(1)}° north of west at one end and the same angle south of east at the other. On an alignment evening the setting Sun lies on that line, so it shines straight down 42nd Street. The same morning the Sun rose ${(90 - m.alignment.sunrise).toFixed(1)}° north of east, ${(m.alignment.back - m.alignment.sunrise).toFixed(1)}° away from the street’s other end. That end faces the sunrise only on winter mornings either side of the December solstice, when the Sun rises south of east. The grid is schematic: it shows the streets’ direction, not the real blocks.`
          : 'This street points due west, so its other end points due east. On an alignment evening, at an equinox in this model, the Sun sets due west down the street, and that morning it rose due east, up the street’s other end. Both ends line up on the same days. The grid is schematic: it shows the streets’ direction, not real blocks.',
        state: { alignment: m.alignment, backCrossings: m.backCrossings }, draw: overhead },
      { id: 'tilt', title: 'One axis direction, opposite sides of the Sun', line: 'Predict: in June, does New York’s Sun set north or south of due west?',
        caption: 'Earth’s axis keeps nearly the same direction through the year. In June the north leans sunward; in December it leans away. The red dot is New York and the short red line its horizon; both turn with Earth each day. Sizes and distances here are schematic.',
        state: { latitude: m.latitude, tilt: m.tilt }, draw: orbit },
      { id: 'paths', title: `June’s Sun sets ${west(june.azimuth)}, December’s ${west(december.azimuth).replace(' of west', '')}`,
        line: manhattan ? `The red line is the street, ${west(m.bearing)}.` : 'The red line is the street, at due west.',
        caption: `Each curve is one afternoon’s path of the Sun’s centre seen from New York, ending where it meets a flat horizon. In June more of the path lies above the horizon and it ends ${west(june.azimuth)}, ${manhattan ? `${(june.azimuth - m.bearing).toFixed(1)}° beyond the street` : 'north of the street'}. December’s shorter path ends ${west(december.azimuth)}${manhattan ? ', far short of it' : ', and the equinox path ends on the street'}. ${ANSWER}.`,
        state: { sunsets: m.seasons.map(({ declination, azimuth, hourAngle }) => ({ declination, azimuth, hourAngle })) }, draw: arcs },
      { id: 'sweep', title: 'Follow the sunset direction through a year', line: 'Predict: how often does the yellow curve cross the red street?',
        caption: `The yellow curve marks sunset direction, from March through the following March. Higher means farther north along the horizon. The red line stays at this street’s bearing. ${manhattan ? 'It lies near the northern turning point in June.' : 'It lies at due west, between the northern and southern extremes.'} The calendar spacing is an idealised circular orbit, not a viewing timetable.`,
        state: { bearing: m.bearing, annual: m.annual.map(({ longitude, azimuth }) => ({ longitude, azimuth })) }, draw: () => annual(false) },
      { id: 'crossings', title: manhattan ? 'Across the street in May, back across it in July' : 'A due-west street aligns near the equinoxes', line: 'Change the street setting: the sky stays the same.',
        caption: `${manhattan ? 'The sunset direction passes the street before June, turns a little farther north, then returns across it. This gives the May and July alignment seasons.' : 'The same curve crosses due west near March and September, instead of near May and July.'} Changing the street changes the direction we wait for, not Earth’s motion.`,
        state: { bearing: m.bearing, crossings: m.half }, draw: () => annual(true) },
      { id: 'disc', title: 'One bearing still leaves the Sun’s height to explain', line: `Half Sun and full Sun come ${gap} days apart in this model.`,
        caption: `The two views keep the Sun centred down the same street. Half Sun puts its centre on the visible horizon; full Sun puts its bottom edge there. During the ${seasonNames[0]} northward sweep the aligned Sun rises from half to full: in this model full Sun comes ${gap} days after half Sun, ${manhattan ? 'about one evening to the next' : 'closer than one evening to the next, because near an equinox the Sun’s path shifts fastest from day to day'}. During the ${seasonNames[1]} return the order reverses. These are changes across dates, not stages of one evening’s descent. The disc is enlarged here.`,
        state: { half: m.half, full: m.full, radius: m.radius, gapDays: m.gapDays }, draw: disc },
    ];
    await stage(this, { style: 'github-light', headingSize: 0.6 }).steps(frames);
  }
}
