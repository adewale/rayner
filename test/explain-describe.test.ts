import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceScene } from '../explain/testing.ts';
import { describeExplainer, withSettings, loadProject, loadSnapshots } from '../explain/testing.ts';
import { scenariosOf, bindSnapshots } from '../explain/internal.ts';
import type { ExplainerClass } from '../explain/index.ts';
import RingBuffer from '../scenes/explainers/ring-buffer/scene.ts';
import OauthPkce from '../scenes/explainers/oauth-pkce/scene.ts';
import { PALETTES } from '../explain/palettes.ts';
import { idsOf, stepIdsOf } from './lib/steps.ts';
import { RestingSink } from '../tools/lib/explain-check.ts';
import { Scene, Rectangle } from '../src/index.ts';
import type { SceneState } from '../src/index.ts';
import { Machine, view } from '../explain/index.ts';
import { liveBase, liveSteps } from '../explain/live.ts';
import { describeScenario } from '../explain/describe.ts';
import { seeText } from '../tools/lib/explain-see.ts';

test('describeExplainer gives every scenario and step: the words, the state the trace recorded and what each step changed', async () => {
  // As the tools describe it: collected, so its id is its folder's name.
  const { Scene: Bound } = await loadProject(RingBuffer, 'scenes/explainers/ring-buffer');
  const d = await describeExplainer(Bound);
  assert.equal(d.schema, 1);
  assert.equal(d.id, 'ring-buffer');
  assert.deepEqual(d.scenarios.map((c) => c.values), scenariosOf(Bound));
  for (const c of d.scenarios) {
    // The scenario's paper, as the stage drew it: ring-buffer draws on dusk (an added field; schema stays 1).
    assert.equal(c.paper, PALETTES.dusk!.paper, `${JSON.stringify(c.values)}: paper`);
    const trace = await traceScene(withSettings(Bound, c.values));
    assert.equal(c.duration, trace.duration);
    // The steps a description lists are the steps the scene runs, as a test reads them (test/lib/steps.ts).
    assert.deepEqual(c.steps.map((s) => s.step), await stepIdsOf(withSettings(Bound, c.values)));
    assert.deepEqual(c.steps.map((s) => s.step), idsOf(trace));
    c.steps.forEach((s, i) => {
      const t = trace.steps[i]!;
      assert.equal(s.title, t.meta.title);
      assert.equal(s.line, t.meta.line ?? '', `${s.step}: the line under the title`);
      assert.equal(s.caption, t.meta.caption);
      assert.equal(s.kind, t.meta.kind ?? 'main');
      const state: SceneState = t.state ?? t.after;
      const picture = t.derived?.picture;
      assert.deepEqual(s.state, state, `${s.step}: state is the trace's local specimen or model; the picture is traced as shown`);
      assert.ok(picture === undefined || s.picture.length > 0, `${s.step}: the picture in words`);
      const before: SceneState = trace.steps[i - 1]?.state ?? t.before;
      const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(state)])]
        .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(state[key]));
      assert.deepEqual(Object.keys(s.changed).sort(), changedKeys.sort(), `${s.step}: complete changed-key set`);
      for (const [k, change] of Object.entries(s.changed)) {
        // A side is there exactly when the value was set, so the JSON says the same as the object.
        assert.equal('before' in change, k in before);
        assert.equal('after' in change, k in state);
        assert.deepEqual(change.before, before[k]);
        assert.deepEqual(change.after, state[k]);
        assert.notDeepEqual(change.before, change.after);
      }
      assert.match(s.drawing!, /[┌─│]/, `${s.step}: the resting picture drawn as text`);
      // The heading is left out whole: its title, and the line and number drawn with it.
      for (const words of [s.title, s.line].filter(Boolean)) assert.ok(!s.drawing!.includes(words), `${s.step}: "${words}" is in the drawing`);
    });
  }
  // The ring after the last pushes, as `rayner see` reports it.
  const result = d.scenarios[0]!.steps.find((s) => s.step === 'result')!;
  assert.deepEqual(result.changed.tail, { before: 0, after: 2 });
  // JSON-safe: what an agent reads from a file is what the function returned.
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
});

