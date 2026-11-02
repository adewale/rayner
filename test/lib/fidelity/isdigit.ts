import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
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
} from '../../../scenes/explainers/lib/isdigit.ts';
import type { CharId, Predicate } from '../../../scenes/explainers/lib/isdigit.ts';

/** Every case's step state equals the model's answers for its character and its check. */
export function check(trace: Trace, values: Record<string, string>): void {
  const c = CHARS[values.char as CharId],
    guard = values.guard as Predicate;
  assertStepState(trace, 'lineup', {
    lineup: LINEUP.map((k) => ({ char: CHARS[k].char, type: numericType(CHARS[k]), int: intOf(CHARS[k]) })),
  });
  assertStepState(trace, 'ucd', { fields: fields(c), numericType: numericType(c) });
  assertStepState(trace, 'flags', { flags: flags(c), predicates: predicates(c) });
  // The sets step merged into outcome, which now draws the nested sets with their counts.
  assertStepState(trace, 'outcome', { counts: COUNTS });
  assertStepState(trace, 'guard', { guard: { predicate: guard, passes: predicates(c)[guard] } });
  assertStepState(trace, 'int', { int: intOf(c) });
  assertStepState(trace, 'outcome', { outcome: guarded(c, guard).outcome });
  assertStepState(trace, 'match', { accepts: Object.fromEntries(PREDICATES.map((k) => [k, accepts(k)])) });
}
