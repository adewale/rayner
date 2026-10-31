import { Group, Arrow } from '../../../../src/index.ts';
import { tile, label } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
import type { Stage } from '../../../../explain/index.ts';
function branches(s: Stage, labelled: boolean, follow = false) {
  return new Group(
    tile('Cached?', -4.8, 0.3, 4.2, 1.3, s),
    tile('Reply', 4.8, 1.8, 4, 1.1, s),
    tile('Database', 4.8, -1.8, 4, 1.1, s),
    new Arrow([-2.5, 0.6], [2.6, 1.8], {
      stroke: follow ? s.good : s.emphasis,
      strokeWidth: follow ? 0.08 : 0.05,
      tipLength: 0.18,
      tipWidth: 0.16,
    }),
    new Arrow([-2.5, -0.1], [2.6, -1.8], { stroke: s.emphasis, strokeWidth: 0.05, tipLength: 0.18, tipWidth: 0.16 }),
    label(labelled ? 'yes' : '?', 0, 2, s.palette.ink, 0.8),
    label(labelled ? 'no' : '?', 0, -2.1, s.palette.ink, 0.8),
  );
}
export function frames(missing: boolean): ReaderFrame[] {
  return [
    {
      id: 'reader-branches',
      title: 'Which branch means “cache hit”?',
      line: missing ? 'The first edit omits both branch labels.' : 'The first edit labels both branches.',
      caption: missing
        ? 'Both arrows leave Cached? without saying which answer follows each route. The verifier reports the missing labels by edge ID; the author must decide which answer leads to Reply.'
        : 'The labels send yes to Reply and no to Database. The verifier can check those links and labels, while the application’s cache policy still needs its own tests.',
      values: { missing },
      draw: (s) => branches(s, !missing),
    },
    {
      id: 'reader-repair',
      title: missing ? 'Repair the edge, then check the route' : 'Check the labels, then follow the route',
      line: 'yes → Reply; no → Database.',
      caption: missing
        ? 'Adding yes and no assigns an answer to each edge. The highlighted yes route reaches Reply. The source edit and captured routes are checked; those checks cover structure, while the author remains responsible for the diagram’s meaning.'
        : 'Both labels are present, so this case needs no repair. The highlighted yes route reaches Reply. Snapshot and route checks cover that structure, while the application’s cache policy needs its own tests.',
      values: { labels: ['yes', 'no'] },
      draw: (s) => branches(s, true, true),
    },
  ];
}
