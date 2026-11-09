import { test } from 'node:test';
import type { View } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { withSettings, loadFonts, assertViewFollowsState } from '../../../explain/testing.ts';
import TokenBucketExplainer from './scene.ts';
import { TokenBucket } from './model.ts';
import { readFileSync } from 'node:fs';
import { withIntent } from '../../../explain/testing.ts';
import type { ExplainerMeta } from '../../../explain/index.ts';

// The scene's metadata with its script's intent adopted, as the command adopts it.
const scriptMeta = withIntent(TokenBucketExplainer, readFileSync('scenes/explainers/token-bucket/script.md', 'utf8'), 'scenes/explainers/token-bucket/script.md').meta as ExplainerMeta;

test('token-bucket: the state readout shows scene.state at the end of every step, at every rate', async () => {
  await loadFonts();
  for (const rate of ['1', '2', '4']) {
    const checked = await assertViewFollowsState(
      withSettings(TokenBucketExplainer, { rate }),
      (scene) => (scene as unknown as { readout: View | null }).readout,
    );
    assert.equal(checked, 5, `rate ${rate}: the readout is checked at all five steps`);
  }
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

test('token-bucket: the script\'s check answers are the model\'s, word for word', () => {
  const [bigger, steady, moved] = scriptMeta.questions!.map((c) => c.answer);
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
