import { assertFollowsStory, answersIn, worldsOf } from '../../../test/lib/story-fidelity.ts';
import type { Trace } from '../../../explain/testing.ts';
import { STORY, next, start } from './model.ts';
import type { Policy } from './model.ts';

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  const worlds = worldsOf(start(values.company as Policy), next, STORY);
  assertFollowsStory(trace, worlds, (world) => answersIn(world.last).flatMap((answer) => [String(answer.status), ...(answer.error ? [answer.error] : [])]), ['first-use']);
}
