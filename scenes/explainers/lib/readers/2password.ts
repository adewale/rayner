import { Group } from '../../../../src/index.ts';
import { find, run, PROMPTS_PER_COMMAND } from '../2password.ts';
import { flow, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(auth: 'desktop' | 'service'): ReaderFrame[] {
  const found = find(['cloud api']),
    ref = found.matches[0]!.ref,
    launched = run(auth, { API_KEY: ref }, ['app']);
  return [
    {
      id: 'reader-boundary',
      title: 'Who gets the secret value?',
      line: 'op resolves a reference when it starts the application.',
      caption:
        'Discovery returns an op:// reference. When the command runs, op resolves it and starts the application with the secret in its environment. The application can still read or print that environment; the reference keeps the value out of discovery output.',
      values: { ref, agentHasValue: false, childHasValue: !!launched.childEnv.API_KEY },
      draw: (s) =>
        new Group(
          flow(s, ['Agent', 'op CLI', 'Application']),
          label('op:// reference', -2.6, 2.25, s.emphasis, 0.65),
          label('secret value', 2.6, 2.25, s.emphasis, 0.65),
          label('Discover a reference; deliver a value', 0, -1.8, s.palette.ink, 0.7),
        ),
    },
    {
      id: 'reader-auth',
      title: 'Does the service token reach the app?',
      line: `Authentication: ${auth === 'desktop' ? 'desktop approval' : 'service account'}.`,
      caption:
        auth === 'service'
          ? 'The op process receives the service-account token. Its child command unsets OP_SERVICE_ACCOUNT_TOKEN and receives the resolved API key. Other inherited variables still pass through; removing this token does not isolate the whole environment.'
          : 'In the upstream README’s desktop model, each command asks for approval. There is no service-account token to pass on, but the application still receives the resolved API key.',
      values: {
        auth,
        prompts: PROMPTS_PER_COMMAND[auth],
        opToken: 'OP_SERVICE_ACCOUNT_TOKEN' in launched.opEnv,
        childToken: 'OP_SERVICE_ACCOUNT_TOKEN' in launched.childEnv,
      },
      draw: (s) =>
        table(
          ['Process', 'Service token', 'Resolved key'],
          [
            ['Agent', 'not shown', 'no'],
            ['op CLI', auth === 'service' ? 'yes' : 'no', 'resolves'],
            ['Application', 'no', 'yes'],
          ],
          s,
          { xs: [-5.4, 0, 5.1], y: 2.6, gap: 1.5 },
        ),
    },
  ];
}
