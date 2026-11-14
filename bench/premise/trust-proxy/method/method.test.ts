// node --test bench/premise/trust-proxy/method/method.test.ts
// The method's checks, without the engine: the model agrees with the oracle, and every step of every
// scenario renders words and pictures that state the oracle's req.ip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUESTS, REQUEST_KEYS, TABLE, TRUSTS, TRUST_KEYS, atExpress, reqIp } from '../../../../scenes/explainers/trust-proxy/model.ts';
import { EXPRESS_IP, HEADER, SOCKET } from './oracle.ts';
import { CHECKS, steps } from './page.ts';

test('the model gives the twelve req.ip values real Express 5.3.0 returned', () => {
  for (const t of TRUST_KEYS)
    for (const q of REQUEST_KEYS) {
      assert.equal(atExpress(REQUESTS[q]).xff, HEADER[q], q);
      assert.equal(reqIp(SOCKET, HEADER[q], TRUSTS[t]), EXPRESS_IP[t][q], `${t} ${q}`);
      assert.equal(TABLE[t][q].ip, EXPRESS_IP[t][q], `${t} ${q}`);
    }
});

test('every step of every scenario renders, and the read step states the recorded req.ip', () => {
  for (const t of TRUST_KEYS)
    for (const q of REQUEST_KEYS) {
      const all = steps(t, q);
      assert.equal(all.length, 9);
      for (const s of all) {
        for (const field of [s.title, s.caption, s.svg]) assert.doesNotMatch(field, /undefined|NaN|\[object/, `${t} ${q} ${s.id}`);
        assert.match(s.svg, /^<svg [^>]*viewBox="0 0 400 \d+(\.\d+)?"/, `${t} ${q} ${s.id}`);
      }
      const ip = EXPRESS_IP[t][q];
      assert.ok(all.find((s) => s.id === 'follow')!.title.startsWith(`Answer: ${ip},`), `${t} ${q}`);
      assert.ok(all.find((s) => s.id === 'read')!.title.startsWith(`req.ip is ${ip}`), `${t} ${q}`);
      for (const k of REQUEST_KEYS) assert.ok(all.find((s) => s.id === 'requests')!.caption.includes(`: ${EXPRESS_IP[t][k]},`), `${t} ${q} requests ${k}`);
    }
});

test('the check answers name the model’s addresses', () => {
  assert.match(CHECKS[0]!.a, /With 2, 1\.2\.3\.4/);
  assert.match(CHECKS[0]!.a, /With true, 5\.6\.7\.8/);
  assert.match(CHECKS[1]!.a, /203\.0\.113\.7/);
});
