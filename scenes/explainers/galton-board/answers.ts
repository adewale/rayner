// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { percent } from '../lib/format.ts';
import { binOf, chance, pile, routesTo } from './model.ts';
import type { Turn } from './model.ts';

/** The four-row board: its pile, and the routes to its middle and its left edge. */
export const SMALL = { counts: pile(4), total: 2 ** 4 };
/** The second question's route, its bin, and the other routes that end there. */
export const ASKED: Turn[] = ['L', 'R', 'R', 'L', 'R', 'L'];
export const OTHERS = routesTo(ASKED.length, binOf(ASKED)).length - 1;
/** Every bin's chance on six rows when each peg sends the ball right three times in four. */
export const BENT = Array.from({ length: 7 }, (_, bin) => chance(6, bin, 0.75));
const most = BENT.indexOf(Math.max(...BENT));
const pct = (x: number) => percent(x, { digits: 1 });

export const questions = {
  1: () => `${SMALL.counts[2]} of the ${SMALL.total}. A route to the middle bin turns right at two of the four pegs, and there are ${SMALL.counts[2]} ways to choose which two; only ${SMALL.counts[0]} route, all lefts, reaches the left edge.`,
  2: () => `${binOf(ASKED) === ASKED.length / 2 ? 'The middle bin' : `Bin ${binOf(ASKED)}`}: it turned right ${binOf(ASKED)} times, and a bin is the number of rights. ${OTHERS} other routes end there, each with the same three rights in another order.`,
  3: () => `${most === 3 ? 'Yes' : 'No'}. The number of routes to each bin is unchanged, ${pile(6)[3]} to the middle, but the routes are no longer equally likely: every right is three times as likely as a left, so a route with more rights is more likely. The bin ${most === 5 ? 'one from the right edge' : `numbered ${most}`} now collects the most, ${pct(BENT[most]!)} of the balls, and the middle bin ${pct(BENT[3]!)}.`,
};
