import { Group, Line, Arrow } from '../../../../src/index.ts';
import { runSearch } from '../latest-search.ts';
import type { CompletionOrder, Query } from '../latest-search.ts';
import { label, tile, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export async function frames(guarded: boolean, order: CompletionOrder): Promise<ReaderFrame[]> {
  const [off, on] = await Promise.all([runSearch(false, order), runSearch(true, order)]),
    done = off.snapshots.slice(1).map((x) => x.completed.at(-1)!);
  return [
    {
      id: 'reader-order',
      title: 'Can the older search finish last?',
      line: 'Start A, then B. B is the latest request.',
      caption: `A starts before B, but completion order is controlled separately: ${done.join(' then ')}. Predict which result remains on screen after both finish without a guard. These are real promises; their resolution order is controlled rather than timed by a network.`,
      values: { order, completion: done },
      draw: (s) =>
        new Group(
          label('Start order', -4.5, 2.7, s.soft, 0.7),
          label('Finish order', 4.2, 2.7, s.soft, 0.7),
          tile('A then B', -4.5, 1.1, 5, 1.2, s),
          tile(done.join(' then '), 4.2, 1.1, 5, 1.2, s),
          label('Latest intent: B', 0, -1.5, s.emphasis, 0.85),
        ),
    },
    {
      id: 'reader-guard',
      title: 'Compare both publication rules',
      line: `Selected case: guard ${guarded ? 'on' : 'off'}.`,
      caption: `Without the guard, the page ends on ${off.snapshots[2]!.shown}; with it, the page ends on ${on.snapshots[2]!.shown}. Each completion compares its ticket with the latest request’s ticket before publishing. An old request can finish, but its stale result is discarded.`,
      values: { order, off: off.snapshots, on: on.snapshots },
      draw: (s) =>
        table(
          ['After', 'No guard', 'Guard on'],
          off.snapshots.map((snap, i) => [
            i === 0 ? 'Both start' : done[i - 1] + ' finishes',
            snap.shown ?? 'none',
            on.snapshots[i]!.shown ?? 'none',
          ]),
          s,
          { xs: [-4.7, 0.3, 5.1], y: 2.5, gap: 1.5 },
        ),
    },
  ];
}
