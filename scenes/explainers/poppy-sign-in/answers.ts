// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { isRefusal } from '../../../explain/index.ts';
import { AGENT, THIEF } from '../poppy/model.ts';
import {
  CARDS, LOOKALIKE, ORGANIZATION, SWAPPED, assertionOf, checkResponse, deviceLink, isRejected, next, refresh, start, whatTheCompanySees,
} from './model.ts';
import type { Flow, SignInEvent, World } from './model.ts';

const play = (flow: Flow, events: readonly SignInEvent[]): World =>
  events.reduce<World>((w, e) => {
    const after = next(w, e);
    if (isRefusal(after)) throw new Error(`${e}: ${after.reason}`);
    return after;
  }, start(flow));
const reason = (value: unknown) => {
  if (!isRejected(value)) throw new Error('expected the check to reject');
  return value;
};

/** Question 1: you approve only orders:read; the token response, then the agent asking again. */
const fewer = () => {
  const first = play('direct', ['ask', 'approve-read', 'collect']);
  if (first.last?.kind !== 'tokens' || !first.last.saysScope) throw new Error('expected a response that says its scope');
  const again = next(first, 'ask');
  if (isRefusal(again) || again.last?.kind !== 'ask') throw new Error('expected the agent to ask again');
  const replaced = play('direct', ['ask', 'approve-read', 'collect', 'ask', 'approve-all', 'collect']);
  return { said: first.last.granted.join(' '), asked: again.last.scopes.join(' '), from: CARDS[first.holds!.card], to: CARDS[replaced.holds!.card] };
};

export const questions = {
  1: () => {
    const f = fewer();
    return `The response’s scope says ${f.said}, so the agent sees orders:write is missing. You sign in again and it asks for ${f.asked}, everything it still needs; the new refresh token ${f.to} replaces ${f.from}.`;
  },
  2: () => `The agent rejects it: ${reason(checkResponse(SWAPPED)).reason}.`,
  3: () => `It does not show the link: ${reason(deviceLink(LOOKALIKE)).reason}. A link it shows has ${ORGANIZATION.name} and ${ORGANIZATION.domain} beside it.`,
  4: () => {
    const r = reason(refresh({ value: CARDS[0], client: AGENT.clientId, scopes: ['orders:read'], revoked: false }, assertionOf(THIEF)));
    return `${r.error}: ${r.reason}. The thief can sign an assertion only as itself.`;
  },
  5: () => {
    const password = whatTheCompanySees('password'), signIn = whatTheCompanySees('sign-in');
    return `It sees ${password.actor}, not ${signIn.actor}, so it can limit ${password.limits} and can only ${password.toStop}. Through sign-in it could ${signIn.toStop}${signIn.userAffected === false ? ' without affecting you' : ''}.`;
  },
};
