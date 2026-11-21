import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { Text, VMobject, toSvgString, type Scene, type Mobject, type Vec } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import Coverage from './scene.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';

await loadFonts();

// Observe this drawing's contribution to the final native composite, including clips and paint order.
function paint(scene: Scene, part: Mobject): { pixels: number; center: Vec } {
  if (!part.family().some(m => m instanceof VMobject && m.hasPoints() && m.style.opacity > 0)) return {pixels: 0, center: [NaN, NaN]};
  const raster = () => new Resvg(toSvgString(scene, { width: 800 }), { font: { loadSystemFonts: false } }).render().pixels;
  const actual = raster(), family = part.family(), alpha = family.map(m => m.style.opacity);
  let absent: Uint8Array;
  try {
    family.forEach(m => m.setStyle({opacity: 0}, false));
    absent = raster();
  } finally { family.forEach((m, i) => m.setStyle({opacity: alpha[i]!}, false)); }
  let count = 0, x = 0, y = 0;
  for (let i = 0; i < actual.length; i += 4) {
    if (Math.max(Math.abs(actual[i]! - absent[i]!), Math.abs(actual[i + 1]! - absent[i + 1]!), Math.abs(actual[i + 2]! - absent[i + 2]!)) <= 16) continue;
    count++; x += (i / 4) % 800; y += Math.floor(i / 4 / 800);
  }
  return {pixels: count, center: [x / count, y / count]};
}

test('the report explains sending the task and receiving its answer in those two legs', async () => {
  const project = await loadProject(Coverage, import.meta.dirname);
  assert.deepEqual(project.scenarios.map(s => s.values.company).sort(), ['honest', 'hostile']);
  for (const scenario of project.scenarios) {
    const legs: { key: string; start: Vec; screen?: Vec; moved: boolean; paintedMove: boolean }[] = [];
    let previous: Mobject | undefined;
    await new scenario.Scene({ async frame(scene) {
      if (scene.currentStep?.path !== 'report') return;
      const drawn = scene.findAll(key => key.startsWith('report:')).filter(part =>
        part.family().some(m => m instanceof VMobject && m.hasPoints() && m.style.opacity >= 0.5));
      assert.ok(drawn.length <= 1, 'the receiving journey follows the sending journey');
      const part = drawn[0];
      if (part) {
        const at = part.center();
        if (part !== previous) legs.push({key: part.key!, start: at, moved: false, paintedMove: false});
        const leg = legs.at(-1)!;
        leg.moved ||= at[0] !== leg.start[0] || at[1] !== leg.start[1];
        const ink = paint(scene, part);
        if (ink.pixels) {
          if (!leg.screen) leg.screen = ink.center;
          else leg.paintedMove ||= leg.moved && (ink.center[0] !== leg.screen[0] || ink.center[1] !== leg.screen[1]);
        }
      }
      previous = part;
    } }).run();
    assert.deepEqual(legs.map(leg => leg.key), ['report:sent', 'report:reply'], `${scenario.values.company}: the approved explanation has two journeys`);
    for (const leg of legs) assert.ok(leg.moved && leg.paintedMove, `${leg.key} paints at two distinct places`);
  }
});

test('the list keeps the unchanged desk heading and user request painted throughout its journey', async () => {
  const project = await loadProject(Coverage, import.meta.dirname);
  for (const scenario of project.scenarios) {
    let samples = 0;
    await new scenario.Scene({ async frame(scene) {
      if (scene.currentStep?.path !== 'board') return;
      const list = scene.findAll(key => key === 'list')[0];
      if (!list || !paint(scene, list).pixels) return;
      for (const text of ['the shop sees', 'Close my account']) {
        const words = scene.familyMembers().filter((m): m is Text => m instanceof Text && m.text === text);
        assert.equal(words.length, 1, `${text} remains the same context during list travel`);
        assert.ok(paint(scene, words[0]!).pixels > 0, `${text} must keep painting while the list travels`);
      }
      samples++;
    } }).run();
    assert.ok(samples > 1, `${scenario.values.company}: observed the list and its context`);
  }
});

test('the borrowed skill leaves its hook while it travels and returns with the ticket landing', async () => {
  const project = await loadProject(Coverage, import.meta.dirname);
  for (const scenario of project.scenarios) {
    let before = false, travelling = false, restored = false;
    let departure: Vec | undefined, screen: Vec | undefined;
    await new scenario.Scene({ async frame(scene) {
      if (scene.currentStep?.path !== 'skill' || restored) return;
      const source = scene.findAll(key => key === 'skill:card')[0]!;
      const carrier = scene.findAll(key => key === 'skill:read')[0];
      const sourceInk = paint(scene, source).pixels;
      if (!departure) before ||= sourceInk > 0;
      if (sourceInk > 0 && travelling) {
        const ticket = scene.findAll(key => key === 'ticket')[0];
        assert.ok(ticket && paint(scene, ticket).pixels > 0, 'restore the card as the ticket lands');
        restored = true;
      }
      if (!carrier) return;
      const at = carrier.center();
      departure ??= at;
      const ink = paint(scene, carrier);
      if (ink.pixels && (at[0] !== departure[0] || at[1] !== departure[1])) {
        assert.equal(sourceInk, 0, 'the borrowed card cannot remain painted on its hook during the trip');
        if (screen) travelling ||= ink.center[0] !== screen[0] || ink.center[1] !== screen[1];
        else screen = ink.center;
      }
    } }).run();
    assert.ok(before && travelling && restored, `${scenario.values.company}: painted source=${before}, displaced carrier=${travelling}, legal restored source=${restored}`);
  }
});

test('competing paper groups and the secret reach preserve the other strips’ actual ink', async () => {
  const project = await loadProject(Coverage, import.meta.dirname);
  const scenario = project.scenarios.find(s => s.values.company === 'hostile')!;
  const crossing = routeInkCheck(), reach = routeInkCheck();
  await new scenario.Scene({ async frame(scene) {
    const step = scene.currentStep?.path;
    if (step !== 'sort' && step !== 'skill') return;
    const words = scene.familyMembers().filter(m => /^strip:used:[01](?::flight)?$/.test(m.key ?? ''))
      .flatMap(m => m.family().filter((word): word is Text => word instanceof Text));
    if (step === 'sort') crossing.frame(scene, 'strip:aside:0:flight', words);
    else reach.frame(scene, 'strip:aside:2:flight', words);
  } }).run();
  crossing.assertClear('set-aside note strips', ['applyGiftCard', 'checkout page']);
  reach.assertClear('secret-reaching strip', ['GET the order', 'POST the exchange']);
});
