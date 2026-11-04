import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../explainer-state.ts';
import { COLOURS, GROUPS, PARTICIPANTS, SCORE, gaveUp, giveUps, quitters, scoreOf } from '../../../scenes/explainers/lib/gnome-files.ts';
import type { Participant } from '../../../scenes/explainers/lib/gnome-files.ts';

/** Every scenario's step state equals the heat map's answers for that participant. */
export function check(trace: Trace, values: Record<string, string>): void {
  const p = values.participant as Participant;
  assert.ok(PARTICIPANTS.includes(p), `unknown participant ${p}`);
  assertStepState(trace, 'test', { key: Object.fromEntries(COLOURS.map((c) => [c, SCORE[c]])) });
  const steps = ['tasks-1-4', 'tasks-5-8', 'tasks-9-11'];
  GROUPS.forEach((group, g) => {
    // A gray cell has no score and no column.
    const shown = group.filter((n) => scoreOf(n, p) != null);
    assertStepState(trace, steps[g]!, { [`journey${g + 1}`]: shown.map((n) => [n, scoreOf(n, p)]) });
  });
  const mine = gaveUp(p);
  assertStepState(trace, 'give-ups', {
    giveUps: {
      mine,
      others: Object.fromEntries(mine.map((n) => [n, quitters(n).filter((q) => q !== p)])),
      total: giveUps().length,
    },
  });
  // The headings name what the model says this participant gave up on, group by group.
  const title = (step: string) => String(trace.steps.find((s) => s.step === step)!.meta.title);
  GROUPS.forEach((group, g) => {
    const quit = group.filter((n) => mine.includes(n));
    assert.equal(title(steps[g]!).endsWith('no give-ups'), quit.length === 0, title(steps[g]!));
  });
}
