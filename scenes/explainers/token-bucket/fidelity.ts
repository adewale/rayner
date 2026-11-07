import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { TokenBucket } from './model.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  const bucket = new TokenBucket(Number(values.rate)),
    balances: number[] = [];
  const responses = [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 5].map((at) => {
    const ok = bucket.allow(at);
    balances.push(bucket.tokens);
    return ok ? 200 : 429;
  });
  assertStepState(trace, 'trace', { tokens: bucket.tokens, lastRefill: 5, responses });
  // The gauge followed elapsed time: one Follow per request, from the previous arrival to this
  // one, always writing the gauge, and the climbing line too when time passed. Recorded as each
  // began, so the intervals are the ones the frames sampled.
  const follows = trace.steps.flatMap((s) => (s.evidence ?? []).filter((e) => e.kind === 'follow'));
  const arrivals = [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 5];
  assert.deepEqual(follows.map((e) => [e.from, e.to]), arrivals.map((at, i) => [i ? arrivals[i - 1] : 0, at]));
  for (const [i, e] of follows.entries()) {
    const passed = i > 0 && arrivals[i]! > arrivals[i - 1]!;
    assert.deepEqual(e.targets, passed ? ['bucket:level', `balance:refill:R${i + 1}`] : ['bucket:level']);
  }
  // The chart and the gauge draw these balances; the trace carries them.
  assertStepState(trace, 'trace', {
    balances,
    allowed: responses.filter((r) => r === 200).length,
    rejected: responses.flatMap((r, i) => (r === 429 ? ['R' + (i + 1)] : [])),
  });
}
