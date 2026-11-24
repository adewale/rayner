import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Text, VMobject } from '../../../src/index.ts';
import { loadFonts, loadProject } from '../../../explain/testing.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import Refusals from './scene.ts';
import { SEAL_AT } from './picture.ts';
import type { World } from './model.ts';

await loadFonts();

/** Reject measured damage immediately. Incomplete source/travel witnesses are checked
 * at the end of the run; continuing a known-bad route only allocates more native rasters. */
function rejectInkLoss(check: ReturnType<typeof routeInkCheck>, label: string): void {
  check.assertUnobstructed(label);
}

test('the replacement keys clear the API and MCP lettering as they travel to their hooks', async () => {
  const project = await loadProject(Refusals, import.meta.dirname);
  const api = routeInkCheck(), mcp = routeInkCheck();
  const wrongApi = routeInkCheck(), wrongMcp = routeInkCheck();
  const endpoints = new Map<string, number[]>();
  const hooks = new Map<string, number[]>();
  const poisoned = new Map<string, number>();
  for (const scenario of project.scenarios) {
    await new scenario.Scene({
      async frame(scene) {
        const at = scene.currentStep?.path;
        if (at !== 'slip' && at !== 'one-door') return;
        const words = scene.familyMembers().filter((word): word is Text => word instanceof Text &&
          (word.key?.startsWith('lane:') && word.key.endsWith(':name') || word.key === 'agent:name' || word.key === 'agent:mcp-key:name'));
        const moverKey = at === 'slip' ? 'agent:key:flight' : 'agent:mcp-key:flight';
        await (at === 'slip' ? api : mcp).frame(scene, moverKey, words);
        rejectInkLoss(at === 'slip' ? api : mcp, at === 'slip' ? 'API key' : 'MCP key');
        const target = scene.familyMembers().find(m => m.key === moverKey.replace(':flight', '') && m.family().some(p =>
          p instanceof VMobject && p.hasPoints() && p.style.opacity > 0.5));
        if (target) hooks.set(moverKey, target.center());
        const mover = scene.familyMembers().find(m => m.key === moverKey && m.family().some(p =>
          p instanceof VMobject && p.hasPoints() && p.style.opacity > 0.5));
        if (!mover) return;
        endpoints.set(moverKey, mover.center());
        if ((poisoned.get(moverKey) ?? 0) < 2) {
          const name = words.find(m => m.text === (at === 'slip' ? 'API' : 'MCP'))!;
          const from = mover.center();
          mover.moveTo(name.center());
          await (at === 'slip' ? wrongApi : wrongMcp).frame(scene, moverKey, [name]);
          mover.moveTo(from);
          poisoned.set(moverKey, (poisoned.get(moverKey) ?? 0) + 1);
        }
      },
    }).run();
  }
  api.assertClear('API key', ['API', 'your agent']);
  mcp.assertClear('MCP key', ['API', 'MCP', 'your agent', 'for MCP']);
  for (const key of ['agent:key:flight', 'agent:mcp-key:flight']) {
    const end = endpoints.get(key)!, hook = hooks.get(key)!;
    assert.ok(end && hook && Math.hypot(end[0]! - hook[0]!, end[1]! - hook[1]!) < 1e-5, `${key} docks on its actual resting drawing`);
  }
  assert.deepEqual([...poisoned.values()], [2, 2]);
  assert.throws(() => wrongApi.assertClear('direct API key', ['API']), /hides \d+ painted text pixels/);
  assert.throws(() => wrongMcp.assertClear('inward MCP key', ['MCP']), /hides \d+ painted text pixels/);
});

