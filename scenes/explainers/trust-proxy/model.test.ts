import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADDR, TRUSTED_RANGES, reqIp } from './model.ts';
import { TWO_FORGED_IP, TWO_FORGED_XFF, WAF, WAF_LIST_IP, WAF_XFF } from './answers.ts';

test('the check answers’ words: which address each setting takes for two made-up entries and for a third proxy', () => {
  // The first answer's words: 2 takes the made-up entry nearer the attacker, true the farther one; the list
  // still takes the attacker's real address.
  assert.equal(TWO_FORGED_IP[2], ADDR.forged);
  assert.equal(TWO_FORGED_IP.true, '5.6.7.8');
  assert.equal(reqIp(ADDR.balancer, TWO_FORGED_XFF, TRUSTED_RANGES), ADDR.attacker);
  // The second answer's words: 2 reports the firewall; 3 the client, but on the short route the made-up entry;
  // the extended list the client, and on the short route the attacker's real address.
  const SHORT_XFF = `${ADDR.forged}, ${ADDR.attacker}`;
  assert.equal(reqIp(ADDR.balancer, WAF_XFF, 2), WAF);
  assert.equal(reqIp(ADDR.balancer, WAF_XFF, 3), ADDR.client);
  assert.equal(reqIp(ADDR.balancer, SHORT_XFF, 3), ADDR.forged);
  assert.equal(WAF_LIST_IP, ADDR.client);
  assert.equal(reqIp(ADDR.balancer, SHORT_XFF, [...TRUSTED_RANGES, WAF]), ADDR.attacker);
});
