import { Scene, Group, Circle, Dot, Line, Polygon, Rectangle, Arrow, VMobject, Follow, SetState, Succession, view, linear } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import { label } from '../../../explain/drawing.ts';
import type { Stage, StagedStep } from '../../../explain/index.ts';
import { depthOrder, seenPictures } from '../../../explain/drawing.ts';
import type { Seen, SeenPicture } from '../../../explain/drawing.ts';
import { stagedStep } from '../../../explain/index.ts';
import { henge, declination, sunset } from './model.ts';
import type { Street } from './model.ts';
import { dome, year, look, globes, crossedBy, INK, SUN, SUMMER, MUTED, ROAD } from './sky.ts';
import type { SkyState, YearState, LookState, GlobeState, DayAt } from './sky.ts';
type Sunset = ReturnType<typeof henge>['seasons'][number];
type Model = ReturnType<typeof henge>;
/** The two alignment seasons each street gets: May and July for Manhattan's, the equinoxes for due west. */
const SEASONS: Record<Street, readonly [string, string]> = { manhattan: ['May', 'July'], west: ['March', 'September'] };
const seasonsOf = (street: Street) => SEASONS[street];
/** Each street's name under its picture. */
const STREET_NAME: Record<Street, string> = { manhattan: '42nd Street: about 29° north of west', west: 'A street pointing due west' };

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
      { says: 'of the circle is in sunlight', test: 'test/explain-henge.test.ts: Henge globes' },
      { says: 'goes round a circle about the celestial pole', test: 'test/explain-henge.test.ts: Henge dome: each day’s path' },
      { says: 'crossed on the way out and on the way back', test: 'test/explain-henge.test.ts: Henge dome and year are drawn in depth order' },
      { says: 'the street’s circle, the horizon', test: 'test/explain-henge.test.ts: Henge street view from the centre' },
    ],
    checks: [
      { question: 'Another city’s streets point 10° north of west, between Manhattan’s 29° and due west. Are its two alignment seasons nearer the June solstice than Manhattan’s, or farther from it?',
        answer: 'Farther from it. The sunset direction sweeps north from December to June and back; it passes 10° north of west before it reaches 29° on the way north, and after it on the way back, so the two seasons sit nearer the equinoxes.' },
      { question: 'Suppose another street points farther north than the northernmost sunset in this model. How many low-Sun alignments does it get?',
        answer: 'None. The annual curve must cross the street’s direction. Moving the street beyond its northern turning point removes both crossings.' },
    ],
  };
  static settings = [{ id: 'street', label: 'Street direction', default: 'manhattan', options: [
    { value: 'manhattan', label: 'Manhattan: 29° north of west' }, { value: 'west', label: 'Due west' },
  ] }];
  override async construct() {
    const m = henge(settingsOf(this).street as Street), manhattan = m.street === 'manhattan';
    const seasonNames = seasonsOf(m.street);
    /** The year's sunset directions against the street; with `crossings`, the days the curve crosses it. */
    const annual = (st: { bearing: number; street: Street; annual: { longitude: number; azimuth: number }[]; crossings?: number[] }) => {
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
    };
    /** Overhead, north up: a schematic grid turned to the street's bearing, and the Sun's direction at sunset and sunrise
     *  on the first alignment day. East is +x, north is +y; an azimuth points along (sin az, cos az). */
    const overhead = ({ bearing, street: which, alignment }: { bearing: number; street: Street; alignment: Model['alignment'] }) => {
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
    };
    const disc = ({ street }: { street: Street }, s: Stage) => {
      const seasonNames = seasonsOf(street);
      return tagged(new Group(
      streetView(true, s.palette.paper, -3.5, 0.5, 0.5), streetView(false, s.palette.paper, 3.5, 0.5, 0.5),
      words('Half Sun', -3.5, 2.45), words('Full Sun', 3.5, 2.45),
      words('Centre on horizon', -3.5, -1.6), words('Bottom on horizon', 3.5, -1.6),
      words(`${seasonNames[0]}: half → full`, 0, -2.5, SUMMER),
      words(`${seasonNames[1]}: full → half`, 0, -3.2, SUMMER),
      ), 'henge-disc');
    };
    const west = (bearing: number) => `${Math.abs(bearing - 270).toFixed(1)}° ${bearing > 270 ? 'north' : 'south'} of west`;
    const [december, , june] = m.seasons as [Sunset, Sunset, Sunset];
    const gap = m.gapDays.toFixed(1);
    const day = ({ declination, hourAngle }: { declination: number; hourAngle: number }) => ({ declination, hourAngle });
    const percent = (d: Sunset) => `${Math.round((d.hourAngle / 180) * 100)}%`;
    const before: StagedStep[] = [
      stagedStep({ id: 'street', title: 'Why does the Sun line up on so few evenings?', line: 'Predict: will the low Sun line up again tomorrow?',
        caption: manhattan
          ? 'Look west down 42nd Street. On a few evenings a year, in late May and mid-July, the low Sun fits between the buildings; the Hayden Planetarium calls it Manhattanhenge. The buildings point the same way all year, so what changes must be where the Sun sets.'
          : 'This scenario turns the street to point due west and leaves the Sun and sky as they are. Buildings frame a narrow direction, and on some evenings the low Sun fits inside it. The buildings point the same way all year, so what changes must be where the Sun sets.',
        state: { bearing: m.bearing, street: m.street }, draw: (st, s) => tagged(new Group(streetView(false, s.palette.paper), words(STREET_NAME[st.street], 0, -3.7)), 'henge-street') }),
      stagedStep({ id: 'overhead',
        title: manhattan ? 'From above: sunset lines up with 42nd Street, sunrise does not' : 'From above: a due-west street lines up with sunrise and sunset',
        line: 'North is up; the grid is schematic. Gold arrows: the Sun at sunset and sunrise on an alignment day.',
        caption: manhattan
          ? `${ANSWER}. From above, Manhattan’s cross streets point ${(m.bearing - 270).toFixed(1)}° north of west, and the same angle south of east at the other end. On an alignment evening the setting Sun lies on that line and shines straight down 42nd Street. That morning it rose ${(90 - m.alignment.sunrise).toFixed(1)}° north of east, ${(m.alignment.back - m.alignment.sunrise).toFixed(1)}° from the street’s other end, which faces the sunrise only on winter mornings either side of the December solstice.`
          : `${ANSWER}. This street points due west, so its other end points due east. On an alignment evening, at an equinox in this model, the Sun sets due west down the street, and that morning it rose due east, up the street’s other end. Both ends line up on the same days.`,
        state: { alignment: m.alignment, backCrossings: m.backCrossings, bearing: m.bearing, street: m.street }, draw: overhead }),
      stagedStep<SkyState>({ id: 'sky', title: `June’s Sun sets ${west(june.azimuth)}, December’s ${west(december.azimuth).replace(' of west', '')}`,
        line: manhattan ? `Red: the street’s arc, rising from the horizon where the street points, ${west(m.bearing)}.` : 'Red: the street’s arc, rising from the horizon where the street points, due west.',
        caption: `New York’s sky as a dome, seen from outside, west of it. Each day the Sun’s centre goes round a circle about the celestial pole; the bold arc is its day, ending at a flat horizon. In June more of the circle lies above the horizon and it ends ${west(june.azimuth)}, ${manhattan ? `${(june.azimuth - m.bearing).toFixed(1)}° beyond the street` : 'north of the street'}. December’s shorter path ends ${west(december.azimuth)}${manhattan ? ', far short of it' : ', and the equinox path ends on the street'}. The circle shifts because Earth’s axis is tilted: the north leans toward the Sun in June, away in December.`,
        state: { bearing: m.bearing, days: m.seasons.map(({ declination, azimuth, hourAngle }) => ({ declination, hourAngle, azimuth })) }, draw: dome }),
    ];
    const crossings: StagedStep[] = [
      stagedStep({ id: 'crossings', title: manhattan ? 'Across the street in May, back across it in July' : 'A due-west street aligns near the equinoxes', line: 'Change the street setting: the sky stays the same.',
        caption: `The same year as a chart: across, March to the following March; up, how far north along the horizon the Sun sets. The line labelled Street stays at this street’s bearing. ${manhattan ? 'The sunset direction passes the street before June, turns a little farther north, then returns across it. This gives the May and July alignment seasons.' : 'The same curve crosses due west near March and September, instead of near May and July.'} Changing the street changes the direction we wait for, not Earth’s motion. The calendar spacing is an idealised circular orbit, not a viewing timetable.`,
        state: { bearing: m.bearing, crossings: m.half, street: m.street, annual: m.annual.map(({ longitude, azimuth }) => ({ longitude, azimuth })) }, draw: annual }),
    ];
    const details: StagedStep[] = [
      stagedStep<GlobeState>({ id: 'tilt', kind: 'detail', title: 'One axis direction, opposite sides of the Sun', line: 'Why the Sun’s daily circle shifts: Earth’s tilt, seen from beside its orbit.',
        caption: `Earth’s axis keeps nearly the same direction through the year. In June the north leans sunward; in December it leans away. The red dot is New York at noon, on the circle Earth’s daily turn carries it round: gold where that circle is in sunlight, dark where it is in night. In June ${percent(june)} of the circle is in sunlight, in December ${percent(december)}. Sizes and distances here are schematic.`,
        state: { latitude: m.latitude, tilt: m.tilt, june: day(june), december: day(december) }, draw: globes }),
    ];
    const after: StagedStep[] = [
      stagedStep({ id: 'disc', kind: 'detail', title: 'One bearing still leaves the Sun’s height to explain', line: `Half Sun and full Sun come ${gap} days apart in this model.`,
        caption: `Both views keep the Sun centred down the street. Half Sun puts its centre on the visible horizon; full Sun puts its bottom edge there. During the ${seasonNames[0]} sweep the aligned Sun rises from half to full: full Sun comes ${gap} days after half Sun, ${manhattan ? 'about one evening to the next' : 'within one evening, because near an equinox the Sun’s path shifts fastest from day to day'}. During the ${seasonNames[1]} return the order reverses. These are neighbouring dates, not stages of one evening’s descent.`,
        state: { half: m.half, full: m.full, radius: m.radius, gapDays: m.gapDays, street: m.street }, draw: disc }),
    ];

    // Held on every frame by rayner check, the year's turn and the camera's descent included:
    // nothing the dome hides is drawn in front of it, and from the sphere's centre the street's
    // circle and the horizon are drawn straight.
    this.addInvariant('nothing behind the dome is drawn in front', (scene) => {
      let held: true | undefined;
      for (const mob of scene.mobjects) {
        const r = depthOrder(mob);
        if (typeof r === 'string') return r;
        if (r) held = true;
      }
      return held;
    });
    this.addInvariant('from the centre, the street and the horizon are straight', straight);

    const s = stage(this, { style: 'github-light', headingSize: 0.6 });
    await s.steps(before);

    // The year as a turn of state: one Follow over the orbital longitude, from the December
    // solstice round to the next, redraws the day's circle from the model at every frame.
    const dayAt: DayAt = (longitude) => { const d = sunset(declination(longitude)); return { declination: d.declination, hourAngle: d.hourAngle, azimuth: d.azimuth }; };
    const start: YearState = { bearing: m.bearing, start: -90, longitude: -90, crossings: m.half };
    await this.step('sweep', {
      title: 'Follow the sunset through a year', line: 'Predict: how many times will the sunset cross the street?',
      caption: `Now let the year run, from the December solstice to the next. The Sun’s daily circle slides north, and its sunset, the gold band along the horizon, travels north with it. ${manhattan ? 'It passes the street, keeps going to its June turning point, then comes back south and passes the street again.' : 'It reaches the street at the March equinox, keeps going to its June turning point, then comes back south and reaches the street again at the September equinox.'} One fixed direction, crossed on the way out and on the way back. Each day’s circle comes from the Sun’s declination in an idealised circular orbit.`,
    });
    await s.clear({ runTime: 0.18 });
    this.state = { ...start } as typeof this.state;
    const sweep = view(this, (st) => year(st as unknown as YearState, dayAt), { place: false });
    s.opening(sweep);
    await s.enter(sweep, { runTime: 0.24, describe: () => yearWords(this.state as unknown as YearState, dayAt) });
    await this.play(new Succession([
      new Follow({ from: start.longitude, to: 270, draw: (longitude) => year({ ...start, longitude }, dayAt) }, { targets: [sweep.current], runTime: 9, rateFunc: linear }),
      new SetState(this, (st) => ({ ...st, longitude: 270 })),
    ]));

    await s.steps(crossings);
    await s.steps(details);

    // One camera move from sky to street: the eye at the sphere's centre, in the middle of the
    // street, looks up and lowers its gaze along the street's circle to the horizon, while the
    // lens narrows. A Follow over the viewpoint's pitch; every frame is the picture of its value.
    const alignment = dayAt(m.half[0]!);
    const UP = { pitch: 78, scale: 2.4 }, DOWN = { pitch: 3, scale: 6.5 };
    const eye = (t: number): LookState => ({ bearing: m.bearing, pitch: UP.pitch + (DOWN.pitch - UP.pitch) * t, scale: UP.scale * (DOWN.scale / UP.scale) ** t, day: day(alignment) });
    const names = { day: seasonNames[0] };
    await this.step('look', {
      kind: 'detail',
      title: 'From the sky to the street: bearing and height in one view', line: 'Stand at the dome’s centre and lower your eyes along the street.',
      caption: `The calendar names four evenings: half Sun and full Sun in each season. Stand in the middle of the street, at the dome’s centre, and lower your eyes along the street’s circle, labelled Street, to the horizon. From the centre, the street’s circle, the horizon and the buildings’ edges stay straight, as a camera sees them. Left and right say whether the Sun is centred between the buildings; up and down say how much of its disc is above the horizon.`,
    });
    await s.clear({ runTime: 0.18 });
    this.state = { ...eye(0) } as typeof this.state;
    const street = view(this, (st) => look(st as unknown as LookState, s.palette.paper, names), { place: false });
    // The phone opens on the camera's window and its legend; the sky's lines run on past the window, under the paper.
    s.opening(...street.current.family().filter((part) => ['henge-look-window', 'henge-look-legend', 'henge-look-sides', 'henge-look-sun'].includes(part.key ?? '')));
    await s.enter(street, { runTime: 0.24, describe: () => lookWords(this.state as unknown as LookState, names) });
    await this.play(new Succession([
      new Follow({ from: 0, to: 1, draw: (t) => look(eye(t), s.palette.paper, names) }, { targets: [street.current], runTime: 5 }),
      new SetState(this, (st) => ({ ...st, ...eye(1) })),
    ]));

    await s.steps(after);
  }
}

