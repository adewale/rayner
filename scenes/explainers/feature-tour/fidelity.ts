import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>, { scenario }: FidelityRun): Promise<void> {
  assertStepState(trace, 'recipe', { feature: values.feature });
  assertStepState(trace, 'result', { feature: values.feature });
  assert.deepEqual(['recipe', 'result'].map((name) => (trace.steps.find((s) => s.step === name)!.shown as { phase?: string }).phase), ['recipe', 'result']);
  if (values.feature === 'state') assertStepState(trace, 'result', { count: 1 });
  // The camera scenario says how much of the 16-unit stage its closer view frames.
  if (values.feature === 'camera') {
    const camera = trace.steps.find((s) => s.step === 'result')!.after!.camera as { before: number; after: number };
    assert.equal(camera.before, 16);
    assert.ok(camera.after > 1.2 && camera.after < 8, `the view frames ${camera.after} units`);
  }
}
