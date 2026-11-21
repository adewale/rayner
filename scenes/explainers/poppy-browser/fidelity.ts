import { assertFollowsStory, answersIn, worldsOf } from '../../../test/lib/story-fidelity.ts';
import assert from 'node:assert/strict';
import { Text } from '../../../src/index.ts';
import { intersect } from '../../../src/box.ts';
import { LiveSink, liveSteps, runLive } from '../../../explain/internal.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';
import type { Trace } from '../../../explain/testing.ts';
import { next, start, storyOf } from './model.ts';
import type { SignIn } from './model.ts';

const SIGN_INS: Record<string, SignIn> = { 'signed-in': 'signed in', 'signed-out': 'signed out', 'no-scope': 'signed in without the browser scope' };

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>, { scenario, project }: FidelityRun): Promise<void> {
  // The logins step draws the draft's table of joins and logins, not the last answer, so no answer is looked for there.
  const signIn = SIGN_INS[values.signin!]!;
  assertFollowsStory(trace, worldsOf(start(signIn), next, storyOf(signIn)), (world, step) => (step === 'logins' ? [] : answersIn(world.last)).flatMap((answer) => [String(answer.status), ...(answer.error ? [answer.error] : [])]));

  // A live load press makes room before the new record occupies its rack slot.
  assert.deepEqual(project.scenarios.map(s => s.values.signin).sort(), ['no-scope', 'signed-in', 'signed-out']);
  let sawPair = false;
  const host = await new scenario.Scene(new LiveSink()).run();
  const places = [...liveSteps(host)];
  assert.equal(places.length, 1);
  const [step, place] = places[0]!;
  await runLive(scenario.Scene, step, place, ['load'], { from: 'start', animate: {
    async frame(scene) {
      const rows = scene.familyMembers().filter(m => /^row:[^:]+:stub$/.test(m.key ?? ''));
      const visible = rows.flatMap(row => row.family().filter((m): m is Text => m instanceof Text &&
        m.children.length > 0 && m.children.every(g => g.style.opacity >= 0.95)).map(word => ({ key: row.key, word })));
      for (const [i, a] of visible.entries()) for (const b of visible.slice(i + 1)) {
        if (a.key === b.key) continue;
        sawPair = true;
        assert.equal(intersect(a.word.box()!, b.word.box()!), null,
          `${scenario.values.signin}: ${a.word.text} and ${b.word.text} occupy the same record slot`);
      }
    },
  } });
  assert.ok(sawPair, 'the load step actually displayed the existing and newly issued records');
}
