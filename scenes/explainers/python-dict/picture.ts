import { Group, Rectangle, CurvedArrow, keyed } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { EMPTY, DELETED } from './model.ts';
import type { DictTable, DictLookup, DictState } from './model.ts';
import { label, tile, table } from '../../../explain/drawing.ts';

// How the dict explainer draws one state: the eight-slot index, the entry table (or the keys'
// hashes) and the lookup panel, with the last search drawn as hops along the slot row.

/** What one resting picture shows beside the index: the entries and the last operation, or the start-slot table. */
export interface View {
  dict: DictTable;
  /** The search whose slots are lit, drawn as hops along the slot row; null draws no route. */
  path: DictLookup | null;
  /** The panel: what was asked, its middle line, its answer, and whether that reads as found, missing or neither. */
  ask: string;
  middle: string;
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
}
/** A lookup's panel lines: d[key], the slots it visited, and the answer. */
export const visit = (q: DictLookup) => `Visit: ${q.slots.join(' > ')}`;

/**
 * The machine's picture of a state, from the state alone: the dict, and the last event's search. A lookup reads
 * found, KeyError (its key is still stored but its search stopped first) or not found; a deletion shows the
 * slot it wrote, D or emptied.
 */
export function stateView(st: DictState): View {
  const { dict, result: r } = st;
  if (!r)
    return {
      dict, path: null, ask: 'd', middle: `keys: ${dict.entries.flatMap((e) => (e.key === null ? [] : [e.key])).join(', ')}`,
      outcome: `${dict.entries.filter((e) => e.key !== null).length} stored`, found: null, bad: [], note: '– marks a slot that has never been used.',
    };
  const last = r.slots.at(-1)!;
  if (st.op === 'del') {
    const marker = st.policy === 'CPython marker';
    return {
      dict, path: r, ask: `del d[${r.key}]`, middle: visit(r), outcome: marker ? `D in slot ${last}` : `slot ${last} emptied`, found: null,
      bad: marker ? [] : [last],
      note: marker ? 'D marks a deleted slot: taken, so keep looking.' : `Slot ${last} now reads as never used.`,
    };
  }
  const entry = dict.entries.findIndex((e) => e.key === r.key);
  return {
    dict, path: r, ask: `d[${r.key}]`, middle: visit(r), outcome: r.found ? r.value! : entry >= 0 ? 'KeyError' : 'not found', found: r.found, bad: [],
    note: r.found
      ? r.slots.some((i) => dict.indices[i] === DELETED) ? 'D marks a deleted slot: taken, so keep looking.' : `${r.value} is in entry ${entry}, at slot ${last}.`
      : entry >= 0 ? `${dict.entries[entry]!.value} is still stored, in entry ${entry}.` : `Slot ${last} has never been used, so key ${r.key} is absent.`,
  };
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
function hops(s: Stage, path: DictLookup) {
  const slots = path.slots,
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
      return new CurvedArrow(from, to, { angle: dir * 4 * Math.atan((2 * sag) / chord), stroke: s.look.emphasis, strokeWidth: 0.045, tipLength: 0.22, tipWidth: 0.2 });
    }),
  );
  keyed(g, 'dict-route');
  return g;
}

/**
 * The index, the entries (or the hashes) and the panel. Every part a step changes is keyed, so the machine's keyed
 * morph keeps each slot and each entry row the same part from state to state: slot i is `slot-i` with its entry
 * `slot-i:label`, an entry row is `dict-entries:e<i>` (its cells `dict-entries:e<i>:Key` and so on), and a hash row
 * is `dict-hashes:k<key>`. A deletion's D, and the entry's dashes, replace what was there in place.
 */
export function picture(s: Stage, v: View) {
  const stop = v.path && !v.path.found ? v.path.slots.at(-1)! : -1;
  const slots = new Group(
    ...v.dict.indices.flatMap((entry, i) => {
      const x = slotX(i);
      const slot = tile(s, entry === EMPTY ? '–' : entry === DELETED ? 'D' : entry, {
        at: [x, SLOT_Y],
        width: 1.55,
        height: SLOT_H,
        active: !!v.path?.slots.includes(i) || !!v.lit?.includes(i),
        // The never-used slot where a search stops is the evidence that its key is absent.
        bad: v.bad.includes(i) || i === stop,
        key: `slot-${i}`,
        size: 0.66,
      });
      return [label(s, i, { at: [x, SLOT_Y + 0.72], color: s.look.soft, size: 0.66 }), slot];
    }),
  );
  keyed(slots, 'dict-index');
  const note = label(s, v.note, { at: [0, -3.8], size: 0.62 });
  if (v.hashes) {
    const heads = ['Key', 'Hash', 'In binary', 'Start slot'],
      rows = v.hashes.map((h) => ({ key: `k${h.key}`, cells: [h.key, h.hash, h.hash.toString(2).padStart(5, '0'), h.slot] }));
    return new Group(
      slots,
      // The hash table spans the slot row, edge to edge.
      table(s, heads, rows, { columns: { left: LEFT + 0.2, right: RIGHT - 0.2 }, gap: 0.85, key: 'dict-hashes', size: 0.66, at: [0, TOP] }),
      note,
    );
  }
  // The entry table fills the columns under slots 0 to 3; the lookup panel those under slots 4 to 7, its lines on the table's rows.
  // An entry keeps its row when it is deleted: CPython empties the entry rather than moving the ones after it.
  const heads = ['Entry', 'Key', 'Value'],
    rows = v.dict.entries.map((e, i) => ({ key: `e${i}`, cells: [i, e.key ?? '–', e.value ?? '–'] })),
    rowY = (r: number) => TOP - r * 0.85;
  const entries = table(s, heads, rows, { columns: { left: LEFT + 0.2, right: slotX(3) + HALF - 0.6 }, gap: 0.85, key: 'dict-entries', size: 0.66, at: [0, rowY(0)] });
  const panelX = (slotX(4) - HALF + RIGHT) / 2,
    outcome = v.found === null ? s.look.ink : v.found ? s.look.good : s.look.bad;
  const result = new Group(
    new Rectangle({
      width: RIGHT - (slotX(4) - HALF),
      height: 3.44,
      fill: v.found === null ? s.look.paper : outcome,
      fillOpacity: v.found === null ? 1 : 0.07,
      stroke: v.found === null ? s.look.soft : outcome,
      strokeWidth: 0.03,
    }).moveTo([panelX, TOP - 1.15]),
    label(s, v.ask, { at: [panelX, TOP - 0.03], size: 0.8, key: 'dict-result:ask' }),
    label(s, v.middle, { at: [panelX, TOP - 1.15], color: s.look.soft, size: 0.66, key: 'dict-result:middle' }),
    label(s, v.outcome, { at: [panelX, TOP - 2.27], color: outcome, size: 0.8, key: 'dict-result:outcome' }),
  );
  keyed(result, 'dict-result');
  return new Group(slots, ...(v.path ? [hops(s, v.path)] : []), entries, result, note);
}
