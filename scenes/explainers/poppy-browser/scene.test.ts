import assert from 'node:assert/strict';
import test from 'node:test';
import { withSettings } from '../../../explain/testing.ts';
import { renderFrame } from '../../../src/index.ts';
import PoppyBrowser from './scene.ts';
import { start } from './model.ts';

test('frame zero starts in the selected browser sign-in world before the guided join', async () => {
  for (const [setting, signIn] of [
    ['signed-in', 'signed in'], ['signed-out', 'signed out'], ['no-scope', 'signed in without the browser scope'],
  ] as const) {
    const Bound = withSettings(PoppyBrowser, { signin: setting });
    let frames = 0;
    const scene = await renderFrame(Bound, 0, { async frame(actual) {
      assert.equal(actual.frameCount, 0);
      assert.deepEqual(actual.stateJson(), start(signIn));
      frames++;
    } });
    assert.deepEqual(scene.state, start(signIn));
    assert.equal(frames, 1);
  }
});

// These assertions name the chapter's choreography rather than prohibiting ordinary movement.
// Native glyph/occlusion evidence belongs to this chapter's fidelity.ts.
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import { Scene, Text, VMobject } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import { drawWorld, shortCode } from './picture.ts';
import { next } from './model.ts';
import type { World } from './model.ts';
import { isRefusal } from '../../../explain/index.ts';

await loadFonts();

const visible = (part: Mobject) => part.family().some(m => m instanceof VMobject && m.hasPoints() &&
  m.style.opacity * Math.max(m.style.fillOpacity, m.style.strokeOpacity) >= 0.5);
const painted = (scene: Scene, key: string) => scene.familyMembers().filter(m => m.key === key && visible(m));

test('issuance is sequential after its specific record, reads retain their source, and submission consumes its page stub', async () => {
  const project = await loadProject(PoppyBrowser, import.meta.dirname);
  assert.equal(project.scenarios.length, 3);
  for (const scenario of project.scenarios) {
    const positions = new Map<string, Set<string>>();
    const issued = new Map<string, number>();
    let readCopies = 0, consumed = 0, paired = 0;
    await new scenario.Scene({ async frame(scene) {
      const w = scene.state as World;
      for (const key of ['ticket:flight', 'page:stub:flight', 'shelf:join:flight', 'read', 'carried', 'forged']) {
        for (const part of painted(scene, key)) {
          const seen = positions.get(key) ?? new Set<string>();
          seen.add(part.center().join(',')); positions.set(key, seen);
          if (key === 'page:stub:flight' || key === 'shelf:join:flight') {
            assert.equal(w.last?.event, 'load');
            if (w.last?.event !== 'load') throw new Error('issuance without a load');
            const row = `row:${shortCode(w.last.code)}`;
            assert.equal(painted(scene, `${row}:stub`).length, 1, 'this code is recorded before issuance');
            assert.equal(painted(scene, `${row}:ring`).length, 1, 'the unstamped record is visible during issuance');
            assert.equal(painted(scene, 'rack:none').length, 0, 'the old empty-rack notice clears before issuance');
            assert.equal(painted(scene, key === 'page:stub:flight' ? 'shelf:join:flight' : 'page:stub:flight').length, 0,
              'the independently meaningful halves are issued one at a time');
            if (key === 'shelf:join:flight') assert.ok(issued.has('page:stub:flight'), 'the page code issues first');
            issued.set(key, (issued.get(key) ?? 0) + 1);
          }
          if (key === 'ticket:flight') assert.equal(painted(scene, 'lane:agent:name').length, 0,
            'this authored road reserves its full corridor for the ticket rather than a road-name label');
          if (key === 'read') {
            assert.equal(painted(scene, 'page:stub').length, 1, 'a read keeps the original code on the page');
            readCopies++;
          }
          if (key === 'carried') {
            assert.equal(painted(scene, 'page:stub').length, 0, 'submission has one physical page stub'); consumed++;
            const half = painted(scene, 'carried:half')[0];
            if (half) paired++;
          }
          if (key === 'read' || key === 'forged') {
            const words = part.family().filter((m): m is Text => m instanceof Text);
            assert.equal(words.length, 1, `${key} carries one literal code`);
            assert.ok(words[0]!.height() >= 0.54, `${key} uses a purpose-sized travel literal`);
          }
        }
      }
    } }).run();
    for (const key of ['ticket:flight', 'page:stub:flight', 'shelf:join:flight', 'read', 'carried', 'forged'])
      assert.ok((positions.get(key)?.size ?? 0) > 2, `${scenario.values.signin}: ${key} really moves`);
    assert.ok(readCopies > 2 && consumed > 2 && paired > 2, 'the positive copy, consumed stub and parallel submission were all exercised');
  }
});

test('legend positions are independent of rack length in an explicit legend-visible fixture', () => {
  const scene = new Scene({ async frame() {} }), s = stage(scene, {heading: false});
  const pictures = [start('signed in')];
  for (let i = 0; i < 2; i++) {
    const loaded = next(pictures.at(-1)!, 'load');
    assert.ok(!isRefusal(loaded)); pictures.push(loaded);
    const submitted = next(loaded, 'submit');
    assert.ok(!isRefusal(submitted)); pictures.push(submitted);
  }
  const legends = pictures.map(w => drawWorld(w, s.drawing, {attacker: false}).family()
    .filter(m => m.key?.startsWith('legend:')).map(m => [m.key, m.box()]));
  assert.equal(legends.length, 5);
  assert.equal(legends[0]!.length, 4);
  assert.equal(pictures.at(-1)!.company.codes.length, 4, 'the independent fixture has two own rack records');
  for (const legend of legends) assert.deepEqual(legend, legends[0]);
});
