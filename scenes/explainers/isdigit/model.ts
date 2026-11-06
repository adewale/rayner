// CPython's three numeric predicates and int(), decided for one character from its row in the
// Unicode Character Database. Pure TypeScript with no Node APIs: the scene runs it in the page.
//
// The rows are copied verbatim from Unicode 17.0.0, https://www.unicode.org/Public/17.0.0/ucd/:
// UnicodeData.txt (line numbers given with each row) and Unihan_NumericValues.txt in Unihan.zip.
// UAX #44 revision 38 (https://www.unicode.org/reports/tr44/tr44-38.html), #UnicodeData.txt and
// #Numeric_Type: field 6 holds a value only for Numeric_Type=Decimal, field 7 for Decimal and Digit,
// field 8 for every numeric character; Unihan's kPrimaryNumeric, kAccountingNumeric and kOtherNumeric
// give Numeric_Type=Numeric to ideographs, whose UnicodeData.txt row (a First/Last range) has all three
// empty. The field table, at field 7, says no character encoded since Unicode 6.3.0 gets Numeric_Type=Digit.
//
// CPython v3.15.1 (https://github.com/python/cpython/tree/v3.15.1) turns the fields into flags in
// Tools/unicode/makeunicodedata.py:595-603: a non-empty field 6 sets DECIMAL_MASK, field 7 DIGIT_MASK,
// field 8 NUMERIC_MASK (the script names fields 6, 7 and 8 decomposition_mapping, numeric_type and
// numeric_value, lines 998-1000); lines 1210-1222 copy the three Unihan tags into field 8.
// Objects/unicodectype.c:105-144: isdecimal, isdigit and isnumeric each test one flag.
// Objects/longobject.c:3193 and Objects/unicodeobject.c:9536-9553: int() first rewrites each non-ASCII
// character as ' ' if it is a space, as '0' + its field 6 value if it has one, and otherwise as '?',
// which no base-10 parse accepts.
// Its limits: one character at a time. Signs, underscores, surrounding whitespace, other bases and
// the rest of int()'s string grammar are not modelled. Everything is pinned to CPython 3.15.1 and
// Unicode 17.0.0 (COUNTS below comes from a scan of that version); CPython's generated tables
// implement the three fields, and int() does not read UnicodeData.txt at run time.

export type CharId = 'ascii' | 'arabic' | 'devanagari' | 'fullwidth' | 'super' | 'half' | 'roman' | 'han';
export type Predicate = 'isdecimal' | 'isdigit' | 'isnumeric';
export type NumericType = 'Decimal' | 'Digit' | 'Numeric' | 'None';
export const PREDICATES: readonly Predicate[] = ['isdecimal', 'isdigit', 'isnumeric'];

export interface Char {
  /** One of the lineup's eight, or `unshown`: a character only a check question names. */
  id: CharId | 'unshown';
  char: string;
  /** "U+00B2". */
  code: string;
  name: string;
  /** The UnicodeData.txt row that covers the character, verbatim, and its line number in the file. */
  ucd: string;
  ucdLine: number;
  /** For an ideograph: its numeric tag and value in Unihan_NumericValues.txt, and that line's number. */
  unihan?: { tag: 'kPrimaryNumeric' | 'kAccountingNumeric' | 'kOtherNumeric'; value: string; line: number };
  /** Python counts it as whitespace (Py_UNICODE_ISSPACE), so int() and float() rewrite it as ' '. */
  space?: true;
}

const row = (id: CharId, char: string, name: string, ucd: string, ucdLine: number, unihan?: Char['unihan']): Char => ({
  id,
  char,
  code: 'U+' + char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'),
  name,
  ucd,
  ucdLine,
  ...(unihan ? { unihan } : {}),
});

/** Eight characters with a numeric value: the four decimal threes, then one of each other kind. */
export const CHARS: Readonly<Record<CharId, Char>> = {
  ascii: row('ascii', '3', 'DIGIT THREE', '0033;DIGIT THREE;Nd;0;EN;;3;3;3;N;;;;;', 52),
  arabic: row('arabic', '٣', 'ARABIC-INDIC DIGIT THREE', '0663;ARABIC-INDIC DIGIT THREE;Nd;0;AN;;3;3;3;N;;;;;', 1598),
  devanagari: row('devanagari', '३', 'DEVANAGARI DIGIT THREE', '0969;DEVANAGARI DIGIT THREE;Nd;0;L;;3;3;3;N;;;;;', 2337),
  fullwidth: row('fullwidth', '３', 'FULLWIDTH DIGIT THREE', 'FF13;FULLWIDTH DIGIT THREE;Nd;0;EN;<wide> 0033;3;3;3;N;;;;;', 16765),
  super: row('super', '²', 'SUPERSCRIPT TWO', '00B2;SUPERSCRIPT TWO;No;0;EN;<super> 0032;;2;2;N;SUPERSCRIPT DIGIT TWO;;;;', 179),
  half: row('half', '½', 'VULGAR FRACTION ONE HALF', '00BD;VULGAR FRACTION ONE HALF;No;0;ON;<fraction> 0031 2044 0032;;;1/2;N;FRACTION ONE HALF;;;;', 190),
  roman: row('roman', 'Ⅻ', 'ROMAN NUMERAL TWELVE', '216B;ROMAN NUMERAL TWELVE;Nl;0;L;<compat> 0058 0049 0049;;;12;N;;;;217B;', 7719),
  han: row('han', '三', 'CJK UNIFIED IDEOGRAPH-4E09', '4E00;<CJK Ideograph, First>;Lo;0;L;;;;;N;;;;;', 12349, {
    tag: 'kPrimaryNumeric',
    value: '3',
    line: 29,
  }),
};
export const LINEUP: readonly CharId[] = ['ascii', 'arabic', 'devanagari', 'fullwidth', 'super', 'half', 'roman', 'han'];
/** A character the steps never show, for a check question: its row is given and the reader applies fields 6, 7 and 8 to it. */
export const UNSHOWN: Char = {
  ...row('super', '⑤', 'CIRCLED DIGIT FIVE', '2464;CIRCLED DIGIT FIVE;No;0;ON;<circle> 0035;;5;5;N;;;;;', 8433),
  id: 'unshown',
};
/** A second unshown character, for a check question: a styled digit whose row fills field 6. */
export const UNSHOWN_DECIMAL: Char = {
  ...row('ascii', '𝟗', 'MATHEMATICAL BOLD DIGIT NINE', '1D7D7;MATHEMATICAL BOLD DIGIT NINE;Nd;0;EN;<font> 0039;9;9;9;N;;;;;', 35286),
  id: 'unshown',
};

