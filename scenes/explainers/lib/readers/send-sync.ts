import { Group, Arrow } from '../../../../src/index.ts';
import { build, threads } from '../send-sync.ts';
import type { Wrapper, Inner } from '../send-sync.ts';
import { tile, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(wrapper: Wrapper, inner: Inner): ReaderFrame[] {
  const layers = build(wrapper, inner),
    run = threads(wrapper, inner),
    last = layers.at(-1)!;
  return [
    {
      id: 'reader-threads',
      title: 'Move the value or share a reference?',
      line: run.name,
      caption: `Send permits moving ownership to another thread. Sync permits sending a shared reference: &T is Send when T is Sync. For ${run.name}, the move closure is ${run.spawnMove ? 'accepted' : 'rejected'} and the scoped borrow is ${run.scopeBorrow ? 'accepted' : 'rejected'}. All modelled types are ’static; real borrows must also satisfy their lifetime constraints.`,
      values: { ...run },
      draw: (s) =>
        new Group(
          tile('Thread A', -4.8, 1.8, 4, 1, s),
          tile('Thread B', 4.8, 1.8, 4, 1, s),
          new Arrow([-2.5, 0.1], [2.5, 0.1], {
            stroke: run.spawnMove ? s.good : s.bad,
            strokeWidth: 0.06,
            tipLength: 0.18,
            tipWidth: 0.18,
          }),
          label(`owned T: ${run.spawnMove ? 'yes' : 'no'}`, 0, 0.8, s.palette.ink, 0.7),
          new Arrow([-2.5, -2], [2.5, -2], {
            stroke: run.scopeBorrow ? s.good : s.bad,
            strokeWidth: 0.06,
            tipLength: 0.18,
            tipWidth: 0.18,
          }),
          label(`shared &T: ${run.scopeBorrow ? 'yes' : 'no'}`, 0, -1.3, s.palette.ink, 0.7),
        ),
    },
    {
      id: 'reader-wrappers',
      title: 'Does wrapping it make sharing safe?',
      line: 'Read the requirements from the inside out.',
      caption: `The wrappers produce ${last.name}.${last.name.includes('Arc<') ? ' Arc makes its reference count safe to share; its contents must also be Send and Sync.' : ''}${last.name.includes('Mutex<') ? ' A Mutex can be Sync only when its contents are Send.' : ''} Apply each wrapper’s requirements from the inner type outward to obtain the table’s results.`,
      values: { layers },
      draw: (s) =>
        table(
          ['Type', 'Send', 'Sync'],
          layers.map((l) => [l.name, l.send ? 'yes' : 'no', l.sync ? 'yes' : 'no']),
          s,
          { xs: [-3.5, 2.9, 5.9], y: 2.5, gap: 1.5 },
        ),
    },
  ];
}
