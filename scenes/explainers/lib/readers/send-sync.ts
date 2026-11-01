import { Group, Arrow } from '../../../../src/index.ts';
import { build, threads, WRAPS, RULES } from '../send-sync.ts';
import type { Wrapper, Inner } from '../send-sync.ts';
import { tile, label, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(wrapper: Wrapper, inner: Inner): ReaderFrame[] {
  const layers = build(wrapper, inner),
    run = threads(wrapper, inner),
    last = layers.at(-1)!;
  const requirements = WRAPS[wrapper].map((ctor, i) => ({
    ctor,
    needs: RULES[ctor].send,
    input: layers[i]!,
    result: layers[i + 1]!,
  }));
  const rules = requirements
    .map(({ ctor, needs }) => `${ctor} needs T to be ${needs === 'send' ? 'Send' : 'both Send and Sync'}.`)
    .join(' ');
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
      id: 'reader-requirements',
      title: 'Apply each wrapper’s requirement to its input',
      line: 'For each row, T is the type produced by the row above.',
      caption: `${rules} Each row applies its requirement to the type produced by the row above. In these cases, a satisfied requirement gives the wrapper both traits; a failed requirement gives it neither.`,
      values: { layers, requirements },
      draw: (s) =>
        new Group(
          label(`Start: ${layers[0]!.name}`, 0, 2.3, s.emphasis, 0.7),
          label(`Input Send: ${layers[0]!.send ? 'yes' : 'no'}`, -3.8, 1.25, s.palette.ink, 0.65),
          label(`Input Sync: ${layers[0]!.sync ? 'yes' : 'no'}`, 3.8, 1.25, s.palette.ink, 0.65),
          table(
            ['Wrapper', 'Needs from T', 'Met?'],
            WRAPS[wrapper].map((ctor, i) => [
              ctor,
              RULES[ctor].send === 'send' ? 'Send' : 'Send + Sync',
              (RULES[ctor].send === 'send' ? layers[i]!.send : layers[i]!.send && layers[i]!.sync)
                ? 'yes'
                : 'no',
            ]),
            s,
            { xs: [-5, 0, 5.2], y: 0.1, gap: 1 },
          ),
          label(
            `Result Send: ${last.send ? 'yes' : 'no'} · Sync: ${last.sync ? 'yes' : 'no'}`,
            0,
            -2.9,
            s.palette.ink,
            0.65,
          ),
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
