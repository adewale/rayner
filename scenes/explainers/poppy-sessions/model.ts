import { isRefusal, refuse } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';
import { AGENT, COMPANY, OPERATIONS, SCOPES, SID, THIEF, USER_IDS, answer, hashOf, sign } from '../poppy/model.ts';
import type { AccessToken, Answer, HttpRequest, OperationKey } from '../poppy/model.ts';

// Poppy (Personal Agent Protocol, draft 0.4), what is inside the seal: how a Company knows which
// agent and which User a request is from, without learning who the User is. Chapter 1's model
// (`../poppy/model.ts`) has the Session JWT's claims, `sign` and `answer`; this one adds what that
// chapter left out: the agent's published keys (4.1), the delegation that vouches for a delegated
// key (5.2, Delegated keys), time (iat, the delegation's exp), jti, and the Company's verification
// in the order 5.2 and 5.3 give, each check with the copy it stops.
//
// What it leaves out, each beside the rule it qualifies below:
// - Real cryptography. A synchronous in-page model cannot verify ES256, so a signature here is the
//   name of the key that made it (`signedBy`), and only that key's holder can write it: the model
//   assumes signatures cannot be forged, which is what ES256 is for. A key's thumbprint is its name.
// - HTTP fetching: the client metadata and key sets are a table, fetched without redirects by
//   assumption, and the address checks of section 3 are not modelled.
// - Operator signatures (Web Bot Auth, RFC 9421), blind signing (10.7), DPoP (4.5), Agent IDs beyond
//   the claim's presence, Session lookup and ended Sessions (5.5), and website pages (5.2).

export { AGENT, COMPANY, SID, THIEF, USER_IDS } from '../poppy/model.ts';

/** Another Company the same User uses through the same agent, with its own identifier (3.2). */
export const OTHER_COMPANY = { domain: 'shoes.example', issuer: 'https://auth.shoes.example' } as const;

/**
 * A Company's identifier, which a Session JWT names in aud (5.2, 10.4): its issuer when it has one,
 * or https://{organization.domain}, the host in lowercase, with no trailing slash.
 */
export function identifierOf(company: { domain: string; issuer?: string }): string {
  return company.issuer ?? `https://${company.domain.toLowerCase().replace(/\/+$/, '')}`;
}

// ---------------------------------------------------------------- 4.1 Agent identity

/** What a client's metadata document says, and the public keys its jwks_uri returns (by thumbprint). */
export type ClientMetadata = { client_id: string; jwks_uri: string; keys: readonly string[] };

/** The agent's published key, as named in the spec's delegation example; and the thief's own. */
export const PUBLISHED = { agent: 'qijAJ9BU', thief: 'Tf7kP2wQ' } as const;

/**
 * The documents a Company can fetch, by URL: what an HTTPS GET of each client_id returns (4.1).
 * A thief is a client too: it publishes its own metadata and keys, and holds none of the agent's.
 */
export const CLIENT_METADATA: Readonly<Record<string, ClientMetadata>> = {
  [AGENT.clientId]: { client_id: AGENT.clientId, jwks_uri: 'https://agent.example/jwks.json', keys: [PUBLISHED.agent] },
  [THIEF.clientId]: { client_id: THIEF.clientId, jwks_uri: 'https://thief.example/jwks.json', keys: [PUBLISHED.thief] },
};

const hostOf = (url: string) => (url.startsWith('https://') ? url.slice(8).split('/')[0]!.toLowerCase() : null);

/**
 * The client a Company learns from iss (4.1, 5.3): the client_id is an HTTPS URL that returns the
 * client's metadata, the document's client_id equals that URL, and its jwks_uri is an HTTPS URL on
 * the same domain. Gives the metadata, or why it cannot be used.
 * Left out: redirects (5.3 says not to follow them; here there are none) and section 3's address checks.
 */
