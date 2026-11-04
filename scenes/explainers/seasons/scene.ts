import {
  Scene,
  Circle,
  Line,
  Text,
  Group,
  Polygon,
  Rectangle,
  Dot,
  Arc,
  Arrow,
  Axes,
  FadeIn,
  FadeOut,
  Create,
} from '../../../src/index.ts';
import type { Box, Mobject, Vec } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { emphasises } from '../../../explain/look.ts';
import { sunlight, daylightYear, noonShare, noonPatch, sunDistance, declinationOn, MID_MONTH } from '../lib/models.ts';

const PLACES: Record<string, { name: string; lat: number }> = {
  tromso: { name: 'Tromsø', lat: 69.65 },
  london: { name: 'London', lat: 51.5 },
  quito: { name: 'Quito', lat: 0 },
  sydney: { name: 'Sydney', lat: -33.87 },
};
const ORDER = ['tromso', 'london', 'quito', 'sydney'] as const;
const TILT = 23.44;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SUN = '#e0af68',
  EARTH = '#3d59a1',
  NIGHT = '#16161e',
  AXIS = '#9ece6a',
  PLACE = '#f7768e',
  DIMLINE = '#565f89';
const RAD = Math.PI / 180;
const hours = (h: number) => h.toFixed(1) + ' h';
const degrees = (d: number) => d.toFixed(1) + '°';
/** A latitude as a reader names it: 51.5° N, 33.9° S. */
const latitudeName = (lat: number) => `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'S' : 'N'}`;
/** A share of overhead sunlight as a whole percentage. */
const percent = (x: number) => Math.round(x * 100) + '%';
/** A latitude or angle to the hundredth it is given in, trailing zeros dropped: the noon formula's operands. */
const exactly = (d: number) => +d.toFixed(2) + '°';
/** Hours as the year's dimension prints them, rounded to a tenth. */
const tenths = (h: number) => Math.round(h * 10) / 10;
/** The 15ths with the year's ends wrapped on: the December before and the January after. */
const KNOTS = [MID_MONTH[11]! - 365, ...MID_MONTH, MID_MONTH[0]! + 365];
/**
 * The chart's x axis is the calendar: month m fills [m, m + 1], and x = m + 0.5
 * is its 15th, the day `daylightYear` samples, with days spread evenly between
 * one 15th and the next. So the plotted curve passes through its twelve values.
 */
const dayAt = (x: number) => {
  const k = Math.min(12, Math.max(0, Math.floor(x + 0.5))),
    a = KNOTS[k]!,
    b = KNOTS[k + 1]!;
  return a + (x + 0.5 - k) * (b - a);
};
/** The x at which the chart shows a day of the year: dayAt's inverse. */
const xOn = (day: number) => {
  const k = KNOTS.findIndex((d, i) => day >= d && day < KNOTS[i + 1]!);
  return k - 0.5 + (day - KNOTS[k]!) / (KNOTS[k + 1]! - KNOTS[k]!);
};
const daylightOn = (lat: number, day: number) => sunlight(lat, declinationOn(day)).daylight;
const daylightAt = (lat: number) => (x: number) => daylightOn(lat, dayAt(x));
/** The model on each day of one year. */
const daysOf = (lat: number) => Array.from({ length: 365 }, (_, d) => daylightOn(lat, d));
/** Solstices and equinoxes: the days on which the model's declination is 0 or ±23.44°. */
const EVENTS = [
  { day: 365 / 4 - 10, name: 'Mar equinox' },
  { day: 365 / 2 - 10, name: 'Jun solstice' },
  { day: (3 * 365) / 4 - 10, name: 'Sep equinox' },
  { day: 365 - 10, name: 'Dec solstice' },
] as const;

/**
 * Side view of Earth at noon for one season. The drawing plane holds the
 * rotation axis and the Sun direction, so a latitude circle projects to a
 * chord and the terminator is the line through the centre facing the Sun.
 * `side` is the Sun's direction from this Earth (+1 = Sun to the right).
 */
function sideView(center: Vec, radius: number, side: 1 | -1) {
  const e = TILT * RAD;
  // The axis keeps one direction in space: north leans toward −x.
  const a: Vec = [-Math.sin(e), Math.cos(e)];
  // The equator direction on the noon meridian, pointing toward the Sun.
  const eq: Vec = side < 0 ? [-Math.cos(e), -Math.sin(e)] : [Math.cos(e), Math.sin(e)];
  const at = (u: number, v: number): Vec => [
    center[0] + radius * (u * eq[0] + v * a[0]),
    center[1] + radius * (u * eq[1] + v * a[1]),
  ];
  /** The noon point at a latitude: cos φ along the equator, sin φ along the axis. */
  const noon = (lat: number) => at(Math.cos(lat * RAD), Math.sin(lat * RAD));
  /** A latitude circle's chord, split where it crosses the terminator. */
  const chord = (lat: number) => {
    const c = Math.cos(lat * RAD),
      sn = Math.sin(lat * RAD);
    // Sun-side component of a point: sn·(a·s) + t·(eq·s); eq·s = cos ε.
    const as = a[0] * side;
    const t0 = Math.max(-c, Math.min(c, (-sn * as) / Math.cos(e)));
    return {
      day: [at(t0, sn), at(c, sn)] as [Vec, Vec],
      night: [at(-c, sn), at(t0, sn)] as [Vec, Vec],
      far: at(-c - 0.16, sn),
    };
  };
  return { a, eq, at, noon, chord };
}

