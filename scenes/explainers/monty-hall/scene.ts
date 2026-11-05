import { Scene, Group, Rectangle, Text, Line, FadeIn, Transform, AnimationGroup, Succession, Machine, choreograph, view, matchByKey } from '../../../src/index.ts';
import type { ScheduledAnimation, Mobject, MatchKey, Choreography, Transition } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { monty, montyExample, threeDoorWorlds, threeDoorCells, oddsAfter, roundStart, roundNext, roundDoor, roundResult, ROUND_EVENTS } from '../lib/monty-hall.ts';
import type { Host, Opener, Round, RoundEvent } from '../lib/monty-hall.ts';
import { label, tile, stat, keyed } from '../lib/lesson-drawing.ts';

const pct = (n: number) => (n * 100).toFixed(1) + '%';
const door = (i: number) => 'ABC'[i]!;
const HOSTS: readonly Host[] = ['informed', 'random'];
const HOST: Record<Host, string> = { informed: 'Host who knows', random: 'Random host' };
type Cell = ReturnType<typeof threeDoorCells>[number];

// The strip: every round for the first pick, side by side, each as wide as its chance.
// Nearly the stage's width; every word on a strip step is F, so a phone's opening close-up
// still holds a whole strip with its labels at 12 px.
const X0 = -6.5,
  X1 = 6.5,
  H = 2.05,
  SIX = (X1 - X0) / 6,
  F = 0.6;
/** Strip centres: the host in play on top (rounds, odds), the second host under it (worlds). */
const SLOT: Record<Host, number> = { informed: 0.5, random: -2.475 };
/** A strip's name and readout sit this far above its centre; the column heads sit over the top strip. */
const NAME = H / 2 + 0.45,
  HEADS = 2.78;
/** The rounds step has the strip alone, so its picture is lowered to the middle of the stage. */
const ALONE = -1.45;

/**
 * Morphs pair parts by key: shapes by their place in the keyed part, a keyed word only with the
 * same word, and anything unkeyed by its place in the picture.
 */
const byKey: MatchKey = matchByKey({ text: 'whole', unkeyed: 'by-place' });
const left = (text: string, x: number, y: number, color: string, size: number, key: string) =>
  keyed(new Text(text, { fontSize: size, color }).moveTo([x, y], [-1, 0]), key);

/** What a round's cell says: the door he opens, what it shows, and which choice wins. */
const cellWords = (c: Cell) => [c.opened, c.shows, c.stay === 'ends' ? 'over' : c.stay === 'win' ? 'stay' : 'switch'];

/**
 * One host's strip of rounds at height y, keyed `strip:<as>`; `dim` greys the rounds the reader has ruled out.
 * Switching wins are tinted, rounds that show the car are drawn in the warning colour.
 */
