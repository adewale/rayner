import { Scene, Group, Text } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { dictStory, EMPTY, DELETED } from '../lib/python-dict.ts';
import type { DictTable, DictLookup } from '../lib/python-dict.ts';
import { lesson, label, tile, table } from '../lib/lesson-drawing.ts';

function picture(s: Stage, dict: DictTable, query: DictLookup, phase: number) {
  const slots = new Group(
    ...dict.indices.flatMap((entry, i) => {
      const x = -6.3 + i * 1.8;
      return [
        label(i, x, 2.3, s.soft, 0.66),
        tile(entry === EMPTY ? '–' : entry === DELETED ? 'D' : entry, x, 1.55, 1.55, 0.85, s, {
          active: phase >= 2 && query.slots.includes(i),
          bad: phase === 4 && i === 0,
          key: `slot-${i}`,
          size: 0.66,
        }),
      ];
    }),
  );
  slots.key = 'dict-index';
  if (phase === 1)
    return new Group(
      slots,
      table(
        ['Key', 'Hash', 'Start slot'],
        [0, 8, 16].map((k) => [k, k, k & 7]),
        s,
        { xs: [-5, 0, 5], y: 0.25, key: 'dict-hashes', size: 0.66 },
      ),
      label('The slot uses only the hash’s low three bits.', 0, -3.65, s.palette.ink, 0.66),
    );
  const entries = table(
    ['Entry', 'Key', 'Value'],
    dict.entries.map((e, i) => [i, e.key ?? '–', e.value ?? '–']),
    s,
    { xs: [-5.8, -3.5, -0.8], y: 0.1, gap: 0.85, key: 'dict-entries', size: 0.66 },
  );
  const result = new Group(
    label(`d[${query.key}]`, 4.6, 0.25, s.palette.ink, 0.8),
    label(phase === 0 ? 'Where does it look?' : `Visit: ${query.slots.join(' > ')}`, 4.4, -0.8, s.soft, 0.66),
    label(
      phase >= 3 ? (query.found ? query.value! : 'not found') : 'Follow the slots',
      4.4,
      -1.75,
      query.found ? s.good : s.bad,
      0.66,
    ),
  );
  result.key = 'dict-result';
  return new Group(
    slots,
    entries,
    result,
    label(
      phase === 2 ? 'Key 16 probes 0 > 1 > 6.' : '– means never used; D means deleted.',
      0,
      -3.55,
      s.palette.ink,
      0.66,
    ),
  );
}
export default class PythonDict extends Scene {
  static meta = {
    id: 'python-dict',
    title: 'Why does a deleted dictionary slot need a marker?',
    sources: [
      'https://github.com/python/cpython/blob/v3.12.14/Objects/dictobject.c',
      'https://github.com/python/cpython/blob/v3.12.14/Include/internal/pycore_dict.h',
      'https://just-taking-a-ride.com/inside_python_dict/',
    ],
  };
  static settings = [
    {
      id: 'key',
      label: 'Look up key',
      default: '8',
      options: [
        { value: '8', label: '8: pear' },
        { value: '16', label: '16: plum' },
      ],
    },
  ];
  override async construct() {
    const key = Number(settingsOf(this).key),
      m = dictStory(key);
    const phases = [
      [
        'question',
        `How will Python find key ${key}?`,
        'The index points into an ordered list of entries.',
        `This CPython 3.12.14 example holds three integer keys in an eight-slot index. To find ${key}, Python first chooses a slot, then checks the entry it points to.`,
        m.original,
        m.before,
      ],
      [
        'hash',
        'Three hashes start at slot 0',
        'Different hashes can choose the same starting slot.',
        'The integer hashes are 0, 8 and 16. Masking each hash to an eight-slot index gives slot 0, so the keys need a way to continue when that slot is occupied.',
        m.original,
        m.before,
      ],
      [
        'collision',
        'A collision continues the search',
        'Key 16 passes occupied slots 0 and 1 before reaching 6.',
        'The index stores entry numbers. Key 0 uses slot 0, key 8 continues to slot 1, and key 16 reaches slot 6. Their entries retain insertion order.',
        m.original,
        dictStory(16).before,
      ],
      [
        'lookup',
        'The matching key decides the result',
        `Follow the visited slots to ${m.before.value}.`,
        `The search for ${key} visits ${m.before.slots.join(', ')}. Python compares the stored key at each occupied slot and returns ${m.before.value} when the key matches.`,
        m.original,
        m.before,
      ],
      [
        'broken',
        `An incorrect clear loses key ${key}`,
        'This deliberately broken rule treats a deleted slot as never used.',
        `Suppose deletion replaced slot 0 with the never-used marker. The search would stop there and report ${key} missing, although its entry still exists.`,
        m.wrong,
        m.broken,
      ],
      [
        'marker',
        'D keeps the search going',
        'The deleted entry is empty; its index slot still carries a marker.',
        `D denotes CPython’s deleted-slot marker. The search skips slot 0, continues through ${m.repaired.slots.join(', ')}, and finds ${m.repaired.value}.`,
        m.correct,
        m.repaired,
      ],
      [
        'missing',
        'An unused slot ends the search',
        'Key 24 reaches slot 7, which has never held an entry.',
        'Key 24 visits slots 0, 1, 6 and 7. D preserves the path through slot 0; the never-used slot 7 finally proves the key is absent. This example keeps capacity fixed and does not cover resizing.',
        m.correct,
        m.missing,
      ],
    ] as const;
    const frames = phases.map(([id, title, line, caption, dict, result], i) => ({
      id: String(id),
      title: String(title),
      line: String(line),
      caption: String(caption),
      state: { dict, result, key, policy: i === 4 ? 'incorrect-clear' : 'CPython marker' },
      draw: (s: Stage) => picture(s, dict, result, i),
    }));
    frames.splice(4, 0, {
      id: 'predict',
      title: `Delete key 0: can the search still reach ${key}?`,
      line: 'Decide whether slot 0 can become a never-used slot.',
      caption: `Key ${key} starts at slot 0, where key 0 currently lives. Suppose deletion replaces it with “never used”. Would the lookup stop or continue to the next slot?`,
      state: { dict: m.original, result: m.before, key, policy: 'prediction' },
      draw: (s) => {
        const g = picture(s, m.original, m.before, 4);
        (g.children[2]!.children[2] as Text).setText('Keep probing?');
        (g.children.at(-1) as Text).setText('Proposed edit: slot 0 becomes unused.');
        return g;
      },
    });
    await lesson(this, frames);
  }
}
