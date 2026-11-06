// Words for numbers and lists, as the collection's captions write them. This is the collection's
// own code, not the engine's: wording is the author's work (docs/ENGINE.md, "What belongs in
// Rayner"), so each explainer chooses its rounding and its word for zero here, by option.

/** An English list: "a", "a and b", "a, b and c"; '' for none. No serial comma. */
export function listed(items: readonly (string | number)[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/**
 * A count as a word, "one" to "ten", and as numerals past that. `zero` is the word for 0 ("no" in
 * "no shared birthdays", "none" standing alone). A count that is not a whole number from 0 is
 * written in numerals.
 */
export function numberWord(n: number, { zero = 'no' }: { zero?: string } = {}): string {
  if (n === 0) return zero;
  return Number.isInteger(n) && n > 0 && n < WORDS.length ? WORDS[n]! : String(n);
}

export interface PercentOptions {
  /** Decimal places; 1 by default. */
  digits?: number;
  /** What the value is out of: 1 (the default) for a fraction, 100 for a value already in percent, or any whole. */
  of?: number;
  /** Under 1%, write this many decimal places, or this many significant digits, instead of `digits`. */
  under1?: { digits: number } | { significant: number };
  /** A share above zero never reads below this many percent, so a drawn slice never reads 0.0%. */
  least?: number;
  /**
   * How the last digit rounds. `'toFixed'` (the default) rounds the stored value's exact binary
   * expansion; `'Math.round'` scales by 10^digits first, which can round the product up to a half and
   * then rounds half up. They differ at 0.15%: stored as 0.1499…, toFixed writes 0.1%, while
   * 0.15 × 10 is exactly 1.5 and Math.round writes 0.2%. Two explainers round the second way.
   */
  rounding?: 'toFixed' | 'Math.round';
}

/**
 * A share as a percentage, "37.0%". `percent(0.37)` reads a fraction; `of` reads a part of a whole
 * (`percent(5, { of: 20 })` is "25.0%") or a value already in percent (`{ of: 100 }`).
 */
export function percent(x: number, { digits = 1, of = 1, under1, least, rounding = 'toFixed' }: PercentOptions = {}): string {
  let p = of === 100 ? x : (100 * x) / of;
  if (under1 && p < 1) {
    if ('significant' in under1) return `${p.toPrecision(under1.significant)}%`;
    digits = under1.digits;
  }
  if (rounding === 'Math.round') p = Math.round(p * 10 ** digits) / 10 ** digits;
  if (least !== undefined && x > 0) p = Math.max(least, p);
  return `${p.toFixed(digits)}%`;
}
