import { Scene, Group, Rectangle, Text } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { bloomStory, locations, makeFilter, membership, saturation, TAKEN } from '../lib/bloom-filter.ts';
import { lerpColor } from '../../../src/color.ts';
import { lesson, label, table, stat } from '../lib/lesson-drawing.ts';

/** Each taken name's colour: text on white at 4.5:1 or better, and a pale fill behind a bit it set. */
const OWNER: Record<string, string> = { cat: '#8250df', dog: '#9a6700', more: '#57606a' };
const PAPER = '#ffffff';
const fillOf = (name: string) => lerpColor(PAPER, OWNER[name]!, 0.36);
const thousands = (n: number) => n.toLocaleString('en-US');
const percent = (x: number) => `${(100 * x).toFixed(x < 0.01 ? 2 : 1)}%`;

// Check 1: a third name, eel, taken in the 32-bit row. Its hashes, and what wolf and owl then get.
const EEL = (() => {
  const bits = makeFilter([...TAKEN, 'eel'], 32);
  return { at: locations('eel', 32), wolf: membership(bits, 'wolf'), owl: membership(bits, 'owl'), owlZeros: locations('owl', 32).filter((i) => !bits[i]) };
})();
// Check 2: dog's account closes and someone clears dog's bits. What cat, which is still taken, then gets.
const CLEARED = ([16, 32] as const).map((size) => {
  const bits = makeFilter([...TAKEN], size);
  for (const i of locations('dog', size)) bits[i] = 0;
  return { size, cat: membership(bits, 'cat'), shared: locations('dog', size).filter((i) => locations('cat', size).includes(i)) };
});
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
    // Sentences that reach past the three lookups on screen, and the test that holds each for any names and row length.
    claims: [
      { says: 'the row itself stores only the 1s and keeps no trace of the name', test: 'test/learning-models.test.ts: insert-only filters never reject an inserted word' },
      { says: 'its fill shows both names, but the row records only the 1', test: 'test/learning-models.test.ts: insert-only filters never reject an inserted word' },
      { says: 'other names may have set every one of them, so the filter can only say maybe', test: 'test/learning-models.test.ts: concrete false positives still need storage' },
      { says: 'A taken name always finds its bits set, so the filter never wrongly says “not taken”', test: 'test/learning-models.test.ts: insert-only filters never reject an inserted word' },
      { says: 'could have been set by other names, so it can only say maybe', test: 'test/learning-models.test.ts: concrete false positives still need storage' },
      { says: 'Only cat and dog are taken', shown: true as const },
      { says: 'An untaken name gets through only when all three of its bits are already set', test: 'test/learning-models.test.ts: a name gets through only when all three of its bits are set' },
      { says: 'bits are 1 and every lookup says maybe', test: 'test/learning-models.test.ts: a full row says maybe to every name' },
      { says: 'Keep taking names and the row only fills', test: 'test/learning-models.test.ts: the row only fills' },
      { says: 'From then on every name finds three 1s', test: 'test/learning-models.test.ts: a full row says maybe to every name' },
    ],
    checks: [
      {
        question: `In the 32-bit filter, someone also takes eel, whose hashes are ${list(EEL.at)}. What does the filter now say about wolf, and about owl?`,
        answer: `wolf gets ${EEL.wolf ? 'maybe' : 'definitely not'}, a false positive: bit 23 now comes from eel, 22 from cat and 1 from dog and eel. owl still gets ${EEL.owl ? 'maybe' : 'definitely not'}: eel set bit 20, but bits ${list(EEL.owlZeros)} are still 0.`,
      },
      {
        question:
          'dog closes its account, and to keep the filter tidy someone sets dog’s three bits back to 0. Then cat, still taken, tries to sign in. What does the filter say about cat at 16 bits, and at 32?',
        answer: `At 16 bits, definitely not: bit ${list(CLEARED[0]!.shared)} was shared, so clearing dog’s bits cleared one of cat’s, and the filter turns away a taken name, which a Bloom filter must never do. At 32 bits it still says maybe, but only because dog’s bits there happen to miss cat’s. The row cannot tell which names set a bit, so clearing a departing name’s bits can erase evidence of another name.`,
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
      full = saturation(size),
      otherFull = saturation(size === 16 ? 32 : 16),
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
    /** The full step's index, and the set bits after the first, middle and last count of names taken. */
    const FULL = 8;
    const milestones = [0, Math.round((full.trail.length - 1) / 2), full.trail.length - 1].map((k) => full.trail[k]!);
    const zeros = (q: typeof absent) => q.locations.filter((j) => m.bits[j] === 0);
    const skipped = m.queries.filter((q) => !q.maybe).length,
      wasted = m.queries.filter((q) => q.maybe && !q.stored).length;
    /** The taken names over the row, each in its colour with the bits it set: the key to the fills. */
    const takenLabel = (s: Stage, step: number) => {
      const parts: Text[] =
        step === 0
          ? [new Text('Taken: cat, dog. Not yet in the filter', { fontSize: 0.66, color: s.palette.ink })]
          : step === FULL
            ? [
                new Text('Taken:', { fontSize: 0.66, color: s.palette.ink }),
                new Text('cat', { fontSize: 0.66, color: OWNER.cat! }),
                new Text('dog', { fontSize: 0.66, color: OWNER.dog! }),
                new Text(`and ${full.words.length - 2} more`, { fontSize: 0.66, color: OWNER.more! }),
              ]
            : [
              new Text('Taken:', { fontSize: 0.66, color: s.palette.ink }),
              new Text(`cat (${cat.join(', ')})`, { fontSize: 0.66, color: OWNER.cat! }),
              ...(step === 1 ? [] : [new Text(`dog (${dog.join(', ')})`, { fontSize: 0.66, color: OWNER.dog! })]),
            ];
      const gap = 0.3,
        width = parts.reduce((w, t) => w + t.width(), gap * (parts.length - 1));
      let x = -width / 2;
      for (const t of parts) {
        t.moveTo([x, 2.6], [-1, 0]);
        x += t.width() + gap;
      }
      const g = new Group(...parts);
      g.key = 'bloom-taken';
      return g;
    };
    /** One bit: its position and value, filled in the colour of each name that set it, side by side. */
    const bitTile = (
      s: Stage,
      j: number,
      bit: number,
      x: number,
      y: number,
      setBy: readonly string[],
      { active = false, bad = false } = {},
    ) => {
      // Four rows of 32 need shorter boxes than two rows of 16 to leave room for each position above its box.
      const W = 1.75,
        H = size === 16 ? 0.72 : 0.62,
        part = W / Math.max(1, setBy.length);
      const color = bad ? s.bad : active ? s.emphasis : s.soft;
      const g = new Group(
        ...setBy.map((name, k) =>
          new Rectangle({ width: part, height: H, fill: fillOf(name), fillOpacity: 1, stroke: 'none' }).moveTo([
            x - W / 2 + part * (k + 0.5),
            y,
          ]),
        ),
        new Rectangle({ width: W, height: H, fill: 'none', stroke: color, strokeWidth: active || bad ? 0.055 : 0.025 }).moveTo([
          x,
          y,
        ]),
        label(`${j}:`, x, y, s.soft, 0.7).moveTo([x - W / 2 + 0.12, y], [-1, 0]),
        label(String(bit), x, y, bad ? s.bad : s.palette.ink, 0.7).moveTo([x + W / 2 - 0.12, y], [1, 0]),
      );
      g.key = `bit-${j}`;
      return g;
    };

    const frames = [
      {
        id: 'question',
        title: 'Is this name taken? Can we skip the database?',
        line: `cat and dog are taken. ${size} bits in memory will try to answer first.`,
        caption: `A sign-up form checks each name a person types against the accounts database, one database read per check, and a read for a free name finds nothing. A row of ${size} bits kept in memory, all 0 to start, will sit in front of the database and try to answer “not taken” without the read.`,
      },
      {
        id: 'insert',
        title: `Taking cat sets bits ${list(cat)}`,
        line: 'Three hash functions each turn the name into a position.',
        caption: `Each of this explainer’s three hashes gives a number from 0 to ${size - 1}; for cat they give ${list(cat)}, and those bits become 1. The purple fill marks them as cat’s for us, but the row itself stores only the 1s and keeps no trace of the name.`,
      },
      {
        id: 'shared',
        title: shared.length
          ? `dog sets ${list(dog)}. Bit ${list(shared)} was already set by cat`
          : `dog sets ${list(dog)}, none of them cat’s`,
        line: 'A set bit says some name set it, not which.',
        caption: shared.length
          ? `dog’s bits ${list(dog)} are filled brown. Bit ${list(shared)} was already 1 from cat, so it stays 1; its fill shows both names, but the row records only the 1. When a name finds all its bits set, other names may have set every one of them, so the filter can only say maybe.`
          : `dog’s bits ${list(dog)} are filled brown, and none of them was already set by cat. The fills tell the names apart for us; the row itself holds ${m.setBits} identical 1s, and nothing in it says which name set bit ${dog[0]} or bit ${cat[0]}. When a name finds all its bits set, other names may have set every one of them, so the filter can only say maybe.`,
      },
      {
        id: 'absent',
        title: `${absent.word} finds a 0: definitely not taken`,
        line: `No database read: had ${absent.word} been taken, all three of its bits would be 1.`,
        caption: `Looking up ${absent.word} runs the same three hashes: bits ${list(absent.locations)}. Taking a name sets all its bits and nothing clears them, so a taken ${absent.word} would find three 1s. Bit${zeros(absent).length > 1 ? 's' : ''} ${list(zeros(absent))} ${zeros(absent).length > 1 ? 'are' : 'is'} 0, so ${absent.word} is definitely free and the database is not asked. This row of bits and its hash functions is a Bloom filter.`,
      },
      {
        id: 'present',
        title: `${present.word} finds three 1s: maybe, so ask the database`,
        line: 'Maybe hands the question to the database.',
        caption: `${present.word}’s bits ${list(present.locations)} are all set. A taken name always finds its bits set, so the filter never wrongly says “not taken”. But three 1s could have been set by other names, so it can only say maybe and passes the check on; the database confirms ${present.word} is taken.`,
      },
      {
        id: 'predict',
        title: `${probe.word} is not taken. What does the filter say?`,
        line: `Predict: ${probe.word} hashes to ${list(probe.locations)}. Maybe, or definitely not?`,
        caption: `Only cat and dog are taken. Find bits ${list(probe.locations)} in the row. Will the filter answer “definitely not”, or say maybe and ask the database?`,
      },
      {
        id: 'false-positive',
        title: probe.maybe
          ? `Maybe: cat and dog set all of ${probe.word}’s bits`
          : `Definitely not: bit ${list(zeros(probe))} is still 0`,
        line: probe.maybe
          ? `Each of ${probe.word}’s three bits was set by another name.`
          : `With ${other.size} bits, ${probe.word} finds ${list(otherProbe.locations)}, all set by cat and dog.`,
        caption: probe.maybe
          ? `Read the fills: bit ${list(sources(m, probe.locations))}. The filter sees three 1s with no names attached, so it says maybe; the database is asked and answers not taken. That wasted read is a false positive: a maybe for a name that is not taken. With ${other.size} bits, ${probe.word} lands on ${list(otherProbe.locations)}, and bit ${list(otherProbe.locations.filter((j) => other.bits[j] === 0))} is still 0.`
          : `With ${size} bits, ${probe.word} lands on ${list(probe.locations)}: bit ${list(sources(m, probe.locations))}. No name set bit ${list(zeros(probe))}, so ${probe.word} is definitely free and the database is not asked. ${m.setBits} of these ${size} bits are set, against ${other.setBits} of ${other.size} in the shorter row, so an untaken name is more likely to land on a 0 here.`,
      },
      {
        id: 'pipeline',
        title: `The filter skips ${count(skipped)} read${skipped === 1 ? '' : 's'} and wastes ${count(wasted)}`,
        line: `Over ${thousands(m.sampleSize)} untaken names, ${percent(s16.sampleFalsePositives / s16.sampleSize)} pass at 16 bits and ${percent(s32.sampleFalsePositives / s32.sampleSize)} at 32.`,
        caption: `The upper table follows each lookup: a 0 skips the database; maybe sends the question on. An untaken name gets through only when all three of its bits are already set. A longer row leaves more empty positions, making that harder. The lower table tries both rows on the same ${thousands(m.sampleSize)} untaken names: fewer pass the larger row, so fewer reads are wasted. These are measured results for this sample and these hashes.`,
      },
      {
        id: 'full',
        title: `After ${full.words.length} names, all ${size} bits are 1 and every lookup says maybe`,
        line: `Keep taking names and the row only fills: ${absent.word}, turned away earlier, now gets maybe too.`,
        caption: `Each name taken sets up to three more bits, and nothing clears them. With ${size} bits, the ${full.words.length}th name, ${full.words.at(-1)}, sets the last 0. From then on every name finds three 1s: all ${thousands(full.sampleSize)} untaken names get maybe, and every lookup goes to the database, so the filter saves no reads. A ${otherFull.size}-bit row took ${otherFull.words.length} names to fill. With three hashes, a longer row holds more names before it stops saying “definitely not”; how many depends on where those names’ bits land.`,
      },
    ];

    await lesson(
      this,
      frames.map((frame, i) => {
        const bits = i === 0 ? Array<number>(size).fill(0) : i === 1 ? m.first : i === FULL ? full.bits : m.bits;
        const query = i >= 3 && i <= 6 ? m.queries[Math.min(i - 3, 2)]! : null;
        // The prediction shows where the probe lands, not yet whether a bit stops it.
        const asking = frame.id === 'predict';
        return {
          ...frame,
          state: {
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
                }
              : {}),
            ...(i === FULL ? { trail: full.trail, lookups: full.lookups, sampleSize: full.sampleSize, samplePass: full.samplePass } : {}),
          },
          draw: (s: Stage) => {
            if (i === 7)
              return new Group(
                table(
                  ['Name', 'Filter', 'Database'],
                  m.queries.map((q) => [q.word, q.maybe ? 'maybe' : 'no', q.maybe ? (q.stored ? 'taken' : 'free') : 'skipped']),
                  s,
                  { xs: [-4.9, 0, 4.9], y: 2.35, key: 'bloom-pipeline', size: 0.7 },
                ),
                stat(s, 'Reads', `${m.exactLookups} of ${m.queries.length}`, -5.7, -2.6, 'bloom-checks').scale(7 / 6),
                table(
                  [`${thousands(m.sampleSize)} untaken`, 'Bits set', 'Pass'],
                  [s16, s32].map((story) => [
                    `${story.size} bits`,
                    `${story.setBits} of ${story.size}`,
                    thousands(story.sampleFalsePositives),
                  ]),
                  s,
                  { xs: [-0.8, 3.4, 6.4], y: -1.75, gap: 0.95, key: 'bloom-sample', size: 0.7 },
                ),
              );
            const active = query?.locations ?? (i === 1 ? cat : i === 2 ? dog : []);
            // In the full row, bits set only by the later names are grey.
            const owners =
              i === 0
                ? []
                : i === 1
                  ? m.owners.map((o) => o.filter((w) => w === 'cat'))
                  : i === FULL
                    ? full.owners.map((o) => [...o.filter((w) => w === 'cat' || w === 'dog'), ...(o.some((w) => w !== 'cat' && w !== 'dog') ? ['more'] : [])])
                    : m.owners;
            const grid = new Group(
              ...bits.map((bit, j) => {
                const x = -6.3 + (j % 8) * 1.8,
                  y = (size === 16 ? 0.8 : 1.45) - Math.floor(j / 8) * (size === 16 ? 1.3 : 1.15);
                return bitTile(s, j, bit, x, y, owners[j] ?? [], {
                  active: active.includes(j),
                  bad: !!query && !asking && !bit && active.includes(j),
                });
              }),
            );
            grid.key = 'bloom-bits';
            const queryText =
              i === FULL
                ? `Set bits: ${milestones.map((t, k) => `${t.setBits} after ${t.taken}${k ? '' : ' names'}`).join(', ')}`
                : !query
              ? 'Each box: grey position, then the bit'
              : frame.id === 'false-positive'
                ? `${query.word}: ${sources(m, query.locations).join(', ')}`
                : `Lookup ${query.word}: bits ${query.locations.join(', ')}`;
            const answerText =
              i === FULL
                ? `Every lookup says maybe, ${absent.word} included`
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
              takenLabel(s, i),
              label(queryText, 0, -2.95, s.soft, 0.66, 'bloom-query'),
              label(answerText, 0, -3.85, s.palette.ink, 0.66, 'bloom-answer'),
            );
          },
        };
      }),
    );
  }
}
