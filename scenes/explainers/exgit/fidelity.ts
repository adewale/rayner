import assert from 'node:assert/strict';
import { pictureWordsAt, assertStepState } from '../../../explain/testing.ts';
import type { Trace } from '../../../explain/testing.ts';
import { Repo, AUTHOR } from './model.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  const repo = new Repo(),
    hello = repo.blob('hello\n'),
    t1 = repo.tree([['100644', 'hello.txt', hello]]),
    c1 = repo.commit({ tree: t1, author: AUTHOR, message: 'first\n' }),
    nextBlob = repo.blob(values.change === 'add' ? 'world\n' : 'hello again\n'),
    t2 = repo.tree(
      values.change === 'add'
        ? [
            ['100644', 'hello.txt', hello],
            ['100644', 'world.txt', nextBlob],
          ]
        : [['100644', 'hello.txt', nextBlob]],
    ),
    c2 = repo.commit({ tree: t2, parents: [c1], author: AUTHOR, message: 'second\n' });
  assertStepState(trace, 'hashes', {
    hello,
    t1,
    c1,
    nextBlob,
    t2,
    c2,
    head: c2,
    shared: values.change === 'add',
  });
  // The counts on screen come from this evidence: the redraw of commit one's row kept every
  // shape it had, and each id morph paired exactly the digits that the longest common runs
  // of the two ids share, wherever they sit.
  const stepOf = (step: string) => trace.steps.find((s) => s.step === step)!;
  const evidence = (step: string, kind: string) => (stepOf(step).evidence ?? []).filter((e) => e.kind === kind);
  const [grown] = evidence('change', 'match');
  assert.ok(grown && grown.removed === 0 && grown.morphed === 0 && (grown.added as number) > 0);
  const ids = evidence('hashes', 'match');
  assert.equal(ids.length, 2);
  const paired = { tree: commonRuns(t1, t2), commit: commonRuns(c1, c2) };
  // The ids are fixed by the bytes, so the counts are too: pinned, as well as computed.
  assert.deepEqual(paired, values.change === 'add' ? { tree: 27, commit: 29 } : { tree: 27, commit: 27 });
  assert.deepEqual(
    ids.map((e) => e.matched),
    [paired.tree, paired.commit],
  );
  // The digits equal place for place, the coloured ones: recorded, and counted in the line.
  const same = (a: string, b: string) => [...a].filter((c, i) => b[i] === c).length;
  const inPlace = { tree: same(t1, t2), commit: same(c1, c2) };
  assert.deepEqual(evidence('hashes', 'samePlace'), [{ kind: 'samePlace', ...inPlace }]);
  const hashes = stepOf('hashes');
  assert.ok(
    String(hashes.meta.line).startsWith(`${inPlace.tree + inPlace.commit} of 80 digits match in place`),
    String(hashes.meta.line),
  );
  // The labels as drawn, read back from the step's picture.
  const shown = pictureWordsAt(trace, 'hashes').full;
  for (const label of [
    `Paired with an equal digit anywhere: tree ${paired.tree}, commit ${paired.commit} of 40`,
    `Same digit in the same place, coloured: tree ${inPlace.tree}, commit ${inPlace.commit} of 40`,
  ])
    assert.ok(shown.includes(label), `${label}\n${shown}`);
  // The change step no longer prints the kept and grown shape counts (the evidence above still
  // holds the redraw to keeping commit one's row whole); its picture names both commits' rows.
  const rows = pictureWordsAt(trace, 'change').full;
  for (const [label, commit, tree] of [['commit one', c1, t1], ['commit two', c2, t2]] as const)
    assert.ok(rows.includes(`${label}: commit ${commit.slice(0, 7)} names tree ${tree.slice(0, 7)}`), `${label}\n${rows}`);
}

/** How many characters two strings share when the longest common runs are taken first, each character once. */
function commonRuns(a: string, b: string): number {
  const usedA = a.split('').map(() => false),
    usedB = b.split('').map(() => false);
  let total = 0;
  for (;;) {
    let best = { len: 0, i: 0, j: 0 };
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++) {
        let len = 0;
        while (i + len < a.length && j + len < b.length && !usedA[i + len] && !usedB[j + len] && a[i + len] === b[j + len])
          len++;
        if (len > best.len) best = { len, i, j };
      }
    if (!best.len) return total;
    for (let k = 0; k < best.len; k++) usedA[best.i + k] = usedB[best.j + k] = true;
    total += best.len;
  }
}
