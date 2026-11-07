// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { secondCommit } from './objects.ts';

const short = (id: string) => id.slice(0, 7);
const RENAMED = secondCommit('rename'),
  COPIED = secondCommit('copy');
const kinds = (c: ReturnType<typeof secondCommit>) => {
  const types = c.written.map((id) => c.repo.objects[id]!.type);
  return ['blob', 'tree', 'commit']
    .filter((k) => types.includes(k))
    .map((k) => `a ${k}`)
    .join(' and ');
};

export const questions = {
  1: () =>
    `${RENAMED.written.length} objects, ${kinds(RENAMED)}. The name lives in the tree’s bytes, so the tree changes, and so does the commit that names it. The file’s bytes are unchanged, so its id is still ${short(RENAMED.hello)} and the new tree names the stored blob.`,
  2: () =>
    `None. Its bytes hash to ${short(COPIED.hello)}, which is already stored, so the new tree lists both names against that one blob. The commit writes ${COPIED.written.length} objects, ${kinds(COPIED)}.`,
  3: () =>
    `The blobs do: both are ${short(COPIED.hello)}, because a blob’s id depends only on its bytes. Commits match only if all their bytes match, including the tree, the parents, the author and committer lines with their timestamps, and the message, so in practice they differ.`,
};
