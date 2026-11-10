import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isRefusal } from '../../../explain/index.ts';
import { AGENT, COMPANY, SCOPES, SID, THIEF } from '../poppy/model.ts';
import {
  AUTH, CARDS, CLIENT, CODE, DEVICE, LOOKALIKE, OTHER, PKCE, SESSION, SIGN_IN_EVENTS, STATE, STORY, SWAPPED, TASK,
  assertionOf, authorizationRequest, authorize, checkAssertion, checkResponse, deviceLink, grant, hintOf, isRejected,
  next, poll, redeem, refresh, refreshTokenOf, ruleOf, scopesToAsk, sessionFor, signedIn, start, whatTheCompanySees,
  type Flow, type IssuedCode, type RefreshToken, type SignInEvent, type World,
} from './model.ts';

// Each test names the section of the Personal Agent Protocol draft 0.4 it holds the model to
// (https://personalagentprotocol.org/docs/0.4/spec). The specification was read, not run: there is
// no reference implementation here, so these pin the model to the draft's rules and examples.

const FLOWS: readonly Flow[] = ['direct', 'device'];
const play = (flow: Flow, events: readonly SignInEvent[]) =>
  events.reduce<World>((w, e) => {
    const after = next(w, e);
    assert.ok(!isRefusal(after), `${flow} ${e} was refused: ${isRefusal(after) ? after.reason : ''}`);
    return after as World;
  }, start(flow));
const reasonOf = (w: World, e: SignInEvent) => { const n = next(w, e); return isRefusal(n) ? n.reason : null; };
const errorOf = (value: unknown) => (isRejected(value) ? `${value.error}: ${value.reason}` : 'accepted');
const issued = (over: Partial<IssuedCode> = {}): IssuedCode => ({
  code: CODE, client: AGENT.clientId, redirect_uri: CLIENT.redirect_uris[0], challenge: PKCE.challenge, scopes: TASK, requested: TASK, spent: false, ...over,
});
const redemption = { code: CODE, redirect_uri: CLIENT.redirect_uris[0], verifier: PKCE.verifier, assertion: assertionOf(AGENT) };

test('4.2: the authorization request is the specification’s example, with PKCE S256', () => {
  assert.deepEqual(authorizationRequest(TASK), {
    client_id: 'https://agent.example/agent.json',
    redirect_uri: 'https://agent.example/oauth/callback',
    scope: 'orders:read orders:write',
    state: 'Xq81vR',
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
  });
  // The draft's challenge is RFC 7636 Appendix B's: the base64url SHA-256 of the verifier the model uses.
  assert.equal(createHash('sha256').update(PKCE.verifier).digest('base64url'), PKCE.challenge);
});

test('4.2: the redirect_uri must exactly match a registered one, so the code goes nowhere else', () => {
  assert.deepEqual(authorize(authorizationRequest(TASK)), ['orders:read', 'orders:write']);
  for (const redirect_uri of ['https://evil.example/cb', 'https://agent.example/oauth/callback/', 'https://agent.example/oauth/callback?x=1', 'https://AGENT.example/oauth/callback'])
    assert.equal(errorOf(authorize({ ...authorizationRequest(TASK), redirect_uri })), `invalid_request: ${redirect_uri} is not one of the redirect URIs agent.example registered, so no code is sent there`);
});

test('4.7: every sign-in request names scopes the Company knows, or gets invalid_scope', () => {
  const { scope: _omitted, ...noScope } = authorizationRequest(TASK);
  assert.equal(errorOf(authorize(noScope)), 'invalid_scope: every sign-in request names its scopes');
  assert.equal(errorOf(authorize({ ...authorizationRequest(TASK), scope: 'orders:read payments:write' })), 'invalid_scope: payments:write is not a scope example.com offers');
  assert.deepEqual(authorize({ ...authorizationRequest(TASK), scope: 'addresses' }), ['addresses']);
});

