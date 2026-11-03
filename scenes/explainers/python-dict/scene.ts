import { Scene, Group, Rectangle, CurvedArrow } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { dictStory, route, EMPTY, DELETED } from '../lib/python-dict.ts';
import type { DictTable, DictLookup } from '../lib/python-dict.ts';
import { lesson, label, tile, table } from '../lib/lesson-drawing.ts';

/** What one resting picture shows beside the index: the entries and a lookup, or the start-slot table. */
interface View {
  dict: DictTable;
  query: DictLookup;
  /** Mark the slots the lookup visits, draw its hops as arrows along the slot row, and print its path. */
  path: boolean;
  /** The lookup's last line, and whether it reads as found, missing or still open. */
  outcome: string;
  found: boolean | null;
  /** Slots drawn in the emphasis colour without a lookup path. */
  lit?: number[];
  /** Slots drawn in the warning colour. */
  bad: number[];
  /** The line under the picture. */
  note: string;
  /** Show the keys' hashes and start slots instead of the entries. */
  hashes?: { key: number; hash: number; slot: number }[];
  /** The lookup's middle line when the path is hidden. */
  ask?: string;
}

/** The slot grid: eight slots 1.8 apart, each 1.55 wide; tables and the lookup panel line up with its columns.
 *  The route's arrows run in the band under the slots, above the tables' first row at TOP. */
const slotX = (i: number) => -6.3 + i * 1.8,
  SLOT_Y = 1.9,
  SLOT_H = 0.85,
  TOP = -0.1,
  HALF = 1.55 / 2,
  LEFT = slotX(0) - HALF,
  RIGHT = slotX(7) + HALF;
/** The lookup's route as arrows under the slot row, one per hop, from each slot it reads to the next. An arrow that
 *  flies over slots does not read them; the search stops in the last slot, which has no arrow out. */
function hops(s: Stage, v: View) {
  const slots = v.query.slots,
    y = SLOT_Y - SLOT_H / 2 - 0.06;
  const g = new Group(
    ...slots.slice(1).map((b, i) => {
      const a = slots[i]!,
        dir = Math.sign(b - a),
        from: [number, number] = [slotX(a) + dir * 0.25, y],
        to: [number, number] = [slotX(b) - dir * 0.25, y],
        chord = Math.abs(to[0] - from[0]),
        sag = Math.min(0.8, 0.25 + 0.06 * chord);
      // A positive angle bulges to the right of the direction of travel: below the row when the hop goes right.
      return new CurvedArrow(from, to, { angle: dir * 4 * Math.atan((2 * sag) / chord), stroke: s.emphasis, strokeWidth: 0.045, tipLength: 0.22, tipWidth: 0.2 });
    }),
  );
  g.key = 'dict-route';
  return g;
}

