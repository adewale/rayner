import { assertFollowsStory, worldsOf } from '../../../test/lib/story-fidelity.ts';
import type { Trace } from '../../../explain/testing.ts';
import { STORY, next, progress, start } from './model.ts';

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  // The verdict the agent reaches, in the picture's words: whom the document speaks for, or why it was refused.
  assertFollowsStory(trace, worldsOf(start(), next, STORY), (world) => {
    const { verdict } = progress(world);
    return [`${world.ran} of 4 checks run`, ...(!verdict ? ['No verdict yet'] : verdict.accepted ? [verdict.company, verdict.userId] : [verdict.reason])];
  });
}