test('4.7: the Company grants what you approved and nothing beyond what was asked; approving none is a decline', () => {
  assert.deepEqual(grant(TASK, TASK), { scopes: TASK, saysScope: false });
  assert.deepEqual(grant(TASK, ['orders:read']), { scopes: ['orders:read'], saysScope: true }, 'the response says scope when it differs from the request');
  assert.deepEqual(grant(['orders:read'], ['orders:read', 'orders:write']), { scopes: ['orders:read'], saysScope: false }, 'never a scope beyond those requested');
  assert.equal(errorOf(grant(TASK, [])), 'access_denied: you approved none of the scopes, so the sign-in ends as a decline');
});

test('4.2: the agent checks iss exactly, so a response from another Company’s sign-in is rejected, on an error too', () => {
  const good = { redirect_uri: CLIENT.redirect_uris[0], code: CODE, state: STATE, iss: COMPANY.issuer };
  assert.deepEqual(checkResponse(good), { code: CODE });
  assert.equal(errorOf(checkResponse(SWAPPED)), 'invalid_request: its iss names https://auth.shoes.example, and the agent started sign-in with https://auth.example.com');
  assert.equal(errorOf(checkResponse({ ...good, iss: 'https://auth.example.com/' })), 'invalid_request: its iss names https://auth.example.com/, and the agent started sign-in with https://auth.example.com');
  const { code: _c, ...denied } = good;
  assert.equal(errorOf(checkResponse({ ...denied, error: 'access_denied', iss: OTHER.issuer })), 'invalid_request: its iss names https://auth.shoes.example, and the agent started sign-in with https://auth.example.com');
  assert.equal(errorOf(checkResponse({ ...denied, error: 'access_denied' })), 'access_denied: you declined on the Company’s page');
  assert.equal(errorOf(checkResponse({ ...good, state: 'zz' })), 'invalid_request: its state is zz, not the Xq81vR the agent sent');
});

test('4.1: a client assertion is addressed to the issuer as a single string, and to nothing else', () => {
  assert.equal(checkAssertion(assertionOf(AGENT)), true);
  assert.equal(errorOf(checkAssertion(assertionOf(AGENT, 'https://auth.example.com/oauth/token'))), 'invalid_client: the assertion is addressed to https://auth.example.com/oauth/token, not to the issuer https://auth.example.com');
});

test('4.2: a code is redeemed once, by the agent it was issued to, with the same redirect and the PKCE verifier', () => {
  assert.deepEqual(redeem(issued(), redemption), { access_token: 'at_Qp4w', refresh_token: 'pat_8Hk2', granted: TASK });
  assert.deepEqual(redeem(issued({ scopes: ['orders:read'] }), redemption), { access_token: 'at_Qp4w', refresh_token: 'pat_8Hk2', granted: ['orders:read'], scope: 'orders:read' });
  assert.equal(errorOf(redeem(issued({ spent: true }), redemption)), 'invalid_grant: the code is not one the Company issued, or it was used already');
  assert.equal(errorOf(redeem(issued(), { ...redemption, assertion: assertionOf(THIEF) })), 'invalid_grant: the code was issued to https://agent.example/agent.json');
  assert.equal(errorOf(redeem(issued(), { ...redemption, verifier: 'guessed' })), 'invalid_grant: the verifier does not match the challenge the sign-in began with');
  assert.equal(errorOf(redeem(issued(), { ...redemption, redirect_uri: 'https://evil.example/cb' })), 'invalid_grant: the redirect_uri differs from the one the code was issued for');
  assert.equal(errorOf(redeem(issued(), { ...redemption, assertion: assertionOf(AGENT, ISSUER_TOKEN) })), `invalid_client: the assertion is addressed to ${ISSUER_TOKEN}, not to the issuer https://auth.example.com`);
});
const ISSUER_TOKEN = 'https://auth.example.com/oauth/token';

test('4.3: a device link is shown only on the issuer’s host or the Company’s domain, or a subdomain, with its name and domain', () => {
  assert.deepEqual(deviceLink(DEVICE.verification_uri_complete), { show: 'https://auth.example.com/device?user_code=WDJB-MJHT', beside: 'Example Company · example.com' });
  assert.ok(!isRejected(deviceLink('https://example.com/device')));
  assert.ok(!isRejected(deviceLink('https://login.EXAMPLE.com/device')), 'a subdomain of the domain, compared ignoring case');
  assert.equal(errorOf(deviceLink(LOOKALIKE)), 'invalid_request: its host auth.shoes.example is neither auth.example.com nor example.com, nor a subdomain of either');
  assert.ok(isRejected(deviceLink('https://example.com.evil.example/device')), 'a host that only starts with the domain');
  assert.ok(isRejected(deviceLink('https://notexample.com/device')), 'a host that only ends with the domain’s letters');
});

