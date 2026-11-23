// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { isRefusal } from '../../../explain/index.ts';
import { POPPY_JSON } from '../poppy/model.ts';
import { BROWSER_SIGN_IN, HELP_URL, STORY, joinEffect, next, pageFetch, start, storyOf } from './model.ts';
import type { JoinEvent, Last, SignIn, SubmitAnswer, Visit, World } from './model.ts';

const play = (signIn: SignIn, events: readonly JoinEvent[]): World =>
  events.reduce<World>((w, e) => {
    const after = next(w, e);
    if (isRefusal(after)) throw new Error(`${e}: ${after.reason}`);
    return after;
  }, start(signIn));
const lastOf = <E extends Last['event']>(w: World, event: E) => {
  if (w.last?.event !== event) throw new Error(`the last event was not ${event}`);
  return w.last as Extract<Last, { event: E }>;
};
const failed = (a: SubmitAnswer) => {
  if (a.status !== 400) throw new Error('the submission was accepted');
  return a.failed.join(', and ');
};
const as = (v: Visit) => (v.via === 'session' ? `signed in to ${v.account}, with the token’s scopes` : v.account ? `logged in as ${v.account}` : 'signed out');

export const questions = {
  1: () => {
    const forged = lastOf(play('signed in', STORY.slice(0, 6)), 'forge');
    return `An error page and no Session cookie: ${failed(forged.answer)}. The code was authorized, but it arrived without its cookie.`;
  },
  2: () => {
    const phished = lastOf(play('signed in', STORY), 'phish');
    return `It declines: ${phished.declined}. The attacker’s browser has the cookie, but it gets an error page, since ${failed(phished.answer)}.`;
  },
  3: () => {
    const lacking: SignIn = 'signed in without the browser scope', events = storyOf(lacking);
    const refused = lastOf(play(lacking, events.slice(0, 3)), 'authorize').answer;
    const visit = lastOf(play(lacking, events.slice(0, 6)), 'browse').visit;
    if (refused.needs !== BROWSER_SIGN_IN) throw new Error('step 2 did not name the browser scope');
    return `${refused.status} ${refused.error}, naming ${refused.needs}. The agent authorizes the same code again without the token, and the browser joins the Session ${as(visit)}.`;
  },
  4: () => {
    const { whileJoined, afterSignInEnds } = joinEffect('B', 'A');
    return `It browses ${as(whileJoined)}. When the Session’s sign-in ends it is ${as(afterSignInEnds)}: the login as B does not come back.`;
  },
  5: () => {
    const sent = pageFetch(HELP_URL, POPPY_JSON, 'its own HTTP client', true);
    if (!sent.session || sent.token !== null || 'ath' in sent.session) throw new Error('the fetch carried more than the Session header');
    return 'The Session header alone, with no access token and no token hash in it, so the request is signed out.';
  },
};