function picture(s: Stage, v: View) {
  const stop = v.path && !v.query.found ? v.query.slots.at(-1)! : -1;
  const slots = new Group(
    ...v.dict.indices.flatMap((entry, i) => {
      const x = slotX(i);
      return [
        label(i, x, SLOT_Y + 0.72, s.soft, 0.66),
        tile(entry === EMPTY ? '–' : entry === DELETED ? 'D' : entry, x, SLOT_Y, 1.55, SLOT_H, s, {
          active: (v.path && v.query.slots.includes(i)) || !!v.lit?.includes(i),
          // The never-used slot where a search stops is the evidence that its key is absent.
          bad: v.bad.includes(i) || i === stop,
          key: `slot-${i}`,
          size: 0.66,
        }),
      ];
    }),
  );
  slots.key = 'dict-index';
  const note = label(v.note, 0, -3.8, s.palette.ink, 0.62);
  if (v.hashes) {
    const heads = ['Key', 'Hash', 'In binary', 'Start slot'],
      rows = v.hashes.map((h) => [h.key, h.hash, h.hash.toString(2).padStart(5, '0'), h.slot]);
    return new Group(
      slots,
      // The hash table spans the slot row, edge to edge.
      table(heads, rows, s, { xs: { left: LEFT + 0.2, right: RIGHT - 0.2 }, y: TOP, gap: 0.85, key: 'dict-hashes', size: 0.66 }),
      note,
    );
  }
  // The entry table fills the columns under slots 0 to 3; the lookup panel those under slots 4 to 7, its lines on the table's rows.
  const heads = ['Entry', 'Key', 'Value'],
    rows = v.dict.entries.map((e, i) => [i, e.key ?? '–', e.value ?? '–']),
    rowY = (r: number) => TOP - r * 0.85;
  const entries = table(heads, rows, s, {
    xs: { left: LEFT + 0.2, right: slotX(3) + HALF - 0.6 },
    y: rowY(0),
    gap: 0.85,
    key: 'dict-entries',
    size: 0.66,
  });
  const panelX = (slotX(4) - HALF + RIGHT) / 2,
    outcome = v.found === null ? s.palette.ink : v.found ? s.good : s.bad;
  const result = new Group(
    new Rectangle({
      width: RIGHT - (slotX(4) - HALF),
      height: 3.44,
      fill: v.found === null ? s.palette.paper : outcome,
      fillOpacity: v.found === null ? 1 : 0.07,
      stroke: v.found === null ? s.soft : outcome,
      strokeWidth: 0.03,
    }).moveTo([panelX, TOP - 1.15]),
    label(`d[${v.query.key}]`, panelX, TOP - 0.03, s.palette.ink, 0.8),
    label(v.path ? `Visit: ${v.query.slots.join(' > ')}` : (v.ask ?? ''), panelX, TOP - 1.15, s.soft, 0.66),
    label(v.outcome, panelX, TOP - 2.27, outcome, 0.8),
  );
  result.key = 'dict-result';
  return new Group(slots, ...(v.path ? [hops(s, v)] : []), entries, result, note);
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
    // The script's answer and check questions (script.md); `broken` states the answer.
    answer: 'An emptied slot would end the search early, so deletion leaves a marker that says keep looking',
    // "Never used" names a slot's state; the tests hold what the sentences say about it.
    claims: [
      { says: 'never been used', test: 'test/learning-models.test.ts: a probe route reads each visited slot in turn' },
      { says: 'never-used slot', test: 'test/learning-models.test.ts: a probe route reads each visited slot in turn' },
      { says: 'reads never used, and stops', test: 'test/learning-models.test.ts: a probe route reads each visited slot in turn' },
      { says: 'key 24 was never stored', test: 'test/learning-models.test.ts: dictionary slots and deleted entries match captured CPython 3.12 storage' },
      { says: 'whose key never matches', test: 'test/learning-models.test.ts: dictionary slots and deleted entries match captured CPython 3.12 storage' },
      { says: 'keeps only', test: 'test/learning-models.test.ts: dictionary slots and deleted entries match captured CPython 3.12 storage' },
    ],
    checks: [
      {
        question: 'Keep key 0, but delete key 8 from slot 1. What happens to the lookup of key 16 if slot 1 is cleared, and if it is marked D?',
        answer: 'Clearing slot 1 makes key 16 unreachable: its lookup visits slots 0, 1 and 6, so it stops at 1 before reaching plum. A D in slot 1 keeps the search moving to slot 6. A deletion marker matters in the middle of a probe path too.',
      },
      {
        question: 'After deleting key 0 correctly, someone replaces every never-used slot with D. Could a lookup of absent key 24 still use the stopping rule this lesson shows?',
        answer: 'No. It would have no never-used slot at which to stop. D means keep looking, not absent. A real dict must preserve an unused slot or rebuild its table; this fixed-size model refuses a table with no unused stopping slot.',
      },
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
      m = dictStory(key),
      sixteen = dictStory(16).before,
      eight = dictStory(8).before;
    const value = m.before.value!,
      entry = m.original.entries.findIndex((e) => e.key === key),
      home = m.original.indices.indexOf(entry);
    /** What a search finds in each slot it passes, read from the table. */
    const passes = (dict: DictTable, slots: number[]) =>
      slots.map((i) => {
        const at = dict.indices[i]!;
        return at === DELETED ? `D at ${i}` : at === EMPTY ? `never used at ${i}` : `key ${dict.entries[at]!.key} at ${i}`;
      });
    const onward = m.repaired.slots.slice(1);
    const missingPasses = passes(m.correct, m.missing.slots.slice(0, -1)),
      missingStop = m.missing.slots.at(-1)!;
    /** The first never-used slot that one of 24's arrows flies over, and the hop that flies over it, from the route. */
    const missingRoute = route(m.correct, m.missing),
      offRoute = missingRoute.passedOver[0],
      overHop = offRoute === undefined ? -1 : m.missing.slots.findIndex((b, i) => i > 0 && Math.min(b, m.missing.slots[i - 1]!) < offRoute && offRoute < Math.max(b, m.missing.slots[i - 1]!));
    const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

    const frames = [
      {
        id: 'question',
        title: `Delete key 0. Can Python still find key ${key}?`,
        line: `Predict: if del d[0] just empties slot 0, what does d[${key}] give?`,
        caption: `This dict uses an index and a separate entry table: a slot points to the entry holding its key and value. Here slot ${home} points to ${value}’s entry. The – marks a slot that has never been used. Delete key 0 by clearing slot 0 and its entry. Would d[${key}] still find ${value}?`,
        state: { dict: m.original, result: m.before, key, policy: 'prediction' },
        view: {
          dict: m.original,
          query: m.before,
          path: false,
          ask: `now: ${value}`,
          outcome: 'after del d[0]?',
          found: null,
          bad: [0],
          note: '– marks a slot that has never been used.',
        },
      },
      {
        id: 'broken',
        title: `Empty slot 0, and d[${key}] can no longer find ${value}`,
        line: `The search for ${key} starts at slot 0, reads never used, and stops.`,
        caption: `Suppose deletion emptied slot 0 like this. d[${key}] would raise KeyError, although ${value} is still stored in entry ${entry}: these three keys all start their searches at slot 0. When 0 occupied it, the other keys went into later slots. A lookup retraces that route, and a never-used slot tells it to stop. An emptied slot would end the search early, so deletion leaves a marker that says keep looking.`,
        state: { dict: m.wrong, result: m.broken, key, policy: 'incorrect-clear', route: route(m.wrong, m.broken) },
        view: {
          dict: m.wrong,
          query: m.broken,
          path: true,
          outcome: 'KeyError',
          found: false,
          bad: [0],
          note: `${value} is still stored, in entry ${entry}.`,
        },
      },
      {
        id: 'marker',
        title: 'CPython leaves D in slot 0, and the search goes on',
        line: 'Predict: key 24 was never stored and starts at slot 0. Where does its search stop, and why?',
        caption: `In CPython, del d[0] writes a deleted marker, drawn here as D, into slot 0 and empties entry 0. A search treats D as a taken slot whose key never matches: the search for ${key} reads D at slot 0, moves on to slot ${onward.join(', then ')}, and finds ${m.repaired.value}. The arrows under the slots follow the search from each slot it reads to the next.`,
        state: { dict: m.correct, result: m.repaired, key, policy: 'CPython marker', route: route(m.correct, m.repaired) },
        view: {
          dict: m.correct,
          query: m.repaired,
          path: true,
          outcome: m.repaired.value!,
          found: true,
          bad: [],
          note: 'D marks a deleted slot: taken, so keep looking.',
        },
      },
      {
        id: 'missing',
        title: `Answer: at slot ${missingStop}, the first never-used slot on its route`,
        line: 'D and taken slots send a search on; a never-used slot stops it.',
        caption: `Key 24’s search passes ${list(missingPasses)}, and stops at slot ${missingStop}, which has never been used: 24 is not in the dict. ${
          offRoute === undefined
            ? ''
            : `Slot ${offRoute} has never been used either, but the arrow from slot ${m.missing.slots[overHop - 1]} to slot ${m.missing.slots[overHop]} flies over it: 24’s search does not read it, and only slots on the route count. `
        }A deleted marker keeps the route open, and a never-used slot on it is the evidence that the key is absent. This example keeps eight slots throughout and does not cover resizing.`,
        state: { dict: m.correct, result: m.missing, key, policy: 'CPython marker', route: missingRoute },
        view: {
          dict: m.correct,
          query: m.missing,
          path: true,
          outcome: 'not found',
          found: false,
          bad: [],
          note: `Slot ${missingStop} has never been used, so key 24 is absent.`,
        },
      },
      {
        id: 'hash',
        detail: true,
        title: 'Why slot 0: all three keys start there',
        line: 'An eight-slot index keeps only the hash’s low three bits.',
        caption: `For these keys, Python uses the integer itself as its hash, so the hashes are ${m.starts.map((s) => s.hash).join(', ')}. With eight slots, Python keeps only the last three bits of the hash, and all three end in 000 in binary, so all three keys start at slot 0. Key 0 was stored first and took it.`,
        state: { dict: m.original, result: m.before, key, policy: 'CPython marker' },
        view: {
          dict: m.original,
          query: m.before,
          path: false,
          outcome: '',
          found: null,
          bad: [],
          lit: [0],
          note: 'Start slot: the last three bits of the hash.',
          hashes: m.starts,
        },
      },
      {
        id: 'collision',
        detail: true,
        title: 'A taken slot sends the search on',
        line: `Key 16 passes taken slots ${list(sixteen.slots.slice(0, -1).map(String))} to reach slot ${sixteen.slots.at(-1)}.`,
        caption: `When a key’s slot is taken, Python works out the next slot from the hash and tries again. Storing 8, it found slot 0 taken and used slot ${eight.slots.at(-1)}; storing 16, it found ${list(sixteen.slots.slice(0, -1).map(String))} taken and used slot ${sixteen.slots.at(-1)}. A lookup retraces the same path, checking the key in each taken slot, until the key matches or it reads a never-used slot. That is why an emptied slot 0 stops the search for 8 and for 16.`,
        state: { dict: m.original, result: sixteen, key, policy: 'CPython marker', route: route(m.original, sixteen) },
        view: {
          dict: m.original,
          query: sixteen,
          path: true,
          outcome: sixteen.value!,
          found: true,
          bad: [],
          note: `Key 16 visits ${sixteen.slots.join(' > ')}; key 8 visits ${eight.slots.join(' > ')}.`,
        },
      },
    ];
    await lesson(
      this,
      frames.map(({ view, ...frame }) => ({ ...frame, draw: (s: Stage) => picture(s, view as View) })),
    );
  }
}
