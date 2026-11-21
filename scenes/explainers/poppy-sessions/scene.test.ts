import assert from 'node:assert/strict';
import test from 'node:test';
import { renderFrame } from '../../../src/index.ts';
import { loadProject, withSettings } from '../../../explain/testing.ts';
import Sessions from './scene.ts';
import { start } from './model.ts';

// This author-facing test uses only the installed package's public boundaries.
// Native motion, private reader transport and historical poison controls run from
// the chapter's repository fidelity.ts through test/explain-fidelity.test.ts.
test('frame zero starts in the selected Sessions memory policy before the guided story', async () => {
  const project = await loadProject(Sessions, import.meta.dirname);
  assert.deepEqual(project.scenarios.map(s => s.values.company).sort(), ['remembers', 'required']);
  for (const company of ['remembers', 'required'] as const) {
    const Bound = withSettings(Sessions, {company});
    let frames = 0;
    const scene = await renderFrame(Bound, 0, {async frame(actual) {
      assert.equal(actual.frameCount, 0);
      assert.deepEqual(actual.stateJson(), start(company));
      frames++;
    }});
    assert.deepEqual(scene.state, start(company));
    assert.equal(frames, 1);
  }
});
