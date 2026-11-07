import { Group, Arrow, Text } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { currentFiles, unreachable } from './model.ts';
import type { GitFrame } from './model.ts';
import { label, tile, dot, table } from '../../../explain/drawing.ts';

// How the git-branches explainer draws one frame: the commits and their parent arrows, the branch
// tags and HEAD, a "no branch" tag on a commit no label reaches, and the checked-out files.

/** Commit positions: the two branches fork right from A, and M joins them, spread across the stage. */
const AT: Record<string, Vec> = { A: [-6.1, 0.67], B: [-0.4, 1.47], C: [-0.4, -0.13], M: [5.3, 0.67] };
/** One size for every word but the commit letters: tags, HEAD, the file table and the note. */
const SIZE = 0.62,
  TAG_H = 0.7,
  /** Clear space between a commit's circle and its tag. */
  TAG_GAP = 0.28;
const tagWidth = (name: string) => new Text(name, { fontSize: SIZE }).width() + 0.7;

export function picture(s: Stage, frame: GitFrame, note: string) {
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
          { stroke: s.look.soft, strokeWidth: 0.035, tipLength: 0.16, tipWidth: 0.16 },
        ),
      );
    }
  for (const c of frame.commits) graph.add(dot(c.id, ...AT[c.id]!, s, c.id === frame.current));
  const branches = new Map<string, string[]>();
  for (const [name, id] of [
    ['feature', frame.feature],
    ['main', frame.main],
  ] as const)
    if (id) branches.set(id, [...(branches.get(id) ?? []), name]);
  // Tags sit above their commit, side by side when two branches name it. C sits below the fork with nothing to its
  // right unless M exists, and M only exists once main has moved off C, so C's tag sits to its right.
  const tags: { name: string; box: [number, number, number, number]; bad?: boolean }[] = [];
  const place = (id: string, names: string[], bad = false) => {
    const [x, y] = AT[id]!,
      widths = names.map(tagWidth),
      total = widths.reduce((a, b) => a + b, 0) + 0.25 * (names.length - 1);
    let left = id === 'C' ? x + 0.5 + TAG_GAP : x - total / 2;
    const cy = id === 'C' ? y : y + 0.5 + TAG_GAP + TAG_H / 2;
    names.forEach((name, i) => {
      tags.push({ name, box: [left, cy - TAG_H / 2, left + widths[i]!, cy + TAG_H / 2], bad });
      left += widths[i]! + 0.25;
    });
  };
  for (const [id, names] of branches) place(id, names);
  // A commit no label reaches is marked where its label would be.
  for (const id of unreachable(frame)) place(id, ['no branch'], true);
  for (const t of tags)
    graph.add(
      tile(t.name, (t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2, t.box[2] - t.box[0], TAG_H, s, {
        active: t.name === frame.head,
        bad: t.bad,
        size: SIZE,
      }),
    );
  // HEAD points at the branch it names: beside that tag, toward the side with room.
  const named = tags.find((t) => t.name === frame.head)!.box,
    word = new Text('HEAD', { fontSize: SIZE, color: s.look.ink, weight: 'bold' }),
    cy = (named[1] + named[3]) / 2,
    right = named[2] + 0.75 + word.width() < 7.3,
    edge = right ? named[2] + 0.1 : named[0] - 0.1,
    tail = right ? edge + 0.6 : edge - 0.6;
  const head = new Group(
    word.moveTo([right ? tail + 0.1 : tail - 0.1, cy], [right ? -1 : 1, 0]),
    new Arrow([tail, cy], [edge, cy], { stroke: s.look.ink, strokeWidth: 0.035, tipLength: 0.16, tipWidth: 0.16 }),
  );
  head.key = 'git-head';
  // Without M the history is short, so centre what is drawn rather than leave the stage's right side empty.
  const [x0, , x1] = new Group(graph.copy(), head.copy()).box()!;
  graph.shift([-(x0 + x1) / 2, 0]);
  head.shift([-(x0 + x1) / 2, 0]);
  const files = currentFiles(frame);
  return new Group(
    graph,
    head,
    table(
      ['File', 'Working contents'],
      [
        ['colour.txt', files.colour],
        ['title.txt', files.title ?? 'absent'],
      ],
      s,
      { xs: [-3.3, 2.3], y: -1.55, gap: 0.75, key: 'git-files', size: SIZE },
    ),
    label(note, 0, -3.95, s.look.soft, SIZE),
  );
}
