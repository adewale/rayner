import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAsync } from '@resvg/resvg-js';
import { Scene as NativeScene, Text, toSvgString } from '/workspace/rayner-audit/src/index.ts';
import type { View } from '/workspace/rayner-audit/explain/index.ts';
import { loadFonts, loadProject } from '/workspace/rayner-audit/explain/testing.ts';
import Conversations from '/workspace/rayner-audit/scenes/explainers/poppy-conversations/scene.ts';
await loadFonts();
test('owner and close replacements keep complete endpoint title ink while fading', async () => {
  const project = await loadProject(Conversations, '/workspace/rayner-audit/scenes/explainers/poppy-conversations');
  const samples = new Map([['owner', new Set([3, 9, 15, 21])], ['close', new Set([3, 6, 9, 12, 15])]]);
  const origins = new Map<string, number>(), checked = new Map<string, number>();
  const references = new Map<string, Uint8Array>();
  let poison = false;
  const titleKeys = ['state:title:0', 'state:title:1', 'owner:title:0'];
  const raster = async (word: Text, shrinkGlyphs = false) => {
    const copy = word.copy();
    // The oracle asks whether the word retains its endpoint ink, independently
    // of its intentional fade. Work on a copy; preserve the live scene exactly.
    for (const member of copy.family()) member.setStyle({opacity: 1}, false);
    if (shrinkGlyphs) for (const glyph of copy.children) glyph.scale(0.1);
    const isolated = new NativeScene({async frame() {}}); isolated.add(copy);
    const image = await renderAsync(toSvgString(isolated, {width: 800}), {font:{loadSystemFonts:false}});
    return image.pixels; // one native getter read per task
  };
  await new project.scenarios[0]!.Scene({async frame(scene) {
    const step = scene.currentStep?.path;
    if (!step || !samples.has(step)) return;
    if (!origins.has(step)) origins.set(step, scene.frameCount);
    const frame = scene.frameCount - origins.get(step)!;
    if (!samples.get(step)!.has(frame)) return;
    const family = scene.familyMembers();
    const view = scene.mobjects.find((m): m is View => 'draw' in m && typeof m.draw === 'function');
    assert.ok(view);
    const endpoints = [view.draw(scene.state, {...scene.shown, owner: false}), view.draw(scene.state, {...scene.shown, owner: true})];
    for (const key of titleKeys) {
      const endpoint = endpoints.flatMap(m => m.family()).find((m): m is Text => m instanceof Text && m.key === key);
      assert.ok(endpoint, `${step}: independently drawn ${key}`);
      const actual = family.filter((m): m is Text => m instanceof Text && m.key === key && m.text === endpoint.text);
      assert.equal(actual.length, 1, `${step} +${frame}/30: ${key} is present as one word`);
      const signature = `${step}:${key}`;
      let reference = references.get(signature);
      if (!reference) { reference = await raster(endpoint); references.set(signature, reference); }
      assert.ok(Buffer.from(await raster(actual[0]!)).equals(Buffer.from(reference)), `${step} +${frame}/30: ${key} retains full endpoint glyph ink`);
      checked.set(signature, (checked.get(signature) ?? 0) + 1);
      if (!poison) {
        assert.ok(!Buffer.from(await raster(actual[0]!, true)).equals(Buffer.from(reference)), 'per-glyph shrink poison must change native title ink');
        poison = true;
      }
    }
  }}).run();
  assert.equal(checked.size, 6, 'all three titles were checked during both authored replacements');
  for (const [step, frames] of samples) for (const key of titleKeys)
    assert.equal(checked.get(`${step}:${key}`), frames.size, `${step}: every requested native offset was reached`);
  assert.ok(poison, 'the native glyph shrink control actually ran');
});
