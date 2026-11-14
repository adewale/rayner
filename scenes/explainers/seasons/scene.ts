import { Scene, FadeIn, FadeOut, Create, keyed } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, settingsOf, view, having } from '../../../explain/index.ts';
import type { ExplainerMeta } from '../../../explain/index.ts';
import { emphasised, dimension, callout } from '../../../explain/drawing.ts';
import { sunlight, daylightYear, noonShare, noonPatch, sunDistance, declinationOn, MID_MONTH } from './model.ts';
import {
  SUN, TILT, R, CY, JUNE_C, DEC_C,
  degrees, pct, metres, hours, latitudeName, exactly, drawSpread,
  drawGuess, drawOrbit, drawNearestNote, sideOf, daylightAnchor, belowHorizonNote, shareNote, formulaOf, drawNoon,
  drawSolsticeMonths, drawLatitudeCircles, tableBox, drawDaylightTable, dayAt, xOn, LEVEL_X, drawDaylightAxes,
  drawYearCurve, drawGuides, drawEventMarks, drawLevels, drawJanuaryMarker, drawMirror, drawBars, drawTags,
  type SeasonState,
} from './picture.ts';

const PLACES: Record<string, { name: string; lat: number }> = {
  tromso: { name: 'Tromsø', lat: 69.65 },
  london: { name: 'London', lat: 51.5 },
  quito: { name: 'Quito', lat: 0 },
  sydney: { name: 'Sydney', lat: -33.87 },
};
const ORDER = ['tromso', 'london', 'quito', 'sydney'] as const;
/** Hours as the year's dimension prints them, rounded to a tenth. */
const tenths = (h: number) => Math.round(h * 10) / 10;
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

export default class SeasonsExplainer extends Scene<SeasonState, {}> {
  static meta = {
    sources: [
      'https://spaceplace.nasa.gov/seasons/en/',
      'https://gml.noaa.gov/grad/solcalc/calcdetails.html',
      'https://en.wikipedia.org/wiki/Position_of_the_Sun#Declination_of_the_Sun_as_seen_from_Earth',
    ],
    // Sentences that reach past the two solstices on screen, and the tests that hold them.
    claims: [
      {
        says: 'Tromsø never enters the night half',
        test: 'model.test.ts: sunlight follows the sunrise equation',
      },
      {
        says: 'the equator’s is always cut in half',
        test: 'model.test.ts: on the equator the day–night line cuts the circle in half',
      },
      {
        says: 'the day–night line always cuts the circle in half',
        test: 'model.test.ts: on the equator the day–night line cuts the circle in half',
      },
    ],
  } satisfies ExplainerMeta;
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
    const soft = s.look.soft;
    const colours = s.look;

