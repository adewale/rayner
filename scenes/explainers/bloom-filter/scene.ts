import { Scene, Group, Rectangle, Text } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { bloomStory, locations } from '../lib/bloom-filter.ts';
import { lerpColor } from '../../../src/color.ts';
import { lesson, label, table, stat } from '../lib/lesson-drawing.ts';

/** Each taken name's colour: text on white at 4.5:1 or better, and a pale fill behind a bit it set. */
const OWNER: Record<string, string> = { cat: '#8250df', dog: '#9a6700' };
const PAPER = '#ffffff';
const fillOf = (name: string) => lerpColor(PAPER, OWNER[name]!, 0.36);
const thousands = (n: number) => n.toLocaleString('en-US');
const percent = (x: number) => `${(100 * x).toFixed(x < 0.01 ? 2 : 1)}%`;

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
        question: 'In the 16-bit filter, suppose only one of cat and dog had been taken. Would wolf still get “maybe”?',
        answer: 'No, whichever one it was. wolf needs bit 7, which only dog set, and bit 6, which only cat set; with either name missing, one of them is 0 and wolf is turned away.',
      },
      {
        question: 'A third taken name sets three bits nobody had set, so 8 of the 16 bits are 1. About what share of untaken names would now get “maybe”?',
        answer: 'About (8/16)³ = 1/8, or 12.5%: a name passes only if all three of its bits are set. That is four times the 3.1% with 5 of 16 set.',
      },
      {
        question: 'dog’s account is deleted, and someone clears dog’s bits 7, 0 and 1 in the 16-bit filter. What does the filter now say when a person types cat?',
        answer: '“Definitely not taken”, which is wrong: bit 1 was cat’s too, so cat now finds a 0. A bit cannot be cleared without knowing who else set it, and the filter does not keep that.',
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
    /** The taken names over the row, each in its colour with the bits it set: the key to the fills. */
    const takenLabel = (s: Stage, step: number) => {
      const parts: Text[] =
        step === 0
          ? [new Text('Taken: none yet. Next: cat, dog', { fontSize: 0.66, color: s.palette.ink })]
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
      const W = 1.6,
        H = 0.8,
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
        label(`${j}: ${bit}`, x, y, bad ? s.bad : s.palette.ink, 0.666),
      );
      g.key = `bit-${j}`;
      return g;
    };

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
        caption: `Each hash gives a number from 0 to ${size - 1}; for cat they give ${list(cat)}, and those bits become 1. The purple fill marks them as cat’s for us, but the row itself stores only the 1s and keeps no trace of the name.`,
      },
      {
        id: 'shared',
        title: shared.length
          ? `dog sets ${list(dog)}. Bit ${list(shared)} was already set by cat`
          : `dog sets ${list(dog)}, none of them cat’s`,
        line: 'A set bit says some name set it, not which.',
        caption: shared.length
          ? `dog’s bits ${list(dog)} are filled brown. Bit ${list(shared)} was already 1 from cat, so it stays 1; its fill shows both names, but the row records only the 1. When a name finds all its bits set, other names may have set every one of them, so the filter can only say maybe.`
          : `dog’s bits ${list(dog)} are filled brown, and none of them was already set by cat. The fills tell the names apart for us, but the row records only the 1s. When a name finds all its bits set, other names may have set every one of them, so the filter can only say maybe.`,
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
        line: 'Maybe hands the question to the database.',
        caption: `${present.word}’s bits ${list(present.locations)} are all set. A taken name always finds its bits set, so the filter never wrongly says “not taken”. But three 1s could have been set by other names, so it can only say maybe and passes the check on; the database confirms ${present.word} is taken.`,
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
          ? `Maybe: cat and dog set all of ${probe.word}’s bits`
          : `Definitely not: bit ${list(zeros(probe))} is still 0`,
        line: probe.maybe
          ? `Each of ${probe.word}’s three bits was set by another name.`
          : `With ${other.size} bits, ${probe.word} finds ${list(otherProbe.locations)}, all set by cat and dog.`,
        caption: probe.maybe
          ? `Read the fills: bit ${list(sources(m, probe.locations))}. The filter sees three 1s with no names attached, so it says maybe; the database is asked and answers not taken. That wasted read is a false positive: the filter is never wrong when it says no, and sometimes wrong when it says maybe. With ${other.size} bits, ${probe.word} lands on ${list(otherProbe.locations)}, and bit ${list(otherProbe.locations.filter((j) => other.bits[j] === 0))} is still 0.`
          : `With ${size} bits, ${probe.word} lands on ${list(probe.locations)}: bit ${list(sources(m, probe.locations))}. No name set bit ${list(zeros(probe))}, so ${probe.word} is definitely free and the database is not asked. In the ${other.size}-bit row the same name finds ${list(otherProbe.locations)}, set by ${list(otherProbe.locations.map((j) => whoSet(other.owners[j]!)))}: there the filter says maybe and the database answers not taken, a false positive. More bits leave more of them 0.`,
      },
      {
        id: 'pipeline',
        title: `The filter skips ${count(skipped)} read${skipped === 1 ? '' : 's'} and wastes ${count(wasted)}`,
        line: `Over ${thousands(m.sampleSize)} untaken names, ${percent(s16.sampleFalsePositives / s16.sampleSize)} pass at 16 bits and ${percent(s32.sampleFalsePositives / s32.sampleSize)} at 32.`,
        caption: `Of these ${m.queries.length} lookups the filter answered ${list(m.queries.filter((q) => !q.maybe).map((q) => q.word))} alone and sent ${m.exactLookups} to the database${wasted ? `, one of them wasted on ${probe.word}` : ''}; every final answer is correct. An untaken name wastes a read only if all three of its bits are already set. ${s16.setBits} of the 16 bits are set, so about (${s16.setBits}/16)³ = ${percent(s16.passChance)} of untaken names should pass; with 32 bits, ${s32.setBits} are set, and (${s32.setBits}/32)³ = ${percent(s32.passChance)}. Run ${thousands(s16.sampleSize)} untaken names through each row: ${thousands(s16.sampleFalsePositives)} pass at 16 bits and ${thousands(s32.sampleFalsePositives)} at 32. Because the share of set bits is cubed, doubling the row cuts the passes by much more than half.`,
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
            // Which names set each bit: the colours, which the filter itself does not keep.
            owners: i === 0 ? Array.from({ length: size }, () => []) : i === 1 ? m.owners.map((o) => o.filter((w) => w === 'cat')) : m.owners,
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
                stat(s, 'Database reads', `${m.exactLookups} of ${m.queries.length}`, -5.7, -2.6, 'bloom-checks'),
                table(
                  [`${thousands(m.sampleSize)} untaken`, 'Bits set', 'Pass'],
                  [s16, s32].map((story) => [
                    `${story.size} bits`,
                    `${story.setBits} of ${story.size}`,
                    thousands(story.sampleFalsePositives),
                  ]),
                  s,
                  { xs: [-0.6, 3.6, 6.7], y: -1.75, gap: 0.95, key: 'bloom-sample' },
                ),
              );
            const active = query?.locations ?? (i === 1 ? cat : i === 2 ? dog : []);
            const owners = i === 0 ? [] : i === 1 ? m.owners.map((o) => o.filter((w) => w === 'cat')) : m.owners;
            const grid = new Group(
              ...bits.map((bit, j) => {
                const x = -6.3 + (j % 8) * 1.8,
                  y = (size === 16 ? 0.8 : 1.45) - Math.floor(j / 8) * 1.18;
                return bitTile(s, j, bit, x, y, owners[j] ?? [], {
                  active: active.includes(j),
                  bad: !!query && !asking && !bit && active.includes(j),
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
