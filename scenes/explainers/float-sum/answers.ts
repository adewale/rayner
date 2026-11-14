// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { add, exact, round, shortest, store, sumStory } from './model.ts';

/** 0.2 + 0.4 against 0.6: the first question's sum. */
export const TIE_UP = sumStory({ a: '0.2', b: '0.4', expected: '0.6' });
/** 0.1 added ten times, each exact sum rounded to a double before the next: the second question's loop. */
export const TENTHS = (() => {
  const tenth = store('0.1').chosen;
  let total = tenth;
  for (let i = 1; i < 10; i++) total = round(add(exact(total), exact(tenth))).chosen;
  return { total, prints: shortest(total) };
})();
/** 0.5 + 0.25 against 0.75: the third question's sum. */
export const HALVES = sumStory({ a: '0.5', b: '0.25', expected: '0.75' });

const side = (high: boolean) => (high ? 'high' : 'low');

export const questions = {
  1: () =>
    `${TIE_UP.equal ? 'True' : 'False'}: the sum prints as ${TIE_UP.prints}. 0.2 is stored a little ${side(TIE_UP.stored[0]!.high)} and 0.4 a little ${side(TIE_UP.stored[1]!.high)}; their exact sum falls ${TIE_UP.rounded.where === 'tie' ? 'exactly halfway between' : 'between'} the double 0.6 is stored as and the next one up, and the tie goes to the one whose last bit is 0, the upper.`,
  2: () =>
    `${TENTHS.total === 1 ? 'Yes' : 'No'}: it is ${TENTHS.prints}. Each addition rounds its exact result to a neighbouring double, and over the nine additions the small errors do not cancel. Count in whole numbers (ten tenths) or compare with a tolerance instead of ==.`,
  3: () =>
    `0.5, 0.25 and 0.75 are a half, a quarter and three quarters: whole numbers over a power of two, so each is stored ${HALVES.stored.every((s) => s.exact) ? 'exactly' : 'inexactly'}, their sum is ${HALVES.rounded.where === 'exact' ? 'a double already' : 'between two doubles'}, and nothing is rounded.`,
};
