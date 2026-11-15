// Array.prototype.sort, with no compare function and with (a, b) => a - b. With none, sort turns each
// element into a string and orders the strings by their UTF-16 code units (ECMA-262, SortCompare);
// with a - b it orders them as numbers. This model orders them by insertion, without calling sort,
// so model.test.ts can compare it with the real one.

/** How sort() compares: as strings (no compare function) or as numbers ((a, b) => a - b). */
export type Compare = 'none' | 'numbers';
/** The numbers the reader can add at the live step, each once. */
export const ADDS = [2, 25, 100] as const;
export type SortEvent = `add ${(typeof ADDS)[number]}`;
export const EVENTS: readonly SortEvent[] = ADDS.map((n) => `add ${n}` as const);

/** The array as written, and whether the picture shows what sort() makes of it yet. */
export type State = { values: number[]; compare: Compare; sorted: boolean };

/** Whether `a` goes before `b` when sort() compares as `compare` says. */
const before = (a: number, b: number, compare: Compare) => (compare === 'none' ? String(a) < String(b) : a - b < 0);

/** `values` in the order sort() gives them: as strings by code units with no compare function, or as numbers. */
export function sorted(values: readonly number[], compare: Compare): number[] {
  const out: number[] = [];
  for (const value of values) {
    let at = out.length;
    while (at > 0 && before(value, out[at - 1]!, compare)) at--;
    out.splice(at, 0, value);
  }
  return out;
}

/** The reader's array before the sort. */
export const start = (compare: Compare): State => ({ values: [10, 9, 1], compare, sorted: false });

/** The array with `event`'s number put on its end: what the live step's buttons do. */
export const next = (state: State, event: SortEvent): State => ({ ...state, values: [...state.values, Number(event.slice(4))] });

/** Where the story stops: the picture shows each number once. */
export const bound = (state: State, event: SortEvent): string | undefined => {
  const n = Number(event.slice(4));
  return state.values.includes(n) ? `the array holds ${n} already, and this picture shows each number once` : undefined;
};
