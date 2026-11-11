import { assertFollowsStory, answersIn, worldsOf } from '../../../test/lib/story-fidelity.ts';
import type { Trace } from '../../../explain/testing.ts';
import { next, start, storyOf } from './model.ts';
import type { SignIn } from './model.ts';

const SIGN_INS: Record<string, SignIn> = { 'signed-in': 'signed in', 'signed-out': 'signed out', 'no-scope': 'signed in without the browser scope' };

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  // The logins step draws the draft's table of joins and logins, not the last answer, so no answer is looked for there.
  const signIn = SIGN_INS[values.signin!]!;
  assertFollowsStory(trace, worldsOf(start(signIn), next, storyOf(signIn)), (world, step) => (step === 'logins' ? [] : answersIn(world.last)).flatMap((answer) => [String(answer.status), ...(answer.error ? [answer.error] : [])]));
}
