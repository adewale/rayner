import assert from 'node:assert/strict';
import { Text } from '../../../src/index.ts';
import type { Scene } from '../../../src/index.ts';
import { LiveSink, liveSteps, runLive } from '../../../explain/internal.ts';
import type { Trace } from '../../../explain/testing.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';
import { assertFollowsStory, answersIn, worldsOf } from '../../../test/lib/story-fidelity.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import { CARDS, STORY, next, start } from './model.ts';
import type { Flow, SignInEvent } from './model.ts';

/** Include the printed lines individually along with their paper and the named station parts. */
function surfaces(scene: Scene, keys: ReadonlySet<string>) {
  const parts = scene.familyMembers().filter(m => m.key && keys.has(m.key));
  const lettering = parts.filter(m => m.key === 'card' || m.key === 'tag')
    .flatMap(m => m.family().filter((part): part is Text => part instanceof Text));
  return [...parts, ...lettering];
}

/** Check the authored story and the reader's open device request alongside its earlier grant. */
export async function check(trace: Trace, values: Record<string, string>, {scenario}: FidelityRun): Promise<void> {
  const flow = values.flow as Flow;
  assertFollowsStory(trace, worldsOf(start(flow), next, STORY[flow]), (world) => answersIn(world.last).flatMap((answer) => [String(answer.status), ...(answer.error ? [answer.error] : [])]));
  if (flow !== 'device') return;

  const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('sign-out');
  assert.ok(place, 'the final sign-in step exposes the reader machine');
  const readGrant: SignInEvent[] = ['ask', 'approve-read', 'collect', 'ask'];
  const ring = ['agent:ring', 'agent:key:slot', 'your agent'];
  const display = ['card', 'WDJB-MJHT', 'Example Company', 'you:password'];
  const credentials = ['agent:key', 'tag:cord', 'tag', 'refresh token', CARDS[0]];
  const runs: {log: SignInEvent[]; required: string[]; returns: boolean}[] = [
    {log: ['ask', 'collect'], required: [...ring, ...display], returns: true},
    {log: ['ask', 'approve-read', 'collect'], required: ring, returns: false},
    {log: [...readGrant, 'collect'], required: [...ring, ...display, ...credentials], returns: true},
    {log: [...readGrant, 'approve-read', 'collect'], required: [...ring, ...credentials], returns: false},
    {log: ['ask', 'approve-all', 'collect'], required: ring, returns: false},
    {log: [...readGrant, 'approve-all', 'collect'], required: [...ring, ...credentials], returns: false},
  ];
  const keys = new Set(['agent:name', 'agent:ring', 'agent:key:slot', 'agent:key', 'tag:cord', 'tag', 'card', 'you:password']);
  for (const {log, required, returns} of runs) {
    const outward = routeInkCheck(), back = routeInkCheck();
    await runLive(scenario.Scene, 'sign-out', place, log, {from: 'start', animate: {
      async frame(scene) {
        const protectedParts = surfaces(scene, keys);
        outward.frame(scene, 'poll', protectedParts);
        if (returns) back.frame(scene, 'poll:back', protectedParts);
      },
    }});
    outward.assertClear(log.join(', ') + ' outward poll', required);
    if (returns) back.assertClear(log.join(', ') + ' returning poll', required);
  }

  const afterThief: SignInEvent[] = [...readGrant, 'approve-read', 'collect', 'ask', 'approve-read', 'thief'];
  const trips: {log: SignInEvent[]; mover: string; required: string[]}[] = [
    {log: readGrant, mover: 'card:flight', required: [...ring, ...credentials]},
    {log: [...readGrant, 'sign-out'], mover: 'tag:return', required: [...ring, ...display, ...credentials]},
    {log: [...afterThief, 'disconnect'], mover: 'tag:return', required: [...ring, 'refresh token', CARDS[1]]},
  ];
  for (const {log, mover, required} of trips) {
    const clearance = routeInkCheck();
    const protectedKeys = new Set([...keys, 'agent:station', 'agent:seal', 'page:orders:read:line', 'page:orders:write:line']);
    // A presentation gives way to its printed card. A returning tag leaves its own source.
    protectedKeys.delete(mover === 'card:flight' ? 'card' : 'tag');
    await runLive(scenario.Scene, 'sign-out', place, log, {from: 'start', animate: {
      async frame(scene) {
        const parts = surfaces(scene, protectedKeys);
        if (mover === 'tag:return' && !scene.familyMembers().some(m => m.key === mover)) {
          parts.push(...surfaces(scene, new Set(['tag'])));
        }
        clearance.frame(scene, mover, parts);
      },
    }});
    clearance.assertClear(log.join(', ') + ' ' + mover, required);
  }
}
