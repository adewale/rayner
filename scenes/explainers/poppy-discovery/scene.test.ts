import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import Discovery from './scene.ts';
import { Text } from '../../../src/index.ts';
import type { Scene } from '../../../src/index.ts';

await loadFonts();

/** A URL is one address: a redirect may replace it, but cannot detach its path. */
function assertJoinedUrl(scene: Scene): string[] {
  const visible = (key: string) => scene.familyMembers().filter((m): m is Text => m instanceof Text && m.key === key &&
    m.children.some(g => g.style.opacity * g.style.fillOpacity >= 0.5));
  const hosts = visible('url:host'), paths = visible('url:path');
  assert.equal(hosts.length, paths.length, 'the host and path must be replaced together');
  for (const host of hosts) for (const path of paths)
    assert.ok(Math.abs(host.box()![2] - path.box()![0]) < 1e-4, 'the readable path detached from its host during the redirect');
  return hosts.map(m => m.text);
}

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
