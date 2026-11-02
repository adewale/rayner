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
        question: 'After M is made, stay on main and run git merge feature again. Does main move back to B, make another commit, or stay at M?',
        answer:
          'It stays at M. B is already in M’s history, so Git reports Already up to date. Main has already incorporated feature; moving main back to B would discard C from main’s history.',
      },
      {
        question: 'After M is made, switch to feature and run git merge main, with fast-forwards allowed. New commit, fast-forward, or no change?',
        answer:
          'Fast-forward. Feature is at B, which is already one of M’s parents, while main has commits feature lacks. Git moves feature from B to M without making a commit.',
      },
      {
        question: 'Start again with feature at B and main at M. On feature, run git merge --no-ff main. Could Git fast-forward, and what does this option ask it to do instead?',
        answer:
          'A fast-forward would be possible because B is in M’s history. --no-ff asks Git to create a merge commit anyway, with B as its first parent and M as its second. The history makes a fast-forward possible; the chosen merge policy decides whether to use it.',
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
      'Both branches started at A, where colour.txt is blue. On feature, B made it green;';
    const lessons = [
      {
        id: 'question',
        title: advanced ? 'Both branches moved on. Can a merge just move main to B?' : 'Only feature moved on. Can a merge just move main to B?',
        line: advanced
          ? 'Predict: if the main label moved to B, which edit would main lose?'
          : 'Predict: if the main label moved to B, would main lose anything?',
        caption: advanced
          ? `${intro} on main, commit C added title.txt, Home. We have main checked out (HEAD), so the files below are C’s. A branch label names a commit; arrows lead back through its history. Could moving main to B combine the edits?`
          : `${intro} main has made no commit since, so it still points at A. We have main checked out (HEAD), so the files below are A’s. A branch label names a commit; arrows lead back through its history. Could moving main to B bring in feature’s edit?`,
        state: shown(before),
        draw: (s: Stage) => picture(s, before, 'Arrows point from a commit to its parent.'),
      },
      ...(advanced
        ? [
            {
              id: 'lost',
              title: 'Answer: the Home edit. No branch would reach C',
              line: `B’s history is ${history(moved, 'B').join(', then ')}; C is not in it.`,
              caption: `With main on B, checking out main gives ${currentFiles(moved).colour} and no title.txt. B’s history is ${history(moved, 'B').join(', then ')}, so neither branch would contain C or the Home edit. C is still stored: moving the label does not delete the commit. To keep main’s history, following parent arrows from its new destination must still reach its old commit. A merge needs a new commit when each branch has a commit the other lacks.`,
              state: shown(moved, { lost: unreachable(moved) }),
              draw: (s: Stage) => picture(s, moved, 'C is outside both branch histories.'),
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
          : 'Main’s commit, A, is B’s parent, so B already holds everything main had. With fast-forwards allowed, git merge feature moves main from A to B, a fast-forward: no new commit, and colour.txt turns green. A merge needs a new commit when each branch has a commit the other lacks; here only feature does.',
        state: shown(merged),
        draw: (s: Stage) => picture(s, merged, advanced ? 'M records parents C and B.' : 'main moves to existing commit B.'),
      },
      {
        id: 'countercase',
        title: advanced ? 'Answer: no. Without C, main just moves to B' : 'Answer: no. With C on main, the merge needs M',
        line: advanced ? 'A is in B’s history, so moving main to B loses nothing.' : 'M has parents C and B, so main keeps both edits.',
        caption: advanced
          ? 'Here main never made C and still points at A, B’s parent. With fast-forwards allowed, git merge feature moves main to B; colour.txt turns green. --no-ff would request a merge commit even here: that is a policy choice, not a missing edit.'
          : 'Here main made C, adding Home. B does not contain C, so moving main to B would drop that edit from main’s history. git merge feature creates M with parents C and B, keeping green and Home. --no-ff can request a commit even when a fast-forward could keep both histories.',
        state: { frame: other, files: currentFiles(other), advanced: !advanced },
        draw: (s: Stage) => picture(s, other, advanced ? 'main moves to existing commit B.' : 'M records parents C and B.'),
      },
    ];
    await lesson(this, lessons);
  }
}
