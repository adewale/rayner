// Words for numbers and lists, as the collection's captions write them. This is the collection's
// own code, not the engine's: wording is the author's work (docs/ENGINE.md, "What belongs in
// Rayner"), so each explainer chooses its rounding and its word for zero here, by option.

/**
 * An English list: "a", "a and b", "a, b and c"; '' for none. No serial comma. `or` joins the last
 * two with "or" instead: "a, b or c".
 */
export function listed(items: readonly (string | number)[], { or = false }: { or?: boolean } = {}): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${or ? 'or' : 'and'} ${items.at(-1)}`;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/**
 * A count as a word, "one" to "twelve", and as numerals past that. `zero` is the word for 0 ("no"
 * in "no shared birthdays", "none" standing alone). A count that is not a whole number from 0 is
 * written in numerals. `capital` starts the result with a capital, to open a sentence: "Three".
 */
export function numberWord(n: number, { zero = 'no', capital = false }: { zero?: string; capital?: boolean } = {}): string {
  const word = n === 0 ? zero : Number.isInteger(n) && n > 0 && n < WORDS.length ? WORDS[n]! : String(n);
  return capital ? upperFirst(word) : word;
}

export interface CountedOptions {
  /** The plural; the word with an s by default. */
  plural?: string;
  /** Write the count as numberWord writes it, "three", instead of in numerals. */
  words?: boolean;
  /** With `words`, the word for 0, as numberWord takes it. */
  zero?: string;
  /** Write the count with this many decimal places ("1.5 tokens"); it is still singular only at exactly 1. */
  digits?: number;
}

/** A count and its noun, plural unless the count is exactly 1: "1 edit", "3 edits", with `words` "three edits". */
export function counted(n: number, word: string, { plural = `${word}s`, words = false, zero, digits }: CountedOptions = {}): string {
  const number = words ? numberWord(n, zero === undefined ? {} : { zero }) : digits === undefined ? String(n) : n.toFixed(digits);
  return `${number} ${n === 1 ? word : plural}`;
}

/** A number with a comma between each group of three digits, "1,234,567", whatever the reader's locale. */
export function grouped(n: number): string {
  const [whole, fraction] = String(n).split('.');
  return whole!.replace(/\B(?=(\d{3})+$)/g, ',') + (fraction === undefined ? '' : `.${fraction}`);
}

/** The text with its first letter a capital: "day 3" is "Day 3". */
export function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** An English ordinal in numerals: "1st", "2nd", "3rd", "11th", "21st", "112th". */
export function ordinal(n: number): string {
  const tens = n % 100,
    units = n % 10;
  return `${n}${tens >= 11 && tens <= 13 ? 'th' : units === 1 ? 'st' : units === 2 ? 'nd' : units === 3 ? 'rd' : 'th'}`;
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
