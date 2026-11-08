import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { collectProject } from '../tools/lib/explain-project.ts';
import { RECIPES } from '../scenes/explainers/feature-tour/scene.ts';
import { EXPLAINERS } from '../scenes/explainers/catalog.ts';

test('retired Hello World is absent from source and active authoring paths', () => {
  assert.equal(EXPLAINERS.some(e => e.id === 'hello-world'), false);
  assert.equal(existsSync('scenes/explainers/hello-world'), false);
  for (const path of ['README.md', 'docs/TUTORIAL.md', 'docs/FEATURE-TOUR.md'])
    assert.doesNotMatch(readFileSync(path, 'utf8'), /hello.world|BY-EXAMPLE|Learn by example/i, path);
});

test('every authoring feature offers a scenario with its user-side code before its result', async () => {
  const project = await collectProject('scenes/explainers/feature-tour', { write: false });
  assert.equal(project.scenarios.length, Object.keys(RECIPES).length);
  assert.ok(project.scenarios.length >= 15, 'documented authoring families are represented');
  const seen = new Set<string>();
  for (const { values, trace } of project.scenarios) {
    const feature = values.feature as keyof typeof RECIPES;
    assert.ok(RECIPES[feature], `unexpected setting ${feature}`);
    seen.add(feature);
    assert.deepEqual(trace.steps.map(s => s.step), ['recipe', 'result'], feature);
    const recipe = trace.steps[0]!, resultStep = trace.steps[1]!;
    assert.equal(recipe.shown!.phase, 'recipe');
    assert.equal(resultStep.shown!.phase, 'result');
    assert.equal(resultStep.after.feature, feature);
    const pictured = recipe.shown!.picture as { entries: { items?: string[] }[] };
    const lines = pictured.entries.flatMap(entry => entry.items ?? []);
    assert.deepEqual(lines.map(line => line.replace(/^\d+: /, '')), RECIPES[feature].code, feature);
    const result = resultStep.shown!.picture as { entries: unknown[] };
    assert.ok(result.entries.length > 0, `${feature}: show the actual feature result, not just source text`);
  }
  assert.deepEqual([...seen].sort(), Object.keys(RECIPES).sort());
  assert.equal(EXPLAINERS.find(e => e.id === 'feature-tour')?.step, 'result');
  assert.equal((project.Scene.meta as { scenarioNavigation?: string }).scenarioNavigation, 'first', 'changing an authoring feature starts its recipe');
  const state = project.scenarios.find(v => v.values.feature === 'state')!;
  assert.equal(state.trace.steps[1]!.after.count, 1, 'the view scenario must update recorded state');
  assert.match(JSON.stringify(state.trace.steps[1]!.shown!.picture), /Recorded count: 1/);
});
