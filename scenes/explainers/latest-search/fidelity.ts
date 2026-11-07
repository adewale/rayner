import assert from 'node:assert/strict';
import type { Trace } from '../../../src/trace.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { raceLifetimes, racePage, raceReplay } from './model.ts';
import type { RaceState } from './model.ts';

/** Each authored scenario's steps against the program the explainer explains. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  // Independent expectation for the two controlled completions: when B
  // finishes first the unguarded old A overwrites it; when A finishes
  // first the guarded page stays empty until the latest B arrives.
  const newFirst = values.order === 'new-first', first = newFirst ? 'B' : 'A';
  const reading = (step: string) => trace.steps.find(s => s.step === step)!.after! as {
    query: string; ticket: number; latest: number; accepted: boolean;
    off: {shown: string | null; completed: string[]; writes: string[]} | {shown: string | null; completed: string[]; writes: string[]}[];
    on: {shown: string | null; completed: string[]; writes: string[]} | {shown: string | null; completed: string[]; writes: string[]}[];
  };
  for (const [id, query] of [['reader-first', first], ['reader-ticket', newFirst ? 'A' : 'B']] as const) {
    const r = reading(id);
    assert.equal(r.query, query);
    assert.equal(r.ticket, query === 'A' ? 1 : 2);
    assert.equal(r.latest, 2);
    assert.equal(r.accepted, query === 'B');
  }
  const before = reading('reader-first');
  assert.equal((before.off as {shown:unknown}).shown, first);
  assert.equal((before.on as {shown:unknown}).shown, newFirst ? 'B' : null);
  // The overwrite and last steps are the race machines' states: the unguarded race, then the guarded one,
  // after the same events (A starts, B starts, then the landings in the completion order).
  const race = (step: string) => trace.steps.find(s => s.step === step)!.after! as unknown as RaceState;
  const off = race('overwrite'), on = race('reader-guard');
  assert.equal(off.guarded, false);assert.equal(on.guarded, true);
  assert.deepEqual(off.log, ['start A', 'start B', `${first} lands`, `${newFirst ? 'A' : 'B'} lands`]);
  assert.deepEqual(on.log, off.log);
  assert.equal(off.page, newFirst ? 'A' : 'B');assert.equal(on.page, 'B');
  assert.deepEqual(off.writes, newFirst ? ['B','A'] : ['A','B']);
  assert.deepEqual(on.writes, ['B']);
  // The timeline: A starts at tick 0 and B at 1; both run until the landings at 2 and 3. The page tracks change
  // only where a landing publishes: the unguarded page shows each arrival, the guarded one only B's.
  const lifetimes = [{ query: 'A', start: 0, land: newFirst ? 3 : 2 }, { query: 'B', start: 1, land: newFirst ? 2 : 3 }];
  const offPage = [{ from: 0, to: 2, shown: null }, { from: 2, to: 3, shown: first }, { from: 3, to: null, shown: newFirst ? 'A' : 'B' }];
  const onPage = newFirst ? [{ from: 0, to: 2, shown: null }, { from: 2, to: null, shown: 'B' }] : [{ from: 0, to: 3, shown: null }, { from: 3, to: null, shown: 'B' }];
  assertStepState(trace, 'race', { order: values.order, completion: [first, newFirst ? 'A' : 'B'], lifetimes });
  // The timelines drawn from those states: the same bars, and a page track per rule, the unguarded one outlined
  // in red where A was published after B started (in both orders), the guarded one never.
  const spans = (st: RaceState) => racePage(st).map(({ stale: _, ...span }) => span);
  assert.deepEqual(raceLifetimes(off), lifetimes);
  assert.deepEqual(spans(off), offPage);
  assert.deepEqual(raceLifetimes(on), lifetimes);
  assert.deepEqual(spans(raceReplay(false, on.log)), offPage);
  assert.deepEqual(spans(on), onPage);
  assert.deepEqual(racePage(off).filter(p => p.stale).map(p => p.shown), ['A']);
  assert.ok(!racePage(on).some(p => p.stale));
}
