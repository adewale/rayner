import { assertFollowsStory, answersIn, worldsOf } from '../../../test/lib/story-fidelity.ts';
import assert from 'node:assert/strict';
import { checkMotion } from './oracle/fidelity.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';
import { pictureWordsAt } from '../../../explain/testing.ts';
import type { Trace } from '../../../explain/testing.ts';
import { STORY, next, start } from './model.ts';
import type { Policy } from './model.ts';

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>, {scenario}: FidelityRun): Promise<void> {
  const worlds = worldsOf(start(values.company as Policy), next, STORY);
  assertFollowsStory(trace, worlds, (world) => answersIn(world.last).flatMap((answer) => [String(answer.status), ...(answer.error ? [answer.error] : [])]), ['first-use', 'late-copy']);
  const detail = trace.steps.filter(step => step.step === 'late-copy');
  assert.equal(detail.length, 1, 'one late-copy detail in each policy');
  const expected = worldsOf(start(values.company as Policy), next, ['send', 'late']).at(-1)!;
  assert.deepEqual(detail[0]!.after, expected, 'the detail shows the old header, not an expired delegation');
  assert.equal(detail[0]!.meta.kind, 'detail');
  const words = pictureWordsAt(trace, 'late-copy').full;
  for (const required of ['signed at 00:13:20', 'arriving at 00:15:20', 'failed at time', 'outside the 60 s window'])
    assert.ok(words.includes(required), `late-copy picture lacks ${required}`);
  await checkMotion(scenario);
}
