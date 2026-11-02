import { Group } from '../../../../src/index.ts';
import { find, run } from '../2password.ts';
import { flow, label } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';

/** The script's answer, stated by the second step. */
export const ANSWER = 'The agent handles only an op:// reference, and op puts the value into the app’s environment';

export function frames(auth: 'desktop' | 'service'): ReaderFrame[] {
  const found = find(['cloud api']),
    ref = found.matches[0]!.ref,
    launched = run(auth, { API_KEY: ref }, ['app']);
  return [
    {
      id: 'ask',
      title: 'An agent must start an app with a key it should never read',
      line: 'Predict: what could the agent pass along instead of the key?',
      caption:
        'A coding agent is asked to run app, which reads its API key from the API_KEY environment variable. Whatever the agent reads lands in its context and its transcript, so it should choose the right key and start the app without ever holding the key’s value.',
      values: { needs: 'API_KEY', agentHasValue: false },
      draw: (s) =>
        new Group(
          flow(s, ['Agent', '?', 'Application']),
          // As large as the tiles' names and no wider than the tiles, so a phone opens on all of it.
          label('needs API_KEY', 4.8, -0.3, s.palette.ink, 0.62),
          label('must not read', -4.8, -0.3, s.bad, 0.62),
          label('the value', -4.8, -1.15, s.bad, 0.62),
        ),
    },
    {
      id: 'reader-boundary',
      title: 'Answer: hand over a reference, and let op swap in the value',
      line: `The agent passes ${ref}; only the app gets the value.`,
      caption: `${ANSWER}. A reference names a vault, an item and a field, and is no secret itself. 2password, a wrapper around 1Password’s op CLI, gives the agent references to search for and run with; op resolves them when it starts the app. The app can still read or print its own environment.`,
      values: { ref, agentHasValue: false, childHasValue: !!launched.childEnv.API_KEY },
      draw: (s) =>
        new Group(
          flow(s, ['Agent', 'op CLI', 'Application']),
          label('op:// reference', -2.6, 2.25, s.emphasis, 0.65),
          label('secret value', 2.6, 2.25, s.emphasis, 0.65),
          label(ref, 0, -1.6, s.palette.ink, 0.62),
        ),
    },
  ];
}
