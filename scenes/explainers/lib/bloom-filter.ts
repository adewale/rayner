// Insert-only Bloom filter. Three seeded FNV-1a hashes are a small teaching
// implementation, not a reproduction of Jason Davies's double-hash implementation.
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
