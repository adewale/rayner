import assert from 'node:assert/strict';
import { pictureWordsAt } from '../../../explain/testing.ts';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { pkceFlow, lanes, readable } from './model.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  assertStepState(trace, 'exchange', {
    challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    accepted: true,
  });
  if (values.attacker === 'yes') assertStepState(trace, 'attack', { attackerAccepted: false });
  const pictured = (step: string) => pictureWordsAt(trace, step).full;
  assert.match(pictured('secret'), /code_challenge.*E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM/s);
  assert.match(pictured('exchange'), /S256\(verifier\) = E9Melh… = bound challenge/);
  const guesses = trace.steps.filter(s => /S256\(guess\) = \S+… ≠ E9Melh…/.test(pictureWordsAt(trace, s.step).full));
  assert.deepEqual(guesses.map(s => s.step), values.attacker === 'yes' ? ['attack'] : []);
  // Without PKCE, the opening's theft gets a token.
  assertStepState(trace, 'stolen', { stolenAccepted: true });
  // The channel map draws the client's messages lane by lane, as the model routes them, and names what
  // another app can read: the challenge, its method and the code, without the verifier.
  const flow = pkceFlow(values.attacker === 'yes');
  assertStepState(trace, 'channels', { lanes: lanes(flow), readable: Object.keys(readable(flow)) });
  assert.deepEqual(Object.keys(readable(flow)), ['code_challenge', 'code_challenge_method', 'code']);
  // The picture in words says the same lanes.
  const lanesShown = pictured('channels');
  for (const words of [
    'which another app can read: Client to Auth server, code_challenge and code_challenge_method; Auth server to Client, code.',
    'token endpoint: Client to Auth server, code and code_verifier; Auth server to Client, access token.',
    'Another app can read code_challenge, code_challenge_method and code, and not the code_verifier.',
  ])
    assert.ok(lanesShown.includes(words), `${words}\n${lanesShown}`);
}
