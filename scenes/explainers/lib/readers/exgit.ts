import { Group, Arrow } from '../../../../src/index.ts';
import { Repo, AUTHOR } from '../git.ts';
import { tile, label, flow } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(which: string): ReaderFrame[] {
  const repo = new Repo(),
    blob = repo.blob('hello\n'),
    tree = repo.tree([['100644', 'hello.txt', blob]]),
    commit = repo.commit({ tree, author: AUTHOR, message: 'first\n' }),
    add = which === 'add',
    next = repo.blob('world\n'),
    tree2 = repo.tree(
      add
        ? [
            ['100644', 'hello.txt', blob],
            ['100644', 'world.txt', next],
          ]
        : [['100644', 'hello.txt', next]],
    ),
    commit2 = repo.commit({ tree: tree2, parents: [commit], author: AUTHOR, message: 'second\n' }),
    short = (id: string) => id.slice(0, 7);
  return [
    {
      id: 'reader-objects',
      title: 'What does a commit point to?',
      line: 'Commit → tree → file content; the branch names the commit.',
      caption:
        'A commit records a tree and history metadata. The tree maps filenames to blobs; each blob holds file content. The boxes show seven-digit prefixes of the model’s real object IDs. The source walkthrough retains the full bytes and hashes.',
      values: { blob, tree, commit },
      draw: (s) =>
        new Group(
          flow(s, ['commit', 'tree', 'blob']),
          label(short(commit), -5.15, -0.3, s.palette.ink, 0.7),
          label(short(tree), 0, -0.3, s.palette.ink, 0.7),
          label(short(blob), 5.15, -0.3, s.palette.ink, 0.7),
          label('main → commit', 0, 2.5, s.emphasis, 0.7),
          label('hello.txt → hello', 0, -2.4, s.soft, 0.7),
        ),
    },
    {
      id: 'reader-change',
      title: add ? 'Does adding a file copy the old content?' : 'What changes when file content changes?',
      line: 'Old objects remain; a new commit points to a new tree.',
      caption: add
        ? 'Adding world.txt creates a blob, tree and commit. The new tree reuses the original hello blob. The branch moves to the new commit, whose parent link still reaches the first commit.'
        : 'Editing hello.txt creates a blob with a new ID. That changes the tree’s bytes and ID, then the commit’s ID. Updating the branch names the new commit; the parent link keeps the old snapshot reachable.',
      values: { add, blob, next, tree, tree2, commit, commit2 },
      draw: (s) =>
        new Group(
          ...[
            [commit, tree, blob],
            [commit2, tree2, add ? blob : next],
          ].map(
            (row, r) =>
              new Group(
                ...row.map((id, i) =>
                  tile(short(id), (i - 1) * 5, 1.4 - r * 3.1, 4.1, 1.1, s, {
                    active: r === 1,
                    size: 0.75,
                    key: `object:${r}:${i}`,
                  }),
                ),
                new Arrow([-2.8, 1.4 - r * 3.1], [-2.2, 1.4 - r * 3.1], {
                  stroke: s.emphasis,
                  strokeWidth: 0.04,
                  tipLength: 0.15,
                  tipWidth: 0.15,
                }),
                new Arrow([2.2, 1.4 - r * 3.1], [2.8, 1.4 - r * 3.1], {
                  stroke: s.emphasis,
                  strokeWidth: 0.04,
                  tipLength: 0.15,
                  tipWidth: 0.15,
                }),
              ),
          ),
          ...['Commit', 'Tree', 'Blob'].map((name, i) => label(name, (i - 1) * 5, 2.5, s.palette.ink, 0.65)),
          new Arrow([-5, -1.05], [-5, 0.75], { stroke: s.soft, strokeWidth: 0.04, tipLength: 0.15, tipWidth: 0.15 }),
          label('parent', -3.4, -0.2, s.soft, 0.7),
          ...(add
            ? [
                tile(short(next), 5, -3.5, 4.1, 0.9, s, { active: true, size: 0.75, key: 'new-world-blob' }),
                new Arrow([2.2, -2], [2.8, -3.2], {
                  stroke: s.emphasis,
                  strokeWidth: 0.04,
                  tipLength: 0.15,
                  tipWidth: 0.15,
                }),
                label('New world.txt blob →', -2, -3.5, s.palette.ink, 0.65),
              ]
            : [label('New IDs; old objects still exist', 0, -3.3, s.palette.ink, 0.7)]),
        ),
    },
  ];
}