export function fetchClient(iss: string, documents: Readonly<Record<string, ClientMetadata>> = CLIENT_METADATA): ClientMetadata | Refusal {
  if (!hostOf(iss)) return refuse(`iss ${iss} is not an HTTPS URL`);
  const doc = documents[iss];
  if (!doc) return refuse(`nothing at ${iss} describes a client`);
  if (doc.client_id !== iss) return refuse(`the document at ${iss} names another client_id, ${doc.client_id}`);
  if (hostOf(doc.jwks_uri) !== hostOf(iss)) return refuse(`its jwks_uri is not an HTTPS URL on ${hostOf(iss)}`);
  return doc;
}

// ---------------------------------------------------------------- 5.2 Delegated keys

/** A delegation lasts at most this long, in seconds (5.2: exp at most 24 hours after iat). */
export const MAX_DELEGATION = 24 * 60 * 60;
/** The Company's iat acceptance window, in seconds: 5.3 lets it choose, "such as one minute". */
export const WINDOW = 60;

/** The spec's own times, in Unix seconds: the delegation's iat and exp, and the Session JWT's iat. */
export const TIME = { delegated: 1790899200, signed: 1790900000, expires: 1790920800 } as const;
/** A time as the picture prints it, hours, minutes and seconds in UTC. */
export const clock = (t: number) => new Date(t * 1000).toISOString().slice(11, 19);

/**
 * A delegation (5.2): a short-lived JWT, signed by a key in the agent's jwks_uri (named by kid),
 * that names a delegated public key in cnf.jwk. It names no User ID, Agent ID or Company: the
 * type has no field for one, and `delegate` writes only these.
 */
export type Delegation = {
  typ: string;
  kid: string;
  iss: string;
  cnf: { jwk: string };
  iat: number;
  exp: number;
  jti: string;
  /** Stands in for the signature: the key that made it. */
  signedBy: string;
};

/** The delegation `publishedKey` signs for `delegatedKey`, issued at `iat` to last `lifetime` seconds. */
export function delegate(client: { clientId: string }, publishedKey: string, delegatedKey: string, iat: number, lifetime: number, jti: string): Delegation {
  return { typ: 'poppy-delegation+jwt', kid: publishedKey, iss: client.clientId, cnf: { jwk: delegatedKey }, iat, exp: iat + lifetime, jti, signedBy: publishedKey };
}

/** A delegated key and the delegation that vouches for it. */
export type Held = { key: string; delegation: Delegation };
/** What a client holds to sign Session JWTs: its published key, and a delegated key for each User ID (5.2). */
export type Signer = { client: { clientId: string; name: string }; published: string; byUser: Readonly<Record<string, Held>> };

/** A second User of the same agent at example.com: another person, with their own User ID. */
export const OTHER_USER = 'usr_Bn3x8L';

const SIX_HOURS = TIME.expires - TIME.delegated;
/**
 * The agent's keys. Each User ID has its own delegated key and delegation (5.2: one User ID per
 * delegated key), so your key at example.com is not your key at shoes.example, and not another
 * User's key at example.com. 9E421cSq is the thumbprint in the spec's example; each delegation
 * lasts six hours, as the spec's example does.
 */
export const AGENT_SIGNER: Signer = {
  client: AGENT,
  published: PUBLISHED.agent,
  byUser: {
    [USER_IDS['example.com']]: { key: '9E421cSq', delegation: delegate(AGENT, PUBLISHED.agent, '9E421cSq', TIME.delegated, SIX_HOURS, 'Dl1x7yQb') },
    [USER_IDS['shoes.example']]: { key: 'Lp0wF2Ux', delegation: delegate(AGENT, PUBLISHED.agent, 'Lp0wF2Ux', TIME.delegated, SIX_HOURS, 'Hs4mE9cV') },
    [OTHER_USER]: { key: 'Zc81Nn4e', delegation: delegate(AGENT, PUBLISHED.agent, 'Zc81Nn4e', TIME.delegated, SIX_HOURS, 'Qa2uR6tJ') },
  },
};
/** The thief's own keys: a valid chain, under its own name. */
export const THIEF_SIGNER: Signer = {
  client: THIEF,
  published: PUBLISHED.thief,
  byUser: { usr_thief: { key: 'Wd5yH1oB', delegation: delegate(THIEF, PUBLISHED.thief, 'Wd5yH1oB', TIME.delegated, SIX_HOURS, 'Km7pL3sX') } },
};

