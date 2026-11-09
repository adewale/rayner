import { Group, Code, Rectangle, Line, Circle, Arrow, keyed } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { runSearch, raceLifetimes, racePage, raceReplay } from './model.ts';
import type { CompletionOrder, Lifetime, Query, PageSpan, RaceState, RaceEvent, SearchSnapshot } from './model.ts';
import { label, tile, emphasised } from '../../../explain/drawing.ts';
import type { StagedStep } from '../../../explain/index.ts';

/** What the user typed for each search: A is the older keystroke, B the latest. */
export const TYPED: Record<Query, string> = { A: 'ca', B: 'cat' };
const q = (query: Query | null) => (query ? `“${TYPED[query]}”` : 'nothing');
/** The ticket each search takes as it starts: A starts first. */
const TICKET: Record<Query, number> = { A: 1, B: 2 };
/** The guarded handler's check, as one line: the last line of the tickets step's code, set at the
 * same size, so it sits in the same place in every step that shows it. */
const CHECK = 'if (ticket === latest) publish(result)';
const CODE_SIZE = 0.58;

/**
 * The timeline's event clock: tick t sits at x(t); the last span runs on to the right edge. The run's four
 * events, two starts then two landings, sit evenly spaced in the order they happened, so a bar's length is
 * not a duration.
 */
const tickX = (t: number) => -3.2 + t * 2.4,
  RIGHT_EDGE = 6.8,
  ROW_LABEL_X = -7.1;
/** A search still running: its bar reaches this far past the last event. */
const RUNNING = 1.2;
/** Each search's row: A on top, B under it, whichever started. */
const ROW: Record<Query, number> = { A: 0, B: 1 };
export const barY = (query: Query) => 2.4 - ROW[query] * 1.2;
const TRACK_TOP = -0.75;
/** The page track for rule `i` (0: no guard; 1: guard on). */
export const trackY = (i: number) => TRACK_TOP - 0.95 - i * 1.25;
export { tickX };

/** One search's ticks; `land` is null while it runs. */
export interface Life { query: Query; start: number; land: number | null }
/** A page span, outlined in red when `stale`: published after a newer search started. */
export type Span = PageSpan & { stale: boolean };
export interface Track { name: string; page: readonly Span[]; key: string }

/**
 * Each search as a bar from the tick it starts to the tick its result lands (or, while it runs, a
 * little past the last event `now`), from the model's lifetimes; beneath them, one track per rule of
 * what the page shows between events, from the model's page spans. A dashed line drops from each
 * landing to the tracks, where the page changes or, under the guard, may not. Every part is keyed,
 * so a machine's transition can move each.
 */
export function timeline(s: Stage, lifetimes: readonly Life[], tracks: readonly Track[], now: number): Group {
  const rowLabel = (text: string, y: number, color = s.look.ink) => label(s, text, { color, size: 0.62 }).moveTo([ROW_LABEL_X, y], [-1, 0]);
  const parts: Mobject[] = [];
  for (const { query, start, land } of lifetimes) {
    const y = barY(query),
      color = query === 'B' ? s.look.emphasis : s.look.soft,
      a = tickX(start),
      b = land === null ? tickX(now) + RUNNING : tickX(land);
    parts.push(
      keyed(rowLabel(q(query), y), `timeline-search:${query}:label`),
      keyed(new Rectangle({ width: b - a, height: 0.6, fill: color, fillOpacity: 0.35, stroke: color, strokeWidth: 0.03 }).moveTo([(a + b) / 2, y]), `timeline-search:${query}:bar`),
    );
    if (land !== null) parts.push(keyed(new Circle({ radius: 0.18, fill: color, stroke: color }).moveTo([b, y]), `timeline-search:${query}:dot`));
  }
  const axisY = 0.1;
  parts.push(
    keyed(
      new Group(
        new Arrow([tickX(0), axisY], [RIGHT_EDGE, axisY], { stroke: s.look.soft, strokeWidth: 0.03, tipLength: 0.2, tipWidth: 0.16 }),
        label(s, 'time', { color: s.look.soft, size: 0.62 }).moveTo([RIGHT_EDGE, axisY - 0.4], [1, 0]),
      ),
      'timeline-axis',
    ),
  );
  const landings = lifetimes.flatMap((l) => (l.land === null ? [] : [l.land]));
  if (tracks.length) {
    for (const { query, land } of lifetimes) {
      if (land === null) continue;
      const x = tickX(land),
        d = new Line([x, barY(query) - 0.2], [x, trackY(tracks.length - 1) - 0.55], { stroke: s.look.soft, strokeWidth: 0.025 });
      d.style.dashArray = '0.12 0.1';
      parts.push(keyed(d, `timeline-drop:${query}`));
    }
    parts.push(keyed(rowLabel('Page shows', TRACK_TOP, s.look.soft), 'timeline-page-label'));
  }
  tracks.forEach(({ name, page, key }, i) => {
    const y = trackY(i);
    parts.push(keyed(rowLabel(name, y), `${key}:name`));
    page.forEach(({ from, to, shown, stale }, j) => {
      const a = tickX(from) + 0.04,
        b = (to === null ? RIGHT_EDGE : tickX(to)) - 0.04,
        // A landing inside the span changed nothing here; its dashed line crosses the span, so the words sit before it.
        inside = landings.filter((t) => t > from && (to === null || t < to)),
        end = inside.length ? tickX(Math.min(...inside)) - 0.04 : b;
      parts.push(
        keyed(
          new Group(
            new Rectangle({ width: b - a, height: 0.9, fill: s.look.paper, stroke: stale ? s.look.bad : s.look.soft, strokeWidth: stale ? 0.055 : 0.025 }).moveTo([(a + b) / 2, y]),
            label(s, shown ? q(shown) : 'nothing', { at: [(a + end) / 2, y], color: stale ? s.look.bad : shown ? s.look.ink : s.look.soft, size: 0.62 }),
          ),
          `${key}:span:${j}`,
        ),
      );
    });
  });
  return new Group(...parts);
}

