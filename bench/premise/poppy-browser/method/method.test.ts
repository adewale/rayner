// node --test bench/premise/poppy-browser/method/method.test.ts
// The method's checks, without the engine: the model agrees with the draft's values as pinned in the
// explainer's own tests, and every step of every scenario renders and states them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORIZE_URL as MODEL_AUTHORIZE, ENDPOINT as MODEL_ENDPOINT, PAGE_RESPONSE, joinEffect } from '../../../../scenes/explainers/poppy-browser/model.ts';
import { AUTHORIZE, AUTHORIZE_URL, ENDPOINT, FORGE_FAILED, PAGE, PHISH, SUBMIT_OK } from './oracle.ts';
import { CHECKS, SETTING_KEYS, SIGN_IN, steps, story } from './page.ts';

test('the model gives the draft’s endpoint, page cookie, answers and login table', () => {
  assert.deepEqual([MODEL_ENDPOINT, MODEL_AUTHORIZE], [ENDPOINT, AUTHORIZE_URL]);
  assert.deepEqual([PAGE_RESPONSE.cookie.maxAge, PAGE_RESPONSE.cookie.httpOnly, PAGE_RESPONSE.cookie.sameSite], [PAGE.maxAge, PAGE.httpOnly, PAGE.sameSite]);
  assert.ok(PAGE_RESPONSE.cookie.name.startsWith(PAGE.namePrefix));
  const lasts = story(SIGN_IN['signed-in']).map((w) => w.last!);
  assert.deepEqual(lasts.map((l) => l.event), ['fetch', 'load', 'authorize', 'submit', 'browse', 'forge', 'phish']);
  assert.deepEqual((lasts[2] as { answer: unknown }).answer, { status: AUTHORIZE.ok });
  assert.deepEqual((lasts[3] as { answer: unknown }).answer, SUBMIT_OK);
  assert.deepEqual((lasts[5] as { answer: { failed: unknown } }).answer.failed, [...FORGE_FAILED]);
  assert.equal((lasts[6] as { declined: string }).declined, PHISH.declined);
  assert.deepEqual((lasts[6] as { answer: { failed: unknown } }).answer.failed, [...PHISH.failed]);
  const lacking = story(SIGN_IN['no-scope']).map((w) => w.last!);
  assert.deepEqual((lacking[2] as { answer: unknown }).answer, AUTHORIZE.lacking);
  assert.deepEqual([joinEffect('B', 'A').whileJoined.account, joinEffect('B', 'A').afterSignInEnds.account], ['A', null]);
});

test('every step of every scenario renders, and no picture of the browser holds the key', () => {
  for (const k of SETTING_KEYS) {
    const all = steps(k);
    assert.equal(all.length, k === 'no-scope' ? 9 : 8);
    for (const s of all) {
      for (const field of [s.title, s.caption, s.svg]) assert.doesNotMatch(field, /undefined|NaN|\[object/, `${k} ${s.id}`);
      assert.match(s.svg, /^<svg [^>]*viewBox="0 0 400 \d+"/, `${k} ${s.id}`);
    }
    assert.ok(all.find((s) => s.id === 'load')!.caption.includes('the code works only with the cookie set in that browser'));
  }
  assert.match(steps('signed-in').find((s) => s.id === 'browse')!.title, /signed in to A/);
  assert.match(steps('no-scope').find((s) => s.id === 'authorize')!.title, /403/);
});

test('the check answers are computed from the model', () => {
  assert.match(CHECKS[0]!.a, /no join cookie/);
  assert.match(CHECKS[2]!.a, /^403 insufficient_scope/);
});
