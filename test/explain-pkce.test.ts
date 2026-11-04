import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { redeem, theftFlow, pkceFlow, lanes, readable, signInStart, signInNext, SIGN_IN_EVENTS, VERIFIER, GUESS } from '../scenes/explainers/lib/pkce.ts';
import type { SignIn, SignInEvent } from '../scenes/explainers/lib/pkce.ts';

// RFC 7636 appendix B: this verifier's S256 challenge.
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

test('the token endpoint: without a bound challenge the code alone is redeemed; with one, only a verifier whose S256 matches', () => {
  assert.equal(VERIFIER, 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  assert.equal(createHash('sha256').update(VERIFIER).digest('base64url'), CHALLENGE);
  // RFC 6749 §4.1.3: a public client's code needs no client secret.
  assert.equal(redeem(undefined, undefined), 'Access token');
  // RFC 7636 §4.6: equal values continue; unequal values are invalid_grant.
  assert.equal(redeem(CHALLENGE, VERIFIER), 'Access token');
  assert.equal(redeem(CHALLENGE, GUESS), 'invalid_grant');
  for (const other of ['', VERIFIER.slice(1), VERIFIER + 'x', CHALLENGE])
    assert.equal(redeem(CHALLENGE, other), 'invalid_grant', other);
  // §4.5 makes code_verifier required; this model does not answer for a request without one.
  assert.throws(() => redeem(CHALLENGE, undefined), /not modelled/);
});

test('the verifier travels only in the client’s token request, never through the browser or a redirect', () => {
  for (const attacker of [false, true]) {
    const flow = pkceFlow(attacker);
    const withVerifier = flow.filter((m) => Object.values(m.carries).includes(VERIFIER));
    assert.deepEqual(
      withVerifier.map((m) => [m.from, m.to, m.channel]),
      [['C', 'S', 'tls']],
      `attacker ${attacker}`,
    );
    // RFC 7636 §4.3–4.5: the authorization request carries the challenge and its method; the redirect, the code.
    const front = flow.filter((m) => m.channel === 'browser');
    assert.deepEqual(front.map((m) => Object.keys(m.carries)), [
      ['code_challenge', 'code_challenge_method'],
      ['code'],
      ...(attacker ? [['code']] : []),
    ]);
    assert.equal(front[0]!.carries.code_challenge, CHALLENGE);
    assert.ok(front.every((m) => !('code_verifier' in m.carries)));
    // The server's answers are the endpoint's: the real verifier gets a token, the thief's guess does not.
    const answers = flow.filter((m) => m.from === 'S' && m.channel === 'tls').map((m) => [m.to, m.text]);
    assert.deepEqual(answers, [...(attacker ? [['X', 'invalid_grant']] : []), ['C', 'Access token']]);
  }
});

test('without PKCE the intercepted code is redeemed by the app that caught it', () => {
  const flow = theftFlow();
  assert.deepEqual(flow.at(-1), { from: 'S', to: 'M', text: 'Access token', channel: 'tls', carries: {} });
  assert.ok(flow.every((m) => !('code_challenge' in m.carries) && !('code_verifier' in m.carries)));
});

test('the channel map: another app reads the challenge and the code, and no value it reads redeems the code', () => {
  for (const attacker of [false, true]) {
    const flow = pkceFlow(attacker), map = lanes(flow);
    // The client's own messages, by channel and in order: the challenge and the code cross the browser lane,
    // the code and the verifier the TLS lane, whether or not a malicious app also caught the redirect.
    assert.deepEqual(map.browser.map((m) => [m.from, m.to, m.carries]), [
      ['C', 'S', ['code_challenge', 'code_challenge_method']],
      ['S', 'C', ['code']],
    ], `attacker ${attacker}`);
    assert.deepEqual(map.tls.map((m) => [m.from, m.to, m.carries, m.text]), [
      ['C', 'S', ['code', 'code_verifier'], 'Token request: code + code_verifier'],
      ['S', 'C', [], 'Access token'],
    ], `attacker ${attacker}`);
    // What an app that reads the browser lane holds: the challenge, its method and the code, never the verifier.
    const held = readable(flow);
    assert.deepEqual(Object.keys(held), ['code_challenge', 'code_challenge_method', 'code']);
    assert.equal(held.code_challenge, CHALLENGE);
    assert.ok(!Object.values(held).includes(VERIFIER));
    // Presented as the verifier, none of those values redeems the code bound to the challenge.
    for (const value of Object.values(held)) assert.equal(redeem(CHALLENGE, value), 'invalid_grant', value);
  }
  // Before PKCE the same lane holds the code, and the code alone was enough.
  assert.deepEqual(Object.keys(readable(theftFlow())), ['code']);
});

/** Every complete order of the sign-in's events the protocol allows, from the start, with the state each reaches. */
function everyOrder(): { events: SignInEvent[]; state: SignIn }[] {
  const out: { events: SignInEvent[]; state: SignIn }[] = [];
  const walk = (state: SignIn, events: SignInEvent[]) => {
    const next = SIGN_IN_EVENTS.flatMap((e) => { const s = signInNext(state, e); return s ? [[e, s] as const] : []; });
    if (!next.length) out.push({ events, state });
    for (const [e, s] of next) walk(s, [...events, e]);
  };
  walk(signInStart(), []);
  return out;
}

test('in every order of the sign-in’s messages, only a request without a challenge lets the malicious app get a token', () => {
  const orders = everyOrder();
  // Two requests, then the two deliveries and two token requests in any order the code allows: six orders each.
  assert.equal(orders.length, 12);
  for (const { events, state } of orders) {
    assert.equal(events.length, 5, events.join(' '));
    if (state.challenge !== null) {
      // Bound to the challenge: the guess is refused in every order, and the client, with its verifier, is not.
      assert.equal(state.challenge, CHALLENGE);
      assert.equal(state.app.answer, 'invalid_grant', events.join(' '));
      assert.equal(state.client.answer, 'Access token', events.join(' '));
    } else {
      // No challenge: whichever app redeems first gets the token, and the code, used once, is refused to the other.
      const first = events.find((e) => e === 'CLIENT_REDEEMS' || e === 'APP_REDEEMS') === 'APP_REDEEMS' ? 'app' : 'client';
      assert.equal(state[first].answer, 'Access token', events.join(' '));
      assert.equal(state[first === 'app' ? 'client' : 'app'].answer, 'invalid_grant', events.join(' '));
    }
  }
  assert.ok(orders.some(({ state }) => state.challenge === null && state.app.answer === 'Access token'), 'without a challenge the theft can work');
  // Every state on the way, not only the ends: with the challenge stored, the app never holds a token.
  const seen = new Map<string, SignIn>(), queue = [signInStart()];
  while (queue.length) {
    const state = queue.shift()!;
    if (seen.has(JSON.stringify(state))) continue;
    seen.set(JSON.stringify(state), state);
    for (const e of SIGN_IN_EVENTS) { const s = signInNext(state, e); if (s) queue.push(s); }
  }
  assert.equal(seen.size, 20);
  assert.ok([...seen.values()].every((s) => s.challenge === null || s.app.answer !== 'Access token'));
});

test('the sign-in refuses what the protocol refuses, and agrees with the flows the diagrams draw', () => {
  const run = (events: SignInEvent[]) => events.reduce<SignIn | undefined>((s, e) => s && signInNext(s, e), signInStart());
  // Nothing is delivered or redeemed before the request; one request per sign-in; one delivery and one answer per app.
  for (const e of ['REDIRECT', 'INTERCEPT', 'CLIENT_REDEEMS', 'APP_REDEEMS'] as const) assert.equal(signInNext(signInStart(), e), undefined, e);
  assert.equal(run(['AUTHORIZE_S256', 'AUTHORIZE']), undefined);
  assert.equal(run(['AUTHORIZE_S256', 'REDIRECT', 'REDIRECT']), undefined);
  assert.equal(run(['AUTHORIZE_S256', 'INTERCEPT', 'CLIENT_REDEEMS']), undefined, 'the client cannot redeem a code it has not received');
  assert.equal(run(['AUTHORIZE_S256', 'INTERCEPT', 'APP_REDEEMS', 'APP_REDEEMS']), undefined);
  // pkceFlow's order and theftFlow's order give the answers those flows draw.
  const pkce = run(['AUTHORIZE_S256', 'REDIRECT', 'INTERCEPT', 'APP_REDEEMS', 'CLIENT_REDEEMS'])!;
  const answers = pkceFlow(true).filter((m) => m.from === 'S' && m.channel === 'tls').map((m) => m.text);
  assert.deepEqual([pkce.app.answer, pkce.client.answer], answers);
  assert.equal(run(['AUTHORIZE', 'REDIRECT', 'INTERCEPT', 'APP_REDEEMS'])!.app.answer, theftFlow().at(-1)!.text);
});
