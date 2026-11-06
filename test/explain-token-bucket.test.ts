import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { TokenBucket } from '../scenes/explainers/token-bucket/model.ts';
import TokenBucketExplainer from '../scenes/explainers/token-bucket/scene.ts';
import { explainerMeta } from '../tools/lib/explain-intent.ts';

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

test('token-bucket: the script\'s check answers are the model\'s, word for word', () => {
  const [bigger, steady, moved] = explainerMeta(TokenBucketExplainer, 'scenes/explainers/token-bucket').checks!.map((c) => c.answer);
  // As the scene wrote them before they moved to script.md, rebuilt from the model now.
  const perSecond = (r: number) => `${r} token${r > 1 ? 's' : ''} a second`;
  const say = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  // A six-token bucket at 2 a second answers R6; no rate does with five (above).
  const six = run(2, TIMES, 6)[5]!.ok ? 200 : 429;
  assert.equal(bigger, `A bigger bucket. R1 to R6 arrive at the same instant, so no time passes and refill adds nothing at any rate. A bucket of six tokens, still at 2 a second, answers R6 with ${six}.`);
  // One request every 0.4 s at 2 a second: the first refused, and how many of requests 101–200 get through.
  const every = run(2, Array.from({ length: 200 }, (_, n) => n * 0.4));
  const first = every.findIndex((c) => !c.ok) + 1, share = every.slice(100).filter((c) => c.ok).length;
  assert.equal(steady, `Yes. Each gap earns 0.8 tokens and each request spends one, so the saved five drain by 0.2 a request and request ${first} is the first refused. From then on ${share} of every 100 get through, 2 a second: the refill rate, however long the flood lasts.`);
  // R10 moved to 1.5 s, at each rate: what R9 left, what R10 found, and its answer.
  const shifted = [1, 2, 4].map((rate) => {
    const bucket = new TokenBucket(rate, 5);
    TIMES.slice(0, 9).forEach((at) => bucket.allow(at));
    const left = bucket.tokens, ok = bucket.allow(1.5);
    return { rate, left, found: bucket.tokens + (ok ? 1 : 0), ok };
  });
  const refused = shifted.filter((m) => !m.ok).map((m) => perSecond(m.rate));
  assert.equal(refused.length, 1, 'the answer names one rate');
  assert.equal(moved, `At ${refused[0]} only. ${shifted.map((m, i) => `${i ? 'at' : 'At'} ${m.rate} a second R9 leaves ${say(m.left)} and R10 finds ${say(m.found)}`).join('; ')}. Half a second has to earn the token R9 did not leave.`);
});
