import { Scene, Group, Circle, Line, Rectangle, Text } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { birthdayStory } from '../lib/birthday-paradox.ts';
import type { LessonFrame } from '../lib/lesson-drawing.ts';
import { label, tile, table, stat } from '../lib/lesson-drawing.ts';

/** lesson() from lesson-drawing, with frames that can be detail steps after the ending. */
async function lesson(scene: Scene, frames: readonly (LessonFrame & { detail?: boolean })[]) {
  const s = stage(scene, { style: 'github-light', headingSize: 0.6 });
  for (const frame of frames) {
    await scene.step(frame.id, {
      title: frame.title,
      line: frame.line,
      caption: frame.caption,
      ...(frame.detail ? { detail: true } : {}),
    });
    await s.clear({ runTime: 0.18 });
    scene.state = { ...JSON.parse(JSON.stringify(frame.state)), phase: frame.id };
    const drawing = frame.draw(s);
    s.reading(drawing);
    // Describe actual drawn labels, not the state object or the authored caption.
    const words = drawing
      .family()
      .filter((m): m is Text => m instanceof Text)
      .map((t) => t.text)
      .filter(Boolean);
    await s.enter(drawing, { runTime: 0.24, describe: words.join('. ') });
  }
}

const pct = (p: number) => (100 * p).toFixed(1) + '%';
const pct2 = (p: number) => (100 * p).toFixed(2) + '%';
const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const words = ['no', 'one', 'two', 'three', 'four', 'five'];
/** The script's one-sentence answer; test/learning-models.test.ts holds its numbers to the model. */
export const ANSWER = 'Just 23 people give a better than even chance that two share a birthday, because 23 people make 253 pairs';
const REMEMBER =
  'A room makes a shared birthday likely long before it fills the year, because every person pairs with every other.';

