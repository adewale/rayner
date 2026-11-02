import { Scene, Group, Rectangle } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { monty, montyExample, threeDoorWorlds } from '../lib/monty-hall.ts';
import type { Host } from '../lib/monty-hall.ts';
import { lesson, label, tile, table, stat } from '../lib/lesson-drawing.ts';

const pct = (n: number) => (n * 100).toFixed(1) + '%';
const door = (i: number) => 'ABC'[i]!;
function odds(s: Stage, m: ReturnType<typeof monty>, title: string) {
  const g = new Group(
    label(title, 0, 2.65, s.palette.ink, 0.65),
    stat(s, 'Stay', pct(m.stayChance), -3.8, 1.0, 'monty-stay'),
    stat(s, 'Switch', pct(m.switchChance), 3.8, 1.0, 'monty-switch'),
    label(`${m.doors} doors; ${m.opened} opened`, 0, -0.65, s.soft, 0.6),
    label(
      m.host === 'informed' ? 'The host shows a goat in every round.' : `A goat shows in ${pct(m.continuationChance)} of rounds.`,
      0,
      -1.75,
      s.palette.ink,
      0.6,
    ),
    label(
      m.host === 'informed' ? 'Every wrong first pick becomes a switching win.' : 'The goat rules out two wrong-pick rounds.',
      0,
      -3.2,
      s.palette.ink,
      0.6,
    ),
  );
  g.key = 'monty-odds';
  return g;
}
function hundred(s: Stage, m: ReturnType<typeof monty>) {
  const discarded = new Group(
    ...Array.from({ length: m.opened }, (_, i) =>
      new Rectangle({ width: 0.35, height: 0.38, fill: 'none', stroke: s.soft, strokeWidth: 0.035 }).moveTo([
        -6.65 + (i % 25) * 0.55,
        2.05 - Math.floor(i / 25) * 0.58,
      ]),
    ),
  );
  discarded.key = 'monty-removed';
  return new Group(
    discarded,
    label('98 opened doors', 0, 2.7, s.soft, 0.6),
    stat(s, 'Stay', pct(m.stayChance), -3.8, -1.25, 'monty-stay'),
    stat(s, 'Switch', pct(m.switchChance), 3.8, -1.25, 'monty-switch'),
    label(
      m.host === 'informed'
        ? 'Wrong first pick: the host leaves the car closed.'
        : `The game goes on in ${pct(m.continuationChance)} of rounds.`,
      0,
      -3.65,
      s.palette.ink,
      0.6,
    ),
  );
}
type World = ReturnType<typeof threeDoorWorlds>[number];
/** Both hosts' rows for one first pick, side by side; the host in play is titled in the emphasis colour. */
function worldsPicture(s: Stage, host: Host, informed: World[], random: World[]) {
  const panel = (rule: Host, rows: World[], xs: number[]) => {
    const centre = (xs[0]! + xs[2]!) / 2,
      counted = rows.filter((w) => w.swap !== 'ends');
    return new Group(
      label(rule === 'informed' ? 'Host who knows' : 'Random host', centre, 2.7, rule === host ? s.emphasis : s.palette.ink, 0.62),
      table(
        ['Car', 'Opens', 'Switch'],
        rows.map((w) => [w.prize, w.opened, w.swap]),
        s,
        { xs, y: 1.9, gap: 0.68, key: `monty-worlds-${rule}`, size: 0.58 },
      ),
      label(`Switch wins ${counted.filter((w) => w.swap === 'win').length} of ${counted.length}`, centre, -2.95, s.palette.ink, 0.6),
      label(counted.length === rows.length ? 'every row counts' : 'rows that show a goat', centre, -3.65, s.soft, 0.58),
    );
  };
  const g = new Group(panel('informed', informed, [-5.95, -4.15, -1.97]), panel('random', random, [1.32, 3.24, 5.54]));
  g.key = 'monty-worlds';
  return g;
}

