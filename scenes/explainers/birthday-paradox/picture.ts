import { Group, Rectangle } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { label, tile, stat } from '../../../explain/drawing.ts';
import { percent } from '../lib/format.ts';

const pct2 = (p: number) => percent(p, { digits: 2 });

/** The room as date cards, one per sampled day; the cards whose day is in `lit` are outlined. */
export function room(s: Stage, days: readonly number[], dates: readonly string[], lit: readonly number[], footer: string): Group {
  // A phone opening shows about 13.8 units across, so the widest row stays inside that.
  const big = days.length > 30,
    cols = 5,
    dx = 2.6,
    dy = big ? 0.8 : 1.05;
  const cards = new Group(
    ...days.map((day, i) =>
      tile(dates[i]!, ((i % cols) - (cols - 1) / 2) * dx, 2.5 - Math.floor(i / cols) * dy, dx - 0.15, big ? 0.74 : 0.8, s, {
        active: lit.includes(day),
        size: big ? 0.6 : 0.64,
        key: `person-${i}`,
      }),
    ),
  );
  cards.key = 'birthday-people';
  return new Group(cards, label(footer, 0, big ? -3.85 : -3.6, s.palette.ink, 0.62, 'birthday-footer'));
}

/**
 * Every pair as one square of a triangle: row k is the (k + 1)th card, with one square for each card before it,
 * so a newcomer adds a row as long as the room already is. With `you`, only the first column: the first card's pairs.
 * `count` is the comparisons (with `you`) or pairs shown, `chance` their chance of a match, and `matched` the pairs
 * of cards, by index, whose dates are the same.
 */
export function pairGrid(
  s: Stage,
  { you, people: n, count, chance, matched: matchedPairs, footer }:
    { you: boolean; people: number; count: number; chance: number; matched: readonly (readonly number[])[]; footer: string },
): Group {
  const cell = Math.min(0.32, 5.3 / (n - 1)),
    x0 = -((n - 1) * cell) / 2,
    y0 = 2.25;
  const at = (row: number, col: number): [number, number] => [x0 + (col + 0.5) * cell, y0 - (row - 0.5) * cell];
  const square = (row: number, col: number, fill: string, opacity: number, size = 0.82) =>
    new Rectangle({ width: cell * size, height: cell * size, fill, fillOpacity: opacity, stroke: 'none' }).moveTo(at(row, col));
  const squares = new Group();
  for (let row = 1; row < n; row++) for (let col = 0; col < (you ? 1 : row); col++) squares.add(square(row, col, s.emphasis, 0.55));
  squares.key = you ? 'birthday-you-lines' : 'birthday-pair-lines';
  // With `you`, the rest of the room's pairs, faint: the column is one part of the triangle the next step fills.
  const rest = new Group();
  if (you) for (let row = 2; row < n; row++) for (let col = 1; col < row; col++) rest.add(square(row, col, s.soft, 0.18));
  rest.key = 'birthday-other-pairs';
  // The pairs whose sampled birthdays are the same date, in red.
  const matched = new Group(...matchedPairs.map(([i, j]) => square(j!, i!, s.bad, 1, 1.3)));
  matched.key = 'birthday-matched-pairs';
  const g = new Group(rest, squares, matched);
  g.add(
    label(you ? 'You: card 1' : 'card 1', x0, y0 + 0.28, you ? s.bad : s.soft, 0.42, 'birthday-you').moveTo([x0, y0 + 0.28], [-1, 0]),
    label('card 2', x0 - 0.15, at(1, 0)[1], s.soft, 0.42).moveTo([x0 - 0.15, at(1, 0)[1]], [1, 0]),
    label(`card ${n}`, x0 - 0.15, at(n - 1, 0)[1], s.soft, 0.42).moveTo([x0 - 0.15, at(n - 1, 0)[1]], [1, 0]),
    you ? stat(s, 'Comparisons', count, -4.9, 0.2, 'birthday-comparisons') : stat(s, 'Pairs', count, -4.9, 0.2, 'birthday-pairs'),
    stat(s, 'Chance', percent(chance), 4.9, 0.2, 'birthday-chance'),
    label(footer, 0, -3.75, s.palette.ink, 0.58, 'birthday-footer'),
  );
  return g;
}

/** The 365 days of the year as a grid of 20 a row: the dates already taken in red, the free ones pale. */
export function drawDays(s: Stage, people: number, occupied: number, allowed: number): Group {
  const grid = new Group(
    ...Array.from({ length: 365 }, (_, i) =>
      new Rectangle({
        width: 0.55,
        height: 0.16,
        fill: i < occupied ? s.bad : s.emphasis,
        fillOpacity: i < occupied ? 1 : 0.35,
        stroke: 'none',
      }).moveTo([((i % 20) - 9.5) * 0.68, 2.6 - Math.floor(i / 20) * 0.31]),
    ),
    label(`Person ${people}: ${occupied} dates taken, ${allowed} free`, 0, -3.75, s.palette.ink, 0.66),
  );
  grid.key = 'birthday-days';
  return grid;
}

/** The pair shortcut's arithmetic, with the shortcut and the exact chance side by side. */
export function drawEstimate(s: Stage, pairs: number, shortcut: number, chance: number): Group {
  return new Group(
    label('One pair shares a birthday: 1 in 365', 0, 2.2, s.palette.ink, 0.66),
    label(`All ${pairs} pairs miss: 364/365, ${pairs} times over`, 0, 1.2, s.palette.ink, 0.66),
    label(`= ${pct2(1 - shortcut)} chance of no match`, 0, 0.35, s.palette.ink, 0.66),
    stat(s, 'Pair shortcut', pct2(shortcut), -3.6, -1.7, 'birthday-shortcut'),
    stat(s, 'Exact', pct2(chance), 3.6, -1.7, 'birthday-exact'),
    label('The gap: pairs that share a person', 0, -3.6, s.soft, 0.62, 'birthday-footer'),
  );
}
