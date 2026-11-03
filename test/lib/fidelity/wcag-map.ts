import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { LEVELS, PRINCIPLES, VERSIONS, change, criteria, opened, tally, totals } from '../../../scenes/explainers/lib/wcag-map.ts';
import type { Level } from '../../../scenes/explainers/lib/wcag-map.ts';

/** Every case's step state equals the model's counts for its level and the guideline it opens. */
export function check(trace: Trace, values: Record<string, string>): void {
  const level = values.level as Level,
    open = values.guideline!;
  if (!LEVELS.includes(level)) throw new Error(`Unknown level ${level}`);
  // The reading path's version table: the same level's totals in each version, and what 2.1 and 2.2 changed.
  assertStepState(trace, 'reader-versions', {
    reader: {
      level,
      totals: VERSIONS.map((v) => tally(v, level).total),
      added21: change('2.0', '2.1', level).added.length,
      added22: change('2.1', '2.2', level).added.length,
      removed22: ['4.1.1'],
    },
  });
  assertStepState(trace, 'v20', { v20: tally('2.0', level) });
  assertStepState(trace, 'v21', { v21: { tally: tally('2.1', level), change: change('2.0', '2.1', level) } });
  assertStepState(trace, 'v22', { v22: { tally: tally('2.2', level), change: change('2.1', '2.2', level) } });
  assertStepState(trace, 'parsing', { removed: ['4.1.1'] });
  assertStepState(trace, 'open', {
    opened: opened(open, level).map((c) => ({ num: c.num, level: c.level, added: c.added, ...(c.removed ? { removed: c.removed } : {}) })),
  });
  // The 2.4.7 step exists only where the opened guideline shows it.
  const focusVisible = trace.steps.some((s) => s.step === 'focus-visible');
  if (focusVisible !== (open === '2.4' && level !== 'A')) throw new Error(`focus-visible step present: ${focusVisible}`);
  if (focusVisible) assertStepState(trace, 'focus-visible', { focusVisible: 'AA' });
  const all = totals();
  assertStepState(trace, 'totals', {
    totals: {
      versions: VERSIONS.map((v) => all[v][level]),
      principles: Object.fromEntries(PRINCIPLES.map((p) => [p.num, criteria('2.2', level, p.num).length])),
      levels: all['2.2'],
    },
  });
}
