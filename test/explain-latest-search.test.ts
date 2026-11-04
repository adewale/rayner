import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFonts } from '../src/index.ts';
import type { View } from '../src/index.ts';
import { withSettings } from '../explain/index.ts';
import { collectProject } from '../tools/lib/explain-project.ts';
import { assertStepState } from './lib/explainer-state.ts';
import { assertViewFollowsState } from './lib/view-fidelity.ts';
import LatestSearchExplainer from './fixtures/latest-search-view.ts';
import { createSearch, runSearch, SEARCH_CODE } from '../scenes/explainers/lib/latest-search.ts';
import type { Lifetime } from '../scenes/explainers/lib/latest-search.ts';

test('tickets distinguish repeated query text and do not invent an error fallback', async () => {
  const deferred = () => {
    let resolve!: (value: 'A' | 'B') => void;
    const promise = new Promise<'A' | 'B'>(done => { resolve = done; });
    return { promise, resolve };
  };
  const first = deferred(), second = deferred(), third = deferred();
  const writes: string[] = [];
  const start = createSearch(true, result => writes.push(result));
  const pending = [start(first.promise), start(second.promise), start(third.promise)];
  third.resolve('A'); await pending[2];
  assert.deepEqual(writes, ['A']);
  second.resolve('B'); await pending[1];
  first.resolve('A'); await pending[0];
  assert.deepEqual(writes, ['A'], 'the first A must not publish again after the third request');

  const old = deferred();
  const fallbackWrites: string[] = [];
  const withFailure = createSearch(true, result => fallbackWrites.push(result));
  const oldCompletion = withFailure(old.promise);
  await assert.rejects(withFailure(Promise.reject(new Error('newest failed'))), /newest failed/);
  old.resolve('A'); await oldCompletion;
  assert.deepEqual(fallbackWrites, [], 'an older success remains stale after the latest request fails');
});

test('controlled promises expose the stale overwrite and the latest-request guard in both completion orders', async () => {
  const cases = [
    { guard: false, order: 'new-first', first: 'B', final: 'A', writes: ['B', 'A'] },
    { guard: true, order: 'new-first', first: 'B', final: 'B', writes: ['B'] },
    { guard: false, order: 'old-first', first: 'A', final: 'B', writes: ['A', 'B'] },
    { guard: true, order: 'old-first', first: null, final: 'B', writes: ['B'] },
  ] as const;
  for (const c of cases) {
    const run = await runSearch(c.guard, c.order);
    assert.deepEqual(run.snapshots.map(s => s.shown), [null, c.first, c.final], JSON.stringify(c));
    assert.deepEqual(run.snapshots.at(-1)!.writes, c.writes, JSON.stringify(c));
    assert.deepEqual(run.snapshots.map(s => s.completed), [[], [c.order === 'new-first' ? 'B' : 'A'], c.order === 'new-first' ? ['B', 'A'] : ['A', 'B']]);
    assert.equal(run.snapshots[0]!.active, 'B');
  }
});

test('the timeline records overlapping lifetimes and what the page shows between events, in both orders', async () => {
  // Ticks count events in the run: A starts at 0, B at 1, then the two completions at 2 and 3.
  const cases = [
    { guard: false, order: 'new-first', land: { A: 3, B: 2 }, page: [{ from: 0, to: 2, shown: null }, { from: 2, to: 3, shown: 'B' }, { from: 3, to: null, shown: 'A' }] },
    { guard: true, order: 'new-first', land: { A: 3, B: 2 }, page: [{ from: 0, to: 2, shown: null }, { from: 2, to: null, shown: 'B' }] },
    { guard: false, order: 'old-first', land: { A: 2, B: 3 }, page: [{ from: 0, to: 2, shown: null }, { from: 2, to: 3, shown: 'A' }, { from: 3, to: null, shown: 'B' }] },
    { guard: true, order: 'old-first', land: { A: 2, B: 3 }, page: [{ from: 0, to: 3, shown: null }, { from: 3, to: null, shown: 'B' }] },
  ] as const;
  for (const c of cases) {
    const run = await runSearch(c.guard, c.order);
    assert.deepEqual(run.lifetimes, [{ query: 'A', start: 0, land: c.land.A }, { query: 'B', start: 1, land: c.land.B }], JSON.stringify(c));
    // The lifetimes overlap: each search starts before the other lands.
    const [a, b] = run.lifetimes;
    assert.ok(a!.start < b!.land && b!.start < a!.land);
    assert.deepEqual(run.page, c.page, JSON.stringify(c));
    // Each span after the first starts at a landing, and its value is the snapshot after that landing.
    for (const span of run.page.slice(1)) {
      const landed: Lifetime = run.lifetimes.find(l => l.land === span.from)!;
      assert.equal(run.snapshots[span.from - 1]!.completed.at(-1), landed.query);
      assert.equal(run.snapshots[span.from - 1]!.shown, span.shown);
    }
  }
});

