// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { isRefusal } from '../../../explain/index.ts';
import { EXAMPLE_COMPANY, MCP_URL, NEW_SID, libraryKeepsToken, next, pursue, remedy, respond, sayReply, start, troubled } from './model.ts';
import type { Move, RefusalEvent, World } from './model.ts';

const play = (events: readonly RefusalEvent[]): World =>
  events.reduce<World>((w, e) => {
    const after = next(w, e);
    if (isRefusal(after)) throw new Error(`${e}: ${after.reason}`);
    return after;
  }, start());
const expect = <K extends Move['kind']>(move: Move, kind: K): Extract<Move, { kind: K }> => {
  if (move.kind !== kind) throw new Error(`expected ${kind}, the model says ${move.kind}`);
  return move as Extract<Move, { kind: K }>;
};

export const answer = () => 'Each refusal’s code names its own remedy, and the agent applies that one: the wrong one loops, or throws away a good token';

export const questions = {
  1: () => {
    const t = troubled('delegation'), reply = respond(t.request, t.company);
    expect(remedy(reply, { token: t.request.token, refresh: ['orders:read', 'orders:write'], signedOut: false, resent: false, version: '1.0', implements: ['1.0'], extensions: [], offered: {} }), 'fix');
    const inNew = troubled('delegation', { sid: NEW_SID });
    const kept = play(['delegation', 'answer']).cart;
    return `It stops sending the exchange and fixes the cause: a new delegation, in the same Session, so the cart is ${kept ? 'kept' : 'lost'}. A new Session would carry the same broken header and get ${sayReply(respond(inNew.request, inNew.company))} again.`;
  },
  2: () => {
    const t = troubled('end'), reply = respond(t.request, t.company);
    const as401 = libraryKeepsToken({ ...reply, status: 401 }) ? 'keep' : 'throw away';
    const as400 = libraryKeepsToken(reply) ? 'keeps' : 'throws away';
    return `An OAuth library treats a 401 as a bad access token, so it would ${as401} a valid token, and the agent would refresh or ask you again for nothing. With ${reply.status} the library ${as400} the token.`;
  },
  3: () => {
    const run = pursue('exchange', { company: { ...EXAMPLE_COMPANY, ended: 'all' } });
    const stop = expect(run[1]!.move, 'stop'), lost = !play(['end', 'answer']).cart;
    return `It stops sending the exchange: ${stop.why}, and the agent sends again once. The first Session’s cart ${lost ? 'did not carry over' : 'carried over'}.`;
  },
  4: () => {
    const t = troubled('mcp'), reply = respond(t.request, t.company);
    const move = expect(remedy(reply, { token: t.request.token, refresh: ['orders:read', 'orders:write'], signedOut: false, resent: false, version: '1.0', implements: ['1.0'], extensions: [], offered: {} }), 'refresh');
    if (move.resource !== MCP_URL) throw new Error('the model asks for another resource');
    return `It reads the metadata, refreshes for a token with resource ${move.resource}, and uses that token only at the MCP server. Its everyday token keeps working at the API.`;
  },
  5: () => {
    const move = remedy({ status: 401, needs: 'orders:write' }, { token: undefined, refresh: null, signedOut: true, resent: false, version: '1.0', implements: ['1.0'], extensions: [], offered: {} });
    expect(move, 'signed-out');
    return 'No. A 401 with no code is handled as insufficient_scope, and after you sign out the agent continues signed out: it asks you to sign in again only if you ask it to.';
  },
};
