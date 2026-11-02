import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import {
  NIST_UP_TO, atomicNumber, configText, coreOf, counted, gaps, listed, membersOf, position, predicted, shorthand, symbolOf,
} from '../../../scenes/explainers/lib/periodic-groups.ts';
import type { Symbol } from '../../../scenes/explainers/lib/periodic-groups.ts';

const CHOSEN: Record<string, Symbol> = { na: 'Na', cl: 'Cl', fe: 'Fe', cu: 'Cu', he: 'He' };

/** Every case's step state equals the model's answers for its element. */
export function check(trace: Trace, values: Record<string, string>): void {
  const symbol = CHOSEN[values.element!]!;
  const z = atomicNumber(symbol), p = position(z), group = p.group!, core = coreOf(z);
  assert.deepEqual(trace.steps.map((s) => s.step), ['column', 'fill', 'blocks', 'family']);
  assertStepState(trace, 'column', { element: symbol, z, group, members: membersOf(group).map((m) => m.z), gaps: gaps(group) });
  // The fill step runs the filling rule over all 118 cells; its note is the element's own runs.
  assertStepState(trace, 'fill', { lit: 118, filling: configText(predicted(z)), runs: predicted(z).map((s) => s.electrons), strip: 'runs' });
  // Every full run of the filling rule is 2, 6, 10 or 14 long, as the fill step says.
  assert.deepEqual([...new Set(predicted(118).map((s) => s.electrons))].sort((a, b) => a - b), [2, 6, 10, 14]);
  // The blocks step names the runs and lands the last electron; it carries the old count step's answers.
  assertStepState(trace, 'blocks', {
    blocks: true, strip: 'named', capacity: { s: 2, p: 6, d: 10, f: 14 }, block: p.block,
    core, coreSymbol: core ? symbolOf(core) : null, count: p.count, adjustment: p.adjustment,
    listed: shorthand(listed(z), z), listedCount: counted(listed(z), z), ghost: symbol === 'He',
  });
  // The landing column, s then d then p widths, is the group for all but helium, whose run says 2.
  const last = predicted(z).at(-1)!;
  const landed = last.l === 's' ? last.electrons : last.l === 'd' ? 2 + last.electrons : 12 + last.electrons;
  assertStepState(trace, 'blocks', { landed });
  assert.equal(landed, symbol === 'He' ? 2 : group);
  assertStepState(trace, 'family', {
    family: membersOf(group).map((m) => m.z > NIST_UP_TO
      ? { symbol: m.symbol, config: null, count: null }
      : { symbol: m.symbol, config: shorthand(listed(m.z), m.z), count: counted(listed(m.z), m.z) }),
  });
}
