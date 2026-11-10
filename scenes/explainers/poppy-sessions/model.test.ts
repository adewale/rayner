import test from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal } from '../../../explain/index.ts';
import { OPERATIONS, answer as chapterOneAnswer } from '../poppy/model.ts';
import {
  AGENT, AGENT_SIGNER, CHECKS, CLIENT_METADATA, COMPANY, FORGETFUL, MAX_DELEGATION, OTHER_COMPANY, OTHER_USER, PUBLISHED, SID, STORY, TAMPERS,
  THIEF, THIEF_SIGNER, TIME, TOKEN, USER_IDS, WINDOW,
  anonymousUserId, attempt, clock, delegate, fetchClient, genuine, identifierOf, next, receive, remember, ruleOf, seal, sealRequest, start,
  type CheckId, type Policy, type Request, type SealWorld, type Tamper,
} from './model.ts';

// Each test names the section of the Personal Agent Protocol draft 0.4 it holds the model to
// (https://personalagentprotocol.org/docs/0.4/spec). The specification was read, not run: there is
// no reference implementation here, and no real cryptography (a signature is the name of the key
// that made it), so these pin the model to the draft's rules and examples.

const failure = (r: Request, now: number, policy: Policy = 'required', memory = FORGETFUL) => {
  const v = receive(r, now, policy, memory);
  return v.failed ? `${v.failed}: ${v.answer.reason}` : `${v.answer.status}`;
};
const play = (policy: Policy, tampers: readonly Tamper[]) =>
  tampers.reduce<SealWorld>((w, t) => {
    const after = next(w, t);
    assert.ok(!isRefusal(after), `${t} was refused: ${isRefusal(after) ? after.reason : ''}`);
    return after as SealWorld;
  }, start(policy));
const lastFailed = (w: SealWorld) => w.last?.verdict.failed ?? null;
const ex = OPERATIONS.exchange, now = TIME.signed + 1;

test('4.1: the client_id is an HTTPS URL that returns metadata naming itself, with keys on the same domain', () => {
  assert.deepEqual(fetchClient(AGENT.clientId), CLIENT_METADATA[AGENT.clientId]);
  assert.deepEqual(fetchClient(AGENT.clientId), { client_id: 'https://agent.example/agent.json', jwks_uri: 'https://agent.example/jwks.json', keys: ['qijAJ9BU'] });
  const reason = (iss: string, docs = CLIENT_METADATA) => { const r = fetchClient(iss, docs); return isRefusal(r) ? r.reason : 'ok'; };
  assert.equal(reason('http://agent.example/agent.json'), 'iss http://agent.example/agent.json is not an HTTPS URL');
  assert.equal(reason('https://nobody.example/agent.json'), 'nothing at https://nobody.example/agent.json describes a client');
  const mirror = { 'https://mirror.example/agent.json': CLIENT_METADATA[AGENT.clientId]! };
  assert.equal(reason('https://mirror.example/agent.json', mirror), 'the document at https://mirror.example/agent.json names another client_id, https://agent.example/agent.json');
  const elsewhere = { [AGENT.clientId]: { ...CLIENT_METADATA[AGENT.clientId]!, jwks_uri: 'https://keys.example/jwks.json' } };
  assert.equal(reason(AGENT.clientId, elsewhere), 'its jwks_uri is not an HTTPS URL on agent.example');
});

test('3.2 and 5.2: aud is the issuer when there is one, else https:// and the domain in lowercase', () => {
  assert.equal(identifierOf(COMPANY), 'https://auth.example.com');
  assert.equal(identifierOf(OTHER_COMPANY), 'https://auth.shoes.example');
  assert.equal(identifierOf({ domain: 'Shop.Example' }), 'https://shop.example');
});

