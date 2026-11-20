import { assertStepState } from '../../../explain/testing.ts';
import type { Trace } from '../../../explain/testing.ts';
import { run, REQUESTS } from './model.ts';
export function check(trace: Trace, values: Record<string, string>): void {
  const keys = REQUESTS[values.pattern as keyof typeof REQUESTS];
  assertStepState(trace, 'full', { ...run(keys.slice(0, 3)) });
  assertStepState(trace, 'evict', { ...run(keys.slice(0, 4)) });
  assertStepState(trace, 'try', { ...run(keys) });
}
