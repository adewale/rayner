import { Scene } from '../../../src/index.ts';
import { settingsOf, stage, answerOf } from '../../../explain/index.ts';
import type { StagedStep } from '../../../explain/index.ts';
import { birthdayStory } from './model.ts';
import { drawDays, drawEstimate, pairGrid, room } from './picture.ts';
import { stagedStep } from '../../../explain/index.ts';
import { listed, numberWord, percent } from '../lib/format.ts';

const pct2 = (p: number) => percent(p, { digits: 2 });

export default class BirthdayParadox extends Scene {
  static meta = {
    id: 'birthday-paradox',
    sources: ['https://pudding.cool/2018/04/birthday-paradox/', 'https://mathworld.wolfram.com/BirthdayProblem.html'],
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
    const answer = answerOf(this);
    const m = birthdayStory(Number(settingsOf(this).people)),
      n = m.people;
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
        }${m.chance < 0.4 ? `Most rooms of ${n} have no match` : m.chance < 0.6 ? `About half of all rooms of ${n} have a match` : `Most rooms of ${n} have a match`}: of ${m.sample.trials.toLocaleString('en')} random rooms, ${m.sample.matched} had a shared birthday, and the exact chance is ${percent(m.chance)}. ${answer}. The next steps count those pairs.`,
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
        draw: (st, s) => drawDays(s, st.people, st.occupied, st.allowed),
      }),
      stagedStep({
        id: 'estimate',
        kind: 'detail',
        title: `${m.pairs} pairs at 1 in 365 each: about ${percent(m.shortcut)}`,
        line: `Close to the exact ${pct2(m.chance)}; overlapping comparisons need care.`,
        caption: `Treating the ${m.pairs} pairs as independent gives the nearby shortcut shown. It is the chance you would have of sharing your own birthday with one of ${m.pairs} other people. The room’s pairs are not jointly independent: if Ann matches Ben and Ben matches Cal, Ann must match Cal. The person-by-person calculation avoids that dependence. Comparisons with your one birthday do involve independent arrivals, so multiplying their miss chances gives the exact ${percent(m.one)} for a match with you.`,
        state: { people: n, pairs: m.pairs, shortcut: m.shortcut, chance: m.chance, one: m.one },
        draw: (st, s) => drawEstimate(s, st.pairs, st.shortcut, st.chance),
      }),
    ];
    await stage(this, { style: 'github-light', headingSize: 0.6 }).steps(frames);
  }
}
