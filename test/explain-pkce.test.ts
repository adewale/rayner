import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { redeem, theftFlow, pkceFlow, lanes, readable, VERIFIER, GUESS } from '../scenes/explainers/lib/pkce.ts';

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
