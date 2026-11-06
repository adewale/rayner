// The birthday problem: the chance that some two of n people share a birthday, and that someone shares one
// marked person's. What it leaves out: birthdays are independent and equally likely over 365 days, with no
// 29 February, twins or seasonal birth patterns. The rooms the scene draws are one seeded sample each; a
// particular room illustrates matches but does not establish their probability, which birthdayChance gives.
export type BirthdayQuestion = 'any' | 'one';
export function birthdayChance(people: number, question: BirthdayQuestion, days = 365): number {
  if (!Number.isInteger(people) || people < 1 || people > 1000 || !Number.isInteger(days) || days < 1 || days > 1000)
    throw new Error('People and days must be integers from 1 to 1000');
  if (question !== 'any' && question !== 'one') throw new Error('Unknown birthday question');
  if (question === 'one') return 1 - ((days - 1) / days) ** (people - 1);
  if (people > days) return 1;
  let none = 1;
  for (let i = 0; i < people; i++) none *= (days - i) / days;
  return 1 - none;
}
export function matches(group: readonly number[], question: BirthdayQuestion): boolean {
  return question === 'any' ? new Set(group).size !== group.length : group.slice(1).includes(group[0]!);
}
// Park–Miller generator. Rejection sampling avoids a modulo bias in calendar days.
export function birthdaySample(people: number, question: BirthdayQuestion, trials = 1000, seed = 137) {
  birthdayChance(people, question);
  if (!Number.isInteger(trials) || trials < 1 || trials > 10000 || !Number.isInteger(seed) || seed < 1 || seed >= 2147483647)
    throw new Error('Invalid birthday sample size or seed');
  let value = seed;
  const nextDay = () => {
    let u: number;
    const limit = Math.floor(2147483646 / 365) * 365;
    do {value = value * 16807 % 2147483647; u = value - 1;} while (u >= limit);
    return u % 365 + 1;
  };
  let matched = 0;
  let first: number[] = [];
  for (let t = 0; t < trials; t++) {
    const group = Array.from({length: people}, nextDay);
    if (t === 0) first = group;
    if (matches(group, question)) matched++;
  }
  return {seed, trials, matched, first, observed: matched / trials};
}
/** Unordered pairs among n people: each of n pairs with n - 1 others, and each pair is counted twice that way. */
export const pairCount = (people: number) => (people * (people - 1)) / 2;
/** The smallest room whose chance of the question's match is at least one half. */
export function evenOdds(question: BirthdayQuestion, days = 365): number {
  let people = 1;
  while (birthdayChance(people, question, days) < 0.5) people++;
  return people;
}
/**
 * The pair shortcut: treat each comparison as an independent 1-in-days chance. Exact for comparisons with one
 * fixed birthday; for every pair in a room it is an approximation, because pairs share people.
 */
export const pairShortcut = (comparisons: number, days = 365) => 1 - ((days - 1) / days) ** comparisons;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Day 1 to 365 of a year without 29 February, as a date: 31 is '31 Jan', 116 is '26 Apr'. */
export function dateOf(day: number): string {
  if (!Number.isInteger(day) || day < 1 || day > 365) throw new Error('A day of the year runs from 1 to 365');
  let month = 0;
  while (day > LENGTHS[month]!) day -= LENGTHS[month++]!;
  return `${day} ${MONTHS[month]}`;
}
/** Everything the explainer shows about one room size, for the any-pair question it asks. */
export function birthdayStory(people: number) {
  const sample = birthdaySample(people, 'any'),
    chance = birthdayChance(people, 'any'),
    counts = new Map<number, number>();
  for (const day of sample.first) counts.set(day, (counts.get(day) ?? 0) + 1);
  const even = evenOdds('any');
  return {
    people,
    chance,
    noMatch: 1 - chance,
    pairs: pairCount(people),
    others: people - 1,
    /** The chance that someone shares one marked person's birthday. */
    one: birthdayChance(people, 'one'),
    sample,
    dates: sample.first.map(dateOf),
    /** Dates the first sampled room repeats, in the order they first appear. */
    shared: [...counts].filter(([, n]) => n > 1).map(([day, n]) => ({ day, date: dateOf(day), people: n })),
    /** The pairs of people, by index in the room, whose sampled birthdays are the same date. */
    matchedPairs: sample.first.flatMap((day, i) => sample.first.flatMap((other, j) => (j > i && other === day ? [[i, j] as [number, number]] : []))),
    even,
    evenPairs: pairCount(even),
    /** Other people one person needs for an even chance that someone shares their birthday. */
    evenOthers: evenOdds('one') - 1,
    shortcut: pairShortcut(pairCount(people)),
    /** Person k must avoid the k - 1 dates already taken, if no match has happened yet. */
    factors: [2, 3, people].map((person) => ({ person, numerator: 365 - (person - 1), denominator: 365 })),
    growth: [2, 3, 5, 10, 23, 40].map((n) => ({ people: n, pairs: pairCount(n), chance: birthdayChance(n, 'any') })),
  };
}
