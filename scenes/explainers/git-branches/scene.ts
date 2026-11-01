import { Scene, Group, Arrow, Text } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { settingsOf } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { gitStory, currentFiles } from '../lib/git-branches.ts';
import type { GitFrame } from '../lib/git-branches.ts';
import { lesson, label, tile, dot, table } from '../lib/lesson-drawing.ts';

function picture(s: Stage, frame: GitFrame, phase: number) {
  const at: Record<string, Vec> = { A: [-5.7, 0.9], B: [-0.8, 1.45], C: [-0.8, 0], M: [4.8, 0.9] };
  const graph = new Group();
  graph.key = 'git-history';
  for (const c of frame.commits)
    for (const parent of c.parents) {
      const a = at[c.id]!,
        b = at[parent]!,
        d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      graph.add(
        new Arrow(
          [a[0] + ((b[0] - a[0]) * 0.6) / d, a[1] + ((b[1] - a[1]) * 0.6) / d],
          [b[0] - ((b[0] - a[0]) * 0.6) / d, b[1] - ((b[1] - a[1]) * 0.6) / d],
          { stroke: s.soft, strokeWidth: 0.035, tipLength: 0.14, tipWidth: 0.14 },
        ),
      );
    }
  for (const c of frame.commits) graph.add(dot(c.id, ...at[c.id]!, s, c.id === frame.current));
  const branches = new Map<string, string[]>();
  for (const [name, id] of [
    ['main', frame.main],
    ['feature', frame.feature],
  ] as const)
    if (id) branches.set(id, [...(branches.get(id) ?? []), name]);
  for (const [id, names] of branches) {
    const [x, y] = at[id]!;
    graph.add(
      tile(
        names.join(' / '),
        names.length === 2 ? x + 0.3 : x,
        y + (id === 'C' ? -0.9 : 0.95),
        names.length === 2 ? 4.2 : 2.2,
        0.65,
        s,
        {
          active: names.includes(frame.head),
          size: 0.666,
        },
      ),
    );
  }
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
      { xs: [-4, 3.2], y: -1.4, gap: 0.85, key: 'git-files', size: 0.66 },
    ),
    label(
      phase === 4 && frame.merge === 'none' && frame.main === 'A'
        ? 'No new commit: main remains at A.'
        : frame.merge === 'commit'
          ? 'M records parents C and B.'
          : frame.merge === 'fast-forward'
            ? 'main moves to existing commit B.'
            : 'Arrows point to parent commits.',
      0,
      -4,
      s.soft,
      0.66,
    ),
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
      other = gitStory(!advanced).at(-1)!;
    const descriptions = [
      [
        'start',
        'A branch label points to a commit',
        'main and HEAD select snapshot A.',
        'Commit A stores blue in colour.txt. The main label selects A, and HEAD names main. The file panel shows the snapshot currently checked out.',
      ],
      [
        'branch',
        'A new branch shares the same commit',
        'Creating feature adds a label, without adding a snapshot.',
        'Both main and feature point to A. Creating feature has not copied the history or made a new commit. HEAD still names main.',
      ],
      [
        'feature',
        'Only feature advances to B',
        'B changes colour.txt from blue to green.',
        'After switching to feature, committing the colour change creates B with parent A. Feature moves to B; main remains at A.',
      ],
      [
        'switch',
        'Switching main restores snapshot A',
        'The file panel returns to blue.',
        'Switching to main changes which snapshot is checked out. HEAD names main at A, so colour.txt is blue again; feature still points to green snapshot B.',
      ],
      [
        'main',
        advanced ? 'An independent edit creates C' : 'Main stays at the shared commit',
        advanced ? 'C adds title.txt while retaining blue.' : 'This countercase makes no independent edit on main.',
        advanced
          ? 'Main adds title.txt containing Home and advances to C. Neither branch now contains the other branch’s latest commit. The edits affect separate files.'
          : 'Main remains at A, which is already an ancestor of feature’s B. There is no independent title.txt change to combine.',
      ],
      [
        'merge',
        advanced ? 'M joins the two histories' : 'A fast-forward moves the label',
        advanced
          ? 'M has parents C and B and includes both edits.'
          : 'The existing snapshot B already contains everything needed.',
        advanced
          ? 'With these nonconflicting edits, git merge feature creates M with parents C and B. Main moves to M; its files contain green and Home. Feature remains at B.'
          : 'With fast-forwarding allowed, git merge feature moves main from A to B. The checked-out file becomes green, and no merge commit is created.',
      ],
      [
        'countercase',
        advanced ? 'Without C, main can fast-forward' : 'With C, the histories need a merge',
        advanced
          ? 'Remove the independent main commit and compare the result.'
          : 'Add the independent main commit and compare the result.',
        advanced
          ? 'In this second history, main never made C. Because A is an ancestor of B, the merge can advance main to B. The earlier history needed M to record both lines of development.'
          : 'In this second history, main made C independently. With nonconflicting files, the merge creates M with two parents. The difference is the history being combined; both examples allow fast-forwarding.',
      ],
    ] as const;
    const commands = [
      'git switch main',
      'git branch feature',
      'git switch feature; git commit',
      'git switch main',
      advanced ? 'git commit' : 'No new commit on main',
      'git merge feature',
      'Compare the other history',
    ];
    const lessons = descriptions.map(([id, title, line, caption], i) => {
      const frame = i === 6 ? other : frames[i]!;
      return {
        id: String(id),
        title: String(title),
        line: String(line),
        caption: `${commands[i]}. ${caption}`,
        state: { frame, files: currentFiles(frame), advanced: i === 6 ? !advanced : advanced },
        draw: (s: Stage) => picture(s, frame, i),
      };
    });
    const before = frames[4]!;
    lessons.splice(5, 0, {
      id: 'predict',
      title: 'Can main move to B without losing anything?',
      line: advanced ? 'C belongs to main, but is not an ancestor of B.' : 'A is already an ancestor of B.',
      caption: advanced
        ? 'C contains the Home edit; B contains the green edit. If main moved to B, which edit would its snapshot lose? Which parents and files would a merge commit need?'
        : 'Main points to A, an ancestor of B. Does it have an independent commit to preserve? Could merging move the label to B, or must it create a commit?',
      state: { frame: before, files: currentFiles(before), advanced },
      draw: (s) => {
        const g = picture(s, before, 4);
        (g.children.at(-1) as Text).setText(
          advanced ? 'Can main move to B without losing C?' : 'Is a new commit needed to move main to B?',
        );
        return g;
      },
    });
    await lesson(this, lessons);
  }
}
