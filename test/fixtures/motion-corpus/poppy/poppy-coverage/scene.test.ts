import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Text } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import Coverage from './scene.ts';

await loadFonts();

test('the gift-card search replaces the prior user command before the new request is read', async () => {
  const project = await loadProject(Coverage, import.meta.dirname);
  assert.equal(project.scenarios.length, 2);
  const checked: string[] = [];
  for (const scenario of project.scenarios) {
    let closeSeen = false, giftSeen = false;
    await new scenario.Scene({
      async frame(scene) {
        if (scene.currentStep?.path !== 'stuck') return;
        const words = (key: string) => scene.familyMembers().filter(m => m.key === key).flatMap(m =>
          m.family().filter((word): word is Text => word instanceof Text && word.children.length > 0 &&
            word.children.every(g => g.style.opacity >= 0.95)));
        const old = words('user:close'), next = words('user:gift');
        closeSeen ||= old.length > 0;
        giftSeen ||= next.length > 0;
        for (const a of old) for (const b of next) {
          const before = a.box()!, after = b.box()!;
          assert.ok(before[2] <= after[0] || after[2] <= before[0] || before[3] <= after[1] || after[3] <= before[1],
            'the old command covers the new gift-card request');
        }
      },
    }).run();
    assert.ok(closeSeen && giftSeen, 'both the preceding command and new request were actually drawn');
    checked.push(String(scenario.values.company));
  }
  assert.deepEqual(checked.sort(), ['honest', 'hostile']);
});

test('the tasks list passes the desk headings while the shop and agent readouts stay legible', async () => {
  const project = await loadProject(Coverage, import.meta.dirname);
  assert.deepEqual(project.scenarios.map(scenario => scenario.values.company).sort(), ['honest', 'hostile']);
  for (const scenario of project.scenarios) {
    const list = routeInkCheck();
    await new scenario.Scene({
      async frame(scene) {
        if (scene.currentStep?.path !== 'board') return;
        const words = scene.familyMembers().filter(object => object.key === 'feedback:name' || object.key === 'trayname' ||
          object.key?.startsWith('desk:') || object.key?.startsWith('user:'))
          .flatMap(object => object.family().filter((word): word is Text => word instanceof Text));
        await list.frame(scene, 'list', words);
      },
    }).run();
    list.assertClear(`${scenario.values.company} shop task list`, ['feedback', 'what its model reads', 'the shop sees', 'Close my account']);
  }
});
