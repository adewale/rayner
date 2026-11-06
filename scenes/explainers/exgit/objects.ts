// The two commits exgit draws, built with the object model in model.ts, and what the second one writes.
// model.test.ts replays each change with the Git CLI and compares the objects it writes.
import { Repo, AUTHOR, parseTree } from './model.ts';

/** add and edit are the scene's scenarios; rename and copy are its check questions. */
export type Change = 'add' | 'edit' | 'rename' | 'copy';

/** A commit's stored text, one line per row. */
export const objectLines = (repo: Repo, id: string) => repo.text(id).replace(/\n$/, '').split('\n');

/** Every object a commit reaches through its tree and parent lines: what a clone has to fetch. */
export function reachable(repo: Repo, from: string): string[] {
  const seen = new Set<string>();
  const walk = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const o = repo.objects[id]!;
    if (o.type === 'commit')
      for (const line of objectLines(repo, id)) {
        if (line === '') break;
        const [k, v] = line.split(' ');
        if (k === 'tree' || k === 'parent') walk(v!);
      }
    else if (o.type === 'tree') for (const [, , child] of parseTree(o.bytes)) walk(child);
  };
  walk(from);
  return [...seen];
}

/**
 * Commit one holds hello.txt ("hello\n"); commit two makes the change. `written` lists the objects commit two reaches
 * that commit one does not, which are the objects the second commit had to write.
 */
export function secondCommit(change: Change) {
  const repo = new Repo(),
    hello = repo.blob('hello\n'),
    t1 = repo.tree([['100644', 'hello.txt', hello]]),
    c1 = repo.commit({ tree: t1, author: AUTHOR, message: 'first\n' });
  const nextBlob =
    change === 'add' ? repo.blob('world\n') : change === 'edit' ? repo.blob('hello again\n') : undefined;
  const t2 = repo.tree(
    change === 'add'
      ? [
          ['100644', 'hello.txt', hello],
          ['100644', 'world.txt', nextBlob!],
        ]
      : change === 'edit'
        ? [['100644', 'hello.txt', nextBlob!]]
        : change === 'rename'
          ? [['100644', 'greeting.txt', hello]]
          : [
              ['100644', 'copy.txt', hello],
              ['100644', 'hello.txt', hello],
            ],
  );
  const c2 = repo.commit({ tree: t2, parents: [c1], author: AUTHOR, message: 'second\n' });
  const before = reachable(repo, c1),
    written = reachable(repo, c2).filter((id) => !before.includes(id));
  return { repo, hello, t1, c1, nextBlob, t2, c2, written };
}