// ---------------------------------------------------------------- 5.2 The Session JWT

/**
 * A Session JWT (5.2): chapter 1's claims (iss, aud, sid, sub, htm, htu, ath) with its header and
 * the claims that chapter left out: typ, kid (the signing key's thumbprint), poppy_dlg (its
 * delegation), iat and jti, and the optional agent_id. `signedBy` stands in for the signature.
 */
export type Seal = {
  typ: string;
  kid: string;
  poppy_dlg?: Delegation;
  iss: string;
  aud: string;
  sid: string;
  sub: string;
  agent_id?: string;
  htm: string;
  htu: string;
  iat: number;
  jti: string;
  ath?: string;
  signedBy: string;
};
/** A request as the Company receives it: method, URL, and the Session header and access token it carries. */
export type Request = { method: string; url: string; session?: Seal; token?: AccessToken };

/**
 * A Session JWT signed with `key`, carrying `delegation` (or none), with no rule checked: what anyone
 * holding a key can write. The claims come from chapter 1's `sign`, then this chapter's are added.
 */
export function seal(
  signer: { client: { clientId: string } },
  key: string,
  delegation: Delegation | undefined,
  request: { method: string; url: string; token?: AccessToken },
  o: { company: { domain: string; issuer?: string }; sub: string; sid: string; iat: number; jti: string; agentId?: string },
): Seal {
  const { key: _vouched, ...claims } = sign(signer.client, request, o.sub, o.sid);
  return {
    typ: 'poppy-session+jwt', kid: key, ...(delegation ? { poppy_dlg: delegation } : {}),
    ...claims, aud: identifierOf(o.company), ...(o.agentId ? { agent_id: o.agentId } : {}), iat: o.iat, jti: o.jti, signedBy: key,
  };
}

/**
 * The Session JWT a well-behaved agent signs for one request (5.2), or why it will not:
 * - it signs with the delegated key for this User ID, never with a published key, and each
 *   delegated key only for its one User ID;
 * - it never signs after the delegation's exp;
 * - it sends no access token in a Session that uses an anonymous browsing User ID (5.1, 5.4).
 */
export function sealRequest(
  signer: Signer,
  request: { method: string; url: string; token?: AccessToken },
  o: { company: { domain: string; issuer?: string }; sub: string; sid: string; now: number; jti: string; agentId?: string; anonymous?: boolean },
): Seal | Refusal {
  const held = signer.byUser[o.sub];
  if (!held && !o.anonymous) return refuse(`the agent holds no delegated key for ${o.sub}`);
  if (o.anonymous && request.token) return refuse('a Session with an anonymous User ID carries no access token');
  const use = held ?? anonymousKey(signer, o.sub, o.now);
  if (o.now >= use.delegation.exp) return refuse(`the delegation for key ${use.key} expired at ${clock(use.delegation.exp)}, so the agent gets a new one first`);
  return seal(signer, use.key, use.delegation, request, { ...o, iat: o.now });
}

/**
 * A User ID for one anonymous browsing session (5.1): new each time, used for nothing else, and,
 * like every User ID, with a delegated key of its own (5.2). `n` counts the browsing sessions; a
 * real agent picks the ID at random.
 */
export const anonymousUserId = (n: number) => `usr_anon${n}`;
const anonymousKey = (signer: Signer, sub: string, now: number): Held => {
  const key = `anon-${sub.slice(4)}`;
  return { key, delegation: delegate(signer.client, signer.published, key, now, 60 * 60, `dlg-${sub.slice(4)}`) };
};

