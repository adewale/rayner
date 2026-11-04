import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceScene } from '../src/index.ts';
import { describeExplainer, withSettings, scenariosOf, bindSnapshots } from '../explain/index.ts';
import type { ExplainerClass } from '../explain/index.ts';
import { readSnapshots } from '../tools/lib/explain-project.ts';
import RingBuffer from '../scenes/explainers/ring-buffer/scene.ts';
import OauthPkce from '../scenes/explainers/oauth-pkce/scene.ts';
import { PALETTES } from '../explain/palettes.ts';

test('describeExplainer gives every scenario and step: the words, the state the trace recorded and what each step changed', async () => {
  const d = await describeExplainer(RingBuffer as ExplainerClass);
  assert.equal(d.schema, 1);
  assert.equal(d.id, 'ring-buffer');
  assert.deepEqual(d.scenarios.map((c) => c.values), scenariosOf(RingBuffer as ExplainerClass));
  for (const c of d.scenarios) {
    // The scenario's paper, as the stage drew it: ring-buffer draws on dusk (an added field; schema stays 1).
    assert.equal(c.paper, PALETTES.dusk!.paper, `${JSON.stringify(c.values)}: paper`);
    const trace = await traceScene(withSettings(RingBuffer as ExplainerClass, c.values));
    assert.equal(c.duration, trace.duration);
    assert.deepEqual(c.steps.map((s) => s.step), trace.steps.map((s) => s.step));
    c.steps.forEach((s, i) => {
      const t = trace.steps[i]!;
      assert.equal(s.title, t.meta.title);
      assert.equal(s.line, t.meta.line ?? '', `${s.step}: the line under the title`);
      assert.equal(s.caption, t.meta.caption);
      const state = t.after ?? {}, picture = t.shown?.picture;
      assert.deepEqual(s.state, state, `${s.step}: state is the trace's model; the picture is traced as shown`);
      assert.ok(picture === undefined || s.picture.length > 0, `${s.step}: the picture in words`);
      const before = t.before;
      const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(state)])]
        .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(state[key]));
      assert.deepEqual(Object.keys(s.changed).sort(), changedKeys.sort(), `${s.step}: complete changed-key set`);
      for (const [k, change] of Object.entries(s.changed)) {
        // A side is there exactly when the value was set, so the JSON says the same as the object.
        assert.equal('before' in change, k in t.before);
        assert.equal('after' in change, k in state);
        assert.deepEqual(change.before, t.before[k]);
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

test('a scene with diagrams describes from its pinned snapshots, scenario by scenario, and fails without them', async () => {
  const snapshots = await readSnapshots('scenes/explainers/oauth-pkce/scene');
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
  await assert.rejects(describeExplainer(OauthPkce as ExplainerClass, { drawings: false }), /^Error: No diagram snapshots are bound to this scene:/);
});

test("drawings: a step's name draws that step only, as drawing every step draws it", async () => {
  const all = await describeExplainer(RingBuffer as ExplainerClass);
  const one = await describeExplainer(RingBuffer as ExplainerClass, { drawings: 'next' });
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
