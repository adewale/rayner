import {paintedPixels} from '../lib/native-ink.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { withIntent, withSettings } from '../../../explain/testing.ts';
import { Text, VMobject } from '../../../src/index.ts';
import type { Scene } from '../../../src/index.ts';
import { LiveSink, liveBase, liveSteps, runLive } from '../../../explain/internal.ts';
import type { Trace } from '../../../explain/testing.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';
import { assertFollowsStory, answersIn, worldsOf } from '../../../test/lib/story-fidelity.ts';
import { MachineMotionCheck } from '../../../tools/lib/explain-motion-rules.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import { CARDS, DEVICE, ORGANIZATION, STORY, next, start } from './model.ts';
import type { Flow, SignInEvent } from './model.ts';

/** Include the printed lines individually along with their paper and the named station parts. */
function surfaces(scene: Scene, keys: ReadonlySet<string>) {
  const parts = scene.familyMembers().filter(m => m.key && keys.has(m.key));
  const lettering = parts.filter(m => m.key === 'card' || m.key === 'tag')
    .flatMap(m => m.family().filter((part): part is Text => part instanceof Text));
  return [...parts, ...lettering];
}

/** Check the authored story and the reader's open device request alongside its earlier grant. */
export async function check(trace: Trace, values: Record<string, string>, {scenario}: Pick<FidelityRun, 'scenario'>): Promise<void> {
  const flow = values.flow as Flow;
  assertFollowsStory(trace, worldsOf(start(flow), next, STORY[flow]), (world) => answersIn(world.last).flatMap((answer) => [String(answer.status), ...(answer.error ? [answer.error] : [])]));
  await collectionPacing(scenario);
  await collectionSlowdown(scenario);
  await unchangedPassword(scenario);
  await issuedKeys(scenario);
  await approvals(scenario);
  const contracts = new MachineMotionCheck(), authored = new scenario.Scene(contracts);
  await contracts.during(authored, () => authored.run());
  assert.deepEqual(contracts.findings, [], `${flow} authored handoff and page contracts`);
  if (flow !== 'device') return;
  await presentation(scenario);

  const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('sign-out');
  assert.ok(place, 'the final sign-in step exposes the reader machine');
  const {base} = await liveBase(scenario.Scene, 'sign-out', place);
  assert.ok(base, 'the reader offers an admitted origin');
  const readGrant: SignInEvent[] = ['ask', 'approve-read', 'collect', 'ask'];
  const ring = ['agent:ring', 'agent:key:slot', 'your agent'];
  const display = ['card', 'WDJB-MJHT', 'Example Company', 'you:password'];
  const credentials = ['agent:key', 'tag:cord', 'tag', 'refresh token', CARDS[0]];
  const runs: {log: SignInEvent[]; required: string[]; returns: boolean}[] = [
    {log: ['ask', 'collect'], required: [...ring, ...display], returns: true},
    {log: ['ask', 'collect', 'collect'], required: [...ring, ...display], returns: true},
    {log: ['ask', 'approve-read', 'collect'], required: ring, returns: false},
    {log: [...readGrant, 'collect'], required: [...ring, ...display, ...credentials], returns: true},
    {log: [...readGrant, 'collect', 'collect'], required: [...ring, ...display, ...credentials], returns: true},
    {log: [...readGrant, 'approve-read', 'collect'], required: [...ring, ...credentials], returns: false},
    {log: ['ask', 'approve-all', 'collect'], required: ring, returns: false},
    {log: [...readGrant, 'approve-all', 'collect'], required: [...ring, ...credentials], returns: false},
  ];
  const keys = new Set(['agent:name', 'agent:ring', 'agent:key:slot', 'agent:key', 'tag:cord', 'tag', 'card', 'you:password']);
  for (const {log, required, returns} of runs) {
    const outward = routeInkCheck(), back = routeInkCheck();
    await runLive(scenario.Scene, 'sign-out', place, log, {from: base.from, animate: {
      async frame(scene) {
        const protectedParts = surfaces(scene, keys);
        await outward.frame(scene, 'poll', protectedParts);
        if (returns) await back.frame(scene, 'poll:back', protectedParts);
      },
    }});
    outward.assertClear(log.join(', ') + ' outward poll', required);
    if (returns) back.assertClear(log.join(', ') + ' returning poll', required);
  }

  const afterThief: SignInEvent[] = [...readGrant, 'approve-read', 'collect', 'ask', 'approve-read', 'thief'];
  const trips: {log: SignInEvent[]; mover: string; required: string[]}[] = [
    {log: ['ask'], mover: 'card:flight', required: ['agent:ring', 'your agent', 'you:password']},
    {log: readGrant, mover: 'card:flight', required: [...ring, ...credentials]},
    {log: [...readGrant, 'sign-out'], mover: 'tag:return', required: [...ring, ...display, ...credentials]},
    {log: [...afterThief, 'disconnect'], mover: 'tag:return', required: [...ring, 'refresh token', CARDS[1]]},
  ];
  for (const {log, mover, required} of trips) {
    const clearance = routeInkCheck();
    const protectedKeys = new Set([...keys, 'agent:station', 'agent:seal', 'page:orders:read:line', 'page:orders:write:line']);
    // A presentation gives way to its printed card. A returning tag leaves its own source.
    protectedKeys.delete(mover === 'card:flight' ? 'card' : 'tag');
    // The empty-key guide is deliberately behind the first displayed card.
    if (mover === 'card:flight' && log.length === 1) protectedKeys.delete('agent:key:slot');
    await runLive(scenario.Scene, 'sign-out', place, log, {from: base.from, animate: {
      async frame(scene) {
        const parts = surfaces(scene, protectedKeys);
        if (mover === 'tag:return' && !scene.familyMembers().some(m => m.key === mover)) {
          parts.push(...surfaces(scene, new Set(['tag'])));
        }
        await clearance.frame(scene, mover, parts);
      },
    }});
    clearance.assertClear(log.join(', ') + ' ' + mover, required);
  }
}

