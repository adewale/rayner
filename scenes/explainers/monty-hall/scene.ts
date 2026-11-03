import { Scene, Group, Rectangle, Text, FadeIn, view } from '../../../src/index.ts';
import type { Mobject, MatchKey } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { monty, montyExample, threeDoorWorlds, threeDoorCells, oddsAfter } from '../lib/monty-hall.ts';
import type { Host, Opener } from '../lib/monty-hall.ts';
import { label, tile, stat } from '../lib/lesson-drawing.ts';

const pct = (n: number) => (n * 100).toFixed(1) + '%';
const door = (i: number) => 'ABC'[i]!;
const HOSTS: readonly Host[] = ['informed', 'random'];
const NAME: Record<Host, string> = { informed: 'Host who knows', random: 'Random host' };
type Cell = ReturnType<typeof threeDoorCells>[number];

// The strip: every round for the first pick, side by side, each as wide as its chance.
// Narrow enough that a phone's opening close-up holds a whole strip.
const X0 = -5,
  X1 = 5,
  H = 1.7,
  SIX = (X1 - X0) / 6;
const SLOT: Record<Host, number> = { informed: 0.92, random: -1.35 };

/** Morphs pair parts by key: glyphs by their text and place in it, shapes by their place in the keyed part. */
const byKey: MatchKey = (p) => {
  let m: Mobject = p;
  const path: number[] = [];
  while (!m.key) {
    const parent = m.parent;
    if (!parent) return undefined;
    path.unshift(parent.children.indexOf(m));
    m = parent;
  }
  return m instanceof Text ? `${m.key}|${m.text}|${path.join('.')}` : `${m.key}|${path.join('.')}`;
};
function keyed<T extends Mobject>(m: T, key: string): T {
  m.key = key;
  return m;
}
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
        new Text(opens!, { fontSize: 0.5, color }).moveTo([cx, y + 0.54]),
        new Text(shows!, { fontSize: 0.5, color }).moveTo([cx, y]),
        new Text(wins!, { fontSize: 0.5, color, weight: off ? 'normal' : 'bold' }).moveTo([cx, y - 0.54]),
      ),
      `${as}:${c.prize}${c.opened}`,
    );
  });
  return keyed(new Group(...parts), `strip:${as}`);
}
/** The car's three places, a third of the strip each. */
const heads = (s: Stage, y: number) =>
  keyed(
    new Group(...[0, 1, 2].map((i) => label(`Car behind ${door(i)}`, X0 + (i + 0.5) * 2 * SIX, y, s.soft, 0.52))),
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
    let phase: Phase = 'choice';
    let words: string[] = [];

    const doors = (result: string) => {
      const g = keyed(
        new Group(
          ...[0, 1, 2].flatMap((i) => [
            label(door(i), (i - 1) * 4.5, 2.7, s.soft, 0.64),
            tile(i === example.opened ? 'goat' : '?', (i - 1) * 4.5, 1.05, 3.2, 2.25, s, { active: i === choice, size: 0.8, key: `door-${i}` }),
          ]),
        ),
        'monty-doors',
      );
      words = [`Doors A, B and C; ${X} is your pick; ${B} is open and shows a goat; ${C} is closed`];
      return new Group(
        g,
        label(`You picked ${X}; he opened ${B}; ${C} is offered`, 0, -1.0, s.palette.ink, 0.62),
        label(
          host === 'informed' ? 'Knows where the car is; opens a goat at random' : 'Opens a random door; this time a goat',
          0,
          -2.25,
          s.soft,
          // The size of the lines around it: a phone's close-up is set by the line that changes, the result.
          0.62,
          'monty-rule',
        ),
        label(result, 0, -3.5, s.palette.ink, 0.62, 'monty-result'),
      );
    };
    /** Switching's chance for a host, right of his name: over every round, or (as) over the rounds left after the seen goat. */
    const readout = (h: Host, y: number, chance: number, key: string) =>
      keyed(new Text(`switch wins ${pct(chance)}`, { fontSize: 0.52, color: s.palette.ink }).moveTo([X1, y], [1, 0]), key);
    const titleOf = (h: Host, y: number) => left(NAME[h], X0, y, h === host ? s.emphasis : s.palette.ink, 0.56, `monty-name-${h}`);
    const describeStrip = (h: Host, list: readonly Cell[], dim: (c: Cell) => boolean = () => false) =>
      `${NAME[h]}: ` +
      list.map((c) => `car behind ${c.prize}, he opens ${c.opened}: ${c.shows}, ${c.stay === 'ends' ? 'game over' : c.stay === 'win' ? 'staying wins' : 'switching wins'}, ${c.sixths} sixth${c.sixths > 1 ? 's' : ''}${dim(c) ? ' (greyed)' : ''}`).join('; ');
    const cellKey = (y: number) => label(KEY, 0, y, s.soft, 0.52, 'monty-key');

    const picture = (): Group => {
      switch (phase) {
        case 'choice':
          return doors(`The car is behind ${X} or ${C}.`);
        case 'predict':
          return doors('Predict: stay or switch?');
        case 'rounds':
        case 'odds': {
          const y = SLOT.informed,
            ruled = phase === 'odds' ? dim : undefined;
          words = [describeStrip(host, cells[host], ruled), KEY];
          return new Group(
            heads(s, 2.7),
            titleOf(host, SLOT.informed + 1.15),
            strip(s, cells[host], y, host, ruled),
            ...(phase === 'odds'
              ? [
                  stat(s, 'Stay', pct(seen[host].stayChance), -3.8, -1.45, 'monty-stay'),
                  stat(s, 'Switch', pct(seen[host].switchChance), 3.8, -1.45, 'monty-switch'),
                ]
              : []),
            cellKey(-2.65),
          );
        }
        case 'copy':
        case 'worlds': {
          // Copy: the other host's strip starts as a copy of this host's, then takes its own rounds.
          const list = (h: Host) => (phase === 'copy' && h === other ? cells[host] : cells[h]);
          words = [...HOSTS.map((h) => describeStrip(h, list(h), dim)), KEY];
          return new Group(
            heads(s, 2.7),
            ...HOSTS.flatMap((h) => [
              titleOf(h, SLOT[h] + 1.15),
              ...(phase === 'worlds' ? [readout(h, SLOT[h] + 1.15, seen[h].switchChance, `monty-readout-${h}`)] : []),
              strip(s, list(h), SLOT[h], h, dim),
            ]),
            cellKey(-2.75),
          );
        }
      }
    };
    const main = view(() => keyed(picture(), 'monty-picture'), { place: false });
    const describe = { describe: () => words.join('. ') };
    const fresh = async (next: Phase) => {
      await s.clear({ runTime: 0.3 });
      phase = next;
      main.rebuild();
      s.keep(main, describe);
      await this.play(new FadeIn(main, { runTime: 0.5 }));
    };
    const morph = async (next: Phase, runTime = 1.1) => {
      phase = next;
      await this.play(main.sync({ match: byKey, runTime }));
    };
    const at = (id: string, state: Record<string, unknown>) => {
      this.state = { ...JSON.parse(JSON.stringify(state)), phase: id };
    };

    await this.step('choice', {
      title: `You pick ${X}; the host opens ${B}: a goat`,
      line: 'Should you switch? That depends on what the host knew and how he chose which door to open.',
      caption:
        host === 'informed'
          ? `A car is behind one of three doors, and goats are behind the other two. You pick ${X}. The host knows where the car is; he opens ${B}, shows a goat, and offers you ${C}. With two doors still closed, the odds look even.`
          : `A car is behind one of three doors, and goats are behind the other two. You pick ${X}. The host doesn’t know where the car is; he opened ${B} at random and happened to reveal a goat. Had he opened the car, the round would be over. He offers you ${C}. With two doors still closed, the odds look even.`,
    });
    main.rebuild();
    s.keep(main, describe);
    await this.play(new FadeIn(main, { runTime: 0.6 }));
    at('choice', { example, host, revealed: false });

    await this.step('predict', {
      title: `Stay with ${X}, or switch to ${C}?`,
      line: 'Predict: does it matter what the host knew and how he picked a door?',
      caption:
        host === 'informed'
          ? 'Two doors are closed and you have seen a goat. Would switching win more often than staying? And would your answer change if the host had opened a door at random and happened to show a goat?'
          : 'Two doors are closed and you have seen a goat. Would switching win more often than staying? And would your answer change if the host had known where the car was and always shown a goat?',
    });
    await morph('predict', 0.5);
    at('predict', { example, host, revealed: false });

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
