import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import {
  ADDR,
  REQUESTS,
  REQUEST_KEYS,
  TABLE,
  TRUSTS,
  TRUST_CODE,
  TRUST_KEYS,
  arrivals,
  atExpress,
  positions,
  readAddresses,
} from '../../../scenes/explainers/lib/trust-proxy.ts';
import type { RequestKey, TrustKey } from '../../../scenes/explainers/lib/trust-proxy.ts';

/** The scene's option labels for the requests, as its captions spell them. */
const REQUEST_LABEL_CHECK: Record<RequestKey, string> = {
  client: 'Client via the CDN',
  forged: 'Attacker via the CDN',
  direct: 'Attacker, skipping the CDN',
};

/** Every scenario's step state equals the req.ip model's answers for that setting and request. */
export function check(trace: Trace, values: Record<string, string>): void {
  const t = values.trust as TrustKey,
    q = values.request as RequestKey;
  assert.ok(TRUST_KEYS.includes(t), `unknown trust ${t}`);
  assert.ok(REQUEST_KEYS.includes(q), `unknown request ${q}`);
  const got = atExpress(REQUESTS[q]),
    reading = readAddresses(got.socket, got.xff, TRUSTS[t]);
  const ip = TABLE[t][q].ip;

  // The cards are views of the state, so it also names the scenario the second card shows.
  assertStepState(trace, 'paths', { addresses: { ...ADDR }, setting: { trust: t, request: q } });
  assertStepState(trace, 'follow', { arrivals: arrivals(REQUESTS[q]).map((h) => [h.at.id, h.socket, h.xff]) });
  // The routes view: the count beside the address list, each on the long and the short route, by who stands at each position.
  const counted: TrustKey = t === 'list' ? '2' : t;
  assertStepState(trace, 'routes', {
    routes: Object.fromEntries(
      [counted, 'list' as const].map((s) => [
        s,
        Object.fromEntries((['forged', 'direct'] as const).map((k) => [k, positions(REQUESTS[k], TRUSTS[s]).map((p) => [p.who, p.verdict])])),
      ]),
    ),
  });
  assertStepState(trace, 'code', { trust: TRUST_CODE[t] });
  // The result card is a view of the state: who sent the request, and whose address req.ip is.
  assertStepState(trace, 'read', {
    read: reading.map((r) => [r.addr, r.verdict]),
    ip,
    sender: { name: REQUESTS[q].sender.name, addr: REQUESTS[q].sender.addr },
    outcome: TABLE[t][q].outcome,
  });
  // Each request's column is drawn from how Express reads it under this setting, and whose address req.ip is.
  assertStepState(trace, 'requests', {
    answers: Object.fromEntries(REQUEST_KEYS.map((k) => [k, TABLE[t][k].ip])),
    readings: Object.fromEntries(
      REQUEST_KEYS.map((k) => {
        const r = atExpress(REQUESTS[k]);
        return [k, readAddresses(r.socket, r.xff, TRUSTS[t]).map((x) => [x.addr, x.verdict])];
      }),
    ),
    outcomes: Object.fromEntries(REQUEST_KEYS.map((k) => [k, TABLE[t][k].outcome])),
  });
  const other: TrustKey = t === 'list' ? '2' : 'list';
  // The cards mark each answer right or wrong from its outcome.
  assertStepState(trace, 'ranges', {
    compare: Object.fromEntries([t, other].map((s) => [s, Object.fromEntries(REQUEST_KEYS.map((k) => [k, TABLE[s][k].ip]))])),
    compareOutcomes: Object.fromEntries([t, other].map((s) => [s, Object.fromEntries(REQUEST_KEYS.map((k) => [k, TABLE[s][k].outcome]))])),
  });
  // Each cell's colour and words come from whose address it is.
  assertStepState(trace, 'table', {
    table: Object.fromEntries(TRUST_KEYS.map((s) => [s, REQUEST_KEYS.map((k) => TABLE[s][k].ip)])),
    tableAnswers: Object.fromEntries(TRUST_KEYS.map((s) => [s, REQUEST_KEYS.map((k) => ({ outcome: TABLE[s][k].outcome, whose: TABLE[s][k].whose }))])),
  });

  // The read step's heading and caption say the model's req.ip, and the requests caption all three answers.
  const step = (name: string) => trace.steps.find((s) => s.step === name)!;
  const readTitle = String(step('read').meta.title),
    readCaption = String(step('read').meta.caption);
  assert.ok(readTitle.startsWith(`req.ip is ${ip},`), readTitle);
  assert.ok(readCaption.includes(`req.ip is ${ip}.`) || readCaption.includes(`ends at ${ip}, so that is req.ip`), readCaption);
  for (const k of REQUEST_KEYS) assert.ok(String(step('requests').meta.caption).includes(`${REQUEST_LABEL_CHECK[k]}: ${TABLE[t][k].ip},`));
}