test('4.3: each poll carries the assertion; it gets authorization_pending until you answer, then the tokens', () => {
  const own = { device_code: DEVICE.device_code, assertion: assertionOf(AGENT) };
  assert.equal(errorOf(poll(own, null)), 'authorization_pending: you have not answered on the Company’s page yet');
  assert.deepEqual(poll(own, ['orders:read']), { access_token: 'at_Qp4w', refresh_token: 'pat_8Hk2', granted: ['orders:read'], scope: 'orders:read' });
  assert.equal(errorOf(poll({ ...own, assertion: assertionOf(THIEF) }, TASK)), 'invalid_grant: the device code was issued to https://agent.example/agent.json');
  assert.equal(errorOf(poll(own, [])), 'access_denied: you approved none of the scopes, so the sign-in ends as a decline');
  assert.deepEqual([DEVICE.user_code, DEVICE.interval, DEVICE.expires_in], ['WDJB-MJHT', 5, 600]);
});

test('4.7: scope hints read as the Company states them; no entry means no hints, an unknown changes value is irreversible', () => {
  assert.deepEqual(hintOf('orders:read'), { changes: 'none', personal_data: true });
  assert.deepEqual(hintOf('orders:write'), { changes: 'irreversible', personal_data: true });
  assert.deepEqual(hintOf('addresses'), { changes: 'reversible', personal_data: true });
  assert.equal(hintOf('poppy:browser-sign-in'), 'no hints');
  assert.deepEqual(hintOf('x', { x: { changes: 'catastrophic', personal_data: false, colour: 'red' } }), { changes: 'irreversible', personal_data: false });
  assert.equal(hintOf('x', { x: { changes: 'none' } }), 'no hints', 'a Company must include both fields');
  assert.deepEqual(Object.keys(AUTH.scopes), ['orders:read', 'orders:write', 'addresses', 'poppy:browser-sign-in']);
});

test('4.7: the agent asks only for what the task needs, and asking again asks for every scope still needed', () => {
  assert.deepEqual(scopesToAsk(['orders:read']), ['orders:read']);
  assert.deepEqual(scopesToAsk(TASK), ['orders:read', 'orders:write']);
  assert.deepEqual(scopesToAsk(['orders:write'], ['orders:read']), ['orders:read', 'orders:write'], 'never only the missing scope');
  for (const flow of FLOWS) {
    const signedInRead = play(flow, STORY[flow].slice(0, STORY[flow].indexOf('collect', STORY[flow].indexOf('approve-read')) + 1));
    assert.deepEqual(signedInRead.holds, { scopes: ['orders:read'], card: 0 });
    const reask = next(signedInRead, 'ask') as World;
    assert.deepEqual(reask.last, flow === 'direct' ? { kind: 'ask', scopes: TASK } : { kind: 'ask', scopes: TASK, link: DEVICE.verification_uri_complete });
  }
});

test('4.7: the new refresh token replaces the old one; a pending sign-in leaves the old one in place', () => {
  for (const flow of FLOWS) {
    const before = play(flow, ['ask', 'approve-read', 'collect']);
    const waiting = play(flow, ['ask', 'approve-read', 'collect', 'ask', 'approve-all']);
    assert.deepEqual(waiting.holds, before.holds, 'a pending sign-in leaves existing tokens unchanged');
    const after = play(flow, ['ask', 'approve-read', 'collect', 'ask', 'approve-all', 'collect']);
    assert.deepEqual(after.holds, { scopes: TASK, card: 1 });
    assert.deepEqual(after.last, { kind: 'tokens', granted: TASK, saysScope: false, replaced: true });
    assert.equal(after.ended, false, 'replacing a refresh token is not sign-out');
    assert.equal(CARDS[after.holds!.card], 'pat_3Fz9');
  }
});