test('tickets preserve station ink and lane signs; delegations preserve the station name up to docking', async () => {
  const project = await loadProject(Refusals, import.meta.dirname);
  assert.equal(project.scenarios.length, 1);
  const ticketStation = routeInkCheck(), ticketWords = routeInkCheck(), delegation = routeInkCheck(), seal = routeInkCheck();
  const poisonedStation = routeInkCheck(), poisonedName = routeInkCheck();
  const rows = new Map<string, Set<number>>(), trips = new Set<string>(), tickets = new Set<object>();
  const endpoints = new Map<string, number[]>();
  const wrongDelegation = routeInkCheck();
  let stationPoison = 0, namePoison = 0;
  let layoutPoison = false, missingRoadPoison = false, delegationPoison = 0;
  await new project.scenarios[0]!.Scene({async frame(scene) {
    const family = scene.familyMembers();
    const visible = (key: string) => family.filter(m => m.key === key && m.family().some(p =>
      p instanceof VMobject && p.hasPoints() && p.style.opacity * Math.max(p.style.fillOpacity, p.style.strokeOpacity) > 0.5));
    const signs = family.filter((m): m is Text => m instanceof Text && !!m.key?.startsWith('lane:') && m.key.endsWith(':name'));
    for (const sign of signs) if (visible(sign.key!).includes(sign)) {
      const values = rows.get(sign.key!) ?? new Set<number>();
      values.add(Math.round(sign.anchorPoint()[1] * 1e5) / 1e5);
      rows.set(sign.key!, values);
    }
    const station = family.find(m => m.key === 'agent:station'), name = family.find(m => m.key === 'agent:name');
    if (!station || !name) return; // The stage's entrance precedes admission of the world.
    await ticketStation.frame(scene, 'ticket:flight', [station]);
    await ticketWords.frame(scene, 'ticket:flight', [name, ...signs]);
    await delegation.frame(scene, 'delegation', [name]);
    await seal.frame(scene, 'fresh-seal', [name]);
    for (const [check, label] of [[ticketStation, 'ticket at the station'], [ticketWords, 'ticket beside the lane names'],
      [delegation, 'delegation'], [seal, 'new seal']] as const) rejectInkLoss(check, label);
    for (const key of ['delegation', 'fresh-seal']) {
      const mover = visible(key)[0];
      if (!mover) continue;
      endpoints.set(key, mover.center());
      if (key === 'delegation' && delegationPoison < 2) {
        const at = mover.center();
        mover.moveTo(name.center());
        await wrongDelegation.frame(scene, key, [name]);
        mover.moveTo(at);
        delegationPoison++;
      }
    }
    const flights = visible('ticket:flight');
    if (flights.length) {
      const trouble = (scene.state as World).last?.trouble;
      const lane = trouble === 'mcp' ? 'mcp-mcp' : 'api';
      // These are supporting subjects, not fresh results: both must already be present
      // throughout the request, including the first trip after changing layouts.
      assert.equal(visible(`lane:${lane}:line`).length, 1, `${lane}: the request lost its road`);
      assert.equal(visible(`lane:${lane}:name`).length, 1, `${lane}: the request lost its sign`);
      trips.add(`${scene.currentStep?.path}:${trouble}`);
      tickets.add(flights[0]!);
      if (!missingRoadPoison && lane === 'mcp-mcp') {
        const road = visible(`lane:${lane}:line`)[0]!;
        const members = road.family(), alpha = members.map(m => m.style.opacity);
        members.forEach(m => m.setStyle({opacity: 0}, false));
        assert.throws(() => assert.equal(visible(`lane:${lane}:line`).length, 1, 'the request lost its road'), /lost its road/);
        members.forEach((m, i) => m.setStyle({opacity: alpha[i]!}, false));
        missingRoadPoison = true;
      }
      if (scene.currentStep?.path === 'turned-back') {
        for (const [victim, control, count] of [[station, poisonedStation, stationPoison], [signs[0]!, poisonedName, namePoison]] as const) {
          if (count >= 2) continue;
          const mover = flights[0]!, at = mover.center();
          // Deliberately place the real painted ticket over each actual victim. Restoring
          // its centre is the inverse control; no stand-in rectangle supplies the defect.
          mover.moveTo(victim.center());
          await control.frame(scene, 'ticket:flight', [victim]);
          mover.moveTo(at);
          if (victim === station) stationPoison++; else namePoison++;
        }
      }
    }
    for (const invariant of scene.invariants.values()) {
      const result = invariant(scene);
      assert.notEqual(typeof result, 'string', String(result));
    }
    if (!layoutPoison && visible('lane:mcp-api:name').length) {
      const sign = visible('lane:mcp-api:name')[0]!, at = sign.center();
      sign.shift([0, -0.15]);
      assert.ok([...scene.invariants.values()].some(check => String(check(scene)).includes('slides between layouts')));
      sign.moveTo(at);
      for (const invariant of scene.invariants.values()) {
        const result = invariant(scene);
        assert.notEqual(typeof result, 'string', String(result));
      }
      layoutPoison = true;
    }
  }}).run();
  ticketStation.assertClear('ticket at the station', ['agent:station']);
  ticketWords.assertClear('ticket beside the lane names', ['your agent', 'API', 'MCP']);
  delegation.assertClear('delegation', ['your agent']);
  seal.assertClear('new seal', ['your agent']);
  assert.equal(stationPoison, 2);
  assert.equal(namePoison, 2);
  assert.equal(delegationPoison, 2);
  assert.throws(() => poisonedStation.assertClear('poisoned ticket', ['agent:station']), /hides \d+ painted drawing pixels/);
  assert.throws(() => poisonedName.assertClear('poisoned ticket', ['API']), /hides \d+ painted text pixels/);
  assert.throws(() => wrongDelegation.assertClear('lower delegation', ['your agent']), /hides \d+ painted text pixels/);
  for (const key of ['delegation', 'fresh-seal']) {
    const end = endpoints.get(key)!;
    assert.ok(end && Math.hypot(end[0]! - SEAL_AT[0], end[1]! - SEAL_AT[1]) < 1e-5, `${key} attaches to the seal`);
  }
  assert.ok(layoutPoison && missingRoadPoison, 'both layout and missing-road defects were exercised and restored');
  assert.deepEqual([...rows].map(([key, ys]) => [key, [...ys]]).sort(), [
    ['lane:api:name', [3]], ['lane:mcp-api:name', [3.92]], ['lane:mcp-mcp:name', [2.85]],
  ]);
  assert.equal(trips.size, 8, 'all authored ticket steps and trouble identities were witnessed');
  assert.equal(tickets.size, 14, 'all fourteen authored request journeys paint');
});