test('the pictured ticket check and publish call match the executed handler', () => {
  const compact = (text: string) => text.replace(/\s+/g, '');
  const source = compact(createSearch.toString());
  const pictured = compact(SEARCH_CODE.join('\n'));
  for (const statement of ['let latest = 0', 'const ticket = ++latest', 'if (!guarded || ticket === latest)', 'publish(result)']) {
    assert.ok(source.includes(compact(statement)), `${statement} must execute`);
    assert.ok(pictured.includes(compact(statement)), `${statement} must appear on screen`);
  }
});

test('all four reference chart cases derive their final chart and caption from the real promise result', async () => {
  const project = await collectProject('test/fixtures/latest-search-view.ts', { write: false });
  assert.equal(project.cases.length, 4);
  for (const { values, trace } of project.cases) {
    const guard = values.guard === 'on';
    const order = values.order as 'new-first' | 'old-first';
    const expected = await runSearch(guard, order);
    const other = await runSearch(!guard, order);
    assertStepState(trace, 'start', { shown: null, completed: [] });
    assertStepState(trace, 'first', { shown: expected.snapshots[1]!.shown, completed: expected.snapshots[1]!.completed });
    assertStepState(trace, 'second', { shown: expected.snapshots[2]!.shown, completed: expected.snapshots[2]!.completed });
    assertStepState(trace, 'compare', {
      shown: expected.snapshots[2]!.shown,
      unguarded: (guard ? other : expected).snapshots[2]!.shown,
      guarded: (guard ? expected : other).snapshots[2]!.shown,
    });
    const caption = String(trace.steps.find(s => s.step === 'compare')!.meta?.caption ?? '');
    assert.match(caption, order === 'new-first' ? /older A|A .*stale/ : /B .*last|latest B/);
  }
});

test('the chart/view on every case follows the state recorded at each resting step', async () => {
  await loadFonts();
  for (const guard of ['off', 'on']) for (const order of ['new-first', 'old-first']) {
    const checked = await assertViewFollowsState(
      withSettings(LatestSearchExplainer, { guard, order }),
      scene => (scene as LatestSearchExplainer).chart as View | null,
    );
    assert.equal(checked, 4, `${guard}/${order}: all four resting steps have a state-derived view`);
  }
});

test('the public story compares both rules and shows each ticket decision in both finish orders', async () => {
  const p = await collectProject('scenes/explainers/latest-search', {write:false});
  assert.equal(p.cases.length,2);
  for(const v of p.cases){
    assert.deepEqual(v.trace.steps.map(s=>s.step),['race','overwrite','tickets','reader-first','reader-ticket','reader-guard']);
    const order=v.values.order as 'new-first'|'old-first';
    const off=await runSearch(false,order),on=await runSearch(true,order);
    const result=v.trace.steps.at(-1)!.after!.reader as {off:unknown;on:unknown};
    // The last step's timeline: the lifetimes, and a page track for each rule.
    assert.deepEqual(result,{order,off:off.snapshots,on:on.snapshots,lifetimes:off.lifetimes,page:{off:off.page,on:on.page}});
    // Both runs start and land the searches at the same ticks, so one set of bars serves both tracks.
    assert.deepEqual(on.lifetimes,off.lifetimes);
    // The unguarded run comes first: the overwrite step shows the model's no-guard snapshots and page track.
    assert.deepEqual(v.trace.steps.find(s=>s.step==='overwrite')!.after!.reader,{order,off:off.snapshots,lifetimes:off.lifetimes,page:{off:off.page}});
    assert.deepEqual(v.trace.steps.find(s=>s.step==='race')!.after!.reader,{order,completion:off.snapshots.slice(1).map(x=>x.completed.at(-1)),lifetimes:off.lifetimes});
    for(const step of v.trace.steps.filter(s=>s.step==='reader-first'||s.step==='reader-ticket')){
      const r=step.after!.reader as {ticket:number;latest:number;accepted:boolean};
      assert.equal(r.latest,2);assert.equal(r.accepted,r.ticket===2);
    }
  }
});
