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
  assert.equal(project.variants.length, 4);
  for (const { values, trace } of project.variants) {
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
  assert.equal(p.variants.length,2);
  for(const v of p.variants){
    assert.deepEqual(v.trace.steps.map(s=>s.step),['reader-order','reader-first','reader-ticket','reader-guard']);
    const order=v.values.order as 'new-first'|'old-first';
    const off=await runSearch(false,order),on=await runSearch(true,order);
    const result=v.trace.steps.at(-1)!.after!.reader as {off:unknown;on:unknown};
    assert.deepEqual(result,{order,off:off.snapshots,on:on.snapshots});
    for(const step of v.trace.steps.slice(1,3)){
      const r=step.after!.reader as {ticket:number;latest:number;accepted:boolean};
      assert.equal(r.latest,2);assert.equal(r.accepted,r.ticket===2);
    }
  }
});
