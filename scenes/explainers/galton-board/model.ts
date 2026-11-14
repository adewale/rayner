// The galton-board explainer's model: a ball falls through rows of pegs, going left or right at each,
// and lands in the bin numbered by how many times it went right. Everything is counted from the
// routes themselves, listed one by one; no formula for a binomial coefficient is used here, so the
// counts can be held to one (model.test.ts compares them with Python's math.comb).
// Its limits: every peg sends the ball left or right and nothing else; at a fair peg the two are
// equally likely and each peg is independent of the others. A real board's balls collide, spin and
// carry momentum from peg to peg, which this model leaves out. The bell curve here is the normal
// curve with the pile's own mean and spread, an approximation of the counts and not their cause.

export type Turn = 'L' | 'R';

/** Every route through `rows` rows of pegs: each a list of turns, in counting order (all left first). */
export function routes(rows: number): Turn[][] {
  if (!Number.isInteger(rows) || rows < 0 || rows > 16) throw new RangeError('routes(): rows must be a whole number from 0 to 16');
  let out: Turn[][] = [[]];
  for (let r = 0; r < rows; r++) out = out.flatMap((route) => [[...route, 'L' as const], [...route, 'R' as const]]);
  return out;
}

/** The bin a route ends in: how many times it went right. */
export const binOf = (route: readonly Turn[]): number => route.filter((t) => t === 'R').length;

/** How many routes end in each bin, bin 0 first: one ball down every route piles up like this. */
export function pile(rows: number): number[] {
  const counts = Array<number>(rows + 1).fill(0);
  for (const route of routes(rows)) counts[binOf(route)]!++;
  return counts;
}

/** The routes that end in `bin`. */
export const routesTo = (rows: number, bin: number): Turn[][] => routes(rows).filter((route) => binOf(route) === bin);

/** The pile after the first `dropped` routes, in counting order: what the board holds part-way through. */
export function pileAfter(rows: number, dropped: number): number[] {
  const counts = Array<number>(rows + 1).fill(0);
  for (const route of routes(rows).slice(0, dropped)) counts[binOf(route)]!++;
  return counts;
}

/** The share of routes that end in bins `lo` to `hi`, both included. */
export function share(rows: number, lo: number, hi: number): number {
  const counts = pile(rows);
  return counts.slice(lo, hi + 1).reduce((a, b) => a + b, 0) / 2 ** rows;
}

/**
 * The chance a ball ends in `bin` when each peg sends it right with chance `right`: the sum, over
 * the routes to that bin, of each route's own chance. At a fair peg every route is equally likely,
 * and this is the bin's share of the routes.
 */
export function chance(rows: number, bin: number, right = 0.5): number {
  if (!(right >= 0 && right <= 1)) throw new RangeError('chance(): right must be a chance from 0 to 1');
  return routesTo(rows, bin).reduce((sum, route) => sum + route.reduce((p, t) => p * (t === 'R' ? right : 1 - right), 1), 0);
}

/** The pile's mean bin and its standard deviation, at fair pegs: rows / 2 and √rows / 2. */
export const spread = (rows: number): { mean: number; sd: number } => ({ mean: rows / 2, sd: Math.sqrt(rows) / 2 });

/** The normal curve with the pile's mean and spread, at bin position x: a density, so its whole area is 1. */
export function bell(rows: number, x: number): number {
  const { mean, sd } = spread(rows), z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

/** The area under that curve from `from` to `to`, by Simpson's rule on 2,000 slices. */
export function bellArea(rows: number, from: number, to: number): number {
  const n = 2000, h = (to - from) / n;
  let sum = bell(rows, from) + bell(rows, to);
  for (let i = 1; i < n; i++) sum += bell(rows, from + i * h) * (i % 2 ? 4 : 2);
  return (sum * h) / 3;
}

/** The bins within one standard deviation of the middle: the first and last whose centre is that close. */
export function within(rows: number): { lo: number; hi: number } {
  const { mean, sd } = spread(rows);
  return { lo: Math.ceil(mean - sd), hi: Math.floor(mean + sd) };
}

/** The board the explainer shows. */
export const ROWS = 6;
/** The first ball's route: right, left, right, right, left, left. It ends in bin 3. */
export const FIRST: readonly Turn[] = ['R', 'L', 'R', 'R', 'L', 'L'];

/** What the explainer's board says, from the functions above. */
export function boardStory(rows = ROWS) {
  const counts = pile(rows), total = 2 ** rows, { lo, hi } = within(rows), { mean, sd } = spread(rows);
  const most = counts.indexOf(Math.max(...counts));
  return {
    rows, total, counts, most, mean, sd, lo, hi,
    /** Balls in the bins within one standard deviation, and their share of all. */
    middle: counts.slice(lo, hi + 1).reduce((a, b) => a + b, 0),
    exact: share(rows, lo, hi),
    /** The bell curve's area over the same bins, edge to edge. */
    curve: bellArea(rows, lo - 0.5, hi + 0.5),
    /** The area the curve puts beyond the last bin's outer edge, on one side: bins the board does not have. */
    beyond: bellArea(rows, rows + 0.5, rows + 0.5 + 12 * sd),
    /** The curve's area over an edge bin, against the one route that reaches it. */
    edgeCurve: bellArea(rows, -0.5, 0.5),
    edgeExact: counts[0]! / total,
  };
}
export type BoardStory = ReturnType<typeof boardStory>;

/** A step's model: the board, the balls dropped so far and where they lie, and the route in view. */
export interface BoardState {
  rows: number;
  dropped: number;
  counts: number[];
  /** The route the step follows or the routes it lists, each as its turns. */
  routes: Turn[][];
  /** The bins the step marks, and their share by counting and under the curve, when it compares them. */
  span?: { lo: number; hi: number; middle: number; exact: number; curve: number };
  /** The curve's area beyond the last bin, and over an edge bin, when the step shows the curve's error. */
  tails?: { beyond: number; edgeCurve: number; edgeExact: number };
}
