import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Text } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import { routeInkCheck } from '../lib/route-ink.ts';
import SignIn from './scene.ts';

await loadFonts();

test('password cards enter the field with the scope words still visible in each sign-in layout', async () => {
  const project = await loadProject(SignIn, import.meta.dirname);
  assert.deepEqual(project.scenarios.map(scenario => scenario.values.flow).sort(), ['device', 'direct']);
  for (const scenario of project.scenarios) {
    const first = routeInkCheck(), second = routeInkCheck();
    await new scenario.Scene({
      async frame(scene) {
        const step = scene.currentStep?.path;
        if (step !== 'approve' && step !== 'reask') return;
        const words = scene.familyMembers().filter((m): m is Text => m instanceof Text &&
          (m.key === 'page:orders:read:line' || m.key === 'page:orders:write:line'));
        (step === 'approve' ? first : second).frame(scene, 'password:travel', words);
      },
    }).run();
    const words = scenario.values.flow === 'device' ? ['read', 'write'] : ['See your orders', 'Exchange items'];
    first.assertClear(`${scenario.values.flow} first approval`, words);
    second.assertClear(`${scenario.values.flow} second approval`, words);
  }
});

test('the device poll and its reply reach the counter without hiding either line on the device card', async () => {
  const project = await loadProject(SignIn, import.meta.dirname);
  const scenario = project.scenarios.find(scenario => scenario.values.flow === 'device');
  assert.ok(scenario);
  const outward = routeInkCheck(), reply = routeInkCheck();
  await new scenario.Scene({
    async frame(scene) {
      if (scene.currentStep?.path !== 'ask') return;
      const words = scene.familyMembers().filter(object => object.key === 'card')
        .flatMap(card => card.family().filter((word): word is Text => word instanceof Text));
      outward.frame(scene, 'poll', words);
      reply.frame(scene, 'poll:back', words);
    },
  }).run();
  const words = ['WDJB-MJHT', 'Example Company'];
  outward.assertClear('outgoing poll', words);
  reply.assertClear('returning poll', words);
});
