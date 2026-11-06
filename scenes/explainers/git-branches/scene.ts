import { Scene } from '../../../src/index.ts';
import { settingsOf, stage } from '../../../explain/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { gitStory, currentFiles, history, moveMainToFeature, unreachable } from './model.ts';
import type { GitFrame } from './model.ts';
import { picture } from './picture.ts';

export default class GitBranches extends Scene {
  static meta = {
    id: 'git-branches',
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
    /** A step's picture: its frame, and words under it. */
    type Shown = { frame: GitFrame; advanced: boolean };
    // After the merge: M with two parents when main had moved on, else main moved to B.
    const mergeNote = (st: Shown) => (st.advanced ? 'M records parents C and B.' : 'main moves to existing commit B.');
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
        draw: (st: Shown, s: Stage) => picture(s, st.frame, 'Arrows point from a commit to its parent.'),
      },
      ...(advanced
        ? [
            {
              id: 'lost',
              title: 'Answer: the Home edit. No branch would reach C',
              line: `B’s history is ${history(moved, 'B').join(', then ')}; C is not in it.`,
              caption: `With main on B, checking out main gives ${currentFiles(moved).colour} and no title.txt. B’s history is ${history(moved, 'B').join(', then ')}, so neither branch would contain C or the Home edit. C is still stored: moving the label does not delete the commit. To keep main’s history, following parent arrows from its new destination must still reach its old commit. A merge needs a new commit when each branch has a commit the other lacks.`,
              state: shown(moved, { lost: unreachable(moved) }),
              draw: (st: Shown, s: Stage) => picture(s, st.frame, 'C is outside both branch histories.'),
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
          : 'Main’s commit, A, is B’s parent, so B already holds everything main had. git merge feature moves main from A to B without a new commit, which Git calls a fast-forward and does by default, and colour.txt turns green. A merge needs a new commit when each branch has a commit the other lacks; here only feature does.',
        state: shown(merged),
        draw: (st: Shown, s: Stage) => picture(s, st.frame, mergeNote(st)),
      },
      {
        id: 'countercase',
        title: advanced ? 'Answer: no. Without C, main just moves to B' : 'Answer: no. With C on main, the merge needs M',
        line: advanced ? 'A is in B’s history, so moving main to B loses nothing.' : 'M has parents C and B, so main keeps both edits.',
        caption: advanced
          ? 'Here main never made C and still points at A, B’s parent. git merge feature moves main to B without a new commit, which Git calls a fast-forward, and colour.txt turns green. Git fast-forwards by default; the option --no-ff would make a merge commit here anyway, by choice, though no edit would be lost without one.'
          : 'Here main made C, adding Home. B does not contain C, so moving main to B would drop that edit from main’s history. git merge feature creates M with parents C and B, keeping green and Home. --no-ff can request a commit even when a fast-forward could keep both histories.',
        state: { frame: other, files: currentFiles(other), advanced: !advanced },
        // The other history's merge: its state says which.
        draw: (st: Shown, s: Stage) => picture(s, st.frame, mergeNote(st)),
      },
    ];
    await stage(this, { style: 'github-light', headingSize: 0.6 }).steps(lessons);
  }
}