function strip(s: Stage, cells: readonly Cell[], y: number, as: string, dim?: (c: Cell) => boolean): Group {
  let x = X0;
  const parts = cells.map((c) => {
    const w = c.sixths * SIX,
      cx = x + w / 2,
      off = dim?.(c) ?? false,
      car = c.shows === 'car',
      win = c.swap === 'win';
    x += w;
    const color = off ? s.soft : car ? s.bad : win ? s.emphasis : s.palette.ink;
    const [opens, shows, wins] = cellWords(c);
    return keyed(
      new Group(
        new Rectangle({
          width: w,
          height: H,
          fill: off ? s.palette.paper : car ? s.bad : win ? s.emphasis : s.palette.paper,
          fillOpacity: off ? 1 : car || win ? 0.14 : 1,
          stroke: off ? s.soft : s.palette.ink,
          // Once some rounds are ruled out, the ones left are outlined heavier.
          strokeWidth: off ? 0.02 : dim ? 0.06 : 0.03,
        }).moveTo([cx, y]),
        new Text(opens!, { fontSize: F, color }).moveTo([cx, y + 0.65]),
        new Text(shows!, { fontSize: F, color }).moveTo([cx, y]),
        new Text(wins!, { fontSize: F, color, weight: off ? 'normal' : 'bold' }).moveTo([cx, y - 0.65]),
      ),
      `${as}:${c.prize}${c.opened}`,
    );
  });
  return keyed(new Group(...parts), `strip:${as}`);
}
/** The car's three places, a third of the strip each: each head centred over its third, a rule under it spanning the third. */
const heads = (s: Stage, y: number) =>
  keyed(
    new Group(
      ...[0, 1, 2].flatMap((i) => {
        const a = X0 + i * 2 * SIX + 0.12,
          b = a + 2 * SIX - 0.24,
          r = y - 0.36;
        return [
          label(`Car behind ${door(i)}`, (a + b) / 2, y, s.soft, F),
          new Line([a, r], [b, r], { stroke: s.soft, strokeWidth: 0.025 }),
          new Line([a, r], [a, r + 0.14], { stroke: s.soft, strokeWidth: 0.025 }),
          new Line([b, r], [b, r + 0.14], { stroke: s.soft, strokeWidth: 0.025 }),
        ];
      }),
    ),
    'monty-heads',
  );
// Check 2: the car hidden behind A 40% of the time, B and C 30% each.
const PRIOR = [4, 3, 3];

