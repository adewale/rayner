import { readFileSync } from 'node:fs';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { activeStates } from '../../../scenes/explainers/lib/statecharts.ts';
import { CHARTS, FIXTURE } from '../../../tools/oracle/statecharts.ts';
import type { Expected } from '../../../tools/oracle/statecharts.ts';

/**
 * The states the scene reports come from its own model run; here they are checked against XState's run
 * of the same charts: the coffee machine is brewing when POWER_OFF arrives, and the player is in
 * playing and muted (inside on) after POWER, PLAY, MUTE.
 */
export function check(_values: Record<string, string>, trace: Trace): void {
  const x = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Expected).charts;
  assertStepState(trace, 'parent', { current: activeStates(CHARTS.coffee!.chart, x.coffee!.follow[2]!.config) });
  assertStepState(trace, 'regions', { current: activeStates(CHARTS.player!.chart, x.player!.follow[2]!.config) });
}