// ---------------------------------------------------------------- 5.3 Verifying the Session header

/**
 * The checks, in the order 5.2 and 5.3 give them, with the copy each one stops. `may` marks the two
 * a Company MAY make (a reused jti; a delegated key that signed for another User ID); the rest it MUST.
 */
export type CheckId = 'header' | 'client' | 'delegation' | 'signature' | 'typ' | 'aud' | 'request' | 'time' | 'token' | 'replay' | 'one-user';
export type Check = { id: CheckId; section: string; may: boolean; asks: string; stops: string };
export const CHECKS: readonly Check[] = [
  { id: 'header', section: '5.3', may: false, asks: 'Is there a Session header?', stops: 'a request that leaves the header out' },
  { id: 'client', section: '4.1', may: false, asks: 'Does iss return client metadata naming itself?', stops: 'a client_id that is not the address of its own keys' },
  { id: 'delegation', section: '5.2', may: false, asks: 'Did a key iss publishes sign an unexpired delegation of at most 24 hours?', stops: 'a header signed directly by a published key, a delegation under someone else’s key, and a leaked delegated key after its delegation expires' },
  { id: 'signature', section: '5.2', may: false, asks: 'Did the delegated key sign the header?', stops: 'a header signed by a key the delegation does not name' },
  { id: 'typ', section: '5.2', may: false, asks: 'Is it typed poppy-session+jwt?', stops: 'a delegation or another JWT passed off as a Session JWT' },
  { id: 'aud', section: '10.4', may: false, asks: 'Is aud this Company’s identifier?', stops: 'a header another Company collected and replays here' },
  { id: 'request', section: '5.3', may: false, asks: 'Do htm and htu match this method and URL?', stops: 'a copied header sent to another URL' },
  { id: 'time', section: '5.3', may: false, asks: 'Was iat within the last minute?', stops: 'a copied header sent again later' },
  { id: 'token', section: '5.3', may: false, asks: 'Does ath match the token, issued to iss?', stops: 'a copied access token under another agent’s signature' },
  { id: 'replay', section: '5.3', may: true, asks: 'Is the jti new?', stops: 'an exact copy sent again within the minute' },
  { id: 'one-user', section: '5.2', may: true, asks: 'Has this delegated key signed only for this User ID?', stops: 'a leaked delegated key used for another User' },
];

/** Whether the Company makes the two checks it MAY make: remembering jtis, and which User ID each delegated key signed for. */
export type Policy = 'remembers' | 'required';
/** What a Company that remembers has seen: the jtis of verified headers, and the User ID each delegated key signed for. */
export type Memory = { jtis: readonly string[]; keyUser: Readonly<Record<string, string>> };
export const FORGETFUL: Memory = { jtis: [], keyUser: {} };

/** The Company's verdict: its answer, the checks the header passed, and the one it failed. */
export type Verdict = { answer: Answer; passed: readonly CheckId[]; failed: CheckId | null };

const pathOf = (url: string) => url.replace(/^https:\/\/[^/]+/, '');

/**
 * What example.com answers to one request at time `now` (5.2, 5.3), the checks in the spec's order:
 * 1. a Session header is present (every operation here uses Session claims);
 * 2. the client metadata at iss, and its keys (4.1);
 * 3. the delegation: present (a header signed directly by a published key has none), signed by
 *    the key in iss's jwks_uri its kid names, typed poppy-delegation+jwt, with the token's iss,
 *    unexpired, and lasting at most 24 hours;
 * 4. the header's signature, by the key in cnf.jwk, and its kid that key's thumbprint;
 * 5. typ, aud (character for character), htm and htu, iat within the window;
 * 6. with an access token, ath is its hash and the token was issued to iss; without one, no ath;
 * 7. if the Company remembers: a jti it has not seen, and a delegated key that has signed for no
 *    other User ID while its delegation lasts.
 * A failure is 400 invalid_session with the reason. A verified header then goes to chapter 1's
 * `answer`, which decides the account: the header never grants account access (5.3).
 * Left out: the iat window's choice (fixed at one minute), the cache of verified delegations,
 * Session lookup and ended Sessions (5.5), and the access token's own validation beyond chapter 1's.
 */
