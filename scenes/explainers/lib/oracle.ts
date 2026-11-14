// Model tests that run an outside system (a CPython, rustc, Git history) need it on this machine.
// Without it a test skips, so a contributor without the tool can still run `npm test`. CI's check job
// sets RAYNER_REQUIRE_ORACLES=1, and there an oracle CI is meant to run fails instead of skipping, so
// it cannot pass by not running. Every skip in an explainer's tests goes through this module
// (test/explain-oracles.test.ts checks); docs/TESTING.md lists which oracles CI runs and which are recordings.

/** The environment variable that turns a missing required oracle from a skip into a failure. */
export const REQUIRE_ORACLES = 'RAYNER_REQUIRE_ORACLES';

/** Whether a required oracle that cannot run fails rather than skips: `RAYNER_REQUIRE_ORACLES=1`. */
export const oraclesRequired = (env: Record<string, string | undefined> = process.env): boolean => env[REQUIRE_ORACLES] === '1';

/** The part of node:test's context these helpers use. */
export interface Skippable { skip(message?: string): void }

/**
 * For an oracle CI runs: call it first in the test with why the oracle cannot run here, or false when it
 * can. Returns true when it skipped the test, which should then return. With RAYNER_REQUIRE_ORACLES=1 it
 * throws instead of skipping.
 *
 *     test('rustc agrees', (t) => { if (skipOracle(t, rustcMissing)) return; … });
 */
export function skipOracle(t: Skippable, missing: string | false | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!missing) return false;
  if (oraclesRequired(env)) throw new Error(`${missing}. ${REQUIRE_ORACLES}=1 requires this oracle to run here: install what it needs, or unset ${REQUIRE_ORACLES} to skip it`);
  t.skip(missing);
  return true;
}

/**
 * For an opt-in rerun that CI does not run, of an oracle whose answers are frozen in a fixture the
 * other tests compare with (a Docker image, a checkout named by an environment variable, a Python
 * with a newer Unicode): skips whatever RAYNER_REQUIRE_ORACLES says. Returns true when it skipped.
 */
export function skipOptionalOracle(t: Skippable, missing: string | false | null | undefined): boolean {
  if (!missing) return false;
  t.skip(missing);
  return true;
}
