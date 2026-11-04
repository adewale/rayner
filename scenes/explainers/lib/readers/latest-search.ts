import { Group, Code, Rectangle, Line, Circle, Arrow } from '../../../../src/index.ts';
import type { Stage } from '../../../../explain/index.ts';
import { runSearch } from '../latest-search.ts';
import type { CompletionOrder, Query, Lifetime, PageSpan } from '../latest-search.ts';
import { label, tile } from '../reader-drawing.ts';
import type { StagedStep } from '../../../../explain/index.ts';

/** What the user typed for each search: A is the older keystroke, B the latest. */
export const TYPED: Record<Query, string> = { A: 'ca', B: 'cat' };
const q = (query: Query | null) => (query ? `“${TYPED[query]}”` : 'nothing');
/** The ticket each search takes as it starts: A starts first. */
const TICKET: Record<Query, number> = { A: 1, B: 2 };
/** The guarded handler's check, as one line: the last line of the tickets step's code, set at the
 * same size, so it sits in the same place in every step that shows it. */
const CHECK = 'if (ticket === latest) publish(result)';
const CODE_SIZE = 0.58;
/** The script's answer, stated in the second step of both cases. */
export const ANSWER = 'An older search can finish last, and an unguarded handler publishes whatever finishes last';

/** The timeline's event clock: tick t sits at x(t); the last span runs on to the right edge. */
const tickX = (t: number) => -3.2 + t * 2.4,
  RIGHT_EDGE = 6.8,
  ROW_LABEL_X = -7.1;
/** Each search as a bar from the tick it starts to the tick its result lands, from the model's lifetimes; beneath
 * them, one track per rule of what the page shows between events, from the model's page spans. A dashed line
 * drops from each landing to the tracks, where the page changes or, under the guard, may not. */
function timeline(s: Stage, lifetimes: readonly Lifetime[], tracks: readonly { name: string; page: readonly PageSpan[]; key: string }[]) {
  const rowLabel = (text: string, y: number, color = s.palette.ink) => label(text, 0, 0, color, 0.62).moveTo([ROW_LABEL_X, y], [-1, 0]);
  const bars = new Group(
    ...lifetimes.flatMap(({ query, start, land }, i) => {
      const y = 2.4 - i * 1.2,
        color = query === 'B' ? s.emphasis : s.soft,
        a = tickX(start),
        b = tickX(land);
      return [
        rowLabel(q(query), y),
        new Rectangle({ width: b - a, height: 0.6, fill: color, fillOpacity: 0.35, stroke: color, strokeWidth: 0.03 }).moveTo([(a + b) / 2, y]),
        new Circle({ radius: 0.18, fill: color, stroke: color }).moveTo([b, y]),
      ];
    }),
  );
  bars.key = 'timeline-searches';
  const axisY = 0.1;
  const axis = new Group(
    new Arrow([tickX(0), axisY], [RIGHT_EDGE, axisY], { stroke: s.soft, strokeWidth: 0.03, tipLength: 0.2, tipWidth: 0.16 }),
    label('time', 0, 0, s.soft, 0.62).moveTo([RIGHT_EDGE, axisY - 0.4], [1, 0]),
  );
  const top = -0.75,
    rowY = (i: number) => top - 0.95 - i * 1.25;
  const rows = tracks.map(({ name, page, key }, i) => {
    const y = rowY(i);
    const g = new Group(
      rowLabel(name, y),
      ...page.flatMap(({ from, to, shown }) => {
        const a = tickX(from) + 0.04,
          b = (to === null ? RIGHT_EDGE : tickX(to)) - 0.04,
          stale = shown === 'A',
          // A landing inside the span changed nothing here; its dashed line crosses the span, so the words sit before it.
          inside = lifetimes.map((l) => l.land).filter((t) => t > from && (to === null || t < to)),
          end = inside.length ? tickX(Math.min(...inside)) - 0.04 : b;
        return [
          new Rectangle({ width: b - a, height: 0.9, fill: s.palette.paper, stroke: stale ? s.bad : s.soft, strokeWidth: stale ? 0.055 : 0.025 }).moveTo([(a + b) / 2, y]),
          label(shown ? q(shown) : 'nothing', (a + end) / 2, y, stale ? s.bad : shown ? s.palette.ink : s.soft, 0.62),
        ];
      }),
    );
    g.key = key;
    return g;
  });
  const drops = tracks.length
    ? lifetimes.map(({ land }, i) => {
        const x = tickX(land),
          d = new Line([x, 2.4 - i * 1.2 - 0.2], [x, rowY(tracks.length - 1) - 0.55], { stroke: s.soft, strokeWidth: 0.025 });
        d.style.dashArray = '0.12 0.1';
        return d;
      })
    : [];
  return new Group(bars, axis, ...drops, ...(tracks.length ? [rowLabel('Page shows', top, s.soft)] : []), ...rows);
}