function painted(part: import('../../../src/index.ts').Mobject | undefined): boolean {
  return !!part && part.family().some(member => {
    if (!(member instanceof VMobject) || !member.box()) return false;
    let alpha = member.style.opacity;
    for (let parent = member.parent; parent; parent = parent.parent) alpha *= parent.style.opacity;
    return alpha > 0.01 && (member.style.fill !== 'none' || member.style.stroke !== 'none');
  });
}

async function presentation(scenario: FidelityRun['scenario']) {
  const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('sign-out')!;
  const {base} = await liveBase(scenario.Scene, 'sign-out', place);
  assert.ok(base, 'the reader offers an admitted origin');
  const logs: SignInEvent[][] = [['ask'], ['ask', 'approve-read', 'collect', 'ask']];
  for (const log of logs) {
    let count = 0, first = true;
    await runLive(scenario.Scene, 'sign-out', place, log, {from: base.from, animate: {
      async frame(scene) {
        const part = scene.familyMembers().find(m => m.key === 'card:flight');
        if (!painted(part)) return;
        count++;
        const box = part!.box()!, frame = scene.frame.box()!;
        assert.ok(box[0] >= frame[0] && box[2] <= frame[2] && box[1] >= frame[1] && box[3] <= frame[3], 'the paper and every printed letter fit onstage throughout presentation');
        const printed = part!.family().filter((m): m is Text => m instanceof Text).map(m => m.text);
        for (const required of [ORGANIZATION.name, ORGANIZATION.domain, DEVICE.user_code])
          assert.ok(printed.includes(required), `the presented card includes ${required}`);
        if (first) {
          first = false;
          const slot = scene.familyMembers().find(m => m.key === 'agent:key:slot')!;
          assert.ok(box[1] > slot.box()![3], 'presentation begins above the agent ring and key, including its empty guide');
          assert.ok(part!.center()[0] <= -1.8, 'the agent presents the card on its own side, away from the Company desk');
        }
      },
    }});
    assert.ok(count > 2, 'the complete printed card must actually appear and move');
  }
}

