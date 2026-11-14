// How the float-sum explainer draws its number line: neighbouring doubles as ticks one gap apart,
// two of them named by what they print as, and the marks for a typed decimal, the double it is
// stored as, and the exact sum. Places come from the model in gaps from the first tick, and the
// line's own n2p puts them on the stage.
import { Circle, Dot, Group, Line, NumberLine, Rectangle, Text, keyed } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { cut } from './model.ts';

/** The size of the words on the picture, and of digits set in the code face. */
export const SIZE = 0.56, DIGITS = 0.64;
/** The line's length and place on the stage: its three ticks are six units apart. */
export const LENGTH = 12, LINE_X = 1, LINE_Y = 0.1;
/** How many digits after the point a long decimal shows before its ellipsis. */
export const PLACES = 22;

const text = (s: Stage, value: string, { size = SIZE, soft = false, mono = false, bold = false } = {}) =>
  new Text(value, { fontSize: size, color: soft ? s.look.soft : s.look.ink, ...(mono ? { font: 'mono' as const } : {}), ...(bold ? { weight: 'bold' as const } : {}), shaping: s.scene.textShaping });

/** A line of words or digits whose left edge is at `at`. */
export const startAt = (s: Stage, value: string, at: Vec, options: { size?: number; soft?: boolean; mono?: boolean; bold?: boolean } = {}) =>
  text(s, value, options).moveTo(at, [-1, 0]);
/** A line of words or digits centred at `at`. */
export const centred = (s: Stage, value: string, at: Vec, options: { size?: number; soft?: boolean; mono?: boolean; bold?: boolean } = {}) =>
  text(s, value, options).moveTo(at);

/** A long decimal, cut to the page's number of places, in the code face. */
export const digitsAt = (s: Stage, digits: string, at: Vec, size = DIGITS) => startAt(s, cut(digits, PLACES), at, { size, mono: true });

/**
 * The doubles as ticks on a number line, numbered in gaps from the first. `prints` are what each
 * double prints as; the first two are named under the line, on rows of their own so that a long
 * name and a short one never run together, the second with a leader from its tick. Keyed `line`,
 * each tall tick `tick:<i>` and each name `name:<i>`.
 */
export function drawLine(s: Stage, prints: readonly string[]) {
  const line = new NumberLine({ range: [0, prints.length - 1, 1], length: LENGTH, stroke: s.look.ink, strokeWidth: 0.05 }).shift([LINE_X, LINE_Y]);
  const marks = prints.map((_, i) => keyed(new Line([line.n2p(i)[0], LINE_Y - 0.26], [line.n2p(i)[0], LINE_Y + 0.26], { stroke: s.look.ink, strokeWidth: 0.07 }), `tick:${i}`));
  const [x0, x1] = [line.n2p(0)[0], line.n2p(1)[0]];
  const first = keyed(text(s, prints[0]!, { mono: true }), 'name:0'), second = keyed(centred(s, prints[1]!, [x1, LINE_Y - 1.62], { mono: true }), 'name:1');
  // A short name sits under its tick; a long one starts a little left of it, so it stays on the stage.
  first.moveTo([Math.max(x0, -7.3 + first.width() / 2), LINE_Y - 0.78]);
  const leader = keyed(new Line([x1, LINE_Y - 0.34], [x1, LINE_Y - 1.26], { stroke: s.look.soft, strokeWidth: 0.03 }), 'name:1:leader');
  const legend = keyed(centred(s, 'Under a tick: what that double prints as', [0, LINE_Y - 2.45], { soft: true }), 'name:legend');
  return { line: keyed(line, 'line'), marks: new Group(...marks), labels: new Group(first, leader, second, legend) };
}

/** The ring for a decimal exactly as typed, the dot for the double it is stored as, and the square for an exact sum. */
export const ring = (s: Stage, at: Vec) => new Circle({ radius: 0.15, stroke: s.look.emphasis, strokeWidth: 0.05, fill: 'none' }).moveTo(at);
export const stored = (s: Stage, at: Vec) => new Dot({ radius: 0.13, color: s.look.emphasis }).moveTo(at);
export const square = (s: Stage, at: Vec) => new Rectangle({ width: 0.34, height: 0.34, stroke: s.look.ink, strokeWidth: 0.05, fill: 'none' }).moveTo(at);

/** Words above a mark, with a leader down to it. `side` says which way the words run from the mark. */
export function flag(s: Stage, words: string, mark: Mobject, side: 'left' | 'right', y = 1.75): Group {
  const [x, top] = [mark.center()[0], mark.box()![3]];
  const label = text(s, words).moveTo([x + (side === 'left' ? 0.12 : -0.12), y], [side === 'left' ? 1 : -1, 0]);
  return new Group(new Line([x, y - 0.4], [x, top + 0.08], { stroke: s.look.soft, strokeWidth: 0.03 }), label);
}
