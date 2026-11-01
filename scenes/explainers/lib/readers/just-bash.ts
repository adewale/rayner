import { Group } from '../../../../src/index.ts';
import { exec } from '../models.ts';
import { flow, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(): ReaderFrame[] {
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
  return [
    {
      id: 'reader-pipeline',
      title: 'Where does HELLO go?',
      line: 'echo → tr → a file in the returned shell.',
      caption:
        'echo writes hello and a newline into the pipe. tr uppercases it; the redirect stores HELLO in shout.txt in the returned shell. This in-memory model supports the commands used here.',
      values: { file: run.shell.fs['shout.txt'], stdout: run.stdout },
      draw: (s) =>
        new Group(
          flow(s, ['echo hello', 'tr → HELLO', 'shout.txt']),
          label('hello', -2.55, 2.25, s.emphasis, 0.65),
          label('HELLO', 2.55, 2.25, s.emphasis, 0.65),
          label('Redirected stdout: empty', 0, -1.8, s.palette.ink, 0.7),
        ),
    },
    {
      id: 'reader-values',
      title: 'Which shell can read the file?',
      line: 'Compare the two shell values after the same command.',
      caption:
        'cat prints HELLO when it receives the returned shell, which owns shout.txt. The original shell has no files because exec returns a new shell instead of mutating the old one.',
      values: { old, next },
      draw: (s) =>
        table(
          ['Shell', 'shout.txt', 'cat prints'],
          [
            ['original', 'missing', old.trim() || 'nothing'],
            ['returned', run.shell.fs['shout.txt']!.trim(), next.trim()],
          ],
          s,
          { xs: [-5, 0, 5], y: 2, gap: 1.6 },
        ),
    },
  ];
}
