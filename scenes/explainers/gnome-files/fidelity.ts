import assert from 'node:assert/strict';
import type { Trace } from '../../../explain/testing.ts';
import { assertStepState, assertSteps } from '../../../explain/testing.ts';
import { COLOURS, GROUPS, PARTICIPANTS, SCORE, gaveUp, giveUps, quitters, scoreOf } from './model.ts';
import type { Participant } from './model.ts';

/** Every scenario's step state equals the heat map's answers for that participant. */
export function check(trace: Trace, values: Record<string, string>): void {
  const p = values.participant as Participant;
  assert.ok(PARTICIPANTS.includes(p), `unknown participant ${p}`);
  assertStepState(trace, 'test', { key: Object.fromEntries(COLOURS.map((c) => [c, SCORE[c]])) });
  const mine = gaveUp(p);
  // One journey, of the group holding this participant's first give-up; a gray cell has no score and no column.
  const group = GROUPS.find((g) => g.includes(mine[0]!))!;
  assertStepState(trace, 'journey', { journey: group.filter((n) => scoreOf(n, p) != null).map((n) => [n, scoreOf(n, p)]) });
  // The study and its colour key come first, before any result.
  assert.equal(trace.steps[0]!.step, 'test');
  assertSteps(trace, ['test', 'give-ups', 'journey']);
  assertStepState(trace, 'give-ups', {
    giveUps: {
      mine,
      others: Object.fromEntries(mine.map((n) => [n, quitters(n).filter((q) => q !== p)])),
      total: giveUps().length,
    },
  });
  // The journey's heading says a give-up, which its group always holds.
  assert.match(String(trace.steps.find((s) => s.step === 'journey')!.meta.title), /gave up on/);
  assert.ok(group.some((n) => mine.includes(n)));
}
