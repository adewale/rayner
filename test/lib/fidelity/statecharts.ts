import { readFileSync } from 'node:fs';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import assert from 'node:assert/strict';
import { activeStates, RUNS } from '../../../scenes/explainers/lib/statecharts.ts';
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
  // The parent step reaches brewing by replaying the brew's first three events through the model.
  const replayed = (step: string) => (trace.steps.find((s) => s.step === step)!.evidence ?? []).filter((e) => e.kind === 'event').map((e) => e.event);
  assert.deepEqual(replayed('parent'), RUNS.coffee.slice(0, 3));
  assertStepState(trace, 'parent', { config: x.coffee!.follow[2]!.config });
  assertStepState(trace, 'regions', { current: activeStates(CHARTS.player!.chart, x.player!.follow[2]!.config) });
  // The transfer answer: grinding with the frother frothing, inside on.
  assertStepState(trace, 'frother', { current: activeStates(CHARTS.coffeeWithFrother!.chart, x.coffeeWithFrother!.follow[2]!.config) });
  // It gets there by the events XState was sent, replayed through the model one at a time: the
  // machine records each as it begins, and the configuration after the last is XState's.
  assert.deepEqual(replayed('frother'), RUNS.frother.slice(0, 3));
  assertStepState(trace, 'frother', { config: x.coffeeWithFrother!.follow[2]!.config });
}
