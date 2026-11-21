import type { Trace } from '../../../explain/testing.ts';
import { assertStepState } from '../../../explain/testing.ts';
import { ringStory } from './model.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';
import { checkMotion } from './oracle/fidelity.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>, {scenario}: FidelityRun): Promise<void> {
  const result = ringStory(values.operations!).at(-1)!;
  assertStepState(trace, 'result', {
    ...result.result,
    error: result.error ?? null,
    operation: result.operation,
  });
  await checkMotion(scenario.Scene, values);
}
