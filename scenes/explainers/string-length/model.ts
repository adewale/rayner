// The string-length explainer's model: three counts of one text. Its UTF-8 bytes, its code points,
// and its grapheme clusters, the characters a reader sees.
// Bytes follow RFC 3629. Clusters follow Unicode's text segmentation (UAX #29, Unicode 17) for the
// text this page draws: a mark joins the letter before it (rules GB9 and GB9a), and a Devanagari
// consonant joins the consonant before it across a virama, with any marks between (rule GB9c).
// Its limits: letters and marks of Latin, Hebrew, Arabic, Devanagari and Han, with the joiner
// U+200D. It leaves out the rest of UAX #29: Hangul syllables, emoji sequences and flags, CR LF,
// control and format characters, prepended marks, and the conjuncts of other Indic scripts. It
// counts code points, not UTF-16 code units; every character here is in the Basic Multilingual
// Plane, where the two agree.

/** The code points of a text, in order, pairing surrogates by hand. */
export function codePoints(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i), next = text.charCodeAt(i + 1);
    if (unit >= 0xd800 && unit <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) { out.push(0x10000 + ((unit - 0xd800) << 10) + (next - 0xdc00)); i++; }
    else out.push(unit);
  }
  return out;
}

/** The bytes UTF-8 writes for one code point: one for U+0000 to U+007F, two up to U+07FF, three up to U+FFFF, four beyond. */
export function utf8(cp: number): number[] {
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) throw new RangeError(`utf8(): U+${cp.toString(16).toUpperCase()} is not a character UTF-8 can write`);
  if (cp < 0x80) return [cp];
  // A leading byte says how many bytes follow; each following byte starts 10 and carries six bits.
  const tail = (shift: number) => 0x80 | ((cp >> shift) & 0x3f);
  if (cp < 0x800) return [0xc0 | (cp >> 6), tail(0)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), tail(6), tail(0)];
  return [0xf0 | (cp >> 18), tail(12), tail(6), tail(0)];
}

/** The UTF-8 bytes of a whole text. */
export const bytes = (text: string): number[] => codePoints(text).flatMap(utf8);

const VIRAMA = 0x094d, JOINER = 0x200d;
/** A Devanagari consonant: what a virama joins to the next one. */
const consonant = (cp: number) => (cp >= 0x0915 && cp <= 0x0939) || (cp >= 0x0958 && cp <= 0x095f) || (cp >= 0x0978 && cp <= 0x097f);
const letter = (cp: number) => String.fromCodePoint(cp);
/** A mark that takes no space of its own (a vowel point, a nukta, the virama), or the joiner. */
const nonspacing = (cp: number) => cp === JOINER || /^[\p{Mn}\p{Me}]$/u.test(letter(cp));
/** Any mark: it belongs to the letter before it. */
const mark = (cp: number) => nonspacing(cp) || /^\p{Mc}$/u.test(letter(cp));

/** What a code point is to a reader: a letter, a mark on the letter before it, or the virama that joins two consonants. */
export type Kind = 'letter' | 'mark' | 'joiner';
export const kindOf = (cp: number): Kind => (cp === VIRAMA ? 'joiner' : mark(cp) ? 'mark' : 'letter');

/**
 * The grapheme clusters of a text, each as its code points. A new cluster starts at every code point
 * that is not a mark, except a Devanagari consonant that follows a consonant, a virama and nothing
 * but non-spacing marks between them: that consonant is part of a conjunct.
 */
export function clusters(text: string): number[][] {
  const out: number[][] = [];
  // Since the last consonant of the cluster: whether a virama was seen, and only non-spacing marks.
  let open = false, linked = false;
  for (const cp of codePoints(text)) {
    const joins = out.length > 0 && (mark(cp) || (consonant(cp) && open && linked));
    if (joins) out.at(-1)!.push(cp); else out.push([cp]);
    if (consonant(cp)) { open = true; linked = false; }
    else if (cp === VIRAMA) linked = open;
    else if (!nonspacing(cp)) open = false;
  }
  return out;
}

