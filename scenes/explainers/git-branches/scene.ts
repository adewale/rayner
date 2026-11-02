import { Scene, Group, Arrow } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { gitStory, currentFiles, history, moveMainToFeature, unreachable } from '../lib/git-branches.ts';
import type { GitFrame } from '../lib/git-branches.ts';
import { lesson, label, tile, dot, table } from '../lib/lesson-drawing.ts';

/** Commit positions: the two branches fork right from A, and M joins them. */
const AT: Record<string, Vec> = { A: [-5.7, 1.15], B: [-0.8, 1.75], C: [-0.8, 0.25], M: [4.8, 1.15] };

function picture(s: Stage, frame: GitFrame, note: string) {
  const graph = new Group();
  graph.key = 'git-history';
  for (const c of frame.commits)
    for (const parent of c.parents) {
      const a = AT[c.id]!,
        b = AT[parent]!,
        d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      graph.add(
        new Arrow(
          [a[0] + ((b[0] - a[0]) * 0.6) / d, a[1] + ((b[1] - a[1]) * 0.6) / d],
          [b[0] - ((b[0] - a[0]) * 0.6) / d, b[1] - ((b[1] - a[1]) * 0.6) / d],
          { stroke: s.soft, strokeWidth: 0.035, tipLength: 0.14, tipWidth: 0.14 },
        ),
      );
    }
  for (const c of frame.commits) graph.add(dot(c.id, ...AT[c.id]!, s, c.id === frame.current));
  const branches = new Map<string, string[]>();
  for (const [name, id] of [
    ['main', frame.main],
    ['feature', frame.feature],
  ] as const)
    if (id) branches.set(id, [...(branches.get(id) ?? []), name]);
  // C sits below the fork, so its tag goes underneath; every other tag sits above its commit.
  const tagY = (id: string) => AT[id]![1] + (id === 'C' ? -0.9 : 0.9);
  for (const [id, names] of branches) {
    const [x] = AT[id]!;
    graph.add(
      tile(names.join(' / '), names.length === 2 ? x + 0.3 : x, tagY(id), names.length === 2 ? 4.6 : 2.5, 0.7, s, {
        active: names.includes(frame.head),
        size: 0.62,
      }),
    );
  }
  // A commit no label reaches is marked where its label would be.
  for (const id of unreachable(frame)) graph.add(tile('no branch', AT[id]![0], tagY(id), 3.4, 0.7, s, { bad: true, size: 0.62 }));
  const files = currentFiles(frame);
  return new Group(
    graph,
    label(`HEAD: ${frame.head}`, 4.9, 2.75, s.palette.ink, 0.66, 'git-head'),
    table(
      ['File', 'Working contents'],
      [
        ['colour.txt', files.colour],
        ['title.txt', files.title ?? 'absent'],
      ],
      s,
      { xs: [-4, 3.2], y: -1.6, gap: 0.8, key: 'git-files', size: 0.66 },
    ),
    label(note, 0, -3.95, s.soft, 0.66),
  );
}

