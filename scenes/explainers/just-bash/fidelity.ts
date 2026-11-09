import type { Trace } from '../../../explain/testing.ts';
import { assertStepState } from '../../../explain/testing.ts';
import { exec } from './model.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  const original = { fs: {}, steps: 0 },
    run = exec(
      original,
      [
        ['echo', 'hello'],
        ['tr', 'a-z', 'A-Z'],
      ],
      'shout.txt',
    ),
    cat = exec(run.shell, [['cat', 'shout.txt']]);
  assertStepState(trace, 'cat', { oldShell: original, newShell: run.shell, cat: cat.stdout });
}
