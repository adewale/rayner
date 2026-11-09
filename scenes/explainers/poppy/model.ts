import { refuse } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';

// Poppy (Personal Agent Protocol, draft 0.4): how a Company decides what one request from a
// Personal Agent may do. Two proofs travel separately. The Session header (5.2) is a JWT the agent
// signs for one request; it names the agent, a pseudonymous User ID and a Session, and the Company
// verifies it (5.3). The access token is plain OAuth (section 4): it says which account the request
// may act on, and with which scopes. This model keeps those two apart and joins them where 5.3 does.
//
// What it leaves out, each beside the rule it qualifies below: real signatures (who holds a key is a
// field, not cryptography), time (the iat acceptance window, token and delegation lifetimes, jti
// replay), discovery's checks of poppy.json, DPoP, browser join and conversations.

export type Scope = 'orders:read' | 'orders:write';
export const SCOPES: readonly Scope[] = ['orders:read', 'orders:write'];

/** The Company of the spec's examples. Its identifier is its OAuth issuer (3.2). */
export const COMPANY = { domain: 'example.com', issuer: 'https://auth.example.com' } as const;
/** The Personal Agent: its client_id is the URL of its metadata document (4.1). */
export const AGENT = { clientId: 'https://agent.example/agent.json', name: 'agent.example' } as const;
/** Another client, which holds its own keys and none of the agent's. */
export const THIEF = { clientId: 'https://thief.example/agent.json', name: 'thief.example' } as const;

/**
 * The User IDs the agent gives one User (5.1): one for each Company, opaque and unrelated, so two
 * Companies cannot match the User by comparing them.
 */
export const USER_IDS = { 'example.com': 'usr_Q7c1vK', 'shoes.example': 'usr_m4Tz9P' } as const;
/** The Session ID the agent chose at random for this task (5.2). */
export const SID = 'Yx2b7Q';

export type OperationKey = 'cart' | 'order' | 'exchange';
export type Operation = { method: 'GET' | 'POST'; url: string; path: string; needs: Scope | null };
/** The three things the agent asks example.com to do, and the scope each needs. A cart needs no account. */
export const OPERATIONS: Record<OperationKey, Operation> = {
  cart: { method: 'POST', url: 'https://api.example.com/cart', path: '/cart', needs: null },
  order: { method: 'GET', url: 'https://api.example.com/orders/ord_7Hk2', path: '/orders/ord_7Hk2', needs: 'orders:read' },
  exchange: { method: 'POST', url: 'https://api.example.com/orders/ord_7Hk2/exchanges', path: '/orders/ord_7Hk2/exchanges', needs: 'orders:write' },
};

/** An OAuth access token: the client it was issued to and the scopes the User approved. */
export type AccessToken = { value: string; client: string; scopes: readonly Scope[]; revoked?: boolean };
/**
 * A Session JWT's claims (5.2). `key` stands in for the signature: the client whose published keys
 * vouch for the delegated key that signed it. A real Company verifies a delegation and an ES256
 * signature there; this model compares names.
 */
export type SessionJwt = { iss: string; aud: string; sid: string; sub: string; htm: string; htu: string; ath?: string; key: string };
export type HttpRequest = { method: string; url: string; session?: SessionJwt; token?: AccessToken };
/** What the Company answers: an HTTP status, with the error code and the scope a challenge names. */
export type Answer = { status: number; error?: 'invalid_session' | 'invalid_token' | 'insufficient_scope'; needs?: Scope; reason?: string };

/** The token's hash a Session JWT carries in `ath` (5.2). A real one is SHA-256; here it only has to differ per token. */
export const hashOf = (token: AccessToken) => `ath(${token.value})`;

/** The Session JWT `client` signs for one request, covering its method, its URL and the token it carries. */
export function sign(client: { clientId: string }, request: { method: string; url: string; token?: AccessToken }, sub: string, sid: string): SessionJwt {
  return {
    iss: client.clientId, aud: COMPANY.issuer, sid, sub, htm: request.method, htu: request.url, key: client.clientId,
    ...(request.token ? { ath: hashOf(request.token) } : {}),
  };
}

