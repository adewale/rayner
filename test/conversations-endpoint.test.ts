import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {renderAsync} from '@resvg/resvg-js';
import {loadFonts, loadProject} from '../explain/testing.ts';
import {LiveSink, liveBase, liveSteps, runLive} from '../explain/internal.ts';
import {machinesOf} from '../explain/machine.ts';
import {toSvgString} from '../src/index.ts';
import type {Mobject, Scene} from '../src/index.ts';
import Conversations from '../scenes/explainers/poppy-conversations/scene.ts';

await loadFonts();
const raster = async (svg: string) => Buffer.from((await renderAsync(svg, {font: {loadSystemFonts: false}})).pixels);

/** The actual rendered contribution of a participant, including background occlusion. */
async function participantInk(scene: Scene, part: Mobject): Promise<number> {
  const actual = await raster(toSvgString(scene, {width: 800, cull: true}));
  const members = part.family(), opacity = members.map(m => m.style.opacity);
  let absent: Buffer;
  try {
    members.forEach(m => m.setStyle({opacity: 0}, false));
    absent = await raster(toSvgString(scene, {width: 800, cull: true}));
  } finally { members.forEach((m, i) => m.setStyle({opacity: opacity[i]!}, false)); }
  let pixels = 0;
  for (let i = 0; i < actual.length; i += 4) if (actual[i] !== absent[i] || actual[i + 1] !== absent[i + 1] || actual[i + 2] !== absent[i + 2] || actual[i + 3] !== absent[i + 3]) pixels++;
  return pixels;
}

test('public reader direct and inverse close settle with participant ink before target adoption', async () => {
  const project = await loadProject(Conversations, fileURLToPath(new URL('../scenes/explainers/poppy-conversations/', import.meta.url))), Source = project.scenarios[0]!.Scene;
  assert.equal(project.scenarios.length, 1);
  const place = liveSteps(await new Source(new LiveSink()).run()).get('read');
  assert.ok(place?.offered, 'use the actual published reader controls');
  const base = (await liveBase(Source, 'read', place)).base;
  assert.equal(base?.from, 'rest', 'read controls start at the published resting reply');
  // The shortest real reader press, another message, an invitation, and an
  // existing human participant exercise both retained marks and new seats.
  const openings = [['direct'], ['ask', 'read', 'direct'], ['invite', 'direct'], ['person', 'joins', 'read', 'direct']];
  let checked = 0, poison = false;
  for (const opening of openings) for (const inverse of [false, true]) {
    const log = inverse ? [...opening, 'read', 'close'] : opening;
    const last: {svg: string; absolute: number; phase: string}[] = [];
    let frames = 0;
    const run = await runLive(Source, 'read', place, log, {from: base!.from, animate: {async frame(scene) {
      // Snapshot before TakePictures can repair sibling order. Retain only the
      // final settled native frames, not the scene's mutable object references.
      last.push({svg: toSvgString(scene, {width: 800, cull: true}), absolute: scene.frameCount, phase: scene.phase});
      if (last.length > 2) last.shift();
      frames++;
    }}});
    assert.ok(frames >= 54, `${log}: the complete final event played natively`);
    assert.equal(last.length, 2);
    assert.equal(last[0]!.phase, 'playing', 'the terminal witness precedes TakePictures completion');
    assert.equal(last[0]!.absolute, last[1]!.absolute, 'native terminal and final adoption share the ending clock');
    const view = machinesOf(run.scene)[0]!.spec.views[0]!;
    view.rebuild();
    const expected = await raster(toSvgString(run.scene, {width: 800, cull: true}));
    for (const [i, svg] of last.entries()) assert.ok((await raster(svg.svg)).equals(expected), `${log}: settled native frame ${i} differs before target adoption`);
    const keys = inverse ? ['agent:mark', 'you:mark', 'company:mark'] : ['agent:mark', 'you:mark', 'direct:agent:mark'];
    for (const key of keys) {
      const part = run.scene.find(key);
      assert.ok(part, `${log}: ${key} is in this picture`);
      assert.ok(await participantInk(run.scene, part) > 50, `${log}: ${key} must visibly occupy its seat`);
    }
    if (!poison && !inverse) {
      const seat = run.scene.find('seat:direct:co')!, mark = run.scene.find('direct:agent:mark')!, parent = seat.parent!;
      const index = parent.children.indexOf(seat);
      try {
        parent.add(seat);
        assert.equal(await participantInk(run.scene, mark), 0, 'an opaque seat really hides the AI mark');
        assert.ok(!(await raster(toSvgString(run.scene, {width: 800, cull: true}))).equals(expected), 'the same native endpoint comparison rejects that stacking reversal');
      } finally { parent.insert(index, seat); }
      poison = true;
    }
    checked++;
  }
  assert.equal(checked, 8, 'four public reader routes and their inverse close transitions');
  assert.ok(poison);
});