/** The year's turn in words, from the state the step holds. */
function yearWords(st: YearState, dayAt: DayAt): string {
  const d = dayAt(st.longitude), off = d.azimuth - 270;
  const crossed = crossedBy(st);
  return `The dome with one day’s path. Its Sun sets ${Math.abs(off) < 0.05 ? 'due west' : `${Math.abs(off).toFixed(1)}° ${off > 0 ? 'north' : 'south'} of west`}. Since the December solstice the sunset has crossed the street ${crossed === 1 ? 'once' : crossed === 2 ? 'twice' : 'no times'}.`;
}
/** The camera's view in words. */
function lookWords(st: LookState, names: { day: string }): string {
  return `Looking along the street from its middle, ${st.pitch.toFixed(0)}° above the horizon: the street’s circle runs straight up the middle, and the Sun’s path on a ${names.day} evening comes down to the horizon where the street points, with the Sun’s centre on the horizon.`;
}
/**
 * From the sphere's centre a great circle lies in a plane through the eye, so the street's
 * vertical circle and the horizon must be drawn as straight lines, frame by frame.
 */
function straight(scene: Scene): true | string | undefined {
  let checked: true | undefined;
  for (const g of scene.mobjects.flatMap((mob) => seenPictures(mob))) {
    const meta = (g as Group & { seenPicture: SeenPicture }).seenPicture;
    if (meta.viewpoint.kind !== 'gnomonic') continue;
    for (const piece of g.children) {
      if (!['henge-look:street', 'henge-look:horizon'].includes(piece.key ?? '') || !(piece instanceof VMobject)) continue;
      if ((piece as VMobject & { seen: Seen }).seen.lines.flat().length < 3) continue;
      const drawn = piece.subpaths.flatMap((a) => Array.from({ length: (a.length - 2) / 6 + 1 }, (_, i) => [a[i * 6]!, a[i * 6 + 1]!] as Vec));
      const a = drawn[0]!, b = drawn.at(-1)!, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-6) continue;
      for (const q of drawn) {
        const off = Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / length;
        if (off > 1e-3) return `${piece.key} is seen from the sphere's centre (pitch ${meta.viewpoint.pitch.toFixed(1)}°) but drawn ${off.toFixed(3)} off a straight line`;
      }
      checked = true;
    }
  }
  return checked;
}

