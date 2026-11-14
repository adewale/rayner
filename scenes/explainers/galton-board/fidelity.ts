import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState, assertSteps } from '../../../explain/testing.ts';
import { FIRST, ROWS, binOf, boardStory, pile, routes } from './model.ts';

/** Every count, share and route a step shows is the model's; the model has its own Python oracle in model.test.ts. */
export function check(trace: Trace): void {
  const m = boardStory(), none = Array<number>(ROWS + 1).fill(0);
  assertSteps(trace, ['drop', 'predict', 'pile', 'paths', 'bell', 'edges']);
  // One ball, down the first route: it lies in the bin its rights name.
  assertStepState(trace, 'drop', { rows: ROWS, dropped: 1, counts: none.map((_, k) => (k === binOf(FIRST) ? 1 : 0)), routes: [[...FIRST]] });
  assertStepState(trace, 'predict', { rows: ROWS, dropped: 0, counts: none, routes: [] });
  // One ball down every route: the pile is the model's count of routes per bin.
  for (const step of ['pile', 'paths', 'bell', 'edges']) assertStepState(trace, step, { rows: ROWS, dropped: 2 ** ROWS, counts: pile(ROWS) });
  // The routes the paths step draws are routes of the model: the only one to the left edge, and three to the middle.
  const drawn = (trace.steps.find((s) => s.step === 'paths')!.after as { routes: string[][] }).routes, all = routes(ROWS).map((r) => r.join(''));
  assert.equal(drawn.length, 4);
  for (const route of drawn) assert.ok(all.includes(route.join('')), route.join(''));
  assert.deepEqual(drawn.map((r) => binOf(r as ('L' | 'R')[])), [0, m.most, m.most, m.most]);
  assert.equal(new Set(drawn.map((r) => r.join(''))).size, 4);
  assertStepState(trace, 'bell', { span: { lo: m.lo, hi: m.hi, middle: m.middle, exact: m.exact, curve: m.curve } });
  assertStepState(trace, 'edges', { tails: { beyond: m.beyond, edgeCurve: m.edgeCurve, edgeExact: m.edgeExact } });
  const meta = (step: string) => trace.steps.find((s) => s.step === step)!.meta;
  // The prediction's answer is the model's fullest bin, and the next step's words give the same counts.
  assert.equal(meta('predict').predict?.answer, m.most === ROWS / 2 ? 'The middle bin' : 'An edge bin');
  assert.equal(meta('pile').title, `The middle bin gets ${m.counts[m.most]} balls, each edge bin ${m.counts[0]}`);
  assert.match(String(meta('pile').caption), /20 of those routes end in the middle bin while only 1 ends in each edge bin/);
  assert.match(String(meta('pile').caption), /a ball is 20 times as likely to finish in the middle as at the far left/);
  assert.match(String(meta('bell').caption), /hold 50 of the 64 balls, 78\.1%\..*is 77\.9% of the curve’s whole area/);
  assert.match(String(meta('edges').caption), /1\.56% of the balls; the curve gives that bin 1\.85%.*putting 0\.21% of its area/);
}
