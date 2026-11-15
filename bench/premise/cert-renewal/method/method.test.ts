// node --test bench/premise/cert-renewal/method/method.test.ts
// The method's checks, without the engine: the model agrees with the oracle, and every step of every
// scenario renders words and pictures that state the model's and the oracle's numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BR_PHASES, DAY, LE_DATES, LIFETIMES, ariWindow, defaultRenewalOffset, issue, simulate } from '../../../../scenes/explainers/cert-renewal/model.ts';
import type { Rule } from '../../../../scenes/explainers/cert-renewal/model.ts';
import { BOULDER_WINDOW_S, BR, CERTBOT_DEFAULT, LETS_ENCRYPT, LIVE_ARI, SHORT_SEQUENCE } from './oracle.ts';
import { CHECKS, KEYS, steps } from './page.ts';

test('the model gives Certbot’s vectors, Boulder’s windows, the live ARI answers and the published tables', () => {
  for (const v of CERTBOT_DEFAULT) assert.equal(defaultRenewalOffset(v.lifetimeDays * DAY), (Date.parse(v.renewsUtc) - Date.UTC(2025, 2, 12)) / 3600e3);
  for (const [k, [start, end]] of Object.entries(BOULDER_WINDOW_S)) {
    const c = issue(0, LIFETIMES[k as '45d' | '160h'].hours),
      w = ariWindow(c);
    assert.deepEqual([Math.round((w.start - c.notBefore) * 3600), Math.round((w.end - c.notBefore) * 3600)], [start, end], k);
  }
  const s = (iso: string) => Date.parse(iso) / 1000;
  for (const [site, nb, , start, end] of LIVE_ARI) {
    const c = issue(0, 90 * DAY),
      w = ariWindow(c),
      off = (h: number) => Math.round((h - c.notBefore) * 3600);
    assert.equal(s(start) - s(nb), off(w.start), site);
    assert.ok([0, 1].includes(s(end) - s(nb) - off(w.end)), site);
  }
  const run = simulate('fixed30', 160, 10 * DAY + 1);
  assert.deepEqual([run.issued, run.refused], [[...SHORT_SEQUENCE.issued], [...SHORT_SEQUENCE.refused]]);
  assert.deepEqual(BR.map((p) => p.days), BR_PHASES.map((p) => p.days));
  assert.deepEqual(LETS_ENCRYPT.map((d) => [d.date, d.days]), LE_DATES.map((d) => [d.date, d.days]));
});

test('every step of every scenario renders', () => {
  for (const k of KEYS)
    for (const r of ['fraction', 'fixed30'] as Rule[]) {
      const all = steps(k, r);
      assert.equal(all.length, 10);
      for (const st of all) {
        for (const field of [st.title, st.caption, st.svg]) assert.doesNotMatch(field, /undefined|NaN|\[object|Infinity/, `${k} ${r} ${st.id}`);
        assert.match(st.svg, /^<svg [^>]*viewBox="0 0 400 \d+"/, `${k} ${r} ${st.id}`);
      }
    }
  assert.match(steps('45d', 'fixed30')[6]!.caption, /renews 24 times and the default 12: twice as often/);
  assert.match(steps('160h', 'fixed30')[7]!.caption, /run at hour 84 is refused; in 365 days 465 runs are refused and 264 renew/);
  assert.match(steps('90d', 'fraction')[3]!.title, /day 60, 67% of the way through/);
});

test('the check answers are computed from the model', () => {
  assert.match(CHECKS[0]!.a, /264 renewed and 465 runs refused, the first at hour 84/);
  assert.match(CHECKS[1]!.a, /At day 35/);
});