export default class SeasonsExplainer extends Scene {
  static meta = {
    id: 'seasons',
    title: 'Why does the north have summer when Earth is farthest from the Sun?',
    sources: [
      'https://spaceplace.nasa.gov/seasons/en/',
      'https://gml.noaa.gov/grad/solcalc/calcdetails.html',
      'https://en.wikipedia.org/wiki/Position_of_the_Sun#Declination_of_the_Sun_as_seen_from_Earth',
    ],
    // The script's answer and check questions (script.md); check holds the tilt step to stating the answer.
    answer: 'The tilt of Earth’s axis, not its distance from the Sun, makes the seasons',
    checks: [
      {
        question:
          'At the December solstice London’s noon Sun gives 26% of overhead sunlight at Earth’s average distance. Earth is then near its nearest point. Taking the distance into account, what share does London’s ground actually get?',
        answer:
          'About 27%. On the solstice Earth is about 0.984 of its average distance, so sunlight is about 3% stronger than average, and 26% × 1.03 is just under 27%: the distance adds one point to a share the tilt has cut from 88%.',
      },
      {
        question:
          'Suppose Earth’s axis kept its 23.44° tilt but swung round each year so that its north end always leaned toward the Sun. What would London get at the December solstice?',
        answer:
          'The same as in June: 16.4 h of daylight and 88% of overhead sunlight at noon. The real seasons swap because the axis keeps pointing the same way while Earth moves to the far side of the Sun; an axis that followed the Sun would keep London at its June values all year.',
      },
    ],
    // Sentences that reach past the two solstices on screen, and the tests that hold them.
    claims: [
      {
        says: 'Tromsø never enters the night half',
        test: 'test/explain-models.test.ts: sunlight follows the sunrise equation',
      },
      {
        says: 'the equator’s is always cut in half',
        test: 'test/explain-models.test.ts: on the equator the day–night line cuts the circle in half',
      },
      {
        says: 'the day–night line always cuts the circle in half',
        test: 'test/explain-models.test.ts: on the equator the day–night line cuts the circle in half',
      },
    ],
  };
  static settings = [
    {
      id: 'place',
      label: 'Observe from',
      default: 'london',
      options: [
        { value: 'tromso', label: 'Tromsø' },
        { value: 'london', label: 'London' },
        { value: 'quito', label: 'Quito' },
        { value: 'sydney', label: 'Sydney' },
      ],
    },
  ];
  override async construct() {
    const key = settingsOf(this).place!,
      place = PLACES[key]!,
      s = stage(this, { headingSize: 0.6, style: 'tokyo-night' });
    const ink = s.palette.ink,
      soft = s.soft;
    const label = (text: string, at: Vec, opts: { size?: number; color?: string; edge?: Vec } = {}) =>
      new Text(text, {
        fontSize: opts.size ?? 0.22,
        color: opts.color ?? soft,
      }).moveTo(at, opts.edge ?? [0, 0]);

    // ------------------------------------------------------------- nearest
    // The common guess, as a prediction: if nearness made summer, the north would be nearest in July.
    await this.step('nearest', {
      title: 'Earth’s distance from the Sun changes through the year',
      line: 'Predict: in which month is Earth nearest the Sun?',
      caption:
        'Earth’s orbit is slightly oval, so it passes nearest the Sun once a year and farthest half a year later. A common guess is that the seasons follow this distance, with summer when Earth is nearest. The oval is drawn far more stretched than it is.',
    });
    const guess = (() => {
      const oc: Vec = [0, -0.6],
        orx = 6.2,
        ory = 3.0,
        sunX = oc[0] - 1.9;
      const orbit = new Circle({ radius: 1, stroke: s.palette.muted, strokeWidth: 0.025 })
        .stretch(orx, 0)
        .stretch(ory, 1)
        .moveTo(oc);
      // Each Earth's words sit inside the orbit beside it, edge toward the Earth, clear of the line.
      const at = (x: number, word: string, edge: Vec) =>
        new Group(
          new Circle({ radius: 0.42, fill: '#7aa2f7', stroke: 'none' }).moveTo([x, oc[1]]),
          label(word, [x - edge[0] * 0.68, oc[1] + 0.25], { size: 0.42, color: ink, edge }),
          label('which month?', [x - edge[0] * 0.68, oc[1] - 0.3], { size: 0.36, color: SUN, edge }),
        );
      const near = at(oc[0] - orx, 'nearest', [-1, 0]),
        far = at(oc[0] + orx, 'farthest', [1, 0]);
      const sun = new Group(
        new Circle({ radius: 0.62, fill: SUN, stroke: 'none' }).moveTo([sunX, oc[1]]),
        label('Sun', [sunX, oc[1] + 1.0], { size: 0.36, color: ink }),
      );
      const g = new Group(orbit, sun, near, far);
      g.key = 'nearest-orbit';
      return g;
    })();
    await s.enter(guess, {
      describe: 'An exaggerated oval orbit with the Sun off centre: Earth nearest the Sun at one end and farthest at the other, each asking which month',
    });

    // ---------------------------------------------------------------- tilt
    await this.step('tilt', {
      title: 'Nearest the Sun in early January, while the north tilts away',
      line: `Predict: in June, does ${place.name} get more or less than 12 hours of daylight?`,
      caption:
        'Earth is nearest the Sun in early January, when the north has winter and the south summer. Distance cannot explain opposite seasons at once. The tilt of Earth’s axis, not its distance from the Sun, makes the seasons: the tilted axis keeps pointing the same way, so the north leans sunward in June and away in December. Sizes and distances are not to scale.',
    });
    await s.clear();
    // The orbit's Sun and Earths: the Sun is carried on into the next step, and June's Earth grows into its side view.
    const tilt = (() => {
      const c: Vec = [0, -0.55],
        rx = 6.0,
        ry = 2.4;
      const orbit = new Circle({
        radius: 1,
        stroke: s.palette.muted,
        strokeWidth: 0.02,
      })
        .stretch(rx, 0)
        .stretch(ry, 1)
        .moveTo(c);
      const sun = new Circle({ radius: 0.5, fill: SUN, stroke: 'none' }).moveTo(c);
      /**
       * The name goes under June's and December's Earths, moved sideways by `out` off the orbit line,
       * and beside September's and March's, above or below the line (`below`), clear of the axis.
       */
      const earth = (x: number, y: number, name: string, below: boolean, bright: boolean, out = 0) => {
        const e = TILT * RAD,
          r = 0.44,
          len = 0.74;
        const g = new Group(
          new Circle({
            radius: r,
            fill: bright ? '#7aa2f7' : EARTH,
            stroke: 'none',
          }).moveTo([x, y]),
          new Line([x + len * Math.sin(e), y - len * Math.cos(e)], [x - len * Math.sin(e), y + len * Math.cos(e)], {
            stroke: AXIS,
            strokeWidth: 0.04,
          }),
          label('N', [x - (len + 0.18) * Math.sin(e), y + (len + 0.18) * Math.cos(e)], {
            size: 0.26,
            color: AXIS,
          }),
          label(name, bright ? [x + out, y - 1.05] : [x + 0.62, below ? y - 0.5 : y + 0.5], {
            size: bright ? 0.34 : 0.3,
            color: bright ? ink : soft,
            edge: bright ? [0, 0] : [-1, 0],
          }),
        );
        return g;
      };
      const june = earth(c[0] + rx, c[1], 'June', true, true, 0.35),
        december = earth(c[0] - rx, c[1], 'December', true, true, -0.45),
        september = earth(c[0], c[1] + ry, 'September', false, false),
        march = earth(c[0], c[1] - ry, 'March', true, false);
      return { orbit, sun, june, december, september, march };
    })();
    await this.play(
      new Create(s.keep(tilt.orbit, tilt.sun, { describe: 'An orbit around the Sun, not to scale' })),
      new FadeIn(tilt.sun),
    );
    await s.enter(tilt.june, tilt.december, tilt.september, tilt.march, {
      describe:
        'Earth in June (right), September (top), December (left) and March (bottom), its axis tilted the same way each time',
    });
    const nearestNote = new Group(
      label('nearest the Sun:', [-6.0, 1.45], { size: 0.32, color: SUN }),
      label('early January', [-6.0, 1.0], { size: 0.32, color: SUN }),
    );
    nearestNote.key = 'nearest-note';
    await s.enter(nearestNote, { describe: 'Beside December’s Earth: nearest the Sun in early January' });

    // ---------------------------------------------------------------- june
    const R = 1.75,
      CY = 0.8,
      JUNE_C: Vec = [4.3, CY],
      DEC_C: Vec = [-4.3, CY];
    const june = sunlight(place.lat, TILT),
      december = sunlight(place.lat, -TILT);
    /** One season: Earth, night half, axis, the place's latitude circle and the noon ray. */
    const season = (month: string, center: Vec, side: 1 | -1, result: { altitude: number; daylight: number }) => {
      const v = sideView(center, R, side);
      const ball = new Circle({
        radius: R,
        fill: EARTH,
        stroke: 'none',
      }).moveTo(center);
      ball.key = `${month.toLowerCase()}-globe`;
      const half: Vec[] = [];
      for (let i = 0; i <= 40; i++) {
        const th = -Math.PI / 2 + (Math.PI * i) / 40;
        half.push([center[0] - side * R * Math.cos(th), center[1] + R * Math.sin(th)]);
      }
      const night = new Polygon(half, {
        fill: NIGHT,
        fillOpacity: 0.62,
        stroke: 'none',
      });
      // The axis reaches past the north pole to carry its N; past the south pole it stops short,
      // clear of the table the latitude step sets under the globe.
      const tip = 1.2 * R,
        foot = 1.08 * R;
      const axis = new Line(
        [center[0] - foot * v.a[0], center[1] - foot * v.a[1]],
        [center[0] + tip * v.a[0], center[1] + tip * v.a[1]],
        { stroke: AXIS, strokeWidth: 0.035 },
      );
      axis.key = `${month.toLowerCase()}-axis`;
      const north = label('N', [center[0] + (tip + 0.2) * v.a[0], center[1] + (tip + 0.2) * v.a[1]], {
        size: 0.28,
        color: AXIS,
      });
      north.key = `${month.toLowerCase()}-north`;
      const equator = new Line(v.at(-1, 0), v.at(1, 0), {
        stroke: s.palette.muted,
        strokeWidth: 0.02,
        dashArray: '0.08 0.06',
      });
      const ch = v.chord(place.lat);
      const dayLine = new Line(ch.day[0], ch.day[1], {
        stroke: SUN,
        strokeWidth: 0.07,
      });
      dayLine.key = `${month.toLowerCase()}-daylight-latitude`;
      const nightLine = new Line(ch.night[0], ch.night[1], {
        stroke: DIMLINE,
        strokeWidth: 0.05,
      });
      nightLine.key = `${month.toLowerCase()}-night-latitude`;
      const p = v.noon(place.lat);
      const zen: Vec = [(p[0] - center[0]) / R, (p[1] - center[1]) / R];
      const tangent: Vec = [-zen[1], zen[0]];
      const horizon = new Line(
        [p[0] - 0.55 * tangent[0], p[1] - 0.55 * tangent[1]],
        [p[0] + 0.55 * tangent[0], p[1] + 0.55 * tangent[1]],
        { stroke: ink, strokeWidth: 0.025 },
      );
      horizon.key = `${month.toLowerCase()}-horizon`;
      const dot = new Dot({ radius: 0.09, color: PLACE }).moveTo(p);
      dot.key = `${month.toLowerCase()}-place`;
      const latitude = new Group(nightLine, dayLine);
      latitude.key = `${month.toLowerCase()}-latitude`;
      const drawing = new Group(ball, night, equator, latitude, axis, north, horizon, dot);
      const ray = new Group();
      ray.key = `${month.toLowerCase()}-noon-ray`;
      if (result.altitude > 0) {
        // The noon ray arrives parallel to the Sun direction; its angle to the
        // local horizon is the model's altitude (90° − |latitude − declination|).
        const start: Vec = [side > 0 ? center[0] + R + 1.15 : center[0] - R - 1.15, p[1]];
        ray.add(
          new Arrow([side > 0 ? Math.max(start[0], p[0] + 0.9) : Math.min(start[0], p[0] - 0.9), p[1]], p, {
            stroke: SUN,
            strokeWidth: 0.035,
            tipLength: 0.2,
            tipWidth: 0.16,
          }),
        );
        // Arc between the sunward horizon direction and the ray direction.
        const hz = tangent[0] * side >= 0 ? tangent : ([-tangent[0], -tangent[1]] as Vec);
        const a0 = Math.atan2(hz[1], hz[0]),
          a1 = side > 0 ? 0 : Math.PI;
        let sweep = a1 - a0;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        while (sweep < -Math.PI) sweep += 2 * Math.PI;
        ray.add(
          new Arc({
            center: p,
            radius: 0.5,
            startAngle: a0,
            angle: sweep,
            stroke: SUN,
            strokeWidth: 0.025,
          }),
        );
        const mid = a0 + sweep / 2;
        ray.add(
          label(degrees(result.altitude), [p[0] + 1.0 * Math.cos(mid), p[1] + 1.0 * Math.sin(mid)], {
            size: 0.28,
            color: SUN,
          }),
        );
      } else {
        // The model puts the noon Sun below the horizon: a ray at the place's
        // height meets the day side of the globe first and never reaches it.
        const dy = p[1] - center[1],
          hit: Vec = [center[0] + side * Math.sqrt(Math.max(0, R * R - dy * dy)), p[1]];
        ray.add(
          new Arrow([center[0] + side * (R + 1.15), p[1]], hit, {
            stroke: SUN,
            strokeWidth: 0.035,
            tipLength: 0.2,
            tipWidth: 0.16,
          }),
        );
      }
      const drawn = `Earth in ${month} from the side, ${place.name}’s latitude circle yellow where lit`;
      const noon =
        result.altitude > 0
          ? `${month}’s noon Sun ray, ${degrees(result.altitude)} above ${place.name}’s horizon`
          : `${month}’s noon Sun ray, stopped by the globe: below ${place.name}’s horizon`;
      return {
        month,
        view: v,
        drawing,
        latitude,
        ray,
        dayLine,
        nightLine,
        daySpan: ch.day,
        drawn,
        noon,
        place: p,
        zenith: zen,
        tangent,
      };
    };
    // The orbit's Sun, carried here; the side views draw it at the same size.
    const sun = tilt.sun;
    /**
     * A season's daylight said on its drawing: a callout from the middle of the lit part of the
     * place's circle to just under the globe. The angle already labels a noon Sun above the
     * horizon; one below it, which has no angle, is said here too.
     */
    const daylightCallout = async (S: ReturnType<typeof season>, r: { altitude: number; daylight: number }) => {
      const [a, b] = S.daySpan;
      const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const callout = await s.callout(mid, `${hours(r.daylight)} of daylight`, {
        side: 'below', gap: mid[1] - (CY - R - 0.3), color: SUN, size: 0.28,
      });
      callout.key = `${S.month.toLowerCase()}-daylight-callout`;
      if (r.altitude <= 0) {
        const value = callout.children.at(-1)!;
        const below = label(`Noon Sun ${degrees(r.altitude)}, below the horizon`, [value.center()[0], value.center()[1] - 0.44], {
          size: 0.28, color: SUN,
        });
        callout.add(below);
        await this.play(new FadeIn(below, { runTime: 0.2 }));
      }
      return callout;
    };

    await this.step('june', {
      title: `${place.name} in June: ${hours(june.daylight)} of daylight, noon Sun at ${degrees(june.altitude)}`,
      line: `The yellow part of the line through the red dot is ${place.name}’s daylight.`,
      caption:
        (place.lat < 0
          ? `In June the north end of the axis leans toward the Sun. Sydney is south of the equator, so its noon Sun is low and most of its latitude circle, the line through the dot, is on the night side: ${hours(june.daylight)} of daylight in its winter.`
          : place.lat > 60
            ? 'In June the north end leans toward the Sun far enough that Tromsø’s whole latitude circle sits on the day side. As Earth turns, Tromsø never enters the night half, so the Sun stays up for all 24 hours.'
            : place.lat === 0
              ? 'In June the north end leans toward the Sun, but the day–night line still cuts the equator exactly in half. Quito’s circle is half day and half night, so it gets 12 hours of daylight.'
              : `In June the north end leans toward the Sun, so most of London’s latitude circle, the line through the dot, is on the day side: as Earth turns, London spends ${hours(june.daylight)} in daylight, and its noon Sun stands high.`) + ` At noon in June the Sun is overhead at ${exactly(TILT)} N; that latitude is the Sun’s declination, and through the year it moves between ${exactly(TILT)} N and ${exactly(TILT)} S.`,
    });
    // The orbit goes, but its Sun stays: carried to the middle, with June's Earth grown into a side view.
    await this.play(
      ...[tilt.orbit, tilt.december, tilt.september, tilt.march, nearestNote].map((m) => new FadeOut(m, { runTime: 0.4 })),
    );
    // Described apart, so the close-up, which fades the Sun, is not said to show it.
    s.keep(sun, { describe: 'The Sun, not to scale' });
    await s.carry(sun, [0, CY]);
    const J = season('June', JUNE_C, -1, june);
    s.keep(J.drawing, { describe: J.drawn });
    const small = tilt.june.children[0]!.center();
    await this.play(
      new FadeOut(tilt.june, { shift: [JUNE_C[0] - small[0], JUNE_C[1] - small[1]], scale: 2, runTime: 0.8 }),
      new FadeIn(J.drawing, { scale: 0.25, runTime: 0.8 }),
    );
    await s.enter(J.ray, { describe: J.noon });
    const juneSaid = await daylightCallout(J, june);
    // Only the Sun and June's Earth are on stage: the camera comes in on them, so they fill the frame.
    await s.focus([-0.8, CY - R - 0.8, JUNE_C[0] + R + 0.35, CY + R + 0.5], { runTime: 0.8 });
    this.state = { place: place.name, latitude: place.lat, june };

    // ---------------------------------------------------------------- noon
    // The camera comes in on June's Earth, up to 1.8 times as close, so the horizon, the noon ray and
    // the angle between them fill the stage with the whole globe still in view.
    // How strongly that noon sunlight lands: sin of the altitude, from the model.
    const juneShare = noonShare(place.lat, TILT),
      decShare = noonShare(place.lat, -TILT);
    // The noon altitude as the reader can check it: operands as given, to the hundredth, and
    // their result, exact to the hundredth too, which the heading rounds to a tenth.
    const formula = `90° − |${exactly(place.lat)} − ${exactly(TILT)}| = ${exactly(june.altitude)}`;
    await this.step('noon', {
      title: `June noon: the Sun stands ${degrees(june.altitude)} up, giving ${percent(juneShare)} of overhead sunlight per m²`,
      line: 'The yellow band shows how one beam spreads across the ground.',
      caption: `The white line is ${place.name}’s horizon. A lower Sun spreads the same beam over more ground, sharing its light across a larger patch. A higher Sun concentrates that light. Here each square metre receives ${percent(juneShare)} of what it would under an overhead Sun, before the air takes its share. The noon Sun’s height is 90° minus the distance from ${place.name}’s latitude to the declination: ${formula}.`,
    });
    const notes = new Group();
    notes.key = 'noon-notes';
    {
      const p = J.place,
        start = Math.min(1.45, p[0] - 0.9);
      // Labels that read at 14 px even judged without the zoom, which nearly doubles them.
      const small = 0.2,
        pitch = small * 1.3 * 1.55;
      // The June Sun is to the left (side −1): the horizon's sunward direction points left.
      const t = J.tangent,
        z = J.zenith,
        sunward: Vec = t[0] <= 0 ? t : [-t[0], -t[1]];
      // A beam BEAM wide, at right angles to the rays, lands on BEAM / sin(altitude) of the horizon:
      // from the red dot, along the horizon away from the Sun.
      const BEAM = 0.3,
        spread = BEAM / juneShare,
        q: Vec = [p[0] - spread * sunward[0], p[1] - spread * sunward[1]];
      // The camera comes in on the red dot with the whole globe in view: from just under the globe,
      // or under the beam's label when the place sits low, to just over the north label. The
      // heading and its line stay on screen over a band 1.25 units deep (the stage above
      // y = 3.25), which covers 1.25 / ZOOM of the view, so the view shows 7.75 / ZOOM below it.
      // The ray comes in from the left: the view keeps its start, with room beside the globe for the
      // formula, and ends just past the globe on the right.
      const labelBelow = sunward[1] >= 0,
        bottom = Math.min(CY - R - 0.25, Math.min(p[1], q[1]) - (labelBelow ? 0.5 + small : 0.25)),
        top = J.drawing.box()![3] + 0.12,
        ZOOM = Math.min(1.8, 7.75 / (top - bottom)),
        w = 16 / ZOOM,
        h = 9 / ZOOM,
        cx = JUNE_C[0] + R + 0.4 - w / 2,
        cy = bottom + h / 2;
      const view: Box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
      // The notes go in the view's bottom left corner, or its top left one, under the band,
      // when the place sits low on the globe and its beam would cross them.
      /** Line `n` of four, counted from the top, at the chosen corner. */
      const low = p[1] < CY + 0.3,
        corner = (n: number): { at: Vec; edge: Vec } =>
          low
            ? { at: [view[0] + 0.3, view[3] - 1.25 / ZOOM - 0.25 - n * pitch], edge: [-1, 1] }
            : { at: [view[0] + 0.3, view[1] + 0.3 + (3 - n) * pitch], edge: [-1, -1] };
      const beam = new Polygon(
        [
          [start, p[1]],
          p,
          q,
          [start, q[1]],
        ],
        { fill: SUN, fillOpacity: 0.4, stroke: 'none' },
      );
      beam.key = 'noon-beam';
      const patch = new Line(p, q, { stroke: SUN, strokeWidth: 0.06 });
      patch.key = 'noon-patch';
      const share = new Group(
        ...['Per m² of ground:', `sin ${degrees(june.altitude)} = ${juneShare.toFixed(2)}`, 'of overhead sunlight'].map((line, i) =>
          label(line, corner(i).at, { size: small * 1.3, color: i === 1 ? SUN : ink, edge: corner(i).edge }),
        ),
      );
      share.key = 'noon-share';
      notes.add(
        beam,
        new Line([start, q[1]], q, { stroke: SUN, strokeWidth: 0.025 }),
        patch,
        share,
        // Under the horizon line's sunward half, on the ground side.
        label('horizon', [p[0] + 0.72 * sunward[0] - 0.22 * z[0], p[1] + 0.72 * sunward[1] - 0.22 * z[1]], {
          size: small,
          color: ink,
        }),
        // Above the beam, on the side of the ray away from the angle's arc, and short of the horizon.
        sunward[1] < 0
          ? label('noon sunlight', [p[0] - 0.3, Math.max(p[1], q[1]) + 0.12], { size: small, color: SUN, edge: [1, -1] })
          : label('noon sunlight', [p[0] - 0.3, Math.min(p[1], q[1]) - 0.12], { size: small, color: SUN, edge: [1, 1] }),
        // Under the share, clear of the globe and the beam at every latitude.
        label(formula, corner(3).at, {
          size: small * 1.3,
          color: ink,
          edge: corner(3).edge,
        }),
      );
      // The stage's camera: the heading and its line stay on screen, over the band.
      await s.focus(view, { exact: true, runTime: 1.2, with: [juneSaid, sun].map((m) => new FadeOut(m)) });
      await s.enter(notes, {
        describe: `Close-up on ${place.name} at noon in June: its horizon, the noon sunlight, and the ${degrees(june.altitude)} angle between them, ${formula}. A yellow beam lands on a patch of horizon ${(1 / juneShare).toFixed(2)} times its width: per m² of ground, sin ${degrees(june.altitude)} = ${juneShare.toFixed(2)} of overhead sunlight`,
      });
    }

    // ------------------------------------------------------------ december
    await this.step('december', {
      title:
        Math.abs(june.daylight - december.daylight) > 0.05
          ? `December: the same axis, and ${place.name}’s daylight goes ${hours(june.daylight)} to ${hours(december.daylight)}`
          : `December: the same axis, and ${place.name}’s daylight stays ${hours(december.daylight)}`,
      line: 'Predict: of Tromsø, London, Quito and Sydney, whose daylight changes most?',
      caption:
        'Half an orbit later Earth is on the far side of the Sun, but the axis still points the same way, so the south end now leans sunward and the hemispheres swap seasons. ' +
        (Math.abs(june.daylight - december.daylight) > 0.05
          ? `${place.name}’s daylight ${december.daylight > june.daylight ? 'rises' : 'falls'} to ${hours(december.daylight)}. ` +
            (december.altitude > 0
              ? `Its noon Sun is ${december.altitude > june.altitude ? 'higher' : 'lower'}, ${degrees(december.altitude)} up, ${december.altitude > june.altitude ? 'concentrating' : 'spreading'} the beam over ${december.altitude > june.altitude ? 'less' : 'more'} ground: ${percent(decShare)} of overhead sunlight per m², against ${percent(juneShare)} in June. `
              : `Its noon Sun stays below the horizon, so it gets no direct sunlight. `) +
            `Both the longer days and the stronger sunlight fall in ${december.daylight > june.daylight ? 'December' : 'June'}, so ${place.name} receives the most sunlight around then.`
          : `${place.name}’s noon Sun stands at the same ${degrees(december.altitude)}, now to the south, so its noon sunlight stays at ${percent(decShare)} of overhead; its daylight stays at ${hours(december.daylight)}.`),
    });
    // Back to the whole stage: the same Sun and June Earth, with June's daylight again.
    await s.focus('all', { runTime: 1, with: [new FadeOut(notes), new FadeIn(sun), new FadeIn(juneSaid)] });
    const D = season('December', DEC_C, 1, december);
    await s.enter(D.drawing, { describe: D.drawn });
    await s.enter(D.ray, { describe: D.noon });
    const decSaid = await daylightCallout(D, december);
    // Each solstice's noon sunlight per square metre, said under its daylight.
    const shareSaid = async (callout: Mobject, r: { altitude: number }, x: number) => {
      if (r.altitude <= 0) return;
      const under = callout.children.at(-1)!.center();
      const said = label(`Noon: ${percent(noonShare(place.lat, Math.sign(x) * TILT))} of overhead sunlight per m²`, [under[0], under[1] - 0.44], {
        size: 0.28,
        color: SUN,
      });
      callout.add(said);
      await this.play(new FadeIn(said, { runTime: 0.2 }));
    };
    await shareSaid(juneSaid, june, JUNE_C[0]);
    await shareSaid(decSaid, december, DEC_C[0]);
    const monthsSaid = new Group(
      label('June', [JUNE_C[0] + R, 2.85], { size: 0.32, color: ink, edge: [1, 0] }),
      label('December', [DEC_C[0] + R, 2.85], { size: 0.32, color: ink, edge: [1, 0] }),
    );
    monthsSaid.key = 'solstice-months';
    await s.enter(monthsSaid, { describe: 'June on the right; December on the left' });
    this.state.december = december;
    this.state.noonShare = { june: juneShare, december: decShare };
    // The step compares June's daylight with December's, so a phone's tour visits June's line
    // too, though it did not change; the next step moves on to the other places.
    let comparingJune = true;
    emphasises(this, () => (comparingJune ? [[J.dayLine, 'June daylight']] : []));

    // -------------------------------------------------------------- spread
    // The two noon beams from the globes, set down on one stretch of level ground under them, to scale:
    // each 1 m across at right angles to its rays, landing on the length noonPatch gives.
    const junePatch = noonPatch(place.lat, TILT),
      decPatch = noonPatch(place.lat, -TILT);
    const metres = (x: number) => x.toFixed(2) + ' m';
    const longer = junePatch !== null && decPatch !== null && Math.abs(junePatch - decPatch) > 0.005
      ? decPatch > junePatch
        ? { month: 'December', other: 'June', ratio: decPatch / junePatch, from: juneShare, to: decShare }
        : { month: 'June', other: 'December', ratio: junePatch / decPatch, from: decShare, to: juneShare }
      : null;
    const beamSaid = (month: string, alt: number, patch: number, share: number) =>
      `${month}’s Sun, ${degrees(alt)} up, lays its beam on ${metres(patch)} of ground, so each square metre gets 1 ÷ ${patch.toFixed(2)} = ${percent(share)} of what an overhead Sun gives`;
    await this.step('spread', {
      title:
        decPatch === null
          ? `The same 1 m beam lands on ${metres(junePatch!)} of ground in June; in December the noon Sun is down`
          : longer
            ? `The same 1 m beam lands on ${metres(junePatch!)} of ground in June, ${metres(decPatch)} in December`
            : `The same 1 m beam lands on ${metres(decPatch)} of ground in June and in December`,
      line: `Both noon beams on level ground at ${place.name}, drawn to one scale.`,
      caption:
        `Here the noon sunlight from both globes lands on level ground at ${place.name}. Each beam is 1 m across, measured at right angles to its rays. ` +
        `${beamSaid('June', june.altitude, junePatch!, juneShare)}. ` +
        (decPatch === null
          ? `In December the noon Sun stays ${degrees(-december.altitude)} below the horizon, so no beam reaches the ground.`
          : longer
            ? `${beamSaid('December', december.altitude, decPatch, decShare)}. Counted at Earth’s average distance, as the percentages are, both beams carry the same sunlight; ${longer.month}’s spreads it over ${longer.ratio.toFixed(1)} times as much ground as ${longer.other}’s, which is how ${percent(longer.from)} per m² falls to ${percent(longer.to)}.`
            : `December’s Sun stands at the same ${degrees(december.altitude)}, so the beam lands on the same ${metres(decPatch)} and the share stays ${percent(decShare)}.`),
    });
    comparingJune = false;
    await this.play(...[juneSaid, decSaid].map((c) => new FadeOut(c, { runTime: 0.3 })));
    const spread = new Group();
    spread.key = 'spread';
    {
      // Ground at y0; 1 m of beam is W units; each beam is drawn L units long on its sun-side edge. The words
      // under each patch sit in a column at ±COLUMN, so the comparison stays narrow enough for a phone to open
      // on it whole with its words at a readable size.
      const y0 = -2.6,
        W = 0.5,
        L = 1.5,
        COLUMN = 1.9,
        size = 0.34;
      const ground = new Line([-3.4, y0], [3.4, y0], { stroke: ink, strokeWidth: 0.03 });
      ground.key = 'spread-ground';
      spread.add(ground);
      /**
       * One noon beam landing on the ground, with its words in a column at `column`. `s` is the Sun's side
       * (+1 = right). The patch is centred under the column and runs patch × W away from the Sun; the beam's
       * far end is cut square to its rays, so it shows the beam's 1 m width.
       */
      const beam = (month: string, column: number, s: 1 | -1, alt: number, patch: number | null, share: number) => {
        const g = new Group();
        g.key = `spread-${month.toLowerCase()}`;
        const words = patch === null ? [month, 'Sun below the horizon'] : [`${month}, ${degrees(alt)}`, metres(patch), `${percent(share)} per m²`];
        g.add(...words.map((t, i) => label(t, [column, y0 - 0.38 - i * 0.44], { size, color: i === 1 ? SUN : ink })));
        if (patch === null) return g;
        const a = alt * RAD,
          up: Vec = [s * Math.cos(a), Math.sin(a)],
          across: Vec = [-s * Math.sin(a), Math.cos(a)];
        const near: Vec = [column + (s * patch * W) / 2, y0],
          far: Vec = [column - (s * patch * W) / 2, y0],
          t1: Vec = [near[0] + L * up[0], near[1] + L * up[1]],
          t2: Vec = [t1[0] + W * across[0], t1[1] + W * across[1]];
        const band = new Polygon([near, t1, t2, far], { fill: SUN, fillOpacity: 0.4, stroke: 'none' });
        band.key = `spread-${month.toLowerCase()}-beam`;
        const lit = new Line(near, far, { stroke: SUN, strokeWidth: 0.07 });
        lit.key = `spread-${month.toLowerCase()}-patch`;
        g.add(
          band,
          new Line(t1, t2, { stroke: SUN, strokeWidth: 0.03 }),
          lit,
          label('1 m', [(t1[0] + t2[0]) / 2 + 0.34 * up[0], (t1[1] + t2[1]) / 2 + 0.34 * up[1]], { size, color: ink }),
        );
        return g;
      };
      // December's Sun is to the right of its globe and June's to the left, as drawn above: December's beam
      // lands on the left half of the ground and June's on the right, both leaning toward the Sun between them.
      spread.add(
        beam('December', -COLUMN, 1, december.altitude, decPatch, decShare),
        beam('June', COLUMN, -1, june.altitude, junePatch, juneShare),
      );
    }
    await s.enter(spread, {
      describe:
        `Level ground at ${place.name}, with both noon beams drawn to one scale, each 1 m across: June’s, at ${degrees(june.altitude)}, lands on ${metres(junePatch!)}, ${percent(juneShare)} per m²; ` +
        (decPatch === null ? `December’s noon Sun is below the horizon, so no beam lands` : `December’s, at ${degrees(december.altitude)}, lands on ${metres(decPatch)}, ${percent(decShare)} per m²`),
    });
    s.reading(spread);
    this.state.patch = { june: junePatch, december: decPatch };

    // ------------------------------------------------------------ latitude
    const swing = (k: string) => [sunlight(PLACES[k]!.lat, TILT).daylight, sunlight(PLACES[k]!.lat, -TILT).daylight] as const;
    const [tromsoJune, tromsoDec] = swing('tromso'),
      [quitoJune] = swing('quito');
    await this.step('latitude', {
      title: `Tromsø swings from ${hours(tromsoJune)} to ${hours(tromsoDec)}; Quito stays at ${hours(quitoJune)}`,
      line: 'Latitude sets how much of each circle is lit.',
      caption:
        'Each line follows one place as Earth turns; yellow marks the daylight part. Tromsø’s circle is all day in June and all night in December, while the equator’s is always cut in half. London and Sydney sit between those extremes. These ideal day lengths count the Sun’s centre above a flat horizon, leaving out atmospheric bending and local terrain.',
    });
    await this.play(new FadeOut(spread, { runTime: 0.3 }));
    const others = ORDER.filter((k) => k !== key);
    const extra = new Group();
    extra.key = 'latitude-circles';
    for (const [center, side] of [
      [JUNE_C, -1],
      [DEC_C, 1],
    ] as const) {
      const v = sideView(center, R, side);
      for (const k of others) {
        const ch = v.chord(PLACES[k]!.lat);
        extra.add(
          new Line(ch.night[0], ch.night[1], {
            stroke: DIMLINE,
            strokeWidth: 0.035,
          }),
          new Line(ch.day[0], ch.day[1], {
            stroke: SUN,
            strokeWidth: 0.035,
            strokeOpacity: 0.75,
          }),
        );
      }
      // Name the circles once, on the December side, where their ends are well apart.
      if (side > 0)
        for (const k of ORDER) {
          const ch = v.chord(PLACES[k]!.lat);
          extra.add(
            label(PLACES[k]!.name, ch.far, {
              size: 0.27,
              color: k === key ? PLACE : soft,
              edge: side < 0 ? [-1, 0] : [1, 0],
            }),
          );
        }
    }
    await this.play(
      J.latitude.animate.setStyle({ strokeWidth: 0.09 }),
      D.latitude.animate.setStyle({ strokeWidth: 0.09 }),
      { runTime: 0.3 },
    );
    await s.enter(extra, {
      describe: 'The other places’ latitude circles on both views, yellow where lit',
    });
    const table = (title: string, decl: number, box: [number, number, number, number]) =>
      s.card(
        ORDER.map((k) => [PLACES[k]!.name, hours(sunlight(PLACES[k]!.lat, decl).daylight)] as const),
        { at: box, title, fontSize: 0.27, align: 'top' },
      );
    // Four places in two months: a table, one under each globe.
    const juneTable = await table('June', TILT, [JUNE_C[0] - 2.8, -4.2, JUNE_C[0] + 2.8, CY - R - 0.2]);
    const decTable = await table('December', -TILT, [DEC_C[0] - 2.8, -4.2, DEC_C[0] + 2.8, CY - R - 0.2]);
    juneTable.key = 'june-daylight-table';
    decTable.key = 'december-daylight-table';
    await juneTable.mark(place.name);
    await decTable.mark(place.name);

    // ---------------------------------------------------------------- year
    // A native chart of the model itself: `plot` samples daylightAt for this
    // latitude, and its monotone cubics hold a clamped 24 h or 0 h flat.
    const year = daylightYear(place.lat),
      days = daysOf(place.lat),
      polarDay = days.filter((d) => d >= 24).length,
      polarNight = days.filter((d) => d <= 0).length,
      longest = Math.max(...days),
      shortest = Math.min(...days);
    const flat = Math.abs(june.daylight - december.daylight) < 0.05;
    await this.step('year', {
      title: `${place.name}’s daylight through the year`,
      line: polarDay
        ? `By the model, 24 h for ${polarDay} days and 0 h for ${polarNight}; an almanac’s polar night is shorter.`
        : flat
          ? 'Flat at 12 hours all year, solstices and equinoxes alike.'
          : june.daylight < december.daylight
            ? `Shortest ${hours(shortest)} in June, longest ${hours(longest)} in December.`
            : `From ${hours(shortest)} in December to ${hours(longest)} in June.`,
      caption:
        'The curve runs the same model through the year. ' +
        (polarDay
          ? `It stays flat at 24 hours for ${polarDay} days around the June solstice, the span the dimension marks, when ${place.name}’s whole circle is lit, and at 0 for ${polarNight} days around December; the flat parts represent continuous daylight or darkness, rather than a pause in Earth’s rotation.`
          : flat
            ? `On the equator the day–night line always cuts the circle in half, so the curve stays flat at 12 hours all year.`
            : (june.daylight < december.daylight
                ? `${place.name}’s curve is upside down from a northern one: its shortest day, ${hours(shortest)}, falls at the June solstice and its longest, ${hours(longest)}, in December.`
                : `${place.name}’s day grows from ${hours(shortest)} at the December solstice to ${hours(longest)} at the June solstice.`) +
              ` The dimension on the right measures the gap, ${hours(tenths(longest) - tenths(shortest))}.`) +
        ' Earth is nearest the Sun in early January, two weeks after the December solstice.',
    });
    await s.clear();
    this.state.daylight = year;
    this.state.polarDay = polarDay;
    this.state.polarNight = polarNight;
    const CURVE = '#7aa2f7',
      DEC = '#7dcfff',
      MIRROR = '#bb9af7';
    const axes = new Axes({
      xRange: [0, 12, 1],
      yRange: [0, 24, 6],
      width: 7.6,
      height: 5.4,
      axisStyle: { stroke: s.palette.muted, labelColor: soft, labelFontSize: 0.2 },
      yAxisStyle: { includeNumbers: true },
      yLabel: 'daylight (h)',
      axisLabelFontSize: 0.2,
    });
    axes.shift([-6.6 - axes.c2p(0, 0)[0], -3.5 - axes.c2p(0, 0)[1]]);
    axes.key = 'daylight-axes';
    const months = new Group(
      ...MONTHS.map((m, i) => label(m, [axes.c2p(i + 0.5, 0)[0], axes.c2p(0, 0)[1] - 0.3], { size: 0.2 })),
    );
    s.keep(axes, months, { describe: 'A chart of daylight in hours, 0 to 24, through the months January to December' });
    await this.play(new Create(axes), new FadeIn(months), { runTime: 2 });
    const curve = axes.plot(daylightAt(place.lat), { samples: 145, color: CURVE, strokeWidth: 0.05 });
    // The model's curve, drawn by pen across the year.
    const drawnCurve = await s.draw(curve, {
      tool: 'pen',
      runTime: 2,
      describe:
        `${place.name}’s daylight through the year, ` +
        (longest - shortest < 0.05 ? `flat at ${hours(longest)}` : `from ${hours(shortest)} to ${hours(longest)}`) +
        (polarDay ? `, flat at 24 h for ${polarDay} days and at 0 h for ${polarNight}` : ''),
    });
    drawnCurve.key = 'daylight-curve';
    // Solstices and equinoxes: a guide, a name, and the model's day length there.
    const guides = new Group(),
      marks = new Group(),
      atEvents: string[] = [];
    for (const e of EVENTS) {
      const x = xOn(e.day),
        value = daylightOn(place.lat, e.day),
        color = e.name === 'Jun solstice' ? SUN : e.name === 'Dec solstice' ? DEC : ink;
      atEvents.push(`${e.name} ${hours(value)}`);
      guides.add(
        axes.verticalLine(x, { stroke: s.palette.muted, strokeWidth: 0.018, dashArray: '0.08 0.07' }),
        label(e.name, [axes.c2p(x, 24)[0], axes.c2p(x, 24)[1] + 0.32], { size: 0.2 }),
      );
      const at = axes.c2p(x, value);
      marks.add(
        axes.dot(x, value, { radius: 0.09, color }),
        label(hours(value), [at[0] + 0.15, at[1] + (value > 22 ? -0.22 : 0.2)], {
          size: 0.2,
          color,
          edge: [-1, 0],
        }),
      );
    }
    s.keep(guides, {
      describe: 'Dashed lines at the March and September equinoxes and the June and December solstices',
    });
    s.keep(marks, { describe: `The curve’s value on those days: ${atEvents.join(', ')}` });
    await this.play(new FadeIn(guides));
    await this.play(new FadeIn(marks));
    // The year's counts, said on the curve: how long it stays at 24 h and at 0 h, or how far
    // its longest day stands above its shortest.
    const said: Mobject[] = [];
    if (polarDay) {
      const lit = days.flatMap((d, i) => (d >= 24 ? [i] : [])),
        top = axes.c2p(0, 24)[1];
      said.push(
        await s.dimension(
          [axes.c2p(xOn(lit[0]!), 24)[0], top],
          [axes.c2p(xOn(lit.at(-1)!), 24)[0], top],
          `${polarDay} days`,
          {
            offset: -0.6,
            size: 0.22,
          },
        ),
      );
      if (polarNight)
        said.push(
          await s.callout(axes.c2p(xOn(EVENTS[3].day), 0), `${polarNight} days at 0 h`, {
            side: 'above',
            gap: 1.1,
            size: 0.22,
          }),
        );
    } else if (longest - shortest >= 0.05) {
      // From the hours as printed, so the label is the difference the reader can take.
      const spread = hours(tenths(longest) - tenths(shortest)),
        X = 13.1,
        at = (h: number) => days.findIndex((d) => d === h);
      const levels = new Group(
        ...[shortest, longest].map((h) =>
          axes.horizontalLine(h, { from: xOn(at(h)), to: X, stroke: soft, strokeWidth: 0.018, dashArray: '0.06 0.06' }),
        ),
      );
      await s.enter(levels, {
        describe: `Dashed lines from the shortest day, ${hours(shortest)}, and the longest, ${hours(longest)}, to the right of the chart`,
      });
      said.push(
        levels,
        await s.dimension(axes.c2p(X, shortest), axes.c2p(X, longest), `longest − shortest: ${spread}`, {
          offset: -0.05,
          size: 0.22,
        }),
      );
    }

    // ------------------------------------------------------------ distance
    const mirror = daylightYear(-place.lat);
    // The orbit's distance through the year, in average distances: nearest in early January.
    const orbit = Array.from({ length: 365 }, (_, d) => sunDistance(d)),
      nearest = Math.min(...orbit),
      farthest = Math.max(...orbit),
      farther = Math.round((farthest / nearest - 1) * 1000) / 10,
      stronger = Math.round(((farthest / nearest) ** 2 - 1) * 100);
    const shares = [juneShare, decShare].sort((a, b) => a - b);
    const distanceSaid = `Distance still changes incoming sunlight: an equally oriented surface receives about ${stronger}% more in January than in July, before atmospheric absorption. Both hemispheres share this distance change.`;
    await this.step('distance', {
      title:
        place.lat !== 0
          ? `15 January: ${hours(year[0]!)} of daylight in ${place.name}, ${hours(mirror[0]!)} at ${latitudeName(-place.lat)}`
          : `Nearest or farthest from the Sun, Quito gets ${hours(year[0]!)}`,
      line:
        place.lat !== 0
          ? `Purple: the same model at ${latitudeName(-place.lat)}. The bars set the two causes side by side.`
          : `Earth is ${farther}% farther from the Sun in July; ${place.name} still gets ${hours(year[6]!)}.`,
      caption:
        place.lat !== 0
          ? `Back to the opening question. ${distanceSaid} The tilt moves ${place.name}’s noon sunlight between ${percent(shares[0]!)} and ${percent(shares[1]!)} of overhead. On 15 January ${place.name} gets ${hours(year[0]!)} of daylight and ${latitudeName(-place.lat)}, the purple curve, gets ${hours(mirror[0]!)}; both are the same distance from the Sun that day, so the gap between them comes from the tilt.`
          : `Back to the opening question. ${distanceSaid} Quito gets ${hours(year[0]!)} in January and in July, and its noon Sun stands at ${degrees(june.altitude)} at both solstices, ${percent(juneShare)} of overhead, so the tilt bar has no length here. On 15 January London gets ${hours(daylightYear(PLACES.london!.lat)[0]!)} and Sydney ${hours(daylightYear(PLACES.sydney!.lat)[0]!)}, at one distance from the Sun.`,
    });
    await this.play(...[...said, marks, guides].map((m) => new FadeOut(m, { runTime: 0.3 })));
    // 15 January is the first month's sample day, x = 0.5.
    const jan = axes.c2p(0.5, year[0]!);
    const marker = new Group(
      axes.verticalLine(0.5, { stroke: SUN, strokeWidth: 0.025, dashArray: '0.1 0.08' }),
      new Dot({ radius: 0.09, color: SUN }).moveTo(jan),
    );
    marker.children[1]!.key = 'january-point';
    await s.enter(marker, { describe: `15 January marked on the chart at ${hours(year[0]!)}` });
    // The same model at the mirrored latitude: the other hemisphere on the same days.
    const end = (lat: number) => axes.c2p(12, daylightAt(lat)(12));
    const own = label(place.name, [end(place.lat)[0] + 0.15, end(place.lat)[1]], {
      size: 0.2,
      color: CURVE,
      edge: [-1, 0],
    });
    // Its members enter one by one, so each is kept (and so described) itself.
    const second = new Group(own);
    if (place.lat !== 0) {
      const other = axes.plot(daylightAt(-place.lat), { samples: 145, color: MIRROR, strokeWidth: 0.035 });
      other.key = 'mirror-daylight-curve';
      second.add(
        other,
        new Dot({ radius: 0.09, color: MIRROR }).moveTo(axes.c2p(0.5, mirror[0]!)),
        label(latitudeName(-place.lat), [end(-place.lat)[0] + 0.15, end(-place.lat)[1]], {
          size: 0.2,
          color: MIRROR,
          edge: [-1, 0],
        }),
      );
      second.children[2]!.key = 'mirror-january-point';
      s.keep(own, ...second.children.slice(1), {
        describe: `The same model at ${latitudeName(-place.lat)}, ${place.name}’s curve turned upside down: ${hours(mirror[0]!)} on 15 January`,
      });
      await this.play(new Create(other), new FadeIn(own), { runTime: 1.5 });
      await this.play(...second.children.slice(2).map((m) => new FadeIn(m)));
    } else {
      s.keep(own, { describe: `${place.name}’s curve named at its end` });
      await this.play(new FadeIn(own));
    }
    // The two causes on one scale, beside the chart: how far the tilt moves this place's noon sunlight between
    // the solstices, and how far the distance moves an overhead Sun's between July and January. Both in
    // percent of an overhead Sun at Earth's average distance; sunlight falls off as 1 / distance².
    const bars = new Group();
    bars.key = 'effect-bars';
    {
      const left = 2.6,
        right = 6.9,
        top = 1.0,
        full = 1.05,
        x = (share: number) => left + ((right - left) * share) / full;
      const july = 1 / farthest ** 2,
        january = 1 / nearest ** 2;
      const [low, high] = shares as [number, number],
        lowMonth = juneShare <= decShare ? 'June' : 'December',
        highMonth = juneShare <= decShare ? 'December' : 'June';
      const bar = (from: number, to: number, y: number, color: string) =>
        new Rectangle({ width: Math.max(0.05, x(to) - x(from)), height: 0.4, fill: color, stroke: 'none' }).moveTo(
          [(x(from) + x(to)) / 2, y],
        );
      const track = (y: number) => new Line([x(0), y], [x(full), y], { stroke: s.palette.muted, strokeWidth: 0.02 });
      const row = (heading: string, from: number, to: number, fromName: string, toName: string, y: number, color: string) => {
        const g = new Group(
          label(heading, [left, y + 0.6], { size: 0.26, color: ink, edge: [-1, 0] }),
          track(y),
          bar(from, to, y, color),
        );
        if (to - from < 0.01) g.add(label(`${fromName} and ${toName}`, [x(to), y - 0.45], { size: 0.24, color }));
        else
          g.add(
            label(fromName, [x(from), y - 0.45], { size: 0.24, color, edge: [1, 0] }),
            label(toName, [x(to), y - 0.45], { size: 0.24, color, edge: [-1, 0] }),
          );
        return g;
      };
      const ticks = new Group(
        ...[0, 0.5, 1].map((t) => label(`${t * 100}%`, [x(t), top - 2.6], { size: 0.22 })),
        ...[0, 0.5, 1].map((t) => new Line([x(t), top - 2.38], [x(t), top - 2.28], { stroke: s.palette.muted, strokeWidth: 0.02 })),
      );
      bars.add(
        label('Sunlight per m², % of an overhead Sun', [left, top + 1.45], { size: 0.24, color: soft, edge: [-1, 0] }),
        row(
          percent(low) === percent(high) ? `Tilt: ${place.name}’s noon, ${percent(high)} at both` : `Tilt: ${place.name}’s noon, ${percent(low)} to ${percent(high)}`,
          low,
          high,
          lowMonth,
          highMonth,
          top,
          SUN,
        ),
        row(`Distance: overhead Sun, ${percent(july)} to ${percent(january)}`, july, january, 'July', 'January', top - 1.5, CURVE),
        ticks,
      );
      await s.enter(bars, {
        describe: `Two bars on one scale of sunlight per square metre, in percent of an overhead Sun: the tilt moves ${place.name}’s noon sunlight from ${percent(low)} in ${lowMonth} to ${percent(high)} in ${highMonth}; the distance moves an overhead Sun’s from ${percent(july)} in July to ${percent(january)} in January, ${stronger}% more`,
      });
      this.state.distance = { nearest, farthest };
      this.state.bars = { tilt: [low, high], distance: [july, january] };
    }
    // The January values, said beside their dots on tags that read over the curves. On the
    // equator both months give the same day, so 15 July is said there too.
    const tag = (x: number, value: number, text: string, color: string) => {
      const p = axes.c2p(x, value),
        t = new Text(text, { fontSize: 0.22, color });
      const bg = new Rectangle({
        width: t.width() + 0.26,
        height: 0.38,
        cornerRadius: 0.06,
        fill: s.palette.paper,
        fillOpacity: 1,
        stroke: color,
        strokeWidth: 0.014,
      });
      return new Group(bg, t.moveTo(bg.center())).moveTo([p[0] + 0.24 + bg.width() / 2, p[1]]);
    };
    const janSaid: Mobject[] =
      place.lat !== 0
        ? [tag(0.5, year[0]!, hours(year[0]!), CURVE), tag(0.5, mirror[0]!, hours(mirror[0]!), MIRROR)]
        : [
            tag(0.5, year[0]!, `15 January: ${hours(year[0]!)}`, CURVE),
            tag(6.5, year[6]!, `15 July: ${hours(year[6]!)}`, CURVE),
          ];
    janSaid[0]!.key = 'january-value';
    janSaid[1]!.key = place.lat === 0 ? 'july-value' : 'mirror-january-value';
    if (place.lat === 0) {
      const julyPoint = new Dot({ radius: 0.09, color: CURVE }).moveTo(axes.c2p(6.5, year[6]!));
      julyPoint.key = 'july-point';
      janSaid.push(julyPoint);
    }
    await s.enter(...janSaid, {
      describe:
        place.lat !== 0
          ? `Beside the 15 January dots: ${place.name} ${hours(year[0]!)}, ${latitudeName(-place.lat)} ${hours(mirror[0]!)}`
          : `${place.name} on 15 January, ${hours(year[0]!)}, and on 15 July, ${hours(year[6]!)}`,
    });
  }
}
