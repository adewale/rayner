// Insert-only Bloom filter. Three seeded FNV-1a hashes are a small teaching
// implementation, not a reproduction of Jason Davies's double-hash implementation or a
// production filter. What it leaves out: deletion (clearBits, for the live step, shows why clearing
// a leaving name's bits is not one), counting filters, other numbers of hashes,
// and sizing a row for a target false-positive rate. The pass rates are measured over 10,000
// fixed untaken sample names for these hashes, not the independent-uniform estimate
// (setBits / size)^3, since these hashes need not be independent; and the counts of names
// that fill each row (12 at 16 bits, 45 at 32) belong to the insertion order in MORE.
import { refuse } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';
import { listed } from '../lib/format.ts';
export function fnv1a(text: string): number {
  let h = 2166136261;
  for (const byte of new TextEncoder().encode(text)) h = Math.imul(h ^ byte, 16777619) >>> 0;
  return h;
}
export function locations(word: string, size: number): number[] {
  if (!Number.isInteger(size) || size < 8 || size > 512) throw new Error('Filter size must be 8 to 512 bits');
  return [0, 1, 2].map(seed => fnv1a(`${seed}:${word}`) % size);
}
export function makeFilter(words: readonly string[], size: number): number[] {
  locations('', size);
  const bits = Array<number>(size).fill(0);
  for (const word of words) for (const i of locations(word, size)) bits[i] = 1;
  return bits;
}
export function membership(bits: readonly number[], word: string): boolean {
  return locations(word, bits.length).every(i => bits[i] === 1);
}
/** Which stored words set each bit: a bit records that some word set it, not which. */
export function owners(words: readonly string[], size: number): string[][] {
  const by = Array.from({length: size}, () => [] as string[]);
  for (const word of words) for (const i of new Set(locations(word, size))) by[i]!.push(word);
  return by;
}
/** The lesson's usernames: cat and dog are taken; owl, cat and wolf are looked up. wolf was
 * chosen because it passes the 16-bit filter on cat's and dog's bits and fails the 32-bit one. */
export const TAKEN = ['cat', 'dog'] as const;
export const LOOKUPS = ['owl', 'cat', 'wolf'] as const;
/** Names taken after cat and dog, in order, until the row is full: none of them is a lookup. */
export const MORE = ['ant', 'bee', 'cow', 'elk', 'fox', 'gnu', 'hen', 'jay', 'yak', 'ape', 'bat', 'emu', 'pig', 'rat', 'ram', 'koi', 'asp', 'cod', 'doe', 'ewe', 'hog', 'kit', 'pug', 'sow', 'auk', 'boa', 'cub', 'dab', 'eft', 'gar', 'imp', 'kid', 'lark', 'mole', 'newt', 'orca', 'puma', 'seal', 'toad', 'vole', 'wasp', 'wren', 'crab', 'deer', 'frog', 'goat', 'hare', 'ibis', 'lion', 'lynx'] as const;
/**
 * Keep taking names from MORE after cat and dog until every bit is set: the names taken, the set bits after each
 * one, the full row, and how many of the 10,000 untaken sample names then pass.
 */
