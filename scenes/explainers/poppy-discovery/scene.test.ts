import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import Discovery from './scene.ts';
import { AnimationGroup, Scene, Succession, Text, VMobject, toSvgString } from '../../../src/index.ts';
import type { Box, Mobject } from '../../../src/index.ts';
import { Machine, stage, view } from '../../../explain/index.ts';
import type { View } from '../../../explain/index.ts';
import { Resvg } from '@resvg/resvg-js';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import { PALETTE, drawWorld, sceneOf } from './picture.ts';
import { next, SERVER_ORDER } from './model.ts';
import type { World } from './model.ts';

await loadFonts();

/** A URL is one address: a redirect may replace it, but cannot detach its path. */
function assertJoinedUrl(scene: Scene): string[] {
  const visible = (key: string) => scene.familyMembers().filter((m): m is Text => m instanceof Text && m.key === key &&
    m.children.some(g => g.style.opacity * g.style.fillOpacity >= 0.5));
  const hosts = visible('url:host'), paths = visible('url:path');
  assert.equal(hosts.length, paths.length, 'the host and path must be replaced together');
  for (const host of hosts) for (const path of paths) {
    assert.ok(Math.abs(host.box()![2] - path.box()![0]) < 1e-4, 'the readable path detached from its host during the redirect');
    assert.ok(Math.abs(host.anchorPoint()[1] - path.anchorPoint()[1]) < 1e-4, 'the readable path left its host’s line during the redirect');
  }
  return hosts.map(m => m.text);
}

test('redirect replaces the joined address and keeps it present while the fetched document travels', async () => {
  const project = await loadProject(Discovery, import.meta.dirname);
  assert.equal(project.scenarios.length, 1);
  const hosts = new Set<string>(), fetches = new Map<string, Set<string>>();
  let observations = 0, joinPoison = false;
  await new project.scenarios[0]!.Scene({ async frame(scene) {
    const words = assertJoinedUrl(scene);
    for (const word of words) hosts.add(word);
    observations += words.length;
    if (!joinPoison && words.length === 1 && scene.currentStep?.path === 'read') {
      const path = scene.familyMembers().find((m): m is Text => m instanceof Text && m.key === 'url:path' &&
        m.children.some(g => g.style.opacity * g.style.fillOpacity >= 0.5));
      assert.ok(path && paintedPixels(scene, path) > 0, 'the join control starts from the actual readable path');
      const at = path.center();
      try {
        path.shift([0.2, 0]);
        assert.throws(() => assertJoinedUrl(scene), /path detached from its host/);
        path.moveTo(at).shift([0, 0.2]);
        assert.throws(() => assertJoinedUrl(scene), /path left its host’s line/);
      } finally { path.moveTo(at); }
      assertJoinedUrl(scene);
      assert.ok(paintedPixels(scene, path) > 0, 'restoring the joined path restores visible ink');
      joinPoison = true;
    }
    const sheet = scene.findAll('sheet:token').find(part =>
      part.family().some(m => m instanceof VMobject && m.hasPoints() && m.style.opacity >= 0.5));
    if (sheet) {
      assert.equal(words.length, 1, 'the complete address must stay present while its fetched document travels');
      const fetched = sceneOf(scene.state as World);
      assert.equal(words[0], fetched.host, 'the fetched host must settle before its document leaves the address bar');
      const finalUrl = new URL(fetched.hops.at(-1)!);
      const path = scene.familyMembers().find((m): m is Text => m instanceof Text && m.key === 'url:path' &&
        m.children.some(g => g.style.opacity * g.style.fillOpacity >= 0.5));
      assert.equal(path?.text, finalUrl.pathname + finalUrl.search, 'the fetched path must settle before its document leaves the address bar');
      const step = scene.currentStep!.path;
      const positions = fetches.get(step) ?? new Set<string>();
      positions.add(sheet.center().join(','));
      fetches.set(step, positions);
    }
  } }).run();
  assert.ok(observations > 100, 'the address really paints during the story');
  assert.ok(hosts.has('www.example.com') && hosts.has('example.com'), 'both sides of the redirect were witnessed');
  assert.ok(joinPoison, 'horizontal and vertical detachment controls were exercised');
  for (const step of ['read', 'upload']) assert.ok((fetches.get(step)?.size ?? 0) >= 2, `${step}: the redirected document actually moves`);
});