export function receive(request: Request, now: number, policy: Policy, memory: Memory = FORGETFUL): Verdict {
  const passed: CheckId[] = [];
  const fail = (failed: CheckId, reason: string): Verdict => ({ answer: { status: 400, error: 'invalid_session', reason }, passed, failed });
  const pass = (id: CheckId) => passed.push(id);
  const s = request.session, token = request.token;

  if (!s) return fail('header', 'the request has no Session header');
  pass('header');

  const client = fetchClient(s.iss);
  if (isRefusal(client)) return fail('client', client.reason!);
  pass('client');

  const d = s.poppy_dlg, name = hostOf(s.iss);
  if (!d) return fail('delegation', client.keys.includes(s.signedBy) ? `the header carries no delegation: a key ${name} publishes signed it directly` : 'the header carries no delegation');
  if (!client.keys.includes(d.kid)) return fail('delegation', `the delegation names key ${d.kid}, which ${name} does not publish`);
  if (d.signedBy !== d.kid) return fail('delegation', `the delegation's signature does not verify with key ${d.kid}`);
  if (d.typ !== 'poppy-delegation+jwt') return fail('delegation', `the delegation is typed ${d.typ}`);
  if (d.iss !== s.iss) return fail('delegation', `the delegation was issued by ${d.iss}, and the header names ${s.iss}`);
  if (now >= d.exp) return fail('delegation', `the delegation expired at ${clock(d.exp)}, and it is ${clock(now)}`);
  if (d.exp - d.iat > MAX_DELEGATION) return fail('delegation', 'the delegation lasts more than 24 hours');
  pass('delegation');

  if (s.signedBy !== d.cnf.jwk || s.kid !== d.cnf.jwk) return fail('signature', `the header was not signed by key ${d.cnf.jwk}, the one its delegation vouches for`);
  pass('signature');

  if (s.typ !== 'poppy-session+jwt') return fail('typ', `the JWT is typed ${s.typ}`);
  pass('typ');

  if (s.aud !== identifierOf(COMPANY)) return fail('aud', `the header is addressed to ${s.aud}, and this is ${identifierOf(COMPANY)}`);
  pass('aud');

  if (s.htm !== request.method || s.htu !== request.url) return fail('request', `the header was signed for ${s.htm} ${pathOf(s.htu)}, and this is ${request.method} ${pathOf(request.url)}`);
  pass('request');

  if (Math.abs(now - s.iat) > WINDOW) return fail('time', `the header was signed at ${clock(s.iat)}, ${now - s.iat} s before ${clock(now)}, outside the ${WINDOW} s window`);
  pass('time');

  if (token && s.ath !== hashOf(token)) return fail('token', 'the header’s ath is not the hash of this access token');
  if (!token && s.ath !== undefined) return fail('token', 'the header covers an access token the request does not carry');
  if (token && token.client !== s.iss) return fail('token', `the access token was issued to ${hostOf(token.client)}, and the header is signed for ${name}`);
  pass('token');

  if (policy === 'remembers') {
    if (memory.jtis.includes(s.jti)) return fail('replay', `jti ${s.jti} has been seen already, so this is a copy`);
    pass('replay');
    const before = memory.keyUser[s.kid];
    if (before !== undefined && before !== s.sub) return fail('one-user', `key ${s.kid} has already signed for ${before}`);
    pass('one-user');
  }

  // Verified: what the account allows is chapter 1's `answer`, given a header whose signer it trusts.
  const vouched: HttpRequest = {
    method: request.method, url: request.url, ...(token ? { token } : {}),
    session: { iss: s.iss, aud: s.aud, sid: s.sid, sub: s.sub, htm: s.htm, htu: s.htu, ...(s.ath ? { ath: s.ath } : {}), key: s.iss },
  };
  return { answer: answer(vouched), passed, failed: null };
}