/** The tracks a race shows: its own page, and under the guard the page the same events make without it. */
export function raceTracks(st: RaceState): Track[] {
  return st.guarded
    ? [
        { name: 'No guard', page: racePage(raceReplay(false, st.log)), key: 'timeline-page-off' },
        { name: 'Guard on', page: racePage(st), key: 'timeline-page-on' },
      ]
    : [{ name: 'No guard', page: racePage(st), key: 'timeline-page-off' }];
}
/** The race's timeline, drawn from its state alone. */
export const raceTimeline = (s: Stage, st: RaceState) => {
  const picture = keyed(timeline(s, raceLifetimes(st), raceTracks(st), st.log.length - 1), 'reader-picture');
  // What the timeline marks, as emphasis the phone's close-ups visit first and review holds to the
  // caption: each page span outlined in red, a stale result on the page.
  for (const track of raceTracks(st))
    track.page.forEach((span, j) => {
      const m = span.stale ? picture.find(`${track.key}:span:${j}`) : undefined;
      if (m) emphasised(m, `${track.name}: stale ${span.shown}`);
    });
  return picture;
};
/** The timeline in words: each search's ticks, and what each page shows in turn. */
export function raceWords(st: RaceState): string {
  const lives = raceLifetimes(st);
  const searches = (['A', 'B'] as const).map((query) => {
    const l = lives.find((x) => x.query === query);
    return !l ? `${q(query)} is not typed yet` : l.land === null ? `${q(query)} started at event ${l.start + 1} and is still running` : `${q(query)} started at event ${l.start + 1} and landed at event ${l.land + 1}`;
  });
  const pages = raceTracks(st).map(({ name, page }) => `${name}: the page shows ${page.map((p) => `${q(p.shown)}${p.stale ? ' (outlined in red)' : ''}`).join(', then ')}`);
  return [...searches, ...pages].join('. ');
}

/** A step a machine plays: its words; its state and picture are the race's. */
export interface RaceStep { id: string; title: string; line: string; caption: string }
/** The opening race's state: the completion order and each search's lifetime. */
export type RaceIntro = { order: CompletionOrder; completion: Query[]; lifetimes: Lifetime[] };
/** The tickets step's state: each search's ticket, and the latest. */
export type Tickets = { tickets: Record<Query, number>; latest: number };
/** A decision's state: the result that lands, its ticket against the latest, and each rule's page after it. */
export type Decision = { query: Query; ticket: number; latest: number; accepted: boolean; off: SearchSnapshot; on: SearchSnapshot };
/** The scene's state at each step: a staged step's own, or the race a machine plays. */
export type LatestSearchState = RaceIntro | RaceState | Tickets | Decision;

/**
 * The story: the race (staged), the unguarded race played by its machine, the ticket and the two
 * decisions (staged), and the guarded race played by its machine. `events` is the order the chosen
 * case plays: A starts, B starts, then the two landings in the completion order.
 */