async function approvals(scenario: FidelityRun['scenario']) {
  const approvals: SignInEvent[] = ['approve-read', 'approve-all'];
  const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('sign-out')!;
  const {base} = await liveBase(scenario.Scene, 'sign-out', place);
  assert.ok(base, 'the reader offers an admitted origin');
  for (const event of approvals) for (const repeat of [false, true]) {
    const log: SignInEvent[] = repeat ? ['ask', 'approve-read', 'collect', 'ask', event] : ['ask', event];
    let source: number[] | undefined, moved = 0, initial = false;
    await runLive(scenario.Scene, 'sign-out', place, log, {from: base.from, animate: {
      async frame(scene) {
        const members = scene.familyMembers(), hand = members.find(m => m.key === 'you:password');
        const field = members.find(m => m.key === 'page:password');
        if (!source && painted(hand)) { source = [...hand!.center()]; initial = true; assert.ok(!painted(field), 'the field starts empty'); }
        const trip = members.find(m => m.key === 'page:password:flight');
        if (!painted(trip) || !source || Math.hypot(trip!.center()[0] - source[0]!, trip!.center()[1] - source[1]!) < 0.01) return;
        assert.ok(Math.abs(trip!.width() - 1.8) < 0.001 && Math.abs(trip!.height() - 0.86) < 0.001, 'the travelling password includes its original card, rather than only destination dots');
        assert.ok(!painted(hand), 'one password card leaves the hand as it travels');
        // Arrival crossfades into the field at the fixed destination; only inspect
        // movement, where the card is still away from that endpoint.
        if (!field || Math.hypot(trip!.center()[0] - field.center()[0], trip!.center()[1] - field.center()[1]) > 0.01)
          assert.ok(!painted(field), 'the field receives the password after the journey');
        moved++;
      },
    }});
    assert.ok(initial && moved > 2, `${scenario.values.flow}: ${log.join(',')} needs a visible source and moving card`);
  }
}

/** Approval is durable context while a trick or thief is a different event. */
export async function unchangedPassword(scenario: FidelityRun['scenario']): Promise<void> {
  const device = scenario.values.flow === 'device';
  const log: SignInEvent[] = device ? ['ask','approve-read','collect','ask','approve-read','thief'] : ['ask','approve-read','trick'];
  const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('sign-out')!;
  const {base} = await liveBase(scenario.Scene, 'sign-out', place);
  assert.ok(base, 'the reader offers an admitted origin');
  let reference: number | undefined, samples = 0;
  await runLive(scenario.Scene,'sign-out',place,log,{from:base.from,animate:{async frame(scene) {
    const ink = await paintedPixels(scene, scene.find('page:password'));
    reference ??= ink;
    assert.ok(reference > 30, 'the approved field paints before the unrelated event');
    assert.equal(ink,reference,'an unrelated attack preserves the native password-dot contribution count');
    samples++;
  }}});
  assert.ok(samples > 2);
}

/** Every issued key protects its recipient name, including replacement grants. */
export async function issuedKeys(scenario: FidelityRun['scenario']): Promise<void> {
  const check = routeInkCheck();
  await new scenario.Scene({async frame(scene) {
    const name = scene.find('agent:name');
    if (name) await check.frame(scene,'agent:key:flight',[name]);
  }}).run();
  check.assertClear(`${scenario.values.flow}: issued keys`,['your agent']);
}

/** Chapter policy: receiving a grant fits a 4.5-second response, including its handoffs.
 * This measures the actual published interval, independently of runTime arithmetic.
 */
async function collectionPacing(scenario: FidelityRun['scenario']): Promise<void> {
  const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('sign-out');
  assert.ok(place);
  const {base} = await liveBase(scenario.Scene, 'sign-out', place);
  assert.ok(base);
  let began: number | undefined, ended = 0, frames = 0;
  await runLive(scenario.Scene, 'sign-out', place, ['ask', 'approve-read', 'collect'], {
    from: base.from, animate: {async frame(scene) {
      began ??= scene.time; ended = scene.time; frames++;
    }},
  });
  assert.ok(began !== undefined && frames > 2, 'the token collection actually played');
  assert.ok(ended - began! <= 4.5 + 2 / host.fps + 1e-6,
    `SignIn collection pacing: ${scenario.values.flow} played ${(ended - began!).toFixed(3)} s beyond its 4.5 s response policy plus frame bookkeeping`);
}

/** Exact historical inverse stays with this repository-owned reader oracle. */
async function collectionSlowdown(scenario: FidelityRun['scenario']): Promise<void> {
  let source = await readFile(new URL('./scene.ts', import.meta.url), 'utf8');
  const fixed = "(a.last?.kind === 'tokens' ? 4.45 : 2.8)";
  assert.equal(source.split(fixed).length, 2, 'one historical timing context');
  source = source.replace(fixed, "(a.last?.kind === 'tokens' ? 4.8 : 2.8)");
  source = source.replace(/from '([^']+)'/g, (_, path: string) =>
    `from '${new URL(path, new URL('./scene.ts', import.meta.url)).href}'`);
  const Slow = (await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)).default;
  const Bound = withSettings(withIntent(Slow, await readFile(new URL('./script.md', import.meta.url), 'utf8')), scenario.values);
  await assert.rejects(collectionPacing({...scenario, Scene: Bound}), /SignIn collection pacing:/);
}
