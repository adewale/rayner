// Easings beyond the engine's two (`linear` and `smooth`). An easing is a `RateFunc` from `rayner`: it
// maps the fraction of a run's time that has passed, 0 to 1, to how far the animation has got.
import { smooth } from '../src/index.ts';
import type { RateFunc } from '../src/index.ts';

/** Starts slowly and arrives at full speed: the first half of `smooth`, stretched over the run. Built on `smooth`. */
export const rushInto: RateFunc = (t) => 2 * smooth(t / 2);

/** Leaves at full speed and settles slowly: the second half of `smooth`, stretched over the run. Built on `smooth`. */
export const rushFrom: RateFunc = (t) => 2 * smooth(t / 2 + 0.5) - 1;

/**
 * Goes all the way and comes back: `smooth` up over the first half of the run and down over the second,
 * so the animation ends where it began. Built on `smooth`.
 */
export const thereAndBack: RateFunc = (t) => (t < 0.5 ? smooth(2 * t) : smooth(2 * (1 - t)));