test('4.4: a copied refresh token is useless without the agent’s client assertion, and is not tied to a Session', () => {
  const token: RefreshToken = { value: 'pat_8Hk2', client: AGENT.clientId, scopes: TASK, revoked: false };
  assert.deepEqual(refresh(token, assertionOf(AGENT)), { access_token: 'at_Qp4w', scopes: TASK });
  assert.equal(errorOf(refresh(token, assertionOf(THIEF))), 'invalid_grant: the refresh token was issued to https://agent.example/agent.json');
  assert.equal(errorOf(refresh({ ...token, revoked: true }, assertionOf(AGENT))), 'invalid_grant: the refresh token was revoked');
  assert.equal('sid' in token, false, 'a refresh token names no Session');
  for (const flow of FLOWS) {
    const w = play(flow, STORY[flow].slice(0, STORY[flow].lastIndexOf('thief') + 1));
    assert.deepEqual(w.last, { kind: 'thief', error: 'invalid_grant', reason: 'the refresh token was issued to https://agent.example/agent.json' });
  }
});

test('5.5: sign-out revokes every refresh token; the account is signed out once none is valid, and replacing one is not sign-out', () => {
  const old: RefreshToken = { value: 'pat_8Hk2', client: AGENT.clientId, scopes: ['orders:read'], revoked: true };
  const current: RefreshToken = { value: 'pat_3Fz9', client: AGENT.clientId, scopes: TASK, revoked: false };
  assert.equal(signedIn([old, current]), true, 'revoking the replaced token left the account signed in');
  assert.equal(signedIn([old, { ...current, revoked: true }]), false);
  assert.equal(signedIn([{ ...current, client: THIEF.clientId }]), false, 'another client’s token does not sign this agent in');
  for (const flow of FLOWS) {
    const w = play(flow, STORY[flow]);
    assert.deepEqual(w, { flow, sign: null, holds: null, ended: true, last: { kind: 'sign-out' } });
    assert.equal(refreshTokenOf(w), null);
  }
});

test('5.5: you can disconnect the agent in the Company’s account settings, which revokes its refresh tokens', () => {
  for (const flow of FLOWS) {
    const w = play(flow, ['ask', 'approve-all', 'collect', 'disconnect']);
    assert.deepEqual({ holds: w.holds, ended: w.ended, last: w.last }, { holds: null, ended: true, last: { kind: 'disconnect' } });
    assert.equal(reasonOf(w, 'disconnect'), 'no refresh token of agent.example is valid for your account, so there is nothing to disconnect');
    assert.equal(reasonOf(w, 'sign-out'), 'the agent holds no refresh token for your account, so there is nothing to revoke');
    assert.equal(next(w, 'ask') instanceof Object && !isRefusal(next(w, 'ask')), true, 'you can sign in again if you ask');
  }
});

test('5.4: sign-in does not touch the Session; a second account gets a second Session', () => {
  assert.deepEqual(SESSION, { sid: SID, userId: 'usr_Q7c1vK' });
  const sessions = [{ sid: SID, account: 'personal' }];
  assert.deepEqual(sessionFor('personal', sessions), { sid: SID, fresh: false });
  assert.deepEqual(sessionFor('business', sessions), { sid: 'new-2', fresh: true });
  assert.deepEqual(sessionFor('personal', [{ sid: SID, account: null }]), { sid: SID, fresh: false }, 'a signed-out Session can be signed in');
  // The world has no Session field: no event of sign-in changes or names the Session.
  for (const flow of FLOWS) assert.deepEqual(Object.keys(play(flow, STORY[flow])).sort(), ['ended', 'flow', 'holds', 'last', 'sign']);
});

test('10.5: through sign-in the Company sees the agent and can limit and revoke it alone; with your password it sees you', () => {
  assert.deepEqual(whatTheCompanySees('sign-in'), { actor: 'agent.example', limits: 'the scopes you approved', toStop: 'revoke agent.example’s refresh tokens', userAffected: false });
  assert.deepEqual(whatTheCompanySees('password'), { actor: 'you', limits: 'nothing', toStop: 'block it entirely', userAffected: 'unsaid' });
});