export default class GitBranches extends Scene {
  static meta = {
    id: 'git-branches',
    title: 'Why does a merge sometimes need a new commit?',
    sources: [
      'https://git-scm.com/docs/git-merge/2.52.0',
      'https://git-scm.com/docs/git-branch/2.52.0',
      'https://learngitbranching.js.org/',
    ],
    // The script's answer and check questions (script.md); `lost` (diverged) or `merge` (linear) states the answer.
    answer: 'A merge needs a new commit when each branch has a commit the other lacks',
    checks: [
      {
        question: 'In the diverged history, why can’t git merge feature just point main at B?',
        answer:
          'B’s history is B, then A: it doesn’t contain C. With main on B, no branch would reach C, so main would lose the Home edit. The merge commit M keeps both.',
      },
      {
        question: 'After M is made, you switch to feature and run git merge main. New commit or fast-forward?',
        answer:
          'Fast-forward. Feature is at B, which is already one of M’s parents, so feature has no commit main lacks, and Git just moves feature to M.',
      },
    ],
  };
  static settings = [
    {
      id: 'history',
      label: 'Main history',
      default: 'diverged',
      options: [
        { value: 'diverged', label: 'Main makes its own commit' },
        { value: 'linear', label: 'Main stays at the shared commit' },
      ],
    },
  ];
  override async construct() {
    const advanced = settingsOf(this).history === 'diverged',
      frames = gitStory(advanced),
      before = frames[4]!,
      merged = frames[5]!,
      moved = moveMainToFeature(before),
      other = gitStory(!advanced).at(-1)!;
    const shown = (frame: GitFrame, extra: Record<string, unknown> = {}) => ({
      frame,
      files: currentFiles(frame),
      advanced,
      ...extra,
    });
    const intro =
      'A branch is a label on a commit, and each commit points back to its parent. Both branches started at A, where colour.txt is blue. On feature, commit B made it green;';
    const lessons = [
      {
        id: 'question',
        title: advanced ? 'Both branches moved on. Can a merge just move main to B?' : 'Only feature moved on. Can a merge just move main to B?',
        line: advanced
          ? 'Predict: if the main label moved to B, which edit would main lose?'
          : 'Predict: if the main label moved to B, would main lose anything?',
        caption: advanced
          ? `${intro} on main, commit C added title.txt, Home. HEAD, the branch checked out, is main, so the files below are C’s. The cheapest merge would just move the main label to B.`
          : `${intro} main has made no commit since, so it still points at A. HEAD, the branch checked out, is main, so the files below are A’s. The cheapest merge would just move the main label to B.`,
        state: shown(before),
        draw: (s: Stage) => picture(s, before, 'Arrows point from a commit to its parent.'),
      },
      ...(advanced
        ? [
            {
              id: 'lost',
              title: 'Answer: the Home edit. No branch would reach C',
              line: `B’s history is ${history(moved, 'B').join(', then ')}; C is not in it.`,
              caption: `With main on B, checking out main gives ${currentFiles(moved).colour} and no title.txt. B’s history is ${history(moved, 'B').join(', then ')}, so C, and the Home edit with it, would be on no branch. Moving a label is safe only when the commit it leaves is already in the new commit’s history. A merge needs a new commit when each branch has a commit the other lacks.`,
              state: shown(moved, { lost: unreachable(moved) }),
              draw: (s: Stage) => picture(s, moved, 'No branch reaches C, so Home is lost.'),
            },
          ]
        : []),
      {
        id: 'merge',
        title: advanced ? 'So git merge writes M, a commit with two parents' : 'Answer: nothing. git merge just moves main to B',
        line: advanced
          ? 'Predict: if main had never made C, would Git still need M?'
          : 'Predict: if main had made its own commit first, would moving the label still do?',
        caption: advanced
          ? 'git merge feature creates M with parents C and B and moves main to it. M’s files have both edits, green and Home, because the two edits touch different files. Feature stays at B, and C stays in main’s history.'
          : 'Main’s commit, A, is B’s parent, so B already holds everything main had. git merge feature moves main from A to B, a fast-forward: no new commit, and colour.txt turns green. A merge needs a new commit when each branch has a commit the other lacks; here only feature does.',
        state: shown(merged),
        draw: (s: Stage) => picture(s, merged, advanced ? 'M records parents C and B.' : 'main moves to existing commit B.'),
      },
      {
        id: 'countercase',
        title: advanced ? 'Answer: no. Without C, main just moves to B' : 'Answer: no. With C on main, the merge needs M',
        line: advanced ? 'A is in B’s history, so moving main to B loses nothing.' : 'M has parents C and B, so main keeps both edits.',
        caption: advanced
          ? 'In this other history main never made C, so it still points at A, B’s parent. git merge feature moves main to B with no new commit, a fast-forward, and colour.txt turns green. The merge commit in the first history existed to keep C.'
          : 'In this other history main made C, which adds title.txt, Home. Moving main to B would leave C on no branch, so git merge feature creates M with parents C and B, and main’s files have green and Home. Git fast-forwards whenever it can; here it can’t.',
        state: { frame: other, files: currentFiles(other), advanced: !advanced },
        draw: (s: Stage) => picture(s, other, advanced ? 'main moves to existing commit B.' : 'M records parents C and B.'),
      },
    ];
    await lesson(this, lessons);
  }
}
