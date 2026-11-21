import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { VMobject, keyed, toSvgString } from '../../../../src/index.ts';
import type { Box, Mobject, Scene } from '../../../../src/index.ts';
import { LiveSink, liveBase, liveSteps, runLive } from '../../../../explain/internal.ts';
import { InvariantSink } from '../../../../src/verify.ts';
import type { SealWorld, Tamper } from '../model.ts';


// Native crops keep only this frame's small buffers. Knockouts use style setters and
// restore every descendant, so the renderer's cache sees both the removal and restoration.
function without<T>(parts: readonly Mobject[], read: () => T): T {
  const members = [...new Set(parts.flatMap(p => p.family()))];
  const alpha = members.map(p => p.style.opacity);
  try { members.forEach(p => p.setStyle({opacity: 0}, false)); return read(); }
  finally { members.forEach((p, i) => p.setStyle({opacity: alpha[i]!}, false)); }
}
function crop(scene: Scene, box: Box) {
  const width = Math.ceil((box[2] - box[0]) * 70), height = Math.ceil((box[3] - box[1]) * 70);
  const frame = scene.frame.copy().setWidth(box[2] - box[0], true).setHeight(box[3] - box[1], true)
    .moveTo([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
  const svg = toSvgString({colors: scene.colors, frame, mobjects: scene.mobjects}, {width, cull: true})
    .replace(/height="[0-9]+"/, `height="${height}"`);
  return new Resvg(svg, {font: {loadSystemFonts: false}}).render().pixels;
}
const delta = (a: Uint8Array, b: Uint8Array, i: number) => Math.max(
  Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
const parts = (scene: Scene, key: string) => scene.familyMembers().filter(p => p.key === key);
function ink(scene: Scene, key: string, box: Box): number {
  const subject = parts(scene, key);
  if (!subject.length) return 0;
  const actual = crop(scene, box), absent = without(subject, () => crop(scene, box));
  let count = 0;
  for (let i = 0; i < actual.length; i += 4) if (delta(actual, absent, i) > 16) count++;
  return count;
}
function opaque(part: Mobject): boolean {
  return part.family().some(p => p instanceof VMobject && p.hasPoints() && p.style.opacity > 0.999 &&
    (p.style.fill !== 'none' || p.style.stroke !== 'none'));
}
// Independent of the production port declaration: preserve the entire handle and
// head above y=2.06. The lowest stamp foot may touch the wax's irregular lip.
const BODY: Box = [5.25, 2.06, 6.3, 3.55];
const RING: Box = [-2.5, 2.2, -1.2, 3.5], WAX: Box = [5.15, 1.9, 6.4, 3.0];
// The empty dashed hook has no ink in the original signet's upper bezel. Observe
// that physical aperture independently of whichever semantic key a drawing uses.
const SOURCE_BEZEL: Box = [-2.065, 3.22, -1.665, 3.32];
function sourceBezelInk(scene: Scene): number {
  const actual = crop(scene, SOURCE_BEZEL);
  const paper = without(scene.mobjects, () => crop(scene, SOURCE_BEZEL));
  let painted = 0;
  for (let i = 0; i < actual.length; i += 4) if (delta(actual, paper, i) > 16) painted++;
  return painted;
}
function stampPaint(scene: Scene) {
  const mover = parts(scene, 'ticket:flight'), stamp = parts(scene, 'chain:stamp');
  const actual = crop(scene, BODY), minusStamp = without(stamp, () => crop(scene, BODY));
  const [exposed, bare] = without(mover, () => [crop(scene, BODY), without(stamp, () => crop(scene, BODY))]);
  let ink = 0, lost = 0;
  for (let i = 0; i < actual.length; i += 4) {
    const open = delta(exposed!, bare!, i);
    if (open <= 16) continue;
    ink++;
    if (delta(actual, minusStamp, i) < open * 0.15) lost++;
  }
  return {ink, lost};
}

function audit() {
  const positions = new Map<string, Set<string>>();
  let waxDuringTicket = 0, sourceBefore = 0, restored = 0, stamps = 0, inverseStamp = 0, inverseSource = 0;
  let publishedValidation = 0, validationCleared = false, last: SealWorld['last'];
  return {
    async frame(scene: Scene) {
      const state = scene.state as SealWorld;
      if (state.last !== last) { last = state.last; validationCleared = false; }
      if (state.last?.tamper === 'published') {
        const marks = scene.familyMembers().filter(p => p.key &&
          (/^(hole:|tear:)/.test(p.key) || /^link:.*:(held|broke)$/.test(p.key)) && opaque(p));
        if (!marks.length) validationCleared = true;
        if (validationCleared && marks.length) {
          assert.ok(ink(scene, 'chain:ring:on-wax', WAX) > 10, 'the visible key has caused the published-key validation marks');
          publishedValidation++;
        }
      }
      const ring = parts(scene, 'chain:ring:on-wax:flight')[0] ?? parts(scene, 'chain:ring:flight')[0];
      if (!ring && !positions.has('chain:ring:on-wax:flight') && sourceBefore === 0)
        sourceBefore = Math.max(sourceBefore, ink(scene, 'chain:ring', RING));
      if (ring && opaque(ring)) {
        const seen = positions.get(ring.key!) ?? new Set<string>();
        seen.add(ring.center().join(',')); positions.set(ring.key!, seen);
        const toWax = ring.key === 'chain:ring:on-wax:flight';
        assert.equal(ink(scene, toWax ? 'chain:ring' : 'chain:ring:on-wax', toWax ? RING : WAX), 0,
          'one physical published key has left its source during travel');
        if (toWax) assert.equal(without([ring], () => sourceBezelInk(scene)), 0,
          'the physical source bezel is absent even if a duplicate uses the empty-hook key');
        assert.ok(ink(scene, ring.key!, [-2.6, 1.8, 6.5, 3.5]) > 10, 'the transfer really paints its moving ring');
        // Independent inverse control: copying the real traveller back to its source
        // makes the very same native source-absence assertion fail.
        if (toWax && inverseSource === 0) {
          const duplicate = ring.copy().moveTo([-1.865, 2.785]);
          scene.add(duplicate);
          try {
            const actual = crop(scene, RING), absent = without([duplicate], () => crop(scene, RING));
            let painted = 0;
            for (let i = 0; i < actual.length; i += 4) if (delta(actual, absent, i) > 16) painted++;
            assert.throws(() => assert.equal(painted, 0, 'source survived transfer'), /source survived transfer/);
            inverseSource++;
          } finally { scene.remove(duplicate); }
        }
      }
      const ticket = parts(scene, 'ticket:flight')[0];
      if (!ticket || !opaque(ticket)) return;
      const key = `ticket:${state.last?.tamper}`;
      const seen = positions.get(key) ?? new Set<string>();
      seen.add(ticket.center().join(',')); positions.set(key, seen);
      if (state.last?.tamper === 'published') {
        assert.ok(ink(scene, 'chain:ring:on-wax', WAX) > 10, 'the key is visibly on the wax before validation');
        assert.equal(ink(scene, 'chain:ring', RING), 0, 'the ticket does not bring back the source key');
        assert.equal(sourceBezelInk(scene), 0, 'the physical source bezel stays absent during the ticket');
        waxDuringTicket++;
      } else if (parts(scene, 'chain:stamp').length) {
        const paint = stampPaint(scene);
        assert.ok(paint.ink > 50, 'the protected stamp body really paints');
        assert.equal(paint.lost, 0, 'the arriving ticket obscures the stamp body above the docking port');
        stamps++;
        if (inverseStamp === 0) {
          const at = ticket.center();
          // Challenge the real stamp aperture even when this event starts offstage.
          ticket.moveTo([3.03, at[1] + 0.7]);
          try {
            const damaged = stampPaint(scene);
            assert.throws(() => assert.equal(damaged.lost, 0, 'ticket crosses the stamp body'), /ticket crosses the stamp body/);
            inverseStamp++;
          } finally { ticket.moveTo(at); }
        }
      }
      if (positions.has('chain:ring:flight') && state.last?.tamper !== 'published') {
        assert.ok(ink(scene, 'chain:ring', RING) > 10, 'the returning key has visibly rejoined the chain before the next ticket');
        restored++;
      }
    },
    assertComplete(label: string, returning = true) {
      assert.ok(sourceBefore > 10, `${label}: the initial solid ring is visible`);
      assert.ok((positions.get('chain:ring:on-wax:flight')?.size ?? 0) > 2, `${label}: source-to-wax travel`);
      assert.ok(waxDuringTicket > 2 && publishedValidation > 2 && inverseSource === 1, `${label}: wax presence and non-vacuous source poison`);
      if (returning) {
        assert.ok((positions.get('chain:ring:flight')?.size ?? 0) > 2 && restored > 2, `${label}: wax-to-chain travel`);
        assert.ok(stamps > 2 && inverseStamp === 1, `${label}: real protected stamp and native route poison`);
      }
    },
  };
}

// Replay the actual historical source edits without editing files in the shared
// checkout. Every import still resolves to the same engine module/WeakMaps.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { withIntent, withSettings } from '../../../../explain/testing.ts';
import type { SceneClass } from '../../../../src/index.ts';
function replaceOnce(source: string, from: string, to: string): string {
  assert.equal(source.split(from).length, 2, `one historical mutation context: ${from}`);
  return source.replace(from, to);
}
async function variant(edits: readonly (readonly [string, string])[], pictureEdits: readonly (readonly [string, string])[] = []): Promise<SceneClass> {
  const moduleUrl = (source: string) => {
    source = source.replace(/from '([^']+)'/g, (_, path: string) => `from '${new URL(path, new URL('../scene.ts', import.meta.url)).href}'`);
    return `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
  };
  let source = readFileSync(new URL('../scene.ts', import.meta.url), 'utf8');
  for (const [from, to] of edits) source = replaceOnce(source, from, to);
  if (pictureEdits.length) {
    let picture = readFileSync(new URL('../picture.ts', import.meta.url), 'utf8');
    for (const [from, to] of pictureEdits) picture = replaceOnce(picture, from, to);
    source = source.replaceAll("from './picture.ts'", `from '${moduleUrl(picture)}'`);
  }
  const Changed = (await import(moduleUrl(source))).default;
  return withIntent(Changed, readFileSync(new URL('../script.md', import.meta.url), 'utf8'));
}
const longerBeats = [
  ['{ appear: 0.25, move: 0.35, leave: 0.2 })();', '{ appear: 0.25, move: 0.45, leave: 0.25 })();'],
  ['.map((k) => c.enter(k, {}, { runTime: 0.25 }));\n          return here.length', '.map((k) => c.enter(k, {}, { runTime: 0.3 }));\n          return here.length'],
  ["flight(c, 'ticket', [from], { appear: 0.25, move: 0.45, leave: 0.2 })()];", "flight(c, 'ticket', [from], { appear: 0.25, move: 0.5, leave: 0.2 })()];"],
  ["[c.enter('ticket:arrived', {}, { runTime: 0.2 })]", "[c.enter('ticket:arrived', {}, { runTime: 0.25 })]"],
  ['.map((k) => c.enter(k, {}, { runTime: 0.25 }));\n        return [...moved', '.map((k) => c.enter(k, {}, { runTime: 0.3 }));\n        return [...moved'],
] as const;
const allowance = 'return 2.85 + (toWax || fromWax ? 1.05 : 0);';

import type { FidelityRun } from '../../../../test/lib/fidelity.ts';

/** Repository-only checks: private reader transport and invariant diagnostics belong
 * behind fidelity.ts, outside the portable authored scene-test boundary. */
export async function checkMotion(scenario: FidelityRun['scenario']): Promise<void> {
  const company = scenario.values.company;
  assert.ok(company === 'remembers' || company === 'required');
  await pacing(scenario.Scene);
  await authored(scenario);
  await reader(scenario);
  await durations(company);
  await handoffPoisons(company);
  await aliasSourcePoison(scenario);
  await clearOffstageApproach(scenario);
  await stampPoison(company);
}

async function authored(scenario: FidelityRun['scenario']) {
  const probe = audit(), invariants = new InvariantSink(probe);
  await new scenario.Scene(invariants).run();
  assert.deepEqual(invariants.failures, [], JSON.stringify(scenario.values));
  assert.deepEqual(invariants.vacuous(), []);
  probe.assertComplete(String(scenario.values.company));
}

async function reader(scenario: FidelityRun['scenario']) {
  const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('one-user');
  assert.ok(place, 'the final tamper step owns reader controls');
  const {base} = await liveBase(scenario.Scene, 'one-user', place);
  assert.ok(base);
  const probe = audit();
  const logs: Tamper[][] = [['published'], ['published', 'published'], ['published', 'aud']];
  for (const log of logs) await runLive(scenario.Scene, 'one-user', place, log, {from: base.from, animate: probe});
  probe.assertComplete(`${scenario.values.company} reader`);
}

// Independent editorial policy measured on the real clock. Machine state-setting,
// frame quantization and target adoption can add at most two 30fps frames.
async function pacing(Source: SceneClass): Promise<void> {
  const host = await new Source(new LiveSink()).run(), place = liveSteps(host).get('one-user');
  assert.ok(place);
  const {base} = await liveBase(Source, 'one-user', place);
  assert.ok(base);
  for (const [log, budget] of [[['aud'], 2.85], [['published'], 3.9], [['published','aud'], 3.9]] as const) {
    let began: number | undefined, ended = 0, frames = 0;
    await runLive(Source, 'one-user', place, log, {from: base.from, animate: {async frame(scene) {
      began ??= scene.time; ended = scene.time; frames++;
    }}});
    assert.ok(began !== undefined && frames > 2, 'the approved interval actually played');
    assert.ok(ended - began! <= budget + 2/host.fps + 1e-6,
      `Sessions pacing: ${log.join(',')} played ${(ended-began!).toFixed(3)} s beyond its ${budget.toFixed(3)} s policy plus frame bookkeeping`);
  }
}

async function durations(company: string) {
  const Squeezed = await variant([...longerBeats, [allowance, 'return 2.6;']]);
  const Long = await variant([...longerBeats, [allowance, 'return 3.1 + (toWax || fromWax ? 1.25 : 0);']]);
  const ToWaxSqueezed = await variant([[allowance, 'return toWax ? 2.6 : 2.85 + (fromWax ? 1.05 : 0);']]);
  const FromWaxSqueezed = await variant([[allowance, 'return fromWax ? 2.6 : 2.85 + (toWax ? 1.05 : 0);']]);
  for (const [Broken, reason] of [
    [Squeezed, /authored transition lasts (3\.060|2\.880) s but the event allows 2\.600 s/],
    [ToWaxSqueezed, /machine.send\("published"\): authored transition lasts [0-9.]+ s but the event allows 2\.600 s/],
    [FromWaxSqueezed, /machine.send\("replay"\): authored transition lasts [0-9.]+ s but the event allows 2\.600 s/],
  ] as const) {
    const Bound = withSettings(Broken, {company});
    await assert.rejects(new Bound(new LiveSink()).run(), reason);
  }
  await assert.rejects(pacing(withSettings(Long, {company})), /Sessions pacing:/);
}

async function handoffPoisons(company: string) {
  const Duplicate = await variant([[
    'return [new AnimationGroup([appear!, c.leave(fromKey, { runTime: 0.25 }), ...also',
    'return [new AnimationGroup([appear!, ...also',
  ]]);
  const Late = await variant([
    ["const moved = [...hand(), ...flight(c, 'ticket'", "const moved = [...flight(c, 'ticket'"],
    ["}, { fresh: ['verdict:', 'ticket', 'hole', 'tear', 'link'], lead: ['chain:'] });", "}, { fresh: ['verdict:', 'ticket', 'hole', 'tear', 'link'] });"],
  ]);
  for (const [Broken, reason] of [
    [Duplicate, /one physical published key has left its source during travel/],
    [Late, /the key is visibly on the wax before validation/],
  ] as const) {
    const Bound = withSettings(Broken, {company});
    await assert.rejects(new Bound(audit()).run(), reason);
  }
}

async function stampPoison(company: string) {
  const Raised = await variant([], [[
    'agent: [TICKET_AT[0] + 1.4, TICKET_AT[1]]',
    'agent: [TICKET_AT[0] + 0.9, TICKET_AT[1] + 0.7]',
  ]]);
  const Bound = withSettings(Raised, {company}), invariants = new InvariantSink(audit());
  await assert.rejects(new Bound(invariants).run(), /the arriving ticket obscures the stamp body above the docking port/);
  assert.ok(invariants.failures.some(f => f.invariant === 'the ticket enters below the stamp body' &&
    f.message.includes('above its wax docking port')), 'the historical route also breaks the authored entry port');
}

/** A source silhouette cannot evade ownership by borrowing the empty-guide key. */
async function aliasSourcePoison(scenario: FidelityRun['scenario']) {
  let original: Mobject | undefined, injected = false;
  const probe = audit();
  await assert.rejects(new scenario.Scene({async frame(scene) {
    const source = parts(scene,'chain:ring')[0];
    if (!original && source && opaque(source)) original = source.copy();
    const slot = parts(scene,'chain:ring:slot')[0];
    if (!injected && original && slot?.parent && parts(scene,'ticket:flight').some(opaque) &&
        (scene.state as SealWorld).last?.tamper === 'published') {
      const parent = slot.parent;parent.remove(slot);
      parent.add(keyed(original,'chain:ring:slot'));injected = true;
    }
    await probe.frame(scene);
  }}).run(), /physical source bezel/);
  assert.ok(injected,'the physical alias control actually painted at the empty hook');
}

/** A harmless source approach wholly outside the stage is not a stamp collision. */
async function clearOffstageApproach(scenario: FidelityRun['scenario']) {
  const RaisedOutside = await variant([["...flight(c, 'ticket', [from],",
    "...flight(c, 'ticket', sourceOf(t.event) === 'company' ? [[from[0], from[1]+0.7], from] : [from],"]]);
  const Bound = withSettings(RaisedOutside, scenario.values);
  const host = await new Bound(new LiveSink()).run(), place=liveSteps(host).get('one-user');assert.ok(place);
  const {base}=await liveBase(Bound,'one-user',place);assert.ok(base);
  let offstage = 0;
  const probe = audit(), invariants = new InvariantSink({async frame(scene) {
    const ticket = parts(scene,'ticket:flight')[0];
    if (ticket?.box() && ticket.box()![3] > 2.04 && ticket.box()![0] > scene.frame.box()![2]) offstage++;
    await probe.frame(scene);
  }});
  await runLive(Bound,'one-user',place,['aud'],{from:base.from,animate:invariants});
  assert.ok(offstage > 2,'the high approach really stayed offstage before entering');
  assert.deepEqual(invariants.failures,[],'only a visible stamp-body intersection violates the port');
}
