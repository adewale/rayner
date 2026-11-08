import { test } from 'node:test';
import type { View } from '../../../explain/index.ts';
import { having } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { loadFonts, loadProject, withSettings } from '../../../explain/testing.ts';
import LatestSearch from './scene.ts';
import { assertStepState } from '../../../test/lib/explainer-state.ts';
import { assertViewFollowsState } from '../../../test/lib/view-fidelity.ts';
import LatestSearchExplainer from './fixtures/latest-search-view.ts';
import { runSearch, raceReplay, raceLifetimes, racePage } from './model.ts';
import type { RaceEvent } from './model.ts';

test('all four reference chart scenarios derive their final chart and caption from the real promise result', async () => {
  const project = await loadProject(LatestSearchExplainer, 'scenes/explainers/latest-search/fixtures/latest-search-view.ts');
  assert.equal(project.scenarios.length, 4);
  for (const { values, trace } of project.scenarios) {
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

test('the chart/view on every scenario follows the state recorded at each resting step', async () => {
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
  const p = await loadProject(LatestSearch, 'scenes/explainers/latest-search');
  assert.equal(p.scenarios.length,2);
  for(const v of p.scenarios){
    assert.deepEqual(v.trace.steps.map(s=>s.step),['race','overwrite','tickets','reader-first','reader-ticket','reader-guard']);
    const order=v.values.order as 'new-first'|'old-first';
    const off=await runSearch(false,order),on=await runSearch(true,order);
    // The overwrite and last steps are the race machines' states after the scenario's events: A and B start, then
    // the two landings in the completion order. Each machine's run matches the real promises' run.
    const events:RaceEvent[]=['start A','start B',...(order==='new-first'?['B lands','A lands'] as const:['A lands','B lands'] as const)];
    const result=having(v.trace.steps.at(-1)!.after!,'log','guarded');
    assert.deepEqual(result,raceReplay(true,events));
    const overwrite=having(v.trace.steps.find(s=>s.step==='overwrite')!.after!,'log','guarded');
    assert.deepEqual(overwrite,raceReplay(false,events));
    for(const [st,run] of [[overwrite,off],[result,on]] as const) {
      assert.equal(st.page,run.snapshots.at(-1)!.shown);
      assert.deepEqual(st.writes,run.snapshots.at(-1)!.writes);
      // The timeline: the lifetimes and the page track drawn from the machine's state are the promise run's.
      assert.deepEqual(raceLifetimes(st),run.lifetimes);
      assert.deepEqual(racePage(st).map(({stale:_,...span})=>span),run.page);
    }
    // Both runs start and land the searches at the same ticks, so one set of bars serves both tracks.
    assert.deepEqual(on.lifetimes,off.lifetimes);
    assert.deepEqual(v.trace.steps.find(s=>s.step==='race')!.after!,{order,completion:off.snapshots.slice(1).map(x=>x.completed.at(-1)),lifetimes:off.lifetimes});
    for(const step of v.trace.steps.filter(s=>s.step==='reader-first'||s.step==='reader-ticket')){
      const r=having(step.after!,'ticket','accepted');
      assert.equal(r.latest,2);assert.equal(r.accepted,r.ticket===2);
    }
  }
});