test('describe and see retain step kinds, teaching order and resolved prediction/reveal metadata', async () => {
  class Paths extends Scene {
    override async construct() {
      await this.step('ask', { kind: 'short', predict: { prompt: 'Which number?', options: ['Zero', 'One'], answer: 'One' } });
      await this.step('aside', { kind: 'detail' });
      await this.step('answer', { predict: { options: ['Same', 'Different'], answer: 0, reveal: 'finish' } });
      await this.step('notes', { kind: 'detail' });
      await this.step('finish');
    }
  }
  const d = await describeScenario(Paths, {}, { drawings: false });
  assert.deepEqual(d.teaching, ['ask', 'answer', 'finish']);
  assert.deepEqual(d.steps.map((s) => s.kind), ['short', 'detail', 'main', 'detail', 'main']);
  assert.deepEqual(d.steps.map((s) => s.predict ?? null), [
    { prompt: 'Which number?', options: ['Zero', 'One'], answer: 1, reveal: 'answer' },
    null, { options: ['Same', 'Different'], answer: 0, reveal: 'finish' }, null, null,
  ]);
  assert.deepEqual(d.steps.map((s) => s.reveals ?? []), [[], [], ['ask'], [], ['answer']]);
  assert.equal(d.predictionProblems, undefined);
  assert.match(seeText('paths', d, 'ask'), /Path: short · teaching step 1 of 3/);
  assert.match(seeText('paths', d, 'ask'), /Prediction: Which number\? Zero \/ One; answer: One; revealed at answer/);
  assert.match(seeText('paths', d, 'aside'), /Path: detail · outside the teaching path/);
  assert.match(seeText('paths', d, 'answer'), /Reveals predictions from: ask/);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
});

test('describe follows the all-detail fallback and reports a broken prediction instead of claiming a reveal', async () => {
  class Details extends Scene {
    override async construct() {
      await this.step('first', { kind: 'detail', predict: { options: ['Yes', 'No'], answer: 0 } });
      await this.step('second', { kind: 'detail', predict: { options: ['Yes', 'No'], answer: 1, reveal: 'missing' } });
    }
  }
  const d = await describeScenario(Details, {}, { drawings: false });
  assert.deepEqual(d.teaching, ['first', 'second']);
  assert.equal(d.steps[0]!.predict!.reveal, 'second');
  assert.deepEqual(d.steps[1]!.reveals, ['first']);
  assert.equal(d.steps[1]!.predict, undefined);
  assert.equal(d.predictionProblems!.length, 1);
  assert.match(d.predictionProblems![0]!, /names reveal "missing", which is not a step/);
  assert.match(seeText('details', d, 'second'), /Path: detail · teaching step 2 of 2/);
  assert.match(seeText('details', d, 'second'), /Prediction problem: .*names reveal "missing"/);
});

test('machine descriptions use the player\'s raw model origin while step descriptions retain trace-only JSON', async () => {
  class WithEvidence extends Scene<{ n: number }> {
    override state = { n: 0 };
    override async construct() {
      this.addJson(() => ({ aux: 'trace only' }));
      await this.step('live');
      const picture = view(this, st => new Rectangle({ width: 1 + st.n }), { place: false });
      this.add(picture);
      const machine = new Machine(this, {
        start: { n: 0 }, events: ['inc'], views: [picture], match: 'index', runTime: 0,
        // Trace annotations are not model inputs. Adding one would falsely make rest terminal.
        next: st => Object.keys(st).length === 1 && st.n < 3 ? { n: st.n + 1 } : undefined,
      });
      await machine.send('inc');
    }
  }
  const ran = await new WithEvidence({ skipUntil: Infinity, async frame() {} }).run();
  const actual = await liveBase(WithEvidence, 'live', liveSteps(ran).get('live')!);
  assert.deepEqual(actual.base, { from: 'rest', state: { n: 1 } });
  const described = await describeScenario(WithEvidence, {}, { drawings: false });
  assert.deepEqual(described.steps[0]!.state, { n: 1 });
  assert.deepEqual(described.steps[0]!.derived, { aux: 'trace only' });
  assert.equal(described.machines!.length, 1);
  assert.deepEqual(described.machines![0]!.live, { ...actual.base, states: 3, complete: true });
});

