import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAsync } from '@resvg/resvg-js';
import { Text, VMobject, toSvgString } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import SignIn from './scene.ts';

await loadFonts();

test('password cards enter the field with the scope words still visible in each sign-in layout', async () => {
  const project = await loadProject(SignIn, import.meta.dirname);
  assert.deepEqual(project.scenarios.map(scenario => scenario.values.flow).sort(), ['device', 'direct']);
  for (const scenario of project.scenarios) {
    const first = routeInkCheck(), second = routeInkCheck();
    await new scenario.Scene({
      async frame(scene) {
        const step = scene.currentStep?.path;
        if (step !== 'approve' && step !== 'reask') return;
        const words = scene.familyMembers().filter((m): m is Text => m instanceof Text &&
          (m.key === 'page:orders:read:line' || m.key === 'page:orders:write:line'));
        await (step === 'approve' ? first : second).frame(scene, 'page:password:flight', words);
      },
    }).run();
    const words = scenario.values.flow === 'device' ? ['read', 'write'] : ['See your orders', 'Exchange items'];
    first.assertClear(`${scenario.values.flow} first approval`, words);
    second.assertClear(`${scenario.values.flow} second approval`, words);
  }
});

test('the device poll and its reply reach the counter without hiding either line on the device card', async () => {
  const project = await loadProject(SignIn, import.meta.dirname);
  const scenario = project.scenarios.find(scenario => scenario.values.flow === 'device');
  assert.ok(scenario);
  const outward = routeInkCheck(), reply = routeInkCheck();
  await new scenario.Scene({
    async frame(scene) {
      if (scene.currentStep?.path !== 'ask') return;
      const words = scene.familyMembers().filter(object => object.key === 'card')
        .flatMap(card => card.family().filter((word): word is Text => word instanceof Text));
      await outward.frame(scene, 'poll', words);
      await reply.frame(scene, 'poll:back', words);
    },
  }).run();
  const words = ['WDJB-MJHT', 'Example Company'];
  outward.assertClear('outgoing poll', words);
  reply.assertClear('returning poll', words);
});

// These assertions state this chapter's actors and object identities independently of
// the route construction. Layout reflows are fades; protocol objects actually travel.
test('the code travelling to the token endpoint is wordless while its resting credentials stay readable', async () => {
  const project = await loadProject(SignIn, import.meta.dirname);
  const scenario = project.scenarios.find(scenario => scenario.values.flow === 'direct')!;
  let count = 0;
  await new scenario.Scene({async frame(scene) {
    const code = scene.familyMembers().find(m => m.key === 'code');
    if (!painted(code)) return;
    count++;
    assert.equal(code!.family().filter(m => m instanceof Text).length, 0, 'a small travelling code carries no unreadable words');
  }}).run();
  assert.ok(count > 2, 'the wordless code actually travels');
});

function painted(part: import('../../../src/index.ts').Mobject | undefined): boolean {
  return !!part && part.family().some(member => {
    if (!(member instanceof VMobject) || !member.box()) return false;
    let alpha = member.style.opacity;
    for (let parent = member.parent; parent; parent = parent.parent) alpha *= parent.style.opacity;
    return alpha > 0.01 && (member.style.fill !== 'none' || member.style.stroke !== 'none');
  });
}

test('layout changes crossfade you and the agent only at their resting endpoints', async () => {
  const project = await loadProject(SignIn, import.meta.dirname);
  const keys = ['you', 'agent:station', 'agent:seal', 'agent:name'];
  for (const scenario of project.scenarios) {
    const starts = new Map<string, Map<string, readonly number[]>>(), samples = new Map<string, Map<string, readonly number[][]>>();
    let checked = 0;
    await new scenario.Scene({
      async stepBegin(scene, step) {
        if (!['ask', 'key', 'reask', 'replace'].includes(step.path)) return;
        starts.set(step.path, new Map(scene.familyMembers().filter(m => keys.includes(m.key!)).map(m => [m.key!, m.center()])));
        samples.set(step.path, new Map());
        return Promise.resolve();
      },
      frame(scene) {
        const seen = samples.get(scene.currentStep?.path ?? '');
        if (seen) for (const part of scene.familyMembers().filter(m => keys.includes(m.key!) && painted(m))) {
          seen.set(part.key!, [...(seen.get(part.key!) ?? []), [...part.center()]]);
        }
        return Promise.resolve();
      },
      stepEnd(scene, step) {
        const seen = samples.get(step.path), start = starts.get(step.path);
        if (!seen || !start) return Promise.resolve();
        for (const key of keys) {
          const from = start.get(key), to = scene.familyMembers().find(m => m.key === key)?.center();
          if (!from || !to) continue;
          const observations = seen.get(key) ?? [];
          assert.ok(observations.length > 2, `${step.path}: ${key} must appear`);
          for (const at of observations) assert.ok([from, to].some(end => Math.hypot(at[0]! - end[0]!, at[1]! - end[1]!) < 0.001), `${step.path}: ${key} reflows at its endpoints, without an invented journey`);
          checked++;
        }
        return Promise.resolve();
      },
    }).run();
    assert.equal(checked, 16, `${scenario.values.flow}: four people parts over four layout changes`);
  }
});

