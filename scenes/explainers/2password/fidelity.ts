import type { Trace } from '../../../explain/testing.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { find, run } from './model.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  const launched = run('desktop', { API_KEY: 'op://Personal/Cloud API/credential' }, ['app']);
  assertStepState(trace, 'match', { matches: { 'cloud api': ['Cloud API'], databse: [] } });
  assertStepState(trace, 'match', { found: find(['cloud api', 'databse']) });
  assertStepState(trace, 'references', { leaked: 0 });
  assertStepState(trace, 'run', { argv: launched.argv, childEnv: launched.childEnv });
}
