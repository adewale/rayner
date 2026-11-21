import { Scene, VMobject, linear } from '../../../src/index.ts';
import { depthOrder, seenPictures } from '../../../explain/geo.ts';
import type { Vec } from '../../../src/index.ts';
import { settingsOf, stage, answerOf, view, having } from '../../../explain/index.ts';
import type { ExplainerMeta } from '../../../explain/index.ts';
import { henge, declination, sunset, clock, dayName, REFRACTION, PLACES, OTHER } from './model.ts';
import type { Seen } from './model.ts';
import { dome, year, look, globes, crossedBy } from './sky.ts';
import { annual, overhead, offWest, offEast } from './picture.ts';
import { streetView, halfAndFull, globe } from './place.ts';
import type { Disc, StreetState } from './place.ts';
import type { YearState, LookState, DayAt } from './sky.ts';

/** The year's turn, then the camera's descent: each a view of its own state. */
type HengeState = YearState | LookState;

export default class Henge extends Scene {
  private readonly year = henge(settingsOf(this, Henge).place);
  private readonly winter: YearState = { bearing: this.year.bearing, latitude: this.year.latitude, start: -90, longitude: -90, crossings: this.year.ideal };
  override state: HengeState = { ...this.winter };

  static meta = {
    sources: [
      'https://www.amnh.org/research/hayden-planetarium/manhattanhenge',
      'https://www.nyctourism.com/articles/where-to-see-manhattanhenge-in-nyc/',
      'https://www.6sqft.com/manhattanhenge-sunset-nyc-2025/',
      'https://www.nbcchicago.com/news/local/here-are-the-best-times-and-places-to-see-chicagohenge/2946913/',
      'https://en.wikipedia.org/wiki/Manhattanhenge',
      'https://en.wikipedia.org/wiki/Commissioners%27_Plan_of_1811',
      'https://www.openstreetmap.org/node/6997311896',
      'https://www.openstreetmap.org/node/42430673',
      'https://www.openstreetmap.org/node/10838732050',
      'https://www.openstreetmap.org/node/258955481',
      'https://rhodesmill.org/skyfield/',
      'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp',
      'https://geographiclib.sourceforge.io/',
      'https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2',
      'https://aa.usno.navy.mil/faq/alt_az',
      'https://aa.usno.navy.mil/faq/RST_defs',
      'https://github.com/liberfa/erfa/blob/v2.0.1/src/hd2ae.c',
      'https://www.nesdis.noaa.gov/about/k-12-education/understanding-our-planet/why-does-earth-have-seasons',
    ],
    claims: [
      { says: 'faces the sunrise only on winter mornings', test: 'model.test.ts: Henge overhead view' },
      { says: 'of the circle is in sunlight', test: 'scene.test.ts: Henge globes' },
      { says: 'goes round a circle about the celestial pole', test: 'model.test.ts: Henge dome: each day’s path' },
      { says: 'crossed on the way out and on the way back', test: 'scene.test.ts: Henge dome and year are drawn in depth order' },
      { says: 'the street’s circle, the horizon', test: 'scene.test.ts: Henge street view from the centre' },
      { says: 'it sets toward that point', test: 'model.test.ts: Henge globe: the Sun sets toward the place it stands overhead' },
      { says: 'nearer the solstice', test: 'model.test.ts: Henge Hayden Planetarium cross-check' },
      { says: 'Every evening of 2026 as a chart', test: 'model.test.ts: Henge half Sun and full Sun on every evening of 2026' },
    ],
  } satisfies ExplainerMeta;
  static settings = [{ id: 'place', label: 'Place', default: 'manhattan', options: [
    { value: 'manhattan', label: 'Manhattan: 42nd Street, 29° north of west' }, { value: 'chicago', label: 'Chicago: Randolph Street, due west' },
  ] }] as const;
  override async construct() {
    const answer = answerOf(this);
    const m = this.year, where = m.where, manhattan = m.place === 'manhattan';
    const other = PLACES[OTHER[m.place]];
    const [december, , june] = m.seasons;
    const day = ({ latitude, declination, hourAngle }: { latitude: number; declination: number; hourAngle: number }) => ({ latitude, declination, hourAngle });
    const percent = (d: { hourAngle: number }) => `${Math.round((d.hourAngle / 180) * 100)}%`;
    const when = (e: Seen & { date: string }) => `${clock(m.place, e.utc)} on ${dayName(e.date)}`;
    const month = (date: string) => dayName(date).split(' ')[1]!;
    const disc = (key: string, e: Seen & { date: string; kind?: string }, name = dayName(e.date)): Disc =>
      ({ key, name, azimuth: e.azimuth, altitude: e.altitude + REFRACTION, semidiameter: e.semidiameter });
    const ev = Object.fromEntries(m.evenings.map((e) => [e.role, e])) as Record<'before' | 'aligned' | 'next' | 'after' | 'other', (typeof m.evenings)[number]>;
    const off = (e: Seen) => e.azimuth - m.bearing;
    const aside = (e: Seen) => `${Math.abs(off(e)).toFixed(1)}° ${off(e) < 0 ? 'left' : 'right'}`;
    const [firstHalf, secondHalf] = m.aligned.half, [firstFull, secondFull] = m.aligned.full;
    const slot = (2 * Math.atan(15.25 / where.metres) * 180) / Math.PI;
    const view1: StreetState = { bearing: m.bearing, metres: where.metres, suns: [disc('aligned', firstHalf!)] };
    const before = [
      { id: 'street', title: 'Why does the Sun line up on so few evenings?', line: 'Predict: will the low Sun line up again tomorrow?',
        caption: `Stand on ${where.name} and look west down ${where.street}. At ${when(firstHalf!)} 2026 the setting Sun sat half above the horizon in the slot between the buildings, drawn true size. ${manhattan ? 'The Hayden Planetarium calls this Manhattanhenge' : 'Chicago calls this Chicagohenge'}. The street points the same way all year, so what changes must be where the Sun sets.`,
        state: { ...view1, legend: `Half Sun, ${dayName(firstHalf!.date)} 2026, ${clock(m.place, firstHalf!.utc)} ${where.zone}` }, draw: streetView,
        opening: ['henge-view-window:0', 'henge-view-name:aligned', 'henge-view-legend'], describe: (st: StreetState) => seenDown(st) },
      { id: 'evenings', title: 'A week either side, the Sun sets behind the buildings', line: 'Half Sun on four evenings of 2026, true size, seen from one spot.',
        caption: `${answer}. The next evening, ${dayName(ev.next.date)}, half Sun stood ${Math.abs(off(ev.next) - off(ev.aligned)).toFixed(2)}° farther ${off(ev.next) > off(ev.aligned) ? 'right' : 'left'}, partly out of a slot ${slot.toFixed(2)}° wide. A week before, it set ${aside(ev.before)}; a week after, ${aside(ev.after)}: behind the buildings, dashed. On ${dayName(ev.other.date)}, when ${other.street} in ${other.city} lines up, it set ${aside(ev.other)}.`,
        state: { bearing: m.bearing, metres: where.metres, suns: (['before', 'aligned', 'next', 'after'] as const).map((r) => disc(r, ev[r])),
          aside: { name: dayName(ev.other.date), azimuth: ev.other.azimuth }, legend: 'Half Sun, true size. Dashed: behind the buildings' }, draw: streetView,
        opening: ['henge-view-window:0', 'henge-view-name:before', 'henge-view-name:aligned', 'henge-view-name:next', 'henge-view-name:after', 'henge-view-aside', 'henge-view-legend'], describe: (st: StreetState) => seenDown(st) },
      { id: 'overhead',
        title: `From above: sunset lines up with ${where.street}${manhattan ? ', sunrise does not' : ', and so does sunrise'}`,
        line: 'North is up; the grid is schematic. Gold arrows: the Sun at sunset and sunrise on an alignment day.',
        caption: manhattan
          ? `From above, ${where.street} points ${offWest(m.bearing)}, measured between two OpenStreetMap points ${(where.metres / 1000).toFixed(1)} km apart, and the same angle south of east at the other end. On an alignment evening the setting Sun lies on that line. That morning it rose ${(90 - m.alignment.sunrise).toFixed(1)}° north of east, ${(m.alignment.back - m.alignment.sunrise).toFixed(1)}° from the street’s other end, which faces the sunrise only on winter mornings around the December solstice.`
          : `From above, ${where.street} points ${offWest(m.bearing)}, measured between two OpenStreetMap points ${(where.metres / 1000).toFixed(1)} km apart: Chicago’s grid runs east–west. Its other end points ${offEast(m.alignment.back)}. On an alignment evening, near an equinox, the setting Sun lies on that line, and that morning it rose up the street’s other end, within ${Math.abs(m.alignment.back - m.alignment.sunrise).toFixed(1)}°. Both ends line up on nearly the same days.`,
        state: { alignment: m.alignment, backCrossings: m.backCrossings, bearing: m.bearing }, draw: overhead },
      { id: 'globe', title: 'The Sun sets toward the place where it stands overhead', line: 'Earth from space: the place, its street carried on, and where the Sun is overhead.',
        caption: `At any moment the Sun stands overhead at one point on Earth, and from ${where.city} it sets toward that point once the point is a quarter of the way round the globe away. At ${when(firstHalf!)} it was overhead at ${Math.abs(firstHalf!.overhead.lat).toFixed(1)}° ${firstHalf!.overhead.lat >= 0 ? 'N' : 'S'}, over the Pacific, where ${where.street}, carried on along the ground, meets that ring. Through the year the point slides between the tropics, crossing the street’s line twice.`,
        state: { name: where.city, latitude: m.latitude, longitude: where.longitude, bearing: m.bearing, meets: m.meets,
          suns: [{ key: 'aligned', name: dayName(firstHalf!.date), ...firstHalf!.overhead }, { key: 'other', name: dayName(ev.other.date), ...ev.other.overhead }] }, draw: globe,
        opening: ['henge-globe:seen', 'henge-globe-here', 'henge-globe-sun:aligned', 'henge-globe-sun:other', 'henge-globe-key'],
        describe: (st: { name: string; meets: { lat: number }; suns: readonly { name: string; lat: number; lon: number }[] }) =>
          `Earth from space, with ${st.name} on it. A red line carries the street on along the ground to a gold ring a quarter of the way round the globe, meeting it at ${Math.abs(st.meets.lat).toFixed(1)}° ${st.meets.lat >= 0 ? 'north' : 'south'}. The Sun stands overhead on that ring at half Sun: ${st.suns.map((d) => `on ${d.name} at ${Math.abs(d.lat).toFixed(1)}° ${d.lat >= 0 ? 'north' : 'south'}`).join(', ')}.` },
      { id: 'sky', title: `June’s Sun sets ${offWest(june!.azimuth)}, December’s ${offWest(december!.azimuth).replace(' of west', '')}`,
        line: `Red: the street’s arc, rising from the horizon where the street points, ${offWest(m.bearing)}.`,
        caption: `${where.city}’s sky as a dome, seen from outside, west of it. Each day the Sun’s centre goes round a circle about the celestial pole; the bold arc is its day, ending at a flat horizon. June’s circle lies more above the horizon and ends ${offWest(june!.azimuth)}, ${manhattan ? `${(june!.azimuth - m.bearing).toFixed(1)}° beyond the street` : 'far north of the street'}. December’s shorter path ends ${offWest(december!.azimuth)}${manhattan ? ', far short of it' : ', and the equinox path ends on the street'}. The circle shifts because Earth’s axis is tilted.`,
        state: { bearing: m.bearing, latitude: m.latitude, city: where.city, days: m.seasons.map(({ latitude, declination, azimuth, hourAngle }) => ({ latitude, declination, hourAngle, azimuth })) }, draw: dome },
    ] as const;
    const crossingsStep = [
      { id: 'crossings', title: `Across the street in ${month(firstHalf!.date)}, back across it in ${month(secondHalf!.date)}`, line: 'Change the place: the street turns, and the crossings move.',
        caption: `Every evening of 2026 as a chart: across, January to December; up, how far north along the horizon the half Sun sets, from the ephemeris. The line labelled ${where.street} stays at its bearing. The curve crosses it on ${dayName(firstHalf!.date)} and ${dayName(secondHalf!.date)}. ${manhattan ? 'Chicago’s Randolph Street points due west, so the same curve crosses it in March and September.' : 'Manhattan’s 42nd Street points 29° north of west, so the same curve crosses it in May and July.'} The place changes the direction we wait for, not Earth’s motion.`,
        state: { bearing: m.bearing, street: where.street, year: m.year, crossings: [firstHalf!, secondHalf!].map((e) => ({ date: e.date, name: dayName(e.date) })) }, draw: annual },
    ] as const;
    const details = [
      { id: 'tilt', kind: 'detail', title: 'One axis direction, opposite sides of the Sun', line: 'Why the Sun’s daily circle shifts: Earth’s tilt, seen from beside its orbit.',
        caption: `Earth’s axis keeps nearly the same direction through the year. In June the north leans sunward; in December it leans away. The red dot is ${where.city} at noon, on the circle Earth’s daily turn carries it round: gold where that circle is in sunlight, dark where it is in night. In June ${percent(june!)} of the circle is in sunlight, in December ${percent(december!)}. Sizes and distances here are schematic.`,
        state: { latitude: m.latitude, tilt: m.tilt, city: where.city, june: day(june!), december: day(december!) }, draw: globes },
    ] as const;
    const after = [
      { id: 'disc', kind: 'detail', title: 'Half Sun and full Sun: two moments, one slot', line: 'True size, a degree either side of the street.',
        caption: `Half Sun puts the Sun’s centre on the flat horizon; full Sun puts its lower edge there. Down one street that needs a Sun a little farther north, so in ${month(firstHalf!.date)} full Sun comes later: half on ${dayName(firstHalf!.date)} at ${clock(m.place, firstHalf!.utc)}, full on ${dayName(firstFull!.date)} at ${clock(m.place, firstFull!.utc)}. ${secondFull!.date < secondHalf!.date ? `In ${month(secondHalf!.date)} the order reverses.` : `In ${month(secondHalf!.date)} both fall on ${dayName(secondHalf!.date)}.`}${manhattan ? ' The Hayden Planetarium publishes 28 and 29 May, 11 and 12 July, nearer the solstice, as a horizon raised above this flat one gives.' : ''}`,
        state: { bearing: m.bearing, metres: where.metres, zone: where.zone,
          half: { ...disc('half', firstHalf!), date: dayName(firstHalf!.date), clock: clock(m.place, firstHalf!.utc) },
          full: { ...disc('full', firstFull!), date: dayName(firstFull!.date), clock: clock(m.place, firstFull!.utc) } },
        draw: halfAndFull, opening: ['henge-close-window:0', 'henge-close-window:1', 'henge-close-words:0', 'henge-close-words:1'],
        describe: (st: { half: { date: string; clock: string }; full: { date: string; clock: string } }) =>
          `Two close views down the street at true size. Left: half Sun on ${st.half.date} at ${st.half.clock}, its centre on the horizon in the slot between the buildings. Right: full Sun on ${st.full.date} at ${st.full.clock}, its lower edge on the horizon.` },
    ] as const;

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

    // The year as a turn of state: the view tweened over the orbital longitude, from the December
    // solstice round to the next, redraws the day's circle from the model at every frame.
    const dayAt: DayAt = (longitude) => { const d = sunset(m.latitude, declination(longitude)); return { latitude: m.latitude, declination: d.declination, hourAngle: d.hourAngle, azimuth: d.azimuth }; };
    const start = this.winter;
    await this.step('sweep', {
      title: 'Follow the sunset through a year', line: 'Predict: how many times will the sunset cross the street?',
      // The idealised model's crossings of the street's bearing in one year.
      predict: { options: ['Once', 'Twice', 'Four times'], answer: ['Once', 'Twice', 'Four times'][[1, 2, 4].indexOf(m.ideal.length)]! },
      caption: `Now let a year run, from the December solstice to the next. The Sun’s daily circle slides north, and its sunset, the gold band along the horizon, travels north with it. ${manhattan ? 'It passes the street, turns back in June, and passes it again.' : 'It reaches the street near the March equinox, turns back in June, and reaches it again near the September equinox.'} One fixed direction, crossed on the way out and on the way back. These circles come from an idealised circular orbit.`,
    });
    await s.clear({ runTime: 0.18 });
    this.state = { ...start };
    const sweep = view(this, (st, _shown, drawing) => year(having(st, 'longitude'), dayAt, drawing), { drawing: s.drawing, place: false });
    s.opening(sweep);
    await s.enter(sweep, { runTime: 0.24, describe: () => yearWords(having(this.state, 'longitude'), dayAt) });
    await this.play(sweep.tween((t) => ({ ...start, longitude: start.longitude + (270 - start.longitude) * t }), { runTime: 9, rateFunc: linear }));

    await s.steps(crossingsStep);
    await s.steps(details);

    // One camera move from sky to street: the eye at the sphere's centre, in the middle of the
    // street, looks up and lowers its gaze along the street's circle to the horizon, while the
    // lens narrows. The view tweened over the viewpoint's pitch; every frame is the picture of its value.
    const alignment = dayAt(m.ideal[0]!);
    const UP = { pitch: 78, scale: 2.4 }, DOWN = { pitch: 3, scale: 6.5 };
    const eye = (t: number): LookState => ({ bearing: m.bearing, pitch: UP.pitch + (DOWN.pitch - UP.pitch) * t, scale: UP.scale * (DOWN.scale / UP.scale) ** t, day: day(alignment) });
    const names = { day: month(firstHalf!.date) };
    await this.step('look', {
      kind: 'detail',
      title: 'From the sky to the street: bearing and height in one view', line: 'Stand at the dome’s centre and lower your eyes along the street.',
      caption: `Stand in the street, at the dome’s centre, and lower your eyes along the street’s circle to the horizon: the street views earlier are this view, narrowed. From the centre, the street’s circle, the horizon and the buildings’ edges stay straight, as a camera sees them. Left and right say whether the Sun is centred between the buildings; up and down say how much of its disc is above the horizon. The buildings and disc here are schematic.`,
    });
    await s.clear({ runTime: 0.18 });
    this.state = { ...eye(0) };
    const streetLook = view(this, (st, _shown, drawing) => look(having(st, 'pitch'), drawing.look.paper, names, drawing), { drawing: s.drawing, place: false });
    // The phone opens on the camera's window and its legend; the sky's lines run on past the window, under the paper.
    s.opening(...streetLook.current.family().filter((part) => ['henge-look-window', 'henge-look-legend', 'henge-look-sides', 'henge-look-sun'].includes(part.key ?? '')));
    await s.enter(streetLook, { runTime: 0.24, describe: () => lookWords(having(this.state, 'pitch'), names) });
    await this.play(streetLook.tween((t) => ({ ...eye(t) }), { runTime: 5 }));

    await s.steps(after);
  }
}

/** A street view in words: where each Sun sets against the street's line. */
function seenDown(st: StreetState): string {
  const side = (az: number, digits = 2) => { const off = az - st.bearing; return `${Math.abs(off).toFixed(digits)}° ${off < 0 ? 'left' : 'right'} of the street’s line`; };
  return `Looking down the street, five degrees either side, between two walls of buildings: ${st.suns.map((d) => `the half Sun on ${d.name}, ${side(d.azimuth)}`).join('; ')}.${st.aside ? ` Off to the side: ${st.aside.name}, ${side(st.aside.azimuth, 1)}.` : ''}`;
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
    const meta = g.seenPicture;
    if (meta.viewpoint.kind !== 'gnomonic') continue;
    for (const piece of g.children) {
      if (!/^henge-(look:street|look:horizon|view:horizon|close:\d:horizon)$/.test(piece.key ?? '') || !(piece instanceof VMobject)) continue;
      if (piece.seen.lines.flat().length < 3) continue;
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