test('5.2: the spec’s delegation: issued by the agent, signed by a published key, six hours, and nothing about the User or Company', () => {
  const held = AGENT_SIGNER.byUser[USER_IDS['example.com']]!;
  assert.deepEqual(held.delegation, {
    typ: 'poppy-delegation+jwt', kid: 'qijAJ9BU', iss: 'https://agent.example/agent.json', cnf: { jwk: '9E421cSq' },
    iat: 1790899200, exp: 1790920800, jti: 'Dl1x7yQb', signedBy: 'qijAJ9BU',
  });
  assert.ok(held.delegation.exp - held.delegation.iat <= MAX_DELEGATION);
  // 5.2: no User ID, Agent ID, Company issuer, or anything about them, in any delegation.
  for (const { delegation } of Object.values(AGENT_SIGNER.byUser)) {
    const text = JSON.stringify(delegation);
    for (const secret of [...Object.values(USER_IDS), OTHER_USER, COMPANY.issuer, COMPANY.domain, OTHER_COMPANY.issuer, OTHER_COMPANY.domain]) assert.ok(!text.includes(secret), secret);
  }
});

test('5.2: a Session JWT binds iss, aud, sid, sub, htm, htu, iat, jti and ath, signed by the delegated key and carrying its delegation', () => {
  const g = genuine(), held = AGENT_SIGNER.byUser['usr_Q7c1vK']!;
  assert.deepEqual(g.session, {
    typ: 'poppy-session+jwt', kid: '9E421cSq', poppy_dlg: held.delegation,
    iss: 'https://agent.example/agent.json', aud: 'https://auth.example.com', sid: SID, sub: 'usr_Q7c1vK',
    htm: 'POST', htu: 'https://api.example.com/orders/ord_7Hk2/exchanges', iat: 1790900000, jti: 'e1j3V_bK', ath: 'ath(at_Qp4w)', signedBy: '9E421cSq',
  });
  const out = sealRequest(AGENT_SIGNER, { method: 'POST', url: OPERATIONS.cart.url }, { company: COMPANY, sub: 'usr_Q7c1vK', sid: SID, now, jti: 'x' });
  assert.ok(!isRefusal(out) && !('ath' in out), 'ath is left out when the request carries no access token');
  const withAgent = sealRequest(AGENT_SIGNER, { method: 'POST', url: OPERATIONS.cart.url }, { company: COMPANY, sub: 'usr_Q7c1vK', sid: SID, now, jti: 'x', agentId: 'agt_s8Lw' });
  assert.ok(!isRefusal(withAgent) && withAgent.agent_id === 'agt_s8Lw', 'agent_id is the one optional claim');
});

test('5.2 and 5.3: the genuine request passes every check, in the spec’s order, and chapter 1 decides the account', () => {
  const v = receive(genuine(), now, 'remembers');
  assert.deepEqual(v, { answer: { status: 200 }, passed: CHECKS.map((c) => c.id), failed: null });
  assert.deepEqual(receive(genuine(), now, 'required').passed, CHECKS.filter((c) => !c.may).map((c) => c.id));
  assert.deepEqual(CHECKS.map((c) => c.id), ['header', 'client', 'delegation', 'signature', 'typ', 'aud', 'request', 'time', 'token', 'replay', 'one-user']);
});

test('5.3: a copied header sent to another URL is refused by htm and htu', () => {
  const g = genuine();
  assert.equal(failure({ ...g, method: 'GET', url: OPERATIONS.order.url }, now), 'request: the header was signed for POST /orders/ord_7Hk2/exchanges, and this is GET /orders/ord_7Hk2');
  // Chapter 1's model accepts the same header with any key that matches; this one checks the request first.
  assert.equal(failure({ ...g, url: OPERATIONS.cart.url }, now), 'request: the header was signed for POST /orders/ord_7Hk2/exchanges, and this is POST /cart');
});

test('10.4: a header addressed to another Company is refused, though every signature is genuine', () => {
  const { request, now: at } = attempt('aud');
  assert.equal(request.session!.htu, OPERATIONS.cart.url, 'shoes.example’s documents named example.com’s URL, which nobody checks');
  assert.equal(failure(request, at), 'aud: the header is addressed to https://auth.shoes.example, and this is https://auth.example.com');
  assert.deepEqual(receive(request, at, 'required').passed, ['header', 'client', 'delegation', 'signature', 'typ']);
});