/** What a Company that remembers keeps from a verified header; it keeps nothing from one that failed. */
export function remember(memory: Memory, request: Request, verdict: Verdict): Memory {
  const s = request.session;
  if (verdict.failed || !s) return memory;
  return { jtis: memory.jtis.includes(s.jti) ? memory.jtis : [...memory.jtis, s.jti], keyUser: { [s.kid]: s.sub, ...memory.keyUser } };
}

// ---------------------------------------------------------------- The tampering machine

/** The access token the agent holds for you at example.com: issued to the agent, for both scopes (4.7). */
export const TOKEN: AccessToken = { value: 'at_Qp4w', client: AGENT.clientId, scopes: SCOPES };

/** The agent's genuine request: the jacket exchange, signed in, sealed at the spec's iat with the spec's jti. */
export function genuine(): Request {
  const op = OPERATIONS.exchange, base = { method: op.method, url: op.url, token: TOKEN };
  const s = sealRequest(AGENT_SIGNER, base, { company: COMPANY, sub: USER_IDS['example.com'], sid: SID, now: TIME.signed, jti: 'e1j3V_bK' });
  if (isRefusal(s)) throw new Error(s.reason);
  return { ...base, session: s };
}

/**
 * What the reader can send: the genuine request, or one thing changed. Each is a copy or a forgery
 * someone could really attempt, and each meets a different check.
 */
export type Tamper = 'send' | 'replay' | 'late' | 'url' | 'aud' | 'thief' | 'published' | 'expired' | 'other-user';
/** Every tamper, in the order the player shows its buttons. */
export const TAMPERS: readonly Tamper[] = ['send', 'replay', 'late', 'url', 'aud', 'thief', 'published', 'expired', 'other-user'];
/** The tampers made from the genuine request as it travelled, so nothing exists to copy before it is sent. */
const COPIES: readonly Tamper[] = ['replay', 'late', 'url', 'thief'];