test('all seven fetched sheets preserve the actual doorway and fascia lettering, with visible inverse controls', async () => {
  const project = await loadProject(Discovery, import.meta.dirname);
  assert.equal(project.scenarios.length, 1);
  const route = routeInkCheck(), poisonedDoor = routeInkCheck(), poisonedName = routeInkCheck();
  const trips = new Set<string>();
  let doorPoison = 0, namePoison = 0;
  await new project.scenarios[0]!.Scene({ async frame(scene) {
    const family = scene.familyMembers();
    const token = family.find(m => m.key === 'sheet:token' && m.family().some(p =>
      p instanceof VMobject && p.hasPoints() && p.style.opacity > 0.5));
    if (!token) return;
    const door = family.find(m => m.key === 'shop:door'), name = family.find(m => m.key === 'shop:name');
    assert.ok(door && name, 'the fetched sheet needs its actual shop as context');
    route.frame(scene, 'sheet:token', [door, name]);
    trips.add((scene.state as World).server);
    if ((scene.state as World).server !== 'shop') return;
    for (const [subject, control, count] of [[door, poisonedDoor, doorPoison], [name, poisonedName, namePoison]] as const) {
      if (count >= 2) continue;
      const at = token.center();
      try {
        token.moveTo(subject.center());
        control.frame(scene, 'sheet:token', [subject]);
      } finally { token.moveTo(at); }
      if (subject === door) doorPoison++; else namePoison++;
    }
  } }).run();
  route.assertClear('fetched document', ['shop:door', 'example.com', 'examp1e.com', 'evil.example', 'corner.example', 'example.co.uk']);
  assert.deepEqual([...trips].sort(), [...SERVER_ORDER].sort(), 'every offered server actually fetched a moving sheet');
  assert.equal(doorPoison, 2);
  assert.equal(namePoison, 2);
  assert.throws(() => poisonedDoor.assertClear('sheet over doorway', ['shop:door']), /hides \d+ painted drawing pixels/);
  assert.throws(() => poisonedName.assertClear('sheet over fascia', ['example.com']), /hides \d+ painted text pixels/);
});

/** Count actual composited ink removed with a subject inside a camera-clamped
 * crop. Render the complete SVG, retaining paint order and descendant clips. */
const paintCache = new WeakMap<Scene, Map<string, { svg: string; count: number }>>();
function paintedPixels(scene: Scene, subject: Mobject, region: Box = subject.box()!): number {
  const camera = scene.frame.box()!, b: Box = [Math.max(camera[0], region[0] - 0.02), Math.max(camera[1], region[1] - 0.02),
    Math.min(camera[2], region[2] + 0.02), Math.min(camera[3], region[3] + 0.02)];
  assert.ok(b[2] > b[0] && b[3] > b[1], 'the native subject crop must lie in the authored camera');
  const svg = toSvgString(scene, { width: 800 }), cacheKey = `${subject.key}:${b.join(',')}:${camera.join(',')}`;
  const cache = paintCache.get(scene) ?? new Map<string, { svg: string; count: number }>();
  paintCache.set(scene, cache);
  const prior = cache.get(cacheKey);
  if (prior?.svg === svg) return prior.count;
  const render = (source: string) => new Resvg(source, { font: { loadSystemFonts: false } }).render().pixels;
  const actual = render(svg), members = subject.family(), opacity = members.map(m => m.style.opacity);
  try {
    members.forEach(m => m.setStyle({ opacity: 0 }, false));
    const absent = render(toSvgString(scene, { width: 800 }));
    let count = 0;
    const x0 = Math.max(0, Math.floor((b[0] - camera[0]) / (camera[2] - camera[0]) * 800));
    const x1 = Math.min(800, Math.ceil((b[2] - camera[0]) / (camera[2] - camera[0]) * 800));
    const y0 = Math.max(0, Math.floor((camera[3] - b[3]) / (camera[3] - camera[1]) * 450));
    const y1 = Math.min(450, Math.ceil((camera[3] - b[1]) / (camera[3] - camera[1]) * 450));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * 800 + x) * 4;
      if (Math.max(Math.abs(actual[i]! - absent[i]!), Math.abs(actual[i + 1]! - absent[i + 1]!),
        Math.abs(actual[i + 2]! - absent[i + 2]!)) > 16) count++;
    }
    // One most-recent paint per subject/crop, never a per-frame raster history.
    cache.set(cacheKey, { svg, count });
    return count;
  } finally { members.forEach((m, i) => m.setStyle({ opacity: opacity[i]! }, false)); }
}

