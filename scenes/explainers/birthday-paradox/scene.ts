import { Scene, Group, Rectangle, Text } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { birthdayStory } from '../lib/birthday-paradox.ts';
import type { LessonFrame } from '../lib/lesson-drawing.ts';
import { label, tile, table, stat } from '../lib/lesson-drawing.ts';

/** lesson() from lesson-drawing, with frames that can be detail steps after the ending. */
async function lesson(scene: Scene, frames: readonly (LessonFrame & { detail?: boolean; reading?: readonly string[] })[]) {
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
    // What the step is about, when that is less than the whole drawing: a phone opens on it.
    s.reading(...(frame.reading ? drawing.family().filter((m) => frame.reading!.includes(m.key ?? '')) : [drawing]));
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
export const ANSWER =
  'A room of 23 people gives a better than even chance that two share a birthday, because 23 people make 253 pairs, each a chance to match';

export default class BirthdayParadox extends Scene {
  static meta = {
    id: 'birthday-paradox',
    title: 'How many people make a shared birthday likely?',
    sources: ['https://pudding.cool/2018/04/birthday-paradox/', 'https://mathworld.wolfram.com/BirthdayProblem.html'],
    // The script's answer and check questions (script.md); the chance step states the answer in every case.
    answer: ANSWER,
    checks: [
      {
        question:
          'Two separate rooms each hold 23 people. When everyone joins one room, how many new pairs become possible, and why can’t you just add the two rooms’ match probabilities?',
        answer:
          '529 new pairs: each of the 23 people in one room can now match each of the 23 in the other. The combined room has 1,035 pairs, compared with 506 within the two separate rooms. Adding the old probabilities misses the cross-room pairs and counts overlapping match events twice.',
      },
      {
        question:
          'On a planet with 100 equally likely birthdays, would 23 people still be needed for a better than even chance of a shared birthday? Use the person-by-person calculation to find the smallest room.',
        answer:
          'No: 13 people suffice. Multiply the chances of avoiding earlier birthdays, 100/100 × 99/100 × … × 88/100, and subtract from 1: about 55.7%. With 12 people it is about 49.7%. A smaller calendar makes each new pair more likely to match.',
      },
    ],
    // Sentences that reach past the rooms on screen, and the tests that hold them; the rest speak of their own step's squares.
    claims: [
      {
        says: 'gives every day of a 365-day year the same chance',
        test: 'test/learning-models.test.ts: birthday formulas match exhaustive small calendars',
      },
      {
        says: 'an even chance would take',
        test: 'test/learning-models.test.ts: the birthday story: thresholds, pairs',
      },
      {
        says: 'ask each to miss every date taken so far',
        test: 'test/learning-models.test.ts: birthday formulas match exhaustive small calendars',
      },
      { says: 'Your own birthday: only', shown: true as const },
      { says: 'Every pair drawn', shown: true as const },
      { says: 'one square for every card before it', shown: true as const },
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
        dx = 2.6,
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
    /**
     * Every pair as one square of a triangle: row k is the (k + 1)th card, with one square for each card before it,
     * so a newcomer adds a row as long as the room already is. With `you`, only the first column: the first card's pairs.
     */
    const pairGrid = (you: boolean) => (s: Stage) => {
      const cell = Math.min(0.32, 5.3 / (n - 1)),
        x0 = -((n - 1) * cell) / 2,
        y0 = 2.25;
      const at = (row: number, col: number): [number, number] => [x0 + (col + 0.5) * cell, y0 - (row - 0.5) * cell];
      const square = (row: number, col: number, fill: string, opacity: number, size = 0.82) =>
        new Rectangle({ width: cell * size, height: cell * size, fill, fillOpacity: opacity, stroke: 'none' }).moveTo(at(row, col));
      const squares = new Group();
      for (let row = 1; row < n; row++) for (let col = 0; col < (you ? 1 : row); col++) squares.add(square(row, col, s.emphasis, 0.55));
      squares.key = you ? 'birthday-you-lines' : 'birthday-pair-lines';
      // With `you`, the rest of the room's pairs, faint: the column is one part of the triangle the next step fills.
      const rest = new Group();
      if (you) for (let row = 2; row < n; row++) for (let col = 1; col < row; col++) rest.add(square(row, col, s.soft, 0.18));
      rest.key = 'birthday-other-pairs';
      // The pairs whose sampled birthdays are the same date, in red.
      const matched = new Group(...(you ? [] : m.matchedPairs).map(([i, j]) => square(j, i, s.bad, 1, 1.3)));
      matched.key = 'birthday-matched-pairs';
      const g = new Group(rest, squares, matched);
      g.add(
        label(you ? 'You: card 1' : 'card 1', x0, y0 + 0.28, you ? s.bad : s.soft, 0.42, 'birthday-you').moveTo([x0, y0 + 0.28], [-1, 0]),
        label('card 2', x0 - 0.15, at(1, 0)[1], s.soft, 0.42).moveTo([x0 - 0.15, at(1, 0)[1]], [1, 0]),
        label(`card ${n}`, x0 - 0.15, at(n - 1, 0)[1], s.soft, 0.42).moveTo([x0 - 0.15, at(n - 1, 0)[1]], [1, 0]),
        you ? stat(s, 'Comparisons', m.others, -4.9, 0.2, 'birthday-comparisons') : stat(s, 'Pairs', m.pairs, -4.9, 0.2, 'birthday-pairs'),
        stat(s, 'Chance', pct(you ? m.one : m.chance), 4.9, 0.2, 'birthday-chance'),
        label(
          you
            ? `Your ${m.others} comparisons, one square each`
            : m.matchedPairs.length
              ? `One square per pair: ${m.pairs}. Red: ${list(shared)}`
              : `One square per pair: ${n} × ${n - 1} / 2 = ${m.pairs}`,
          0,
          -3.75,
          s.palette.ink,
          0.58,
          'birthday-footer',
        ),
      );
      return g;
    };
    const shared = m.shared.map((d) => d.date);
    const frames: (LessonFrame & { detail?: boolean; reading?: readonly string[] })[] = [
      {
        id: 'room',
        title: 'Do two of these people share a birthday?',
        line: 'Predict: what is the chance that a room this size holds a shared birthday?',
        caption: `A year has 365 days, so a match can seem to need a crowd. Each card is one person. Before searching the dates, guess how likely a shared birthday is in a room this size. This calculation gives every day of a 365-day year the same chance, with independent birthdays and no 29 February.`,
        state: { people: n, sample: m.sample.first, dates: m.dates },
        draw: room(false, `${n} people, ${n} random birthdays`),
      },
      {
        id: 'chance',
        title: shared.length
          ? `This room of ${n} already has ${words[shared.length] ?? shared.length} shared birthdays`
          : `No shared birthday in this room of ${n}`,
        line: `Is that luck, or usual for a room of ${n}?`,
        caption: `${
          shared.length
            ? m.shared.every((d) => d.people === m.shared[0]!.people)
              ? `The outlined cards repeat ${list(shared)}, each on ${words[m.shared[0]!.people] ?? m.shared[0]!.people} cards. `
              : `The outlined cards repeat dates: ${list(m.shared.map((d) => `${d.date} is on ${words[d.people] ?? d.people} cards`))}. `
            : ''
        }${m.chance < 0.4 ? `Most rooms of ${n} have no match` : m.chance < 0.6 ? `About half of all rooms of ${n} have a match` : `Most rooms of ${n} have a match`}: of ${m.sample.trials.toLocaleString('en')} random rooms, ${m.sample.matched} had a shared birthday, and the exact chance is ${pct(m.chance)}. ${ANSWER}. The next steps count those pairs.`,
        state: {
          people: n,
          shared: m.shared,
          chance: m.chance,
          sample: { seed: m.sample.seed, trials: m.sample.trials, matched: m.sample.matched, observed: m.sample.observed },
        },
        draw: room(true, `${shared.length ? `Shared: ${list(shared)}` : 'No shared date'}. Chance: ${pct(m.chance)}`),
        reading: ['birthday-people', 'birthday-footer'],
      },
      {
        id: 'you',
        title: `Your own birthday: only ${m.others} chances to match`,
        line: 'Predict: how many comparisons does the whole room make?',
        caption: `Mark the first card as you. Each square in the column compares your birthday with one other person’s. You have just one opportunity per person: the chance that someone here shares your birthday is only ${pct(m.one)}, and an even chance would take ${m.evenOthers} other people. But a match elsewhere in the room need not involve you.`,
        state: { people: n, others: m.others, one: m.one, evenOthers: m.evenOthers },
        draw: pairGrid(true),
        reading: ['birthday-you-lines', 'birthday-comparisons', 'birthday-chance'],
      },
      {
        id: 'pairs',
        title: `Every pair drawn: ${n} people make ${m.pairs} pairs`,
        line:
          n === m.even
            ? `${m.pairs} squares: the number of comparisons your own even chance needed.`
            : `Which size of room makes the ${m.evenOthers} comparisons you would need alone?`,
        caption: `Each newcomer can match everyone already in the room. Each card adds a row with one square for every card before it, building a triangle of ${m.pairs} pairs instead of your column of ${m.others}. ${
          m.matchedPairs.length
            ? `The ${words[m.matchedPairs.length] ?? m.matchedPairs.length} red squares are this room’s matches, the pairs that drew ${list(shared)}.`
            : `No square pairs two cards with the same date in this room.`
        } Across all rooms of ${n}, at least one pair matches with chance ${pct(m.chance)}. ${
          n === m.even
            ? `Here the room makes the ${m.evenPairs} comparisons you would need alone by sharing them among ${n} people.`
            : `A room of ${m.even} makes ${m.evenPairs} pairs: enough comparisons for a better than even chance of a match under these assumptions.`
        }`,
        state: {
          people: n,
          pairs: m.pairs,
          others: m.others,
          chance: m.chance,
          one: m.one,
          even: m.even,
          evenPairs: m.evenPairs,
          matchedPairs: m.matchedPairs,
        },
        draw: pairGrid(false),
        reading: ['birthday-pair-lines', 'birthday-pairs', 'birthday-chance'],
      },
      {
        id: 'growth',
        detail: true,
        title: 'Each newcomer pairs with everyone already in the room',
        line: 'The thick bars outrun the thin ones as the room fills.',
        caption: (() => {
          const [, , five, ten] = m.growth;
          return `Each additional person adds one card but a comparison with everyone already present. That is why the thick pair bars grow faster than the thin people bars. Doubling from ${five!.people} people to ${ten!.people} more than doubles the pairs. The bars use one scale; the outlined row is this room.`;
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
        id: 'exact',
        detail: true,
        title: `Counting exactly: person ${n} must miss ${n - 1} dates already taken`,
        line: `Predict: do ${m.pairs} pairs at 1 in 365 each give the same chance?`,
        caption: `Turn the question around: what would it take for nobody to match? Add people one at a time and ask each to miss every date taken so far. Provided earlier people have all missed, each new arrival has one fewer free date. Multiply those chances to get ${pct2(m.noMatch)} for no match, then subtract from 1: ${pct2(m.chance)} for a match. The picture shows the free dates facing person ${n}.`,
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
      {
        id: 'estimate',
        detail: true,
        title: `${m.pairs} pairs at 1 in 365 each: about ${pct(m.shortcut)}`,
        line: `Close to the exact ${pct2(m.chance)}; overlapping comparisons need care.`,
        caption: `Treating the ${m.pairs} pairs as independent gives the nearby shortcut shown. They are not jointly independent: if Ann matches Ben and Ben matches Cal, Ann must match Cal. The person-by-person calculation avoids that dependence. Comparisons with your one birthday do involve independent arrivals, so multiplying their miss chances gives the exact ${pct(m.one)} for a match with you.`,
        state: { people: n, pairs: m.pairs, shortcut: m.shortcut, chance: m.chance, one: m.one },
        draw: (s: Stage) =>
          new Group(
            label('One pair shares a birthday: 1 in 365', 0, 2.2, s.palette.ink, 0.66),
            label(`All ${m.pairs} pairs miss: 364/365, ${m.pairs} times over`, 0, 1.2, s.palette.ink, 0.66),
            label(`= ${pct2(1 - m.shortcut)} chance of no match`, 0, 0.35, s.palette.ink, 0.66),
            stat(s, 'Pair shortcut', pct2(m.shortcut), -3.6, -1.7, 'birthday-shortcut'),
            stat(s, 'Exact', pct2(m.chance), 3.6, -1.7, 'birthday-exact'),
            label('The gap: pairs that share a person', 0, -3.6, s.soft, 0.62, 'birthday-footer'),
          ),
      },
    ];
    await lesson(this, frames);
  }
}
