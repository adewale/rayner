import { refuse, isRefusal } from '../../../explain/index.ts';
import type { Refusal } from '../../../explain/index.ts';
// A controlled JavaScript promise run, not a network benchmark. Search A is
// started first; search B is the latest intent. We choose the completion order
// by resolving their promises explicitly, without sleeps or invented latency.
// Its limits: both requests succeed, the page starts empty (so "nothing yet" is not
// an application that keeps earlier results), and in the two drawn orders both have
// started before either lands (the race machine also explores "ca" landing before
// "cat" starts). There is no debounce, abort, retry, loading state, error UI or
// fallback: the ticket guard decides which response may publish, nothing more, and
// the ticket belongs to a request, not its query text.
export type Query = 'A' | 'B';
export type CompletionOrder = 'new-first' | 'old-first';

export interface SearchSnapshot {
  event: string;
  active: Query;
  shown: Query | null;
  completed: Query[];
  writes: Query[];
}

/** The same ticket check that the scene displays in its code panel. */
export function createSearch(guarded: boolean, publish: (result: Query) => void) {
  let latest = 0;
  return (job: Promise<Query>) => {
    const ticket = ++latest;
    return job.then(result => {
      if (!guarded || ticket === latest) publish(result);
    });
  };
}

// Compact excerpt of createSearch for the picture; the test exercises the
// exported function with real, controlled promises rather than trusting text.
export const SEARCH_CODE = [
  'let latest = 0',
  'function search(job) {',
  '  const ticket = ++latest',
  '  return job.then(result => {',
  '    if (!guarded || ticket === latest)',
  '      publish(result)',
  '  })',
  '}',
];

/**
 * The race as a machine: its events are the searches starting and their responses landing, in any
 * order the page could see them. "ca" is typed before "cat", so A starts before B, and a response
 * lands only after its search started, once. Each landing goes through the handler createSearch
 * runs: publish if there is no guard, or if the search's ticket is still the latest. `raceNext` is
 * pure, so exploring it reaches every interleaving; the test compares each with real promises.
 */
export type RaceEvent = 'start A' | 'start B' | 'A lands' | 'B lands';
export const RACE_EVENTS: readonly RaceEvent[] = ['start A', 'start B', 'A lands', 'B lands'];
export interface RaceState {
  guarded: boolean;
  /** The counter a search takes its ticket from. */
  latest: number;
  tickets: { A: number | null; B: number | null };
  /** Every event so far, in order: the event at tick t is log[t]. */
  log: RaceEvent[];
  /** What the page shows: the result last published. */
  page: Query | null;
  /** Every result published, in order. */
  writes: Query[];
}
export function raceStart(guarded: boolean): RaceState {
  return { guarded, latest: 0, tickets: { A: null, B: null }, log: [], page: null, writes: [] };
}
/** The race after one event, or a refusal saying why it cannot happen yet (or again). Pure. */
export function raceNext(st: RaceState, event: RaceEvent): RaceState | Refusal {
  const [first, verb] = event.split(' ') as [string, string];
  if (first === 'start') {
    const query = verb as Query;
    if (st.tickets[query] !== null) return refuse(`search ${query} has started already, and each search starts once`);
    if (query === 'B' && st.tickets.A === null) return refuse('“ca” is typed before “cat”, so search A starts first');
    const ticket = st.latest + 1;
    return { ...st, latest: ticket, tickets: { ...st.tickets, [query]: ticket }, log: [...st.log, event] };
  }
  const query = first as Query, ticket = st.tickets[query];
  if (ticket === null) return refuse(`search ${query} has not started, so it has no response to land`);
  if (st.log.includes(event)) return refuse(`search ${query}’s response has landed already, and a response lands once`);
  // The handler createSearch runs when the job resolves.
  const publish = !st.guarded || ticket === st.latest;
  return { ...st, log: [...st.log, event], ...(publish ? { page: query, writes: [...st.writes, query] } : {}) };
}
/** The race the same events make under the other rule (or this one): what the other page would show. */
export function raceReplay(guarded: boolean, log: readonly RaceEvent[]): RaceState {
  return log.reduce<RaceState>((st, e) => {
    const next = raceNext(st, e);
    if (isRefusal(next)) throw new RangeError(`${e} cannot happen after ${st.log.join(', ') || 'nothing'}: ${next.reason}`);
    return next;
  }, raceStart(guarded));
}
/** Each started search's ticks: when it started, and when it landed (null while it runs). */
export function raceLifetimes(st: RaceState): { query: Query; start: number; land: number | null }[] {
  return (['A', 'B'] as const)
    .filter((query) => st.log.includes(`start ${query}`))
    .map((query) => {
      const land = st.log.indexOf(`${query} lands`);
      return { query, start: st.log.indexOf(`start ${query}`), land: land < 0 ? null : land };
    });
}
/**
 * What the page shows between events, as runSearch reports it, with `stale` on a span whose result
 * was published after a newer search had started: an older search replacing the latest intent.
 */
