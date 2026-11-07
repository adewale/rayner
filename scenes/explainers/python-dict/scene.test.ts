import { test } from 'node:test';
import { assertSteps } from '../../../test/lib/steps.ts';
import { collectProject } from '../../../tools/lib/explain-project.ts';

test('the story asks, breaks, repairs and misses; the hash and probe-path reference steps stay under details', async () => {
  const project = await collectProject('scenes/explainers/python-dict', { write: false });
  for (const scenario of project.scenarios) {
    assertSteps(scenario.trace, ['question', 'broken', 'marker', 'missing'], 'story');
    assertSteps(scenario.trace, ['hash', 'collision'], 'detail');
  }
});