export function saturation(size: 16 | 32) {
  const words: string[] = [...TAKEN], trail = [{taken: words.length, setBits: makeFilter(words, size).filter(b => b === 1).length}];
  for (const word of MORE) {
    if (trail.at(-1)!.setBits === size) break;
    words.push(word);
    trail.push({taken: words.length, setBits: makeFilter(words, size).filter(b => b === 1).length});
  }
  const bits = makeFilter(words, size);
  if (bits.includes(0)) throw new Error(`MORE is too short to fill ${size} bits`);
  const sample = Array.from({length: 10000}, (_, i) => `sample${i}`);
  return {size, words, trail, bits, owners: owners(words, size), lookups: LOOKUPS.map(word => membership(bits, word)),
    sampleSize: sample.length, samplePass: sample.filter(word => membership(bits, word)).length};
}
export function bloomStory(size: 16 | 32) {
  const words: string[] = [...TAKEN], first = makeFilter(words.slice(0, 1), size), bits = makeFilter(words, size);
  const queries = LOOKUPS.map(word => ({
    word, locations: locations(word, size), maybe: membership(bits, word), stored: words.includes(word),
  }));
  // 10,000 untaken names: enough that the two sizes' pass rates (about 2.7% and 0.65%) are not sampling noise.
  const sample = Array.from({length: 10000}, (_, i) => `sample${i}`);
  const setBits = bits.filter(b => b === 1).length;
  return {size, words, first, bits, owners: owners(words, size), queries, exactLookups: queries.filter(q => q.maybe).length,
    setBits,
    /** The chance that a name whose three positions are independent and uniform lands only on set bits. */
    passChance: (setBits / size) ** 3,
    sampleSize: sample.length, sampleFalsePositives: sample.filter(word => membership(bits, word)).length};
}

// ---- the row as a machine: the reader takes names, checks names, and clears a departing name's bits ----
/**
 * The row the live step holds: its bits, which names set each one (the fills; the filter itself keeps
 * only the 1s), the names taken, the names whose bits someone cleared, and the last name checked with
 * the filter's answer and whether it is taken.
 */
export interface Row {
  size: 16 | 32;
  bits: number[];
  owners: string[][];
  taken: string[];
  cleared: string[];
  check: { word: string; locations: number[]; maybe: boolean; taken: boolean } | null;
}
/** What the reader can do to the row: take eel or owl, check wolf, owl or cat, and clear dog's bits as dog leaves. */
export const ROW_EVENTS = ['take eel', 'take owl', 'check wolf', 'check owl', 'check cat', 'clear dog'] as const;
export type RowEvent = (typeof ROW_EVENTS)[number];
/** The row with cat and dog taken, as the story leaves it before the row fills. */
export function rowStart(size: 16 | 32): Row {
  return { size, bits: makeFilter(TAKEN, size), owners: owners(TAKEN, size), taken: [...TAKEN], cleared: [], check: null };
}
/** Take `word`: its three bits become 1, and the fills record that it set them. */
export function take(row: Row, word: string): Row {
  const at = new Set(locations(word, row.size));
  return {
    ...row,
    bits: row.bits.map((b, i) => (at.has(i) ? 1 : b)),
    owners: row.owners.map((o, i) => (at.has(i) && !o.includes(word) ? [...o, word] : o)),
    taken: [...row.taken, word],
    check: null,
  };
}
/**
 * Clear `word`'s three bits back to 0 as it leaves, the deletion an insert-only filter cannot make: a bit
 * does not say which names set it, so clearing it clears it for every other name that set it too.
 */
export function clearBits(row: Row, word: string): Row {
  const at = new Set(locations(word, row.size));
  return {
    ...row,
    bits: row.bits.map((b, i) => (at.has(i) ? 0 : b)),
    owners: row.owners.map((o, i) => (at.has(i) ? [] : o)),
    taken: row.taken.filter((w) => w !== word),
    cleared: [...row.cleared, word],
    check: null,
  };
}
/** Look `word` up: its positions, the filter's answer (maybe only when all three bits are 1), and whether it is taken. */
export function check(row: Row, word: string): Row {
  return { ...row, check: { word, locations: locations(word, row.size), maybe: membership(row.bits, word), taken: row.taken.includes(word) } };
}
/** The model's step for a reader's event: a new row, or why the row refuses it. */
export function rowNext(row: Row, event: RowEvent): Row | Refusal {
  const [verb, word] = event.split(' ') as ['take' | 'check' | 'clear', string];
  if (verb === 'check') return check(row, word);
  if (verb === 'take')
    return row.taken.includes(word) ? refuse(`${word} is taken already, and its bits ${listed(locations(word, row.size))} are set`) : take(row, word);
  return row.taken.includes(word) ? clearBits(row, word) : refuse(`${word}’s bits are cleared already: ${word} has left`);
}
