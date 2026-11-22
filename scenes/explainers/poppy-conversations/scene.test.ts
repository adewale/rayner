import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Resvg, renderAsync } from '@resvg/resvg-js';
import { Scene as NativeScene, Text, VMobject, toSvgString } from '../../../src/index.ts';
import type { Mobject, Scene, Vec } from '../../../src/index.ts';
import type { View } from '../../../explain/index.ts';
import { isRefusal } from '../../../explain/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import Conversations from './scene.ts';
import { STORY, activeOf, authorOf, next, roleOf, start } from './model.ts';
import type { World } from './model.ts';

await loadFonts();

const CONTEXT = ['written:title:0', 'written:rule', 'written:author.type:label', 'written:author.type:rule', 'written:role:label', 'written:role:rule'];
const CAPTIONS = ['agent:name', 'agent:kind', 'you:name', 'you:kind'];
const pixels = (scene: Scene) => new Resvg(toSvgString(scene, { width: 800 }), { font: { loadSystemFonts: false } }).render().pixels;

/** Knock out the actual subject, preserving every other object and its paint order. */
function paintedPixels(scene: Scene, part: Mobject): number {
  const actual = pixels(scene), members = part.family(), opacity = members.map(m => m.style.opacity);
  try {
    members.forEach(m => m.setStyle({ opacity: 0 }, false));
    const absent = pixels(scene);
    let count = 0;
    for (let i = 0; i < actual.length; i += 4) if (Math.max(Math.abs(actual[i]! - absent[i]!),
      Math.abs(actual[i + 1]! - absent[i + 1]!), Math.abs(actual[i + 2]! - absent[i + 2]!)) > 16) count++;
    return count;
  } finally { members.forEach((m, i) => m.setStyle({ opacity: opacity[i]! }, false)); }
}

const inked = (m: Mobject) => m.family().some(p => p instanceof VMobject && p.hasPoints() && p.style.opacity * p.style.fillOpacity >= 0.5);
const opaque = (m: Mobject) => m.family().filter(p => p instanceof VMobject && p.hasPoints()).every(p => p.style.opacity >= 0.99);

test('a speaking turn retains unchanged author values while changed values wait for arrival', async () => {
  const project = await loadProject(Conversations, import.meta.dirname);
  let before = start(), last = JSON.stringify(before), unchanged = 0, withheld = 0;
  let expected: { key: string; value: string; changed: boolean }[] = [];
  let destination: Vec | undefined;
  const unchangedValues = new Set<string>(), changedValues = new Set<string>();
  await new project.scenarios[0]!.Scene({ async frame(scene) {
    const world = scene.state as World, json = JSON.stringify(world), family = scene.familyMembers();
    if (json !== last) {
      expected = [];
      if (world.said && world.said.at === activeOf(world)) {
        const old = before.said?.at === activeOf(before) ? before.said : null;
        expected = [
          { key: 'written:author.type:value', value: authorOf(world.said.speaker), changed: !old || authorOf(old.speaker) !== authorOf(world.said.speaker) },
          { key: 'written:role:value', value: roleOf(world.said.speaker), changed: !old || roleOf(old.speaker) !== roleOf(world.said.speaker) },
        ];
        const view = scene.mobjects.find((m): m is View => 'draw' in m && typeof m.draw === 'function');
        destination = view?.draw(world, scene.shown).family().find(m => m.key === 'turn')?.center();
      }
      before = structuredClone(world); last = json;
    }
    const traveller = family.find(m => m.key === 'turn:flight' && inked(m) && opaque(m));
    if (!traveller || !destination || Math.hypot(traveller.center()[0] - destination[0], traveller.center()[1] - destination[1]) < 0.05) return;
    for (const { key, value, changed } of expected) {
      const visible = family.filter((m): m is Text => m instanceof Text && m.key === key && m.text === value && inked(m));
      if (changed) {
        assert.equal(visible.length, 0, `${key} ${value} arrives before its turn`);
        withheld++; changedValues.add(`${key}:${value}`);
      } else {
        assert.equal(visible.length, 1, `${key} ${value} blinks although its value is unchanged`);
        unchanged++; unchangedValues.add(value);
      }
    }
  } }).run();
  assert.ok(unchanged > 10 && withheld > 10, 'both lifetimes were observed during actual movement');
  assert.deepEqual([...unchangedValues].sort(), ['agent', 'human']);
  assert.deepEqual([...changedValues].sort(), ['written:author.type:value:agent', 'written:author.type:value:human', 'written:role:value:company', 'written:role:value:user']);
});

