import { Group, Code } from '../../../../src/index.ts';
import { runSearch } from '../latest-search.ts';
import type { CompletionOrder, Query } from '../latest-search.ts';
import { label, tile, table } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';

/** What the user typed for each search: A is the older keystroke, B the latest. */
export const TYPED: Record<Query, string> = { A: 'ca', B: 'cat' };
const q = (query: Query | null) => (query ? `“${TYPED[query]}”` : 'nothing');
/** The ticket each search takes as it starts: A starts first. */
const TICKET: Record<Query, number> = { A: 1, B: 2 };
/** The script's answer, stated in the second step of both cases. */
export const ANSWER = 'An older search can finish last, and an unguarded handler publishes whatever finishes last';

export async function frames(order: CompletionOrder): Promise<ReaderFrame[]> {
  const [off, on] = await Promise.all([runSearch(false, order), runSearch(true, order)]);
  // The order the promises resolved in, read back from the model's run.
  const done = off.snapshots.slice(1).map((x) => x.completed.at(-1)!);
  const [first, last] = done as [Query, Query];
  const staleWins = off.snapshots.at(-1)!.shown !== 'B';
  const latest = TICKET.B;

  const decisions = done.map((query, i): ReaderFrame => {
    const ticket = TICKET[query],
      accepted = ticket === latest,
      without = off.snapshots[i + 1]!.shown,
      withGuard = on.snapshots[i + 1]!.shown;
    const page =
      without === withGuard
        ? `Both rules now show ${q(without)}.`
        : `Without the guard the page would now show ${q(without)}; with it, the page shows ${q(withGuard)}${withGuard ? '' : ' yet'}.`;
    return {
      id: i === 0 ? 'reader-first' : 'reader-ticket',
      title: accepted
        ? `Answer: published. ${q(query)} lands with ticket ${ticket}, the latest`
        : `Answer: dropped. ${q(query)} lands with ticket ${ticket}, not the latest ${latest}`,
      line:
        i === 0
          ? `Predict: ${q(done[1]!)} lands next with ticket ${TICKET[done[1]!]}. Published or dropped?`
          : `Latest is still ${latest}: finishing a search does not change it.`,
      caption: `${q(query)} carries ticket ${ticket} and latest is ${latest}, so the guard ${accepted ? 'publishes its results' : 'drops its results'}. ${page}`,
      values: { query, ticket, latest, accepted, off: off.snapshots[i + 1], on: on.snapshots[i + 1] },
      draw: (s) =>
        new Group(
          tile(`${q(query)}: ticket ${ticket}`, -4, 1.7, 5.4, 1.2, s),
          tile(`latest = ${latest}`, 4, 1.7, 5, 1.2, s),
          label(accepted ? '=' : '≠', 0, 1.7, accepted ? s.good : s.bad, 1),
          label(accepted ? `Publish ${q(query)}` : `Drop ${q(query)}`, 0, 0, accepted ? s.good : s.bad, 0.8),
          new Code(['if (ticket === latest)', '  publish(result)'], {
            fontSize: 0.7,
            color: s.palette.ink,
          }).moveTo([0, -2.1]),
        ),
    };
  });

  return [
    {
      id: 'race',
      title: `Type ${q('A')}, then ${q('B')}: two searches race`,
      line: `Predict: ${q(first)} answers first and ${q(last)} last. Which results does the page end on?`,
      caption: `Each keystroke starts a search, so ${q('A')} starts first and ${q('B')} second, and the user now wants ${q('B')}. The requests can finish in a different order from the one they started in; here ${q(first)} finishes first. The page starts empty and publishes each successful result as it arrives.`,
      values: { order, completion: done },
      draw: (s) =>
        new Group(
          table(
            ['Search', 'Starts', 'Answers'],
            (['A', 'B'] as const).map((x) => [q(x), x === 'A' ? '1st' : '2nd', x === first ? '1st' : '2nd']),
            s,
            { xs: [-4.2, 0.4, 4.6], y: 2.2, gap: 1.5, size: 0.7 },
          ),
          label(`The user wants ${q('B')}`, 0, -2.6, s.emphasis, 0.75),
        ),
    },
    {
      id: 'overwrite',
      title: staleWins
        ? `Answer: ${q('A')}. The older search lands last and replaces ${q('B')}`
        : `Answer: ${q('B')}, because this time the latest search landed last`,
      line: staleWins
        ? `Predict: what could tell the handler that ${q('A')} is out of date?`
        : `Predict: had ${q('B')} answered first, what would stop ${q('A')} replacing it?`,
      caption: `${ANSWER}. ${
        staleWins
          ? `${q(first)} lands first and the page shows it; then ${q(last)} lands and replaces it. The user typed ${q('B')} and is left looking at results for ${q('A')}.`
          : `${q(first)} lands first and the page shows it for a moment; then ${q(last)} replaces it, so the page ends right by luck. In the other order, ${q('A')} would land on top of ${q('B')}.`
      }`,
      values: { order, off: off.snapshots },
      draw: (s) =>
        new Group(
          table(
            ['After', 'Page shows, no check'],
            off.snapshots.map((snap, i) => [i === 0 ? 'Both start' : `${q(done[i - 1]!)} lands`, q(snap.shown)]),
            s,
            { xs: [-3.4, 3], y: 2.2, gap: 1.5, size: 0.7 },
          ),
          // A result for "ca" on the page is stale: the user has typed "cat".
          ...off.snapshots.flatMap((snap, i) =>
            snap.shown === 'A' ? [label('stale', 6.6, 2.2 - (i + 1) * 1.5, s.bad, 0.62, `stale:${i}`)] : [],
          ),
        ),
    },
    {
      id: 'tickets',
      title: 'Answer: number each search, and publish only the latest',
      line: `Predict: ${q(first)} lands first with ticket ${TICKET[first]}. Published or dropped?`,
      caption: `Give each search a ticket from a counter as it starts: ${q('A')} gets 1, ${q('B')} gets 2, and latest is now 2. Finishing changes neither. When a result lands, publish it only if its ticket is still the latest. Starting a newer request makes every older ticket stale; arrival order cannot make an old ticket current again.`,
      values: { tickets: { A: TICKET.A, B: TICKET.B }, latest },
      draw: (s) =>
        new Group(
          tile(`${q('A')}: ticket ${TICKET.A}`, -4, 2, 5.4, 1.2, s),
          tile(`${q('B')}: ticket ${TICKET.B}`, 4, 2, 5.4, 1.2, s, { active: true }),
          label(`latest = ${latest}`, 0, 0.5, s.emphasis, 0.8),
          new Code(['// when a search starts', 'const ticket = ++latest', '// when its result lands', 'if (ticket === latest) publish(result)'], {
            fontSize: 0.58,
            color: s.palette.ink,
          }).moveTo([0, -2.1]),
        ),
    },
    ...decisions,
    {
      id: 'reader-guard',
      title: staleWins
        ? `With the guard the page ends on ${q('B')}; without it, on ${q('A')}`
        : `Both rules end on ${q('B')}; the guard also skips the flash of ${q('A')}`,
      line: `Both searches have finished; the user still wants ${q('B')}.`,
      caption: `${
        staleWins
          ? `Without the guard, the page ends on ${q(off.snapshots[2]!.shown)}; with it, on ${q(on.snapshots[2]!.shown)}. Older ${q('A')} lands last and would overwrite ${q('B')}; its ticket is stale, so the guard drops it.`
          : `Both rules end on ${q(on.snapshots[2]!.shown)}, because ${q('B')} landed last. Without the guard the page showed ${q(off.snapshots[1]!.shown)} first; with it, ${q(on.snapshots[1]!.shown)} until ${q('B')} arrived.`
      } The guard drops stale results without cancelling the old search, which still runs to the end.`,
      values: { order, off: off.snapshots, on: on.snapshots },
      draw: (s) =>
        table(
          ['After', 'No guard', 'Guard on'],
          off.snapshots.map((snap, i) => [
            i === 0 ? 'Both start' : `${q(done[i - 1]!)} lands`,
            q(snap.shown),
            q(on.snapshots[i]!.shown),
          ]),
          s,
          { xs: [-4.7, 0.3, 5.1], y: 2.5, gap: 1.5 },
        ),
    },
  ];
}