export async function story(order: CompletionOrder, answer: string): Promise<{ race: StagedStep<RaceIntro>; overwrite: RaceStep; middle: [StagedStep<Tickets>, ...StagedStep<Decision>[]]; guard: RaceStep; events: RaceEvent[] }> {
  const [off, on] = await Promise.all([runSearch(false, order), runSearch(true, order)]);
  // The order the promises resolved in, read back from the model's run.
  const done = off.snapshots.slice(1).map((x) => x.completed.at(-1)!);
  const [first, last] = done as [Query, Query];
  const staleWins = off.snapshots.at(-1)!.shown !== 'B';
  const latest = TICKET.B;

  const decisions = done.map((query, i): StagedStep<Decision> => {
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
      state: { query, ticket, latest, accepted, off: off.snapshots[i + 1]!, on: on.snapshots[i + 1]! },
      draw: (st, s) =>
        new Group(
          tile(s, `${q(st.query)}: ticket ${st.ticket}`, { at: [-4, 2], width: 5.4, height: 1.2 }),
          tile(s, `latest = ${st.latest}`, { at: [4, 2], width: 5.4, height: 1.2 }),
          label(s, st.accepted ? '=' : '≠', { at: [0, 2], color: st.accepted ? s.look.good : s.look.bad, size: 1 }),
          label(s, st.accepted ? `Publish ${q(st.query)}` : `Drop ${q(st.query)}`, { at: [0, 0.5], color: st.accepted ? s.look.good : s.look.bad, size: 0.8 }),
          new Code([CHECK], { fontSize: CODE_SIZE, color: s.look.ink }).moveTo([0, -1.35]),
          // What each rule leaves on the page after this result, from the model's two runs.
          label(s, `Page now: ${q(st.on.shown)} with the guard, ${q(st.off.shown)} without`, { at: [0, -3.05], size: 0.62, key: 'page-now' }),
        ),
    };
  });

  const events: RaceEvent[] = ['start A', 'start B', `${first} lands`, `${last} lands`];
  // Both machines play these events; their runs must agree with the real promises' runs.
  const playedOff = raceReplay(false, events), playedOn = raceReplay(true, events);
  if (JSON.stringify(playedOff.writes) !== JSON.stringify(off.snapshots.at(-1)!.writes) || JSON.stringify(playedOn.writes) !== JSON.stringify(on.snapshots.at(-1)!.writes))
    throw new Error('the race machine and the promise run disagree');
  return {
    events,
    race: {
      id: 'race',
      title: `Type ${q('A')}, then ${q('B')}: two searches race`,
      line: `Predict: ${q(first)} answers first and ${q(last)} last. Which results does the page end on?`,
      caption: `Each bar is one search, from the keystroke that starts it to the moment its answer lands. ${q('A')} starts first and ${q('B')} second, and the user now wants ${q('B')}. Both are running at once, and they can finish in a different order from the one they started in; here ${q(first)} lands first. The bars show the order of events, not measured time. Both requests succeed in this example. The page starts empty and publishes results as they arrive.`,
      state: { order, completion: done, lifetimes: off.lifetimes },
      draw: (st, s) =>
        new Group(
          ...timeline(s, st.lifetimes, [], 3).children,
          label(s, `The user wants ${q('B')}`, { at: [0, -2.0], color: s.look.emphasis, size: 0.75, key: 'timeline-wants' }),
        ),
    },
    overwrite: {
      id: 'overwrite',
      title: staleWins
        ? `Answer: ${q('A')}. The older search lands last and replaces ${q('B')}`
        : `Answer: ${q('B')}, because this time the latest search landed last`,
      line: staleWins
        ? `Predict: what could tell the handler that ${q('A')} is out of date?`
        : `Predict: had ${q('B')} answered first, what would stop ${q('A')} replacing it?`,
      caption: `${answer}. ${
        staleWins
          ? `The track under the bars is the page. It changes at each landing: ${q(first)} lands first and the page shows it; then ${q(last)} lands and replaces it. The user typed ${q('B')} and is left looking at results for ${q('A')}, outlined.`
          : `The track under the bars is the page. It changes at each landing: ${q(first)} lands first and the page shows it for a moment, outlined; then ${q(last)} replaces it, so the page ends right by luck. In the other order, ${q('A')} would land on top of ${q('B')}.`
      }`,
    },
    middle: [{
      id: 'tickets',
      title: 'Answer: number each search, and publish only the latest',
      line: `Predict: ${q(first)} lands first with ticket ${TICKET[first]}. Published or dropped?`,
      caption: `Give each search a ticket from a counter as it starts: ${q('A')} gets 1, ${q('B')} gets 2, and latest is now 2. Finishing changes neither. When a result lands, publish it only if its ticket is still the latest. Starting a newer request makes every older ticket stale; arrival order cannot make an old ticket current again.`,
      state: { tickets: { A: TICKET.A, B: TICKET.B }, latest },
      draw: (st, s) =>
        new Group(
          tile(s, `${q('A')}: ticket ${st.tickets.A}`, { at: [-4, 2], width: 5.4, height: 1.2 }),
          tile(s, `${q('B')}: ticket ${st.tickets.B}`, { at: [4, 2], width: 5.4, height: 1.2, active: true }),
          label(s, `latest = ${st.latest}`, { at: [0, 0.5], color: s.look.emphasis, size: 0.8 }),
          new Code(['// when a search starts', 'const ticket = ++latest', '// when its result lands', CHECK], {
            fontSize: CODE_SIZE,
            color: s.look.ink,
          }).moveTo([0, -2.1]),
        ),
    },
    ...decisions],
    guard: {
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
    },
  };
}
