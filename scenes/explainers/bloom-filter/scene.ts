import { Scene, Group, Text } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { bloomStory, locations } from '../lib/bloom-filter.ts';
import { lesson, label, tile, table, stat } from '../lib/lesson-drawing.ts';

export default class BloomFilter extends Scene {
  static meta = {
    id: 'bloom-filter',
    title: 'Why does a Bloom filter answer “maybe”?',
    sources: [
      'https://doi.org/10.1145/362686.362692',
      'https://www.jasondavies.com/bloomfilter/',
      'https://github.com/lcn2/fnv/blob/4001d0d4f6d81b29a02bda592c7712c68434525a/test_fnv.c',
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
    const m = bloomStory(Number(settingsOf(this).bits) as 16 | 32),
      [absent, present, falsePositive] = m.queries;
    const overlap = locations('dog', m.size).filter((i) => m.first[i] === 1).length;
    const titles = [
      'Can we skip a storage lookup?',
      'Three hashes set three bits',
      'A bit does not name its word',
      'One zero proves absence',
      'All ones require an exact check',
      'An absent word can pass the filter',
      'A false positive costs one lookup',
    ];
    const lines = [
      'An insert-only filter sits in front of an exact store.',
      `cat selects ${locations('cat', m.size).join(', ')}.`,
      overlap
        ? `dog shares ${overlap} set bit${overlap === 1 ? '' : 's'} with cat.`
        : 'These words happen to use different positions in this larger filter.',
      `${absent!.word} selects at least one bit that is still zero.`,
      'The exact store must confirm the filter’s maybe.',
      `${falsePositive!.word} was never inserted. All its queried bits are set.`,
      'The final membership answer comes from the exact store.',
    ];
    const captions = [
      `The exact store will hold cat and dog. A ${m.size}-bit filter can reject some future queries before they reach that store. This lesson uses three stable seeded FNV-1a hashes.`,
      `Inserting cat sets positions ${locations('cat', m.size).join(', ')}. The filter keeps those bits, rather than a copy of the word.`,
      `Inserting dog sets positions ${locations('dog', m.size).join(', ')}. ${overlap ? 'A shared bit cannot say which word set it.' : 'These positions do not overlap cat’s positions, but the bits still carry no word identities.'}`,
      `${absent!.word} queries positions ${absent!.locations.join(', ')}. At least one is zero, so this insert-only filter can safely reject the word without checking storage.`,
      `cat finds all three bits set, so the filter passes the query to the exact store. The store confirms that cat was inserted.`,
      `${falsePositive!.word} also finds all its bits set, although only cat and dog were inserted. The exact store rejects this false positive; the final answer remains correct.`,
      `The filter sends ${m.exactLookups} of these ${m.queries.length} queries to storage. Its false positive adds a check, while its definite negative saves one. In a separate fixed sample of ${m.sampleSize} absent words, ${m.sampleFalsePositives} pass this filter.`,
    ];
    const frames = titles.map((title, i) => {
      const bits = i === 0 ? Array(m.size).fill(0) : i === 1 ? m.first : m.bits;
      const query = i >= 3 && i <= 5 ? m.queries[i - 3]! : null;
      return {
        id: ['question', 'insert', 'shared', 'absent', 'present', 'false-positive', 'pipeline'][i]!,
        title,
        line: lines[i]!,
        caption: captions[i]!,
        state: {
          size: m.size,
          bits,
          stored: i === 0 ? [] : i === 1 ? ['cat'] : m.words,
          query,
          exactLookups: i === 6 ? m.exactLookups : 0,
          ...(i === 6
            ? { queries: m.queries, sampleSize: m.sampleSize, sampleFalsePositives: m.sampleFalsePositives }
            : {}),
        },
        draw: (s: Stage) => {
          if (i === 6)
            return new Group(
              table(
                ['Word', 'Filter', 'Store'],
                m.queries.map((q) => [
                  q.word,
                  q.maybe ? 'maybe' : 'no',
                  q.maybe ? (q.stored ? 'yes' : 'no') : 'skipped',
                ]),
                s,
                { xs: [-4.9, 0, 4.9], y: 2.35, key: 'bloom-pipeline' },
              ),
              stat(s, 'Exact lookups', `${m.exactLookups} of ${m.queries.length}`, 0, -2.2, 'bloom-checks'),
              label(`Absent sample: ${m.sampleFalsePositives} of ${m.sampleSize} maybes`, 0, -3.8, s.palette.ink, 0.66),
            );
          const active =
            query?.locations ?? (i === 1 ? locations('cat', m.size) : i === 2 ? locations('dog', m.size) : []);
          const grid = new Group(
            ...bits.flatMap((bit, j) => {
              const x = -6.3 + (j % 8) * 1.8,
                y = (m.size === 16 ? 0.8 : 1.45) - Math.floor(j / 8) * 1.18;
              return [
                tile(`${j}: ${bit}`, x, y, 1.6, 0.8, s, {
                  active: active.includes(j),
                  bad: !!query && !bit && active.includes(j),
                  key: `bit-${j}`,
                  size: 0.666,
                }),
              ];
            }),
          );
          grid.key = 'bloom-bits';
          return new Group(
            grid,
            label(i === 0 ? 'Next: cat, dog' : `Stored: ${i === 1 ? 'cat' : 'cat, dog'}`, 0, 2.6, s.palette.ink, 0.66),
            label(
              query ? `Query ${query.word}: ${query.locations.join(', ')}` : 'Position: bit; 0 empty, 1 set',
              0,
              -2.95,
              s.soft,
              0.66,
              'bloom-query',
            ),
            label(
              query
                ? query.maybe
                  ? `maybe > exact store: ${query.stored ? 'yes' : 'no'}`
                  : 'definitely absent > skip storage'
                : 'Three hashes; no word identities',
              0,
              -3.85,
              s.palette.ink,
              0.66,
              'bloom-answer',
            ),
          );
        },
      };
    });
    const probe = frames[5]!;
    frames.splice(5, 0, {
      ...probe,
      id: 'predict',
      title: 'All three bits are set: what can we conclude?',
      line: 'Only cat and dog are in the exact store.',
      caption: `Only cat and dog were inserted. The query ${falsePositive!.word} selects ${falsePositive!.locations.join(', ')}, all set. Can these bits establish membership, or do we still need the exact store?`,
      draw: (s) => {
        const drawing = probe.draw(s);
        const answer = drawing.family().find((m) => m.key === 'bloom-answer');
        if (answer && 'setText' in answer) (answer as Text).setText('All three are set. Is that proof?');
        return drawing;
      },
    });
    frames.splice(2, 0, {
      ...frames[1]!,
      id: 'hashes',
      title: 'Follow each hash to its bit',
      line: 'Three seeded hashes; the same word takes the same three paths.',
      caption: `For cat, hashes 1, 2 and 3 select positions ${locations('cat', m.size).join(', ')} in the ${m.size}-bit array. Each selected bit becomes 1. The filter stores the combined bits, so a later query cannot tell which insertion set a bit.`,
      draw: (s) =>
        table(
          ['Seeded hash', 'Position', 'Bit after insert'],
          locations('cat', m.size).map((position, i) => [i + 1, position, 1]),
          s,
          { xs: [-5, 0, 5], y: 2.6, gap: 1.5, key: 'bloom-hash-mapping' },
        ),
    });
    await lesson(this, frames);
  }
}