test('4.2 and 4.3: the story signs in by each type, with what you approved, and the tricks change nothing', () => {
  const direct = play('direct', ['ask', 'approve-read']);
  assert.deepEqual(next(direct, 'trick'), { ...direct, last: { kind: 'trick', reason: 'its iss names https://auth.shoes.example, and the agent started sign-in with https://auth.example.com' } });
  const device = play('device', ['ask', 'approve-read', 'collect']);
  assert.deepEqual(next(device, 'trick'), { ...device, last: { kind: 'trick', reason: 'its host auth.shoes.example is neither auth.example.com nor example.com, nor a subdomain of either' } });
  assert.deepEqual(play('device', ['ask', 'collect']).last, { kind: 'pending' });
  assert.deepEqual(play('direct', ['ask', 'approve-read', 'collect']).last, { kind: 'tokens', granted: ['orders:read'], saysScope: true, replaced: false });
  assert.deepEqual(play('device', ['ask', 'approve-all', 'collect']).last, { kind: 'tokens', granted: TASK, saysScope: false, replaced: false });
});

test('every refusal says why, and each event is refused or taken as the state decides', () => {
  assert.deepEqual(SIGN_IN_EVENTS.map((e) => reasonOf(start('direct'), e)), [
    null,
    'no sign-in is waiting: the agent has not opened the Company’s page in your browser',
    'no sign-in is waiting: the agent has not opened the Company’s page in your browser',
    'there is nothing to collect: the agent has not opened the Company’s page in your browser',
    'no sign-in is waiting, so the agent’s redirect expects no response to swap',
    'the agent holds no refresh token to copy',
    'the agent holds no refresh token for your account, so there is nothing to revoke',
    'no refresh token of agent.example is valid for your account, so there is nothing to disconnect',
  ]);
  assert.deepEqual(SIGN_IN_EVENTS.map((e) => reasonOf(start('device'), e)).slice(1, 5), [
    'no sign-in is waiting: the agent has not shown you a link and code',
    'no sign-in is waiting: the agent has not shown you a link and code',
    'there is nothing to collect: the agent has not shown you a link and code',
    null,
  ]);
  const asked = play('direct', ['ask']);
  assert.equal(reasonOf(asked, 'ask'), 'a sign-in is already waiting for your answer on the Company’s page');
  assert.equal(reasonOf(asked, 'collect'), 'your browser has not come back: you have not answered on the Company’s page yet');
  assert.equal(reasonOf(play('direct', ['ask', 'approve-read']), 'approve-all'), 'you have answered this sign-in already');
  assert.equal(reasonOf(play('device', ['ask']), 'trick'), 'a sign-in is already waiting, and the agent asks for a link only when it starts one');
  const full = play('device', ['ask', 'approve-all', 'collect']);
  assert.equal(reasonOf(full, 'ask'), 'the agent already holds a refresh token for orders:read orders:write, everything the exchange needs');
  assert.equal(reasonOf(full, 'trick'), 'the agent already holds everything the exchange needs, so it starts no sign-in');
});

test('from the start, every reachable state leaves an event to press, for both sign-in types, and the state space is small', () => {
  for (const flow of FLOWS) {
    const seen = new Map<string, World>([[JSON.stringify(start(flow)), start(flow)]]);
    for (const queue = [start(flow)]; queue.length; ) {
      const w = queue.shift()!;
      const taken = SIGN_IN_EVENTS.map((e) => next(w, e)).filter((n): n is World => !isRefusal(n));
      assert.ok(taken.length > 0, JSON.stringify(w));
      for (const n of taken) if (!seen.has(JSON.stringify(n))) { seen.set(JSON.stringify(n), n); queue.push(n); }
    }
    assert.ok(seen.size <= 80, `${flow}: ${seen.size} states`);
    for (const w of seen.values()) {
      // 4.7: nothing the agent holds goes beyond what the task asked for.
      assert.ok(!w.holds || w.holds.scopes.every((s) => TASK.includes(s)), JSON.stringify(w));
      // 5.5: signed out means holding nothing.
      assert.ok(!w.ended || !w.holds, JSON.stringify(w));
    }
  }
  assert.deepEqual([...SCOPES], [...TASK]);
});