test('ledger context stays painted through speech and both table layouts while captions use only their authored seats', async () => {
  const project = await loadProject(Conversations, import.meta.dirname);
  assert.equal(project.scenarios.length, 1);
  const positions = new Map<string, Vec[]>();
  const nativeTrips = new WeakMap<Mobject, Vec[]>(), nativeInventory = new Map<string, number>();
  const nativeLayouts = new Set<string>();
  let checks = 0, nativeChecks = 0, poison = false, captionPoison = false;
  const layouts = new Set<string>(), captionEndpoints = new Map<string, Set<number>>();
  await new project.scenarios[0]!.Scene({ async frame(scene) {
    if (!positions.size) {
      const views = scene.mobjects.filter((m): m is View => 'draw' in m && typeof m.draw === 'function');
      if (!views.length) return;
      let world = start();
      for (const event of STORY) {
        const after = next(world, event);
        assert.ok(!isRefusal(after));
        world = after;
        if (event !== 'direct' && event !== 'close') continue;
        const picture = views[0]!.draw(world, {});
        for (const key of CAPTIONS) {
          const part = picture.family().find(m => m.key === key);
          assert.ok(part, key);
          positions.set(key, [...(positions.get(key) ?? []), part.center()]);
        }
      }
    }
    // The ownership step deliberately replaces the top ledger, while the lower ledger persists.
    const family = scene.familyMembers();
    const flights = family.filter(m => m.key?.endsWith(':flight') && inked(m));
    const flight = flights.length > 0;
    const reflow = scene.currentStep?.name === 'direct' || scene.currentStep?.name === 'close';
    if (!flight && !reflow) return;
    let native = false;
    for (const traveller of flights) {
      const seen = nativeTrips.get(traveller) ?? [], at = traveller.center();
      if (!seen.length || (seen.length === 1 && Math.hypot(at[0] - seen[0]![0], at[1] - seen[0]![1]) > 0.05)) {
        seen.push(at); nativeTrips.set(traveller, seen); native = true;
        const id = `${scene.currentStep!.name}:${traveller.key}:${(scene.state as World).said?.speaker ?? 'joining'}`;
        nativeInventory.set(id, (nativeInventory.get(id) ?? 0) + 1);
      }
    }
    const title = family.find(m => m.key === 'written:title:0');
    // One native witness at the interior of each ledger adjustment, independently of flights.
    if (reflow && title && title.center()[1] > -0.84 && title.center()[1] < -0.76 && !nativeLayouts.has(scene.currentStep!.name)) {
      nativeLayouts.add(scene.currentStep!.name); native = true;
    }
    for (const key of CONTEXT) {
      const parts = family.filter(m => m.key === key && inked(m));
      assert.equal(parts.length, 1, `${key} must remain readable during the event`);
      if (native) {
        assert.ok(paintedPixels(scene, parts[0]!) > 0, `${key} must contribute visible ink`);
        nativeChecks++;
        if (!poison && key === 'written:title:0') {
          const members = parts[0]!.family(), opacity = members.map(m => m.style.opacity);
          try {
            members.forEach(m => m.setStyle({ opacity: 0 }, false));
            assert.throws(() => assert.ok(paintedPixels(scene, parts[0]!) > 0, 'missing ledger heading'), /missing ledger heading/);
          } finally { members.forEach((m, i) => m.setStyle({ opacity: opacity[i]! }, false)); }
          poison = true;
        }
      }
    }
    checks++;
    if (!reflow) return;
    layouts.add(scene.currentStep!.name);
    for (const key of CAPTIONS) for (const part of family.filter(m => m.key === key && inked(m))) {
      const endpointOf = () => {
        const endpoint = positions.get(key)!.findIndex(p => Math.hypot(part.center()[0] - p[0], part.center()[1] - p[1]) < 1e-4);
        assert.ok(endpoint >= 0, `${key} travels between its authored caption positions`);
        return endpoint;
      };
      const endpoint = endpointOf();
      if (!captionPoison) {
        const at = part.center(), [a, b] = positions.get(key)!;
        try {
          part.moveTo([(a![0] + b![0]) / 2, (a![1] + b![1]) / 2]);
          assert.throws(endpointOf, /travels between its authored caption positions/);
          captionPoison = true;
        } finally { part.moveTo(at); }
      }
      const seen = captionEndpoints.get(key) ?? new Set<number>();
      seen.add(endpoint); captionEndpoints.set(key, seen);
    }
  } }).run();
  assert.ok(checks > 100 && poison && captionPoison, 'continuity, missing ink and caption transit controls were exercised');
  assert.equal(nativeInventory.size, 9, JSON.stringify([...nativeInventory]));
  for (const [trip, witnesses] of nativeInventory) assert.equal(witnesses, 2, `${trip}: two distinct native travel positions`);
  assert.deepEqual([...nativeLayouts].sort(), ['close', 'direct']);
  assert.equal(nativeChecks, 20 * CONTEXT.length, 'nine trips with two witnesses and both interior reflows');
  assert.deepEqual([...layouts].sort(), ['close', 'direct']);
  for (const key of CAPTIONS) assert.equal(captionEndpoints.get(key)?.size, 2, `${key} was readable at both resting seats`);
});

