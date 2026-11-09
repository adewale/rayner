import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from '../lib/pbt.ts';
import { readFileSync } from 'node:fs';
import { TokenBucket } from './model.ts';

test('rate changes alter real decisions while balances stay inside capacity', () => {
  const successes = [];
  for (const rate of [1, 2, 4]) {
    const bucket = new TokenBucket(rate);
    const results = [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 2].map((now) => {
      const ok = bucket.allow(now);
      assert.ok(bucket.tokens >= 0 && bucket.tokens <= 5);
      return ok;
    });
    assert.deepEqual(results.slice(0, 6), [true, true, true, true, true, false]);
    successes.push(results.filter(Boolean).length);
  }
  assert.deepEqual(successes, [7, 8, 9]);
});

test('token-bucket: the explainer schedule gets the answers golang.org/x/time/rate gives', () => {
  // oracle/ runs rate.NewLimiter(r, 5).AllowN(t, 1) on this schedule.
  const oracle = JSON.parse(readFileSync(new URL('./fixtures/token-bucket-xtime.json', import.meta.url), 'utf8')) as {
    module: string; burst: number; schedule: number[]; runs: Record<string, { at: number; status: number; tokens: number }[]>;
  };
  assert.equal(oracle.module, 'golang.org/x/time v0.15.0');
  assert.deepEqual(oracle.schedule, [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 5]);
  assert.deepEqual(Object.keys(oracle.runs).sort(), ['1', '2', '4']);
  for (const [rate, calls] of Object.entries(oracle.runs)) {
    const bucket = new TokenBucket(Number(rate), oracle.burst);
    assert.deepEqual(
      oracle.schedule.map((at) => ({ at, status: bucket.allow(at) ? 200 : 429, tokens: bucket.tokens })),
      calls,
      `rate ${rate}`,
    );
  }
  // The long wait is clipped by the cap at 2 and 4 tokens a second, not at 1.
  assert.deepEqual(Object.values(oracle.runs).map((c) => c.at(-1)!.tokens), [3, 4, 4]);
});

test('token buckets match an independent quarter-token ledger at varied rates and capacities', () => {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 16 }), fc.integer({ min: 1, max: 24 }),
    fc.array(fc.integer({ min: 0, max: 40 }), { maxLength: 80 }),
    (rate, capacity, elapsedTicks) => {
      const bucket = new TokenBucket(rate, capacity);
      // One tick is a quarter second; reference credits are quarter-tokens.
      // Integer accounting makes repeated timestamps and exact refill edges exact.
      let credits = capacity * 4;
      let ticks = 0;
      for (const elapsed of elapsedTicks) {
        ticks += elapsed;
        credits += elapsed * rate;
        if (credits > capacity * 4) credits = capacity * 4;
        const accepted = credits >= 4;
        if (accepted) credits -= 4;
        assert.equal(bucket.allow(ticks / 4), accepted);
        assert.equal(bucket.tokens, credits / 4);
        assert.equal(bucket.lastRefill, ticks / 4);
      }
    },
  ), params(300));
});

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
