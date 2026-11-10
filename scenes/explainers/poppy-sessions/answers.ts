// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { isRefusal } from '../../../explain/index.ts';
import { AGENT_SIGNER, CHECKS, FORGETFUL, USER_IDS, attempt, genuine, next, receive, remember, start, TIME } from './model.ts';
import type { CheckId, Policy, SealWorld, Tamper, Verdict } from './model.ts';

const play = (policy: Policy, tampers: readonly Tamper[]): SealWorld =>
  tampers.reduce<SealWorld>((w, t) => {
    const after = next(w, t);
    if (isRefusal(after)) throw new Error(`${t}: ${after.reason}`);
    return after;
  }, start(policy));
const verdictOf = (policy: Policy, tampers: readonly Tamper[]): Verdict => play(policy, tampers).last!.verdict;
/** The claim or link a failed check reads, in the reader's words. */
const AT: Partial<Record<CheckId, string>> = { request: 'htm and htu', aud: 'aud', time: 'iat', replay: 'jti', delegation: 'the delegation', 'one-user': 'the key' };
const refused = (v: Verdict) => `${v.answer.status} ${v.answer.error} at ${AT[v.failed!]}: ${v.answer.reason}`;
const status = (v: Verdict) => `${v.answer.status}${v.answer.needs ? `, naming ${v.answer.needs}` : ''}`;

export const questions = {
  1: () => `${refused(verdictOf('remembers', ['send', 'url']))}. A Session JWT covers one request, and only that one.`,
  2: () => `${refused(verdictOf('remembers', ['aud']))}. The agent names the Company it verified in aud, so a header one Company collects is refused by every other.`,
  3: () => {
    const used = receive(attempt('other-user').request, attempt('other-user').now, 'required');
    const memory = remember(FORGETFUL, genuine(), receive(genuine(), TIME.signed + 1, 'remembers'));
    const caught = receive(attempt('other-user').request, attempt('other-user').now, 'remembers', memory);
    const expired = verdictOf('remembers', ['expired']);
    return `Sign headers as any User ID it knows, signed out only: the exchange gets ${status(used)}. A Company that remembers which User ID each key signed for refuses it for anyone but ${USER_IDS['example.com']}: ${caught.answer.reason}. At 07:00 nothing works: ${expired.answer.reason}.`;
  },
  4: () => {
    const remembers = verdictOf('remembers', ['send', 'replay']), forgets = verdictOf('required', ['send', 'replay']);
    const late = verdictOf('required', ['send', 'late']);
    const window = CHECKS.find((c) => c.id === 'time')!;
    return `Where the Company remembers jtis, the copy ten seconds later gets ${remembers.answer.status} ${remembers.answer.error} (${remembers.answer.reason}); where it does not, ${status(forgets)}. The copy two minutes later gets ${late.answer.status} ${late.answer.error} either way: ${late.answer.reason} (section ${window.section}).`;
  },
  5: () => {
    const here = AGENT_SIGNER.byUser[USER_IDS['example.com']]!.key, there = AGENT_SIGNER.byUser[USER_IDS['shoes.example']]!.key;
    return `With one key, the two Companies could match you by its thumbprint or its delegation’s jti. With ${here} at one and ${there} at the other they have nothing in common, and a leaked key exposes you at one Company only.`;
  },
};