test('each picture cites the section of the draft that decided it', () => {
  const sections = (flow: Flow) => STORY[flow].map((_, i) => ruleOf(play(flow, STORY[flow].slice(0, i + 1))).section);
  assert.equal(ruleOf(start('direct')).section, '10.5');
  assert.deepEqual(sections('direct'), ['4.2', '4.7', '4.2', '4.2', '4.2', '4.7', '4.7', '4.4', '5.5']);
  assert.deepEqual(sections('device'), ['4.3', '4.3', '4.7', '4.3', '4.3', '4.3', '4.7', '4.7', '4.4', '5.5']);
});

// ---------------------------------------------------------------------------------------------
// Against published artifacts, not a reading of the draft's text: the JSON Schemas of the
// protocol's Company implementation kit and the example documents of spec.md, in
// fixtures/poppy-official.json, and RFC 7636 Appendix B, in fixtures/rfc7636-appendix-b.json, each
// with its source and retrieval date.

import { readFileSync } from 'node:fs';
import { validate, type Schemas } from '../poppy/fixtures/json-schema.ts';
import { ISSUER, challengeOf } from './model.ts';

const OFFICIAL: { examples: Record<string, any>; schemas: Schemas } = JSON.parse(readFileSync(new URL('./fixtures/poppy-official.json', import.meta.url), 'utf8'));
const RFC7636: { verifier_octets: number[]; code_verifier: string; challenge_octets: number[]; code_challenge: string } = JSON.parse(readFileSync(new URL('./fixtures/rfc7636-appendix-b.json', import.meta.url), 'utf8'));
/** Every value `part` gives is the value at the same place in `whole`. */
const within = (part: unknown, whole: unknown): boolean =>
  typeof part === 'object' && part !== null
    ? typeof whole === 'object' && whole !== null && Object.entries(part).every(([k, v]) => within(v, (whole as Record<string, unknown>)[k]))
    : part === whole;

test('official kit schemas (poppy-official.json): the client metadata, the device authorization response and auth pass them', () => {
  assert.deepEqual(validate(OFFICIAL.schemas, 'client-metadata.schema.json', CLIENT), []);
  assert.deepEqual(validate(OFFICIAL.schemas, 'device-authorization-response.schema.json', DEVICE), []);
  assert.deepEqual(validate(OFFICIAL.schemas, 'poppy.schema.json#/properties/auth', AUTH), []);
  assert.notDeepEqual(validate(OFFICIAL.schemas, 'poppy.schema.json#/properties/auth', { ...AUTH, scope_hints: { addresses: { changes: 'maybe', personal_data: true } } }), [], 'and an unknown changes value fails');
});

test('spec.md 3, 3.2, 4.1 and 4.3 examples (poppy-official.json): AUTH, ISSUER, CLIENT and DEVICE give the example documents’ values', () => {
  assert.deepEqual(AUTH, OFFICIAL.examples['3 Discovery #1 poppy.json'].auth);
  assert.ok(within(ISSUER, OFFICIAL.examples['3.2 OAuth server #2 authorization server metadata']));
  assert.ok(within(CLIENT, OFFICIAL.examples['4.1 Agent identity #1 client metadata']));
  assert.deepEqual(DEVICE, OFFICIAL.examples['4.3 Device Sign-In #1 device authorization response']);
});

test('RFC 7636 Appendix B (rfc7636-appendix-b.json): PKCE is the RFC’s pair, the verifier its octets in base64url and the challenge the SHA-256 of the verifier', () => {
  assert.equal(PKCE.verifier, RFC7636.code_verifier);
  assert.equal(PKCE.challenge, RFC7636.code_challenge);
  assert.equal(Buffer.from(RFC7636.verifier_octets).toString('base64url'), RFC7636.code_verifier);
  assert.deepEqual([...createHash('sha256').update(RFC7636.code_verifier, 'ascii').digest()], RFC7636.challenge_octets);
  assert.equal(Buffer.from(RFC7636.challenge_octets).toString('base64url'), RFC7636.code_challenge);
  assert.equal(challengeOf(RFC7636.code_verifier), RFC7636.code_challenge);
});
