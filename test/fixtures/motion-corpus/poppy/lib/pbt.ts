// Shared fast-check settings for every property test: the engine's (test/lib/pbt.ts re-exports these)
// and the explainers' own model tests, which import only the collection and the public entry points.
//
// Every property runs from SEED, committed here, so a run and its re-run draw the same cases, and a
// pull request's gate draws what the gate before it drew unless it changes the tests. Importing
// this file sets the seed for every fc.assert and fc.sample in the process, whether or not the
// property passes params(). FULL=1 runs ten times as many cases (the check job's gate, from the
// same seed); FC_RUNS=<n> sets every property's count (handy for the slow browser ones).
// FC_SEED=<n> draws from another seed: the scheduled `properties` workflow passes a fresh one to
// look for cases the committed seed misses. A failure prints its seed and counterexample path;
// rerun exactly that case with FC_SEED=<seed> FC_PATH=<path> and the test's name via
// --test-name-pattern (tools/repo/ci-tests.ts prints that command).
import fc from 'fast-check';
import type { Parameters } from 'fast-check';

/** The seed every property draws from unless FC_SEED names another. */
export const SEED = 20261109;

const env = process.env;
const seed = env.FC_SEED ? Number(env.FC_SEED) : SEED;
if (!Number.isSafeInteger(seed)) throw new RangeError(`FC_SEED must be an integer, not ${JSON.stringify(env.FC_SEED)}`);
fc.configureGlobal({
  seed,
  ...(env.FC_PATH ? { path: env.FC_PATH } : {}),
});

/** fast-check parameters for one property: `cases` runs by default. */
export function params<T>(cases = 1000, extra: Parameters<T> = {}): Parameters<T> {
  return { numRuns: Number(env.FC_RUNS ?? cases) * (env.FULL ? 10 : 1), ...extra };
}

export { fc };
