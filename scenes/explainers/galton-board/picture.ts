// How the galton-board explainer draws its board: pegs in a triangle, a bin under each gap, the
// arcs a ball hops along, and the chart the pile makes. Everything is placed from the model's rows
// and turns, so a route drawn here is a route the model lists.
import { ArcBetweenPoints, Axes, Dot, Group, Line, Text, VMobject, keyed } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { bell } from './model.ts';
import type { Turn } from './model.ts';

/** Bins are one unit apart; the board's centre line, its first peg, the gap between rows and the bins' floor. */
export const W = 1, CX = -3.7, TOP = 2.35, DY = 0.42, FLOOR = -2.45;
/** The chart's height in balls and in units: the tallest bin and the bell curve's peak both fit. */
export const TALLEST = 22, CHART_H = 2.64;
const PEG = 0.07, BALL = 0.12;
/** The size of every word on the picture: it reads 12 px on a phone's whole picture. */
export const SIZE = 0.56;

/** Where peg `j` of row `row` is (row 0 is the single top peg). */
export const pegAt = (row: number, j: number): Vec => [CX + (j - row / 2) * W, TOP - row * DY];
/** The centre line of bin `bin` on a board of `rows` rows. */
export const binX = (rows: number, bin: number): number => CX + (bin - rows / 2) * W;
/** Where a ball rests on a peg: just above it. */
const onPeg = (row: number, j: number): Vec => { const [x, y] = pegAt(row, j); return [x, y + PEG + BALL]; };
/** Where balls start: above the top peg. */
export const START: Vec = [CX, TOP + 0.62];
/** Where a ball comes to rest in a bin. */
export const restAt = (rows: number, bin: number): Vec => [binX(rows, bin), FLOOR + BALL + 0.03];

/**
 * A route as the hops a ball makes: a fall onto the top peg, an arc from peg to peg for each turn
 * (the last arc carries it over its bin), then a fall to the bin's floor. Each arc bulges upward,
 * away from the peg it leaves.
 */
export function hops(route: readonly Turn[], style: { stroke?: string; strokeWidth?: number; opacity?: number } = {}): VMobject[] {
  const rows = route.length, paint = { fill: 'none', ...style };
  const out: VMobject[] = [new Line(START, onPeg(0, 0), paint)];
  let j = 0;
  route.forEach((turn, row) => {
    const from = onPeg(row, j);
    if (turn === 'R') j++;
    // After the last row the ball is over its bin, a row's height lower.
    const to: Vec = row === rows - 1 ? [binX(rows, j), TOP - rows * DY + PEG + BALL] : onPeg(row + 1, j);
    out.push(new ArcBetweenPoints(from, to, { angle: turn === 'L' ? 1.9 : -1.9, ...paint }));
  });
  out.push(new Line([binX(rows, j), TOP - rows * DY + PEG + BALL], restAt(rows, j), paint));
  return out;
}

/** The same route as one path, for a token to travel in one move. */
export function routePath(route: readonly Turn[], style: { stroke?: string; strokeWidth?: number; opacity?: number } = {}): VMobject {
  const path = new VMobject({ fill: 'none', ...style });
  hops(route).forEach((hop, i) => {
    const p = hop.pointArrays()[0]!;
    if (i === 0) path.startNewPath([p[0]!, p[1]!]);
    for (let k = 2; k < p.length; k += 6) path.addCubic([p[k]!, p[k + 1]!], [p[k + 2]!, p[k + 3]!], [p[k + 4]!, p[k + 5]!]);
  });
  return path;
}

/** A ball. */
export const ball = (s: Stage, at: Vec = START, opacity = 1) => new Dot({ radius: BALL, color: s.look.emphasis, opacity }).moveTo(at);

/** The pegs, the walls between the bins and the floor. Keyed `board`, each peg `peg:row:j`. */
export function drawBoard(s: Stage, rows: number): Group {
  const g = new Group();
  for (let row = 0; row < rows; row++)
    for (let j = 0; j <= row; j++) g.add(keyed(new Dot({ radius: PEG, color: s.look.ink }).moveTo(pegAt(row, j)), `peg:${row}:${j}`));
  const wallTop = TOP - rows * DY - 0.1;
  for (let k = 0; k <= rows + 1; k++) {
    const x = binX(rows, k) - W / 2;
    g.add(keyed(new Line([x, wallTop], [x, FLOOR], { stroke: s.look.muted, strokeWidth: 0.03 }), `wall:${k}`));
  }
  g.add(keyed(new Line([binX(rows, 0) - W / 2, FLOOR], [binX(rows, rows) + W / 2, FLOOR], { stroke: s.look.ink, strokeWidth: 0.05 }), 'floor'));
  return keyed(g, 'board');
}

