import { Scene, Group, Rectangle, Text } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { monty, montyExample, threeDoorWorlds } from '../lib/monty-hall.ts';
import type { Host } from '../lib/monty-hall.ts';
import { lesson, label, tile, table, stat } from '../lib/lesson-drawing.ts';

const pct = (n: number) => (n * 100).toFixed(1) + '%';
function odds(s: Stage, m: ReturnType<typeof monty>, title: string) {
  const g = new Group(
    label(title, 0, 2.65, s.palette.ink, 0.65),
    stat(s, 'Stay', pct(m.stayChance), -3.8, 1.0, 'monty-stay'),
    stat(s, 'Switch', pct(m.switchChance), 3.8, 1.0, 'monty-switch'),
    label(`${m.doors} doors; ${m.opened} opened`, 0, -0.65, s.soft, 0.6),
    label(
      m.host === 'informed'
        ? 'The host always reveals goats.'
        : `Goat-only reveals: ${pct(m.continuationChance)} of rounds`,
      0,
      -1.75,
      s.palette.ink,
      0.6,
    ),
    label(
      m.host === 'informed'
        ? 'Initial wrong choices become switching wins.'
        : 'The percentages condition on a goat-only reveal.',
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
        ? 'Wrong first choice > the host leaves the prize.'
        : 'Goat reveal → equal conditional odds.',
      0,
      -3.65,
      s.palette.ink,
      0.6,
    ),
  );
}
export default class MontyHall extends Scene {
  static meta = {
    id: 'monty-hall',
    title: 'Why does the host’s rule change the odds of switching?',
    sources: ['https://mathigon.org/course/probability/monty-hall', 'https://doi.org/10.1080/00031305.1975.10479121'],
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
      informed = monty(3, 'informed'),
      random = monty(3, 'random');
    const doors = (s: Stage, phase: number) => {
      const g = new Group(
        ...[0, 1, 2].flatMap((i) => {
          const open = phase >= 1 && i === example.opened,
            revealed = phase >= 2;
          return [
            label('ABC'[i]!, (i - 1) * 4.5, 2.7, s.soft, 0.64),
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
        label(`First choice: ${'ABC'[choice]}; decision: ${example.strategy}`, 0, -1.0, s.palette.ink, 0.62),
        label(
          host === 'informed'
            ? 'Knows prize; opens goat; always offers switch'
            : 'Random host; this round revealed a goat',
          0,
          -2.25,
          s.soft,
          0.6,
          'monty-rule',
        ),
        label(
          phase === 2 ? `This round: ${example.won ? 'win' : 'lose'}` : 'The prize stays hidden until reveal.',
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
        title: 'Choose a door before the reveal',
        line: 'The first choice starts with a one-in-three chance.',
        caption: `You choose ${settings.choice}. The prize starts behind each door with equal probability. This picture follows one repeatable round; comparing strategies requires all three prize placements.`,
        state: { example, host, revealed: false },
        draw: (s: Stage) => doors(s, 0),
      },
      {
        id: 'host',
        title: 'The host’s choice supplies information',
        line:
          host === 'informed'
            ? 'The host knows the prize and must leave it hidden.'
            : 'The host might reveal the prize; this round happened to continue.',
        caption:
          host === 'informed'
            ? `The host opens ${'ABC'[example.opened]}, a goat door you did not choose, and always offers a switch. If both unchosen doors contain goats, either is opened with equal probability.`
            : `An uninformed host chooses an unchosen door at random. We are inspecting a round that happened to reveal a goat; rounds that reveal the car cannot continue.`,
        state: { example, host, revealed: false },
        draw: (s: Stage) => doors(s, 1),
      },
      {
        id: 'reveal',
        title: example.won ? 'Your decision wins this round' : 'Your decision loses this round',
        line: 'A single outcome does not establish which strategy wins more often.',
        caption: `The car is behind C in this example. You ${example.strategy} and finish at ${'ABC'[example.final]}, so you ${example.won ? 'win' : 'lose'}. To compare strategies, keep the first choice fixed and examine every possible prize placement.`,
        state: { example, host, revealed: true },
        draw: (s: Stage) => doors(s, 2),
      },
      {
        id: 'worlds',
        title: host === 'informed' ? 'Compare all three prize placements' : 'Count the host’s random choices',
        line:
          host === 'informed'
            ? 'Each row starts with probability one third.'
            : 'These six prize-and-opening combinations are equally likely.',
        caption:
          host === 'informed'
            ? 'Staying wins only when the first choice was right. In each of the other two placements, the informed host removes the unchosen goat and switching reaches the prize.'
            : 'A random host reveals the car in two combinations. Among the four that reveal a goat, staying wins twice and switching wins twice. The ended rounds are excluded from that comparison.',
        state: { choice, host, worlds, odds: m },
        draw: (s: Stage) =>
          new Group(
            table(
              ['Prize', 'Host opens', 'Stay', 'Switch'],
              worlds.map((w) => [w.prize, w.opened, w.stay, w.swap]),
              s,
              { xs: [-5.7, -1.9, 2.2, 5.8], y: 2.65, gap: host === 'random' ? 0.78 : 1.3, key: 'monty-worlds' },
            ),
            label(
              host === 'informed' ? 'One staying win; two switching wins.' : 'Two rounds end; four reveal a goat.',
              0,
              -3.65,
              s.palette.ink,
              0.6,
            ),
          ),
      },
      {
        id: 'odds',
        title:
          host === 'informed' ? 'Switching wins two thirds of the time' : 'A lucky random reveal leaves equal odds',
        line: 'The strategy percentages use the host rule shown here.',
        caption:
          host === 'informed'
            ? 'The original choice is wrong with probability two thirds. Because the informed host always reveals goats, switching wins in precisely those wrong-choice cases. Staying wins one third.'
            : 'With an uninformed host, observing a goat changes the sample of rounds we are considering. Conditioned on that reveal, staying and switching each win one half.',
        state: { odds: m },
        draw: (s: Stage) => odds(s, m, host === 'informed' ? 'Informed host' : 'Random host, goat revealed'),
      },
      {
        id: 'many',
        title: 'Keep the rule and expand to 100 doors',
        line:
          host === 'informed'
            ? 'The host removes 98 goats while preserving the prize.'
            : 'Only two percent of random 98-door openings reveal no prize.',
        caption:
          host === 'informed'
            ? 'Your first choice has a one-percent chance. Each small outline is a door the informed host opens. Those 98 goats leave one alternative: it contains the prize whenever your initial choice was wrong, in 99 percent of rounds.'
            : 'Each small outline is one of 98 doors opened at random. Only two percent of rounds leave the prize hidden. Among those continuing rounds, the original choice and the remaining alternative again have equal chances.',
        state: { odds: large },
        draw: (s: Stage) => hundred(s, large),
      },
      {
        id: 'rules',
        title: 'The rule explains the different odds',
        line: 'Two closed doors can result from different selection processes.',
        caption:
          'With three doors, an informed host always offers a valid switch and switching wins two thirds. A random host offers a continuing round only after a lucky goat reveal; switching then wins one half. The remaining picture alone does not specify its probabilities.',
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
            label('Random-host odds condition on a goat reveal.', 0, -2.9, s.palette.ink, 0.6),
          ),
      },
    ];
    frames.splice(2, 0, {
      ...frames[1]!,
      id: 'predict',
      title: 'Would you keep your first door?',
      line:
        host === 'informed'
          ? 'The host was required to leave the prize hidden.'
          : 'Remember: we excluded rounds in which the host revealed the prize.',
      caption:
        'Would staying or switching win more often across all possible prize placements under this host’s rule? A win in this one round could support either strategy; the comparison must include the other placements.',
      draw: (s: Stage) => {
        const g = doors(s, 1);
        const result = g.family().find((m) => m.key === 'monty-result');
        if (result instanceof Text) result.setText('Predict: stay or switch?');
        else g.add(label('Predict: stay or switch?', 0, -2.7, s.palette.ink, 0.7));
        return g;
      },
    });
    await lesson(this, frames);
  }
}
