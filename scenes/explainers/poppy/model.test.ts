import test from 'node:test';
import assert from 'node:assert/strict';
import { isRefusal } from '../../../explain/index.ts';
import {
  AGENT, COMPANY, ISSUER_METADATA, OPERATIONS, POPPY_EVENTS, POPPY_JSON, SCOPES, SID, STORY, THIEF, USER_IDS,
  agentRequest, answer, discover, hashOf, next, ruleOf, sign, start, thiefRequest, tokenOf,
  type AccessToken, type HttpRequest, type PoppyEvent, type Scope, type World,
} from './model.ts';

// Each test names the section of the Personal Agent Protocol draft 0.4 it holds the model to
// (https://personalagentprotocol.org/docs/0.4/spec). The specification was read, not run: there is
// no reference implementation here, so these pin the model to the draft's rules and examples.

const RW: readonly Scope[] = ['orders:read', 'orders:write'], RO: readonly Scope[] = ['orders:read'];
/** The world after these events, the agent having read poppy.json first. */
const play = (approves: readonly Scope[], events: readonly PoppyEvent[]) =>
  ['discover' as const, ...events.filter((e) => e !== 'discover')].reduce<World>((w, e) => {
    const after = next(w, e);
    assert.ok(!isRefusal(after), `${e} was refused: ${isRefusal(after) ? after.reason : ''}`);
    return after as World;
  }, start(approves));
const lastAnswer = (w: World) => (w.last?.kind === 'request' ? w.last.answer : undefined);
const token = (scopes: readonly Scope[], client = AGENT.clientId): AccessToken => ({ value: 'at_Qp4w', client, scopes });
/** The agent's own request for an operation, with a token of these scopes when given. */
const signed = (key: keyof typeof OPERATIONS, scopes?: readonly Scope[]): HttpRequest => {
  const op = OPERATIONS[key], base = { method: op.method, url: op.url, ...(scopes ? { token: token(scopes) } : {}) };
  return { ...base, session: sign(AGENT, base, USER_IDS[COMPANY.domain], SID) };
};

test('5.2: a Session JWT names the agent, the Company’s identifier, the Session, the User ID and the request', () => {
  const jwt = signed('exchange', RW).session!;
  assert.deepEqual(jwt, {
    iss: 'https://agent.example/agent.json',
    aud: 'https://auth.example.com',
    sid: SID,
    sub: 'usr_Q7c1vK',
    htm: 'POST',
    htu: 'https://api.example.com/orders/ord_7Hk2/exchanges',
    ath: hashOf(token(RW)),
    key: AGENT.clientId,
  });
  assert.equal('ath' in signed('cart').session!, false, 'ath is left out when the request carries no access token');
});

test('5.1: the User ID differs at each Company and holds nothing personal', () => {
  const ids = Object.values(USER_IDS);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^usr_[A-Za-z0-9]{6}$/);
});

test('section 7: signed out, an account operation gets 401 naming its scope, and a cart needs no account', () => {
  assert.deepEqual(answer(signed('cart')), { status: 200 });
  assert.deepEqual(answer(signed('browse')), { status: 204 });
  assert.deepEqual(answer(signed('chat')), { status: 201 });
  assert.deepEqual(answer(signed('order')), { status: 401, needs: 'orders:read' });
  assert.deepEqual(answer(signed('exchange')), { status: 401, needs: 'orders:write' });
});

test('section 7: a token without the scope gets 403 insufficient_scope naming it; with it, 200', () => {
  assert.deepEqual(answer(signed('exchange', RO)), { status: 403, error: 'insufficient_scope', needs: 'orders:write' });
  assert.deepEqual(answer(signed('order', RO)), { status: 200 });
  assert.deepEqual(answer(signed('exchange', RW)), { status: 200 });
  assert.deepEqual(answer({ ...signed('order', RO), token: { ...token(RO), revoked: true } }), { status: 401, error: 'invalid_token' });
});

test('5.3: a Session header never grants account access, whatever it holds', () => {
  for (const key of ['order', 'exchange'] as const) {
    const request = signed(key);
    for (const extra of [{}, { scope: 'orders:read orders:write' }, { account: 'A' }, { sub: 'owner-of-order-1042' }])
      assert.equal(answer({ ...request, session: { ...request.session!, ...extra } }).status, 401, JSON.stringify(extra));
  }
});

