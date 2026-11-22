import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProject } from '../explain/testing.ts';
import { liveBase, liveSteps, LiveSink, runLive } from '../explain/internal.ts';
import { Text, keyed, toSvgString, type Mobject, type Scene } from '../src/index.ts';
import { rasterize } from '../tools/lib/explain-raster.ts';
import SignIn from '../scenes/explainers/poppy-sign-in/scene.ts';
import { CARDS, type SignInEvent } from '../scenes/explainers/poppy-sign-in/model.ts';
import { DESK } from '../scenes/explainers/poppy-sign-in/picture.ts';

const referenceKeys = ['agent:station', 'agent:seal', 'agent:name', 'agent:ring'] as const;
const visible = (part: Mobject) => part.family().some(m => m.style.opacity > 0.01 && (m.style.fill !== 'none' || m.style.stroke !== 'none'));
function stable(scene: Scene, reference: Map<string, number[]>) {
  for (const key of referenceKeys) {
    const parts = scene.familyMembers().filter(m => m.key === key && visible(m));
    assert.equal(parts.length, 1, `${key}: one visible recipient throughout the response`);
    const at = parts[0]!.center(), from = reference.get(key)!;
    assert.ok(Math.hypot(at[0] - from[0]!, at[1] - from[1]!) < 1e-6, `${key}: recipient keeps its place`);
  }
}
function knockout(scene: Scene, part: Mobject) {
  const actual = toSvgString(scene, {width: 800}), family = part.family(), alpha = family.map(m => m.style.opacity);
  let omitted: string;
  try { family.forEach(m => m.setStyle({opacity: 0}, false)); omitted = toSvgString(scene, {width: 800}); }
  finally { family.forEach((m, i) => m.setStyle({opacity: alpha[i]!}, false)); }
  return {actual, omitted};
}
async function paints(pair: ReturnType<typeof knockout>) {
  const [drawn, removed] = await Promise.all([rasterize(pair.actual), rasterize(pair.omitted)]);
  const a = drawn.pixels, b = removed.pixels;
  return a.some((v, i) => Math.abs(v - b[i]!) > 16);
}

test('published SignIn reader grants keep one native recipient, issue both products at the Company and retain old credentials until replacement arrives', async () => {
  const project = await loadProject(SignIn, new URL('../scenes/explainers/poppy-sign-in/', import.meta.url).pathname);
  for (const scenario of project.scenarios) for (const replacement of [false, true]) {
    const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('sign-out')!;
    const {base} = await liveBase(scenario.Scene, 'sign-out', place); assert.ok(base);
    const log: SignInEvent[] = replacement ? ['ask', 'approve-read', 'collect', 'ask', 'approve-all', 'collect'] : ['ask', 'approve-read', 'collect'];
    const origins = new Set<string>(), samples: ReturnType<typeof knockout>[] = [], old: ReturnType<typeof knockout>[] = [];
    let reference: Map<string, number[]> | undefined, frames = 0, poisoned = false;
    let causalInverse = false;
    let start = 0, end = 0;
    await runLive(scenario.Scene, 'sign-out', place, log, {from: base!.from, animate: {async frame(scene) {
      reference ??= new Map(referenceKeys.map(key => [key, [...scene.find(key)!.center()]]));
      stable(scene, reference); frames++; if (frames === 1) start = scene.time; end = scene.time;
      const input = scene.find(scenario.values.flow === 'device' ? 'poll' : 'code');
      if (input && visible(input)) {
        const inputBeforeReply = () => assert.equal(scene.familyMembers().filter(m => m.key === 'answer:phrase' && visible(m)).length, 0,
          'the collection reply waits for its input journey');
        inputBeforeReply();
        if (!causalInverse) {
          const early = keyed(new Text('Key cut', {fontSize: 0.5, color: '#f00'}).moveTo([3, -2]), 'answer:phrase');
          const parent = scene.find('agent:station')!.parent!; parent.add(early);
          let pair: ReturnType<typeof knockout>;
          try { assert.throws(inputBeforeReply, /reply waits for its input/); pair = knockout(scene, early); }
          finally { parent.remove(early); }
          assert.equal(await paints(pair!), true, 'the early-result inverse really paints in the native reader picture');
          causalInverse = true;
        }
      }
      for (const key of ['agent:key:flight', 'tag:flight']) {
        const traveller = scene.find(key);
        if (!traveller || !visible(traveller)) continue;
        if (!origins.has(key)) {
          assert.ok(Math.hypot(traveller.center()[0] - DESK[0], traveller.center()[1] - DESK[1]) < 1e-6, `${key}: Company desk is the source`);
          origins.add(key);
          if (key === 'tag:flight') assert.equal(traveller.family().filter(m => m instanceof Text).length, 0, 'refresh-token transit has no miniature words');
          if (replacement) {
            const prior = scene.familyMembers().find(m => m.key === 'tag' && m.family().some(p => p instanceof Text && p.text === CARDS[0]));
            assert.ok(prior && visible(prior), 'the old refresh credential remains while replacement travels');
            old.push(knockout(scene, prior));
          }
        }
      }
      if (frames === 1 || frames === 45 || frames === 80) {
        samples.push(...['agent:station', 'agent:ring'].map(key => knockout(scene, scene.find(key)!)));
      }
      if (!poisoned && frames === 45) {
        const ring = scene.find('agent:ring')!, at = ring.center();
        ring.shift([0, 1]); assert.throws(() => stable(scene, reference!), /recipient keeps its place/); ring.moveTo(at);
        const family = ring.family(), alpha = family.map(m => m.style.opacity);
        family.forEach(m => m.setStyle({opacity: 0}, false));
        assert.throws(() => stable(scene, reference!), /one visible recipient/);
        const hidden = knockout(scene, ring);
        family.forEach((m, i) => m.setStyle({opacity: alpha[i]!}, false));
        assert.equal(await paints(hidden), false, 'a hidden recipient cannot satisfy native presence'); poisoned = true;
      }
    }}});
    assert.equal(origins.size, 2, 'access and refresh products each have a real issuance journey');
    assert.ok(frames > 80 && poisoned && causalInverse);
    assert.ok(end - start <= 4.5 + 2 / host.fps + 1e-6, 'the actual response retains its chapter clock policy');
    assert.equal(samples.length, 6); for (const sample of samples) assert.equal(await paints(sample), true, 'recipient contributes actual native ink');
    assert.equal(old.length, replacement ? 2 : 0); for (const sample of old) assert.equal(await paints(sample), true, 'old credential contributes until replacement is on its way');
  }
});