/** The arm may start while the book closes; it reaches the named issuer only
 * after the old closed book has gone. Opening the register is the next beat. */
function issuerOrderCheck() {
  const arrivals = new Set<string>(), closed = new Set<string>(), opened = new Set<string>();
  const tips = new Map<string, Box>();
  let lateClosed = 0, earlyOpen = 0;
  return {
    frame(scene: Scene) {
      const state = scene.state as World;
      if (state.ran !== 3) return;
      const issuer = sceneOf(state).issuer;
      if (!issuer || issuer === 'none') return;
      const family = scene.familyMembers(), arm = family.find(m => m.key === 'out:line');
      if (!arm) return; // The 404 and timeout have no issuer journey.
      let tip = tips.get(state.server);
      if (!tip) {
        const world = scene.mobjects.find((m): m is View => 'draw' in m && typeof m.draw === 'function');
        assert.ok(world);
        const target = world.draw(state, {}).find('out:line');
        assert.ok(target);
        const b = target.box()!;
        // The final vertical stroke, below the horizontal arm, establishes arrival.
        tip = [b[2] - 0.06, b[1] - 0.01, b[2] + 0.06, b[1] + 0.06];
        tips.set(state.server, tip);
      }
      const arrived = paintedPixels(scene, arm, tip) > 0;
      const book = family.find(m => m.key === 'register:closed');
      const oldInk = book ? paintedPixels(scene, book) : 0;
      const page = family.find(m => m.key === 'register:page');
      const newInk = page ? paintedPixels(scene, page) : 0;
      if (oldInk > 0) closed.add(state.server);
      if (arrived) arrivals.add(state.server);
      if (newInk > 0) opened.add(state.server);
      if (arrived && oldInk > 0) lateClosed++;
      if (newInk > 0 && !arrived) earlyOpen++;
    },
    assertOrdered(servers: readonly string[]) {
      for (const witnessed of [closed, arrivals, opened]) assert.deepEqual([...witnessed].sort(), [...servers].sort(), 'closed book, arriving arm and open page all need actual painted witnesses');
      assert.equal(lateClosed, 0, 'the issuer arm reaches its destination while the old register is still painted');
      assert.equal(earlyOpen, 0, 'the new register opens before the issuer arm reaches it');
    },
  };
}

test('the issuer arm reaches a cleared register, including a legal-duration serial-order poison', async () => {
  const project = await loadProject(Discovery, import.meta.dirname), order = issuerOrderCheck();
  await new project.scenarios[0]!.Scene({ async frame(scene) { order.frame(scene); } }).run();
  order.assertOrdered(['shop', 'claim', 'uk']);

  // This independent defect fixture fits the event budget. It distinguishes the
  // causal paint contract from the historical reconstruction's duration refusal.
  class LateRegister extends Scene {
    override state: World = { server: 'shop', ran: 2 };
    override async construct() {
      const s = stage(this, { palette: { ...PALETTE }, heading: false });
      const world = view(this, (state, _shown, drawing) => drawWorld(state, drawing), { drawing: s.drawing, place: false });
      const machine = new Machine<World, 'check'>(this, {
        start: this.state, events: ['check'], next, views: [world], runTime: 1.55,
        transition: { check(t) {
          const c = t.choreograph(world);
          return new Succession([
            c.enter('out:line', { create: true }, { runTime: 0.5 }),
            c.leave('register:closed', { runTime: 0.3 }),
            new AnimationGroup(['out:head', 'out:plate', 'out:label', 'register:title', 'register:page'].map(key => c.enter(key, {}, { runTime: 0.3 }))),
            c.rest({ runTime: 0.35 }),
          ]);
        } },
      });
      await s.enter(world);
      await this.play(machine.send('check'));
    }
  }
  const poison = issuerOrderCheck();
  await new LateRegister({ async frame(scene) { poison.frame(scene); } }).run();
  assert.throws(() => poison.assertOrdered(['shop']), /arm reaches its destination while the old register is still painted/);
});
