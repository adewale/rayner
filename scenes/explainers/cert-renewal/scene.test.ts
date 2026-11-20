import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Code } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import CertificateRenewal from './scene.ts';

await loadFonts();

test('both Go functions fit complete 12 px phone views for every certificate setting', async () => {
  const project = await loadProject(CertificateRenewal, import.meta.dirname);
  const checked: Record<string, string>[] = [];
  for (const scenario of project.scenarios) {
    await new scenario.Scene({
      skipUntil: Infinity,
      async frame() {},
      async stepEnd(scene, step) {
        if (step.name !== 'replaces') return;
        const code = scene.familyMembers().filter((m): m is Code => m instanceof Code);
        const boxes = code.map(c => c.parent!.box()!);
        for (const [i, c] of code.entries()) {
          const size = Math.min(...c.lines.map(t => t.textSize())), b = boxes[i]!;
          assert.ok((b[2] - b[0]) * 12 / size <= 358, 'the whole source panel fits at 12 px');
          assert.ok((b[3] - b[1]) * 12 / size <= 358 * 9 / 16, 'the complete function fits the shortest phone stage');
          assert.ok(b[0] >= -8 && b[1] >= -4.5 && b[2] <= 8 && b[3] <= 4.5);
        }
        assert.equal(code.length, 2, 'both functions have their own complete reading region');
        assert.deepEqual(code.map(c => c.lines.length), [8, 5]);
        const source = code.flatMap(c => c.lines.map(t => t.text)).join('').replace(/\s/g, '');
        assert.ok(source.includes('returnreplaces,renewalInfo.SuggestedWindow.IsWithin(wfe.clk.Now()),nil'));
        assert.ok(source.includes('wfe.checkNewOrderLimits(ctx,acct.ID,idents,isRenewal)'));
        assert.ok(boxes[0]![2] < boxes[1]![0] - 0.5, 'separate the two source regions');
        checked.push(scenario.values);
      },
    }).run();
  }
  assert.equal(checked.length, 8);
  assert.deepEqual(checked, project.scenarios.map(s => s.values));
});
