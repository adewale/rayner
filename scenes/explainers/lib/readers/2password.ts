import { Group } from '../../../../src/index.ts';
import { find, run } from '../2password.ts';
import { flow, label } from '../reader-drawing.ts';
import type { StagedStep } from '../../../../explain/index.ts';
import { staged } from '../staged.ts';

/** The script's answer, stated by the second step. */
export const ANSWER = 'The agent handles only an op:// reference, and op puts the value into the app’s environment';

/** Desktop approvals authenticate op, as the scene's run step assumes. */
export function frames(): StagedStep[] {
  const found = find(['cloud api']),
    ref = found.matches[0]!.ref,
    launched = run('desktop', { API_KEY: ref }, ['app']);
  return [
    staged({
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
          label(`needs ${st.needs}`, 4.8, -0.3, s.palette.ink, 0.62),
          ...(st.agentHasValue ? [] : [label('must not read', -4.8, -0.3, s.bad, 0.62), label('the value', -4.8, -1.15, s.bad, 0.62)]),
        ),
    }),
    staged({
      id: 'reader-boundary',
      title: 'Answer: hand over a reference, and let op swap in the value',
      line: `The agent passes ${ref}; op gives its value to the app.`,
      caption: `${ANSWER}. The reference names a vault, item and field without containing the key. Authenticated op resolves that name when it starts the app. This keeps the value out of the launch request, but the app can still read or print its own environment.`,
      state: { ref, agentHasValue: false, childHasValue: !!launched.childEnv.API_KEY },
      draw: (st, s) =>
        new Group(
          flow(s, ['Agent', 'op CLI', 'Application']),
          label('op:// reference', -2.6, 2.25, s.emphasis, 0.65),
          ...(st.childHasValue ? [label('secret value', 2.6, 2.25, s.emphasis, 0.65)] : []),
          label(st.ref, 0, -1.6, s.palette.ink, 0.62),
        ),
    }),
  ];
}
