// A controlled JavaScript promise run, not a network benchmark. Search A is
// started first; search B is the latest intent. We choose the completion order
// by resolving their promises explicitly, without sleeps or invented latency.
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
