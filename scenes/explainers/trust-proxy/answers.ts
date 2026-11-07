// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { ADDR, TRUSTED_RANGES, TRUST_CODE, reqIp } from './model.ts';

/** The first question's request: two made-up entries, straight to the load balancer. */
export const TWO_FORGED = `5.6.7.8, ${ADDR.forged}`,
  TWO_FORGED_XFF = `${TWO_FORGED}, ${ADDR.attacker}`,
  TWO_FORGED_IP = { 2: reqIp(ADDR.balancer, TWO_FORGED_XFF, 2), true: reqIp(ADDR.balancer, TWO_FORGED_XFF, true) };
/** The second question's firewall, a third proxy in front of the CDN. */
export const WAF = '100.64.0.20',
  WAF_XFF = `${ADDR.client}, ${WAF}, ${ADDR.edge}`,
  WAF_LIST_IP = reqIp(ADDR.balancer, WAF_XFF, [...TRUSTED_RANGES, WAF]);

export const questions = {
  1: () => ({
    question: `The attacker skips the CDN again, but writes two made-up entries: X-Forwarded-For: ${TWO_FORGED}. Which address becomes req.ip with trust proxy 2, and which with true?`,
    answer: `With 2, ${TWO_FORGED_IP[2]}: Express trusts the load balancer and the attacker’s real address by position, then stops at the next entry, the made-up one nearest to it. With true, ${TWO_FORGED_IP.true}: every address is trusted, so Express reaches the far end of the list and takes it without a test. Either way the attacker chose req.ip.`,
  }),
  2: () => ({
    question: `You put a firewall service at ${WAF} in front of the CDN, so a client’s request now passes three proxies. With trust proxy 2, whose address does req.ip report for a client? Which setting gives the client’s address and still stops the attacker who skips the CDN?`,
    answer: `The firewall’s: the two trusted positions now hold the load balancer and the CDN edge, so the third proxy is the first address left. A count of 3 gives the client, but on the route that skips the CDN it trusts every address, and the attacker’s made-up entry becomes req.ip. The address list with ${WAF} added gives the client, ${WAF_LIST_IP}, and the attacker’s real address on the short route.`,
  }),
  3: () => ({ question: `What must hold for the address list ${TRUST_CODE.list} to keep req.ip right?` }),
};