    // ------------------------------------------------------------- nearest
    // The common guess, as a prediction: if nearness made summer, the north would be nearest in July.
    await this.step('nearest', {
      title: 'Earth’s distance from the Sun changes through the year',
      line: 'Predict: in which month is Earth nearest the Sun?',
      // The month whose 15th is nearest, from the model's distance.
      predict: { options: ['January', 'April', 'July', 'October'], answer: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][((d) => d.indexOf(Math.min(...d)))(MID_MONTH.map(sunDistance))]! },
      caption:
        'Earth’s orbit is slightly oval, so it passes nearest the Sun once a year and farthest half a year later. A common guess is that the seasons follow this distance, with summer when Earth is nearest. The oval is drawn far more stretched than it is.',
    });
    const guess = drawGuess(colours);
    await s.enter(guess, {
      describe: 'An exaggerated oval orbit with the Sun off centre: Earth nearest the Sun at one end and farthest at the other, each asking which month',
    });

    // ---------------------------------------------------------------- tilt
    await this.step('tilt', {
      title: 'Nearest the Sun in early January, while the north tilts away',
      line: `Predict: in June, does ${place.name} get more or less than 12 hours of daylight?`,
      predict: { options: ['More', 'Less', 'About 12 hours'], answer: ((h) => (h > 12.05 ? 'More' : h < 11.95 ? 'Less' : 'About 12 hours'))(sunlight(place.lat, TILT).daylight) },
      caption:
        'Earth is nearest the Sun in early January, when the north has winter and the south summer. Distance cannot explain opposite seasons at once. The tilt of Earth’s axis, not its distance from the Sun, makes the seasons: the tilted axis keeps pointing the same way, so the north leans sunward in June and away in December. Sizes and distances are not to scale.',
    });
    await s.clear();
    // The orbit's Sun and Earths: the Sun is carried on into the next step, and June's Earth grows into its side view.
    const tilt = drawOrbit(colours);
    await this.play(
      new Create(s.keep(tilt.orbit, tilt.sun, { describe: 'An orbit around the Sun, not to scale' })),
      new FadeIn(tilt.sun),
    );
    await s.enter(tilt.june, tilt.december, tilt.september, tilt.march, {
      describe:
        'Earth in June (right), September (top), December (left) and March (bottom), its axis tilted the same way each time',
    });
    const nearestNote = drawNearestNote(soft);
    await s.enter(nearestNote, { describe: 'Beside December’s Earth: nearest the Sun in early January' });

    // ---------------------------------------------------------------- june
    // From here on every picture that states the model is a view of the scene's state: the side views,
    // the noon close-up, the beams, the tables, the chart's values, the bars and the tags. The callouts,
    // dimensions and the pen-drawn curve are the stage's (a draw cannot call them); they say what the
    // state holds.
    const now = () => this.state;
    const june = sunlight(place.lat, TILT),
      december = sunlight(place.lat, -TILT);
    // The orbit's Sun, carried here; the side views draw it at the same size.
    const sun = tilt.sun;
    /**
     * A season's daylight said on its drawing: a callout from the middle of the lit part of the
     * place's circle to just under the globe. The angle already labels a noon Sun above the
     * horizon; one below it, which has no angle, is said here too.
     */
    const daylightCallout = async (month: 'June' | 'December') => {
      const S = sideOf(now(), month, colours),
        r = month === 'June' ? now().june : now().december!;
      const { mid, gap } = daylightAnchor(S);
      const note = s.keep(callout(s, mid, `${hours(r.daylight)} of daylight`, {
        side: 'below', gap, color: SUN, size: 0.28, key: `${S.month.toLowerCase()}-daylight-callout`,
      }));
      await this.play(new Create(note, { runTime: 0.6, lagRatio: 0.15 }));
      if (r.altitude <= 0) {
        const below = belowHorizonNote(note, r.altitude, soft);
        note.add(below);
        await this.play(new FadeIn(below, { runTime: 0.2 }));
      }
      return note;
    };
    /** A solstice's globe and its noon ray, each a view of the state, described from it. */
    const solstice = (month: 'June' | 'December') => {
      const globe = view(this, (st) => sideOf(st, month, colours).drawing, { place: false });
      const ray = view(this, (st) => sideOf(st, month, colours).ray, { place: false });
      return {
        globe,
        ray,
        describe: { drawn: () => sideOf(now(), month, colours).drawn, noon: () => sideOf(now(), month, colours).noon },
      };
    };

    await this.step('june', {
      title: `${place.name} in June: ${hours(june.daylight)} of daylight, noon Sun at ${degrees(june.altitude)}`,
      line: `Red dot: ${place.name}; yellow: its daylight, along its line.`,
      caption:
        (place.lat < 0
          ? `In June the north end of the axis leans toward the Sun. Sydney is south of the equator, so its noon Sun is low and most of its latitude circle, the line through the dot, is on the night side: ${hours(june.daylight)} of daylight in its winter.`
          : place.lat > 60
            ? 'In June the north end leans toward the Sun far enough that Tromsø’s whole latitude circle sits on the day side. As Earth turns, Tromsø never enters the night half, so the Sun stays up for all 24 hours.'
            : place.lat === 0
              ? 'In June the north end leans toward the Sun, but the day–night line still cuts the equator exactly in half. Quito’s circle is half day and half night, so it gets 12 hours of daylight.'
              : `In June the north end leans toward the Sun, so most of London’s latitude circle, the line through the dot, is on the day side: as Earth turns, London spends ${hours(june.daylight)} in daylight, and its noon Sun stands high.`) + ` At noon in June the Sun is overhead at ${exactly(TILT)} N; that latitude is the Sun’s declination, and through the year it moves between ${exactly(TILT)} N and ${exactly(TILT)} S.`,
    });
    this.state = { place: place.name, latitude: place.lat, june };
    // The orbit goes, but its Sun stays: carried to the middle, with June's Earth grown into a side view.
    await this.play(
      ...[tilt.orbit, tilt.december, tilt.september, tilt.march, nearestNote].map((m) => new FadeOut(m, { runTime: 0.4 })),
    );
    // Described apart, so the close-up, which fades the Sun, is not said to show it.
    s.keep(sun, { describe: 'The Sun, not to scale' });
    await s.carry(sun, [0, CY]);
    const J = solstice('June');
    s.keep(J.globe, { describe: J.describe.drawn });
    const small = tilt.june.find('orbit-earth:June')!.center();
    await this.play(
      new FadeOut(tilt.june, { shift: [JUNE_C[0] - small[0], JUNE_C[1] - small[1]], scale: 2, runTime: 0.8 }),
      new FadeIn(J.globe, { scale: 0.25, runTime: 0.8 }),
    );
    await s.enter(J.ray, { describe: J.describe.noon });
    const juneSaid = await daylightCallout('June');
    // Only the Sun and June's Earth are on stage: the camera comes in on them, so they fill the frame.
    await s.focus([-0.8, CY - R - 0.8, JUNE_C[0] + R + 0.35, CY + R + 0.5], { runTime: 0.8 });

    // ---------------------------------------------------------------- noon
    // The camera comes in on June's Earth, up to 1.8 times as close, so the horizon, the noon ray and
    // the angle between them fill the stage with the whole globe still in view.
    // How strongly that noon sunlight lands: sin of the altitude, from the model.
    const juneShare = noonShare(place.lat, TILT),
      decShare = noonShare(place.lat, -TILT);
    // The noon altitude as the reader can check it, exact to the hundredth, which the heading rounds to a tenth.
    const formula = formulaOf({ place: place.name, latitude: place.lat, june });
    await this.step('noon', {
      title: `June noon: the Sun stands ${degrees(june.altitude)} up, giving ${pct(juneShare)} of overhead sunlight per m²`,
      line: 'Yellow: one beam, spread across the ground; white: the horizon.',
      caption: `The white line is ${place.name}’s horizon. A lower Sun spreads the same beam over more ground, sharing its light across a larger patch. A higher Sun concentrates that light. Here each square metre receives ${pct(juneShare)} of what it would under an overhead Sun, before the air takes its share. The noon Sun’s height is 90° minus the distance from ${place.name}’s latitude to the declination: ${formula}.`,
    });
    // June's share of overhead sunlight; the December step adds December's.
    this.state.noonShare = { june: juneShare };
    const notes = view(this, (st) => drawNoon(st, colours).notes, { place: false });
    // The stage's camera: the heading and its line stay on screen, over the band.
    await this.play(s.focus(drawNoon(now(), colours).view, { exact: true, runTime: 1.2 }), ...[juneSaid, sun].map((m) => new FadeOut(m, { runTime: 1.2 })));
    await s.enter(notes, {
      describe: () => {
        const st = now(),
          share = st.noonShare!.june;
        return `Close-up on ${st.place} at noon in June: its horizon, the noon sunlight, and the ${degrees(st.june.altitude)} angle between them, ${formulaOf(st)}. A yellow beam lands on a patch of horizon ${(1 / share).toFixed(2)} times its width: per m² of ground, sin ${degrees(st.june.altitude)} = ${share.toFixed(2)} of overhead sunlight`;
      },
    });

    // ------------------------------------------------------------ december
    await this.step('december', {
      title:
        Math.abs(june.daylight - december.daylight) > 0.05
          ? `December: the same axis, and ${place.name}’s daylight goes ${hours(june.daylight)} to ${hours(december.daylight)}`
          : `December: the same axis, and ${place.name}’s daylight stays ${hours(december.daylight)}`,
      line: 'Predict: of Tromsø, London, Quito and Sydney, whose daylight changes most?',
      // The place whose June and December daylight differ most, from the model; the latitude step shows the swings.
      predict: {
        options: ORDER.map((k) => PLACES[k]!.name),
        answer: ((swings) => ORDER.indexOf(ORDER.reduce((a, b) => (swings[b]! > swings[a]! ? b : a))))(Object.fromEntries(ORDER.map((k) => [k, Math.abs(sunlight(PLACES[k]!.lat, TILT).daylight - sunlight(PLACES[k]!.lat, -TILT).daylight)])) as Record<string, number>),
        reveal: 'latitude',
      },
      caption:
        'Half an orbit later the axis still points the same way, so the south end now leans sunward and the hemispheres swap seasons. ' +
        (Math.abs(june.daylight - december.daylight) > 0.05
          ? `${place.name}’s daylight ${december.daylight > june.daylight ? 'rises' : 'falls'} to ${hours(december.daylight)}. ` +
            (december.altitude > 0
              ? `Its noon Sun is ${december.altitude > june.altitude ? 'higher' : 'lower'}, ${degrees(december.altitude)} up, ${december.altitude > june.altitude ? 'concentrating' : 'spreading'} the beam over ${december.altitude > june.altitude ? 'less' : 'more'} ground: ${pct(decShare)} of overhead sunlight per m², against ${pct(juneShare)} in June. `
              : `Its noon Sun stays below the horizon, so it gets no direct sunlight. `) +
            `Both the longer days and the stronger sunlight fall in ${december.daylight > june.daylight ? 'December' : 'June'}, so ${place.name} receives the most sunlight around then.`
          : `${place.name}’s noon Sun stands at the same ${degrees(december.altitude)}, now to the south, so its noon sunlight stays at ${pct(decShare)} of overhead; its daylight stays at ${hours(december.daylight)}.`),
    });
    this.state.december = december;
    this.state.noonShare = { june: juneShare, december: decShare };
    // Back to the whole stage: the same Sun and June Earth, with June's daylight again.
    await this.play(s.focus('all', { runTime: 1 }), new FadeOut(notes), new FadeIn(sun), new FadeIn(juneSaid));
    const D = solstice('December');
    await s.enter(D.globe, { describe: D.describe.drawn });
    await s.enter(D.ray, { describe: D.describe.noon });
    const decSaid = await daylightCallout('December');
    // Each solstice's noon sunlight per square metre, said under its daylight, from the state's shares.
    const shareSaid = async (callout: Mobject, month: 'june' | 'december') => {
      const r = now()[month]!;
      if (r.altitude <= 0) return;
      const said = shareNote(callout, now().noonShare![month]!, soft);
      callout.add(said);
      await this.play(new FadeIn(said, { runTime: 0.2 }));
    };
    await shareSaid(juneSaid, 'june');
    await shareSaid(decSaid, 'december');
    const monthsSaid = drawSolsticeMonths(colours);
    await s.enter(monthsSaid, { describe: 'June on the right; December on the left' });
    // The step compares June's daylight with December's, so a phone's tour visits June's line
    // too, though it did not change; the next step moves on to the other places.
    const juneDaylight = emphasised(this.find('june-daylight-latitude')!, 'June daylight');

    // -------------------------------------------------------------- spread
    // The two noon beams from the globes, set down on one stretch of level ground under them, to scale:
    // each 1 m across at right angles to its rays, landing on the length noonPatch gives.
    const junePatch = noonPatch(place.lat, TILT),
      decPatch = noonPatch(place.lat, -TILT);
    const longer = junePatch !== null && decPatch !== null && Math.abs(junePatch - decPatch) > 0.005
      ? decPatch > junePatch
        ? { month: 'December', other: 'June', ratio: decPatch / junePatch, from: juneShare, to: decShare }
        : { month: 'June', other: 'December', ratio: junePatch / decPatch, from: decShare, to: juneShare }
      : null;
    const beamSaid = (month: string, alt: number, patch: number, share: number) =>
      `${month}’s Sun, ${degrees(alt)} up, lays it on ${metres(patch)}: 1 ÷ ${patch.toFixed(2)} = ${pct(share)} of overhead per m²`;
    await this.step('spread', {
      title:
        decPatch === null
          ? `The same 1 m beam lands on ${metres(junePatch!)} of ground in June; in December the noon Sun is down`
          : longer
            ? `The same 1 m beam lands on ${metres(junePatch!)} of ground in June, ${metres(decPatch)} in December`
            : `The same 1 m beam lands on ${metres(decPatch)} of ground in June and in December`,
      line: `Both noon beams on level ground at ${place.name}, drawn to one scale.`,
      caption:
        `Both globes’ noon sunlight lands on level ground at ${place.name}, each beam 1 m across at right angles to its rays. ` +
        `${beamSaid('June', june.altitude, junePatch!, juneShare)}. ` +
        (decPatch === null
          ? `In December the noon Sun stays ${degrees(-december.altitude)} below the horizon, so no beam reaches the ground.`
          : longer
            ? `${beamSaid('December', december.altitude, decPatch, decShare)}. At Earth’s average distance both beams carry the same sunlight; ${longer.month}’s spreads it over ${longer.ratio.toFixed(1)} times the ground, so ${pct(longer.from)} per m² falls to ${pct(longer.to)}.`
            : `December’s Sun stands at the same ${degrees(december.altitude)}, so the beam lands on the same ${metres(decPatch)} and the share stays ${pct(decShare)}.`),
    });
    emphasised(juneDaylight, null);
    this.state.patch = { june: junePatch, december: decPatch };
    await this.play(...[juneSaid, decSaid].map((c) => new FadeOut(c, { runTime: 0.3 })));
    const spread = view(this, (st) => drawSpread(st, colours), { place: false });
    await s.enter(spread, {
      describe: () => {
        const st = now(),
          { june: jp, december: dp } = st.patch!,
          shares = st.noonShare!;
        return (
          `Level ground at ${st.place}, with both noon beams drawn to one scale, each 1 m across: June’s, at ${degrees(st.june.altitude)}, lands on ${metres(jp!)}, ${pct(shares.june)} per m²; ` +
          (dp === null ? `December’s noon Sun is below the horizon, so no beam lands` : `December’s, at ${degrees(st.december!.altitude)}, lands on ${metres(dp)}, ${pct(shares.december!)} per m²`)
        );
      },
    });
    s.opening(spread);

    // ------------------------------------------------------------ latitude
    const swing = (k: string) => [sunlight(PLACES[k]!.lat, TILT).daylight, sunlight(PLACES[k]!.lat, -TILT).daylight] as const;
    const [tromsoJune, tromsoDec] = swing('tromso'),
      [quitoJune] = swing('quito');
    await this.step('latitude', {
      title: `Tromsø swings from ${hours(tromsoJune)} to ${hours(tromsoDec)}; Quito stays at ${hours(quitoJune)}`,
      line: 'Yellow: the lit part of each circle, which latitude sets.',
      caption:
        'Each line follows one place as Earth turns; yellow marks the daylight part. Tromsø’s circle is all day in June and all night in December, while the equator’s is always cut in half. London and Sydney sit between those extremes. These ideal day lengths count the Sun’s centre above a flat horizon, leaving out atmospheric bending and local terrain.',
    });
    // `daylightTable`: each place's daylight at each solstice, as the tables print it.
    this.state.daylightTable = {
      june: Object.fromEntries(ORDER.map((k) => [PLACES[k]!.name, hours(sunlight(PLACES[k]!.lat, TILT).daylight)])),
      december: Object.fromEntries(ORDER.map((k) => [PLACES[k]!.name, hours(sunlight(PLACES[k]!.lat, -TILT).daylight)])),
    };
    await this.play(new FadeOut(spread, { runTime: 0.3 }));
    const extra = drawLatitudeCircles(ORDER.map((k) => ({ ...PLACES[k]!, here: k === key })), soft);
    await this.play(
      this.find('june-latitude')!.animate.setStyle({ strokeWidth: 0.09 }),
      this.find('december-latitude')!.animate.setStyle({ strokeWidth: 0.09 }),
      { runTime: 0.3 },
    );
    await s.enter(extra, {
      describe: 'The other places’ latitude circles on both views, yellow where lit',
    });
    // Four places in two months: a table, one under each globe, each a view of the state's daylight table
    // with this place's row marked.
    const table = (month: 'june' | 'december', title: string, box: ReturnType<typeof tableBox>) => {
      const card = view(
        this,
        (st) => {
          const rows = Object.entries(having(st, 'daylightTable').daylightTable[month]);
          return drawDaylightTable(s, rows, title, box, place.name);
        },
        { place: false },
      );
      keyed(card, `${month}-daylight-table`);
      return card;
    };
    const juneTable = table('june', 'June', tableBox(JUNE_C));
    const decTable = table('december', 'December', tableBox(DEC_C));
    // Each table describes itself, its marked row included, and says that it emphasises that row.
    await s.enter(juneTable, { runTime: 0.35, shift: [0, -0.08] });
    await s.enter(decTable, { runTime: 0.35, shift: [0, -0.08] });

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
    // `events`: the model's day length at each solstice and equinox, which the chart marks.
    this.state.events = EVENTS.map((e) => ({ name: e.name, hours: daylightOn(place.lat, e.day) }));
    const { axes, months } = drawDaylightAxes(colours);
    s.keep(axes, months, { describe: 'A chart of daylight in hours, 0 to 24, through the months January to December' });
    await this.play(new Create(axes), new FadeIn(months), { runTime: 2 });
    const curve = drawYearCurve(axes, daylightAt(now().latitude));
    // The model's curve, drawn by pen across the year.
    const drawnCurve = await s.sketch(curve, {
      tool: 'pen',
      runTime: 2,
      describe:
        `${place.name}’s daylight through the year, ` +
        (longest - shortest < 0.05 ? `flat at ${hours(longest)}` : `from ${hours(shortest)} to ${hours(longest)}`) +
        (polarDay ? `, flat at 24 h for ${polarDay} days and at 0 h for ${polarNight}` : ''),
    });
    keyed(drawnCurve, 'daylight-curve');
    // Solstices and equinoxes: a guide and a name at each, fixed by the calendar, and the model's day
    // length there, a view of the state's events.
    const guides = drawGuides(axes, EVENTS, colours);
    const marks = view(this, (st) => drawEventMarks(axes, having(st, 'events').events, EVENTS, colours), { place: false });
    s.keep(guides, {
      describe: 'Dashed lines at the March and September equinoxes and the June and December solstices',
    });
    s.keep(marks, { describe: () => `The curve’s value on those days: ${now().events!.map((e) => `${e.name} ${hours(e.hours)}`).join(', ')}` });
    await this.play(new FadeIn(guides));
    await this.play(new FadeIn(marks));
    // The year's counts, said on the curve: how long it stays at 24 h and at 0 h, or how far
    // its longest day stands above its shortest.
    const said: Mobject[] = [];
    if (polarDay) {
      const lit = days.flatMap((d, i) => (d >= 24 ? [i] : [])),
        top = axes.c2p(0, 24)[1];
      const polar = s.keep(
        dimension(s, [axes.c2p(xOn(lit[0]!), 24)[0], top], [axes.c2p(xOn(lit.at(-1)!), 24)[0], top], `${now().polarDay} days`, {
          offset: -0.6,
          size: 0.22,
        }),
      );
      await this.play(new Create(polar, { runTime: 0.6, lagRatio: 0.1 }));
      said.push(polar);
      if (polarNight) {
        const night = s.keep(callout(s, axes.c2p(xOn(EVENTS[3].day), 0), `${now().polarNight} days at 0 h`, { side: 'above', gap: 1.1, size: 0.22 }));
        await this.play(new Create(night, { runTime: 0.6, lagRatio: 0.15 }));
        said.push(night);
      }
    } else if (longest - shortest >= 0.05) {
      // From the hours as printed, so the label is the difference the reader can take.
      const spread = hours(tenths(longest) - tenths(shortest));
      const levels = drawLevels(axes, days, shortest, longest, soft);
      await s.enter(levels, {
        describe: `Dashed lines from the shortest day, ${hours(shortest)}, and the longest, ${hours(longest)}, to the right of the chart`,
      });
      const between = s.keep(
        dimension(s, axes.c2p(LEVEL_X, shortest), axes.c2p(LEVEL_X, longest), `longest − shortest: ${spread}`, { offset: -0.05, size: 0.22 }),
      );
      await this.play(new Create(between, { runTime: 0.6, lagRatio: 0.1 }));
      said.push(levels, between);
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
          ? `${distanceSaid} The tilt moves ${place.name}’s noon sunlight between ${pct(shares[0]!)} and ${pct(shares[1]!)} of overhead. On 15 January ${place.name} gets ${hours(year[0]!)} of daylight and ${latitudeName(-place.lat)}, the purple curve, gets ${hours(mirror[0]!)}; both are the same distance from the Sun that day, so the gap between them comes from the tilt.`
          : `${distanceSaid} Quito gets ${hours(year[0]!)} in January and in July, and its noon Sun stands at ${degrees(june.altitude)} at both solstices, ${pct(juneShare)} of overhead, so the tilt bar has no length here. On 15 January London gets ${hours(daylightYear(PLACES.london!.lat)[0]!)} and Sydney ${hours(daylightYear(PLACES.sydney!.lat)[0]!)}, at one distance from the Sun.`,
    });
    // `mirror`: the same model at the mirrored latitude, month by month.
    this.state.mirror = mirror;
    this.state.distance = { nearest, farthest };
    this.state.bars = { tilt: shares as [number, number], distance: [1 / farthest ** 2, 1 / nearest ** 2] };
    await this.play(...[...said, marks, guides].map((m) => new FadeOut(m, { runTime: 0.3 })));
    const marker = drawJanuaryMarker(axes, year[0]!);
    await s.enter(marker, { describe: `15 January marked on the chart at ${hours(year[0]!)}` });
    // The same model at the mirrored latitude: the other hemisphere on the same days.
    // Its members enter one by one, so each is kept (and so described) itself.
    const { own, second, other } = drawMirror(axes, place.name, place.lat, mirror[0]!, daylightAt, soft);
    if (other) {
      s.keep(own, ...second.children.slice(1), {
        describe: `The same model at ${latitudeName(-place.lat)}, ${place.name}’s curve turned upside down: ${hours(mirror[0]!)} on 15 January`,
      });
      await this.play(new Create(other), new FadeIn(own), { runTime: 1.5 });
      await this.play(...second.children.slice(2).map((m) => new FadeIn(m)));
    } else {
      s.keep(own, { describe: `${place.name}’s curve named at its end` });
      await this.play(new FadeIn(own));
    }
    // The two causes on one scale, beside the chart: sunlight falls off as 1 / distance². A view of the
    // state's bars.
    const bars = view(this, (st) => drawBars(st, colours).bars, { place: false });
    await s.enter(bars, {
      describe: () => {
        const st = now(),
          { lowMonth, highMonth } = drawBars(st, colours),
          [low, high] = st.bars!.tilt,
          [july, january] = st.bars!.distance;
        return `Two bars on one scale of sunlight per square metre, in percent of an overhead Sun: the tilt moves ${st.place}’s noon sunlight from ${pct(low)} in ${lowMonth} to ${pct(high)} in ${highMonth}; the distance moves an overhead Sun’s from ${pct(july)} in July to ${pct(january)} in January, ${stronger}% more`;
      },
    });
    // The January values, said beside their dots on tags that read over the curves: a view of the
    // state's daylight and its mirror.
    const tags = view(this, (st) => drawTags(st, axes, s.look.paper), { place: false });
    await s.enter(tags, {
      describe: () => {
        const st = now(),
          days = st.daylight!;
        return st.latitude !== 0
          ? `Beside the 15 January dots: ${st.place} ${hours(days[0]!)}, ${latitudeName(-st.latitude)} ${hours(st.mirror![0]!)}`
          : `${st.place} on 15 January, ${hours(days[0]!)}, and on 15 July, ${hours(days[6]!)}`;
      },
    });
  }
}
