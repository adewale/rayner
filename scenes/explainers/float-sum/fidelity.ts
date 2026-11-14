import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState, assertSteps } from '../../../explain/testing.ts';
import { SUMS, others, sumStory } from './model.ts';

const CHOICE: Record<string, keyof typeof SUMS> = { 'two-tenths': '0.1+0.2', 'three-tenths': '0.1+0.3' };

/** Every double, place and printed decimal a step shows is the model's, in both sums; the model has its own CPython oracle. */
export function check(trace: Trace, values: Record<string, string>): void {
  const m = sumStory(SUMS[CHOICE[values.sum!]!]);
  assertSteps(trace, ['surprise', 'stored', 'line', 'predict', 'round', 'print', 'others']);
  // What the machine says about the sum is the machine's own arithmetic on this run.
  const [a, b, expected] = [Number(m.a), Number(m.b), Number(m.expected)];
  assert.equal(m.sum, a + b);
  assert.equal(m.equal, a + b === expected);
  assert.equal(m.prints, String(a + b));
  const base = { a: m.a, b: m.b, expected: m.expected, equal: m.equal, prints: m.prints, expectedPrints: m.expectedPrints };
  for (const step of trace.steps) assertStepState(trace, step.step, base);
  const kept = m.stored.map(({ typed, double }) => ({ typed, double })), ticks = m.ticks.map((t) => t.double);
  assertStepState(trace, 'surprise', { stored: [], ticks: [] });
  assertStepState(trace, 'stored', { stored: kept, ticks: [] });
  assertStepState(trace, 'line', { stored: kept, ticks, expectedAt: m.expectedAt, expectedTick: m.expectedTick });
  // The question shows the exact sum's place and not yet its tick; the next step gives the tick.
  assertStepState(trace, 'predict', { ticks, sumAt: m.sumAt, sumTick: null });
  for (const step of ['round', 'print']) assertStepState(trace, step, { ticks, expectedAt: m.expectedAt, expectedTick: m.expectedTick, sumAt: m.sumAt, sumTick: m.sumTick });
  assertStepState(trace, 'others', { others: others() });
  const meta = (step: string) => trace.steps.find((s) => s.step === step)!.meta;
  assert.equal(meta('predict').predict?.answer, m.equal ? `The same double as ${m.expected}` : 'A different double');
  // The words follow the outcome: the title of the rounding step, and the line that says whether == holds.
  assert.match(String(meta('round').title), m.equal ? /onto the double 0\.4 is kept as/ : /one double past 0\.3’s/);
  assert.match(String(meta('round').line), m.equal ? /is true/ : /is false/);
  assert.match(String(meta('print').title), new RegExp(`prints as ${m.prints.replace('.', '\\.')},`));
  assert.match(String(meta('stored').caption), /3602879701896397 over 2 to the power 55, a little high/);
  assert.match(String(meta('line').caption), m.equal ? /three fifths of the way across a gap/ : /a fifth of the way across a gap/);
  assert.match(String(meta('line').caption), /2 to the power minus 54, about 0\.000000000000000055/);
}
