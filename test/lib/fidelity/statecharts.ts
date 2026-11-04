import { readFileSync } from 'node:fs';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { activeStates } from '../../../scenes/explainers/lib/statecharts.ts';
import { CHARTS, FIXTURE } from '../../../tools/oracle/statecharts.ts';
import type { Expected } from '../../../tools/oracle/statecharts.ts';

/**
 * The states the scene reports come from its own model run; here they are checked against XState's run
 * of the same charts: the coffee machine is brewing when POWER_OFF arrives, and the player is in
 * playing and muted (inside on) after POWER, PLAY, MUTE, and the coffee machine with a frother is grinding
 * and frothing after POWER_ON, START, FROTH.
 */
export function check(_values: Record<string, string>, trace: Trace): void {
  const x = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as Expected).charts;
  assertStepState(trace, 'parent', { current: activeStates(CHARTS.coffee!.chart, x.coffee!.follow[2]!.config) });
  assertStepState(trace, 'regions', { current: activeStates(CHARTS.player!.chart, x.player!.follow[2]!.config) });
  // The transfer answer: grinding with the frother frothing, inside on.
  assertStepState(trace, 'frother', { current: activeStates(CHARTS.coffeeWithFrother!.chart, x.coffeeWithFrother!.follow[2]!.config) });
}
