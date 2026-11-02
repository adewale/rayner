import { Scene, Group } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { bloomStory, locations } from '../lib/bloom-filter.ts';
import { lesson, label, tile, table, stat } from '../lib/lesson-drawing.ts';

const count = (n: number) => ['none', 'one', 'two', 'three'][n] ?? String(n);
const list = (items: readonly (string | number)[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export default class BloomFilter extends Scene {
  static meta = {
    id: 'bloom-filter',
    title: 'Why does a Bloom filter answer “maybe”?',
    sources: [
      'https://doi.org/10.1145/362686.362692',
      'https://www.jasondavies.com/bloomfilter/',
      'https://github.com/lcn2/fnv/blob/4001d0d4f6d81b29a02bda592c7712c68434525a/test_fnv.c',
    ],
    // The script's answer and check questions (script.md); check holds the shared step to stating the answer.
    answer: 'A set bit says some name set it, not which',
    checks: [
      {
        question: 'In the 16-bit filter, wolf hashes to bits 7, 6 and 1. Which taken name set each of them?',
        answer: 'dog set bit 7, cat set bit 6, and both set bit 1. wolf was never taken, but other names’ bits cover all three.',
      },
      {
        question: 'Why does wolf pass the 16-bit filter but not the 32-bit one?',
        answer: 'With 32 bits it hashes to 23, 22 and 1, and no taken name set bit 23. More bits leave more of them 0, so fewer untaken names land only on set bits.',
      },
      {
        question: 'cat and dog share bit 1 in the 16-bit filter. What does that bit remember about them?',
        answer: 'Only that some name set it. It stays 1 and cannot say whether cat, dog or both set it, which is why all-ones can only mean maybe.',
      },
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
      [absent, present, probe] = m.queries as [(typeof m.queries)[0], (typeof m.queries)[0], (typeof m.queries)[0]],
      otherProbe = other.queries[2]!;
    const [s16, s32] = size === 16 ? [m, other] : [other, m];
    const cat = locations('cat', size),
      dog = locations('dog', size);
    const shared = dog.filter((i) => m.first[i] === 1);
    /** Who set a bit, in words: a bit records that some name set it, never which. */
    const whoSet = (owners: string[]) => (owners.length > 1 ? 'both' : owners[0] ?? 'no name');
    const sources = (story: typeof m, locs: readonly number[]) =>
      locs.map((j) => (story.owners[j]!.length ? `${j} from ${whoSet(story.owners[j]!)}` : `${j} still 0`));
    const zeros = (q: typeof absent) => q.locations.filter((j) => m.bits[j] === 0);
    const skipped = m.queries.filter((q) => !q.maybe).length,
      wasted = m.queries.filter((q) => q.maybe && !q.stored).length;
    const takenLabel = (step: number) =>
      step === 0
        ? 'Taken: none yet. Next: cat, dog'
        : step === 1
          ? `Taken: cat (${cat.join(', ')})`
          : `Taken: cat (${cat.join(', ')}), dog (${dog.join(', ')})`;

    const frames = [
      {
        id: 'question',
        title: 'Is this name taken? Can we skip the database?',
        line: `cat and dog are taken. ${size} bits in memory will try to answer first.`,
        caption: `A sign-up form checks every name a person types against the accounts database, and each check is a disk read. Most names typed are not taken, so most reads find nothing. A row of ${size} bits kept in memory, all 0 to start, will sit in front of the database and try to answer “not taken” without the read.`,
      },
      {
        id: 'insert',
        title: `Taking cat sets bits ${list(cat)}`,
        line: 'Three hash functions each turn the name into a position.',
        caption: `When cat is taken, three hash functions each turn the name into a number from 0 to ${size - 1}: ${list(cat)}. Those bits become 1. The row keeps the bits, not the name.`,
      },
      {
        id: 'shared',
        title: shared.length
          ? `dog sets ${list(dog)}. Bit ${list(shared)} was already set by cat`
          : `dog sets ${list(dog)}, none of them cat’s`,
        line: 'A set bit says some name set it, not which.',
        caption: shared.length
          ? `Taking dog sets bits ${list(dog)}. Bit ${list(shared)} was already 1 from cat, so it stays 1, and nothing records that two names set it. A set bit says some name set it, not which. So when a name finds all its bits set, the filter can only say maybe.`
          : `Taking dog sets bits ${list(dog)}; this time none was already set by cat. Still, a set bit says some name set it, not which. So when a name finds all its bits set, the filter can only say maybe.`,
      },
      {
        id: 'absent',
        title: `${absent.word} finds a 0: definitely not taken`,
        line: 'No database read: no taken name ever set a 0 bit.',
        caption: `Looking up ${absent.word} runs the same three hashes: bits ${list(absent.locations)}. Taking a name sets all its bits and nothing clears them, so a taken ${absent.word} would find three 1s. Bit${zeros(absent).length > 1 ? 's' : ''} ${list(zeros(absent))} ${zeros(absent).length > 1 ? 'are' : 'is'} 0, so ${absent.word} is definitely free and the database is never asked. This row of bits and its hash functions is a Bloom filter.`,
      },
      {
        id: 'present',
        title: `${present.word} finds three 1s: maybe, so ask the database`,
        line: `The database confirms ${present.word} is taken.`,
        caption: `Looking up ${present.word} finds bits ${list(present.locations)} all set. A taken name always finds its bits set, so the filter never wrongly says “not taken”. But three 1s could have been set by other names, so it can only say maybe and passes the check on; the database confirms ${present.word} is taken.`,
      },
      {
        id: 'predict',
        title: `${probe.word} was never taken. What does the filter say?`,
        line: `Predict: ${probe.word} hashes to ${list(probe.locations)}. Maybe, or definitely not?`,
        caption: `Only cat and dog are taken. Find bits ${list(probe.locations)} in the row. Will the filter answer “definitely not”, or say maybe and ask the database?`,
      },
      {
        id: 'false-positive',
        title: probe.maybe
          ? `Answer: maybe. cat and dog set all of ${probe.word}’s bits`
          : `Answer: definitely not. Bit ${list(zeros(probe))} is still 0`,
        line: probe.maybe
          ? `Each of ${probe.word}’s three bits was set by another name.`
          : `With ${other.size} bits, ${probe.word} finds ${list(otherProbe.locations)}, all set by cat and dog.`,
        caption: probe.maybe
          ? `Bit ${list(sources(m, probe.locations))}. The filter cannot tell, so it says maybe and the database is asked; it answers not taken. That wasted read is a false positive: the filter is never wrong when it says no, and sometimes wrong when it says maybe. With ${other.size} bits, ${probe.word} lands on ${list(otherProbe.locations)}, and bit ${list(otherProbe.locations.filter((j) => other.bits[j] === 0))} is still 0.`
          : `With ${size} bits, ${probe.word} lands on ${list(probe.locations)}: bit ${list(sources(m, probe.locations))}. No name set bit ${list(zeros(probe))}, so ${probe.word} is definitely free and the database is not asked. In the ${other.size}-bit row the same name finds ${list(otherProbe.locations)}, set by ${list(otherProbe.locations.map((j) => whoSet(other.owners[j]!)))}: there the filter says maybe and the database answers not taken, a false positive. More bits leave more of them 0.`,
      },
      {
        id: 'pipeline',
        title: `The filter skips ${count(skipped)} read${skipped === 1 ? '' : 's'} and wastes ${count(wasted)}`,
        line: `The database is asked ${count(m.exactLookups)} of ${count(m.queries.length)} times${wasted ? ', once for nothing' : ', never for nothing'}.`,
        caption: `Of these ${m.queries.length} lookups the filter answered ${list(m.queries.filter((q) => !q.maybe).map((q) => q.word))} alone and sent ${m.exactLookups} to the database${wasted ? `, one of them wasted on ${probe.word}` : ''}; every final answer is correct. In a fixed sample of ${s16.sampleSize} untaken names, ${s16.sampleFalsePositives} pass the 16-bit filter and ${s32.sampleFalsePositives} pass the 32-bit one. Each costs a read; more bits make it less likely that a name lands only on bits other names set.`,
      },
    ];

    await lesson(
      this,
      frames.map((frame, i) => {
        const bits = i === 0 ? Array<number>(size).fill(0) : i === 1 ? m.first : m.bits;
        const query = i >= 3 && i <= 6 ? m.queries[Math.min(i - 3, 2)]! : null;
        // The prediction shows where the probe lands, not yet whether a bit stops it.
        const asking = frame.id === 'predict';
        return {
          ...frame,
          state: {
            size,
            bits,
            stored: i === 0 ? [] : i === 1 ? ['cat'] : m.words,
            query,
            exactLookups: i === 7 ? m.exactLookups : 0,
            ...(i === 7 ? { queries: m.queries, sampleSize: m.sampleSize, sampleFalsePositives: m.sampleFalsePositives } : {}),
          },
          draw: (s: Stage) => {
            if (i === 7)
              return new Group(
                table(
                  ['Name', 'Filter', 'Database'],
                  m.queries.map((q) => [q.word, q.maybe ? 'maybe' : 'no', q.maybe ? (q.stored ? 'taken' : 'free') : 'skipped']),
                  s,
                  { xs: [-4.9, 0, 4.9], y: 2.35, key: 'bloom-pipeline' },
                ),
                stat(s, 'Database reads', `${m.exactLookups} of ${m.queries.length}`, -4.2, -2.6, 'bloom-checks'),
                table(
                  ['Untaken sample', 'Pass'],
                  [s16, s32].map((story) => [`${story.size} bits`, `${story.sampleFalsePositives} of ${story.sampleSize}`]),
                  s,
                  { xs: [1.7, 5.9], y: -1.75, gap: 0.95, key: 'bloom-sample' },
                ),
              );
            const active = query?.locations ?? (i === 1 ? cat : i === 2 ? dog : []);
            const grid = new Group(
              ...bits.map((bit, j) => {
                const x = -6.3 + (j % 8) * 1.8,
                  y = (size === 16 ? 0.8 : 1.45) - Math.floor(j / 8) * 1.18;
                return tile(`${j}: ${bit}`, x, y, 1.6, 0.8, s, {
                  active: active.includes(j),
                  bad: !!query && !asking && !bit && active.includes(j),
                  key: `bit-${j}`,
                  size: 0.666,
                });
              }),
            );
            grid.key = 'bloom-bits';
            const queryText = !query
              ? 'Position: bit; 0 empty, 1 set'
              : frame.id === 'false-positive'
                ? `${query.word}: ${sources(m, query.locations).join(', ')}`
                : `Lookup ${query.word}: bits ${query.locations.join(', ')}`;
            const answerText = !query
              ? 'Three hashes per name; no names kept'
              : asking
                ? `Is ${query.word} taken?`
                : query.maybe
                  ? `maybe > database: ${query.stored ? 'taken' : 'not taken'}`
                  : 'a 0 bit: definitely not taken, skip the database';
            return new Group(
              grid,
              label(takenLabel(i), 0, 2.6, s.palette.ink, 0.66),
              label(queryText, 0, -2.95, s.soft, 0.66, 'bloom-query'),
              label(answerText, 0, -3.85, s.palette.ink, 0.66, 'bloom-answer'),
            );
          },
        };
      }),
    );
  }
}
