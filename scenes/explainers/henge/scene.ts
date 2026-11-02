import { Scene, Group, Text, Circle, Dot, Line, Polygon, Rectangle, Arrow, VMobject } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import { lesson, label } from '../lib/lesson-drawing.ts';
import type { LessonFrame } from '../lib/lesson-drawing.ts';
import { henge, TILT, LATITUDE } from '../lib/henge.ts';
import type { Street } from '../lib/henge.ts';

const INK = '#1e293b', SUN = '#c77900', SUMMER = '#a03b22', WINTER = '#235d9b', MUTED = '#64748b', PAPER = '#f8fafc';
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

/** Street perspective: a visible horizon clips the disc; the two walls keep its bearing fixed. */
function streetView(half: boolean, cx = 0, scale = 1) {
  const at = (x: number, y: number): Vec => [cx + x * scale, y * scale];
  const horizon = -0.55, radius = 0.8, centre = horizon + (half ? 0 : radius);
  return new Group(
    new Circle({ radius: radius * scale, fill: SUN, stroke: SUN }).moveTo(at(0, centre)),
    new Rectangle({ width: 13 * scale, height: 2.9 * scale, fill: PAPER, stroke: 'none' }).moveTo(at(0, horizon - 1.45)),
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
      const x = (az: number) => -6 + (az - 180) / 135 * 12;
      const y = (alt: number) => -1.75 + alt / 90 * 4.5;
      const g = new Group(line([-6.2, -1.75], [6.2, -1.75], INK),
        words('New York’s horizon', 0, -3.1), words('south', -5.6, -2.4), words('west', x(270), -2.4), words('northward', 5.1, -2.4));
      m.seasons.forEach((season, i) => {
        const color = [WINTER, MUTED, SUMMER][i]!;
        g.add(path(season.path.map((p) => [x(p.azimuth), y(p.altitude)]), color),
          new Dot({ radius: 0.1, color }).moveTo([x(season.azimuth), -1.75]),
          words(['December', 'Equinox', 'June'][i]!, -4.3 + i * 4.3, 2.8, color));
      });
      return tagged(g, 'henge-arcs');
    };
    const annual = (reveal: boolean) => {
      const x = (longitude: number) => -6 + longitude / 360 * 12;
      const y = (bearing: number) => (bearing - 270) / 35 * 2.1;
      const streetY = y(m.bearing);
      const g = new Group(line([-6, 0], [6, 0], MUTED),
        path(m.annual.map((p) => [x(p.longitude), y(p.azimuth)]), SUN),
        line([-6, streetY], [6, streetY], SUMMER, 0.045),
        words(manhattan ? 'Street: 29° N of west' : 'Street: due west', 3.4, streetY + 0.65, SUMMER),
        words('Yellow: sunset direction', -2.5, -3.3, SUN));
      ['Mar', 'Jun', 'Sep', 'Dec', 'Mar'].forEach((label, i) => g.add(words(label, -6 + i * 3, -2.65)));
      if (reveal) m.half.forEach((longitude, i) => g.add(
        new Dot({ radius: 0.13, color: SUMMER }).moveTo([x(longitude), streetY]),
        words(seasonNames[i]!, x(longitude), streetY - 0.65, SUMMER),
      ));
      return tagged(g, 'henge-annual');
    };
    const disc = () => tagged(new Group(
      streetView(true, -3.5, 0.5), streetView(false, 3.5, 0.5),
      words('Half Sun', -3.5, 2.6), words('Full Sun', 3.5, 2.6),
      words('Centre on horizon', -3.5, -2.6), words('Bottom on horizon', 3.5, -2.6),
      words(`${seasonNames[0]}: half → full`, 0, -3.25, SUMMER),
      words(`${seasonNames[1]}: full → half`, 0, -4.0, SUMMER),
    ), 'henge-disc');
    const frames: LessonFrame[] = [
      { id: 'street', title: 'The street stays still. Why does this evening matter?', line: 'Predict: will the low Sun line up again tomorrow?',
        caption: 'Look west down a straight street. Buildings frame a narrow direction, and the low Sun fits inside it. The buildings do not move tomorrow. To explain the alignment, we need to follow the Sun’s changing path.',
        state: { bearing: m.bearing }, draw: () => tagged(new Group(streetView(false), words(manhattan ? '42nd Street: about 29° north of west' : 'A street pointing due west', 0, -3.7)), 'henge-street') },
      { id: 'tilt', title: 'One axis direction, opposite sides of the Sun', line: 'Earth turns each day and travels around the Sun each year.',
        caption: 'Earth’s axis keeps nearly the same direction through the year. In June the north leans sunward; in December it leans away. The red observer and the small horizon line turn with Earth. We now look from that observer’s position to see where the daily Sun path meets the horizon. Sizes and distances here are schematic.',
        state: { latitude: m.latitude, tilt: m.tilt }, draw: orbit },
      { id: 'paths', title: 'The daily paths meet the horizon in different places', line: 'Predict: is June’s sunset north or south of due west?',
        caption: `${ANSWER}. These are afternoon paths seen from New York, ending where the Sun’s centre reaches a flat horizon. In June more of the daily path lies above that horizon, and sunset is north of west. December’s shorter path ends south of west. Daily turning carries the Sun along a path; the changing tilt toward the Sun shifts which path we see.`,
        state: { sunsets: m.seasons.map(({ declination, azimuth, hourAngle }) => ({ declination, azimuth, hourAngle })) }, draw: arcs },
      { id: 'sweep', title: 'Follow the sunset direction through a year', line: 'Predict: how often does the yellow curve cross the red street?',
        caption: `The yellow curve marks sunset direction, from March through the following March. Higher means farther north along the horizon. The red line stays at this street’s bearing. ${manhattan ? 'It lies near the northern turning point in June.' : 'It lies at due west, between the northern and southern extremes.'} The calendar spacing is an idealised circular orbit, not a viewing timetable.`,
        state: { bearing: m.bearing, annual: m.annual.map(({ longitude, azimuth }) => ({ longitude, azimuth })) }, draw: () => annual(false) },
      { id: 'crossings', title: manhattan ? 'Across the street in May, back across it in July' : 'A due-west street aligns near the equinoxes', line: 'Change the street setting: the sky stays the same.',
        caption: `${manhattan ? 'The sunset direction passes the street before June, turns a little farther north, then returns across it. This gives the May and July alignment seasons.' : 'The same curve crosses due west near March and September, instead of near May and July.'} Changing the street changes the direction we wait for, not Earth’s motion.`,
        state: { bearing: m.bearing, crossings: m.half }, draw: () => annual(true) },
      { id: 'disc', title: 'One bearing still leaves the Sun’s height to explain', line: 'Half Sun and full Sun compare neighbouring evenings.',
        caption: `The two views keep the Sun centred down the same street. Half Sun puts its centre on the visible horizon; full Sun puts its bottom edge there. During the ${seasonNames[0]} northward sweep the aligned Sun rises from half to full on neighbouring evenings; during the ${seasonNames[1]} return it reverses. These are changes across dates, not stages of one evening’s descent. The disc is enlarged here.`,
        state: { half: m.half, full: m.full, radius: m.radius }, draw: disc },
    ];
    await lesson(this, frames);
  }
}
