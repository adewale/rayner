import { Scene, Group, Rectangle, Text } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import type { Stage, StagedStep } from '../../../explain/index.ts';
import { birthdayStory } from './model.ts';
import { label, tile, stat } from '../../../explain/drawing.ts';
import { stagedStep } from '../../../explain/index.ts';
import { listed, numberWord, percent } from '../lib/format.ts';

const pct2 = (p: number) => percent(p, { digits: 2 });
/** The script's one-sentence answer; test/learning-models.test.ts holds its numbers to the model. */
export const ANSWER =
  'A room of 23 people gives a better than even chance that two share a birthday, because 23 people make 253 pairs, each a chance to match';

export default class BirthdayParadox extends Scene {
  static meta = {
    id: 'birthday-paradox',
    title: 'How many people make a shared birthday likely?',
    sources: ['https://pudding.cool/2018/04/birthday-paradox/', 'https://mathworld.wolfram.com/BirthdayProblem.html'],
    // The script's answer and check questions (script.md); the chance step states the answer in every scenario.
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
        says: 'every day of a 365-day year the same chance',
        test: 'test/learning-models.test.ts: birthday formulas match exhaustive small calendars',
      },
      {
        says: 'an even chance would take',
        test: 'test/learning-models.test.ts: the birthday story: thresholds, pairs',
      },
      {
        says: 'what would it take for nobody to match',
        test: 'test/learning-models.test.ts: birthday formulas match exhaustive small calendars',
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
    /** The room as date cards, one per sampled day; the cards whose day is in `lit` are outlined. */
    const room = (s: Stage, days: readonly number[], dates: readonly string[], lit: readonly number[], footer: string) => {
      // A phone opening shows about 13.8 units across, so the widest row stays inside that.
      const big = days.length > 30,
        cols = 5,
        dx = 2.6,
        dy = big ? 0.8 : 1.05;
      const cards = new Group(
        ...days.map((day, i) =>
          tile(dates[i]!, ((i % cols) - (cols - 1) / 2) * dx, 2.5 - Math.floor(i / cols) * dy, dx - 0.15, big ? 0.74 : 0.8, s, {
            active: lit.includes(day),
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
     * `count` is the comparisons (with `you`) or pairs shown, `chance` their chance of a match, and `matched` the pairs
     * of cards, by index, whose dates are the same.
     */
    const pairGrid = (
      s: Stage,
      { you, people: n, count, chance, matched: matchedPairs, footer }:
        { you: boolean; people: number; count: number; chance: number; matched: readonly (readonly number[])[]; footer: string },
    ) => {
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
      const matched = new Group(...matchedPairs.map(([i, j]) => square(j!, i!, s.bad, 1, 1.3)));
      matched.key = 'birthday-matched-pairs';
      const g = new Group(rest, squares, matched);
      g.add(
        label(you ? 'You: card 1' : 'card 1', x0, y0 + 0.28, you ? s.bad : s.soft, 0.42, 'birthday-you').moveTo([x0, y0 + 0.28], [-1, 0]),
        label('card 2', x0 - 0.15, at(1, 0)[1], s.soft, 0.42).moveTo([x0 - 0.15, at(1, 0)[1]], [1, 0]),
        label(`card ${n}`, x0 - 0.15, at(n - 1, 0)[1], s.soft, 0.42).moveTo([x0 - 0.15, at(n - 1, 0)[1]], [1, 0]),
        you ? stat(s, 'Comparisons', count, -4.9, 0.2, 'birthday-comparisons') : stat(s, 'Pairs', count, -4.9, 0.2, 'birthday-pairs'),
        stat(s, 'Chance', percent(chance), 4.9, 0.2, 'birthday-chance'),
        label(footer, 0, -3.75, s.palette.ink, 0.58, 'birthday-footer'),
      );
      return g;
    };
    const shared = m.shared.map((d) => d.date);
    const five = m.growth.find((r) => r.people === 5)!,
      ten = m.growth.find((r) => r.people === 10)!;
    const frames: StagedStep[] = [
      stagedStep({
        id: 'room',
        title: 'Do two of these people share a birthday?',
        line: 'Predict: what is the chance that a room this size holds a shared birthday?',
        caption: `A year has 365 days, so a match can seem to need a crowd. Each card is one person. Before searching the dates, guess how likely a shared birthday is in a room this size. The chances on this page assume independent birthdays, and give every day of a 365-day year the same chance, with no 29 February.`,
        state: { people: n, sample: m.sample.first, dates: m.dates },
        draw: (st, s) => room(s, st.sample, st.dates, [], `${st.people} people, ${st.people} random birthdays`),
      }),
      stagedStep({
        id: 'chance',
        title: shared.length
          ? `This room of ${n} already has ${numberWord(shared.length)} shared birthdays`
          : `No shared birthday in this room of ${n}`,
        line: `Is that luck, or usual for a room of ${n}?`,
        caption: `${
          shared.length
            ? m.shared.every((d) => d.people === m.shared[0]!.people)
              ? `The outlined cards repeat ${listed(shared)}, each on ${numberWord(m.shared[0]!.people)} cards. `
              : `The outlined cards repeat dates: ${listed(m.shared.map((d) => `${d.date} is on ${numberWord(d.people)} cards`))}. `
            : ''
        }${m.chance < 0.4 ? `Most rooms of ${n} have no match` : m.chance < 0.6 ? `About half of all rooms of ${n} have a match` : `Most rooms of ${n} have a match`}: of ${m.sample.trials.toLocaleString('en')} random rooms, ${m.sample.matched} had a shared birthday, and the exact chance is ${percent(m.chance)}. ${ANSWER}. The next steps count those pairs.`,
        // `days` and `dates`: the room's cards, as the room step recorded them.
        state: {
          people: n,
          shared: m.shared,
          chance: m.chance,
          sample: { seed: m.sample.seed, trials: m.sample.trials, matched: m.sample.matched, observed: m.sample.observed },
          days: m.sample.first,
          dates: m.dates,
        },
        draw: (st, s) => {
          const dates = st.shared.map((d) => d.date);
          return room(s, st.days, st.dates, st.shared.map((d) => d.day), `${dates.length ? `Shared: ${listed(dates)}` : 'No shared date'}. Chance: ${percent(st.chance)}`);
        },
        opening: ['birthday-people', 'birthday-footer'],
      }),
      stagedStep({
        id: 'you',
        title: `Your own birthday: only ${m.others} chances to match`,
        line: 'Predict: how many comparisons does the whole room make?',
        caption: `Mark the first card as you. Each square in the column compares your birthday with one other person’s. You have just one opportunity per person: the chance that someone here shares your birthday is only ${percent(m.one)}, and an even chance would take ${m.evenOthers} other people. But a match elsewhere in the room need not involve you.`,
        state: { people: n, others: m.others, one: m.one, evenOthers: m.evenOthers },
        draw: (st, s) =>
          pairGrid(s, { you: true, people: st.people, count: st.others, chance: st.one, matched: [], footer: `Your ${st.others} comparisons, one square each` }),
        opening: ['birthday-you-lines', 'birthday-comparisons', 'birthday-chance'],
      }),
      stagedStep({
        id: 'pairs',
        title: `Every pair drawn: ${n} people make ${m.pairs} pairs`,
        line:
          n === m.even
            ? `${m.pairs} squares: the number of comparisons your own even chance needed.`
            : `Your column of ${m.others} is one edge of a triangle of ${m.pairs}.`,
        caption: `Each newcomer can match everyone already there, so each card adds a row with one square for every card before it: ${m.pairs} pairs, against your column of ${m.others}. Pairs outgrow people: doubling a room from ${five.people} to ${ten.people} takes its pairs from ${five.pairs} to ${ten.pairs}. ${
          m.matchedPairs.length
            ? `The red squares are this room’s matches, on ${listed(shared)}.`
            : `No square here pairs two cards with the same date.`
        } ${
          n === m.even
            ? `The room shares among ${n} people the ${m.evenPairs} comparisons you would need alone.`
            : `A room of ${m.even} makes ${m.evenPairs} pairs, enough for a better than even chance.`
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
          // The dates the matched pairs share, which the footer names.
          sharedDates: shared,
          // The doubling the caption quotes, from the model's table of room sizes.
          doubling: [five, ten],
        },
        draw: (st, s) =>
          pairGrid(s, {
            you: false,
            people: st.people,
            count: st.pairs,
            chance: st.chance,
            matched: st.matchedPairs,
            footer: st.matchedPairs.length
              ? `One square per pair: ${st.pairs}. Red: ${listed(st.sharedDates)}`
              : `One square per pair: ${st.people} × ${st.people - 1} / 2 = ${st.pairs}`,
          }),
        opening: ['birthday-pair-lines', 'birthday-pairs', 'birthday-chance'],
      }),
      stagedStep({
        id: 'exact',
        kind: 'detail',
        title: `Counting exactly: person ${n} must miss ${n - 1} dates already taken`,
        line: `Predict: do ${m.pairs} pairs at 1 in 365 each give the same chance?`,
        caption: `Turn the question around: what would it take for nobody to match? Add people one at a time and ask each to miss every date taken so far. Provided earlier people have all missed, each new arrival has one fewer free date. Multiply those chances to get ${pct2(m.noMatch)} for no match, then subtract from 1: ${pct2(m.chance)} for a match. The picture shows the free dates facing person ${n}.`,
        state: { people: n, factors: m.factors, noMatch: m.noMatch, chance: m.chance, occupied: n - 1, allowed: 365 - (n - 1) },
        draw: (st, s) => {
          const occupied = st.occupied;
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
            label(`Person ${st.people}: ${occupied} dates taken, ${st.allowed} free`, 0, -3.75, s.palette.ink, 0.66),
          );
          grid.key = 'birthday-days';
          return grid;
        },
      }),
      stagedStep({
        id: 'estimate',
        kind: 'detail',
        title: `${m.pairs} pairs at 1 in 365 each: about ${percent(m.shortcut)}`,
        line: `Close to the exact ${pct2(m.chance)}; overlapping comparisons need care.`,
        caption: `Treating the ${m.pairs} pairs as independent gives the nearby shortcut shown. It is the chance you would have of sharing your own birthday with one of ${m.pairs} other people. The room’s pairs are not jointly independent: if Ann matches Ben and Ben matches Cal, Ann must match Cal. The person-by-person calculation avoids that dependence. Comparisons with your one birthday do involve independent arrivals, so multiplying their miss chances gives the exact ${percent(m.one)} for a match with you.`,
        state: { people: n, pairs: m.pairs, shortcut: m.shortcut, chance: m.chance, one: m.one },
        draw: (st, s) =>
          new Group(
            label('One pair shares a birthday: 1 in 365', 0, 2.2, s.palette.ink, 0.66),
            label(`All ${st.pairs} pairs miss: 364/365, ${st.pairs} times over`, 0, 1.2, s.palette.ink, 0.66),
            label(`= ${pct2(1 - st.shortcut)} chance of no match`, 0, 0.35, s.palette.ink, 0.66),
            stat(s, 'Pair shortcut', pct2(st.shortcut), -3.6, -1.7, 'birthday-shortcut'),
            stat(s, 'Exact', pct2(st.chance), 3.6, -1.7, 'birthday-exact'),
            label('The gap: pairs that share a person', 0, -3.6, s.soft, 0.62, 'birthday-footer'),
          ),
      }),
    ];
    await stage(this, { style: 'github-light', headingSize: 0.6 }).steps(frames);
  }
}
