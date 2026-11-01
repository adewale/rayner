import { readFileSync } from 'node:fs';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { activeStates } from '../../../scenes/explainers/lib/statecharts.ts';
import { CHARTS, FIXTURE } from '../../../tools/oracle/statecharts.ts';
import type { Expected } from '../../../tools/oracle/statecharts.ts';

/**
 * The states the scene reports come from its own model run; here they are checked against XState's run
 * of the same chart instead: after POWER, PLAY, MUTE the statechart is in playing and muted (inside the
 * boxes that hold them), and POWER then takes it to off.
 */
export function check(values: Record<string, string>, trace: Trace): void {
  const name = values.mute === 'playing' ? 'muteWhilePlaying' : 'mute';
  const follow = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Expected).charts[name]!.follow;
  assertStepState(trace, 'split', { flat: 'playing · muted', active: activeStates(CHARTS[name]!, follow[2]!.config) });
  assertStepState(trace, 'power', { flat: 'off', active: follow[3]!.config });
}
