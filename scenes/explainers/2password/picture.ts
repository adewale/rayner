import { Group } from '../../../src/index.ts';
import { find, run } from './model.ts';
import { flow, label } from '../../../explain/drawing.ts';
import type { Stage, StagedStepsOptions } from '../../../explain/index.ts';


/** Desktop approvals authenticate op, as the scene's run step assumes. */
export function frames(stage: Stage, answer: string, opts?: StagedStepsOptions): Promise<void> {
  const found = find(['cloud api']),
    ref = found.matches[0]!.ref,
    launched = run('desktop', { API_KEY: ref }, ['app']);
  return stage.steps([
    {
      id: 'ask',
      title: 'An agent must start an app without reading its key',
      line: 'Predict: what could the agent pass along instead of the key?',
      caption:
        'The app needs API_KEY in its environment. Printing that value for the agent would also put it into the conversation, though the agent’s job is to choose the credential and start the app, not to read it. What can name the credential without exposing its value?',
      state: { needs: 'API_KEY', agentHasValue: false },
      draw: (st, s) =>
        new Group(
          flow(s, ['Agent', '?', 'Application']),
          // As large as the tiles' names and no wider than the tiles, so a phone opens on all of it.
          label(`needs ${st.needs}`, 4.8, -0.3, s.look.ink, 0.62),
          ...(st.agentHasValue ? [] : [label('must not read', -4.8, -0.3, s.look.bad, 0.62), label('the value', -4.8, -1.15, s.look.bad, 0.62)]),
        ),
    },
    {
      id: 'reader-boundary',
      title: 'Answer: hand over a reference, and let op swap in the value',
      line: `The agent passes ${ref}; op gives its value to the app.`,
      caption: `${answer}. The reference names a vault, item and field without containing the key. Authenticated op resolves that name when it starts the app. This keeps the value out of the launch request, but the app can still read or print its own environment.`,
      state: { ref, agentHasValue: false, childHasValue: !!launched.childEnv.API_KEY },
      draw: (st, s) =>
        new Group(
          flow(s, ['Agent', 'op CLI', 'Application']),
          label('op:// reference', -2.6, 2.25, s.look.emphasis, 0.65),
          ...(st.childHasValue ? [label('secret value', 2.6, 2.25, s.look.emphasis, 0.65)] : []),
          label(st.ref, 0, -1.6, s.look.ink, 0.62),
        ),
    },
  ], opts);
}