/**
 * A third unshown character, for a check question: U+3000, a space by its General_Category Zs, so Python counts it as
 * whitespace and unicodeobject.c:9541 rewrites it as ' '. UnicodeData.txt 17.0.0 line 11279.
 */
export const SPACE: Char = {
  ...row('ascii', '\u3000', 'IDEOGRAPHIC SPACE', '3000;IDEOGRAPHIC SPACE;Zs;0;WS;<wide> 0020;;;;N;;;;;', 11279),
  id: 'unshown',
  space: true,
};

/** UnicodeData.txt fields 6, 7 and 8 for the character, with Unihan's value in field 8 as CPython puts it. */
export function fields(c: Char): { decimal: string; digit: string; numeric: string } {
  const f = c.ucd.split(';');
  if (f.length !== 15) throw new Error(`${c.code}: a UnicodeData.txt row has 15 fields, not ${f.length}`);
  return { decimal: f[6]!, digit: f[7]!, numeric: c.unihan ? c.unihan.value : f[8]! };
}

/** UAX #44's rule for Numeric_Type from the fields. */
export function numericType(c: Char): NumericType {
  const { decimal, digit, numeric } = fields(c);
  if (decimal && digit && numeric) return 'Decimal';
  if (digit && numeric) return 'Digit';
  if (numeric) return 'Numeric';
  return 'None';
}

/** The flags makeunicodedata.py sets: one per non-empty field. */
export function flags(c: Char): Record<'DECIMAL_MASK' | 'DIGIT_MASK' | 'NUMERIC_MASK', boolean> {
  const { decimal, digit, numeric } = fields(c);
  return { DECIMAL_MASK: decimal !== '', DIGIT_MASK: digit !== '', NUMERIC_MASK: numeric !== '' };
}

/** What `c.isdecimal()`, `c.isdigit()` and `c.isnumeric()` return for the one-character string. */
export function predicates(c: Char): Record<Predicate, boolean> {
  const f = flags(c);
  return { isdecimal: f.DECIMAL_MASK, isdigit: f.DIGIT_MASK, isnumeric: f.NUMERIC_MASK };
}

/** The ASCII character int() puts in the character's place before it parses: unicodeobject.c:9538-9552. */
export function asciiFor(c: Char): string {
  const cp = c.char.codePointAt(0)!;
  if (cp < 127) return c.char;
  // None of the eight is a space, so line 9541 applies only to SPACE.
  if (c.space) return ' ';
  const { decimal } = fields(c);
  return decimal ? String.fromCharCode(48 + Number(decimal)) : '?';
}

/** int(c): the value, or the ValueError's message (longobject.c:3209). */
export function intOf(c: Char): { value: number } | { error: string } {
  const ascii = asciiFor(c);
  return /^[0-9]$/.test(ascii)
    ? { value: Number(ascii) }
    : { error: `invalid literal for int() with base 10: '${c.char}'` };
}

/**
 * The text int() and float() parse (floatobject.c:189 calls the same rewrite): ASCII kept, each character
 * rewritten by asciiFor, and everything after the first '?' dropped, as unicodeobject.c:9548-9549 does.
 */
export function rewrite(parts: readonly (Char | string)[]): string {
  let out = '';
  for (const part of parts) for (const ch of typeof part === 'string' ? [...part] : [asciiFor(part)]) {
    if (ch.codePointAt(0)! >= 127) throw new Error(`Give ${ch} as a Char, with its row`);
    out += ch;
    if (ch === '?') return out;
  }
  return out;
}

/** The value the database gives the character, as written in its field 8 or Unihan tag: "1/2", "12". */
export const valueOf = (c: Char): string => fields(c).numeric;

export type Outcome = 'parsed' | 'raised' | 'refused';
/** `if c.<guard>(): n = int(c)`, run: does the guard pass, and what does int() do with what it lets through? */
export function guarded(c: Char, guard: Predicate): { passes: boolean; outcome: Outcome; int: ReturnType<typeof intOf> } {
  const passes = predicates(c)[guard],
    int = intOf(c);
  return { passes, int, outcome: !passes ? 'refused' : 'value' in int ? 'parsed' : 'raised' };
}

// Counted by CPython 3.15.1 (unicodedata.unidata_version 17.0.0) over every code point except the
// surrogates, one character at a time, in the python:3.15-slim Docker image on 2026-10-25; the script
// and its output are in test/explain-isdigit.test.ts. Do not carry them into another Unicode version.
export const COUNTS = { isdecimal: 770, isdigit: 898, isnumeric: 2023, int: 770 } as const;
/** How many characters each predicate accepts that int() rejects, alone. */
export const accepts = (p: Predicate): number => COUNTS[p] - COUNTS.int;
/** 2023 → "2,023". */
export const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+$)/g, ',');