/** The request a tamper sends, and when it arrives. */
export function attempt(tamper: Tamper): { request: Request; now: number; by: 'agent' | 'thief' | 'shoes.example' } {
  const g = genuine(), at = (k: OperationKey) => ({ method: OPERATIONS[k].method, url: OPERATIONS[k].url });
  const leaked = AGENT_SIGNER.byUser[USER_IDS['example.com']]!;
  switch (tamper) {
    case 'send':
      return { request: g, now: TIME.signed + 1, by: 'agent' };
    // The same bytes again, ten seconds later: inside the window.
    case 'replay':
      return { request: g, now: TIME.signed + 10, by: 'thief' };
    // The same bytes again, two minutes later.
    case 'late':
      return { request: g, now: TIME.signed + 120, by: 'thief' };
    // The header and token, copied, sent to read the order instead.
    case 'url':
      return { request: { ...g, ...at('order') }, now: TIME.signed + 5, by: 'thief' };
    // 10.4: shoes.example's own documents named example.com's cart URL, so the agent signed for that
    // URL with aud shoes.example; shoes.example replays it at example.com.
    case 'aud': {
      const base = at('cart');
      const s = sealRequest(AGENT_SIGNER, base, { company: OTHER_COMPANY, sub: USER_IDS['shoes.example'], sid: 'Mr4aT0', now: TIME.signed, jti: 'p9Xc2hWe' });
      if (isRefusal(s)) throw new Error(s.reason);
      return { request: { ...base, session: s }, now: TIME.signed + 5, by: 'shoes.example' };
    }
    // The access token, copied, under a header the thief signs with its own valid chain.
    case 'thief': {
      const base = { ...at('exchange'), token: TOKEN };
      const s = sealRequest(THIEF_SIGNER, base, { company: COMPANY, sub: 'usr_thief', sid: 'Tq0zZ1', now: TIME.signed + 5, jti: 'b7Ru4kMn' });
      if (isRefusal(s)) throw new Error(s.reason);
      return { request: { ...base, session: s }, now: TIME.signed + 5, by: 'thief' };
    }
    // An agent that signs its header directly with its published key, and no delegation.
    case 'published': {
      const base = { ...at('exchange'), token: TOKEN };
      const s = seal(AGENT_SIGNER, PUBLISHED.agent, undefined, base, { company: COMPANY, sub: USER_IDS['example.com'], sid: SID, iat: TIME.signed + 20, jti: 'f2Wq8eLs' });
      return { request: { ...base, session: s }, now: TIME.signed + 20, by: 'agent' };
    }
    // Your leaked delegated key, used at 07:00, an hour after its delegation expired. The thief has
    // no access token, so it can only try what a signed-out request can.
    case 'expired': {
      const base = at('exchange'), now = TIME.expires + 3600;
      return { request: { ...base, session: seal(AGENT_SIGNER, leaked.key, leaked.delegation, base, { company: COMPANY, sub: USER_IDS['example.com'], sid: SID, iat: now, jti: 'n5Gd0aYi' }) }, now, by: 'thief' };
    }
    // Your leaked delegated key, while its delegation lasts, signing for another User of the agent.
    case 'other-user': {
      const base = at('exchange'), now = TIME.signed + 60;
      return { request: { ...base, session: seal(AGENT_SIGNER, leaked.key, leaked.delegation, base, { company: COMPANY, sub: OTHER_USER, sid: 'Ub6wQ3', iat: now, jti: 'r3Kv7oPz' }) }, now, by: 'thief' };
    }
  }
}

/**
 * The world between the agent and example.com: whether the Company makes its two optional checks,
 * whether the agent has sent its genuine request, what a Company that remembers has kept, and the
 * last attempt with its verdict.
 */
export type SealWorld = { policy: Policy; sent: boolean; memory: Memory; last: { tamper: Tamper; verdict: Verdict } | null };

export const start = (policy: Policy): SealWorld => ({ policy, sent: false, memory: FORGETFUL, last: null });

/** The world after a tamper, or why it cannot happen, written to follow the tamper's name. */
export function next(w: SealWorld, tamper: Tamper): SealWorld | Refusal {
  // 5.2: a Session JWT is signed for one request, so the agent sends its exchange once.
  if (tamper === 'send' && w.sent) return refuse('the agent has sent the exchange already, and it seals each request once');
  if (COPIES.includes(tamper) && !w.sent) return refuse('the agent has sent nothing yet, so there is nothing to copy');
  const { request, now } = attempt(tamper);
  const verdict = receive(request, now, w.policy, w.memory);
  return {
    ...w,
    sent: w.sent || tamper === 'send',
    memory: w.policy === 'remembers' ? remember(w.memory, request, verdict) : w.memory,
    last: { tamper, verdict },
  };
}

/** The rule of the draft that decided a verdict: its section, and the copy the check stops. */
export function ruleOf(last: SealWorld['last']): { section: string; says: string } {
  if (!last) return { section: '5.3', says: 'The Company verifies the Session header before it relies on anything in it.' };
  const { failed, answer: a } = last.verdict;
  if (failed) {
    const check = CHECKS.find((c) => c.id === failed)!;
    return { section: check.section, says: `This check stops ${check.stops}.` };
  }
  if (a.status === 401) return { section: '5.3', says: 'A verified Session header grants no account access, whatever it holds.' };
  return { section: '5.3', says: 'Every check passed: this agent, this User ID, this Company, this request, now.' };
}

/** The tampers of the story, in order: what the steps replay. */
export const STORY: readonly Tamper[] = ['send', 'url', 'aud', 'thief', 'published', 'replay', 'late', 'expired', 'other-user'];
