import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { Text, VMobject, toSvgString } from '../../../src/index.ts';
import type { Mobject, Scene, Vec } from '../../../src/index.ts';
import type { View } from '../../../explain/index.ts';
import { isRefusal } from '../../../explain/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import Conversations from './scene.ts';
import { STORY, activeOf, next, start } from './model.ts';
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
      if (flight) { turn.frame(scene, 'turn:flight', marks); speakers.add(key); }
      if (!turnPoison && flight && opaque(flight) && marks.length) {
        const at = flight.center(), bad = routeInkCheck();
        try {
          // A deliberate seat-centred launch tests the actual symbol, independently of words.
          flight.moveTo(marks[0]!.center());
          bad.frame(scene, 'turn:flight', marks);
          assert.throws(() => bad.assertClear('seat-centred turn', [key]), /hides \d+ painted drawing pixels/);
          turnPoison = true;
        } finally { flight.moveTo(at); }
      }
    }
    const words = family.filter((m): m is Text => m instanceof Text && ['written:author.type:value', 'written:role:value', 'written:author.type:label', 'written:role:label'].includes(m.key ?? ''));
    // The first join changes the old turn's values to none after the walk. They need not
    // appear early. The direct join already has none on its ledger throughout the walk.
    if (family.some(m => m.key === 'person:mark:flight' && inked(m))) person.frame(scene, 'person:mark:flight', words.filter(m => m.text !== 'none'));
    if (family.some(m => m.key === 'specialist:mark:flight' && inked(m))) specialist.frame(scene, 'specialist:mark:flight', words);
    const joining = family.find(m => m.key === 'specialist:mark:flight' && inked(m));
    if (!personPoison && joining && opaque(joining) && words.length) {
      const at = joining.center(), bad = routeInkCheck();
      try {
        joining.moveTo(words[0]!.center());
        bad.frame(scene, 'specialist:mark:flight', words);
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
