// How the string-length explainer draws a word taken apart: a cell for each code point, its number
// and what it is under it, its bytes in boxes under those, and the same cells drawn close together
// where they make one character. A cell is a shape with its glyph centred on it (the engine's
// Labeled), keyed by the code point's place in the word, so the cells that regroup are the same cells.
import { Group, Labeled, Rectangle, Text, keyed } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { box } from '../../../explain/kit.ts';
import { byteHex } from './model.ts';
import type { Apart } from './model.ts';

/** The size of every word on the picture, of a glyph in its cell, and of a cell. */
export const SIZE = 0.56, GLYPH = 1, CELL = 1.5;
/**
 * A lone mark is drawn on a dotted ring, as type specimens show one. The shaper puts the ring under a
 * lone Devanagari mark itself; for a Hebrew or Arabic mark the ring (U+25CC) is written before it.
 */
const DOTTED = String.fromCodePoint(0x25cc);
const ringed = (cp: number) => cp >= 0x0900 && cp <= 0x097f;

/** Words centred at `at`. */
export const words = (s: Stage, value: string, at: Vec, { size = SIZE, soft = false, mono = false, bold = false } = {}): Text =>
  new Text(value, { fontSize: size, color: soft ? s.look.soft : s.look.ink, ...(mono ? { font: 'mono' as const } : {}), ...(bold ? { weight: 'bold' as const } : {}), shaping: s.scene.textShaping }).moveTo(at);

/** One cell: a rounded square with `shown` centred on it. */
export function cell(s: Stage, shown: string, at: Vec, key: string, width = CELL): Labeled<Rectangle, Text> {
  const shape = new Rectangle({ width, height: CELL, cornerRadius: 0.14, fill: s.look.raised, fillOpacity: 1, stroke: s.look.rule, strokeWidth: 0.04 });
  const glyph = new Text(shown, { fontSize: GLYPH, color: s.look.ink, shaping: s.scene.textShaping });
  return keyed(new Labeled(shape, glyph).moveTo(at), key);
}

/** What a lone code point is drawn as: itself, or on a dotted ring when it is a mark. */
export const alone = (part: Apart['parts'][number]): string => (part.kind === 'letter' || ringed(part.cp) ? part.char : DOTTED + part.char);

/** Where each code point's cell stands when the cells are evenly spaced, `pitch` apart, about x = 0. `rtl` runs them from the right. */
export function spread(count: number, pitch: number, rtl = false): number[] {
  return Array.from({ length: count }, (_, i) => (rtl ? -1 : 1) * (i - (count - 1) / 2) * pitch);
}

/**
 * Where each code point's cell stands when the cells of one character touch and characters stand
 * `gap` apart, about x = 0: the same cells, regrouped.
 */
export function grouped(word: Apart, gap: number): number[] {
  const xs: number[] = [];
  let x = 0;
  word.parts.forEach((part, i) => {
    if (i && part.cluster !== word.parts[i - 1]!.cluster) x += gap;
    xs.push(x + CELL / 2);
    x += CELL;
  });
  return xs.map((v) => v - x / 2);
}

/** The cells of a word's code points at the given x places, on the line y. Keyed `<key>:<index>`. */
export function cells(s: Stage, word: Apart, xs: readonly number[], y: number, key: string): Group {
  return new Group(...word.parts.map((part, i) => cell(s, alone(part), [xs[i]!, y], `${key}:${i}`)));
}

/** Under each cell: the code point's number, and what it is. Keyed `<key>:hex:<index>` and `<key>:kind:<index>`. */
export function names(s: Stage, word: Apart, xs: readonly number[], y: number, key: string): Group {
  return new Group(...word.parts.flatMap((part, i) => [
    keyed(words(s, part.hex, [xs[i]!, y], { mono: true }), `${key}:hex:${i}`),
    keyed(words(s, part.kind, [xs[i]!, y - 0.66], { soft: true }), `${key}:kind:${i}`),
  ]));
}

/** The distance from one byte box to the next below it. */
export const BYTE_PITCH = 0.9;
/**
 * Under each cell: its UTF-8 bytes, first byte on top, one box each; the bytes of the code point at
 * `lit` are in use. Keyed `<key>:byte:<index>:<k>`.
 */
export function byteBoxes(s: Stage, word: Apart, xs: readonly number[], y: number, key: string, lit: number): Group {
  const g = new Group();
  word.parts.forEach((part, i) => part.bytes.forEach((b, k) => {
    g.add(...box(s, byteHex(b), { at: [xs[i]!, y - k * BYTE_PITCH], key: `${key}:byte:${i}:${k}`, width: 1.2, mono: true, active: i === lit }));
  }));
  return g;
}
