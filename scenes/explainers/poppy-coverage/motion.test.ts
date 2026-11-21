import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VMobject, type Mobject, type Vec } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import Coverage from './scene.ts';

await loadFonts();

test('the report explains sending the task and receiving its answer in those two legs', async () => {
  const project = await loadProject(Coverage, import.meta.dirname);
  assert.deepEqual(project.scenarios.map(s => s.values.company).sort(), ['honest', 'hostile']);
  for (const scenario of project.scenarios) {
    const legs: { key: string; start: Vec; moved: boolean }[] = [];
    let previous: Mobject | undefined;
    await new scenario.Scene({ async frame(scene) {
      if (scene.currentStep?.path !== 'report') return;
      const drawn = scene.findAll(key => key.startsWith('report:')).filter(part =>
        part.family().some(m => m instanceof VMobject && m.hasPoints() && m.style.opacity >= 0.5));
      assert.ok(drawn.length <= 1, 'the receiving journey follows the sending journey');
      const part = drawn[0];
      if (part) {
        const at = part.center();
        if (part !== previous) legs.push({key: part.key!, start: at, moved: false});
        const leg = legs.at(-1)!;
        leg.moved ||= at[0] !== leg.start[0] || at[1] !== leg.start[1];
      }
      previous = part;
    } }).run();
    assert.deepEqual(legs.map(leg => leg.key), ['report:sent', 'report:reply'], `${scenario.values.company}: the approved explanation has two journeys`);
    for (const leg of legs) assert.ok(leg.moved, `${leg.key} travels between two places`);
  }
});
