import { Text, Rectangle, Line, Group } from '../../../src/index.ts';
import type { Mobject, Box, Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { CHARS, PREDICATES, COUNTS, intOf } from './model.ts';
import { grouped } from '../lib/format.ts';
import type { NumericType, Outcome, Predicate } from './model.ts';

// Sizes are for a 390 px page, whose stage is 358 px wide: native text at 0.54 units is 12 px there,
// 43 px on a 1280 px stage. A code line takes about 1.5 × SIZE, so a panel of n lines is about 0.81 n + 0.6 tall.
// At SIZE, text reads at 12 px on a phone without a close-up. A code panel shrinks its lines to fit its box, so the two with the longest lines
// (46 and 47 characters, up to 14.9 units wide at SIZE) get the full width the stage allows, WIDE in scene.ts, and keep SIZE.
export const SIZE = 0.54;

/** The three nested sets, outermost first, as boxes on the stage. */
const SETS: readonly { p: Predicate; box: Box }[] = [
  { p: 'isnumeric', box: [-7.45, -4.15, 7.45, 2.95] },
  { p: 'isdigit', box: [-7.05, -3.75, 2.75, 2.05] },
  { p: 'isdecimal', box: [-6.65, -3.35, -0.75, 1.15] },
];

/**
 * The places for each numeric type's characters, in lineup order: decimals two by two in the inner box,
 * the one digit in the middle one, the other numerics outside it.
 */
const SPOTS: Record<string, readonly Vec[]> = {
  Decimal: [
    [-5.2, -0.45],
    [-2.3, -0.45],
    [-5.2, -2.3],
    [-2.3, -2.3],
  ],
  Digit: [[0.95, -1.4]],
  Numeric: [
    [5.1, 1.1],
    [5.1, -1.0],
    [5.1, -3.0],
  ],
};

/** The lineup step's state: the eight characters, and how many of them from the left each check accepts. */
export interface LineupState {
  /** This scenario's character, circled, and its check, whose bracket is heavier. */
  char: string;
  guard: Predicate;
  lineup: { char: string; type: NumericType; int: ReturnType<typeof intOf> }[];
  accepted: Record<Predicate, number>;
}

/**
 * The eight characters in one row, a bracket over the run from the left that each check accepts and
 * under the runs int() parses and rejects, this scenario's character circled, and ² said underneath.
 */
export function drawLineup(st: LineupState, s: Stage): Group {
  const ink = s.look.ink,
    sup = CHARS.super.char;
  const slot = (i: number) => -6.3 + i * 1.8,
    ROW = -0.8;
  /** A bracket over (up) or under (down) characters a to b, with its words at its left end. */
  const bracket = (a: number, b: number, y: number, up: boolean, words: string, color: string, heavy = false) => {
    const x0 = slot(a) - 0.78,
      x1 = slot(b) + 0.78,
      tick = up ? -0.15 : 0.15,
      stroke = { stroke: color, strokeWidth: heavy ? 0.075 : 0.03 };
    return [
      new Line([x0, y], [x1, y], stroke),
      new Line([x0, y], [x0, y + tick], stroke),
      new Line([x1, y], [x1, y + tick], stroke),
      new Text(words, { fontSize: SIZE, font: 'mono', color, weight: heavy ? 'bold' : 'normal' }).moveTo([x0 + 0.12, y + (up ? 0.37 : -0.37)], [-1, 0]),
    ];
  };
  const marks: Mobject[] = [];
  PREDICATES.forEach((k, level) => {
    marks.push(...bracket(0, st.accepted[k] - 1, 0.32 + level * 0.95, true, `${k}() → True`, k === st.guard ? s.look.emphasis : ink, k === st.guard));
  });
  // The run from the left that int() parses, and the values it returns.
  const parses = st.lineup.filter((x) => 'value' in x.int).length,
    returned = [...new Set(st.lineup.slice(0, parses).map((x) => (x.int as { value: number }).value))];
  marks.push(
    ...bracket(0, parses - 1, -1.75, false, `int() → ${returned.join(' or ')}`, s.look.good),
    ...bracket(parses, st.lineup.length - 1, -1.75, false, 'int() → ValueError', s.look.bad),
  );
  const glyphs = st.lineup.map((x, i) => new Text(x.char, { fontSize: 1.15, color: ink }).moveTo([slot(i), ROW]));
  const ring = new Rectangle({ width: 1.5, height: 1.5, cornerRadius: 0.15, stroke: s.look.emphasis, strokeWidth: 0.05, fill: 'none' }).moveTo([
    slot(st.lineup.findIndex((x) => x.char === st.char)),
    ROW,
  ]);
  return new Group(
    ...glyphs,
    ring,
    ...marks,
    new Text(`${sup}: isdigit() → True, int('${sup}') → ValueError`, { fontSize: SIZE * 1.1, font: 'mono', color: s.look.bad }).moveTo([0, -3.3]),
  );
}

/** The nested-sets step's state: the counts, what the check did, and each character's numeric type. */
export interface SetsState {
  char: string;
  guard: Predicate;
  counts: typeof COUNTS;
  outcome: Outcome;
  lineup: { char: string; type: NumericType }[];
}

/**
 * The nested sets with every character in place: the check's set drawn heavier, this scenario's
 * character circled in the colour of what happened to it.
 */
export function drawSets(st: SetsState, s: Stage): Group {
  const ink = s.look.ink;
  const mark = st.outcome === 'raised' ? s.look.bad : s.look.good;
  const mobs: Mobject[] = [];
  for (const set of SETS) {
    const [x0, y0, x1, y1] = set.box;
    const on = set.p === st.guard;
    mobs.push(
      new Rectangle({
        width: x1 - x0,
        height: y1 - y0,
        cornerRadius: 0.2,
        fill: 'none',
        stroke: ink,
        strokeWidth: on ? 0.09 : 0.03,
      }).moveTo([(x0 + x1) / 2, (y0 + y1) / 2]),
      new Text(`${set.p}(): ${grouped(st.counts[set.p])}`, {
        fontSize: SIZE,
        font: 'mono',
        color: ink,
        weight: on ? 'bold' : 'normal',
        anchor: 'start',
      }).moveTo([x0 + 0.25, y1 - 0.4], [-1, 0]),
    );
  }
  // Each character's place: the decimals two by two in the innermost box, the digit in the
  // middle one, the other numerics outside it, in lineup order within each.
  const placed = { Decimal: 0, Digit: 0, Numeric: 0 } as Record<string, number>;
  for (const { char, type } of st.lineup) {
    const at = SPOTS[type]![placed[type]!++]!;
    const mine = char === st.char;
    mobs.push(new Text(char, { fontSize: 1.1, color: mine ? mark : ink }).moveTo(at));
    if (mine)
      mobs.push(
        new Rectangle({
          width: 1.6,
          height: 1.5,
          cornerRadius: 0.15,
          fill: 'none',
          stroke: mark,
          strokeWidth: 0.06,
        }).moveTo(at),
      );
  }
  return new Group(...mobs);
}
