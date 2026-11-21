import { assertFollowsStory, worldsOf } from '../../../test/lib/story-fidelity.ts';
import type { Trace } from '../../../explain/testing.ts';
import assert from 'node:assert/strict';
import { Text } from '../../../src/index.ts';
import type { Scene } from '../../../src/index.ts';
import { STORY, next, progress, start } from './model.ts';

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>): Promise<void> {
  // The verdict the agent reaches, in the picture's words: whom the document speaks for, or why it was refused.
  assertFollowsStory(trace, worldsOf(start(), next, STORY), (world) => {
    const { verdict } = progress(world);
    return [`${world.ran} of 4 checks run`, ...(!verdict ? ['No verdict yet'] : verdict.accepted ? [verdict.company, verdict.userId] : [verdict.reason])];
  });
}

/** A URL is one address: a redirect may replace it, but cannot detach its path. */
export function assertJoinedUrl(scene: Scene): string[] {
  const visible = (key: string) => scene.familyMembers().filter((m): m is Text => m instanceof Text && m.key === key &&
    m.children.some(g => g.style.opacity * g.style.fillOpacity >= 0.5));
  const hosts = visible('url:host'), paths = visible('url:path');
  assert.equal(hosts.length, paths.length, 'the host and path must be replaced together');
  for (const host of hosts) for (const path of paths)
    assert.ok(Math.abs(host.box()![2] - path.box()![0]) < 1e-4, 'the readable path detached from its host during the redirect');
  return hosts.map(m => m.text);
}
