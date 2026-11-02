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
  H = 1.5,
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
        new Text(opens!, { fontSize: 0.44, color }).moveTo([cx, y + 0.48]),
        new Text(shows!, { fontSize: 0.44, color }).moveTo([cx, y]),
        new Text(wins!, { fontSize: 0.44, color, weight: off ? 'normal' : 'bold' }).moveTo([cx, y - 0.48]),
      ),
      `${as}:${c.prize}${c.opened}`,
    );
  });
  return keyed(new Group(...parts), `strip:${as}`);
}
/** The car's three places, a third of the strip each. */
const heads = (s: Stage, y: number) =>
  keyed(
    new Group(...[0, 1, 2].map((i) => label(`Car behind ${door(i)}`, X0 + (i + 0.5) * 2 * SIX, y, s.soft, 0.5))),
    'monty-heads',
  );
const sum = (cells: readonly Cell[], f: (c: Cell) => boolean) => cells.filter(f).reduce((n, c) => n + c.sixths, 0);

export default class MontyHall extends Scene {
  static meta = {
    id: 'monty-hall',
    title: 'Why does the host’s rule change the odds of switching?',
    sources: ['https://mathigon.org/course/probability/monty-hall', 'https://doi.org/10.1080/00031305.1975.10479121'],
    // The script's answer and check questions (script.md); `worlds` states the answer.
    answer: 'Switching wins 2 in 3 if the host knows where the car is, but 1 in 2 if the host opened a random door and showed a goat',
    checks: [
      {
        question:
          'A host who knows where the car is always opens B when B hides a goat. You pick A, and he opens C. Should you switch, and how sure can you be?',
        answer: `Switch: you win ${pct(oddsAfter(0, 'leftmost', 'C').switchChance)} of the time. He opens C only when he can’t open B, which means B hides the car. Had he opened B, switching would win ${pct(oddsAfter(0, 'leftmost', 'B').switchChance)}: he opens B whether the car is behind A or C.`,
      },
      {
        question: 'Four doors. A host who knows where the car is opens two goats among the three you didn’t pick. How often does switching to the last closed door win?',
        answer: `${pct(monty(4, 'informed').switchChance)}. Your first pick is right 1 time in 4; in the other 3 he leaves the car behind the one door he doesn’t open.`,
      },
      {
        question: 'With 100 doors and a random host who opens 98 of them, how often does the game reach a switch offer, and what are the odds then?',
        answer: `In ${pct(monty(100, 'random').continuationChance)} of rounds; in the rest, one of his doors shows the car. When the game does go on, staying and switching each win ${pct(monty(100, 'random').switchChance)}.`,
      },
    ],
  };
  static settings = [
    {
      id: 'host',
      label: 'Host rule',
      default: 'informed',
      options: [
        { value: 'informed', label: 'Knows the prize; always reveals goats' },
        { value: 'random', label: 'Opens a random unchosen door' },
      ],
    },
    {
      id: 'choice',
      label: 'First choice',
      default: 'A',
      options: ['A', 'B', 'C'].map((value) => ({ value, label: value })),
    },
  ];
  override async construct() {
    const settings = settingsOf(this),
      host = settings.host as Host,
      other: Host = host === 'informed' ? 'random' : 'informed',
      choice = 'ABC'.indexOf(settings.choice!),
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
    const ends = sum(cells.random, (c) => c.shows === 'car'),
      goat = 6 - ends,
      randomSwitch = sum(cells.random, (c) => c.swap === 'win'),
      randomStay = sum(cells.random, (c) => c.stay === 'win');
    // The random host's car rounds are rounds where the first pick was wrong, and the informed host's switching wins.
    for (const c of cells.random.filter((c) => c.shows === 'car'))
      if (c.prize === X || !cells.informed.some((k) => k.prize === c.prize && k.swap === 'win'))
        throw new Error('A random host can open the car only where the informed host leaves it for the switcher');
    if (seen.informed.switchChance !== informed.switchChance || seen.random.switchChance !== random.switchChance)
      throw new Error('Conditioning on the opened door must give the same odds as counting every goat');

    const s = stage(this, { style: 'github-light', headingSize: 0.6 });
    type Phase = 'choice' | 'predict' | 'odds' | 'copy' | 'worlds' | 'rules';
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
          host === 'informed' ? 'Knows where the car is; always opens a goat' : 'Opens a random door; this time a goat',
          0,
          -2.25,
          s.soft,
          0.6,
          'monty-rule',
        ),
        label(result, 0, -3.5, s.palette.ink, 0.62, 'monty-result'),
      );
    };
    /** Switching's chance for a host, right of his name: over every round, or (as) over the rounds left after the seen goat. */
    const readout = (h: Host, y: number, chance: number, key: string) =>
      keyed(new Text(`switch wins ${pct(chance)}`, { fontSize: 0.48, color: s.palette.ink }).moveTo([X1, y], [1, 0]), key);
    const titleOf = (h: Host, y: number) => left(NAME[h], X0, y, h === host ? s.emphasis : s.palette.ink, 0.56, `monty-name-${h}`);
    const describeStrip = (h: Host, list: readonly Cell[], dim: (c: Cell) => boolean = () => false) =>
      `${NAME[h]}: ` +
      list.map((c) => `car behind ${c.prize}, he opens ${c.opened}: ${c.shows}, ${c.stay === 'ends' ? 'game over' : c.stay === 'win' ? 'staying wins' : 'switching wins'}, ${c.sixths} sixth${c.sixths > 1 ? 's' : ''}${dim(c) ? ' (ruled out)' : ''}`).join('; ');

    const picture = (): Group => {
      switch (phase) {
        case 'choice':
          return doors(`The car is behind ${X} or ${C}.`);
        case 'predict':
          return doors('Predict: stay or switch?');
        case 'odds': {
          const y = SLOT.informed;
          words = [describeStrip(host, cells[host])];
          return new Group(
            heads(s, 2.7),
            titleOf(host, SLOT.informed + 1.15),
            strip(s, cells[host], y, host),
            stat(s, 'Stay', pct(m.stayChance), -3.8, -1.45, 'monty-stay'),
            stat(s, 'Switch', pct(m.switchChance), 3.8, -1.45, 'monty-switch'),
            label(
              host === 'informed' ? 'Every round shows a goat.' : `A goat shows in ${pct(random.continuationChance)} of rounds.`,
              0,
              -3.0,
              s.palette.ink,
              0.52,
              'monty-note',
            ),
          );
        }
        case 'copy':
        case 'worlds': {
          // Copy: the other host's strip starts as a copy of this host's, then takes its own rounds.
          const list = (h: Host) => (phase === 'copy' && h === other ? cells[host] : cells[h]);
          words = HOSTS.map((h) => describeStrip(h, list(h)));
          return new Group(
            heads(s, 2.7),
            ...HOSTS.flatMap((h) => [
              titleOf(h, SLOT[h] + 1.15),
              ...(phase === 'worlds' ? [readout(h, SLOT[h] + 1.15, h === 'informed' ? informed.switchChance : random.switchChance, `monty-readout-${h}`)] : []),
              strip(s, list(h), SLOT[h], h),
            ]),
          );
        }
        case 'rules': {
          const dim = (c: Cell) => c.opened !== B || c.shows === 'car';
          words = HOSTS.map((h) => describeStrip(h, cells[h], dim));
          return new Group(
            heads(s, 2.7),
            ...HOSTS.flatMap((h) => [titleOf(h, SLOT[h] + 1.15), strip(s, cells[h], SLOT[h], h, dim)]),
            keyed(new Group(...HOSTS.map((h) => readout(h, SLOT[h] + 1.15, seen[h].switchChance, `monty-seen-${h}`))), 'monty-rules'),
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
      line: 'Should you switch? It depends on something the picture doesn’t show.',
      caption:
        host === 'informed'
          ? `A car is behind one of three doors and goats are behind the other two. You pick ${X}. The host knows where the car is; he opens ${B}, shows a goat, and offers you ${C}. People have argued for decades about whether to switch, and the answer turns on a question the puzzle is often told without: did the host know where the car was?`
          : `A car is behind one of three doors and goats are behind the other two. You pick ${X}. The host doesn’t know where the car is; he opened ${B} at random and happened to reveal a goat. Had he opened the car, the round would be over. He offers you ${C}. People have argued for decades about whether to switch, and the answer turns on a question the puzzle is often told without: did the host know where the car was?`,
    });
    main.rebuild();
    s.keep(main, describe);
    await this.play(new FadeIn(main, { runTime: 0.6 }));
    at('choice', { example, host, revealed: false });

    await this.step('predict', {
      title: `Stay with ${X}, or switch to ${C}?`,
      line: 'Predict: does it matter whether the host knew where the car was?',
      caption:
        host === 'informed'
          ? 'Two doors are closed and you have seen a goat. Would switching win more often than staying? And would your answer change if the host had opened a door at random and happened to show a goat?'
          : 'Two doors are closed and you have seen a goat. Would switching win more often than staying? And would your answer change if the host had known where the car was and always shown a goat?',
    });
    await morph('predict', 0.5);
    at('predict', { example, host, revealed: false });

    await this.step('odds', {
      title: host === 'informed' ? 'With this host, switching wins 2 in 3' : 'With this host, switching wins 1 in 2',
      line: 'Each cell is a round, as wide as its chance: door opened, what it shows, who wins.',
      caption:
        host === 'informed'
          ? `The car is behind each door a third of the time. Behind ${X}, he opens ${others.join(' or ')}, either with equal chance, and staying wins. Behind either other door, he must open the one goat you didn’t pick, so the car is behind the door he leaves closed: switching wins ${pct(m.switchChance)}.`
          : `The car is behind each door a third of the time, and he opens ${others.join(' or ')} with equal chance, so each round is a sixth. In ${ends} of them he opens the car and the game ends. Of the ${goat} that show a goat, staying wins ${randomStay} and switching wins ${randomSwitch}: ${pct(m.switchChance)} each.`,
    });
    await fresh('odds');
    at('odds', { odds: m, cells: cells[host] });

    await this.step('worlds', {
      title: 'Same rounds, other host',
      line:
        host === 'informed'
          ? 'Each wrong-pick third splits; in one half he opens the car.'
          : 'Each car round merges into a switching win.',
      caption: `The random host opens ${others.join(' or ')} with equal chance, so each third where your pick is wrong splits in two, and in one half he opens the car and the game ends. Those halves are rounds the host who knows turns into switching wins, because he never opens the car. Staying keeps its third either way. Switching wins 2 in 3 if the host knows where the car is, but 1 in 2 if the host opened a random door and showed a goat.`,
    });
    await morph('copy', 0.8);
    await morph('worlds', 1.3);
    at('worlds', { choice, host, worlds, odds: m, informedWorlds, randomWorlds, cells });

    await this.step('rules', {
      title: `The goat you saw was behind ${B}`,
      line: `Rounds without a goat behind ${B} are greyed. Compare what is left.`,
      caption: `With the car behind ${X}, either host opens ${B} half the time. With it behind ${C}, the host who knows must open ${B}, so in his rounds ${C} is twice as likely as ${X}: switching wins ${pct(seen.informed.switchChance)}. The random host opens ${B} half the time wherever the car is, so ${X} and ${C} stay equally likely: ${pct(seen.random.switchChance)}. What sets the odds is how likely the host was to open exactly the door you saw.`,
    });
    await morph('rules', 0.9);
    at('rules', { opened: B, seen: { informed: seen.informed, random: seen.random }, cells, informed, random });
  }
}