test('5.3: a copied access token under another agent’s header is refused: the token was issued to the agent that must sign', () => {
  const { request, now: at } = attempt('thief');
  assert.equal(request.session!.iss, THIEF.clientId);
  assert.equal(failure(request, at), 'token: the access token was issued to agent.example, and the header is signed for thief.example');
  // A genuine header beside a different token: ath does not match.
  assert.equal(failure({ ...genuine(), token: { ...TOKEN, value: 'at_Zz9y' } }, now), 'token: the header’s ath is not the hash of this access token');
  // A header that covers a token the request leaves out.
  const { token: _dropped, ...bare } = genuine();
  assert.equal(failure(bare, now), 'token: the header covers an access token the request does not carry');
});

test('5.2: a header signed directly by a published key, or vouched for by a key iss does not publish, is refused at the delegation', () => {
  const { request, now: at } = attempt('published');
  assert.equal(failure(request, at), 'delegation: the header carries no delegation: a key agent.example publishes signed it directly');
  // The thief names agent.example in iss but can only offer its own delegation.
  const own = THIEF_SIGNER.byUser['usr_thief']!;
  const lie = seal(AGENT_SIGNER, own.key, own.delegation, { method: ex.method, url: ex.url, token: TOKEN }, { company: COMPANY, sub: 'usr_Q7c1vK', sid: SID, iat: now, jti: 'q' });
  assert.equal(failure({ method: ex.method, url: ex.url, token: TOKEN, session: lie }, now), `delegation: the delegation names key ${PUBLISHED.thief}, which agent.example does not publish`);
});

test('5.2: the delegation must be signed by its kid, typed, from the same iss, unexpired and at most 24 hours long', () => {
  const held = AGENT_SIGNER.byUser['usr_Q7c1vK']!, base = { method: ex.method, url: ex.url, token: TOKEN };
  const with_ = (delegation: typeof held.delegation, at = now) =>
    failure({ ...base, session: seal(AGENT_SIGNER, held.key, delegation, base, { company: COMPANY, sub: 'usr_Q7c1vK', sid: SID, iat: at, jti: 'd' }) }, at);
  assert.equal(with_({ ...held.delegation, signedBy: 'someone' }), 'delegation: the delegation\'s signature does not verify with key qijAJ9BU');
  assert.equal(with_({ ...held.delegation, typ: 'poppy-session+jwt' }), 'delegation: the delegation is typed poppy-session+jwt');
  assert.equal(with_({ ...held.delegation, iss: THIEF.clientId }), 'delegation: the delegation was issued by https://thief.example/agent.json, and the header names https://agent.example/agent.json');
  assert.equal(with_(held.delegation, TIME.expires), 'delegation: the delegation expired at 06:00:00, and it is 06:00:00');
  assert.equal(with_(delegate(AGENT, PUBLISHED.agent, held.key, TIME.delegated, MAX_DELEGATION + 1, 'long')), 'delegation: the delegation lasts more than 24 hours');
  assert.equal(with_(delegate(AGENT, PUBLISHED.agent, held.key, TIME.delegated, MAX_DELEGATION, 'day')), '200', 'exactly 24 hours is allowed');
  // The signature check comes after: a header signed by a key the delegation does not name.
  const other = AGENT_SIGNER.byUser[OTHER_USER]!;
  assert.equal(failure({ ...base, session: { ...genuine().session!, poppy_dlg: other.delegation } }, now), 'signature: the header was not signed by key Zc81Nn4e, the one its delegation vouches for');
  assert.equal(failure({ ...base, session: { ...genuine().session!, typ: 'poppy-delegation+jwt' } }, now), 'typ: the JWT is typed poppy-delegation+jwt');
});