test('5.3: an access token is refused with invalid_session unless the agent it was issued to signed for it', () => {
  const good = signed('order', RW), reason = (r: HttpRequest) => { const a = answer(r); return `${a.status} ${a.error}: ${a.reason}`; };
  assert.equal(answer(good).status, 200);
  // No Session header at all.
  assert.equal(reason({ method: good.method, url: good.url, token: good.token! }), '400 invalid_session: the request has no Session header');
  // The thief signs as itself: the token was issued to another client.
  const own = { method: good.method, url: good.url, token: good.token! };
  assert.equal(reason({ ...own, session: sign(THIEF, own, 'usr_thief', 'sid_thief') }), '400 invalid_session: the access token was issued to another agent');
  // The thief names the agent in iss, but signs with its own key.
  assert.equal(reason({ ...good, session: { ...good.session!, key: THIEF.clientId } }), '400 invalid_session: the header was not signed with a key its named agent vouches for');
  // A genuine header, copied from a signed-out request to the same URL, does not cover the token.
  assert.equal(reason({ ...good, session: signed('order').session! }), '400 invalid_session: the header does not cover this access token');
  // A genuine header and token, copied to another URL.
  const elsewhere = OPERATIONS.exchange;
  assert.equal(reason({ ...good, method: elsewhere.method, url: elsewhere.url }), '400 invalid_session: the header was signed for another method or URL');
  // A genuine header addressed to another Company.
  assert.equal(reason({ ...good, session: { ...good.session!, aud: 'https://auth.shoes.example' } }), '400 invalid_session: the header is addressed to another Company');
  // A header that covers a token the request does not carry.
  assert.equal(reason({ method: good.method, url: good.url, session: good.session! }), '400 invalid_session: the header covers an access token the request does not carry');
});

test('the model leaves time out: a whole request copied unchanged is accepted, as the draft allows briefly', () => {
  assert.deepEqual(answer(structuredClone(signed('order', RW))), { status: 200 });
});

test('the thief’s request in the story is refused with invalid_session and changes nothing the Company knows', () => {
  const before = play(RW, ['cart', 'sign-in', 'exchange']), after = play(RW, ['cart', 'sign-in', 'exchange', 'thief']);
  assert.deepEqual(answer(thiefRequest(before)), { status: 400, error: 'invalid_session', reason: 'the access token was issued to another agent' });
  assert.deepEqual({ ...after, last: null }, { ...before, last: null });
});

test('5.4: sign-in changes what the agent holds and nothing about the Session; the next signed-in request links it', () => {
  const before = play(RW, ['cart', 'exchange']), signedIn = play(RW, ['cart', 'exchange', 'sign-in']);
  assert.deepEqual({ ...signedIn, last: null }, { ...before, grant: true, last: null });
  assert.equal(signedIn.linked, 'no');
  assert.equal(play(RW, ['cart', 'exchange', 'sign-in', 'exchange']).linked, 'yes');
  assert.equal(play(RW, ['sign-in', 'cart']).linked, 'no', 'a request that needs no account carries no token');
});

test('4.7: the token carries exactly the scopes approved, so read-only approval reads the order and cannot exchange it', () => {
  assert.deepEqual(tokenOf(start(RO)).scopes, RO);
  assert.deepEqual(answer(agentRequest(play(RO, ['sign-in']), 'order')), { status: 200 });
  assert.deepEqual(lastAnswer(play(RO, ['sign-in', 'exchange'])), { status: 403, error: 'insufficient_scope', needs: 'orders:write' });
  assert.deepEqual(lastAnswer(play(RW, ['sign-in', 'exchange'])), { status: 200 });
});

test('5.5: sign-out ends account access and leaves the Session, its cart and the User ID as they were', () => {
  const w = play(RW, [...STORY]);
  assert.deepEqual(w, { approves: RW, found: true, started: true, cart: true, grant: false, linked: 'signed out', last: { kind: 'revoke' } });
  assert.deepEqual(answer(agentRequest(w, 'order')), { status: 401, needs: 'orders:read' });
  assert.equal(agentRequest(w, 'order').session!.sub, 'usr_Q7c1vK');
  assert.equal(agentRequest(w, 'order').session!.sid, SID);
});

test('every refusal says why, and each event is refused or taken as the state decides', () => {
  const reasonOf = (w: World, e: PoppyEvent) => { const n = next(w, e); return isRefusal(n) ? n.reason : null; };
  const unread = 'the agent has not read poppy.json, so it does not know where example.com takes this';
  assert.deepEqual(POPPY_EVENTS.map((e) => reasonOf(start(RW), e)), [
    null, unread, unread, unread, unread, unread,
    'there is no access token to copy until you sign in',
    'the agent holds no refresh token, so there is nothing to revoke',
  ]);
  const found = play(RW, []), signedIn = play(RW, ['sign-in']), carted = play(RW, ['cart']);
  assert.deepEqual(POPPY_EVENTS.map((e) => reasonOf(found, e)), [
    'the agent has already read example.com’s poppy.json', null, null, null, null, null,
    'there is no access token to copy until you sign in',
    'the agent holds no refresh token, so there is nothing to revoke',
  ]);
  assert.equal(reasonOf(signedIn, 'sign-in'), 'the agent already holds a refresh token for what you approve, so it has no reason to ask you again');
  assert.equal(reasonOf(signedIn, 'thief'), null);
  assert.equal(reasonOf(signedIn, 'sign-out'), null);
  assert.equal(reasonOf(carted, 'cart'), 'the medium is already in this Session’s cart');
});

