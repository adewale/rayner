import { Group } from '../../../../src/index.ts';
import { exec } from '../models.ts';
import { flow, label, table } from '../reader-drawing.ts';
import type { StagedStep } from '../../../../explain/index.ts';
import { stagedStep } from '../../../../explain/index.ts';

/** The script's answer (meta.answer), stated by the second step. */
export const ANSWER = 'exec returns a new shell holding the write and leaves the shell you passed in unchanged';

export function frames(): StagedStep[] {
  const original = { fs: {}, steps: 0 },
    run = exec(
      original,
      [
        ['echo', 'hello'],
        ['tr', 'a-z', 'A-Z'],
      ],
      'shout.txt',
    );
  const old = exec(original, [['cat', 'shout.txt']]).stdout,
    next = exec(run.shell, [['cat', 'shout.txt']]).stdout;
  const prints = (out: string) => (out ? `prints ${out.trim()}` : 'prints nothing');
  return [
    stagedStep({
      id: 'reader-pipeline',
      title: 'The command ran, yet cat finds nothing in shout.txt',
      line: 'Predict: where did HELLO go?',
      caption: `Run echo hello | tr a-z A-Z > shout.txt in a small in-memory shell. echo produces hello and a newline, tr uppercases it, and the redirect stores HELLO in shout.txt instead of printing it. Then run cat shout.txt on the shell you started with: it ${prints(old)}, and nothing reported an error. This model hands strings from command to command; it does not run an operating-system shell.`,
      state: { file: run.shell.fs['shout.txt']!, stdout: run.stdout, startingCat: old },
      draw: (st, s) =>
        new Group(
          flow(s, ['echo hello', `tr → ${st.file.trim()}`, 'shout.txt']),
          label('hello', -2.55, 2.25, s.emphasis, 0.65),
          label(st.file.trim(), 2.55, 2.25, s.emphasis, 0.65),
          label('cat shout.txt on the starting shell:', 0, -1.15, s.palette.ink, 0.62),
          label(prints(st.startingCat), 0, -2.05, s.bad, 0.7),
        ),
    }),
    stagedStep({
      id: 'reader-values',
      title: 'Answer: the file is in the shell exec returned',
      line: 'Same command, two shell values: only the returned one holds shout.txt.',
      caption: `In this model, ${ANSWER}. cat ${prints(next)} with the returned shell and ${prints(old)} with the original, which still has no files. A caller that drops the return value has thrown away the shell that holds the write, although the command ran.`,
      state: { old, next, file: run.shell.fs['shout.txt']! },
      draw: (st, s) =>
        table(
          ['Shell', 'shout.txt', 'cat prints'],
          [
            ['original', 'missing', st.old.trim() || 'nothing'],
            ['returned', st.file.trim(), st.next.trim()],
          ],
          s,
          { xs: [-5, 0, 5], y: 2, gap: 1.6 },
        ),
    }),
  ];
}
