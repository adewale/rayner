import { test } from 'node:test';
import { loadProject, assertSteps } from '../../../explain/testing.ts';
import PythonDict from './scene.ts';

test('the story asks, breaks, repairs and misses; the hash and probe-path reference steps stay under details', async () => {
  const project = await loadProject(PythonDict, 'scenes/explainers/python-dict');
  for (const scenario of project.scenarios) {
    assertSteps(scenario.trace, ['question', 'broken', 'marker', 'missing'], 'story');
    assertSteps(scenario.trace, ['hash', 'collision'], 'detail');
  }
});