test('speech protects the writer mark and joining people preserve the ledger ink on both tables', async () => {
  const project = await loadProject(Conversations, import.meta.dirname);
  const turn = routeInkCheck(), person = routeInkCheck(), specialist = routeInkCheck();
  const speakers = new Set<string>();
  let turnPoison = false, personPoison = false;
  await new project.scenarios[0]!.Scene({ async frame(scene) {
    const world = scene.state as World, family = scene.familyMembers();
    const said = world.said;
    if (said && said.at === activeOf(world)) {
      const key = said.speaker === 'company agent' ? (said.at === 'direct' ? 'direct:agent:mark' : 'company:mark')
        : said.speaker === 'person' ? (said.at === 'direct' ? 'specialist:mark' : 'person:mark') : `${said.speaker}:mark`;
      const marks = family.filter(m => m.key === key);
      const flight = family.find(m => m.key === 'turn:flight' && inked(m));
      if (flight) { await turn.frame(scene, 'turn:flight', marks); speakers.add(key); }
      if (!turnPoison && flight && opaque(flight) && marks.length) {
        const at = flight.center(), bad = routeInkCheck();
        try {
          // A deliberate seat-centred launch tests the actual symbol, independently of words.
          flight.moveTo(marks[0]!.center());
          await bad.frame(scene, 'turn:flight', marks);
          assert.throws(() => bad.assertClear('seat-centred turn', [key]), /hides \d+ painted drawing pixels/);
          turnPoison = true;
        } finally { flight.moveTo(at); }
      }
    }
    const words = family.filter((m): m is Text => m instanceof Text && ['written:author.type:value', 'written:role:value', 'written:author.type:label', 'written:role:label'].includes(m.key ?? ''));
    // The first join changes the old turn's values to none after the walk. They need not
    // appear early. The direct join already has none on its ledger throughout the walk.
    if (family.some(m => m.key === 'person:mark:flight' && inked(m))) await person.frame(scene, 'person:mark:flight', words.filter(m => m.text !== 'none'));
    if (family.some(m => m.key === 'specialist:mark:flight' && inked(m))) await specialist.frame(scene, 'specialist:mark:flight', words);
    const joining = family.find(m => m.key === 'specialist:mark:flight' && inked(m));
    if (!personPoison && joining && opaque(joining) && words.length) {
      const at = joining.center(), bad = routeInkCheck();
      try {
        joining.moveTo(words[0]!.center());
        await bad.frame(scene, 'specialist:mark:flight', words);
        assert.throws(() => bad.assertClear('person over ledger', []), /hides \d+ painted text pixels/);
        personPoison = true;
      } finally { joining.moveTo(at); }
    }
  } }).run();
  assert.ok(speakers.size >= 4, 'both human and agent turns actually moved');
  turn.assertClear('turn beside writer marks', [...speakers]);
  const required = ['author.type', 'role'];
  person.assertClear('person joins the first table', required);
  specialist.assertClear('specialist joins the direct table', required);
  assert.ok(turnPoison && personPoison, 'both independent collision controls applied');
});


