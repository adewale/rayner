import { Group, Rectangle, Text, Line } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { label, keyed } from '../../../explain/drawing.ts';
import type { Host, threeDoorCells } from './model.ts';

// How the Monty Hall explainer draws its strip of rounds: each cell as wide as its chance, so the
// widths, not a count of drawn cells, carry the odds (a forced goat and a coin-flip goat are not
// equal weight). The morph between hosts keeps staying's sixth and splits the informed host's
// switching third into a goat-opening sixth and a car-opening sixth.

export const door = (i: number) => 'ABC'[i]!;
export type Cell = ReturnType<typeof threeDoorCells>[number];

// The strip: every round for the first pick, side by side, each as wide as its chance.
// Nearly the stage's width; every word on a strip step is F, so a phone's opening close-up
// still holds a whole strip with its labels at 12 px.
export const X0 = -6.5,
  X1 = 6.5,
  H = 2.05,
  SIX = (X1 - X0) / 6,
  F = 0.6;
/** Strip centres: the host in play on top (rounds, odds), the second host under it (worlds). */
export const SLOT: Record<Host, number> = { informed: 0.5, random: -2.475 };
/** A strip's name and readout sit this far above its centre; the column heads sit over the top strip. */
export const NAME = H / 2 + 0.45,
  HEADS = 2.78;
/** The rounds step has the strip alone, so its picture is lowered to the middle of the stage. */
export const ALONE = -1.45;

export const left = (text: string, x: number, y: number, color: string, size: number, key: string) =>
  keyed(new Text(text, { fontSize: size, color }).moveTo([x, y], [-1, 0]), key);

/** What a round's cell says: the door he opens, what it shows, and which choice wins. */
export const cellWords = (c: Cell) => [c.opened, c.shows, c.stay === 'ends' ? 'over' : c.stay === 'win' ? 'stay' : 'switch'];

/**
 * One host's strip of rounds at height y, keyed `strip:<as>`; `dim` greys the rounds the reader has ruled out.
 * Switching wins are tinted, rounds that show the car are drawn in the warning colour.
 */
export function strip(s: Stage, cells: readonly Cell[], y: number, as: string, dim?: (c: Cell) => boolean): Group {
  let x = X0;
  const parts = cells.map((c) => {
    const w = c.sixths * SIX,
      cx = x + w / 2,
      off = dim?.(c) ?? false,
      car = c.shows === 'car',
      win = c.swap === 'win';
    x += w;
    const color = off ? s.look.soft : car ? s.look.bad : win ? s.look.emphasis : s.look.ink;
    const [opens, shows, wins] = cellWords(c);
    return keyed(
      new Group(
        new Rectangle({
          width: w,
          height: H,
          fill: off ? s.look.paper : car ? s.look.bad : win ? s.look.emphasis : s.look.paper,
          fillOpacity: off ? 1 : car || win ? 0.14 : 1,
          stroke: off ? s.look.soft : s.look.ink,
          // Once some rounds are ruled out, the ones left are outlined heavier.
          strokeWidth: off ? 0.02 : dim ? 0.06 : 0.03,
        }).moveTo([cx, y]),
        new Text(opens!, { fontSize: F, color }).moveTo([cx, y + 0.65]),
        new Text(shows!, { fontSize: F, color }).moveTo([cx, y]),
        new Text(wins!, { fontSize: F, color, weight: off ? 'normal' : 'bold' }).moveTo([cx, y - 0.65]),
      ),
      `${as}:${c.prize}${c.opened}`,
    );
  });
  return keyed(new Group(...parts), `strip:${as}`);
}
/** The car's three places, a third of the strip each: each head centred over its third, a rule under it spanning the third. */
export const heads = (s: Stage, y: number) =>
  keyed(
    new Group(
      ...[0, 1, 2].flatMap((i) => {
        const a = X0 + i * 2 * SIX + 0.12,
          b = a + 2 * SIX - 0.24,
          r = y - 0.36;
        return [
          label(s, `Car behind ${door(i)}`, { at: [(a + b) / 2, y], color: s.look.soft, size: F }),
          new Line([a, r], [b, r], { stroke: s.look.soft, strokeWidth: 0.025 }),
          new Line([a, r], [a, r + 0.14], { stroke: s.look.soft, strokeWidth: 0.025 }),
          new Line([b, r], [b, r + 0.14], { stroke: s.look.soft, strokeWidth: 0.025 }),
        ];
      }),
    ),
    'monty-heads',
  );
