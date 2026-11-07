import type { Trace } from '../../../explain/testing.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { ringStory } from './model.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  const result = ringStory(values.operations!).at(-1)!;
  assertStepState(trace, 'result', {
    ...result.result,
    error: result.error ?? null,
    operation: result.operation,
  });
}