/** Every hop a ball could make: from each peg, an arc to the left and one to the right. Keyed `lattice`. */
export function drawLattice(s: Stage, rows: number): Group {
  const g = new Group(), paint = { stroke: s.look.soft, strokeWidth: 0.025, opacity: 0.55 };
  const seen = new Set<string>();
  const add = (route: Turn[]) => {
    const all = hops(route, paint);
    all.slice(1, -1).forEach((arc, row) => {
      const j = route.slice(0, row).filter((t) => t === 'R').length, id = `${row}:${j}:${route[row]}`;
      if (!seen.has(id)) { seen.add(id); g.add(keyed(arc, `hop:${id}`)); }
    });
  };
  // Two routes per peg reach both of its hops: walk every route once.
  const walk = (route: Turn[]) => { if (route.length === rows) add(route); else { walk([...route, 'L']); walk([...route, 'R']); } };
  walk([]);
  return keyed(g, 'lattice');
}

/**
 * The chart the bins make: bin positions across, balls up, its floor the board's floor. The board's
 * walls and floor are the chart's frame, so the axes only place the bars and the curve and are not drawn.
 */
export function binAxes(s: Stage, rows: number): Axes {
  const axes = new Axes({
    xRange: [-0.5, rows + 0.5, 1], yRange: [0, TALLEST, TALLEST], width: (rows + 1) * W, height: CHART_H, shaping: s.scene.textShaping,
  });
  const origin = axes.c2p(0, 0);
  axes.shift([binX(rows, 0) - origin[0], FLOOR - origin[1]]);
  return axes;
}

/** The pile as bars, one per bin, each keyed `bar:<bin>`. */
export function drawPile(s: Stage, axes: Axes, counts: readonly number[]): Group {
  const bars = axes.bar(counts, { x: counts.map((_, k) => k), width: 0.8, colors: s.look.emphasis, fillOpacity: 0.85 });
  bars.children.forEach((bar, k) => keyed(bar, `bar:${k}`));
  return keyed(bars, 'pile');
}

/** How many balls each bin holds, under its floor. Keyed `count:<bin>`. */
export function drawCounts(s: Stage, rows: number, counts: readonly number[]): Group {
  return keyed(new Group(...counts.map((n, k) =>
    keyed(new Text(String(n), { fontSize: SIZE, color: s.look.ink, shaping: s.scene.textShaping }).moveTo([binX(rows, k), FLOOR - 0.42]), `count:${k}`))), 'counts');
}

/** The bell curve with the pile's mean and spread, scaled to `total` balls, and its area over bins `lo` to `hi`. */
export function drawBell(s: Stage, axes: Axes, rows: number, total: number, lo: number, hi: number) {
  const height = (x: number) => total * bell(rows, x);
  return {
    curve: keyed(axes.plot(height, { xRange: [-0.5, rows + 0.5], samples: 97, color: s.look.ink, strokeWidth: 0.05 }), 'bell:curve'),
    area: keyed(axes.areaUnder(height, [lo - 0.5, hi + 0.5], { color: s.look.ink, fillOpacity: 0.22 }), 'bell:area'),
  };
}

/** Lines of words in the column beside the board, top line first. */
export interface SideLine { text: string; size?: number; soft?: boolean; bold?: boolean; mono?: boolean; gap?: number }
export const SIDE_X = 0.75;
export function sideWords(s: Stage, lines: readonly SideLine[], top = 2.3): Text[] {
  let y = top;
  return lines.map(({ text, size = SIZE, soft, bold, mono, gap = 0.3 }) => {
    const t = new Text(text, { fontSize: size, color: soft ? s.look.soft : s.look.ink, ...(bold ? { weight: 'bold' as const } : {}), ...(mono ? { font: 'mono' as const } : {}), shaping: s.scene.textShaping });
    t.moveTo([SIDE_X, y - size / 2], [-1, 0]);
    y -= size + gap;
    return t;
  });
}