/**
 * What example.com answers to one request, in the order the specification gives.
 *
 * First the Session header (5.3), which every operation here depends on: it must be present, signed
 * by a key the client named in `iss` vouches for, addressed to this Company, and signed for this
 * method and URL; and if the request carries an access token, the header's `ath` must be that
 * token's hash and the token must have been issued to the same client. A failure is 400
 * invalid_session, never 401, so OAuth libraries do not discard a good token.
 *
 * Then the account (section 7): an operation that needs a scope gets 401 and a challenge naming it
 * when the request has no token, 401 invalid_token for a revoked token, and 403 insufficient_scope
 * when the token lacks the scope. A Session header never grants account access, whatever it holds.
 *
 * Left out: the iat window and jti. A whole request copied in transit, header and token together,
 * is accepted here; the specification limits that to the same method and URL, briefly.
 */
export function answer(request: HttpRequest): Answer {
  const op = Object.values(OPERATIONS).find((o) => o.method === request.method && o.url === request.url);
  if (!op) return { status: 404 };
  const invalid = (reason: string): Answer => ({ status: 400, error: 'invalid_session', reason });
  const { session: s, token } = request;
  if (!s) return invalid('the request has no Session header');
  if (s.key !== s.iss) return invalid('the header was not signed with a key its named agent vouches for');
  if (s.aud !== COMPANY.issuer) return invalid('the header is addressed to another Company');
  if (s.htm !== request.method || s.htu !== request.url) return invalid('the header was signed for another method or URL');
  if (token && s.ath !== hashOf(token)) return invalid('the header does not cover this access token');
  if (!token && s.ath !== undefined) return invalid('the header covers an access token the request does not carry');
  if (token && token.client !== s.iss) return invalid('the access token was issued to another agent');
  if (token?.revoked) return { status: 401, error: 'invalid_token' };
  if (op.needs && !token) return { status: 401, needs: op.needs };
  if (op.needs && !token!.scopes.includes(op.needs)) return { status: 403, error: 'insufficient_scope', needs: op.needs };
  return { status: 200 };
}

/** What was last sent, and what came back: the middle of the picture. */
export type Exchange =
  | { kind: 'request'; by: 'agent' | 'thief'; op: OperationKey; token: boolean; answer: Answer }
  | { kind: 'sign-in'; granted: readonly Scope[] }
  | { kind: 'revoke' };

/**
 * The world between one agent and one Company, for one User and one Session.
 * `started` is whether the Company holds a record of the Session, which the first verified request
 * creates (section 5: there is no separate step to start one). `grant` is whether the agent holds a
 * refresh token, with the scopes in `approves`. `linked` is whether the Company has joined this
 * Session to the User's account: a Session is signed in on each request that carries an access
 * token (5.4), and continues signed out after sign-out (5.5).
 */
export type World = {
  approves: readonly Scope[];
  started: boolean;
  cart: boolean;
  grant: boolean;
  linked: 'no' | 'yes' | 'signed out';
  last: Exchange | null;
};

export type PoppyEvent = 'cart' | 'order' | 'exchange' | 'sign-in' | 'thief' | 'sign-out';
/** Every event, in the order the player shows its buttons. */
export const POPPY_EVENTS: readonly PoppyEvent[] = ['cart', 'order', 'exchange', 'sign-in', 'thief', 'sign-out'];

/** Before anything is sent: the Company knows nothing, and the agent holds no token. */
export const start = (approves: readonly Scope[]): World => ({ approves, started: false, cart: false, grant: false, linked: 'no', last: null });

/** The access token the agent's refresh token yields: issued to the agent, for exactly the scopes approved (4.7). */
export const tokenOf = (w: World): AccessToken => ({ value: 'at_Qp4w', client: AGENT.clientId, scopes: w.approves });

/**
 * The request the agent sends for an operation. It carries the Session header always (5.2), and an
 * access token only when the operation needs the account and the agent holds one: this agent sends
 * no token with a request that needs none.
 */
