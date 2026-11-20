import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { traceScene, describeExplainer } from '../explain/testing.ts';
import { playerTrace } from '../app/embed-trace.ts';

class Channels extends Scene<{ tokens: number; walks: string[] }, { chapter: string; picture: string }> {
  override state = { tokens: 2, walks: ['a real domain field'] };
  override shown = { chapter: 'example', picture: 'an authored choice' };
  override async construct() {
    const s = stage(this, { heading: false });
    this.addJson(() => ({ doubled: this.state.tokens * 2 }));
    this.record('setup', { tokens: this.state.tokens });
    await s.steps([{ id: 'specimen', title: 'A local example', line: 'Zero tokens.', caption: 'A local example.',
      state: { tokens: 0 }, draw: st => new Text(String(st.tokens)) }]);
    this.record('checkpoint', { tokens: this.state.tokens });
    await this.step('model', { title: 'One more token', caption: 'The persistent model gains a token.' });
    this.state.tokens++;
    await s.enter(new Text(String(this.state.tokens)).moveTo([0, -1]));
  }
}

test('model, authored presentation, local specimens, derived observations and evidence keep separate owners', async () => {
  const trace = await traceScene(Channels);
  assert.equal(trace.steps.length, 2);
  const [specimen, model] = trace.steps;
  assert.deepEqual(specimen!.before, { tokens: 2, walks: ['a real domain field'] });
  assert.deepEqual(specimen!.after, specimen!.before);
  assert.deepEqual(specimen!.state, { tokens: 0 });
  assert.deepEqual(model!.after, { tokens: 3, walks: ['a real domain field'] });
  assert.equal(model!.state, undefined);
  for (const step of trace.steps) {
    assert.deepEqual(step.shown, { chapter: 'example', picture: 'an authored choice' });
    assert.ok(step.derived?.picture && typeof step.derived.picture === 'object');
    assert.deepEqual(Object.keys(step.after).sort(), ['tokens', 'walks']);
  }
  assert.equal(specimen!.derived!.doubled, 4);
  assert.equal(model!.derived!.doubled, 6);
  assert.deepEqual(trace.evidence, [{ kind: 'setup', tokens: 2 }]);
  assert.deepEqual(specimen!.evidence, [{ kind: 'checkpoint', tokens: 2 }]);
  assert.equal(model!.evidence, undefined);

  const description = (await describeExplainer(Channels)).scenarios[0]!;
  assert.deepEqual(description.steps.map(s => s.state.tokens), [0, 3]);
  assert.equal(description.steps[0]!.shown!.picture, 'an authored choice');
  assert.equal(description.steps[0]!.derived!.doubled, 4);
  assert.match(description.steps[0]!.picture, /0/);

  const player = playerTrace(trace, { tokens: 'Tokens' });
  assert.equal(player.steps.length, 2);
  assert.deepEqual(player.steps.map(s => s.after), [{ tokens: 2 }, { tokens: 3 }]);
  assert.ok(player.steps.every(s => s.derived?.picture));
  assert.ok(player.steps.every(s => Object.keys(s.derived!).join(',') === 'picture'));
  assert.ok(player.steps.every(s => !Object.hasOwn(s, 'shown') && !Object.hasOwn(s, 'evidence')));
});

test('a scene with no named steps retains its evidence without inventing a step', async () => {
  class Unstepped extends Scene {
    override async construct() { this.record('setup', { ready: true }); }
  }
  const trace = await traceScene(Unstepped);
  assert.deepEqual(trace.steps, []);
  assert.deepEqual(trace.evidence, [{ kind: 'setup', ready: true }]);
});

test('derived JSON is a detached snapshot and provider removal affects only its registration', () => {
  const scene = new Scene({ async frame() {} });
  const values = { readings: [1, 2] };
  const provider = () => values;
  const first = scene.addJson(provider), second = scene.addJson(provider);
  const derived = scene.derivedJson();
  (derived.readings as number[])[0] = 99;
  assert.deepEqual(values, { readings: [1, 2] });
  first();
  assert.deepEqual(scene.derivedJson(), values);
  second();
  assert.deepEqual(scene.derivedJson(), {});
  assert.deepEqual(scene.stateJson(), {});
  assert.deepEqual(scene.shownJson(), {});
});


test('evidence at a completed boundary is detached from later edits to the running scene', async () => {
  class Recorded extends Scene {
    override async construct() {
      this.record('setup', { value: [1] });
      await this.step('first');
      this.record('checkpoint', { value: [2] });
      await this.step('second');
      (this.evidence[0]!.value as number[])[0] = 99;
      (this.evidence[1]!.value as number[])[0] = 99;
    }
  }
  const trace = await traceScene(Recorded);
  assert.deepEqual(trace.evidence, [{ kind: 'setup', value: [1] }]);
  assert.deepEqual(trace.steps[0]!.evidence, [{ kind: 'checkpoint', value: [2] }]);
});
