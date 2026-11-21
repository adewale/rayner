import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VMobject } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import Coverage from './scene.ts';

await loadFonts();

test('the report explains sending the task and receiving its answer in those two legs', async () => {
  const project = await loadProject(Coverage, import.meta.dirname);
  assert.deepEqual(project.scenarios.map(s => s.values.company).sort(), ['honest', 'hostile']);
  for (const scenario of project.scenarios) {
    const seen = new Map<string, number>();
    await new scenario.Scene({ async frame(scene) {
      if (scene.currentStep?.path !== 'report') return;
      for (const part of scene.familyMembers()) if (part.key?.startsWith('report:') &&
        part.family().some(m => m instanceof VMobject && m.hasPoints() && m.style.opacity >= 0.5)) {
        if (!seen.has(part.key)) seen.set(part.key, scene.time);
      }
    } }).run();
    assert.deepEqual([...seen.keys()], ['report:sent', 'report:reply'], `${scenario.values.company}: the approved explanation has two journeys`);
    assert.ok(seen.get('report:sent')! < seen.get('report:reply')!, 'the reply follows the report');
  }
});