export function agentRequest(w: World, key: OperationKey): HttpRequest {
  const op = OPERATIONS[key];
  const token = op.needs && w.grant ? tokenOf(w) : undefined;
  const base = { method: op.method, url: op.url, ...(token ? { token } : {}) };
  return { ...base, session: sign(AGENT, base, USER_IDS[COMPANY.domain], SID) };
}

/**
 * A thief's request: it has copied the agent's access token, but holds only its own keys, so the
 * Session header it can sign names itself.
 */
export function thiefRequest(w: World): HttpRequest {
  const op = OPERATIONS.order, base = { method: op.method, url: op.url, token: tokenOf(w) };
  return { ...base, session: sign(THIEF, base, 'usr_thief', 'sid_thief') };
}

/**
 * The world after `event`, or the reason the event cannot happen, written to follow the event's
 * name. A request the Company answers with an error still happens: the world records the answer.
 */
export function next(w: World, event: PoppyEvent): World | Refusal {
  switch (event) {
    case 'cart':
    case 'order':
    case 'exchange': {
      if (event === 'cart' && w.cart) return refuse('the medium is already in this Session’s cart');
      const request = agentRequest(w, event), result = answer(request);
      // 5.3: a verified header starts the Session; a verified token signs this request in.
      const verified = result.error !== 'invalid_session';
      return {
        ...w,
        started: w.started || verified,
        cart: w.cart || (event === 'cart' && result.status === 200),
        linked: verified && request.token ? 'yes' : w.linked,
        last: { kind: 'request', by: 'agent', op: event, token: !!request.token, answer: result },
      };
    }
    case 'sign-in':
      // 4.4: a refresh token is there so the agent need not ask the User to sign in again.
      if (w.grant) return refuse('the agent already holds a refresh token for what you approve, so it has no reason to ask you again');
      // Sign-in is plain OAuth and does not mention the Session (5.4), so nothing else changes.
      return { ...w, grant: true, last: { kind: 'sign-in', granted: w.approves } };
    case 'thief':
      if (!w.grant) return refuse('there is no access token to copy until you sign in');
      // An unverified header starts no Session and attributes nothing (5.3).
      return { ...w, last: { kind: 'request', by: 'thief', op: 'order', token: true, answer: answer(thiefRequest(w)) } };
    case 'sign-out':
      if (!w.grant) return refuse('the agent holds no refresh token, so there is nothing to revoke');
      // 5.5: revoking the refresh token signs out; the Session continues signed out.
      return { ...w, grant: false, linked: w.linked === 'yes' ? 'signed out' : w.linked, last: { kind: 'revoke' } };
  }
}

/** The rule of the draft that decided what the picture shows: its section, and what it says in the reader's words. */
export type Rule = { section: string; says: string };
export function ruleOf(last: Exchange | null): Rule {
  if (!last) return { section: '3', says: 'An agent reads the Company’s poppy.json before it sends anything.' };
  if (last.kind === 'sign-in') return { section: '5.4', says: 'Sign-in is plain OAuth, and does not need to know the Session.' };
  if (last.kind === 'revoke') return { section: '5.5', says: 'Sign-out revokes the refresh token; the Session continues signed out.' };
  const { status, error } = last.answer;
  if (error === 'invalid_session') return { section: '5.3', says: 'The agent a token was issued to must have signed the header beside it.' };
  if (status === 401) return { section: '5.3', says: 'A Session header grants no account access, whatever it holds.' };
  if (status === 403) return { section: '7', says: 'A token without the scope is refused, and the answer names the scope.' };
  return last.token
    ? { section: '5', says: 'The header says which Session; the token says which account and scopes.' }
    : { section: '5.2', says: 'A signed-out request carries the Session header alone.' };
}

/** The events of the story, for a User who approves `approves`: the reader's first six presses. */
export const STORY: readonly PoppyEvent[] = ['cart', 'exchange', 'sign-in', 'exchange', 'thief', 'sign-out'];
