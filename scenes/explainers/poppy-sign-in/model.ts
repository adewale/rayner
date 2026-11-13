import { refuse } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';
import { AGENT, COMPANY, SCOPES, SID, THIEF, USER_IDS } from '../poppy/model.ts';
import type { Scope } from '../poppy/model.ts';

// Poppy (Personal Agent Protocol, draft 1.0), section 4: how a User gives their Personal Agent
// account access without giving it their password. Sign-in is standard OAuth with stricter choices
// (4.8): the User signs in on the Company's own page, approves some or all of the scopes the agent
// asked for, and the agent gets an access token and a refresh token for exactly what was approved.
// Two sign-in types: Direct (4.2), where a one-time code comes back through the User's browser, and
// Device (4.3), where the User approves on another device while the agent polls.
//
// The model is in two parts. First, the checks themselves, as pure functions the tests hold to the
// draft's rules: what the Company checks of an authorization request, what the agent checks of the
// response, what redeeming a code needs, which scopes are granted, which device links may be shown,
// how scope hints read, what a refresh needs, and what sign-out takes. Second, a small world the
// explainer's machine drives, which uses those functions for its answers.
//
// What it leaves out, each beside the rule it qualifies below: real cryptography (a signature is the
// name of the client whose key made it; S256 is a stand-in string here, and the test checks the
// draft's literal challenge with real SHA-256), time (code, token and request lifetimes, the poll
// interval's slow_down), DPoP, resource-specific tokens (4.5), Mediated Sign-In, a Company refusing
// an agent by client_id (4.1), and anything done with the access token after sign-in: chapter 1
// shows what a key opens.

export type { Scope };

/** The Company's issuer, and the one other Company the examples need: whose sign-in an attacker would swap in. */
export const OTHER = { domain: 'shoes.example', issuer: 'https://auth.shoes.example', name: 'Shoe Company' } as const;
/** The Company's display name and domain, which the agent shows beside a device link (4.3). From the specification's example poppy.json. */
export const ORGANIZATION = { name: 'Example Company', domain: COMPANY.domain } as const;

/** The scopes example.com offers Personal Agents, from the specification's example poppy.json (section 3). */
export type OfferedScope = Scope | 'addresses' | 'poppy:browser-sign-in';
export type Changes = 'none' | 'reversible' | 'irreversible';
export type Hint = { changes: Changes; personal_data: boolean };
/** example.com's auth.scopes and auth.scope_hints, as the specification's example poppy.json gives them (section 3, 4.7). */
export const AUTH = {
  scopes: {
    'orders:read': 'See your orders, returns, and bookings. Needed to track an order or find one to change',
    'orders:write': 'Exchange or return items, and change bookings. Needed for any change to an order',
    addresses: 'See and change your saved shipping addresses. Not needed to enter an address at checkout',
    'poppy:browser-sign-in': 'Use the website signed in, with the other access you approve',
  },
  scope_hints: {
    'orders:read': { changes: 'none', personal_data: true },
    'orders:write': { changes: 'irreversible', personal_data: true },
    addresses: { changes: 'reversible', personal_data: true },
  },
} as const satisfies { scopes: Record<OfferedScope, string>; scope_hints: Partial<Record<OfferedScope, Hint>> };

/** The parts of the issuer's metadata sign-in reads (3.2), from the specification's example. */
export const ISSUER = {
  issuer: COMPANY.issuer,
  authorization_endpoint: 'https://auth.example.com/oauth/authorize',
  device_authorization_endpoint: 'https://auth.example.com/oauth/device',
  token_endpoint: 'https://auth.example.com/oauth/token',
  revocation_endpoint: 'https://auth.example.com/oauth/revoke',
} as const;

/** The agent's client metadata document (4.1), from the specification's example. */
export const CLIENT = {
  client_id: AGENT.clientId,
  client_name: 'Example Agent',
  jwks_uri: 'https://agent.example/jwks.json',
  redirect_uris: ['https://agent.example/oauth/callback'],
  token_endpoint_auth_method: 'private_key_jwt',
} as const;

/**
 * The PKCE pair of the specification's authorization URL (4.2). The challenge is the draft's literal,
 * which is RFC 7636 Appendix B's: the base64url SHA-256 of that verifier. The model compares
 * `challengeOf(verifier)` with the challenge, and `challengeOf` is a stand-in that knows only this
 * pair; the test checks the pair with real SHA-256.
 */
