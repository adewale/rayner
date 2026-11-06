import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import assert from 'node:assert/strict';
import { CRITERIA, LEVELS, VERSIONS, change, criteria, opened, tally } from './model.ts';
import type { Level, Version } from './model.ts';

/** Every scenario's step state equals the model's counts for its level and the guideline it opens. */
export function check(trace: Trace, values: Record<string, string>): void {
  const level = values.level as Level,
    open = values.guideline!;
  if (!LEVELS.includes(level)) throw new Error(`Unknown level ${level}`);
  // The reading path's version picture: the same level's totals in each version, and what 2.1 and 2.2 changed.
  const versions = trace.steps.find((s) => s.step === 'reader-versions')?.after as
    | ({ columns: string[]; rows: Record<Version, string[]> } & Record<string, unknown>)
    | undefined;
  assert.ok(versions, 'No completed step: reader-versions');
  const { columns, rows, ...counts } = versions;
  assert.deepEqual(counts, {
    level,
    totals: VERSIONS.map((v) => tally(v, level).total),
    added21: change('2.0', '2.1', level).added.length,
    added22: change('2.1', '2.2', level).added.length,
    removed22: ['4.1.1'],
  });
  // One column per criterion any version asks for at this level, grouped by level, earlier versions first
  // within a level; one row per version, holding exactly the columns that version's list has.
  const union = new Set(VERSIONS.flatMap((v) => criteria(v, level).map((c) => c.num)));
  assert.equal(columns.length, union.size);
  assert.deepEqual([...columns].sort(), [...union].sort());
  const byNum = new Map(CRITERIA.map((c) => [c.num, c]));
  const order = columns.map((n) => [LEVELS.indexOf(byNum.get(n)!.level), VERSIONS.indexOf(byNum.get(n)!.added)] as const);
  order.forEach(([l, v], i) => {
    if (!i) return;
    const [pl, pv] = order[i - 1]!;
    assert.ok(l > pl || (l === pl && v >= pv), `column ${columns[i]} is out of order`);
  });
  for (const v of VERSIONS) {
    const list = new Set(criteria(v, level).map((c) => c.num));
    assert.deepEqual(rows[v], columns.filter((n) => list.has(n)), `the ${v} row`);
    assert.equal(rows[v].length, tally(v, level).total);
  }
  // 4.1.1 Parsing: in the 2.0 and 2.1 rows, a gap in 2.2's.
  assert.deepEqual(VERSIONS.map((v) => rows[v].includes('4.1.1')), [true, true, false]);
  assertStepState(trace, 'v20', { v20: tally('2.0', level) });
  assertStepState(trace, 'v21', { v21: { tally: tally('2.1', level), change: change('2.0', '2.1', level) } });
  assertStepState(trace, 'v22', { v22: { tally: tally('2.2', level), change: change('2.1', '2.2', level) } });
  assertStepState(trace, 'parsing', { removed: ['4.1.1'] });
  assertStepState(trace, 'open', {
    opened: opened(open, level).map((c) => ({ num: c.num, level: c.level, added: c.added, ...(c.removed ? { removed: c.removed } : {}) })),
  });
  // The opener states the totals; no detail step repeats them, and 2.4.7's draft history is in script.md.
  assert.deepEqual(trace.steps.map((s) => s.step), ['reader-focus', 'reader-levels', 'reader-versions', 'v20', 'v21', 'v22', 'parsing', 'open']);
}
