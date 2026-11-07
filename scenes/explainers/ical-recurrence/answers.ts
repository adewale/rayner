// The script's check answers, computed from the model: rayner check holds script.md's to these.
import { counted, numberWord } from '../lib/format.ts';
import { DTSTART, GUEST_MEETING, INVITED, MASTER, counts, expand, guestCopy, long, occurrences, parseRule } from './model.ts';
import type { VEvent } from './model.ts';

/** The rule's starts, and the series with its fifth meeting skipped, as the first check asks. */
export const RULE_STARTS = occurrences(DTSTART, parseRule(MASTER.rrules[0]!));
const FIFTH = RULE_STARTS[4]!;
export const SKIP_FIFTH: VEvent[] = [{ ...MASTER, exdates: [FIFTH] }, ...INVITED.slice(1)];
export const FIFTH_LEFT = expand(SKIP_FIFTH);
/** What Bob's copy holds once his meeting is skipped. */
export const BOB = counts(guestCopy('skip').copy);

export const checks = {
  1: () => ({
    question: `Alice skips the fifth meeting, ${long(FIFTH)}, instead of Bob’s, by adding EXDATE:${FIFTH}. How many meetings does her calendar show, and when is the last? What does Bob’s calendar show?`,
    answer: `Alice’s shows ${numberWord(FIFTH_LEFT.length)}, the last still on ${long(FIFTH_LEFT.at(-1)!.start)}: COUNT=6 counts the excluded start, so the series does not run a week longer. Bob is still in the third meeting’s override, so any update the server sends him carries that override again, and his calendar keeps ${long(GUEST_MEETING)}, not cancelled.`,
  }),
  3: () =>
    `The master’s DTSTART and RRULE. His copy holds ${counted(BOB.overrides, 'override', { words: true })} and ${counted(BOB.masters, 'master', { words: true })}, so it has no rule to generate the other weeks from; only the organiser’s object has one.`,
};