test('10.7: a leaked delegated key stops working when its delegation expires', () => {
  const { request, now: at } = attempt('expired');
  assert.equal(clock(at), '07:00:00');
  assert.equal(failure(request, at), 'delegation: the delegation expired at 06:00:00, and it is 07:00:00');
  // The agent itself never signs after exp (5.2).
  const late = sealRequest(AGENT_SIGNER, { method: ex.method, url: ex.url }, { company: COMPANY, sub: 'usr_Q7c1vK', sid: SID, now: TIME.expires, jti: 'z' });
  assert.ok(isRefusal(late) && late.reason === 'the delegation for key 9E421cSq expired at 06:00:00, so the agent gets a new one first');
});

test('5.3: iat must be within the window: a copy sent two minutes later is refused, ten seconds later is not by that check', () => {
  assert.equal(WINDOW, 60);
  assert.equal(failure(genuine(), TIME.signed + 120), 'time: the header was signed at 00:13:20, 120 s before 00:15:20, outside the 60 s window');
  assert.equal(failure(genuine(), TIME.signed + 60), '200');
});

test('5.3: a Company that remembers jtis refuses an exact copy within the minute; one that does not accepts it', () => {
  const g = genuine(), first = receive(g, now, 'remembers');
  const memory = remember(FORGETFUL, g, first);
  assert.deepEqual(memory, { jtis: ['e1j3V_bK'], keyUser: { '9E421cSq': 'usr_Q7c1vK' } });
  assert.equal(failure(g, TIME.signed + 10, 'remembers', memory), 'replay: jti e1j3V_bK has been seen already, so this is a copy');
  assert.equal(failure(g, TIME.signed + 10, 'required', memory), '200');
  assert.deepEqual(remember(memory, g, receive(g, TIME.signed + 10, 'remembers', memory)), memory, 'a failed header teaches the Company nothing');
});

test('5.2 and 10.7: one delegated key per User ID; a leaked key used for another User is refused where the Company remembers, and never opens an account', () => {
  const keys = Object.values(AGENT_SIGNER.byUser).map((h) => h.key);
  assert.equal(new Set(keys).size, keys.length, 'each User ID has its own delegated key');
  assert.notEqual(AGENT_SIGNER.byUser[USER_IDS['example.com']]!.key, AGENT_SIGNER.byUser[USER_IDS['shoes.example']]!.key, 'so two Companies cannot match you by thumbprint');
  const { request, now: at } = attempt('other-user'), memory = remember(FORGETFUL, genuine(), receive(genuine(), now, 'remembers'));
  assert.equal(failure(request, at, 'remembers', memory), 'one-user: key 9E421cSq has already signed for usr_Q7c1vK');
  // Where it is accepted, it acts as that User signed out: a Session header grants no account access (5.3).
  assert.deepEqual(receive(request, at, 'required').answer, { status: 401, needs: 'orders:write' });
  assert.deepEqual(receive(request, at, 'remembers').answer, { status: 401, needs: 'orders:write' });
});

test('5.1: User IDs are pairwise, stable per Company and opaque; an anonymous User ID is new each time and carries no access token', () => {
  assert.notEqual(USER_IDS['example.com'], USER_IDS['shoes.example']);
  for (const id of [...Object.values(USER_IDS), OTHER_USER]) assert.match(id, /^usr_[A-Za-z0-9]{6}$/);
  assert.equal(genuine().session!.sub, genuine().session!.sub, 'the same User ID on every request');
  assert.notEqual(anonymousUserId(1), anonymousUserId(2));
  const base = { method: ex.method, url: ex.url };
  const anon = sealRequest(AGENT_SIGNER, base, { company: COMPANY, sub: anonymousUserId(1), sid: 'An0n1x', now, jti: 'a', anonymous: true });
  assert.ok(!isRefusal(anon) && anon.sub === 'usr_anon1' && anon.kid !== AGENT_SIGNER.byUser['usr_Q7c1vK']!.key, 'with a delegated key of its own');
  const signedIn = sealRequest(AGENT_SIGNER, { ...base, token: TOKEN }, { company: COMPANY, sub: anonymousUserId(1), sid: 'An0n1x', now, jti: 'a', anonymous: true });
  assert.ok(isRefusal(signedIn) && signedIn.reason === 'a Session with an anonymous User ID carries no access token');
  const unknown = sealRequest(AGENT_SIGNER, base, { company: COMPANY, sub: 'usr_nobody', sid: 'x', now, jti: 'a' });
  assert.ok(isRefusal(unknown) && unknown.reason === 'the agent holds no delegated key for usr_nobody');
});

