// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { isRefusal } from '../../../explain/index.ts';
import { ACCOUNT, OWNER, authorFor, continueAs, next, openDirectOf, roleOf, start } from './model.ts';
import type { Caller, Continuation, TableEvent, World } from './model.ts';

const play = (events: readonly TableEvent[], from: World = start()): World =>
  events.reduce<World>((w, e) => {
    const after = next(w, e);
    if (isRefusal(after)) throw new Error(`${e}: ${after.reason}`);
    return after;
  }, from);
/** The reason the model gives for refusing `event` in `w`; throws if it is taken. */
const refusal = (w: World, event: TableEvent): string => {
  const after = next(w, event);
  if (!isRefusal(after)) throw new Error(`${event} was taken`);
  return after.reason ?? '';
};
/** The 409 error a refusal reason names. */
const errorIn = (reason: string) => /409 ([a-z_]+)/.exec(reason)?.[1] ?? 'no error';
const said = (c: Continuation) => (c.status === 'continues' ? 'continues' : c.status === 401 ? '401 with a challenge to sign in again' : `${c.status} ${c.error}`);

export const questions = {
  1: () =>
    `The agent’s summary is ${authorFor('summary')} and your own words are ${authorFor('user’s own words')}. Both have role ${roleOf('agent') === roleOf('you') ? roleOf('you') : '?'}: role says which side, author.type says person or AI.`,
  2: () => {
    const inDirect = play(['ask', 'read', 'invite', 'direct']);
    const back = play(['joins', 'read', 'close'], inDirect);
    const takes = !isRefusal(next(back, 'ask'));
    return `409 ${errorIn(refusal(inDirect, 'ask'))}: the first conversation waits while the Direct Conversation is open${takes ? ', and takes messages again once it closes' : ''}.`;
  },
  3: () => {
    const settled = play(['ask', 'read']), invited = play(['invite'], settled);
    const unchanged = JSON.stringify({ ...invited, invited: false }) === JSON.stringify(settled) && openDirectOf(invited) === null;
    return `It adds a user_requested event${unchanged ? ', which changes no state field' : ''}. Only your agent opens a Direct Conversation, after asking you, so you decide when you are brought in.`;
  },
  4: () => {
    const used = { ...OWNER, account: ACCOUNT };
    const as = (o: Partial<Caller>): Caller => ({ client: OWNER.client, userId: OWNER.userId, account: null, session: 'Yx2b7Q', ...o });
    return `Signed out: ${said(continueAs(used, as({})))}. Another User ID: ${said(continueAs(used, as({ userId: 'usr_m4Tz9P' })))}. Account B: ${said(continueAs(used, as({ account: 'B' })))}, the same answer as for an ID that does not exist.`;
  },
  5: () => {
    const reason = refusal(play(['ask']), 'close');
    if (!reason.includes('does not wait its turn')) throw new Error(reason);
    return 'A close does not wait its turn, so the Company may drop the message it has not acted on yet. Reading until working is false makes sure it was handled first.';
  },
};
