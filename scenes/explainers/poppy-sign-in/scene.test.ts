import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAsync } from '@resvg/resvg-js';
import { Rectangle, Text, VMobject, toSvgString } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import SignIn from './scene.ts';
import { STORY, type Flow } from './model.ts';
import { DESK } from './picture.ts';

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
test('the code travelling to the token endpoint is wordless and visibly moves in every authored journey', async () => {
  const project = await loadProject(SignIn, import.meta.dirname);
  const scenario = project.scenarios.find(scenario => scenario.values.flow === 'direct')!;
  type Sample = {at: readonly number[]; actual: string; omitted: string};
  type Journey = {visible: Sample[]; covered: Sample[]; offstage: Sample[]};
  const journeys = new Map<Mobject, Journey>();
  await new scenario.Scene({async frame(scene) {
    const code = scene.find('code');
    if (!painted(code)) return;
    assert.equal(code!.family().filter(m => m instanceof Text).length, 0, 'a small travelling code carries no unreadable words');
    // Read native movement at complete travelling ink, not its partial fades.
    if (code!.family().some(member => member.style.opacity < 1)) return;
    const journey = journeys.get(code!) ?? {visible: [], covered: [], offstage: []};
    journeys.set(code!, journey);
    const picture = () => toSvgString(scene, {width: 800});
    const sample = (): Sample => ({at: [...code!.center()], actual: picture(), omitted: without(code!, picture)});
    const keep = (rows: Sample[], row: Sample) => { if (rows.length < 2) rows.push(row); else rows[1] = row; };
    keep(journey.visible, sample());
    const cover = new Rectangle({width: code!.width() + 0.2, height: code!.height() + 0.2,
      fill: scene.colors.paper, stroke: 'none'}).moveTo(code!.center());
    scene.add(cover);
    try { keep(journey.covered, sample()); }
    finally { scene.remove(cover); }
    const at = code!.center(), frame = scene.frame.box()!;
    try {
      code!.moveTo([frame[2] + code!.width(), frame[3] + code!.height()]);
      keep(journey.offstage, sample());
    } finally { code!.moveTo(at); }
  }}).run();
  assert.equal(journeys.size, STORY.direct.filter(event => event === 'collect').length, 'every authored code journey is observed');
  const moving = async (samples: Sample[]) => {
    assert.equal(samples.length, 2, 'two complete native travelling frames');
    const positions: number[][] = [], paintings: {actual: Uint8Array; omitted: Uint8Array; support: boolean[]}[] = [];
    for (const sample of samples) {
      const [actual, omitted] = await Promise.all([native(sample.actual), native(sample.omitted)]);
      const support: boolean[] = [];
      let x = 0, y = 0, ink = 0;
      for (let p = 0; p < actual.length; p += 4) {
        const paints = [0, 1, 2, 3].some(c => actual[p + c] !== omitted[p + c]);
        support.push(paints);
        if (paints) { x += (p / 4) % 800; y += Math.floor(p / 4 / 800); ink++; }
      }
      assert.ok(ink > 0, 'the wordless traveller must contribute actual native ink');
      positions.push([x / ink, y / ink]); paintings.push({actual, omitted, support});
    }
    assert.notDeepEqual(samples[0]!.at, samples[1]!.at, 'the token changes world position');
    assert.notDeepEqual(positions[0], positions[1], 'the token changes composited screen position');
    const [a, b] = paintings;
    let changed = false;
    for (let p = 0; p < a!.support.length; p++) if (a!.support[p] || b!.support[p]) {
      for (const c of [0, 1, 2, 3]) {
        assert.equal(a!.omitted[p * 4 + c], b!.omitted[p * 4 + c], 'unrelated background changes cannot supply token movement');
        changed ||= a!.actual[p * 4 + c] !== b!.actual[p * 4 + c];
      }
    }
    assert.ok(changed, 'actual token ink changes where its native contribution moves');
  };
  for (const journey of journeys.values()) {
    await moving(journey.visible);
    await assert.rejects(moving(journey.covered), /must contribute actual native ink/);
    await assert.rejects(moving(journey.offstage), /must contribute actual native ink/);
  }
});

/** Snapshot mutations finish before native rendering starts. A getter is read once
 * per async result, and the small source-phase inventory bounds native work. */