test('a step\'s resting picture has one text drawing: rayner check\'s restingFrames is describe\'s drawing, the heading left out of both', async () => {
  const Bound = withSettings((await loadProject(RingBuffer, 'scenes/explainers/ring-buffer')).Scene, scenariosOf(RingBuffer as ExplainerClass)[0]!);
  const d = await describeExplainer(Bound);
  // As check reads it: a RestingSink on a full run.
  const resting = new RestingSink();
  await new Bound(resting).run();
  const steps = d.scenarios[0]!.steps;
  assert.ok(steps.length > 1);
  for (const s of steps) {
    assert.equal(resting.restingText.get(s.step), s.drawing, `${s.step}: check draws the step as describe does`);
    assert.ok(!resting.restingText.get(s.step)!.includes(s.title), `${s.step}: the title is not in check's drawing`);
  }
});

test('a scene with diagrams describes from its pinned snapshots, scenario by scenario, and fails without them', async () => {
  const snapshots = await loadSnapshots('scenes/explainers/oauth-pkce');
  const d = await describeExplainer(OauthPkce as ExplainerClass, { snapshots, drawings: false });
  assert.deepEqual(d.settings.map((s) => s.id), ['attacker']);
  assert.equal(d.scenarios.length, 2);
  const steps = (attacker: string) => d.scenarios.find((c) => c.values.attacker === attacker)!.steps.map((s) => s.step);
  // The setting changes which steps exist: only the attacker scenario has the attack.
  assert.ok(steps('yes').includes('attack'));
  assert.ok(!steps('no').includes('attack'));
  assert.ok(d.scenarios.every((c) => c.steps.every((s) => s.drawing === undefined)), 'drawings: false leaves them out');
  assert.ok(d.scenarios[0]!.steps.some((s) => /Sequence diagram/.test(s.picture)), 'diagrams are described in words');
  // Same answer as binding the snapshots by hand.
  const trace = await traceScene(withSettings(bindSnapshots(OauthPkce as ExplainerClass, snapshots), d.scenarios[0]!.values));
  assert.deepEqual(d.scenarios[0]!.steps.map((s) => s.step), trace.steps.map((s) => s.step));
  await assert.rejects(describeExplainer(OauthPkce as ExplainerClass, { drawings: false }), /^Error: s\.show\(\): no diagram snapshots are bound to this scene;/);
});

test("drawings: a step's name draws that step only, as drawing every step draws it", async () => {
  const { Scene: Bound } = await loadProject(RingBuffer, 'scenes/explainers/ring-buffer');
  const all = await describeExplainer(Bound);
  const one = await describeExplainer(Bound, { drawings: 'next' });
  assert.ok(all.scenarios.length > 1);
  for (const [i, c] of one.scenarios.entries()) {
    const full = all.scenarios[i]!;
    assert.ok(c.steps.some((s) => s.step === 'next'));
    c.steps.forEach((s, j) => {
      const { drawing, ...rest } = full.steps[j]!;
      // `rayner see` draws the step it shows this way, so its picture is the description's.
      assert.equal(s.drawing, s.step === 'next' ? drawing : undefined, `${s.step}: drawn only when named`);
      assert.deepEqual({ ...s, drawing: undefined }, { ...rest, drawing: undefined });
    });
  }
});