// The empty guide is unchanged context during approval. A final model-picture
// adoption must not alter the composited guide/ring intersection.
test('approval preserves the keyring silhouette on every emitted frame', async () => {
  const previous = SignIn.captionWpm;
  SignIn.captionWpm = Infinity;
  try {
    const project = await loadProject(SignIn, import.meta.dirname);
    assert.equal(project.scenarios.length, 2);
    for (const scenario of [...project.scenarios].sort((a,b)=>String(a.values.flow).localeCompare(String(b.values.flow)))) {
      const rows: {poison: string; reference: string; region: number[]; images: string[]}[] = [];
      let last: unknown, row: typeof rows[number] | undefined;
      await new scenario.Scene({async frame(scene) {
        const state = scene.state as import('./model.ts').World;
        if (state.last?.kind !== 'approve') { row = undefined; return; }
        const guide = scene.find('agent:key:slot'), ring = scene.find('agent:ring');
        if (!guide || !ring) return;
        // Observe the ring itself. The card above it legitimately disappears;
        // its paper is outside this fixed context aperture.
        const box = [...ring.box()!];
        assert.ok(box[0]! < box[2]! && box[1]! < box[3]!, 'the native control includes the physical ring');
        const svg = toSvgString(scene, {width:800, cull:false});
        if (!row || last !== state.last) {
          const frame = scene.frame.box()!, unit = 800/(frame[2]-frame[0]);
          const region = [Math.floor((box[0]!-frame[0])*unit)-1,Math.floor((frame[3]-box[3]!)*unit)-1,
            Math.ceil((box[2]!-frame[0])*unit)+1,Math.ceil((frame[3]-box[1]!)*unit)+1];
          const parent = guide.parent!; assert.equal(parent,ring.parent);
          const index = parent.children.indexOf(guide);
          let poison: string, reference: string;
          try {
            // Independent visual obligation: a background guide stays beneath
            // the physical ring, regardless of the producer's sibling order.
            const ringIndex=parent.children.indexOf(ring);
            parent.insert(ringIndex-(index<ringIndex?1:0),guide);
            reference=toSvgString(scene,{width:800,cull:false});
            parent.add(guide);
            poison = toSvgString(scene,{width:800,cull:false});
          }
          finally { parent.insert(index,guide); }
          row = {poison,reference,region,images:[]}; rows.push(row); last=state.last;
        }
        row.images.push(svg);
      }}).run();
      assert.ok(rows.length > 0, `${scenario.values.flow}: an empty-ring approval must actually run`);
      for (const row of rows) {
        assert.ok(row.images.length > 2);
        const render = async (svg: string) => (await renderAsync(svg,{font:{loadSystemFonts:false}})).pixels;
        const crop = (pixels: Uint8Array) => {
          const out: number[]=[];
          for(let y=row.region[1]!;y<row.region[3]!;y++) for(let x=row.region[0]!;x<row.region[2]!;x++) {
            const at=(y*800+x)*4;out.push(...pixels.subarray(at,at+4));
          }
          return out;
        };
        const reference=Buffer.from(crop(await render(row.reference)));
        for(const [frame,svg] of row.images.entries()) {
          const image=await render(svg);
          assert.ok(Buffer.from(crop(image)).equals(reference), `${scenario.values.flow}: approval frame ${frame} changes the static ring/guide silhouette`);
        }
        assert.ok(!Buffer.from(crop(await render(row.poison))).equals(reference),'the same native assertion detects the guide deliberately moved across its ring layer');
      }
    }
  } finally { SignIn.captionWpm=previous; }
});