export default class BirthdayParadox extends Scene {
  static meta = {
    id: 'birthday-paradox',
    title: 'How many people make a shared birthday likely?',
    sources: ['https://pudding.cool/2018/04/birthday-paradox/', 'https://mathworld.wolfram.com/BirthdayProblem.html'],
    // The script's answer and check questions (script.md); the chance step states the answer in every case.
    answer: ANSWER,
    checks: [
      {
        question: 'A 24th person walks into the room of 23. How many new pairs does that make, and how many pairs are there now?',
        answer: '23 new pairs, one with each person already there, so 276 pairs in all.',
      },
      {
        question: 'A room holds 30 people. How many pairs is that, and is a shared birthday more likely than not?',
        answer: '30 × 29 / 2 = 435 pairs. Yes: the exact chance is 70.6%, and the pair shortcut gives 69.7%.',
      },
      {
        question: 'On a planet with a 100-day year, how many people make a shared birthday more likely than not?',
        answer:
          '13. Thirteen people make 78 pairs, each a 1-in-100 chance, and the exact chance of a shared birthday is 55.7%; twelve people give 49.7%.',
      },
    ],
  };
  static settings = [
    {
      id: 'people',
      label: 'People in the room',
      default: '23',
      options: [10, 23, 40].map((n) => ({ value: String(n), label: String(n) })),
    },
  ];
  override async construct() {
    const m = birthdayStory(Number(settingsOf(this).people)),
      n = m.people;
    const sharedDays = new Set(m.shared.map((d) => d.day));
    /** The room as date cards; `lit` outlines the cards whose date appears more than once. */
    const room = (lit: boolean, footer: string) => (s: Stage) => {
      // A phone opening shows about 13.8 units across, so the widest row stays inside that.
      const big = n > 30,
        cols = 5,
        dx = big ? 2.6 : 2.7,
        dy = big ? 0.8 : 1.05;
      const cards = new Group(
        ...m.sample.first.map((day, i) =>
          tile(m.dates[i]!, ((i % cols) - (cols - 1) / 2) * dx, 2.5 - Math.floor(i / cols) * dy, dx - 0.15, big ? 0.74 : 0.8, s, {
            active: lit && sharedDays.has(day),
            size: big ? 0.6 : 0.64,
            key: `person-${i}`,
          }),
        ),
      );
      cards.key = 'birthday-people';
      return new Group(cards, label(footer, 0, big ? -3.85 : -3.6, s.palette.ink, 0.62, 'birthday-footer'));
    };
    /** n people on a circle, joined by every pair (or, with `you`, only the pairs with person 0). */
    const web = (you: boolean) => (s: Stage) => {
      const r = 2.6,
        cy = -0.45,
        points = Array.from(
          { length: n },
          (_, i) => [Math.cos(Math.PI / 2 + (i * 2 * Math.PI) / n) * r, cy + Math.sin(Math.PI / 2 + (i * 2 * Math.PI) / n) * r] as const,
        );
      const lines = new Group(),
        width = n > 30 ? 0.012 : n > 15 ? 0.016 : 0.025;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          if (!you || i === 0)
            lines.add(new Line([...points[i]!], [...points[j]!], { stroke: s.emphasis, strokeWidth: you ? 0.025 : width, strokeOpacity: 0.75 }));
      lines.key = you ? 'birthday-you-lines' : 'birthday-pair-lines';
      const dots = new Group(
        ...points.map((p, i) =>
          new Circle({ radius: n > 30 ? 0.11 : 0.15, fill: you && i === 0 ? s.bad : s.palette.ink, stroke: 'none' }).moveTo([...p]),
        ),
      );
      dots.key = 'birthday-dots';
      const g = new Group(lines, dots);
      if (you) g.add(label('You', 0, cy + r + 0.45, s.bad, 0.6, 'birthday-you'));
      g.add(
        you ? stat(s, 'Comparisons', m.others, -5.4, 0.2, 'birthday-comparisons') : stat(s, 'Pairs', m.pairs, -5.4, 0.2, 'birthday-pairs'),
        stat(s, 'Chance', pct(you ? m.one : m.chance), 5.4, 0.2, 'birthday-chance'),
        label(
          you ? `An even chance would take ${m.evenOthers} others` : `${n} × ${n - 1} / 2 = ${m.pairs} pairs`,
          0,
          -3.75,
          s.palette.ink,
          0.62,
          'birthday-footer',
        ),
      );
      return g;
    };
    const shared = m.shared.map((d) => d.date);
    const frames: (LessonFrame & { detail?: boolean })[] = [
      {
        id: 'room',
        title: 'How many people make a shared birthday likely?',
        line: 'Predict: how many people make a shared birthday an even bet?',
        caption: `Each card is one person in a room of ${n}, with a birthday drawn at random. Like the Pudding’s explainer, the model gives every day of a 365-day year the same chance and leaves out 29 February. A year has 365 days, so a match can seem to need a crowd: half of 365 is about 183. Make a guess, then look for a date that appears twice in this room.`,
        state: { people: n, sample: m.sample.first, dates: m.dates },
        draw: room(false, `${n} people, ${n} random birthdays`),
      },
      {
        id: 'chance',
        title: shared.length
          ? `This room of ${n} already has ${words[shared.length] ?? shared.length} shared birthdays`
          : `No shared birthday in this room of ${n}`,
        line: shared.length ? `Outlined: ${list(shared)}, each on more than one card.` : 'Every date in this room is different.',
        caption: `${
          shared.length
            ? `${list(m.shared.map((d) => `${d.date} belongs to ${words[d.people] ?? d.people} people`))}.`
            : `All ${n} dates differ.`
        } ${m.chance < 0.5 ? `Most rooms of ${n} have no match` : `Rooms of ${n} often match`}: of ${m.sample.trials.toLocaleString('en')} random rooms, ${m.sample.matched} had a shared birthday, and the exact chance is ${pct(m.chance)}. ${ANSWER}. The next steps count those pairs.`,
        state: {
          people: n,
          shared: m.shared,
          chance: m.chance,
          sample: { seed: m.sample.seed, trials: m.sample.trials, matched: m.sample.matched, observed: m.sample.observed },
        },
        draw: room(true, `${shared.length ? `Shared: ${list(shared)}` : 'No shared date'}. Chance: ${pct(m.chance)}`),
      },
      {
        id: 'you',
        title: `Your own birthday: only ${m.others} chances to match`,
        line: 'Predict: how many comparisons does the whole room make?',
        caption: `The Pudding’s explainer notes that we usually picture this by comparing ourselves with 365 possible days. Mark one person as you. You make ${m.others} comparisons, one with each other person, each a 1-in-365 chance. The chance that someone here shares your birthday is only ${pct(m.one)}, and an even chance would take ${m.evenOthers} other people.`,
        state: { people: n, others: m.others, one: m.one, evenOthers: m.evenOthers },
        draw: web(true),
      },
      {
        id: 'pairs',
        title: `Any two can match: ${n} people make ${m.pairs} pairs`,
        line:
          n === m.even
            ? `The same ${m.pairs} comparisons you would need ${m.evenOthers} other people to make.`
            : `${m.even} people make ${m.evenPairs} pairs: the ${m.evenOthers} you would need alone.`,
        caption: `A shared birthday doesn’t have to include you. Each of the ${n} people pairs with ${n - 1} others, and that counts every pair twice, so there are ${n} × ${n - 1} / 2 = ${m.pairs} pairs, ${n / 2} times your ${m.others}. ${
          n === m.even
            ? `That is the ${m.evenPairs} comparisons you would need ${m.evenOthers} other people to make on your own.`
            : `At ${m.even} people the room makes ${m.evenPairs} pairs, the ${m.evenOthers} comparisons you would need ${m.evenOthers} other people to make on your own.`
        } Every pair is a chance to match, and the chance of a match among all ${m.pairs} is ${pct(m.chance)}.`,
        state: { people: n, pairs: m.pairs, others: m.others, chance: m.chance, one: m.one, even: m.even, evenPairs: m.evenPairs },
        draw: web(false),
      },
      {
        id: 'growth',
        title: 'Pairs grow far faster than people',
        line: 'Each newcomer adds a pair with everyone already there.',
        caption: (() => {
          const [two, three, five, ten] = m.growth,
            last = m.growth.at(-1)!;
          return `Two people make ${two!.pairs} pair, three make ${three!.pairs}, five make ${five!.pairs}: each newcomer adds a pair with everyone already in the room. People grow one at a time, pairs by the size of the room, so doubling ${five!.people} people to ${ten!.people} takes the pairs from ${five!.pairs} to ${ten!.pairs}. The bars share one scale: at ${last.people} people the pairs bar is ${last.pairs / last.people} times as long as the people bar. The outlined row is this room.`;
        })(),
        state: { people: n, growth: m.growth },
        draw: (s: Stage) => {
          const y0 = 2.4,
            gap = 0.82,
            x0 = 0.4,
            scale = 6.7 / m.growth.at(-1)!.pairs;
          const g = new Group(
            table(
              ['People', 'Pairs', 'Chance'],
              m.growth.map((row) => [row.people, row.pairs, pct(row.chance)]),
              s,
              { xs: [-6.1, -3.8, -1.4], y: y0, gap, key: 'birthday-growth', size: 0.6 },
            ),
          );
          m.growth.forEach((row, r) => {
            const y = y0 - (r + 1) * gap;
            const bars = new Group(
              new Rectangle({ width: Math.max(0.02, row.people * scale), height: 0.14, fill: s.soft, stroke: 'none' }).moveTo(
                [x0 + (row.people * scale) / 2, y + 0.15],
                [0, 0],
              ),
              new Rectangle({ width: Math.max(0.02, row.pairs * scale), height: 0.3, fill: s.emphasis, stroke: 'none' }).moveTo(
                [x0 + (row.pairs * scale) / 2, y - 0.1],
                [0, 0],
              ),
            );
            bars.key = `birthday-bars-${row.people}`;
            g.add(bars);
            if (row.people === n) {
              const outline = new Rectangle({ width: 14.6, height: 0.74, fill: 'none', stroke: s.emphasis, strokeWidth: 0.03 }).moveTo([0, y]);
              outline.key = 'birthday-this-room';
              g.add(outline);
            }
          });
          g.add(label('Thin bars: people. Thick bars: pairs, on one scale.', 0, -3.65, s.palette.ink, 0.6, 'birthday-footer'));
          return g;
        },
      },
      {
        id: 'estimate',
        title: `${m.pairs} pairs at 1 in 365 each: about ${pct(m.shortcut)}`,
        line: `The exact chance is ${pct(m.chance)}: pairs that share people are not independent.`,
        caption: `Each pair shares a birthday with chance 1 in 365, so it misses with chance 364/365. If the ${m.pairs} pairs missed independently, all of them would miss with chance 364/365 multiplied ${m.pairs} times, ${pct2(1 - m.shortcut)}, leaving ${pct2(m.shortcut)} for a match. The exact chance is ${pct2(m.chance)}. The shortcut is close but not exact because pairs share people: if Ann matches Ben and Ben matches Cal, Ann must match Cal. For your own ${m.others} comparisons the same sum is exact, ${pct(m.one)}, because each involves your one birthday. ${REMEMBER}`,
        state: { people: n, pairs: m.pairs, shortcut: m.shortcut, chance: m.chance, one: m.one },
        draw: (s: Stage) =>
          new Group(
            label('One pair shares a birthday: 1 in 365', 0, 2.2, s.palette.ink, 0.66),
            label(`All ${m.pairs} pairs miss: 364/365, ${m.pairs} times over`, 0, 1.2, s.palette.ink, 0.66),
            label(`= ${pct2(1 - m.shortcut)} chance of no match`, 0, 0.35, s.palette.ink, 0.66),
            stat(s, 'Pair shortcut', pct2(m.shortcut), -3.6, -1.7, 'birthday-shortcut'),
            stat(s, 'Exact', pct2(m.chance), 3.6, -1.7, 'birthday-exact'),
            label('Close, not exact: pairs share people', 0, -3.6, s.soft, 0.62, 'birthday-footer'),
          ),
      },
      {
        id: 'exact',
        detail: true,
        title: 'The exact count: each newcomer avoids the dates already taken',
        line: `Person ${n} must avoid ${n - 1} taken dates: ${365 - (n - 1)} of 365 are free.`,
        caption: `To count exactly, add people one at a time and ask each to miss every date taken so far. Person 2 avoids one date, 364/365; if that succeeds, person 3 avoids two, 363/365; person ${n} avoids ${n - 1}, ${365 - (n - 1)}/365. Multiplying all ${n - 1} fractions gives ${pct2(m.noMatch)} for no match at all, so the chance of at least one shared birthday is ${pct2(m.chance)}.`,
        state: { people: n, factors: m.factors, noMatch: m.noMatch, chance: m.chance, occupied: n - 1, allowed: 365 - (n - 1) },
        draw: (s: Stage) => {
          const occupied = n - 1;
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
            label(`Person ${n}: ${occupied} dates taken, ${365 - occupied} free`, 0, -3.75, s.palette.ink, 0.66),
          );
          grid.key = 'birthday-days';
          return grid;
        },
      },
    ];
    await lesson(this, frames);
  }
}