export async function frames(order: CompletionOrder): Promise<StagedStep[]> {
  const [off, on] = await Promise.all([runSearch(false, order), runSearch(true, order)]);
  // The order the promises resolved in, read back from the model's run.
  const done = off.snapshots.slice(1).map((x) => x.completed.at(-1)!);
  const [first, last] = done as [Query, Query];
  const staleWins = off.snapshots.at(-1)!.shown !== 'B';
  const latest = TICKET.B;

  const decisions = done.map((query, i): StagedStep => {
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
      state: { query, ticket, latest, accepted, off: off.snapshots[i + 1], on: on.snapshots[i + 1] },
      draw: (_, s) =>
        new Group(
          tile(`${q(query)}: ticket ${ticket}`, -4, 2, 5.4, 1.2, s),
          tile(`latest = ${latest}`, 4, 2, 5.4, 1.2, s),
          label(accepted ? '=' : '≠', 0, 2, accepted ? s.good : s.bad, 1),
          label(accepted ? `Publish ${q(query)}` : `Drop ${q(query)}`, 0, 0.5, accepted ? s.good : s.bad, 0.8),
          new Code([CHECK], { fontSize: CODE_SIZE, color: s.palette.ink }).moveTo([0, -1.35]),
          // What each rule leaves on the page after this result, from the model's two runs.
          label(`Page now: ${q(withGuard)} with the guard, ${q(without)} without`, 0, -3.05, s.palette.ink, 0.62, 'page-now'),
        ),
    };
  });

  return [
    {
      id: 'race',
      title: `Type ${q('A')}, then ${q('B')}: two searches race`,
      line: `Predict: ${q(first)} answers first and ${q(last)} last. Which results does the page end on?`,
      caption: `Each bar is one search, from the keystroke that starts it to the moment its answer lands. ${q('A')} starts first and ${q('B')} second, and the user now wants ${q('B')}. Both are running at once, and they can finish in a different order from the one they started in; here ${q(first)} lands first. The bars show the order of events, not measured time. Both requests succeed in this example. The page starts empty and publishes results as they arrive.`,
      state: { order, completion: done, lifetimes: off.lifetimes },
      draw: (_, s) =>
        new Group(
          timeline(s, off.lifetimes, []),
          label(`The user wants ${q('B')}`, 0, -2.0, s.emphasis, 0.75),
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
          ? `The track under the bars is the page. It changes at each landing: ${q(first)} lands first and the page shows it; then ${q(last)} lands and replaces it. The user typed ${q('B')} and is left looking at results for ${q('A')}, outlined in red.`
          : `The track under the bars is the page. It changes at each landing: ${q(first)} lands first and the page shows it for a moment, outlined in red; then ${q(last)} replaces it, so the page ends right by luck. In the other order, ${q('A')} would land on top of ${q('B')}.`
      }`,
      state: { order, off: off.snapshots, lifetimes: off.lifetimes, page: { off: off.page } },
      draw: (_, s) => timeline(s, off.lifetimes, [{ name: 'No guard', page: off.page, key: 'timeline-page-off' }]),
    },
    {
      id: 'tickets',
      title: 'Answer: number each search, and publish only the latest',
      line: `Predict: ${q(first)} lands first with ticket ${TICKET[first]}. Published or dropped?`,
      caption: `Give each search a ticket from a counter as it starts: ${q('A')} gets 1, ${q('B')} gets 2, and latest is now 2. Finishing changes neither. When a result lands, publish it only if its ticket is still the latest. Starting a newer request makes every older ticket stale; arrival order cannot make an old ticket current again.`,
      state: { tickets: { A: TICKET.A, B: TICKET.B }, latest },
      draw: (_, s) =>
        new Group(
          tile(`${q('A')}: ticket ${TICKET.A}`, -4, 2, 5.4, 1.2, s),
          tile(`${q('B')}: ticket ${TICKET.B}`, 4, 2, 5.4, 1.2, s, { active: true }),
          label(`latest = ${latest}`, 0, 0.5, s.emphasis, 0.8),
          new Code(['// when a search starts', 'const ticket = ++latest', '// when its result lands', CHECK], {
            fontSize: CODE_SIZE,
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
          ? `Without the guard, the page ends on ${q(off.snapshots[2]!.shown)}; with it, on ${q(on.snapshots[2]!.shown)}. Older ${q('A')} lands last and would overwrite ${q('B')}; its ticket is stale, so the guarded page does not change when it lands.`
          : `Both rules end on ${q(on.snapshots[2]!.shown)}, because ${q('B')} landed last. Without the guard the page showed ${q(off.snapshots[1]!.shown)} first; with it, ${q(on.snapshots[1]!.shown)} until ${q('B')} arrived, so the guarded page does not change when ${q('A')} lands.`
      } The guard drops stale results without cancelling the old search, which still runs to the end.`,
      state: { order, off: off.snapshots, on: on.snapshots, lifetimes: off.lifetimes, page: { off: off.page, on: on.page } },
      draw: (_, s) =>
        timeline(s, off.lifetimes, [
          { name: 'No guard', page: off.page, key: 'timeline-page-off' },
          { name: 'Guard on', page: on.page, key: 'timeline-page-on' },
        ]),
    },
  ];
}
