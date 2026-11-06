import { Scene, Group } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { bloomStory, locations, saturation } from './model.ts';
import { label } from '../../../explain/drawing.ts';
import { drawBits, drawPipeline, takenLabel, thousands } from './picture.ts';
import { listed, numberWord, percent } from '../lib/format.ts';

// Two decimals under 1%, so a rate of a few in a thousand does not read 0.0%.
const pct = (x: number) => percent(x, { under1: { digits: 2 } });

const count = (n: number) => numberWord(n, { zero: 'none' });
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

export default class BloomFilter extends Scene {
  static meta = {
    id: 'bloom-filter',
    sources: [
      'https://doi.org/10.1145/362686.362692',
      'https://www.jasondavies.com/bloomfilter/',
      'https://github.com/lcn2/fnv/blob/4001d0d4f6d81b29a02bda592c7712c68434525a/test_fnv.c',
    ],
    // Sentences that reach past the three lookups on screen, and the test that holds each for any names and row length.
    claims: [
      { says: 'the row itself stores only the 1s and keeps no trace of the name', test: 'test/learning-models.test.ts: insert-only filters never reject an inserted word' },
      { says: 'its fill shows both names, but the row records only the 1', test: 'test/learning-models.test.ts: insert-only filters never reject an inserted word' },
      { says: 'other names may have set every one of them, so the filter can only say maybe', test: 'test/learning-models.test.ts: concrete false positives still need storage' },
      { says: 'A taken name always finds its bits set, so the filter never wrongly says “not taken”', test: 'test/learning-models.test.ts: insert-only filters never reject an inserted word' },
      { says: 'could have been set by other names, so it can only say maybe', test: 'test/learning-models.test.ts: concrete false positives still need storage' },
      { says: 'Only cat and dog are taken', shown: true as const },
      { says: 'An untaken name gets through only when all three of its bits are already set', test: 'test/learning-models.test.ts: a name gets through only when all three of its bits are set' },
      { says: 'bits are 1: always maybe', test: 'test/learning-models.test.ts: a full row says maybe to every name' },
      { says: 'Keep taking names and the row only fills', test: 'test/learning-models.test.ts: the row only fills' },
      { says: 'From then on every name finds three 1s', test: 'test/learning-models.test.ts: a full row says maybe to every name' },
    ],
  };
  static settings = [
    {
      id: 'bits',
      label: 'Filter memory',
      default: '16',
      options: [
        { value: '16', label: '16 bits' },
        { value: '32', label: '32 bits' },
      ],
    },
  ];
  override async construct() {
    const size = Number(settingsOf(this).bits) as 16 | 32,
      m = bloomStory(size),
      other = bloomStory(size === 16 ? 32 : 16),
      full = saturation(size),
      otherFull = saturation(other.size),
      [absent, present, probe] = m.queries as [(typeof m.queries)[0], (typeof m.queries)[0], (typeof m.queries)[0]],
      otherProbe = other.queries[2]!;
    const [s16, s32] = size === 16 ? [m, other] : [other, m];
    const cat = locations('cat', size),
      dog = locations('dog', size);
    const shared = dog.filter((i) => m.first[i] === 1);
    /** Who set a bit, in words: a bit records that some name set it, never which. */
    const whoSet = (owners: string[]) => (owners.length > 1 ? 'both' : owners[0] ?? 'no name');
    const sources = (owners: readonly string[][], locs: readonly number[]) =>
      locs.map((j) => (owners[j]!.length ? `${j} from ${whoSet(owners[j]!)}` : `${j} still 0`));
    /** The full step's index, and the set bits after the first, middle and last count of names taken. */
    const FULL = 8;
    const milestones = (trail: typeof full.trail) => [0, Math.round((trail.length - 1) / 2), trail.length - 1].map((k) => trail[k]!);
    const zeros = (q: typeof absent) => q.locations.filter((j) => m.bits[j] === 0);
    const skipped = m.queries.filter((q) => !q.maybe).length,
      wasted = m.queries.filter((q) => q.maybe && !q.stored).length;
    const frames = [
      {
        id: 'question',
        title: 'Is this name taken? Can we skip the database?',
        line: `cat and dog are taken. ${size} bits in memory will try to answer first.`,
        caption: `A sign-up form checks each name a person types against the accounts database, one database read per check, and a read for a free name finds nothing. A row of ${size} bits kept in memory, all 0 to start, will sit in front of the database and try to answer “not taken” without the read.`,
      },
      {
        id: 'insert',
        title: `Taking cat sets bits ${listed(cat)}`,
        line: 'Three hash functions each turn the name into a position.',
        caption: `The three hash functions turn cat into positions in this row, and those bits become 1. The purple fill, keyed above the row, marks cat’s bits for us, but the row itself stores only the 1s and keeps no trace of the name.`,
      },
      {
        id: 'shared',
        title: shared.length
          ? `dog sets ${listed(dog)}. Bit ${listed(shared)} was already set by cat`
          : `dog sets ${listed(dog)}, none of them cat’s`,
        line: 'A set bit says some name set it, not which.',
        caption: shared.length
          ? `dog’s bits ${listed(dog)} take its brown fill. Bit ${listed(shared)} was already 1 from cat, so it stays 1; its fill shows both names, but the row records only the 1. When a name finds all its bits set, other names may have set every one of them, so the filter can only say maybe.`
          : `dog’s bits ${listed(dog)} take its brown fill, and none of them was already set by cat. The fills tell the names apart for us; the row itself holds ${m.setBits} identical 1s, and nothing in it says which name set bit ${dog[0]} or bit ${cat[0]}. When a name finds all its bits set, other names may have set every one of them, so the filter can only say maybe.`,
      },
      {
        id: 'absent',
        title: `${absent.word} finds a 0: definitely not taken`,
        line: `No database read: had ${absent.word} been taken, all three of its bits would be 1.`,
        caption: `Looking up ${absent.word} uses the same hashes as insertion. If the name had been inserted, its three bits would be set. It finds a 0, so it cannot have been inserted and the database read is skipped. This is an insert-only Bloom filter: taking names sets bits, and nothing clears them.`,
      },
      {
        id: 'present',
        title: `${present.word} finds three 1s: maybe, so ask the database`,
        line: 'Maybe hands the question to the database.',
        caption: `${present.word}’s bits ${listed(present.locations)} are all set. A taken name always finds its bits set, so the filter never wrongly says “not taken”. But three 1s could have been set by other names, so it can only say maybe and passes the check on; the database confirms ${present.word} is taken.`,
      },
      {
        id: 'predict',
        title: `${probe.word} is not taken. What does the filter say?`,
        line: `Predict: ${probe.word} hashes to ${listed(probe.locations)}. Maybe, or definitely not?`,
        caption: `Only cat and dog are taken. Find bits ${listed(probe.locations)} in the row. Will the filter answer “definitely not”, or say maybe and ask the database?`,
      },
      {
        id: 'false-positive',
        title: probe.maybe
          ? `Maybe: cat and dog set all of ${probe.word}’s bits`
          : `Definitely not: bit ${listed(zeros(probe))} is still 0`,
        line: probe.maybe
          ? `Each of ${probe.word}’s three bits was set by another name.`
          : `With ${other.size} bits, ${probe.word} finds ${listed(otherProbe.locations)}, all set by cat and dog.`,
        caption: probe.maybe
          ? `Read the fills: bit ${listed(sources(m.owners, probe.locations))}. The filter sees three 1s with no names attached, so it says maybe; the database is asked and answers not taken. That wasted read is a false positive: a maybe for a name that is not taken. With ${other.size} bits, ${probe.word} lands on ${listed(otherProbe.locations)}, and bit ${listed(otherProbe.locations.filter((j) => other.bits[j] === 0))} is still 0.`
          : `With ${size} bits, ${probe.word} lands on ${listed(probe.locations)}: bit ${listed(sources(m.owners, probe.locations))}. No name set bit ${listed(zeros(probe))}, so ${probe.word} is definitely free and the database is not asked. ${m.setBits} of these ${size} bits are set, against ${other.setBits} of ${other.size} in the shorter row, so an untaken name is more likely to land on a 0 here.`,
      },
      {
        id: 'pipeline',
        title: `The filter skips ${count(skipped)} read${skipped === 1 ? '' : 's'} and wastes ${count(wasted)}`,
        line: `Over ${thousands(m.sampleSize)} untaken names, ${pct(s16.sampleFalsePositives / s16.sampleSize)} pass at 16 bits and ${pct(s32.sampleFalsePositives / s32.sampleSize)} at 32.`,
        caption: `The upper table follows each lookup: a 0 skips the database; maybe sends the question on. An untaken name gets through only when all three of its bits are already set. A longer row leaves more empty positions, making that harder. The lower table tries both rows on the same ${thousands(m.sampleSize)} untaken names: fewer pass the larger row, so fewer reads are wasted. These are measured results for this sample and these hashes.`,
      },
      {
        id: 'full',
        title: `After ${full.words.length} names, all ${size} bits are 1: always maybe`,
        line: `Keep taking names and the row only fills: ${absent.word}, ruled out earlier, now gets maybe too.`,
        caption: `Each name taken can fill more of the remaining zeros, and the ${ordinal(full.words.length)} name fills the last. From then on every name finds three 1s: the filter says maybe and sends every check to the database, saving no reads. The zeros were its only evidence. With these names the ${size}-bit row fills after ${full.words.length} and the ${other.size}-bit row after ${otherFull.words.length}; how long more memory helps depends on where the names’ bits land.`,
      },
    ];

    await stage(this, { style: 'github-light', headingSize: 0.6 }).steps(
      frames.map((frame, i) => {
        const bits = i === 0 ? Array<number>(size).fill(0) : i === 1 ? m.first : i === FULL ? full.bits : m.bits;
        const query = i >= 3 && i <= 6 ? m.queries[Math.min(i - 3, 2)]! : null;
        // The prediction shows where the probe lands, not yet whether a bit stops it.
        const asking = frame.id === 'predict';
        const state = {
          size,
          bits,
          stored: i === 0 ? [] : i === 1 ? ['cat'] : i === FULL ? full.words : m.words,
          query,
          // Which names set each bit: the colours, which the filter itself does not keep.
          owners:
            i === 0 ? Array.from({ length: size }, () => []) : i === 1 ? m.owners.map((o) => o.filter((w) => w === 'cat')) : i === FULL ? full.owners : m.owners,
          exactLookups: i === 7 ? m.exactLookups : 0,
          ...(i === 7
            ? {
                queries: m.queries,
                setBits: m.setBits,
                passChance: m.passChance,
                sampleSize: m.sampleSize,
                sampleFalsePositives: m.sampleFalsePositives,
                // Both rows' results on the same sample, which the lower table compares.
                sizes: [s16, s32].map((story) => ({ size: story.size, setBits: story.setBits, sampleFalsePositives: story.sampleFalsePositives })),
              }
            : {}),
          // `ruledOut`: the untaken name a 0 bit stopped earlier, which the full row now lets through.
          ...(i === FULL ? { trail: full.trail, lookups: full.lookups, sampleSize: full.sampleSize, samplePass: full.samplePass, ruledOut: absent.word } : {}),
        };
        return {
          ...frame,
          state,
          draw: (st: typeof state, s: Stage) => {
            if (i === 7) return drawPipeline(s, st as Parameters<typeof drawPipeline>[1]);
            const query = st.query;
            // A lookup's bits; while inserting, the bits of the name just inserted.
            const active = query?.locations ?? (i === 1 || i === 2 ? locations(st.stored.at(-1)!, st.size) : []);
            // In the full row, bits set only by the later names are grey.
            const owners =
              i === FULL
                ? st.owners.map((o) => [...o.filter((w) => w === 'cat' || w === 'dog'), ...(o.some((w) => w !== 'cat' && w !== 'dog') ? ['more'] : [])])
                : st.owners;
            const grid = drawBits(s, st.bits, owners, active, (j) => !!query && !asking && !st.bits[j] && active.includes(j));
            const queryText =
              i === FULL
                ? `Set bits: ${milestones(st.trail!).map((t, k) => `${t.setBits} after ${t.taken}${k ? '' : ' names'}`).join(', ')}`
                : !query
              ? 'Grey number above each box: its position'
              : frame.id === 'false-positive'
                ? `${query.word}: ${sources(st.owners, query.locations).join(', ')}`
                : `Lookup ${query.word}: bits ${query.locations.join(', ')}`;
            const answerText =
              i === FULL
                ? `Every lookup says maybe, ${st.ruledOut} included`
                : !query
              ? i === 0
                ? 'Three hashes per name; no names kept'
                : 'Fill: who set the bit. The filter keeps only the 1'
              : asking
                ? `Is ${query.word} taken?`
                : query.maybe
                  ? `maybe > database: ${query.stored ? 'taken' : 'not taken'}`
                  : 'a 0 bit: definitely not taken, skip the database';
            return new Group(
              grid,
              takenLabel(s, st.size, i === FULL, st.stored),
              label(queryText, 0, -2.85, s.soft, 0.66, 'bloom-query'),
              label(answerText, 0, -3.7, s.palette.ink, 0.66, 'bloom-answer'),
            );
          },
        };
      }),
    );
  }
}
