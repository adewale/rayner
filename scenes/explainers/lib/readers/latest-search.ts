import { Group, Code } from '../../../../src/index.ts';
import { runSearch } from '../latest-search.ts';
import type { CompletionOrder } from '../latest-search.ts';
import { label, tile, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export async function frames(order: CompletionOrder): Promise<ReaderFrame[]> {
  const [off, on] = await Promise.all([runSearch(false, order), runSearch(true, order)]);
  const done = off.snapshots.slice(1).map((x) => x.completed.at(-1)!);
  const decisions = done.map((query, i): ReaderFrame => {
    const ticket = query === 'A' ? 1 : 2,
      accepted = ticket === 2;
    return {
      id: i === 0 ? 'reader-first' : 'reader-ticket',
      title: `${query} finishes: may it publish?`,
      line: 'Starting B made ticket 2 the latest; finishing a request does not change it.',
      caption: `Request ${query} carries ticket ${ticket}. The latest ticket is still 2, so the guarded handler ${accepted ? 'publishes this result' : 'discards this completion'}. Without the check, the page now shows ${off.snapshots[i + 1]!.shown}; with it, ${on.snapshots[i + 1]!.shown ?? 'nothing yet'}.`,
      values: { query, ticket, latest: 2, accepted, off: off.snapshots[i + 1], on: on.snapshots[i + 1] },
      draw: (s) =>
        new Group(
          tile(`Ticket ${ticket}`, -4, 1.7, 5, 1.2, s),
          tile('Latest 2', 4, 1.7, 5, 1.2, s),
          label(accepted ? '=' : '≠', 0, 1.7, accepted ? s.good : s.bad, 1),
          label(accepted ? `Publish ${query}` : `Discard ${query}`, 0, 0, accepted ? s.good : s.bad, 0.8),
          new Code(['if (ticket === latest)', '  publish(result)'], {
            fontSize: 0.7,
            color: s.palette.ink,
          }).moveTo([0, -2.1]),
        ),
    };
  });
  return [
    {
      id: 'reader-order',
      title: 'Can the older search finish last?',
      line: 'A starts first. B is the latest request.',
      caption: `Starting A assigns ticket 1; starting B assigns ticket 2 and replaces latest with 2. Their promises will finish ${done.join(' then ')}. Predict which result remains without a guard. The model resolves real promises in that order.`,
      values: { order, completion: done },
      draw: (s) =>
        new Group(
          tile('A: ticket 1', -4, 1.6, 6, 1.2, s),
          tile('B: ticket 2', 4, 1.6, 6, 1.2, s),
          label('Latest intent: B', 0, -0.4, s.emphasis, 0.85),
          label('A then B', -4, -2, s.soft, 0.65),
          label(`Finish: ${done.join(' then ')}`, 3.3, -2, s.palette.ink, 0.65),
        ),
    },
    ...decisions,
    {
      id: 'reader-guard',
      title: 'Compare both publication rules',
      line: 'Both requests have finished; the latest intent remains B.',
      caption: `Without the guard, the page ends on ${off.snapshots[2]!.shown}; with it, the page ends on ${on.snapshots[2]!.shown}. ${order === 'new-first' ? 'Older A finishes last and would overwrite B.' : 'When B finishes last, both rules end on B.'} The guard discards stale publication without cancelling the old work.`,
      values: { order, off: off.snapshots, on: on.snapshots },
      draw: (s) =>
        table(
          ['After', 'No guard', 'Guard on'],
          off.snapshots.map((snap, i) => [
            i === 0 ? 'Both start' : `${done[i - 1]} finishes`,
            snap.shown ?? 'none',
            on.snapshots[i]!.shown ?? 'none',
          ]),
          s,
          { xs: [-4.7, 0.3, 5.1], y: 2.5, gap: 1.5 },
        ),
    },
  ];
}
