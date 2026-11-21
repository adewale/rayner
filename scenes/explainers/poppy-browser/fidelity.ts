import { assertFollowsStory, answersIn, worldsOf } from '../../../test/lib/story-fidelity.ts';
import assert from 'node:assert/strict';
import { Text, VMobject } from '../../../src/index.ts';
import type { Mobject, Scene } from '../../../src/index.ts';
import { routeInkCheck } from '../lib/route-ink/fidelity.ts';
import { MachineMotionCheck } from '../../../tools/lib/explain-motion-rules.ts';
import { intersect } from '../../../src/box.ts';
import { LiveSink, liveSteps, runLive } from '../../../explain/internal.ts';
import type { FidelityRun } from '../../../test/lib/fidelity.ts';
import type { Trace } from '../../../explain/testing.ts';
import { next, start, storyOf } from './model.ts';
import type { SignIn, World } from './model.ts';
import { COUNTER_X, ROAD_B } from './picture.ts';

const SIGN_INS: Record<string, SignIn> = { 'signed-in': 'signed in', 'signed-out': 'signed out', 'no-scope': 'signed in without the browser scope' };

/** Each authored scenario's steps against the model of the draft: the story's worlds in order, and the answer the model computed in the picture's words. */
export async function check(trace: Trace, values: Record<string, string>, { scenario, project }: FidelityRun): Promise<void> {
  // The logins step draws the draft's table of joins and logins, not the last answer, so no answer is looked for there.
  const signIn = SIGN_INS[values.signin!]!;
  assertFollowsStory(trace, worldsOf(start(signIn), next, storyOf(signIn)), (world, step) => (step === 'logins' ? [] : answersIn(world.last)).flatMap((answer) => [String(answer.status), ...(answer.error ? [answer.error] : [])]));

  // A live load press makes room before the new record occupies its rack slot.
  assert.deepEqual(project.scenarios.map(s => s.values.signin).sort(), ['no-scope', 'signed-in', 'signed-out']);
  let sawPair = false;
  const host = await new scenario.Scene(new LiveSink()).run();
  const places = [...liveSteps(host)];
  assert.equal(places.length, 1);
  const [step, place] = places[0]!;
  await runLive(scenario.Scene, step, place, ['load'], { from: 'start', animate: {
    async frame(scene) {
      const rows = scene.familyMembers().filter(m => /^row:[^:]+:stub$/.test(m.key ?? ''));
      const visible = rows.flatMap(row => row.family().filter((m): m is Text => m instanceof Text &&
        m.children.length > 0 && m.children.every(g => g.style.opacity >= 0.95)).map(word => ({ key: row.key, word })));
      for (const [i, a] of visible.entries()) for (const b of visible.slice(i + 1)) {
        if (a.key === b.key) continue;
        sawPair = true;
        assert.equal(intersect(a.word.box()!, b.word.box()!), null,
          `${scenario.values.signin}: ${a.word.text} and ${b.word.text} occupy the same record slot`);
      }
    },
  } });
  assert.ok(sawPair, 'the load step actually displayed the existing and newly issued records');
  // On a second reader load the rack is already populated: there is no empty-state subject.
  // Attach the actual rule checker here, rather than merely observing the resulting geometry.
  const reissue = new MachineMotionCheck();
  await runLive(scenario.Scene, step, place, ['load', 'submit'], {from: 'start', explore: async (scene, machine, draw) => {
    draw(reissue);
    await reissue.during(scene, () => scene.play(machine.send('load')));
  }});
  assert.deepEqual(reissue.findings, [], 'second-load rules must be nonempty and preserve the new record during issuance');
  const afterMessage = new MachineMotionCheck();
  await runLive(scenario.Scene, step, place,
    ['load', 'authorize', ...(values.signin === 'no-scope' ? ['authorize'] : []), 'submit', 'phish'],
    {from: 'start', explore: async (scene, machine, draw) => {
      draw(afterMessage);
      await afterMessage.during(scene, () => scene.play(machine.send('fetch')));
    }});
  assert.deepEqual(afterMessage.findings, [], 'a new fetch retires the declined message before its ticket travels');
  await checkTravel(scenario);
}


/** Protect the named reading surfaces with native SVG knockout, rather than rectangles alone.
 * The controls temporarily move the actual opaque traveller over one of those same glyphs;
 * they are independent of the historical reconstructions and restore it before playback resumes.
 */
