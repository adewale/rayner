import { assertFollowsStory, worldsOf } from '../../../test/lib/story-fidelity.ts';
import type { Trace } from '../../../explain/testing.ts';
import { STORY, next, ruleOf, start } from './model.ts';

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  // The rule of the draft the model picks for each world, and the conversation's fields, in the picture's words.
  assertFollowsStory(trace, worldsOf(start(), next, STORY), (world) => {
    const rule = ruleOf(world), { main } = world;
    return [`section ${rule.section} of the draft: ${rule.says}`, ...(main ? [`working ${main.working}, handoff ${main.handoff}, responder ${main.responder}, closed ${main.closed}`] : [])];
  });
}