test('section 3: a poppy.json is used only when it names the host that served it and the issuer lists that host', () => {
  assert.deepEqual(discover('example.com', POPPY_JSON, ISSUER_METADATA), ['api', 'web', 'chat']);
  assert.deepEqual(discover('EXAMPLE.com', POPPY_JSON, ISSUER_METADATA), ['api', 'web', 'chat'], 'domains are compared ignoring case');
  const copied = discover('evil.example', POPPY_JSON, ISSUER_METADATA);
  assert.ok(isRefusal(copied) && copied.reason === 'the document names example.com, and evil.example served it');
  const claimed = discover('evil.example', { ...POPPY_JSON, organization: { domain: 'evil.example' } }, ISSUER_METADATA);
  assert.ok(isRefusal(claimed) && claimed.reason === 'the issuer does not list https://evil.example as one of its domains');
  assert.deepEqual(discover('example.com', { organization: POPPY_JSON.organization, apis: POPPY_JSON.apis }, ISSUER_METADATA), ['api']);
  const found = next(start(RW), 'discover') as World;
  assert.deepEqual(found.last, { kind: 'discover', channels: ['api', 'web', 'chat'] });
});

test('5.2: every request the agent sends carries a Session header for the same User ID and Session, on every channel', () => {
  for (const approves of [RW, RO])
    for (const w of [play(approves, []), play(approves, ['cart', 'sign-in']), play(approves, [...STORY])])
      for (const key of Object.keys(OPERATIONS) as (keyof typeof OPERATIONS)[]) {
        const jwt = agentRequest(w, key).session;
        assert.ok(jwt, key);
        assert.deepEqual([jwt.iss, jwt.sub, jwt.sid], [AGENT.clientId, 'usr_Q7c1vK', SID]);
      }
});

test('sections 6 and 8: the website and the chat join the Session without an account, and leave the Company’s record as it was', () => {
  const before = play(RW, ['cart']), after = play(RW, ['cart', 'browse', 'chat']);
  assert.deepEqual({ ...after, last: null }, { ...before, last: null });
  assert.deepEqual(lastAnswer(play(RW, ['cart', 'browse'])), { status: 204 });
  assert.deepEqual(lastAnswer(after), { status: 201 });
  assert.equal(agentRequest(play(RW, ['sign-in']), 'browse').token, undefined, 'the agent sends no token where none is needed');
  assert.deepEqual([OPERATIONS.cart.channel, OPERATIONS.browse.channel, OPERATIONS.chat.channel], ['api', 'web', 'chat']);
});

test('from the start, every state the events reach leaves an event to press, for both approvals', () => {
  for (const approves of [RW, RO]) {
    const seen = new Map<string, World>([[JSON.stringify(start(approves)), start(approves)]]);
    for (const queue = [start(approves)]; queue.length; ) {
      const w = queue.shift()!;
      const taken = POPPY_EVENTS.map((e) => next(w, e)).filter((n): n is World => !isRefusal(n));
      assert.ok(taken.length > 0);
      for (const n of taken) if (!seen.has(JSON.stringify(n))) { seen.set(JSON.stringify(n), n); queue.push(n); }
    }
    assert.ok(seen.size < 200, `${seen.size} states`);
    // No reachable state links the Session to the account without the Company having seen a token.
    for (const w of seen.values()) assert.ok(w.linked !== 'yes' || w.grant, JSON.stringify(w));
  }
  assert.deepEqual([...SCOPES], RW);
});

test('each picture cites the section of the draft that decided it', () => {
  const sectionAfter = (approves: readonly Scope[], events: readonly PoppyEvent[]) => ruleOf(play(approves, events).last).section;
  assert.equal(ruleOf(null).section, '3');
  assert.equal(ruleOf(next(start(RW), 'discover') === null ? null : (next(start(RW), 'discover') as World).last).section, '3');
  assert.deepEqual(STORY.slice(1).map((_, i) => sectionAfter(RW, STORY.slice(0, i + 2))), ['5.2', '6', '8', '5.3', '5.4', '5', '5.3', '5.5']);
  assert.equal(sectionAfter(RO, ['sign-in', 'exchange']), '7');
  assert.match(ruleOf(play(RW, ['exchange']).last).says, /grants no account access/);
  assert.match(ruleOf(play(RW, ['sign-in', 'thief']).last).says, /must have signed the header beside it/);
});
