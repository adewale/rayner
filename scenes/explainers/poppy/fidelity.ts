import assert from 'node:assert/strict';
import { Text, VMobject } from '../../../src/index.ts';
import type { Scene } from '../../../src/index.ts';
import { LiveSink, liveSteps, runLive } from '../../../explain/internal.ts';
import { MachineMotionCheck } from '../../../tools/lib/explain-motion-rules.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';
import { assertFollowsStory, answersIn, worldsOf } from '../../../test/lib/story-fidelity.ts';
import type { Trace } from '../../../explain/testing.ts';
import { STORY, next, start } from './model.ts';
import type { Scope } from './model.ts';

const APPROVALS: Record<string, readonly Scope[]> = { 'read-write': ['orders:read', 'orders:write'], 'read-only': ['orders:read'] };

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>, {scenario}: FidelityRun): Promise<void> {
  const worlds = worldsOf(start(APPROVALS[values.approve!]!), next, STORY);
  assertFollowsStory(trace, worlds, (world) => answersIn(world.last).flatMap((answer) => [String(answer.status), ...(answer.error ? [answer.error] : [])]));
  await journeys(scenario);
}

/** The centreline and scale alone do not prove clearance: knock out the actual SVG
 * traveller and lettering at each painted frame, including arrival and departure.
 * The key's hollow ring and teeth are measured as ink, never as a filled rectangle. */
async function journeys(scenario: FidelityRun['scenario']): Promise<void> {
  const keys = ['ticket:flight', 'agent:key:flight', 'agent:key:return'] as const;
  const checks = new Map(keys.map(key => [key, {clear: routeInkCheck(), full: routeInkCheck(), frames: 0, poison: false}]));
  const required = ['API', 'Website', 'Chat', 'Sign-in', 'your agent'];
  const contracts = new MachineMotionCheck();
  const frame = async (scene: Scene) => {
    await contracts.frame(scene);
    const family = scene.familyMembers();
    const words = family.filter((m): m is Text => m instanceof Text &&
      (m.key === 'agent:name' || /^lane:[^:]+:name$/.test(m.key ?? '')));
    for (const key of keys) {
      const mover = family.find(m => m.key === key && m.family().some(p => p instanceof VMobject && p.hasPoints() && p.style.opacity > 0.5));
      if (!mover) continue;
      const check = checks.get(key)!;
      check.frames++;
      check.clear.frame(scene, key, words);
      if (key !== 'ticket:flight') {
        // This is the actual historical scale reversal on the authored path. Preserve
        // its ring, teeth, paint order and alpha and restore before the next frame.
        try { mover.scale(2); check.full.frame(scene, key, words); }
        finally { mover.scale(0.5); }
      }
      if (!check.poison && check.frames >= 8) {
        const word = words.find(m => m.text === 'Sign-in')!, at = mover.center();
        const poison = routeInkCheck();
        try {
          mover.moveTo(word.center());
          poison.frame(scene, key, [word]);
          assert.throws(() => poison.assertClear(`${key} overlap control`, ['Sign-in']), /hides [1-9]\d* painted text pixels/);
          check.poison = true;
        } finally { mover.moveTo(at); }
      }
    }
  };
  const authored = new scenario.Scene({frame});
  await contracts.during(authored, () => authored.run());
  assert.deepEqual(contracts.findings, [], `${scenario.values.approve}: authored event context`);
  for (const [key, check] of checks) {
    assert.ok(check.frames > 8 && check.poison, `${key}: actual painted travel and overlap control`);
    check.clear.assertClear(`${scenario.values.approve} authored ${key}`, required);
    if (key !== 'ticket:flight')
      assert.throws(() => check.full.assertClear(`${key} historical full-size control`, required), /hides [1-9]\d* painted text pixels/);
  }

  // A key can be issued again and each lane can follow a different prior exhibit.
  // Replay from the public reader origin; terminal story paint is not its only context.
  const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('sign-out');
  assert.ok(place, 'the final step offers reader events');
  for (const log of [
    ['discover', 'chat', 'browse', 'cart', 'exchange', 'sign-in', 'sign-out'],
    ['discover', 'sign-in', 'exchange', 'thief', 'sign-out', 'sign-in'],
    ['discover', 'chat', 'cart'],
    ['discover', 'cart', 'browse'],
    ['discover', 'browse', 'chat'],
    ['discover', 'sign-in', 'exchange'],
    ['discover', 'sign-in', 'thief'],
  ] as const) {
    const route = routeInkCheck();
    const mover = log.at(-1) === 'sign-in' ? 'agent:key:flight' : log.at(-1) === 'sign-out' ? 'agent:key:return' : 'ticket:flight';
    await runLive(scenario.Scene, 'sign-out', place, [...log], {from: 'start', animate: {
      async frame(scene) {
        const words = scene.familyMembers().filter((m): m is Text => m instanceof Text &&
          (m.key === 'agent:name' || /^lane:[^:]+:name$/.test(m.key ?? '')));
        route.frame(scene, mover, words);
      },
    }});
    route.assertClear(`${scenario.values.approve} reader ${log.join(',')}`, required);
  }
}