export default class MontyHall extends Scene {
  static meta = {
    id: 'monty-hall',
    title: 'Why does the host’s rule change the odds of switching?',
    sources: ['https://mathigon.org/course/probability/monty-hall', 'https://doi.org/10.1080/00031305.1975.10479121'],
    // The script's answer and check questions (script.md); `worlds` states the answer.
    answer:
      'Switching wins 2 in 3 if the host knows where the car is and picks at random between two goats, but 1 in 2 if he opened a random door and showed a goat',
    // Sentences that reach past the strip on screen, and the test that holds each over every first pick.
    claims: [
      { says: 'The strip lays out every round for a pick of', shown: true as const },
      { says: 'is the only goat you didn’t pick', test: 'test/learning-models.test.ts: the host who knows always opens the only goat left' },
      { says: 'the host who knows always opens', test: 'test/learning-models.test.ts: the host who knows always opens the only goat left' },
      { says: 'in only one of them and opens the car in the other', test: 'test/learning-models.test.ts: the random host opens it in only half those rounds' },
      { says: 'had known where the car was and always shown a goat', test: 'test/learning-models.test.ts: the host who knows always opens the only goat left' },
    ],
    checks: [
      {
        question:
          'This host knows where the car is. When your first pick is right, he opens one of the two goats at random. When it is wrong, he tosses a coin: heads, he opens the car and the round ends; tails, he opens the other goat. You pick A and he opens B to a goat. How often does switching win, and which strip in the last step is his?',
        answer: `${pct(oddsAfter(0, 'coin', 'B').switchChance)}. His strip is the random host’s, cell for cell: with the car behind B or C, he opens each unchosen door half the time, so one of the two sixths in each wrong-pick third shows the car. He knows where the car is, but his rule gives each round the random host’s chance, and those chances set the odds.`,
      },
      {
        question:
          'The producers hide the car behind A 40% of the time and behind B or C 30% each. You pick A and the host opens B to a goat. How often does switching win with the host who knows, and with the random host?',
        answer: `With the host who knows, ${pct(oddsAfter(0, 'informed', 'B', PRIOR).switchChance)}: the car-behind-A rounds now fill 40% of the strip and he opens B in half of them, 20%, while all of the car-behind-C rounds, 30%, open B. With the random host, ${pct(oddsAfter(0, 'random', 'B', PRIOR).switchChance)}: he opens B in only half of the car-behind-C rounds, 15%, against the same 20%.`,
      },
    ],
  };
  static settings = [
    {
      id: 'host',
      label: 'Host rule',
      default: 'informed',
      options: [
        { value: 'informed', label: 'Knows where the car is; opens a goat at random' },
        { value: 'random', label: 'Opens a random unchosen door' },
      ],
    },
  ];
  override async construct() {
    const settings = settingsOf(this),
      host = settings.host as Host,
      other: Host = host === 'informed' ? 'random' : 'informed',
      // The first pick is A: picking B or C only relabels the doors.
      choice = 0,
      example = montyExample(choice, 'switch'),
      m = monty(3, host),
      informed = monty(3, 'informed'),
      random = monty(3, 'random'),
      worlds = threeDoorWorlds(choice, host),
      informedWorlds = threeDoorWorlds(choice, 'informed'),
      randomWorlds = threeDoorWorlds(choice, 'random'),
      cells = { informed: threeDoorCells(choice, 'informed'), random: threeDoorCells(choice, 'random') } as Record<Host, Cell[]>;
    const X = door(choice),
      B = door(example.opened),
      C = door(example.offered),
      others = [0, 1, 2].filter((i) => i !== choice).map(door);
    const seen = { informed: oddsAfter(choice, 'informed', B), random: oddsAfter(choice, 'random', B) } as Record<Opener, ReturnType<typeof oddsAfter>>;
    const s = stage(this, { style: 'github-light', headingSize: 0.6 });
    type Phase = 'choice' | 'predict' | 'rounds' | 'odds' | 'copy' | 'worlds';
    // The first strip shows every round; from the next on, only the rounds where he opened B to a goat count and the rest are greyed.
    const dim = (c: Cell) => c.opened !== B || c.shows === 'car';
    const KEY = 'Each cell: opens · shows · wins';
    let words: string[] = [];

    // The round, drawn from the machine's state: every part keyed, so a transition can move each.
    const DOOR_X = (i: number) => (i - 1) * 4.6,
      DOOR_Y = 0.95;
    const closedDoors = (r: Round) => [0, 1, 2].filter((i) => i !== r.opened);
    const roundWords = (r: Round) => {
      const yours = roundDoor(r),
        said = ['Doors A, B and C'];
      if (r.pick === null) said.push('none is picked yet; all three are closed');
      else {
        said.push(
          r.decision === 'switch'
            ? `you picked ${door(r.pick)} and switched to ${door(yours!)}`
            : r.decision === 'stay'
              ? `you picked ${door(r.pick)} and stayed`
              : `${door(r.pick)} is your pick`,
        );
        if (r.opened !== null) said.push(`${door(r.opened)} is open and shows ${r.shows === 'car' ? 'the car' : 'a goat'}`);
        const shown = r.car !== null && r.decision !== null;
        for (const i of closedDoors(r))
          if (shown) said.push(`${door(i)} shows ${i === r.car ? 'the car' : 'a goat'}`);
          else if (i !== r.pick) said.push(`${door(i)} is closed`);
      }
      return said.join('; ');
    };
    const doors = (r: Round, phase: 'choice' | 'predict') => {
      const yours = roundDoor(r),
        result = roundResult(r),
        revealed = r.car !== null && r.decision !== null;
      const P = r.pick === null ? '' : door(r.pick),
        O = r.opened === null ? '' : door(r.opened);
      const offered = r.pick === null || r.opened === null ? '' : door([0, 1, 2].find((i) => i !== r.pick && i !== r.opened)!);
      const said =
        r.pick === null
          ? 'Pick a door'
          : r.opened === null
            ? `You picked ${P}`
            : r.shows === 'car'
              ? `You picked ${P}; he opened ${O}: the car`
              : r.decision === 'stay'
                ? `You picked ${P}; he opened ${O}; you stay with ${P}`
                : r.decision === 'switch'
                  ? `You picked ${P}; he opened ${O}; you switch to ${offered}`
                  : `You picked ${P}; he opened ${O}; ${offered} is offered`;
      const rule =
        r.host === 'informed'
          ? 'Knows where the car is; opens a goat at random'
          : r.shows === null
            ? 'Opens a random door'
            : `Opens a random door; this time ${r.shows === 'car' ? 'the car' : 'a goat'}`;
      const closed = closedDoors(r).map(door);
      const outcome =
        phase === 'predict'
          ? 'Predict: stay or switch?'
          : result === 'over'
            ? `The round is over: the car was behind ${O}.`
            : result
              ? `The car is behind ${door(r.car!)}: ${r.decision === 'switch' ? 'switching' : 'staying'} ${result === 'win' ? 'wins' : 'loses'}.`
              : `The car is behind ${closed.slice(0, -1).join(', ')} or ${closed.at(-1)}.`;
      words = [roundWords(r)];
      return new Group(
        ...[0, 1, 2].flatMap((i) => [
          label(door(i), DOOR_X(i), 2.7, s.soft, 0.64, `monty-letter-${i}`),
          tile(i === r.opened ? r.shows! : revealed ? (i === r.car ? 'car' : 'goat') : '?', DOOR_X(i), DOOR_Y, 3.5, 2.5, s, {
            active: i === yours,
            bad: i === r.opened && r.shows === 'car',
            size: 0.8,
            key: `door-${i}`,
          }),
        ]),
        label(said, 0, -1.25, s.palette.ink, 0.62, 'monty-said'),
        // The size of the lines around it: a phone's close-up is set by the line that changes, the result.
        label(rule, 0, -2.45, s.soft, 0.62, 'monty-rule'),
        label(outcome, 0, -3.65, s.palette.ink, 0.62, 'monty-result'),
      );
    };
    /** Switching's chance for a host, right of his name: over every round, or (as) over the rounds left after the seen goat. */
    const readout = (h: Host, y: number, chance: number, key: string) =>
      keyed(new Text(`switch wins ${pct(chance)}`, { fontSize: F, color: s.palette.ink }).moveTo([X1, y], [1, 0]), key);
    const titleOf = (h: Host, y: number) => left(HOST[h], X0, y, h === host ? s.emphasis : s.palette.ink, F, `monty-name-${h}`);
    const describeStrip = (h: Host, list: readonly Cell[], dim: (c: Cell) => boolean = () => false) =>
      `${HOST[h]}: ` +
      list.map((c) => `car behind ${c.prize}, he opens ${c.opened}: ${c.shows}, ${c.stay === 'ends' ? 'game over' : c.stay === 'win' ? 'staying wins' : 'switching wins'}, ${c.sixths} sixth${c.sixths > 1 ? 's' : ''}${dim(c) ? ' (greyed)' : ''}`).join('; ');
    const cellKey = (y: number) => label(KEY, 0, y, s.soft, F, 'monty-key');

    /**
     * The picture for a phase: the round (the model) while the doors show, else a function of what is
     * shown alone, so the trace's view check and rayner check can redraw it.
     */
    const picture = (phase: Phase, round: Round): Group => {
      switch (phase) {
        case 'choice':
        case 'predict':
          return doors(round, phase);
        case 'rounds':
        case 'odds': {
          // The key sits under the strip it explains; in odds the two figures take the stage's lower part, clear of it.
          const dy = phase === 'rounds' ? ALONE : 0,
            y = SLOT.informed + dy,
            ruled = phase === 'odds' ? dim : undefined;
          words = [describeStrip(host, cells[host], ruled), KEY];
          return new Group(
            heads(s, HEADS + dy),
            titleOf(host, y + NAME),
            strip(s, cells[host], y, host, ruled),
            cellKey(y - NAME),
            ...(phase === 'odds'
              ? [
                  stat(s, 'Stay', pct(seen[host].stayChance), -3.25, -2.85, 'monty-stay'),
                  stat(s, 'Switch', pct(seen[host].switchChance), 3.25, -2.85, 'monty-switch'),
                ]
              : []),
          );
        }
        case 'copy':
        case 'worlds': {
          // Copy: the other host's strip starts as a copy of this host's, then takes its own rounds.
          const list = (h: Host) => (phase === 'copy' && h === other ? cells[host] : cells[h]);
          words = [...HOSTS.map((h) => describeStrip(h, list(h), dim)), KEY];
          return new Group(
            heads(s, HEADS),
            ...HOSTS.flatMap((h) => [
              titleOf(h, SLOT[h] + NAME),
              ...(phase === 'worlds' ? [readout(h, SLOT[h] + NAME, seen[h].switchChance, `monty-readout-${h}`)] : []),
              strip(s, list(h), SLOT[h], h, dim),
            ]),
            cellKey(SLOT.random - NAME),
          );
        }
      }
    };
    // Before the first step the picture is the choice, with no door picked yet.
    // Which picture is shown (`shown.phase`) is not part of the model: the round, the host and the odds are.
    const start = roundStart(host);
    const roundOf = (st: object) => ('pick' in st ? (st as unknown as Round) : start);
    const main = view(this, (st, sh) => keyed(picture((sh as { phase?: Phase }).phase ?? 'choice', roundOf(st)), 'monty-picture'), {
      place: false,
    });
    const shown = (next: Phase) => { this.shown = { phase: next }; };
    const describe = { describe: () => words.join('. ') };
    // What the round marks, as emphasis the phone's close-ups visit first and
    // review holds to the caption: your door, and the door the host opened, while the round plays (the
    // prediction asks about the same doors; its caption is the question, so it marks nothing new). Read from state.
    s.emphasise(() => {
      const phase = (this.shown as { phase?: Phase }).phase;
      if (phase !== 'choice') return [];
      const r = roundOf(this.state), out: [Mobject, string][] = [];
      const at = (i: number | null, what: string) => { const m = i === null ? undefined : main.current.find(`door-${i}`); if (m) out.push([m, what]); };
      at(roundDoor(r), `your door: ${door(roundDoor(r) ?? 0)}`);
      at(r.opened, `opened: ${door(r.opened ?? 0)}, ${r.shows}`);
      return out;
    });
    const fresh = async (next: Phase) => {
      await s.clear({ runTime: 0.3 });
      shown(next);
      main.rebuild();
      s.keep(main, describe);
      await this.play(new FadeIn(main, { runTime: 0.5 }));
    };
    const morph = async (next: Phase, runTime = 1.1) => {
      shown(next);
      await this.play(main.sync({ match: byKey, runTime }));
    };
    const at = (id: Phase, state: Record<string, unknown>) => {
      this.state = JSON.parse(JSON.stringify(state));
      shown(id);
    };

    // One round a reader could play: each event is one move, refused when the rules forbid it, so
    // exploration walks every legal round. The host's door opening, the switch and the reveal are authored.
    /** A line whose words changed crossfades; one that did not stays still. */
    const crossfade = (c: Choreography, keys: readonly string[], runTime: number): ScheduledAnimation[] =>
      keys.flatMap((key) => ((c.from(key) as Text).text === (c.to(key) as Text).text ? [] : [c.leave(key, { runTime }), c.enter(key, {}, { runTime })]));
    const LINES = ['monty-said', 'monty-rule', 'monty-result'];
    /** A door folded to its hinge line: what a door looks like edge on. */
    const edgeOn = (m: Mobject) => m.copy().stretch(0.04, 0);
    /** A door turns to its edge as it fades, and turns back showing what is behind it. */
    const swing = (c: Choreography, i: number): ScheduledAnimation => {
      const key = `door-${i}`,
        shut = c.from(key);
      const fold = new Transform(shut, edgeOn(shut).setOpacity(0), { runTime: 0.35 });
      const gone = c.leave(key, { runTime: 0.02 });
      const open = c.insert(key, edgeOn(c.to(key)));
      return new Succession([fold, gone, new Transform(open, c.to(key), { runTime: 0.4 })]);
    };
    const together = (anims: ScheduledAnimation[]) => new AnimationGroup(anims);
    const machine = new Machine<Round, RoundEvent>(this, {
      start,
      events: ROUND_EVENTS,
      next: roundNext,
      views: [main],
      runTime: ({ event }) => (event.startsWith('open') || event.startsWith('car') ? 1.22 : event === 'switch' ? 1.66 : 0.6),
      transition: Object.fromEntries(
        ROUND_EVENTS.flatMap((event): [RoundEvent, (t: Transition<Round, RoundEvent>) => ScheduledAnimation][] => {
          // The host opens his door: it swings round to show a goat (or, for a random host, the car), then the lines say so.
          if (event.startsWith('open'))
            return [[event, (t) => {
              const { after } = t, c = t.choreograph(main);
              return new Succession([swing(c, after.opened!), together([...crossfade(c, LINES, 0.45), c.rest({ runTime: 0.45 })])]);
            }]];
          // The car is shown: both closed doors swing open together.
          if (event.startsWith('car'))
            return [[event, (t) => {
              const { after } = t, c = t.choreograph(main);
              return new Succession([together(closedDoors(after).map((i) => swing(c, i))), together([...crossfade(c, LINES, 0.45), c.rest({ runTime: 0.45 })])]);
            }]];
          // Switching: your door's outline lifts off it, passes over the open door, and settles on the one he offered.
          if (event === 'switch')
            return [[event, (t) => {
              const { before, after } = t, c = t.choreograph(main);
              const from = roundDoor(before)!,
                to = roundDoor(after)!;
              const outline = c.from(`door-${from}`).children[0]!;
              const at = (i: number, lift: number) => outline.copy().moveTo([DOOR_X(i), DOOR_Y + lift]);
              const yours = c.insert('monty-yours', outline);
              return new Succession([
                new Transform(yours, at(from, 0), { runTime: 0.01 }),
                together([new Transform(yours, at(from, 0.45), { runTime: 0.25 }), c.morph(`door-${from}`, { runTime: 0.25 })]),
                new Transform(yours, at(to, 0.45), { runTime: 0.6 }),
                new Transform(yours, at(to, 0), { runTime: 0.25 }),
                together([c.morph(`door-${to}`, { runTime: 0.1 }), c.leave('monty-yours', { runTime: 0.1 })]),
                together([...crossfade(c, LINES, 0.45), c.rest({ runTime: 0.45 })]),
              ]);
            }]];
          return [];
        }),
      ),
    });

    await this.step('choice', {
      title: `You pick ${X}; the host opens ${B}: a goat`,
      line: 'Should you switch? That depends on what the host knew and how he chose which door to open.',
      caption:
        host === 'informed'
          ? `A car is behind one of three doors, and goats are behind the other two. You pick ${X}. The host knows where the car is; he opens ${B}, shows a goat, and offers you ${C}. With two doors still closed, the odds look even.`
          : `A car is behind one of three doors, and goats are behind the other two. You pick ${X}. The host doesn’t know where the car is; he opened ${B} at random and happened to reveal a goat. Had he opened the car, the round would be over. He offers you ${C}. With two doors still closed, the odds look even.`,
    });
    shown('choice');
    this.state = { ...start };
    main.rebuild();
    s.keep(main, describe);
    await this.play(new FadeIn(main, { runTime: 0.6 }));
    // The round is played: you pick, and the host opens a door.
    await this.play(machine.replay([`pick ${X}`, `open ${B}: goat`] as RoundEvent[]));

    await this.step('predict', {
      title: `Stay with ${X}, or switch to ${C}?`,
      line: 'Predict: does it matter what the host knew and how he picked a door?',
      caption:
        host === 'informed'
          ? 'Two doors are closed and you have seen a goat. Would switching win more often than staying? And would your answer change if the host had opened a door at random and happened to show a goat?'
          : 'Two doors are closed and you have seen a goat. Would switching win more often than staying? And would your answer change if the host had known where the car was and always shown a goat?',
    });
    // The same round, unchanged: only the question under it is new.
    await morph('predict', 0.5);

    await this.step('rounds', {
      title: `Which of these rounds could open ${B} to a goat?`,
      line: 'Each cell is one way the round can go, drawn as wide as its chance.',
      caption:
        host === 'informed'
          ? `The strip lays out every round for a pick of ${X}, each as wide as its chance. The car is behind each door a third of the time. When it is behind ${X}, both other doors hide goats and he tosses a coin between ${others.join(' and ')}, a sixth each. When it is behind ${C}, ${B} is the only goat you didn’t pick, so he opens it in that whole third; when it is behind ${B}, he has to open ${C}. You saw ${B} open to a goat. Find the cells that match and add up their widths before going on.`
          : `The strip lays out every round for a pick of ${X}, each as wide as its chance. The car is behind each door a third of the time, and wherever it is he tosses a coin between ${others.join(' and ')}, so each round is a sixth. In two of those rounds the door he opens hides the car and the game is over. You saw ${B} open to a goat. Find the cells that match and add up their widths before going on.`,
    });
    await fresh('rounds');
    at('rounds', { odds: m, cells: cells[host] });

    await this.step('odds', {
      title: host === 'informed' ? `When the host who knows opens ${B}, switching wins 2 in 3` : `When a random host opens ${B} to a goat, switching wins 1 in 2`,
      line:
        host === 'informed'
          ? `With the car behind ${C}, he must open ${B}; with it behind ${X}, he opens ${B} half the time.`
          : `Wherever the car is, he opens ${B} half the time, so ${X} and ${C} keep equal shares.`,
      caption:
        host === 'informed'
          ? `Two cells open ${B} to a goat, so the rest are greyed. In one, worth a sixth, the car is behind ${X} and his coin happened to pick ${B}. In the other, worth two sixths, the car is behind ${C} and ${B} was the one goat he could open. Of the ${seen.informed.sixths} sixths left, switching wins ${seen.informed.swapSixths}: ${pct(seen.informed.switchChance)}. Two doors are still closed, and they are not equally likely.`
          : `Two cells open ${B} to a goat, so the rest are greyed, including the round where ${B} hid the car. In one, the car is behind ${X}; in the other, it is behind ${C}. Each is a sixth, because he tossed a coin in both thirds and nothing forced his hand. Of the ${seen.random.sixths} sixths left, staying and switching win ${pct(seen.random.switchChance)} each.`,
    });
    await morph('odds', 0.9);
    at('odds', { odds: m, cells: cells[host], opened: B, seen: seen[host] });

    await this.step('worlds', {
      title: `One goat behind ${B}, two hosts: switching wins 2 in 3 or 1 in 2`,
      line: `With the car behind ${C}, the host who knows always opens ${B}; the random host opens it half the time.`,
      caption: `Switching wins 2 in 3 if the host knows where the car is and picks at random between two goats, but 1 in 2 if he opened a random door and showed a goat. With the car behind ${X}, either host opens ${B} in one sixth, and staying wins it. With the car behind ${C}, the host who knows must open ${B}, which gives switching two sixths; the random host opens ${B} in only one of them and opens the car in the other. In both strips, the rounds left are those that match what you saw: ${B} opened to a goat. The goat is the same evidence in both, but the host who knows produces it twice as often when the car is behind ${C}.`,
    });
    await morph('copy', 0.8);
    await morph('worlds', 1.3);
    at('worlds', {
      choice,
      host,
      worlds,
      odds: m,
      informedWorlds,
      randomWorlds,
      cells,
      opened: B,
      seen: { informed: seen.informed, random: seen.random },
      informed,
      random,
    });
  }
}
