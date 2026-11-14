// How the unified-diff explainer draws a file: its lines in the code face with their numbers in a
// gutter, and boxes over runs of lines. Lines are the engine's Code, so the patch's own hunks can
// move them (TransformDiff), and every row is placed from one top line and one pitch, so a row's
// number, a brace and a hunk laid beside the file stay level with the line they belong to.
import { Code, Group, Text, keyed } from '../../../src/index.ts';
import type { Box, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';

/** The size of every word and line, and the distance from one line of a file to the next. */
export const SIZE = 0.56, PITCH = SIZE * 1.3;
/** The width of one character of the code face at that size. */
export const CHAR = SIZE * 0.6;

/** The y of row `i` (from 0) of a block whose first row is at `top`. */
export const rowY = (top: number, i: number): number => top - i * PITCH;

/** Lines of code whose first line starts at `at` (its left edge, its middle height). */
export function codeAt(s: Stage, lines: readonly string[], at: Vec, color = s.look.ink): Code {
  const code = new Code(lines, { fontSize: SIZE, lineHeight: PITCH / SIZE, color, shaping: s.scene.textShaping });
  const [x, y] = code.lines[0]!.anchorPoint();
  return code.shift([at[0] - x, at[1] - y]);
}

/** A file: its lines from `at`, and their numbers in a gutter to the left. Keyed `key`, each number `key:n<line>`. */
export function fileAt(s: Stage, lines: readonly string[], at: Vec, key: string) {
  const code = keyed(codeAt(s, lines, at), key);
  const numbers = lines.map((_, i) => numberAt(s, i + 1, at, key));
  return { code, numbers };
}
/** The number of line `n` (from 1) of the file at `at`. */
export const numberAt = (s: Stage, n: number, at: Vec, key: string): Text =>
  keyed(new Text(String(n), { fontSize: SIZE, font: 'mono', color: s.look.soft, shaping: s.scene.textShaping }).moveTo([at[0] - 0.42, rowY(at[1], n - 1)], [1, 0]), `${key}:n${n}`);

/** The box of lines `from` to `to` (from 1, both included) of a file at `at`, `width` characters wide, gutter included or not. */
export function linesBox(at: Vec, from: number, to: number, width: number, { gutter = false, pad = 0.1 } = {}): Box {
  const left = gutter ? at[0] - 0.42 - 2 * CHAR : at[0];
  return [left - pad, rowY(at[1], to - 1) - PITCH / 2 + 0.04, at[0] + width * CHAR + pad, rowY(at[1], from - 1) + PITCH / 2 - 0.04];
}

/** A line of words whose left edge is at `at`. */
export const wordsAt = (s: Stage, value: string, at: Vec, { soft = false, mono = false, bold = false, color }: { soft?: boolean; mono?: boolean; bold?: boolean; color?: string } = {}): Text =>
  new Text(value, { fontSize: SIZE, color: color ?? (soft ? s.look.soft : s.look.ink), ...(mono ? { font: 'mono' as const } : {}), ...(bold ? { weight: 'bold' as const } : {}), shaping: s.scene.textShaping }).moveTo(at, [-1, 0]);

/** Lines of words, one under another, the first at `at`. */
export const stack = (s: Stage, values: readonly string[], at: Vec, options: { soft?: boolean; mono?: boolean; bold?: boolean; color?: string } = {}): Group =>
  new Group(...values.map((v, i) => wordsAt(s, v, [at[0], rowY(at[1], i)], options)));
