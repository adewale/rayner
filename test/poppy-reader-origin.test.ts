import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadFonts, loadProject } from '../explain/testing.ts';
import { liveSteps, logStart, runLive } from '../explain/internal.ts';
import { NullSink } from '../src/internal.ts';
import Poppy from '../scenes/explainers/poppy/scene.ts';

await loadFonts();

test('Poppy keeps its signed-out story picture while reader events begin before discovery', async () => {
  const project = await loadProject(Poppy, fileURLToPath(new URL('../scenes/explainers/poppy/', import.meta.url)));
  assert.deepEqual(project.scenarios.map(s => s.values.approve).sort(), ['read-only', 'read-write']);
  for (const scenario of project.scenarios) {
    const guided = await new scenario.Scene(new NullSink()).run();
    const places = liveSteps(guided);
    assert.deepEqual([...places.keys()], ['sign-out']);
    const place = places.get('sign-out')!;
    const resting = await runLive(scenario.Scene, 'sign-out', place, []);
    const approves = scenario.values.approve === 'read-only' ? ['orders:read'] : ['orders:read', 'orders:write'];
    assert.deepEqual(resting.rest, {
      approves, found: true, started: true, cart: true, grant: false, linked: 'signed out', last: { kind: 'revoke' },
    }, 'opening and Reset retain the authored sign-out, cart and Session');
    const base = logStart(resting.machine, resting.rest);
    assert.equal(base?.from, 'start', 'the promised whole-protocol controls must reach discovery');
    assert.deepEqual(base?.state, {
      approves, found: false, started: false, cart: false, grant: false, linked: 'no', last: null,
    });
    const discovered = await runLive(scenario.Scene, 'sign-out', place, ['discover'], { from: base!.from });
    assert.deepEqual({ ...discovered.scene.state, last: undefined }, {
      approves, found: true, started: false, cart: false, grant: false, linked: 'no', last: undefined,
    }, 'the first reader press discovers the Company before any Session or cart exists');
    assert.equal((discovered.scene.state as { last: { kind: string } }).last.kind, 'discover');
  }
});