async function checkTravel(scenario: FidelityRun['scenario']): Promise<void> {
  const keys = ['read', 'forged', 'message:flight', 'phish-cookie', 'submit-half', 'shelf:join:flight'] as const;
  const checks = new Map(keys.map(key => [key, {clear: routeInkCheck(), poison: routeInkCheck(), frames: 0, poisoned: false}]));
  const visible = (part: Mobject) => part.family().some(m => m instanceof VMobject && m.hasPoints() && m.style.opacity >= 0.5);
  const inPart = (scene: Scene, key: string) => scene.familyMembers().filter(m => m.key === key)
    .flatMap(m => m.family().filter((part): part is Text => part instanceof Text && visible(part)));
  const landing = {clear: routeInkCheck(), poison: routeInkCheck(), priorPort: routeInkCheck(), frames: 0};
  let previousForge = '', forgeMoved = false;
  const frame = async (scene: Scene) => {
    const event = (scene.state as World).last?.event;
    for (const key of keys) {
      const moverKey = key === 'phish-cookie' || key === 'submit-half' ? 'carried:half' : key;
      if (key === 'phish-cookie' && event !== 'phish' || key === 'submit-half' && event !== 'submit') continue;
      const movers = scene.familyMembers().filter(m => m.key === moverKey && visible(m));
      if (!movers.length) continue;
      const subjects = key === 'read' ? [...inPart(scene, 'browser'), ...inPart(scene, 'page:stub')]
        : key === 'submit-half' ? inPart(scene, 'carried')
        : key === 'shelf:join:flight' ? inPart(scene, 'page:stub')
        : key === 'phish-cookie' ? [...inPart(scene, 'evil'), ...inPart(scene, 'evil:shelf')]
        : [...inPart(scene, 'browser'), ...inPart(scene, 'evil'), ...inPart(scene, 'page:who'), ...inPart(scene, 'page:session'), ...inPart(scene, 'page:sid')];
      if (!subjects.length) continue;
      const check = checks.get(key)!;
      check.frames++;
      check.clear.frame(scene, moverKey, subjects);
      if (key === 'forged') {
        const mover = movers[0]!, at = mover.center(), position = at.join(',');
        if (previousForge && position !== previousForge) forgeMoved = true;
        // Only a final stationary dwell is constrained. The preceding crossing is allowed.
        const dwell = forgeMoved && previousForge === position;
        previousForge = position;
        const stop = scene.familyMembers().find(m => m.key === 'road:browser:stop');
        const protectedParts = dwell && stop ? [...subjects, stop] : subjects;
        landing.clear.frame(scene, moverKey, protectedParts);
        landing.poison.frame(scene, moverKey, protectedParts);
        landing.priorPort.frame(scene, moverKey, protectedParts);
        if (dwell && stop) {
          landing.frames++;
          try { mover.moveTo(stop.center()); landing.poison.frame(scene, moverKey, protectedParts); }
          finally { mover.moveTo(at); }
          // The old centre-based offset grazed the symbol even though it was not centred on it.
          try { mover.moveTo([COUNTER_X - 0.75, ROAD_B]); landing.priorPort.frame(scene, moverKey, protectedParts); }
          finally { mover.moveTo(at); }
        }
      }
      // Witness actual native paint and motion on the unmodified trajectory first.
      check.poison.frame(scene, moverKey, subjects);
      if (!check.poisoned && check.frames >= 8 && movers[0]!.family().some(m => m instanceof VMobject && m.style.opacity >= 0.95)) {
        const mover = movers[0]!, at = mover.center();
        try {
          mover.moveTo(subjects[0]!.center());
          check.poison.frame(scene, moverKey, subjects);
          check.poisoned = true;
        } finally { mover.moveTo(at); }
      }
    }
  };
  // The guided story includes the signed-in, signed-out and scope-refusal branches.
  await new scenario.Scene({frame}).run();
  for (const [key, check] of checks) {
    const required = key === 'read' ? ['example.com', 'Vn3q']
      : key === 'submit-half' || key === 'shelf:join:flight' ? ['Vn3q']
      : key === 'phish-cookie' ? ['evil.example', 'cookies'] : ['example.com', 'evil.example'];
    check.clear.assertClear(`${scenario.values.signin} authored ${key}`, required);
    assert.ok(check.poisoned, `${key}: the deliberate overlap was applied to a visible traveller`);
    assert.throws(() => check.poison.assertClear(`${key} overlap poison`, required), /hides [1-9]\d* painted text pixels/,
      `${key}: native paint must reject an opaque traveller moved over the protected glyphs`);
  }

  assert.ok(landing.frames >= 2, 'the final forged-stub dwell really paints');
  landing.clear.assertClear(`${scenario.values.signin} forged-stub landing`, ['road:browser:stop', 'example.com']);
  assert.throws(() => landing.poison.assertClear('centred-stop landing poison', ['road:browser:stop']), /hides [1-9]\d* painted drawing pixels/);

  assert.throws(() => landing.priorPort.assertClear('old centre-based landing poison', ['road:browser:stop']), /hides [1-9]\d* painted drawing pixels/);

  // Reader paths add another code and leave an error page, or reverse the order of the attacks.
  // Each event is animated independently so a positive witness cannot come from an earlier trip.
  const host = await new scenario.Scene(new LiveSink()).run(), place = liveSteps(host).get('phish');
  assert.ok(place);
  for (const log of [
    ['load', 'submit', 'load', 'authorize'],
    ['load', 'authorize', ...(scenario.values.signin === 'no-scope' ? ['authorize'] : []), 'submit', 'phish', 'forge'],
  ]) {
    const mover = log.at(-1) === 'authorize' ? 'read' : 'forged', route = routeInkCheck();
    await runLive(scenario.Scene, 'phish', place, log, {from: 'start', animate: {async frame(scene) {
      const subjects = [...inPart(scene, 'browser'), ...(mover === 'forged' ? [...inPart(scene, 'evil'), ...inPart(scene, 'page:who'), ...inPart(scene, 'page:session'), ...inPart(scene, 'page:sid')] : [])];
      if (scene.familyMembers().some(m => m.key === mover && visible(m))) route.frame(scene, mover, subjects);
    }}});
    route.assertClear(`${scenario.values.signin} reader ${log.join(', ')}`, mover === 'read' ? ['example.com'] : ['example.com', 'evil.example']);
  }
}
