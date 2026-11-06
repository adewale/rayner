// Shared fast-check settings for every property test: the engine's (test/lib/pbt.ts re-exports these)
// and the explainers' own model tests, which import only the collection and the public entry points.
// FULL=1 runs ten times as many cases; FC_RUNS=<n> sets every property's count (handy for the slow
// browser ones). A failure prints its seed and counterexample path; rerun exactly that
// case with FC_SEED=<seed> FC_PATH=<path> (and the test's name via --test-name-pattern).
import fc from 'fast-check';
import type { Parameters } from 'fast-check';

/** fast-check parameters for one property: `cases` runs by default. */
export function params<T>(cases = 1000, extra: Parameters<T> = {}): Parameters<T> {
  const env = process.env;
  return {
    numRuns: Number(env.FC_RUNS ?? cases) * (env.FULL ? 10 : 1),
    ...(env.FC_SEED ? { seed: Number(env.FC_SEED) } : {}),
    ...(env.FC_PATH ? { path: env.FC_PATH } : {}),
    ...extra,
  };
}

export { fc };