test('owner and close replacements keep complete endpoint title ink while fading', async () => {
  const project = await loadProject(Conversations, import.meta.dirname);
  const samples = new Map([['owner', new Set([3, 9, 15, 21])], ['close', new Set([3, 6, 9, 12, 15])]]);
  const origins = new Map<string, number>(), checked = new Map<string, number>();
  const references = new Map<string, Uint8Array>();
  let poison = false;
  const titleKeys = ['state:title:0', 'state:title:1', 'owner:title:0'];
  const raster = async (word: Text, shrinkGlyphs = false) => {
    const copy = word.copy();
    // The oracle asks whether the word retains its endpoint ink, independently
    // of its intentional fade. Work on a copy; preserve the live scene exactly.
    for (const member of copy.family()) member.setStyle({opacity: 1}, false);
    if (shrinkGlyphs) for (const glyph of copy.children) glyph.scale(0.1);
    const isolated = new NativeScene({async frame() {}}); isolated.add(copy);
    const image = await renderAsync(toSvgString(isolated, {width: 800}), {font:{loadSystemFonts:false}});
    return image.pixels; // one native getter read per task
  };
  await new project.scenarios[0]!.Scene({async frame(scene) {
    const step = scene.currentStep?.path;
    if (!step || !samples.has(step)) return;
    if (!origins.has(step)) origins.set(step, scene.frameCount);
    const frame = scene.frameCount - origins.get(step)!;
    if (!samples.get(step)!.has(frame)) return;
    const family = scene.familyMembers();
    const view = scene.mobjects.find((m): m is View => 'draw' in m && typeof m.draw === 'function');
    assert.ok(view);
    const endpoints = [view.draw(scene.state, {...scene.shown, owner: false}), view.draw(scene.state, {...scene.shown, owner: true})];
    for (const key of titleKeys) {
      const endpoint = endpoints.flatMap(m => m.family()).find((m): m is Text => m instanceof Text && m.key === key);
      assert.ok(endpoint, `${step}: independently drawn ${key}`);
      const actual = family.filter((m): m is Text => m instanceof Text && m.key === key && m.text === endpoint.text);
      assert.equal(actual.length, 1, `${step} +${frame}/30: ${key} is present as one word`);
      const signature = `${step}:${key}`;
      let reference = references.get(signature);
      if (!reference) { reference = await raster(endpoint); references.set(signature, reference); }
      assert.ok(Buffer.from(await raster(actual[0]!)).equals(Buffer.from(reference)), `${step} +${frame}/30: ${key} retains full endpoint glyph ink`);
      checked.set(signature, (checked.get(signature) ?? 0) + 1);
      if (!poison) {
        assert.ok(!Buffer.from(await raster(actual[0]!, true)).equals(Buffer.from(reference)), 'per-glyph shrink poison must change native title ink');
        poison = true;
      }
    }
  }}).run();
  assert.equal(checked.size, 6, 'all three titles were checked during both authored replacements');
  for (const [step, frames] of samples) for (const key of titleKeys)
    assert.equal(checked.get(`${step}:${key}`), frames.size, `${step}: every requested native offset was reached`);
  assert.ok(poison, 'the native glyph shrink control actually ran');
});
