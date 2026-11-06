import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { TokenBucket } from '../scenes/explainers/lib/models.ts';
import TokenBucketExplainer from '../scenes/explainers/token-bucket/scene.ts';

// The page's schedule: six at once, three within the next second, then R10 after a four-second wait.
const TIMES = [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 5];
const run = (rate: number, times = TIMES, capacity = 5) => {
  const bucket = new TokenBucket(rate, capacity);
  return times.map((at) => {
    const ok = bucket.allow(at);
    return { at, ok, found: bucket.tokens + (ok ? 1 : 0) };
  });
};
const rateArb = fc.double({ min: 0.01, max: 50, noNaN: true });

test('a burst can spend only the tokens saved up, and only elapsed time adds more', () => {
  // For any schedule, the requests accepted from the i-th to the j-th number at most what the i-th found
  // plus rate × the time between them: nothing but elapsed time adds to the saved balance.
  const schedule = fc.array(fc.double({ min: 0, max: 20, noNaN: true }), { minLength: 1, maxLength: 40 }).map((t) => t.sort((a, b) => a - b));
  fc.assert(
    fc.property(rateArb, fc.integer({ min: 1, max: 10 }), schedule, (rate, capacity, times) => {
      const calls = run(rate, times, capacity);
      for (let i = 0; i < calls.length; i++)
        for (let j = i; j < calls.length; j++) {
          const accepted = calls.slice(i, j + 1).filter((c) => c.ok).length;
          assert.ok(accepted <= calls[i]!.found + rate * (calls[j]!.at - calls[i]!.at) + 1e-9, `${i}..${j}`);
          // Saved tokens never exceed the bucket, so neither does a burst at one instant.
          if (calls[j]!.at === calls[i]!.at) assert.ok(accepted <= capacity);
        }
    }),
    params(300),
  );
});

test('R6 is refused at every refill rate, because no time passes inside the burst', () => {
  fc.assert(fc.property(rateArb, (rate) => !run(rate)[5]!.ok && run(rate).slice(0, 5).every((c) => c.ok)), params(300));
});

test('R10 is accepted at the three offered rates and refused below a fifth of a token a second', () => {
  for (const rate of [1, 2, 4]) assert.ok(run(rate)[9]!.ok, `${rate} a second`);
  // Below 0.2 a second R6–R9 are all refused, the balance climbs from empty at 0 s, and R10 at 5 s finds 5 × rate.
  for (const rate of [0.05, 0.1, 0.19, 0.199]) assert.equal(run(rate)[9]!.ok, false, `${rate} a second`);
  for (const rate of [0.2, 0.21, 0.25, 0.5]) assert.equal(run(rate)[9]!.ok, true, `${rate} a second`);
});

test('token-bucket: the check answers are the model’s', () => {
  const [bigger, steady, moved] = TokenBucketExplainer.meta.checks.map((c) => c.answer);
  // A six-token bucket at 2 a second lets R6 through; no rate does with five (above).
  assert.equal(run(2, TIMES, 6)[5]!.ok, true);
  assert.match(bigger!, /answers R6 with 200\./);
  // One request every 0.4 s at 2 a second: request 22 is the first refused, and 80 of requests 101–200 get through.
  const every = run(2, Array.from({ length: 200 }, (_, n) => n * 0.4));
  assert.equal(every.findIndex((c) => !c.ok) + 1, 22);
  assert.equal(every.slice(100).filter((c) => c.ok).length, 80);
  assert.match(steady!, /request 22 is the first refused\. From then on 80 of every 100 get through/);
  // R10 at 1.5 s: refused only at 1 a second.
  const at15 = (rate: number) => run(rate, [...TIMES.slice(0, 9), 1.5])[9]!;
  assert.deepEqual([1, 2, 4].map((r) => at15(r).ok), [false, true, true]);
  assert.match(moved!, /^At 1 token a second only\. At 1 a second R9 leaves 0 and R10 finds 0\.5; at 2 a second R9 leaves 0 and R10 finds 1; at 4 a second R9 leaves 1 and R10 finds 3\./);
});
