import { Scene, Group, Circle, Line, Rectangle } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { birthdayStory } from '../lib/birthday-paradox.ts';
import type { BirthdayQuestion } from '../lib/birthday-paradox.ts';
import type { LessonFrame } from '../lib/lesson-drawing.ts';
import { lesson, label, tile, table, stat } from '../lib/lesson-drawing.ts';

const pct = (p: number) => (100 * p).toFixed(1) + '%';
export default class BirthdayParadox extends Scene {
  static meta = {
    id: 'birthday-paradox',
    title: 'Why do shared birthdays become likely so quickly?',
    sources: ['https://pudding.cool/2018/04/birthday-paradox/', 'https://mathworld.wolfram.com/BirthdayProblem.html'],
  };
  static settings = [
    {
      id: 'people',
      label: 'People in the room',
      default: '23',
      options: [10, 23, 50].map((n) => ({ value: String(n), label: String(n) })),
    },
    {
      id: 'question',
      label: 'Matching birthdays',
      default: 'any',
      options: [
        { value: 'any', label: 'Any pair' },
        { value: 'one', label: 'Someone matching one marked person' },
      ],
    },
  ];
  override async construct() {
    const values = settingsOf(this),
      m = birthdayStory(Number(values.people), values.question as BirthdayQuestion);
    const question = m.question === 'any' ? 'any pair' : 'one marked person';
    const people = (s: Stage) => {
      const counts = new Map<number, number>();
      for (const day of m.sample.first) counts.set(day, (counts.get(day) ?? 0) + 1);
      const cols = m.people === 50 ? 10 : m.people === 23 ? 6 : 5,
        dx = m.people === 50 ? 1.38 : 2.0,
        rows = Math.ceil(m.people / cols);
      const g = new Group(
        ...m.sample.first.map((day, i) => {
          const match =
            m.question === 'any' ? counts.get(day)! > 1 : day === m.sample.first[0] && (i > 0 || counts.get(day)! > 1);
          return tile(day, ((i % cols) - (cols - 1) / 2) * dx, 2.25 - Math.floor(i / cols) * 0.95, dx - 0.15, 0.7, s, {
            active: match,
            bad: m.question === 'one' && i === 0,
            size: 0.65,
            key: `person-${i}`,
          });
        }),
      );
      g.key = 'birthday-people';
      return new Group(
        g,
        label(`${m.people} people; each number is a calendar day.`, 0, 2.3 - rows * 0.95, s.soft, 0.65),
        label(
          m.question === 'one' ? 'Red: the one marked birthday.' : 'Blue outlines mark repeated dates.',
          0,
          -3.35,
          s.palette.ink,
          0.65,
        ),
      );
    };
    const frames: LessonFrame[] = [
      {
        id: 'question',
        title: `How likely is a match among ${m.people}?`,
        line: `The question asks about ${question}.`,
        caption: `The room contains ${m.people} people. We want the chance of a match across repeated random rooms. The model assumes independent birthdays, each equally likely on any of 365 days.`,
        state: { people: m.people, question: m.question, sample: m.sample.first },
        draw: people,
      },
      {
        id: 'pairs',
        title: 'Each newcomer adds comparisons',
        line:
          m.question === 'any'
            ? 'Person 5 creates four new pairs with the people already present.'
            : 'Each newcomer is compared only with the marked person.',
        caption:
          m.question === 'any'
            ? 'Two people create one pair, three create three pairs, and five create ten. Adding a person creates a comparison with every person already in the room.'
            : 'With one marked birthday, adding a person creates just one new comparison. Two people give one comparison, three give two, and five give four.',
        state: {
          question: m.question,
          examples: [2, 3, 5].map((n) => ({
            people: n,
            comparisons: m.question === 'any' ? (n * (n - 1)) / 2 : n - 1,
          })),
        },
        draw: (s: Stage) => {
          const points = Array.from(
            { length: 5 },
            (_, i) =>
              [
                Math.cos(Math.PI / 2 + (i * 2 * Math.PI) / 5) * 2.6,
                Math.sin(Math.PI / 2 + (i * 2 * Math.PI) / 5) * 2.6,
              ] as [number, number],
          );
          const g = new Group();
          for (let i = 0; i < 5; i++)
            for (let j = i + 1; j < 5; j++)
              if (m.question === 'any' || i === 0) {
                const a = points[i]!,
                  b = points[j]!,
                  dx = b[0] - a[0],
                  dy = b[1] - a[1],
                  len = Math.hypot(dx, dy),
                  r = 0.57;
                g.add(
                  new Line(
                    [a[0] + (dx / len) * r, a[1] + (dy / len) * r],
                    [b[0] - (dx / len) * r, b[1] - (dy / len) * r],
                    { stroke: s.emphasis, strokeWidth: 0.04 },
                  ),
                );
              }
          points.forEach(([x, y], i) =>
            g.add(
              new Circle({
                radius: 0.53,
                fill: s.palette.paper,
                stroke: i === 0 && m.question === 'one' ? s.bad : s.soft,
                strokeWidth: 0.04,
              }).moveTo([x, y]),
              label(i + 1, x, y, s.palette.ink, 0.7),
            ),
          );
          g.add(
            label(
              m.question === 'any' ? 'Five people, ten distinct pairs' : 'One marked person, four comparisons',
              0,
              -3.7,
              s.palette.ink,
              0.66,
            ),
          );
          g.key = 'birthday-growth';
          return g;
        },
      },
      {
        id: 'count',
        title: `${m.people} people create ${m.comparisons} comparisons`,
        line:
          m.question === 'any'
            ? 'Count each unordered pair once.'
            : 'The marked person has one comparison with each other person.',
        caption:
          m.question === 'any'
            ? `The ${m.people} people create ${m.people} × ${m.people - 1} / 2 = ${m.comparisons} unordered pairs. That count explains the many opportunities, but adding individual match probabilities would double-count overlapping events.`
            : `One marked person has ${m.people - 1} other people to compare with. This asks a narrower question than a match between any two people in the room.`,
        state: { people: m.people, question: m.question, comparisons: m.comparisons },
        draw: (s: Stage) =>
          new Group(
            stat(s, 'People', m.people, -4.6, 1, 'birthday-n'),
            stat(s, 'Comparisons', m.comparisons, 3.8, 1, 'birthday-pairs'),
            label(
              m.question === 'any' ? `${m.people} x ${m.people - 1} / 2` : `${m.people} - 1`,
              0,
              -1.9,
              s.palette.ink,
              0.85,
            ),
          ),
      },
      {
        id: 'avoid',
        title: 'First calculate no match',
        line: 'Each fraction is conditional on having avoided a match so far.',
        caption:
          m.question === 'any'
            ? `Person 2 must avoid one occupied date, giving 364/365. If that succeeds, person 3 must avoid two. Person ${m.people} must avoid ${m.people - 1} occupied dates. Multiplying all those conditional factors gives the no-match probability.`
            : `Each of the ${m.people - 1} other people must avoid the marked birthday. Every factor is 364/365. Multiplying the factors gives the probability that nobody matches that one date.`,
        state: { people: m.people, question: m.question, factors: m.factors, noMatch: m.noMatch },
        draw: (s: Stage) =>
          new Group(
            table(
              ['Person', 'Allowed days', 'All days'],
              m.factors.map((f) => [f.person, f.numerator, f.denominator]),
              s,
              { xs: [-4.8, 0, 4.8], y: 2.3, gap: 1.1, key: 'birthday-factors' },
            ),
            label(`Product through person ${m.people}: ${pct(m.noMatch)}`, 0, -3.35, s.palette.ink, 0.65),
          ),
      },
      {
        id: 'chance',
        title: `At least one match: ${pct(m.chance)}`,
        line: 'Subtract the no-match probability from one.',
        caption: `The no-match probability is ${pct(m.noMatch)}. Its complement, ${pct(m.chance)}, is the chance of ${m.question === 'any' ? 'at least one matching pair' : 'at least one person matching the marked birthday'} under this uniform 365-day model.`,
        state: { people: m.people, question: m.question, chance: m.chance, noMatch: m.noMatch },
        draw: (s: Stage) =>
          new Group(
            stat(s, 'No match', pct(m.noMatch), -4, 1.1, 'birthday-no'),
            stat(s, 'At least one match', pct(m.chance), 4, 1.1, 'birthday-yes'),
            label(`100% - ${pct(m.noMatch)} = ${pct(m.chance)}`, 0, -1.8, s.palette.ink, 0.78),
          ),
      },
      {
        id: 'sample',
        title: 'Repeat whole rooms',
        line: 'A finite sample fluctuates around the theoretical chance.',
        caption: `In ${m.sample.trials} repeatable simulated rooms, ${m.sample.matched} contain the requested match: ${pct(m.sample.observed)}. The formula gives ${pct(m.chance)}. The simulated proportion fluctuates with the rooms sampled; the formula counts all possible birthdays under the model.`,
        state: {
          people: m.people,
          question: m.question,
          sample: {
            seed: m.sample.seed,
            trials: m.sample.trials,
            matched: m.sample.matched,
            observed: m.sample.observed,
          },
          chance: m.chance,
        },
        draw: (s: Stage) =>
          new Group(
            stat(s, 'Matching rooms', `${m.sample.matched} / ${m.sample.trials}`, 0, 2, 'birthday-trials'),
            stat(s, 'Observed', pct(m.sample.observed), -4, -0.6, 'birthday-observed'),
            stat(s, 'Theory', pct(m.chance), 4, -0.6, 'birthday-theory'),
            label(`Seed ${m.sample.seed}; ${m.people} people in every room`, 0, -3.1, s.soft, 0.6),
          ),
      },
      {
        id: 'questions',
        title: 'Different questions, different chances',
        line: 'A marked birthday uses fewer comparisons than any matching pair.',
        caption: `With ${m.people} people, any matching pair has probability ${pct(m.any)}, while someone matching one marked person has probability ${pct(m.one)}. Both figures use the same uniform model.`,
        state: {
          people: m.people,
          any: m.any,
          one: m.one,
          anyPairs: (m.people * (m.people - 1)) / 2,
          onePairs: m.people - 1,
        },
        draw: (s: Stage) =>
          table(
            ['Question', 'Comparisons', 'Chance'],
            [
              ['Any pair', (m.people * (m.people - 1)) / 2, pct(m.any)],
              ['Marked person', m.people - 1, pct(m.one)],
            ],
            s,
            { xs: [-4.7, 0.4, 5.0], y: 1.8, gap: 1.35, key: 'birthday-questions' },
          ),
      },
    ];
    frames.splice(3, 0, {
      id: 'occupied',
      title: 'Which dates must person 5 avoid?',
      line:
        m.question === 'any'
          ? 'Suppose the first four people have different birthdays.'
          : 'Only the marked birthday matters in this question.',
      caption:
        m.question === 'any'
          ? 'Condition on no match among the first four people. They occupy four different dates, so person 5 has 361 acceptable dates out of 365. If that succeeds, person 6 must avoid five dates. The changing occupied set is why the no-match factors decrease.'
          : 'To avoid matching one marked person, each newcomer must avoid just that one date. Matches between two unmarked people are allowed. The allowed set stays at 364 dates out of 365 for every newcomer.',
      state: {
        people: m.people,
        question: m.question,
        occupied: m.question === 'any' ? 4 : 1,
        allowed: m.question === 'any' ? 361 : 364,
      },
      draw: (s: Stage) => {
        const occupied = m.question === 'any' ? 4 : 1;
        const grid = new Group(
          ...Array.from({ length: 365 }, (_, i) =>
            new Rectangle({
              width: 0.55,
              height: 0.16,
              fill: i < occupied ? s.bad : s.emphasis,
              fillOpacity: i < occupied ? 1 : 0.35,
              stroke: 'none',
            }).moveTo([((i % 20) - 9.5) * 0.68, 2.6 - Math.floor(i / 20) * 0.31]),
          ),
          label(`${occupied} occupied; ${365 - occupied} available`, 0, -3.75, s.palette.ink, 0.7),
        );
        grid.key = 'birthday-days';
        return grid;
      },
    });
    await lesson(this, frames);
  }
}
