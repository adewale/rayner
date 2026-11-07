// The script's check answers, computed from the model: rayner check holds script.md's to these.
import { listed } from '../lib/format.ts';
import { TAKEN, locations, makeFilter, membership } from './model.ts';

const bits = makeFilter([...TAKEN, 'eel'], 32);
/** The 32-bit filter once eel joins: eel's bits, and the verdicts on wolf and owl. */
export const EEL = { at: locations('eel', 32), wolf: membership(bits, 'wolf'), owl: membership(bits, 'owl'), owlZeros: locations('owl', 32).filter((i) => !bits[i]) };
/** The 16- and 32-bit filters with dog's bits cleared: cat's verdict, and the bits dog and cat share. */
export const CLEARED = ([16, 32] as const).map((size) => {
  const row = makeFilter([...TAKEN], size);
  for (const i of locations('dog', size)) row[i] = 0;
  return { size, cat: membership(row, 'cat'), shared: locations('dog', size).filter((i) => locations('cat', size).includes(i)) };
});

export const checks = {
  1: () => ({
    question: `In the 32-bit filter, someone also takes eel, whose hashes are ${listed(EEL.at)}. What does the filter now say about wolf, and about owl?`,
    answer: `wolf gets ${EEL.wolf ? 'maybe' : 'definitely not'}, a false positive: bit 23 now comes from eel, 22 from cat and 1 from dog and eel. owl still gets ${EEL.owl ? 'maybe' : 'definitely not'}: eel set bit 20, but bits ${listed(EEL.owlZeros)} are still 0.`,
  }),
  2: () =>
    `At 16 bits, definitely not: bit ${listed(CLEARED[0]!.shared)} was shared, so clearing dog’s bits cleared one of cat’s, and the filter turns away a taken name, which a Bloom filter must never do. At 32 bits it still says maybe, but only because dog’s bits there happen to miss cat’s. The row cannot tell which names set a bit, so clearing a departing name’s bits can erase evidence of another name.`,
};
