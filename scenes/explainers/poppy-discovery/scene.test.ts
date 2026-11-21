import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import Discovery from './scene.ts';
import { assertJoinedUrl } from './fidelity.ts';

await loadFonts();

test('redirect replaces the complete address while preserving the host/path join on every painted frame', async () => {
  const project = await loadProject(Discovery, import.meta.dirname);
  assert.equal(project.scenarios.length, 1);
  const hosts = new Set<string>();
  let observations = 0;
  await new project.scenarios[0]!.Scene({ async frame(scene) {
    const words = assertJoinedUrl(scene);
    for (const word of words) hosts.add(word);
    observations += words.length;
  } }).run();
  assert.ok(observations > 100, 'the address really paints during the story');
  assert.ok(hosts.has('www.example.com') && hosts.has('example.com'), 'both sides of the redirect were witnessed');
});