export function racePage(st: RaceState): (PageSpan & { stale: boolean })[] {
  const spans: (PageSpan & { stale: boolean })[] = [{ from: 0, to: null, shown: null, stale: false }];
  let at = raceStart(st.guarded);
  st.log.forEach((event, tick) => {
    const before = at;
    at = raceNext(at, event) as RaceState;
    if (at.writes.length === before.writes.length) return;
    const query = at.page!;
    spans.at(-1)!.to = tick;
    spans.push({ from: tick, to: null, shown: query, stale: before.tickets[query] !== before.latest });
  });
  return spans;
}
/** Whether the page now shows a result published after a newer search started. */
export const raceShowsStale = (st: RaceState) => racePage(st).at(-1)!.stale;

/** One search's life on the run's event clock: the tick when it starts and the tick when its result lands. */
export interface Lifetime { query: Query; start: number; land: number }
/** What the page shows from one event's tick until the next change; `to` is null for the final display. */
export interface PageSpan { from: number; to: number | null; shown: Query | null }

/** Ticks count the run's events in order (each start, then each landing); they are not elapsed time. */
export async function runSearch(guarded: boolean, order: CompletionOrder): Promise<{ snapshots: SearchSnapshot[]; lifetimes: Lifetime[]; page: PageSpan[] }> {
  const pending = () => {
    let resolve!: (result: Query) => void;
    const promise = new Promise<Query>(done => { resolve = done; });
    return { promise, resolve };
  };
  const a = pending(), b = pending();
  const writes: Query[] = [], completed: Query[] = [];
  let shown: Query | null = null;
  const start = createSearch(guarded, result => { shown = result; writes.push(result); });
  let tick = 0;
  const started: Record<Query, number> = { A: tick++, B: 0 };
  const waitA = start(a.promise);
  started.B = tick++;
  const waitB = start(b.promise);
  const landed: Partial<Record<Query, number>> = {};
  const page: PageSpan[] = [{ from: 0, to: null, shown }];
  const snapshot = (event: string): SearchSnapshot => ({
    event, active: 'B', shown, completed: [...completed], writes: [...writes],
  });
  const snapshots = [snapshot('Both started: A then B')];
  for (const id of (order === 'new-first' ? ['B', 'A'] : ['A', 'B']) as Query[]) {
    if (id === 'A') { a.resolve('A'); await waitA; }
    else { b.resolve('B'); await waitB; }
    completed.push(id);
    landed[id] = tick;
    // A landing that leaves the page as it was extends the current span instead of starting one.
    if (shown !== page.at(-1)!.shown) {
      page.at(-1)!.to = tick;
      page.push({ from: tick, to: null, shown });
    }
    tick++;
    snapshots.push(snapshot(`${id} completed`));
  }
  const lifetimes = (['A', 'B'] as const).map((query): Lifetime => ({ query, start: started[query], land: landed[query]! }));
  return { snapshots, lifetimes, page };
}
