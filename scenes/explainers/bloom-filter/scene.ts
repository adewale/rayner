import { Scene, Group, Rectangle, Text, lerpColor } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { bloomStory, locations, makeFilter, membership, saturation, TAKEN } from '../lib/bloom-filter.ts';
import { label, table, stat, legend } from '../lib/lesson-drawing.ts';
import { listed, numberWord, percent } from '../lib/format.ts';

/** Each taken name's colour: text on white at 4.5:1 or better, and a pale fill behind a bit it set. */
const OWNER: Record<string, string> = { cat: '#8250df', dog: '#9a6700', more: '#57606a' };
/** Each owner's fill in words, as the captions and the legend say it. */
const OWNER_NAME: Record<string, string> = { cat: 'purple', dog: 'brown', more: 'grey' };
const PAPER = '#ffffff';
const fillOf = (name: string) => lerpColor(PAPER, OWNER[name]!, 0.36);
const thousands = (n: number) => n.toLocaleString('en-US');
// Two decimals under 1%, so a rate of a few in a thousand does not read 0.0%.
const pct = (x: number) => percent(x, { under1: { digits: 2 } });

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
const count = (n: number) => numberWord(n, { zero: 'none' });
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

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
      { says: 'bits are 1: always maybe', test: 'test/learning-models.test.ts: a full row says maybe to every name' },
      { says: 'Keep taking names and the row only fills', test: 'test/learning-models.test.ts: the row only fills' },
      { says: 'From then on every name finds three 1s', test: 'test/learning-models.test.ts: a full row says maybe to every name' },
    ],
    checks: [
      {
        question: `In the 32-bit filter, someone also takes eel, whose hashes are ${listed(EEL.at)}. What does the filter now say about wolf, and about owl?`,
        answer: `wolf gets ${EEL.wolf ? 'maybe' : 'definitely not'}, a false positive: bit 23 now comes from eel, 22 from cat and 1 from dog and eel. owl still gets ${EEL.owl ? 'maybe' : 'definitely not'}: eel set bit 20, but bits ${listed(EEL.owlZeros)} are still 0.`,
      },
      {
        question:
          'dog closes its account, and to keep the filter tidy someone sets dog’s three bits back to 0. Then cat, still taken, tries to sign in. What does the filter say about cat at 16 bits, and at 32?',
        answer: `At 16 bits, definitely not: bit ${listed(CLEARED[0]!.shared)} was shared, so clearing dog’s bits cleared one of cat’s, and the filter turns away a taken name, which a Bloom filter must never do. At 32 bits it still says maybe, but only because dog’s bits there happen to miss cat’s. The row cannot tell which names set a bit, so clearing a departing name’s bits can erase evidence of another name.`,
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
    /**
     * The taken names over the row, as a legend: each name after a swatch of the fill it gives a bit, with the bits
     * it set. The legend says each fill's colour too ("purple fill, cat (1, 6, 15)"), the word the captions use.
     * `stored`: the names in the filter.
     */
    const takenLabel = (s: Stage, step: number, stored: readonly string[]) => {
      const SIZE = 0.66;
      const lead = new Text(stored.length ? 'Taken:' : 'Taken: cat, dog. Not yet in the filter', { fontSize: SIZE, color: s.palette.ink });
      const entry = (owner: string, label: string) => ({ label, fill: fillOf(owner), stroke: OWNER[owner]!, name: OWNER_NAME[owner]! });
      const items = !stored.length
        ? []
        : step === FULL
          ? [entry('cat', 'cat'), entry('dog', 'dog'), entry('more', `${stored.length - 2} more`)]
          : stored.map((name) => entry(name, `${name} (${locations(name, size).join(', ')})`));
      const key = items.length ? legend(s, items, { size: SIZE, direction: 'row', gap: 0.36, key: 'bloom-key' }) : null;
      // The lead and the legend in one centred row over the bits.
      const gap = 0.36,
        width = lead.width() + (key ? gap + key.width() : 0);
      lead.moveTo([-width / 2, 2.7], [-1, 0]);
      key?.moveTo([-width / 2 + lead.width() + gap, 2.7], [-1, 0]);
      const g = new Group(lead, ...(key ? [key] : []));
      g.key = 'bloom-taken';
      return g;
    };
    /**
     * The row's geometry. 16 bits sit in two rows of 8 large boxes; 32 bits in two rows of 16 narrower ones,
     * so both keep each position, in grey, above its box and leave room for the footer lines below.
     */
    const perRow = size === 16 ? 8 : 16,
      pitch = size === 16 ? 1.8 : 0.94,
      W = size === 16 ? 1.6 : 0.84,
      H = size === 16 ? 1.0 : 0.86,
      rowY = [0.75, -1.45],
      positionGap = 0.4;
    /** One bit: its position above, its value large in the box, filled in the colour of each name that set it, side by side. */
    const bitTile = (
      s: Stage,
      j: number,
      bit: number,
      x: number,
      y: number,
      setBy: readonly string[],
      { active = false, bad = false } = {},
    ) => {
      const part = W / Math.max(1, setBy.length);
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
        label(String(j), x, y + H / 2 + positionGap, s.soft, 0.66),
        label(String(bit), x, y, bad ? s.bad : s.palette.ink, size === 16 ? 0.9 : 0.74),
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
            if (i === 7) {
              // Two blocks on one left edge: the three lookups with their read count beside them, then the sample.
              // Each row is keyed by what it is about, a name or a row length: bloom-pipeline:wolf:Filter is
              // wolf's answer, and bloom-sample:bits-16:Pass the 16-bit row's count, wherever the row sits.
              const lookups = {
                  headers: ['Name', 'Filter', 'Database'],
                  rows: st.queries!.map((q) => ({ key: q.word, cells: [q.word, q.maybe ? 'maybe' : 'no', q.maybe ? (q.stored ? 'taken' : 'free') : 'skipped'] })),
                },
                sample = {
                  headers: [`${thousands(st.sampleSize!)} untaken`, 'Bits set', 'Pass'],
                  rows: st.sizes!.map((row) => ({ key: `bits-${row.size}`, cells: [`${row.size} bits`, `${row.setBits} of ${row.size}`, thousands(row.sampleFalsePositives)] })),
                };
              const TABLE = 0.7,
                COLUMN_GAP = 1.1,
                READS_GAP = 1.4;
              const reads = stat(s, 'Reads', `${st.exactLookups} of ${st.queries!.length}`, 0, 0, 'bloom-checks').scale(7 / 6);
              // The lookups and the read count beside them, centred together; the sample shares their left edge.
              const top = table(lookups.headers, lookups.rows, s, { xs: { left: 0, gap: COLUMN_GAP }, y: 2.6, gap: 0.98, key: 'bloom-pipeline', size: TABLE });
              // The read count sits level with the lookups' rows, centred on them.
              reads.moveTo([top.width() + READS_GAP, 0.64], [-1, 0]);
              const LEFT = -(top.width() + READS_GAP + reads.width()) / 2;
              top.shift([LEFT, 0]);
              reads.shift([LEFT, 0]);
              return new Group(
                top,
                reads,
                table(sample.headers, sample.rows, s, { xs: { left: LEFT, gap: COLUMN_GAP }, y: -1.75, gap: 0.98, key: 'bloom-sample', size: TABLE }),
              );
            }
            const query = st.query;
            // A lookup's bits; while inserting, the bits of the name just inserted.
            const active = query?.locations ?? (i === 1 || i === 2 ? locations(st.stored.at(-1)!, st.size) : []);
            // In the full row, bits set only by the later names are grey.
            const owners =
              i === FULL
                ? st.owners.map((o) => [...o.filter((w) => w === 'cat' || w === 'dog'), ...(o.some((w) => w !== 'cat' && w !== 'dog') ? ['more'] : [])])
                : st.owners;
            const grid = new Group(
              ...st.bits.map((bit, j) => {
                const x = ((j % perRow) - (perRow - 1) / 2) * pitch,
                  y = rowY[Math.floor(j / perRow)]!;
                return bitTile(s, j, bit, x, y, owners[j] ?? [], {
                  active: active.includes(j),
                  bad: !!query && !asking && !bit && active.includes(j),
                });
              }),
            );
            grid.key = 'bloom-bits';
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
              takenLabel(s, i, st.stored),
              label(queryText, 0, -2.85, s.soft, 0.66, 'bloom-query'),
              label(answerText, 0, -3.7, s.palette.ink, 0.66, 'bloom-answer'),
            );
          },
        };
      }),
    );
  }
}
