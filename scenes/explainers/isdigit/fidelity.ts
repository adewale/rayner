import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import {
  CHARS,
  LINEUP,
  PREDICATES,
  COUNTS,
  fields,
  flags,
  numericType,
  predicates,
  intOf,
  guarded,
  accepts,
} from './model.ts';
import type { CharId, Predicate } from './model.ts';

/** Every scenario's step state equals the model's answers for its character and its check. */
export function check(trace: Trace, values: Record<string, string>): void {
  const c = CHARS[values.char as CharId],
    guard = values.guard as Predicate;
  assertStepState(trace, 'lineup', {
    lineup: LINEUP.map((k) => ({ char: CHARS[k].char, type: numericType(CHARS[k]), int: intOf(CHARS[k]) })),
  });
  assertStepState(trace, 'ucd', { fields: fields(c), numericType: numericType(c) });
  // The flags step is gone; the ucd step, which now says which field each check reads, holds the flags and answers.
  assertStepState(trace, 'ucd', { flags: flags(c), predicates: predicates(c) });
  assert.ok(!trace.steps.some((s) => s.step === 'flags'));
  // The sets step merged into outcome, which now draws the nested sets with their counts.
  assertStepState(trace, 'outcome', { counts: COUNTS });
  assertStepState(trace, 'guard', { guard: { predicate: guard, passes: predicates(c)[guard] } });
  assertStepState(trace, 'int', { int: intOf(c) });
  assertStepState(trace, 'outcome', { outcome: guarded(c, guard).outcome });
  assertStepState(trace, 'match', { accepts: Object.fromEntries(PREDICATES.map((k) => [k, accepts(k)])) });
}
