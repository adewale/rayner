import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { Scene } from '../../../src/index.ts';
import { resolveSettings } from '../../../explain/settings.ts';
import { VOCABULARY } from '../../../explain/words.ts';
import { collectProject } from '../../../tools/lib/explain-project.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>, { scenario }: FidelityRun): Promise<void> {
  // The page timeline drawn in 'timing' is the trace's own timing of the 'fork' step,
  // and that step lasts its caption's reading time at Scene.captionWpm, to the frame.
  const fork = trace.steps.find((s) => s.step === 'fork')!;
  const words = String(fork.meta.caption).trim().split(/\s+/).length;
  assert.ok(fork.hold != null && fork.t1 != null, 'the fork step holds for its caption');
  assertStepState(trace, 'timing', {
    timing: { motion: +(fork.hold - fork.t0).toFixed(2), held: +(fork.t1 - fork.hold).toFixed(2), words },
  });
  assert.ok(Math.abs(fork.t1 - fork.t0 - (words / Scene.captionWpm) * 60) <= 1 / trace.fps + 1e-9);
  // The count of diagram families it quotes is the describer's own (explain/words.ts).
  assertStepState(trace, 'fork', { families: Object.keys(VOCABULARY.en!.families!).length });
  // The rows and the sentence it quotes are the token bucket's own: each offered rate is a
  // token-bucket scenario whose trace answers R10 as the fork scene says, and its last step says
  // R10 is accepted at every rate.
  const bucketProject = await collectProject('scenes/explainers/token-bucket', { write: false });
  const offered = bucketProject.scenarios.map((v) => ({
    rate: Number(v.values.rate),
    r10: (v.trace.steps.find((s) => s.step === 'trace')!.after!.responses as number[])[9],
  }));
  assertStepState(trace, 'sentence', { offered: offered.sort((a, b) => a.rate - b.rate) });
  for (const v of bucketProject.scenarios)
    assert.match(String(v.trace.steps.find((s) => s.step === 'trace')!.meta.caption), /R10 is accepted at every rate/);
  // Independently, at 0.1 tokens a second: R1-R5 spend the bucket, R7-R9 find under one
  // token, and R10 at 5 s finds 5 × 0.1 = 0.5, so it is refused.
  assertStepState(trace, 'untested', { unbuilt: { rate: 0.1, r10: 429, found: 0.5 } });
  // The scenarios the choice step draws are the token bucket's own: its setting as declared, one
  // scenario per option with R10's answer from that scenario's trace, and what its settings resolver
  // does with a link naming a listed rate and with one naming 0.1.
  const { default: TokenBucketScene } = await import('../token-bucket/scene.ts');
  const [rate] = TokenBucketScene.settings;
  const refused = (() => {
    try {
      resolveSettings(TokenBucketScene, { rate: '0.1' });
    } catch (e) {
      return (e as Error).message;
    }
    assert.fail('0.1 must not resolve to a token-bucket scenario');
  })();
  assertStepState(trace, 'choice', {
    choice: {
      setting: rate,
      scenarios: offered.map((o) => ({ rate: String(o.rate), r10: o.r10, default: String(o.rate) === rate!.default })),
      links: [
        { asked: '4', opens: resolveSettings(TokenBucketScene, { rate: '4' }).rate },
        { asked: '0.1', opens: rate!.default, refused },
      ],
    },
  });
  // The price is shown on a real scene's settings: traffic-policy's two settings, in its own order.
  const { default: TrafficPolicy } = await import('../traffic-policy/scene.ts');
  const [policy, pods] = TrafficPolicy.settings;
  assertStepState(trace, 'scenarios', {
    scenarios: {
      count: policy!.options.length * pods!.options.length,
      policies: policy!.options.map((o) => o.label),
      pods: pods!.options.map((o) => o.value),
    },
  });
}
