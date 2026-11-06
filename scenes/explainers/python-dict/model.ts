import { refuse } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';
// CPython v3.12.14, Objects/dictobject.c: do_lookup(), insertdict(), delitem_common().
// This lesson fixes capacity at eight and uses three small integer keys. It
// models the compact combined table; resizing, insertion after deletion (reusing a deleted
// slot), split instance dicts and custom hashing or equality are out of scope. The keys 0, 8
// and 16 hash to themselves and share their low three bits; that holds for these keys only
// (hash(-1) is -2). The 'incorrect-clear' policy, which empties the slot, is a counterfactual,
// not Python's deletion. The fixed-size lookup refuses a table with no unused slot to stop at.
export const EMPTY = -1, DELETED = -2;
export interface DictEntry {key: number | null; value: string | null}
export interface DictTable {indices: number[]; entries: DictEntry[]}
export interface DictLookup {key: number; slots: number[]; found: boolean; value: string | null; stopped: 'key' | 'unused'}
export function probeSlots(key: number): number[] {
  if (!Number.isSafeInteger(key) || key < 0 || key > 0x7fffffff) throw new Error('Dictionary lesson keys must be nonnegative 31-bit integers');
  let slot = key & 7, perturb = key;
  const slots = [];
  // Once perturb reaches zero, the recurrence visits every slot in eight steps.
  for (let i = 0; i < 15; i++) {slots.push(slot); perturb >>>= 5; slot = (5 * slot + perturb + 1) & 7;}
  return slots;
}
export function lookup(table: DictTable, key: number): DictLookup {
  const slots: number[] = [];
  for (const slot of probeSlots(key)) {
    slots.push(slot);
    const index = table.indices[slot]!;
    if (index === EMPTY) return {key, slots, found: false, value: null, stopped: 'unused'};
    if (index >= 0 && table.entries[index]!.key === key)
      return {key, slots, found: true, value: table.entries[index]!.value, stopped: 'key'};
  }
  throw new Error('The eight-slot dictionary lesson needs an unused slot');
}
/** One slot a lookup reads: a key, D or never used; and whether the search goes on, has found its key, or stops. */
export interface RouteHop {slot: number; reads: number | 'D' | 'never used'; then: 'on' | 'found' | 'stop'}
/** A finished lookup as hops along the slot row, plus the never-used slots its hops fly over without reading. */
export function route(table: DictTable, result: DictLookup): {hops: RouteHop[]; passedOver: number[]} {
  const hops = result.slots.map((slot, i): RouteHop => {
    const at = table.indices[slot]!;
    const reads = at === EMPTY ? 'never used' : at === DELETED ? 'D' : table.entries[at]!.key!;
    return {slot, reads, then: i < result.slots.length - 1 ? 'on' : result.found ? 'found' : 'stop'};
  });
  const passedOver = new Set<number>();
  for (let i = 1; i < result.slots.length; i++) {
    const a = result.slots[i - 1]!, b = result.slots[i]!;
    for (let slot = Math.min(a, b) + 1; slot < Math.max(a, b); slot++)
      if (table.indices[slot] === EMPTY && !result.slots.includes(slot)) passedOver.add(slot);
  }
  return {hops, passedOver: [...passedOver].sort((x, y) => x - y)};
}
export function dictionary(): DictTable {
  const table: DictTable = {indices: Array(8).fill(EMPTY), entries: []};
  for (const [key, value] of [[0, 'apple'], [8, 'pear'], [16, 'plum']] as const) {
    const slot = probeSlots(key).find(s => table.indices[s] === EMPTY)!;
    table.indices[slot] = table.entries.length;
    table.entries.push({key, value});
  }
  return table;
}
/**
 * `del d[key]` as delitem_common does it: find the key's slot by the same search a lookup makes, then write the
 * deleted marker there (or, in the counterfactual, empty it) and empty its entry. Undefined when the search does
 * not find the key: Python raises KeyError and the dict is unchanged.
 */
export function remove(table: DictTable, key: number, policy: 'marker' | 'clear'): DictTable | undefined {
  const found = lookup(table, key);
  if (!found.found) return undefined;
  const slot = found.slots.at(-1)!, entry = table.indices[slot]!;
  const next: DictTable = {indices: [...table.indices], entries: table.entries.map(e => ({...e}))};
  next.indices[slot] = policy === 'marker' ? DELETED : EMPTY;
  next.entries[entry] = {key: null, value: null};
  return next;
}
export function deleteFirst(policy: 'marker' | 'clear'): DictTable {
  return remove(dictionary(), 0, policy)!;
}
export function dictStory(key: number) {
  const original = dictionary(), wrong = deleteFirst('clear'), correct = deleteFirst('marker');
  return {
    original, wrong, correct,
    before: lookup(original, key), broken: lookup(wrong, key), repaired: lookup(correct, key), missing: lookup(correct, 24),
    starts: [0, 8, 16].map(key => ({key, hash: key, slot: key & 7})),
  };
}

// ---- the dict as a machine: deletions and lookups, one event at a time ----
/** How a deletion leaves its slot: CPython's deleted marker, or the counterfactual that empties it. */
export type DictPolicy = 'CPython marker' | 'incorrect-clear';
/** What a reader can do to the lesson's dict: delete one of its keys, or look one up (24 was never stored). */
export const DICT_EVENTS = ['del d[0]', 'del d[8]', 'del d[16]', 'd[0]', 'd[8]', 'd[16]', 'd[24]'] as const;
export type DictEvent = typeof DICT_EVENTS[number];
/**
 * The dict after some events, and the last event's search: a lookup's result, or the search `del` made to find
 * the slot it then wrote (`op: 'del'`). `route` is that search read slot by slot, on the table it searched.
 */
export interface DictState {
  dict: DictTable;
  policy: DictPolicy;
  op: 'lookup' | 'del' | null;
  result: DictLookup | null;
  route: {hops: RouteHop[]; passedOver: number[]} | null;
}
export function dictStart(policy: DictPolicy): DictState {
  return {dict: dictionary(), policy, op: null, result: null, route: null};
}
const eventKey = (event: DictEvent) => Number(/\[(\d+)\]/.exec(event)![1]);
/**
 * The model's step. A lookup always has a result, found or not: KeyError is an answer the lesson shows. A
 * deletion whose search cannot find its key is refused, as Python refuses it (KeyError, and nothing changes),
 * saying where the search stopped.
 */
export function dictNext(state: DictState, event: DictEvent): DictState | Refusal {
  const key = eventKey(event), result = lookup(state.dict, key), seen = route(state.dict, result);
  if (!event.startsWith('del ')) return {dict: state.dict, policy: state.policy, op: 'lookup', result, route: seen};
  const dict = remove(state.dict, key, state.policy === 'CPython marker' ? 'marker' : 'clear');
  return dict ? {dict, policy: state.policy, op: 'del', result, route: seen}
    : refuse(`the search for ${key} stops at never-used slot ${result.slots.at(-1)}, so del d[${key}] raises KeyError and changes nothing`);
}
