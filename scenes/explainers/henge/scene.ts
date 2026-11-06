import { Scene, VMobject, Follow, SetState, Succession, view, linear } from '../../../src/index.ts';
import type { Group } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import type { StagedStep } from '../../../explain/index.ts';
import { depthOrder, seenPictures } from '../../../explain/drawing.ts';
import type { Seen, SeenPicture } from '../../../explain/drawing.ts';
import { stagedStep } from '../../../explain/index.ts';
import { henge, declination, sunset } from './model.ts';
import type { Street } from './model.ts';
import { dome, year, look, globes, crossedBy } from './sky.ts';
import { seasonsOf, drawStreet, annual, overhead, disc } from './picture.ts';
import type { SkyState, YearState, LookState, GlobeState, DayAt } from './sky.ts';
type Sunset = ReturnType<typeof henge>['seasons'][number];

const ANSWER = 'The street stays fixed while Earth’s tilt moves the sunset direction across it and back';

// The title, answer and check questions come from script.md's intent header.
export default class Henge extends Scene {
  static meta = {
    id: 'henge',
    sources: [
      'https://www.amnh.org/research/hayden-planetarium/manhattanhenge',
      'https://aa.usno.navy.mil/faq/alt_az',
      'https://github.com/liberfa/erfa/blob/v2.0.1/src/hd2ae.c',
      'https://www.nesdis.noaa.gov/about/k-12-education/understanding-our-planet/why-does-earth-have-seasons',
      'https://science.nasa.gov/image-article/apod-2014-july-6-manhattanhenge-a-new-york-city-sunset/',
    ],
    claims: [
      { says: 'faces the sunrise only on winter mornings', test: 'test/explain-henge.test.ts: Henge overhead view' },
      { says: 'of the circle is in sunlight', test: 'test/explain-henge.test.ts: Henge globes' },
      { says: 'goes round a circle about the celestial pole', test: 'test/explain-henge.test.ts: Henge dome: each day’s path' },
      { says: 'crossed on the way out and on the way back', test: 'test/explain-henge.test.ts: Henge dome and year are drawn in depth order' },
      { says: 'the street’s circle, the horizon', test: 'test/explain-henge.test.ts: Henge street view from the centre' },
    ],
  };
  static settings = [{ id: 'street', label: 'Street direction', default: 'manhattan', options: [
    { value: 'manhattan', label: 'Manhattan: 29° north of west' }, { value: 'west', label: 'Due west' },
  ] }];
  override async construct() {
    const m = henge(settingsOf(this).street as Street), manhattan = m.street === 'manhattan';
    const seasonNames = seasonsOf(m.street);
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
        state: { bearing: m.bearing, street: m.street }, draw: drawStreet }),
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