export default class MontyHall extends Scene {
  static meta = {
    id: 'monty-hall',
    title: 'Why does the host’s rule change the odds of switching?',
    sources: ['https://mathigon.org/course/probability/monty-hall', 'https://doi.org/10.1080/00031305.1975.10479121'],
    // The script's answer and check questions (script.md); `worlds` states the answer.
    answer: 'Switching wins 2 in 3 if the host knows where the car is, but 1 in 2 if the host opened a random door and showed a goat',
    checks: [
      {
        question: 'With a host who knows where the car is, why doesn’t his goat change the chance that your first door hides the car?',
        answer:
          'He shows a goat in every round, whatever is behind your door, so the goat rules no round out. Your door still hides the car 1 time in 3, and in the other 2 he has left the car behind the door he didn’t open.',
      },
      {
        question: 'With a random host, which rounds does seeing a goat rule out, and why does that bring switching down to 1 in 2?',
        answer:
          'The 2 of 6 equally likely rounds in which he would have opened the car. In both, your first pick was wrong, so ruling them out leaves 2 rounds where your pick is right and 2 where it is wrong.',
      },
      {
        question: 'With 100 doors and a random host who opens 98 of them, how often does the game reach a switch offer, and what are the odds then?',
        answer: 'In 2% of rounds; in the other 98% one of his doors shows the car. When the game does go on, staying and switching each win 50%.',
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
    {
      id: 'strategy',
      label: 'Your decision',
      default: 'switch',
      options: [
        { value: 'stay', label: 'Stay' },
        { value: 'switch', label: 'Switch' },
      ],
    },
  ];
  override async construct() {
    const settings = settingsOf(this),
      host = settings.host as Host,
      choice = 'ABC'.indexOf(settings.choice!),
      example = montyExample(choice, settings.strategy as 'stay' | 'switch'),
      m = monty(3, host),
      large = monty(100, host),
      worlds = threeDoorWorlds(choice, host),
      informedWorlds = threeDoorWorlds(choice, 'informed'),
      randomWorlds = threeDoorWorlds(choice, 'random'),
      informed = monty(3, 'informed'),
      random = monty(3, 'random');
    const X = door(choice),
      others = [0, 1, 2].filter((i) => i !== choice).map(door);
    const informedWins = informedWorlds.filter((w) => w.swap === 'win').length,
      randomEnds = randomWorlds.filter((w) => w.swap === 'ends'),
      randomGoat = randomWorlds.filter((w) => w.swap !== 'ends'),
      randomWins = randomGoat.filter((w) => w.swap === 'win').length,
      randomRight = randomGoat.filter((w) => w.stay === 'win').length;
    // Every round the random host ends is one where the first pick was wrong: the car was behind another door.
    if (!randomEnds.every((w) => w.prize !== X)) throw new Error('A random host can only open the car behind an unchosen door');
    const doors = (s: Stage, phase: number, result?: string) => {
      const g = new Group(
        ...[0, 1, 2].flatMap((i) => {
          const open = phase >= 1 && i === example.opened,
            revealed = phase >= 2;
          return [
            label(door(i), (i - 1) * 4.5, 2.7, s.soft, 0.64),
            tile(
              open ? 'goat' : revealed ? (i === example.prize ? 'car' : 'goat') : '?',
              (i - 1) * 4.5,
              1.05,
              3.2,
              2.25,
              s,
              { active: i === (revealed ? example.final : choice), size: 0.8, key: `door-${i}` },
            ),
          ];
        }),
      );
      g.key = 'monty-doors';
      return new Group(
        g,
        label(`First choice: ${X}; decision: ${example.strategy}`, 0, -1.0, s.palette.ink, 0.62),
        label(
          host === 'informed' ? 'Knows where the car is; always opens a goat' : 'Opens a random door; this time a goat',
          0,
          -2.25,
          s.soft,
          0.6,
          'monty-rule',
        ),
        label(
          result ?? (phase === 2 ? `This round: ${example.won ? 'win' : 'lose'}` : 'The car stays hidden until the end.'),
          0,
          -3.5,
          s.palette.ink,
          0.62,
          'monty-result',
        ),
      );
    };
    const frames = [
      {
        id: 'choice',
        title: `You pick door ${X}`,
        line: 'A car is behind one door and goats are behind two, each placement equally likely.',
        caption: `You choose ${X}, so your door hides the car with chance one in three. The host will now open one of the doors you didn’t choose, ${others.join(' or ')}. What he knows about the car will turn out to matter.`,
        state: { example, host, revealed: false },
        draw: (s: Stage) => doors(s, 0),
      },
      {
        id: 'host',
        title: `The host opens ${door(example.opened)}: a goat`,
        line:
          host === 'informed'
            ? 'This host knows where the car is, and always opens a goat door you didn’t pick.'
            : 'This host doesn’t know where the car is; he opens one of your unchosen doors at random.',
        caption:
          host === 'informed'
            ? `He then offers you the last closed door, ${door(example.offered)}. When both of your unchosen doors hide goats, he picks either with equal chance.`
            : `This time he happened to reveal a goat, so the game goes on and he offers you ${door(example.offered)}. Had he opened the car, the round would be over.`,
        state: { example, host, revealed: false },
        draw: (s: Stage) => doors(s, 1),
      },
      {
        id: 'predict',
        title: `Stay with ${X}, or switch to ${door(example.offered)}?`,
        line: 'Predict: does it matter whether the host knew where the car was?',
        caption:
          host === 'informed'
            ? 'Two doors are closed and you have seen a goat. Would switching win more often than staying? And would your answer change if the host had opened a door at random and happened to show a goat?'
            : 'Two doors are closed and you have seen a goat. Would switching win more often than staying? And would your answer change if the host had known where the car was and always shown a goat?',
        state: { example, host, revealed: false },
        draw: (s: Stage) => doors(s, 1, 'Predict: stay or switch?'),
      },
      {
        id: 'reveal',
        title: example.won ? 'This round, your decision wins' : 'This round, your decision loses',
        line: 'One round can’t give the odds; listing every placement can.',
        caption: `The car was behind ${door(example.prize)}. You ${example.strategy} and end at ${door(example.final)}, so you ${example.won ? 'win' : 'lose'}. To see which choice wins more often, keep your first pick at ${X} and list every place the car could be, for both kinds of host.`,
        state: { example, host, revealed: true },
        draw: (s: Stage) => doors(s, 2),
      },
      {
        id: 'worlds',
        title: 'Every placement, for both hosts',
        line: 'Each row for the host who knows has chance 1/3; each random-host row, 1/6.',
        caption: `With your pick at ${X}, the host who knows never opens the car, so whenever your pick is wrong he leaves it behind the other closed door: switching wins ${informedWins} of ${informedWorlds.length}. The random host opens the car in ${randomEnds.length} of his ${randomWorlds.length} rows and the game ends; of the ${randomGoat.length} rows that show a goat, switching wins ${randomWins}. Switching wins 2 in 3 if the host knows where the car is, but 1 in 2 if the host opened a random door and showed a goat.`,
        state: { choice, host, worlds, odds: m, informedWorlds, randomWorlds },
        draw: (s: Stage) => worldsPicture(s, host, informedWorlds, randomWorlds),
      },
      {
        id: 'odds',
        title: host === 'informed' ? 'Why: this host’s goat rules nothing out' : 'Why: this host’s goat rules out two rounds',
        line:
          host === 'informed'
            ? `Your pick at ${X} stays right 1 time in 3; the closed door wins the rest.`
            : 'Both rounds it rules out are ones where your first pick was wrong.',
        caption:
          host === 'informed'
            ? `This host shows a goat in every round, whatever is behind ${X}, so seeing one tells you nothing new about your door: it still hides the car 1 time in 3. In the other 2 times in 3 he has left the car behind the one door he didn’t open, so switching wins ${pct(m.switchChance)}.`
            : `The random host shows the car in ${randomEnds.length} of the ${randomWorlds.length} rows, and in both the car was behind a door you didn’t pick. Seeing a goat rules those out, which leaves ${randomRight} rows where your pick is right and ${randomWins} where it is wrong: staying and switching each win ${pct(m.switchChance)}.`,
        state: { odds: m },
        draw: (s: Stage) => odds(s, m, host === 'informed' ? 'Host who knows' : 'Random host, goat shown'),
      },
      {
        id: 'many',
        title: 'Same rule, 100 doors',
        line: host === 'informed' ? 'The host opens 98 goats and never the car.' : 'Only 2% of random 98-door openings miss the car.',
        caption:
          host === 'informed'
            ? `Your first pick holds the car 1 time in 100. Each small outline is a door the host opens, always a goat. Whenever your pick was wrong, ${pct(large.switchChance)} of rounds, the one door he leaves closed hides the car.`
            : `Each small outline is one of 98 doors opened at random. In ${pct(1 - large.continuationChance)} of rounds one of them shows the car and the game ends. In the ${pct(large.continuationChance)} that go on, your door and the last closed door are equally likely: ${pct(large.switchChance)} each.`,
        state: { odds: large },
        draw: (s: Stage) => hundred(s, large),
      },
      {
        id: 'rules',
        title: 'Same goat, different rule, different odds',
        line: 'What the host knew decides what his goat tells you.',
        caption: `A host who knows always shows a goat, and switching wins ${pct(informed.switchChance)}. A random host shows a goat in only ${pct(random.continuationChance)} of rounds, and after one, switching wins ${pct(random.switchChance)}. The two closed doors look the same either way; the rule that produced them sets the odds.`,
        state: { informed, random },
        draw: (s: Stage) =>
          new Group(
            table(
              ['Host', 'Goat reveal', 'Switch wins'],
              [
                ['informed', 'always', pct(informed.switchChance)],
                ['random', pct(random.continuationChance), pct(random.switchChance)],
              ],
              s,
              { xs: [-4.9, 0, 4.9], y: 1.75, gap: 1.35, key: 'monty-rules' },
            ),
            label('Random-host odds count only goat rounds.', 0, -2.9, s.palette.ink, 0.6),
          ),
      },
    ];
    await lesson(this, frames);
  }
}
