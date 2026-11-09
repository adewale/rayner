// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { isRefusal } from '../../../explain/index.ts';
import { AGENT, COMPANY, OPERATIONS, SID, STORY, USER_IDS, agentRequest, answer, next, start } from './model.ts';
import type { Answer, PoppyEvent, Scope, World } from './model.ts';

const play = (approves: readonly Scope[], events: readonly PoppyEvent[]): World =>
  events.reduce<World>((w, e) => {
    const after = next(w, e);
    if (isRefusal(after)) throw new Error(`${e}: ${after.reason}`);
    return after;
  }, start(approves));
const answered = (w: World): Answer => {
  if (w.last?.kind !== 'request') throw new Error('the last exchange was not a request');
  return w.last.answer;
};
const say = (a: Answer) => `${a.status}${a.error ? ` ${a.error}` : ''}${a.needs ? `, naming ${a.needs}` : ''}`;

const readOnly: readonly Scope[] = ['orders:read'];
/** Question 2's request: the agent's genuine signed-in request for the order, sent to the exchange URL instead. */
const moved = () => {
  const genuine = agentRequest(play(['orders:read', 'orders:write'], ['sign-in']), 'order');
  return answer({ ...genuine, method: OPERATIONS.exchange.method, url: OPERATIONS.exchange.url });
};
const signedOut = () => play(['orders:read', 'orders:write'], [...STORY, 'order']);

export const questions = {
  1: () =>
    `The exchange gets ${say(answered(play(readOnly, ['sign-in', 'exchange'])))}; the order gets ${say(answered(play(readOnly, ['sign-in', 'order'])))}. The Session header is the same on both: the token decides.`,
  2: () => `${say(moved())}: ${moved().reason}. A Session header is signed for one request, so it cannot be moved to another.`,
  3: () => {
    const w = signedOut();
    return `${say(answered(w))}. The Company still knows ${AGENT.name}, User ID ${USER_IDS[COMPANY.domain]} and Session ${SID} with its cart: sign-out ended account access, not the Session.`;
  },
  4: () =>
    `Nothing the agent sends: example.com sees ${USER_IDS['example.com']} and shoes.example sees ${USER_IDS['shoes.example']}, and neither ID is derived from anything about you.`,
};
