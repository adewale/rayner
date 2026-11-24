// The real player's log operations, using the independent-cache comparison as a concrete case.
// App/internal imports belong here; the explainer's own scene tests use the public author API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectProject } from '../tools/lib/explain-project.ts';
import { shippedScenario } from '../tools/lib/scene-entry.ts';
import { runLive } from '../explain/live.ts';
import { explore, outcomes } from '../app/embed-live.ts';
import type { Exploration } from '../app/embed-live.ts';
import { worked, continued, ninthB, state, assertCurrent } from '../scenes/explainers/cache-policies/fixtures/comparisons.test.ts';
import type { Row } from '../scenes/explainers/cache-policies/fixtures/comparisons.test.ts';
const project = await collectProject('scenes/explainers/cache-policies', { write: false });

test('live sends update both policies; the player\'s Undo and Reset restore both pictures and the shared request history', async () => {
  for (const pattern of ['loop', 'reuse'] as const) {
    const scenario = project.scenarios.find((s) => s.values.pattern === pattern)!;
    const Source = scenario.Scene, live = scenario.live!.get('try')!;
    const shipped = shippedScenario(project, scenario).live;
    assert.deepEqual(shipped, [['try', { index: live.index, identity: live.identity, offered: true }]]);
    const place = shipped[0]![1];
    assert.deepEqual(live.machine.spec.views.map(v => v.key), ['cache:lru', 'cache:mru', 'cache:stream']);
    assert.deepEqual(live.machine.spec.events, ['A', 'B', 'C', 'D']);
    let exploration: Exploration<{ step: string }> = explore({ kind: 'none' }, { kind: 'link', now: { step: 'try' }, log: [] });
    const render = async (row: Row) => {
      assert.equal(exploration.kind, 'live');
      if (exploration.kind !== 'live') throw new Error('expected the live comparison');
      const shown = await runLive(Source, 'try', place, exploration.log);
      assertCurrent(shown.scene, state(row));
      return shown;
    };
    const base = worked[pattern][7]!;
    await render(base);
    exploration = explore(exploration, { kind: 'send', event: 'B' });
    await render(ninthB[pattern]);
    exploration = explore(exploration, { kind: 'undo' });
    await render(base);
    exploration = explore(exploration, { kind: 'send', event: 'A' });
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
    await render(base);
    await assert.rejects(runLive(Source, 'try', place, ['A', 'B', 'C', 'D']), /beyond the story/);
  }
});
