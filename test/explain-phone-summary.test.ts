import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closeUps, labelsToRead, READ_PX, stageScale, stepLayouts, viewBox} from '../app/embed-closeup.ts';
import {PRODUCT} from '../scenes/explainers/catalog.ts';
import {loadProject} from '../explain/testing.ts';

/** Explainer `id` of the collection, loaded as an author's test loads it. */
const loaded = async (id: string) => loadProject((await import(`../scenes/explainers/${id}/scene.ts`)).default, `scenes/explainers/${id}`);

test('the gallery introduction opens a first step that can advance', async () => {
  const project = await loaded(PRODUCT.entry.id);
  const selected = project.scenarios.find(v => Object.entries(PRODUCT.entry.settings).every(([key, value]) => v.values[key] === value));
  assert.ok(selected);
  assert.equal(PRODUCT.entry.step, selected.trace.steps[0]!.step);
  assert.ok(selected.trace.steps.length > 1, 'the primary introduction permits forward progress');
});

test('cache and rate comparisons keep their readable evidence together in one phone view', async () => {
  for (const [id, step] of [['mr-cache', 'request'], ['token-bucket', 'trace']] as const) {
    const project = await loaded(id);
    assert.equal(project.scenarios.length, id === 'mr-cache' ? 2 : 3);
    for (const scenario of project.scenarios) {
      // Values/mark ordering live in view-readouts.test.ts; this owner checks
      // the complete comparison's phone geometry and unchanged reading floor.
      const layout = (await stepLayouts(scenario.Scene)).get(step)!;
      assert.ok(layout);
      for (const width of [288, 358]) {
        const height = width * 9 / 16;
        const tour = closeUps(layout, width, height);
        assert.equal(tour.length, 1, `${id}/${JSON.stringify(scenario.values)} at ${width + 32}px: comparison needs no tour`);
        const labels = labelsToRead(layout);
        assert.ok(labels.length > 3, 'a nonempty comparison, not hidden labels');
        const visible = viewBox(tour[0]!, width, height);
        for (const label of labels) {
          assert.ok(label.size * stageScale(width, height).s * tour[0]!.k >= READ_PX - 1e-5, 'keep the 12px reading floor');
          assert.ok(label.box[0] >= visible[0] - 1e-5 && label.box[2] <= visible[2] + 1e-5 && label.box[1] >= visible[1] - 1e-5 && label.box[3] <= visible[3] + 1e-5, `${id}: label fits the opening`);
        }
      }
    }
  }
});