test('5.3: no header at all is refused, and the header never grants account access by itself', () => {
  const { session: _none, ...bare } = genuine();
  assert.equal(failure(bare, now), 'header: the request has no Session header');
  const signedOut = sealRequest(AGENT_SIGNER, { method: ex.method, url: ex.url }, { company: COMPANY, sub: 'usr_Q7c1vK', sid: SID, now, jti: 'so' });
  assert.ok(!isRefusal(signedOut));
  assert.deepEqual(receive({ method: ex.method, url: ex.url, session: signedOut }, now, 'remembers').answer, { status: 401, needs: 'orders:write' });
  assert.deepEqual(chapterOneAnswer({ method: ex.method, url: ex.url }), { status: 400, error: 'invalid_session', reason: 'the request has no Session header' }, 'chapter 1 agrees');
});

test('the story: each tamper meets the check the spec gives for it, under both policies', () => {
  const failedAt = (policy: Policy) => STORY.map((_, i) => lastFailed(play(policy, STORY.slice(0, i + 1))));
  assert.deepEqual(failedAt('remembers'), [null, 'request', 'aud', 'token', 'delegation', 'replay', 'time', 'delegation', 'one-user'] satisfies (CheckId | null)[]);
  assert.deepEqual(failedAt('required'), [null, 'request', 'aud', 'token', 'delegation', null, 'time', 'delegation', null] satisfies (CheckId | null)[]);
  const end = play('required', STORY);
  assert.deepEqual(end.last!.verdict.answer, { status: 401, needs: 'orders:write' });
});

test('every refusal says why, and each tamper is refused or taken as the state decides', () => {
  const reasonOf = (w: SealWorld, t: Tamper) => { const n = next(w, t); return isRefusal(n) ? n.reason : null; };
  const nothing = 'the agent has sent nothing yet, so there is nothing to copy';
  assert.deepEqual(TAMPERS.map((t) => reasonOf(start('remembers'), t)), [null, nothing, nothing, nothing, null, nothing, null, null, null]);
  assert.deepEqual(TAMPERS.map((t) => reasonOf(play('remembers', ['send']), t)), ['the agent has sent the exchange already, and it seals each request once', null, null, null, null, null, null, null, null]);
});

test('a remembering Company cannot tell which use of a key came first: the leaked key used first locks out the genuine request', () => {
  const w = play('remembers', ['other-user', 'send']);
  assert.equal(w.last!.verdict.answer.reason, `key 9E421cSq has already signed for ${OTHER_USER}`);
  assert.equal(w.sent, true);
});

test('every state the tampers reach leaves a tamper to press, and there are few of them', () => {
  for (const policy of ['remembers', 'required'] as const) {
    const seen = new Map<string, SealWorld>([[JSON.stringify(start(policy)), start(policy)]]);
    for (const queue = [start(policy)]; queue.length; ) {
      const w = queue.shift()!;
      const taken = TAMPERS.map((t) => next(w, t)).filter((n): n is SealWorld => !isRefusal(n));
      assert.ok(taken.length > 0);
      for (const n of taken) if (!seen.has(JSON.stringify(n))) { seen.set(JSON.stringify(n), n); queue.push(n); }
    }
    assert.ok(seen.size < 80, `${policy}: ${seen.size} states`);
  }
});

test('each verdict cites the section that decided it', () => {
  assert.equal(ruleOf(null).section, '5.3');
  const sections = STORY.map((_, i) => ruleOf(play('remembers', STORY.slice(0, i + 1)).last).section);
  assert.deepEqual(sections, ['5.3', '5.3', '10.4', '5.3', '5.2', '5.3', '5.3', '5.2', '5.2']);
  assert.match(ruleOf(play('required', STORY).last).says, /grants no account access/);
});
