import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import {
  GROUP_NAMES, NIST_UP_TO, atomicNumber, configText, coreOf, counted, gaps, listed, membersOf, position, predicted, shorthand, symbolOf,
} from '../../../scenes/explainers/lib/periodic-groups.ts';
import type { Symbol } from '../../../scenes/explainers/lib/periodic-groups.ts';

const CHOSEN: Record<string, Symbol> = { na: 'Na', cl: 'Cl', fe: 'Fe', cu: 'Cu', he: 'He' };

/** Every case's step state equals the model's answers for its element. */
export function check(trace: Trace, values: Record<string, string>): void {
  const symbol = CHOSEN[values.element!]!;
  const z = atomicNumber(symbol), p = position(z), group = p.group!, core = coreOf(z);
  assert.equal(trace.steps.length, 9);
  assertStepState(trace, 'column', { element: symbol, z, group, members: membersOf(group).map((m) => m.z), gaps: gaps(group) });
  assertStepState(trace, 'fill', { lit: z, filling: configText(predicted(z)) });
  assertStepState(trace, 'count', {
    core, coreSymbol: core ? symbolOf(core) : null, badges: z - core, count: p.count, adjustment: p.adjustment,
    listed: shorthand(listed(z), z), listedCount: counted(listed(z), z),
  });
  assertStepState(trace, 'blocks', { blocks: true, capacity: { s: 2, p: 6, d: 10, f: 14 }, block: p.block });
  assertStepState(trace, 'family', {
    family: membersOf(group).map((m) => m.z > NIST_UP_TO
      ? { symbol: m.symbol, config: null, count: null }
      : { symbol: m.symbol, config: shorthand(listed(m.z), m.z), count: counted(listed(m.z), m.z) }),
  });
  const named = GROUP_NAMES[group - 1]!;
  assertStepState(trace, 'names', { name: named.trivial ?? named.byElement, cas: named.cas, oldIupac: named.oldIupac });
  assertStepState(trace, 'limit', { limit: { Na: ['H'], Cl: ['Ts'], Fe: ['Fe', 'Co', 'Ni'], Cu: ['Rg'], He: ['He', 'Be'] }[symbol as string] });
}
