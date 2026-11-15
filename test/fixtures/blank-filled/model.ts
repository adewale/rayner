// Array.prototype.sort with no compare function: it turns each element into a string and orders
// the strings by their UTF-16 code units (ECMA-262, SortCompare). This model orders them the same
// way by insertion, without calling sort, so model.test.ts can compare it with the real one.

/** The array before and after the sort, as the reader reads them. */
export type State = { input: string; sorted: string };

/** `values` in the order sort() with no compare function gives them: as strings, by code units. */
export function sortAsText(values: readonly number[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    let at = out.length;
    while (at > 0 && String(value) < String(out[at - 1])) at--;
    out.splice(at, 0, value);
  }
  return out;
}

const shown = (values: readonly number[]) => `[${values.join(', ')}]`;

/** The reader's array, and what sort() makes of it. */
export const start = (values: readonly number[] = [10, 9, 1]): State => ({ input: shown(values), sorted: shown(sortAsText(values)) });
