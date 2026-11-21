import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sink } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import type { Comparison } from './model.ts';
import { worked, state, namedViews, assertPictures, assertCurrent } from './fixtures/comparisons.test.ts';
import CachePolicies from './scene.ts';

await loadFonts();
const project = await loadProject(CachePolicies, import.meta.dirname);

test('both scenarios execute all eight independently worked requests and show both caches together at each resting step', async () => {
  assert.deepEqual(project.scenarios.map(s => s.values.pattern), ['loop', 'reuse']);
  for (const scenario of project.scenarios) {
    const pattern = scenario.values.pattern as 'loop' | 'reuse';
    const observed = new Map<number, Comparison>(), rests: string[] = [];
    const expectedSteps: Record<string, Comparison> = {
      full: state(worked[pattern][2]!), evict: state(worked[pattern][3]!),
      try: state(worked[pattern][7]!),
    };
    const live = scenario.trace.steps.find(s => s.step === 'try')!;
    assert.deepEqual(live.before, expectedSteps.evict, 'the live step begins after the fourth request');
    assert.deepEqual(live.after, expectedSteps.try, 'readers choose request nine');
    assert.equal(live.meta.line, pattern === 'loop' ? 'Eight requests: LRU 0 hits, MRU 3.' : 'Eight requests: LRU 4 hits, MRU 0.');
    const prediction = scenario.trace.steps.find(s => s.step === 'full')!.meta.predict!;
    assert.equal(prediction.answer, 'LRU drops A; MRU drops C');
    assert.ok(prediction.options.includes('LRU drops A; MRU drops C'));
    const sink: Sink = {
      async frame(scene) {
        const current = scene.state as unknown as Comparison, n = current.history.length;
        if (n > 0 && n <= 8 && !observed.has(n)) observed.set(n, JSON.parse(JSON.stringify(current)) as Comparison);
      },
      async stepEnd(scene, step) {
        rests.push(step.path);
        assertCurrent(scene, expectedSteps[step.path]!);
      },
    };
    await new scenario.Scene(sink).run();
    assert.equal(observed.size, 8, `${pattern}: every guided request, including the last four in the live step`);
    assert.deepEqual([...observed.values()], worked[pattern].map(state));
    assert.deepEqual(rests, ['full', 'evict', 'try']);
  }
});

test('the three named views project the supplied comparison, including a different scenario from their host', async () => {
  const scene = await new (project.scenario({ pattern: 'loop' }).Scene)({ skipUntil: Infinity, async frame() {} }).run();
  const views = namedViews(scene), supplied = state(worked.reuse[7]!);
  assert.notDeepEqual(scene.state, supplied, 'a closed-over host state would give the wrong picture');
  assertPictures({ lru: views.lru.draw(supplied, {}), mru: views.mru.draw(supplied, {}), stream: views.stream.draw(supplied, {}) }, supplied);
  // Deliberate defect: the left draw gets the right cache. The independently expected picture
  // rejects it even though both are valid Cache values and all part keys still look correct.
  assert.throws(() => assertPictures({
    lru: views.lru.draw({ ...supplied, lru: supplied.mru }, {}),
    mru: views.mru.draw(supplied, {}), stream: views.stream.draw(supplied, {}),
  }, supplied), assert.AssertionError);
});