export const PKCE = { verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM' } as const;
export const challengeOf = (verifier: string) => (verifier === PKCE.verifier ? PKCE.challenge : `S256(${verifier})`);

/** The literals of the running example: the state value, the one-time code, the device answer (4.3) and the two refresh tokens. */
export const STATE = 'Xq81vR';
export const CODE = 'c_5Rm2';
export const DEVICE = {
  device_code: 'GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://auth.example.com/device',
  verification_uri_complete: 'https://auth.example.com/device?user_code=WDJB-MJHT',
  expires_in: 600,
  interval: 5,
} as const;
/** A refresh token's value; a new sign-in's token replaces the old one, so the model alternates two. */
export const CARDS = ['pat_8Hk2', 'pat_3Fz9'] as const;
export type Card = 0 | 1;
/** The access token's value, as in chapter 1. */
export const ACCESS = 'at_Qp4w';

/** What the exchange of order 1042 needs: reading the order, and changing it (chapter 1's two scopes). */
export const TASK: readonly Scope[] = SCOPES;

// ---------------------------------------------------------------------------------------------
// The checks.

/** OAuth errors the model gives, each from the RFC its grant follows (4.7). */
export type OAuthError = 'invalid_request' | 'invalid_scope' | 'invalid_client' | 'invalid_grant' | 'access_denied' | 'authorization_pending';
export type Rejected = { error: OAuthError; reason: string };
const rejected = (error: OAuthError, reason: string): Rejected => ({ error, reason });
export const isRejected = (value: unknown): value is Rejected => typeof value === 'object' && value !== null && 'error' in value;

/** An authorization request, as the agent opens it in the User's browser (4.2). */
export type AuthorizationRequest = { client_id: string; redirect_uri: string; scope?: string; state: string; code_challenge: string; code_challenge_method: 'S256'; prompt?: 'consent' };

/** The authorization URL's parameters for these scopes: the specification's example when they are the task's. */
/**
 * 1.0 adds prompt=consent (OpenID Connect Core §3.1.2.1), unless the agent receives the redirect only
 * on the device that opened the URL, where a forwarded link fails (4.2, 10.8). This agent's redirect is
 * its web address, which a link opened on another device reaches too, so its requests carry it; the
 * specification's example URL is the same request without it.
 */
export function authorizationRequest(scopes: readonly Scope[], o: { sameDevice?: boolean } = {}): AuthorizationRequest {
  return {
    client_id: CLIENT.client_id, redirect_uri: CLIENT.redirect_uris[0], scope: scopes.join(' '), state: STATE, code_challenge: PKCE.challenge, code_challenge_method: 'S256',
    ...(o.sameDevice ? {} : { prompt: 'consent' as const }),
  };
}

/** Where a Company that takes Pushed Authorization Requests would list its endpoint, and the request_uri it answers with (RFC 9126). */
export const PAR_ENDPOINT = 'https://auth.example.com/oauth/par';
export const REQUEST_URI = 'urn:ietf:params:oauth:request_uri:R7b2Lq';

/**
 * 4.2 (1.0): how the agent opens the authorization page, from the issuer's metadata (3.2). A Company
 * that requires Pushed Authorization Requests gets them; one that lists the endpoint should; the
 * specification's example lists none, so its agent opens the URL with every parameter in it.
 */
export function howToOpen(metadata: { issuer: string; pushed_authorization_request_endpoint?: string; require_pushed_authorization_requests?: boolean }): 'must push' | 'should push' | 'open' {
  if (metadata.require_pushed_authorization_requests) return 'must push';
  return metadata.pushed_authorization_request_endpoint ? 'should push' : 'open';
}

/**
 * 4.2 (1.0): pushing an authorization request (RFC 9126). The agent sends the parameters to the PAR
 * endpoint with its client assertion, so the Company knows which agent asked before the User sees
 * its page and nothing in the browser can change the request; the agent then opens the page with
 * only client_id and the request_uri. The pushed request gets every check a browser's would.
 * Left out: the request_uri's expiry as time (`expires_in` is a field nobody counts down), and DPoP.
 */
export function push(request: AuthorizationRequest, assertion: Assertion, o: { requirePushed?: boolean } = {}): { request_uri: string; expires_in: number } | Rejected {
  if (assertion.by !== request.client_id) return rejected('invalid_client', `the assertion was signed by ${assertion.by}, not by the client the request names`);
  const addressed = checkAssertion(assertion);
  if (isRejected(addressed)) return addressed;
  const page = authorize(request, CLIENT, { ...o, pushed: true });
  return isRejected(page) ? page : { request_uri: REQUEST_URI, expires_in: 60 };
}

/**
 * The Company's consent page (4.2, 4.3, 10.8 in 1.0). Every User of an agent shares one client_id, so
 * the page lists every scope the Company will grant, including ones the account granted before
 * (it may leave out poppy:browser-sign-in, section 6). It is shown for prompt=consent and in Device
 * Sign-In even when the account granted every scope before; without either, a Company may skip it
 * then, which lets a forwarded link get tokens with no page at all.
 */
export function consentPage(requested: readonly OfferedScope[], o: { alreadyGranted: readonly OfferedScope[]; prompt: boolean; device: boolean }): { shown: boolean; lists: OfferedScope[] } {
  const known = requested.every((s) => o.alreadyGranted.includes(s));
  if (known && !o.prompt && !o.device) return { shown: false, lists: [] };
  return { shown: true, lists: requested.filter((s) => s !== 'poppy:browser-sign-in') };
}

/**
 * What the Company checks before it shows the User its sign-in page (4.2, 4.7). The redirect_uri
 * must exactly match one the agent's metadata lists, compared character for character: otherwise
 * the code could be sent wherever the request's author chose. scope must be present, and every
 * scope in it known. Gives the scopes the page asks the User to approve.
 * Left out: the loopback port exception (RFC 8252 §7.3), and a Company refusing the client.
 */
export function authorize(request: AuthorizationRequest, client: { client_id: string; redirect_uris: readonly string[] } = CLIENT, o: { requirePushed?: boolean; pushed?: boolean } = {}): readonly OfferedScope[] | Rejected {
  // 4.2 (1.0): a Company that requires PAR takes the parameters only from its PAR endpoint (push).
  if (o.requirePushed && !o.pushed) return rejected('invalid_request', `${COMPANY.domain} requires the request to be pushed to its PAR endpoint first`);
  if (request.client_id !== client.client_id) return rejected('invalid_request', `the request names ${request.client_id}, whose metadata is not this client's`);
  if (!client.redirect_uris.includes(request.redirect_uri)) return rejected('invalid_request', `${request.redirect_uri} is not one of the redirect URIs agent.example registered, so no code is sent there`);
  if (request.scope === undefined || request.scope.trim() === '') return rejected('invalid_scope', 'every sign-in request names its scopes');
  // RFC 6749 §3.3: scope tokens are separated by single spaces, so an empty one is malformed.
  const asked = request.scope.split(' ');
  if (asked.includes('')) return rejected('invalid_scope', `the scope list ${JSON.stringify(request.scope)} has an empty entry`);
  // Own keys only: a name every object inherits, such as constructor, is not a scope the Company states.
  const unknown = asked.find((s) => !Object.hasOwn(AUTH.scopes, s));
  if (unknown !== undefined) return rejected('invalid_scope', `${unknown} is not a scope example.com offers`);
  return asked as OfferedScope[];
}

/**
 * The scopes a sign-in grants (4.7): those the User approved, and never one beyond those requested,
 * which is stricter than OAuth. A sign-in in which the User approves none ends as a decline.
 * Gives the granted scopes and whether the response must say them (RFC 6749 §5.1: scope is left out
 * only when exactly the requested scopes were granted).
 */
export function grant(requested: readonly Scope[], approved: readonly Scope[]): { scopes: readonly Scope[]; saysScope: boolean } | Rejected {
  const scopes = requested.filter((s) => approved.includes(s));
  if (scopes.length === 0) return rejected('access_denied', 'you approved none of the scopes, so the sign-in ends as a decline');
  return { scopes, saysScope: scopes.length !== requested.length };
}

/** Where the browser is sent back after Direct Sign-In (4.2): the code, the state and the issuer, to the registered redirect. */
export type AuthorizationResponse = { redirect_uri: string; code?: string; error?: 'access_denied'; state: string; iss: string };

/**
 * What the agent checks of the response its redirect receives (4.2): iss must exactly match the
 * issuer of the Company it started sign-in with, on an error too; this stops a response from another
 * Company's sign-in being swapped in. Then state must be the one it sent.
 */
export function checkResponse(response: AuthorizationResponse, startedWith: string = COMPANY.issuer): { code: string } | Rejected {
  if (response.iss !== startedWith) return rejected('invalid_request', `its iss names ${response.iss}, and the agent started sign-in with ${startedWith}`);
  if (response.state !== STATE) return rejected('invalid_request', `its state is ${response.state}, not the ${STATE} the agent sent`);
  if (response.error) return rejected(response.error, 'you declined on the Company’s page');
  // RFC 6749 §4.1.2: a response carries a code or an error, and one with neither is malformed.
  if (response.code === undefined) return rejected('invalid_request', 'it carries neither a code nor an error');
  return { code: response.code };
}

/**
 * A client assertion (4.1), reduced to what the model checks: the client whose key signed it, and
 * its aud. `by` stands in for the signature: who holds the key, not cryptography. Left out: iat,
 * jti and its lifetime.
 */
export type Assertion = { by: string; aud: string };
export const assertionOf = (client: { clientId: string }, aud: string = COMPANY.issuer): Assertion => ({ by: client.clientId, aud });

/**
 * What the Company checks of a client assertion (4.1): aud must be its issuer as a single string,
 * compared character for character, and nothing else, its token endpoint included.
 */
export function checkAssertion(assertion: Assertion): true | Rejected {
  if (assertion.aud !== COMPANY.issuer) return rejected('invalid_client', `the assertion is addressed to ${assertion.aud}, not to the issuer ${COMPANY.issuer}`);
  return true;
}

/** The token response (4.7): an access token, a refresh token from every sign-in, and scope when it differs from what was asked. */
export type Tokens = { access_token: string; refresh_token: string; scope?: string; granted: readonly Scope[] };

/** A one-time code the Company issued: to whom, for which redirect and challenge, with which scopes, and whether it was spent. */
export type IssuedCode = { code: string; client: string; redirect_uri: string; challenge: string; scopes: readonly Scope[]; requested: readonly Scope[]; spent: boolean };

/**
 * Redeeming a code at the token endpoint (4.2, RFC 6749 §4.1.3, RFC 7636): the request carries the
 * agent's client assertion, the same redirect_uri and the PKCE verifier. A code is used once, by the
 * client it was issued to, with the verifier whose challenge the request carried.
 */
export function redeem(issued: IssuedCode, request: { code: string; redirect_uri: string; verifier: string; assertion: Assertion }, card: Card = 0): Tokens | Rejected {
  const auth = checkAssertion(request.assertion);
  if (auth !== true) return auth;
  if (request.code !== issued.code || issued.spent) return rejected('invalid_grant', 'the code is not one the Company issued, or it was used already');
  if (request.assertion.by !== issued.client) return rejected('invalid_grant', `the code was issued to ${issued.client}`);
  if (request.redirect_uri !== issued.redirect_uri) return rejected('invalid_grant', 'the redirect_uri differs from the one the code was issued for');
  if (challengeOf(request.verifier) !== issued.challenge) return rejected('invalid_grant', 'the verifier does not match the challenge the sign-in began with');
  return tokensFor(issued.requested, issued.scopes, card);
}

const tokensFor = (requested: readonly Scope[], scopes: readonly Scope[], card: Card): Tokens => ({
  access_token: ACCESS, refresh_token: CARDS[card], granted: scopes, ...(scopes.length !== requested.length ? { scope: scopes.join(' ') } : {}),
});

/**
 * The host of an HTTPS URL, in lower case and without a port, or null when the URL is not HTTPS or
 * its host is not a plain host name. The host ends at the first /, \, ? or #: a browser reads \ as /
 * in an https URL. Anything else a browser would rewrite before choosing the host (userinfo before
 * an @, a tab or newline it drops, a percent-escape) makes the host null rather than a guess, so a
 * suffix check on the host cannot be fooled by text that only looks like a subdomain. (The page
 * runtime has no URL, so this is parsed by hand.)
 */
export function hostOf(uri: string): string | null {
  const authority = /^https:\/\/([^/\\?#]*)/i.exec(uri)?.[1];
  if (authority === undefined) return null;
  const host = authority.toLowerCase().replace(/:\d*$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) ? host : null;
}

/**
 * Whether the agent may show a Device Sign-In link (4.3): its host must be the host of the Company's
 * issuer or its organization.domain, or a subdomain of either, compared ignoring case. Otherwise a
 * Company could pass off another Company's sign-in page as its own. When it may, the agent shows the
 * Company's name and domain with it.
 */
export function deviceLink(uri: string, company: { issuer: string; domain: string; name: string } = { issuer: COMPANY.issuer, ...ORGANIZATION }): { show: string; beside: string } | Rejected {
  const host = hostOf(uri);
  if (host === null) return rejected('invalid_request', `${uri} is not an HTTPS URL with a plain host name`);
  const allowed = [hostOf(company.issuer) ?? company.issuer, company.domain.toLowerCase()];
  if (!allowed.some((a) => host === a || host.endsWith(`.${a}`))) return rejected('invalid_request', `its host ${host} is neither ${allowed.join(' nor ')}, nor a subdomain of either`);
  return { show: uri, beside: `${company.name} · ${company.domain}` };
}

/**
 * A poll of the token endpoint during Device Sign-In (4.3, RFC 8628 §3.4–3.5): it carries the
 * device code and the client assertion. Until the User answers it gets authorization_pending; then
 * the tokens, or access_denied. A device code polled under another client's assertion gets nothing.
 */
export function poll(request: { device_code: string; assertion: Assertion }, answered: readonly Scope[] | null, card: Card = 0): Tokens | Rejected {
  const auth = checkAssertion(request.assertion);
  if (auth !== true) return auth;
  if (request.assertion.by !== AGENT.clientId) return rejected('invalid_grant', `the device code was issued to ${AGENT.clientId}`);
  if (request.device_code !== DEVICE.device_code) return rejected('invalid_grant', 'the device code is not one the Company issued');
  if (answered === null) return rejected('authorization_pending', 'you have not answered on the Company’s page yet');
  const g = grant(TASK, answered);
  return isRejected(g) ? g : tokensFor(TASK, g.scopes, card);
}

/**
 * How consequential a scope is, from auth.scope_hints (4.7). A scope with no entry has no hints, so
 * the agent cannot tell; a changes value it does not recognise counts as irreversible, and fields it
 * does not recognise are ignored. Hints are the Company's claims, not the User's approval.
 */
export function hintOf(scope: string, hints: Record<string, { changes?: string; personal_data?: boolean; [other: string]: unknown }> = AUTH.scope_hints): Hint | 'no hints' {
  const h = hints[scope];
  if (!h || h.changes === undefined || h.personal_data === undefined) return 'no hints';
  const changes: Changes = h.changes === 'none' || h.changes === 'reversible' ? h.changes : 'irreversible';
  return { changes, personal_data: h.personal_data };
}

/**
 * The scopes a sign-in asks for (4.7): only what the User's tasks need, and, when the agent already
 * holds some, every scope it still needs, those it wants to keep included, and never only the
 * missing ones, since the new refresh token replaces the old.
 */
export function scopesToAsk(task: readonly Scope[], keep: readonly Scope[] = []): readonly Scope[] {
  return SCOPES.filter((s) => task.includes(s) || keep.includes(s));
}

/** A refresh token as the Company knows it: the client it was issued to, its scopes, and whether it was revoked. */
export type RefreshToken = { value: string; client: string; scopes: readonly Scope[]; revoked: boolean };

/**
 * A refresh (4.4): the refresh token with the client assertion. A copied refresh token is useless
 * without an assertion from the agent it was issued to: another client signs only its own, and gets
 * invalid_grant (RFC 6749 §5.2). A revoked one gets invalid_grant too. The refresh token is not tied
 * to a Session, so the request names none.
 * Left out: asking for fewer scopes or a resource at refresh, and rotation.
 */
export function refresh(token: RefreshToken, assertion: Assertion): { access_token: string; scopes: readonly Scope[] } | Rejected {
  const auth = checkAssertion(assertion);
  if (auth !== true) return auth;
  if (token.client !== assertion.by) return rejected('invalid_grant', `the refresh token was issued to ${token.client}`);
  if (token.revoked) return rejected('invalid_grant', 'the refresh token was revoked');
  return { access_token: ACCESS, scopes: token.scopes };
}

/**
 * Sign-out (5.5, 4.6): the agent revokes every refresh token it holds for the account. The account
 * is signed out once no refresh token the Company issued to that client for it is still valid.
 * Revoking one that a new sign-in replaced is not sign-out (4.7).
 */
export function signedIn(tokens: readonly RefreshToken[], client: string = AGENT.clientId): boolean {
  return tokens.some((t) => t.client === client && !t.revoked);
}

/**
 * A Session and the accounts its requests carry tokens for (5.4). A Company MAY reject a request
 * whose access token is for another account than the Session used before, with session_ended; the
 * agent SHOULD start a new Session for a second account instead. Gives the Session to use.
 */
export function sessionFor(account: string, sessions: readonly { sid: string; account: string | null }[]): { sid: string; fresh: boolean } {
  const own = sessions.find((s) => s.account === account) ?? sessions.find((s) => s.account === null);
  return own ? { sid: own.sid, fresh: false } : { sid: `new-${sessions.length + 1}`, fresh: true };
}

/**
 * The contrast of 10.5. Through Direct or Device Sign-In the Company knows which agent acts, and can
 * limit it to scopes and revoke it without affecting the User. An agent that types the User's
 * password into the website looks like the User: the Company cannot limit what it does, and can only
 * stop it by blocking it entirely.
 */
export type Route = 'sign-in' | 'password';
export function whatTheCompanySees(route: Route): { actor: string; limits: string; toStop: string; userAffected: boolean | 'unsaid' } {
  return route === 'sign-in'
    ? { actor: AGENT.name, limits: 'the scopes you approved', toStop: 'revoke agent.example’s refresh tokens', userAffected: false }
    : { actor: 'you', limits: 'nothing', toStop: 'block it entirely', userAffected: 'unsaid' };
}

// ---------------------------------------------------------------------------------------------
// The world the explainer's machine drives: one User, one agent, one Company, one task.

export type Flow = 'direct' | 'device';

/** What happened last, and what came back: what the picture shows in the middle. */
export type Last =
  | { kind: 'ask'; scopes: readonly Scope[]; link?: string }
  | { kind: 'approve'; approved: readonly Scope[] }
  | { kind: 'pending' }
  | { kind: 'tokens'; granted: readonly Scope[]; saysScope: boolean; replaced: boolean }
  | { kind: 'trick'; reason: string }
  | { kind: 'thief'; error: OAuthError; reason: string }
  | { kind: 'sign-out' }
  | { kind: 'disconnect' };

/**
 * `sign` is the sign-in waiting for the User: null when none is, else what the User approved on the
 * Company's page (null until they answer). `holds` is the refresh token the agent holds, with its
 * scopes, and which of the two values it has. `ended` is whether the account was signed in and is
 * now signed out: the Session continues either way (5.5), so it is not in the state.
 */
export type World = {
  flow: Flow;
  sign: { approved: readonly Scope[] | null } | null;
  holds: { scopes: readonly Scope[]; card: Card } | null;
  ended: boolean;
  last: Last | null;
};

export type SignInEvent = 'ask' | 'approve-all' | 'approve-read' | 'collect' | 'trick' | 'thief' | 'sign-out' | 'disconnect';
/** Every event, in the order the player shows its buttons. */
export const SIGN_IN_EVENTS: readonly SignInEvent[] = ['ask', 'approve-all', 'approve-read', 'collect', 'trick', 'thief', 'sign-out', 'disconnect'];

export const start = (flow: Flow): World => ({ flow, sign: null, holds: null, ended: false, last: null });

const covers = (held: readonly Scope[] | undefined, needed: readonly Scope[]) => !!held && needed.every((s) => held.includes(s));
const nextCard = (w: World): Card => (w.holds ? (w.holds.card === 0 ? 1 : 0) : 0);

/** The response from another Company's sign-in that the Direct trick delivers to the agent's redirect. */
export const SWAPPED: AuthorizationResponse = { redirect_uri: CLIENT.redirect_uris[0], code: 'c_9Zt4', state: STATE, iss: OTHER.issuer };
/** The device link the Device trick offers the agent to show: another Company's page. */
export const LOOKALIKE = `${OTHER.issuer}/device`;

/** The refresh token the Company holds for the agent, as the model's world has it. */
export const refreshTokenOf = (w: World): RefreshToken | null =>
  w.holds ? { value: CARDS[w.holds.card], client: AGENT.clientId, scopes: w.holds.scopes, revoked: false } : null;

/**
 * The world after `event`, or the reason it cannot happen, written to follow the event's name. A
 * check that rejects something (a swapped response, a lookalike link, a copied refresh token) is an
 * answer, so the world records it.
 */
export function next(w: World, event: SignInEvent): World | Refusal {
  const where = w.flow === 'direct' ? 'the agent has not opened the Company’s page in your browser' : 'the agent has not shown you a link and code';
  switch (event) {
    case 'ask': {
      if (w.sign) return refuse('a sign-in is already waiting for your answer on the Company’s page');
      // 4.7: request only what the task needs; with a token in hand, every scope still needed.
      if (covers(w.holds?.scopes, TASK)) return refuse(`the agent already holds a refresh token for ${TASK.join(' ')}, everything the exchange needs`);
      const scopes = scopesToAsk(TASK, w.holds?.scopes);
      const page = authorize(authorizationRequest(scopes));
      if (isRejected(page)) return refuse(page.reason);
      if (w.flow === 'device') {
        const link = deviceLink(DEVICE.verification_uri_complete);
        if (isRejected(link)) return refuse(link.reason);
        return { ...w, sign: { approved: null }, last: { kind: 'ask', scopes, link: link.show } };
      }
      return { ...w, sign: { approved: null }, last: { kind: 'ask', scopes } };
    }
    case 'approve-all':
    case 'approve-read': {
      if (!w.sign) return refuse(`no sign-in is waiting: ${where}`);
      if (w.sign.approved) return refuse('you have answered this sign-in already');
      const approved = event === 'approve-all' ? TASK : TASK.filter((s) => s === 'orders:read');
      return { ...w, sign: { approved }, last: { kind: 'approve', approved } };
    }
    case 'collect': {
      if (!w.sign) return refuse(`there is nothing to collect: ${where}`);
      const card = nextCard(w), asked = scopesToAsk(TASK, w.holds?.scopes);
      let tokens: Tokens | Rejected;
      if (w.flow === 'direct') {
        // 4.2: the browser comes back only once the User answers; the agent checks iss, then redeems the code.
        if (!w.sign.approved) return refuse('your browser has not come back: you have not answered on the Company’s page yet');
        const granted = grant(asked, w.sign.approved);
        if (isRejected(granted)) return refuse(granted.reason);
        const back = checkResponse({ redirect_uri: CLIENT.redirect_uris[0], code: CODE, state: STATE, iss: COMPANY.issuer });
        if (isRejected(back)) return refuse(back.reason);
        const issued: IssuedCode = { code: CODE, client: AGENT.clientId, redirect_uri: CLIENT.redirect_uris[0], challenge: PKCE.challenge, scopes: granted.scopes, requested: asked, spent: false };
        tokens = redeem(issued, { code: back.code, redirect_uri: CLIENT.redirect_uris[0], verifier: PKCE.verifier, assertion: assertionOf(AGENT) }, card);
      } else {
        // 4.3: the agent polls; before the User answers, authorization_pending.
        tokens = poll({ device_code: DEVICE.device_code, assertion: assertionOf(AGENT) }, w.sign.approved, card);
        if (isRejected(tokens) && tokens.error === 'authorization_pending') return { ...w, last: { kind: 'pending' } };
      }
      if (isRejected(tokens)) return refuse(tokens.reason);
      // 4.7: the new refresh token replaces the old one, which the agent revokes; that is not sign-out.
      return {
        ...w, sign: null, holds: { scopes: tokens.granted, card }, ended: false,
        last: { kind: 'tokens', granted: tokens.granted, saysScope: tokens.scope !== undefined, replaced: w.holds !== null },
      };
    }
    case 'trick': {
      if (w.flow === 'direct') {
        // 4.2: a response from another Company's sign-in, at the agent's redirect while a sign-in waits.
        if (!w.sign) return refuse('no sign-in is waiting, so the agent’s redirect expects no response to swap');
        const back = checkResponse(SWAPPED);
        return isRejected(back) ? { ...w, last: { kind: 'trick', reason: back.reason } } : refuse('the swapped response passed the agent’s checks');
      }
      // 4.3: a device answer whose link is another Company's page, when the agent would start a sign-in.
      if (w.sign) return refuse('a sign-in is already waiting, and the agent asks for a link only when it starts one');
      if (covers(w.holds?.scopes, TASK)) return refuse(`the agent already holds everything the exchange needs, so it starts no sign-in`);
      const link = deviceLink(LOOKALIKE);
      return isRejected(link) ? { ...w, last: { kind: 'trick', reason: link.reason } } : refuse('the lookalike link passed the agent’s check');
    }
    case 'thief': {
      const token = refreshTokenOf(w);
      if (!token) return refuse('the agent holds no refresh token to copy');
      const answer = refresh(token, assertionOf(THIEF));
      return isRejected(answer) ? { ...w, last: { kind: 'thief', error: answer.error, reason: answer.reason } } : refuse('the copied refresh token worked');
    }
    case 'sign-out':
      // 5.5: revoke every refresh token held for the account; the Session continues signed out.
      if (!w.holds) return refuse('the agent holds no refresh token for your account, so there is nothing to revoke');
      return { ...w, holds: null, ended: true, last: { kind: 'sign-out' } };
    case 'disconnect':
      // 5.5: the User disconnects the agent in the Company's account settings, which revokes its refresh tokens.
      // The agent learns at its next refresh (invalid_grant); the model folds that refresh into this event.
      if (!w.holds) return refuse('no refresh token of agent.example is valid for your account, so there is nothing to disconnect');
      return { ...w, holds: null, ended: true, last: { kind: 'disconnect' } };
  }
}

/** The rule of the draft that decided what the picture shows: its section, and what it says in the reader's words. */
export type Rule = { section: string; says: string };
export function ruleOf(w: World): Rule {
  const last = w.last;
  if (!last) return { section: '10.5', says: 'An agent that types your password looks like you, and can only be blocked entirely.' };
  switch (last.kind) {
    case 'ask':
      return w.flow === 'direct'
        ? { section: '4.2', says: 'The agent opens the Company’s own page in your browser, asking only for the scopes the task needs.' }
        : { section: '4.3', says: 'The agent shows a link only on the Company’s own host, with its name and domain beside it.' };
    case 'approve':
      return { section: '4.7', says: 'You may approve fewer scopes than asked, and the Company grants none beyond those asked.' };
    case 'pending':
      return { section: '4.3', says: 'Until you answer, each poll gets authorization_pending.' };
    case 'tokens':
      return last.replaced
        ? { section: '4.7', says: 'Asking again requests every scope still needed, and the new refresh token replaces the old.' }
        : w.flow === 'direct'
          ? { section: '4.2', says: 'The code comes back only to a registered redirect, and only the agent can redeem it.' }
          : { section: '4.3', says: 'Once you approve, the agent’s next poll returns the tokens.' };
    case 'trick':
      return w.flow === 'direct'
        ? { section: '4.2', says: 'The agent checks that iss names the Company it started sign-in with.' }
        : { section: '4.3', says: 'A link on another Company’s host is never shown.' };
    case 'thief':
      return { section: '4.4', says: 'A refresh token works only with the agent’s own client assertion.' };
    case 'sign-out':
      return { section: '5.5', says: 'Sign-out revokes every refresh token; the Session continues signed out.' };
    case 'disconnect':
      return { section: '5.5', says: 'You can disconnect the agent in your account settings, and keep your account.' };
  }
}

/** The events of the story, in order, for each sign-in type: what the steps replay. */
export const STORY: Record<Flow, readonly SignInEvent[]> = {
  direct: ['ask', 'approve-read', 'trick', 'collect', 'ask', 'approve-all', 'collect', 'thief', 'sign-out'],
  device: ['ask', 'collect', 'approve-read', 'collect', 'trick', 'ask', 'approve-all', 'collect', 'thief', 'sign-out'],
};

/** The Session and User ID, unchanged by everything here (5.4, 5.5): sign-in does not need to know the Session. */
export const SESSION = { sid: SID, userId: USER_IDS[COMPANY.domain] } as const;