/** The three lengths of a text. */
export const lengths = (text: string) => ({ bytes: bytes(text).length, points: codePoints(text).length, characters: clusters(text).length });

/** The first `n` units of a text: UTF-8 bytes (dropping a code point cut in half), code points, or whole characters. */
export function cut(text: string, n: number, unit: 'bytes' | 'points' | 'characters'): string {
  if (unit === 'characters') return clusters(text).slice(0, n).flat().map(letter).join('');
  if (unit === 'points') return codePoints(text).slice(0, n).map(letter).join('');
  let used = 0;
  const kept: number[] = [];
  for (const cp of codePoints(text)) { used += utf8(cp).length; if (used > n) break; kept.push(cp); }
  return kept.map(letter).join('');
}

/** How a cut text ends: on whole characters of the original, on a joiner with nothing to join, or on a character cut short. */
export type Ending = 'whole' | 'joiner' | 'short';
/** The first `n` units of a text, and how that ends. */
export function cutStory(text: string, n: number, unit: 'bytes' | 'points' | 'characters'): { unit: 'bytes' | 'points' | 'characters'; n: number; text: string; ends: Ending } {
  const kept = cut(text, n, unit), was = clusters(text), now = clusters(kept);
  const whole = now.every((c, k) => c.join() === was[k]?.join());
  return { unit, n, text: kept, ends: whole ? 'whole' : codePoints(kept).at(-1) === VIRAMA ? 'joiner' : 'short' };
}

/** U+0928 for a code point, and E0 A4 A8 for its bytes. */
export const hex = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
export const byteHex = (b: number): string => b.toString(16).toUpperCase().padStart(2, '0');

/** One word the page takes apart. */
export interface Word { id: string; text: string; says: string; script: string }
export const WORDS = [
  { id: 'hello', text: 'hello', says: 'hello', script: 'English' },
  { id: 'nihao', text: '你好', says: 'nǐ hǎo', script: 'Chinese' },
  { id: 'shalom', text: 'שָׁלוֹם', says: 'shalom', script: 'Hebrew' },
  { id: 'salam', text: 'سَلَام', says: 'salām', script: 'Arabic' },
  { id: 'namaste', text: 'नमस्ते', says: 'namaste', script: 'Hindi' },
] as const satisfies readonly Word[];
export type WordId = (typeof WORDS)[number]['id'];
export const word = (id: WordId): Word => WORDS.find((w) => w.id === id)!;

/** A word taken apart: each code point with its bytes and what it is, and the code points of each character. */
export function apart(text: string) {
  const groups = clusters(text);
  let index = 0;
  return {
    text, ...lengths(text),
    /** Each code point, in order: its number, itself as text, its bytes, what it is, and the character it belongs to. */
    parts: groups.flatMap((group, cluster) => group.map((cp) => ({ index: index++, cp, hex: hex(cp), char: letter(cp), bytes: utf8(cp), kind: kindOf(cp), cluster }))),
    /** Each character a reader sees, as text. */
    read: groups.map((group) => group.map(letter).join('')),
  };
}
export type Apart = ReturnType<typeof apart>;

/** A step's model: the word in view, and how far it has been taken apart. */
export interface LengthState {
  text: string;
  bytes: number; points: number; characters: number;
  /** The view of the word the step shows: whole, as code points, with their bytes, or as the characters read. */
  view: 'whole' | 'points' | 'bytes' | 'characters';
  /** The code points shown, each with its bytes, and the cluster it belongs to. */
  shown?: { hex: string; bytes: string[]; cluster: number }[];
  /** Every word's three lengths, when the step compares them. */
  table?: { id: string; text: string; bytes: number; points: number; characters: number }[];
  /** The word cut three ways, when the step cuts it. */
  cuts?: { unit: 'bytes' | 'points' | 'characters'; n: number; text: string; ends: Ending }[];
}
