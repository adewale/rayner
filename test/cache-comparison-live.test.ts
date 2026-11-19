// The real player's log operations, using the independent-cache comparison as a concrete case.
// App/internal imports belong here; the explainer's own scene tests use the public author API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullSink } from '../src/timeline.ts';
import { loadFonts, loadProject } from '../explain/testing.ts';
import { liveSteps, runLive } from '../explain/live.ts';
import { explore, outcomes } from '../app/embed-live.ts';
import type { Exploration } from '../app/embed-live.ts';
import { continued, state, assertCurrent } from '../scenes/explainers/cache-policies/fixtures/comparisons.test.ts';
import type { Row } from '../scenes/explainers/cache-policies/fixtures/comparisons.test.ts';
import CachePolicies from '../scenes/explainers/cache-policies/scene.ts';

await loadFonts();
const project = await loadProject(CachePolicies, 'scenes/explainers/cache-policies');

test('live sends update both policies; the player\'s Undo and Reset restore both pictures and the shared request history', async () => {
  for (const pattern of ['loop', 'reuse'] as const) {
    const Source = project.scenario({ pattern }).Scene;
    const live = liveSteps(await new Source(new NullSink()).run()).get('try')!;
    assert.deepEqual(live.machine.spec.views.map(v => v.key), ['cache:lru', 'cache:mru', 'cache:stream']);
    assert.deepEqual(live.machine.spec.events, ['A', 'B', 'C', 'D']);
    let exploration: Exploration<{ step: string }> = explore({ kind: 'none' }, { kind: 'link', now: { step: 'try' }, log: [] });
    const render = async (row: Row) => {
      assert.equal(exploration.kind, 'live');
      if (exploration.kind !== 'live') throw new Error('expected the live comparison');
      const shown = await runLive(Source, 'try', live, exploration.log);
      assertCurrent(shown.scene, state(row));
      return shown;
    };
    await render(continued[pattern][0]!);
    exploration = explore(exploration, { kind: 'send', event: 'B' });
    await render(continued[pattern][1]!);
    exploration = explore(exploration, { kind: 'send', event: 'C' });
    const last = await render(continued[pattern][2]!);
    const buttons = outcomes(last.machine, last.scene.state);
    assert.equal(buttons.length, 4);
    assert.ok(buttons.every(b => b.kind === 'beyond' && /eleven requests/.test(b.reason ?? '')));
    exploration = explore(exploration, { kind: 'undo' });
    await render(continued[pattern][1]!);
    exploration = explore(exploration, { kind: 'reset' });
    await render(continued[pattern][0]!);
    await assert.rejects(runLive(Source, 'try', live, ['B', 'C', 'A']), /beyond the story/);
  }
});