function without(part: Mobject, read: () => string): string {
  const members = part.family(), alpha = members.map(member => member.style.opacity);
  try { members.forEach(member => member.setStyle({opacity: 0}, false)); return read(); }
  finally { members.forEach((member, i) => member.setStyle({opacity: alpha[i]!}, false)); }
}
const native = async (svg: string) => (await renderAsync(svg, {font: {loadSystemFonts: false}})).pixels;

test('each device card first paints completely above the agent key slot rather than at the Company desk', async () => {
  const project = await loadProject(SignIn, import.meta.dirname);
  const scenario = project.scenarios.find(scenario => scenario.values.flow === 'device')!;
  const seen = new Set<Mobject>();
  let sourceChecks = 0, deskControls = 0;
  const origin = (card: Mobject, slot: Mobject, station: Mobject) => {
    const box = card.box()!, key = slot.box()!, agent = station.center();
    assert.ok(box[1] >= key[3], 'the first painted card is above the agent key slot');
    assert.ok(box[0] <= agent[0] && agent[0] <= box[2], 'the first painted card belongs above its agent');
  };
  await new scenario.Scene({async frame(scene) {
    const card = scene.find('card:flight');
    if (!card || seen.has(card) || card.family().some(member => member.style.opacity < 1)) return;
    seen.add(card);
    const slot = scene.find('agent:key:slot'), station = scene.find('agent:station');
    assert.ok(slot && station, 'the card has its actual agent and key slot at source');
    const words = card.family().filter((member): member is Text => member instanceof Text);
    assert.deepEqual(words.map(word => word.text), ['WDJB-MJHT', 'Example Company', 'example.com']);
    const picture = () => toSvgString(scene, {width: 800});
    const alone = () => toSvgString({frame: scene.frame, colors: scene.colors, mobjects: [card]}, {width: 800});
    const actualSvg = picture(), aloneSvg = alone();
    const removed = words.map(word => ({actual: without(word, picture), alone: without(word, alone)}));
    const missingCardSvg = without(card, picture);
    // A desk-origin control retains the complete real card and all its printing.
    const at = card.center();
    let deskSvg: string, deskMissingSvg: string;
    try {
      card.moveTo(DESK);
      deskSvg = picture(); deskMissingSvg = without(card, picture);
      assert.throws(() => origin(card, slot, station), /first painted card is above the agent key slot/);
    } finally { card.moveTo(at); }
    const actual = await native(actualSvg), isolated = await native(aloneSvg), missing = await native(missingCardSvg);
    assert.ok(actual.some((value, i) => value !== missing[i]), 'the source card really contributes native paint');
    for (const row of removed) {
      const [omitted, isolatedOmitted] = await Promise.all([native(row.actual), native(row.alone)]);
      let ink = 0;
      for (let p = 0; p < isolated.length; p += 4) {
        if (![0, 1, 2, 3].some(c => isolated[p + c] !== isolatedOmitted[p + c])) continue;
        ink++;
        for (const channel of [0, 1, 2, 3]) {
          assert.equal(actual[p + channel], isolated[p + channel], 'the complete source printing stays visible');
          assert.equal(omitted[p + channel], isolatedOmitted[p + channel], 'other paint cannot substitute for a source word');
        }
      }
      assert.ok(ink > 0, 'each independently named source word really paints');
    }
    origin(card, slot, station); sourceChecks++;
    const [desk, deskMissing] = await Promise.all([native(deskSvg!), native(deskMissingSvg!)]);
    assert.ok(desk.some((value, i) => value !== deskMissing[i]), 'the rejected desk-origin control really paints');
    deskControls++;
  }}).run();
  const expected = STORY.device.filter(event => event === 'ask').length;
  assert.equal(sourceChecks, expected, 'every authored device ask paints its card at its source');
  assert.equal(deskControls, expected, 'the same source rule rejects every native desk-origin control');
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
        assert.ok(guide && ring, 'every approval frame retains its physical ring and guide');
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
      assert.equal(rows.length, STORY[scenario.values.flow as Flow].filter(event=>event==='approve-read'||event==='approve-all').length, `${scenario.values.flow}: every authored approval must be observed`);
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
