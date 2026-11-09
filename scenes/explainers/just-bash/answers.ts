// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { exec } from './model.ts';
import type { Shell } from './model.ts';

const q = (v: string) => JSON.stringify(v);
const files = (sh: Shell) => Object.keys(sh.fs).join(', ') || 'none';
const empty: Shell = { fs: {}, steps: 0 },
  first = exec(empty, [['echo', 'hi']], 'a.txt').shell,
  second = exec(empty, [['echo', 'bye']], 'b.txt').shell,
  plain = exec(empty, [
    ['echo', 'hello'],
    ['tr', 'a-z', 'A-Z'],
  ]);
let ls = '';
try {
  exec(first, [['ls']]);
} catch (error) {
  ls = error instanceof Error ? error.message : String(error);
}
const CHECK = { branch: { second: files(second) }, plain: { stdout: plain.stdout, files: files(plain.shell) }, ls };

export const questions = {
  1: () =>
    `The second result holds ${CHECK.branch.second} and nothing else. a.txt is in the first result, because the second command started from the empty shell, which never received the first write.`,
  2: () =>
    `It prints ${q(CHECK.plain.stdout)}, and the returned shell holds ${CHECK.plain.files === 'none' ? 'no files' : CHECK.plain.files}. Without a redirect the text stays on standard output, so there is no write for the returned shell to carry.`,
  3: () =>
    `exec throws “${CHECK.ls}”, because this model has branches only for echo, tr and cat. The error says nothing about shout.txt; cat on the returned shell would print its contents.`,
};
