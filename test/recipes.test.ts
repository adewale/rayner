import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Succession, linear } from 'rayner';
import { StringSink, SnapshotSink, NullSink, renderAt } from 'rayner/output';
import { traceScene, TraceSink } from 'rayner/testing';
import { requestScene, route } from '../recipes/document.ts';
import { Diamond, StatusBadge } from '../recipes/extensions.ts';
import ContinuousScene, { orbit, makeOrbit, FollowAngle } from '../recipes/continuous.ts';
import { outputs, recipes } from '../recipes/render.ts';
import { SampledOrbit, MorphedOrbit, invariantFailures } from '../recipes/invariants.ts';

test('document recipe accepts data, computes both routes, and exposes the model result in picture text and trace', async () => {
  for (const cached of [false, true]) {
    const expected = cached ? 'cache' : 'database';
    assert.equal(route({ cached }), expected);
    const input = { cached }, SceneClass = requestScene(input);
    input.cached = !cached;
    const result = await outputs(SceneClass, 1e6);
    assert.deepEqual(result.state, { cached, destination: expected });
    assert.match(result.text, new RegExp(expected));
    assert.equal(result.trace.steps.length, 3);
    assert.deepEqual(result.trace.steps[1]!.after, { cached, destination: expected });
    // The route the model chose, and the readout's sync recording what its morph paired as it began
    const evidence = result.trace.steps[1]!.evidence!;
    assert.deepEqual(evidence.filter((e) => e.kind === 'route'), [{ kind: 'route', cached, destination: expected }]);
    assert.ok(evidence.some((e) => e.kind === 'match'));
  }
});

test('document recipe validates its input with jsonObject and refuses data a trace could not hold', () => {
  assert.throws(() => requestScene({ cached: true, extra: () => 1 } as unknown as { cached: boolean }), /input\.extra must contain finite, acyclic JSON data/);
  assert.throws(() => requestScene({ cached: 'yes' } as unknown as { cached: boolean }), /cached must be a boolean/);
});

test('custom geometry owns its copy and a copied composite exposes its own children', () => {
  const diamond = new Diamond(), copy = diamond.copy();
  assert.deepEqual(diamond.box(), [-1, -1, 1, 1]);
  copy.shift([4, 0]);
  assert.deepEqual(diamond.box(), [-1, -1, 1, 1]);
  assert.deepEqual(copy.box(), [3, -1, 5, 1]);
  assert.notEqual(copy.subpaths[0], diamond.subpaths[0]);
  const badge = new StatusBadge('queued'), clone = badge.copy();
  clone.label.setText('done');
  assert.equal(badge.label.text, 'queued');
  assert.equal(clone.label.text, 'done');
  assert.equal(clone.shape.parent, clone);
});

test('one parameter keeps the point on the circle at intermediate values, preserves identity, and resamples without history', () => {
  const rig = makeOrbit(), parts = [rig.dot, rig.radius, rig.readout];
  const animation = new FollowAngle(rig, Math.PI);
  animation.begin();
  for (const alpha of [0.5, 0.9, 0.1, 0.5, 1, 0]) {
    animation.interpolate(alpha);
    const [x, y] = rig.dot.center();
    assert.ok(Math.abs(x - 3 * Math.cos(Math.PI * alpha)) < 1e-5);
    assert.ok(Math.abs(y - 3 * Math.sin(Math.PI * alpha)) < 1e-5);
    assert.ok(Math.abs(Math.hypot(x, y) - 3) < 1e-5);
    assert.equal(rig.readout.text, (Math.PI * alpha).toFixed(2));
    const end = rig.radius.end();
    assert.ok(Math.abs(end[0] - x) < 1e-5 && Math.abs(end[1] - y) < 1e-5);
    [rig.dot, rig.radius, rig.readout].forEach((part, i) => assert.equal(part, parts[i]));
  }
  for (const bad of [NaN, Infinity, -1, Math.PI + 1]) assert.throws(() => orbit(bad), /finite and in/);
});

test('parameter recipe seeks to played SVGs and traces agree with full playback', async () => {
  const full = new StringSink(); await new ContinuousScene(full).run();
  for (const time of [0, 0.1, 0.5, 0.9, 1]) {
    const sink = new SnapshotSink();
    const scene = await renderAt(ContinuousScene, time, sink);
    assert.equal(sink.svg, full.frames[Math.round(scene.time * scene.fps)]);
    assert.ok(Math.abs((scene.state.angle as number) - time * Math.PI) < 1e-12);
  }
  const fullTrace = new TraceSink(); await new ContinuousScene(fullTrace).run();
  assert.deepEqual((await traceScene(ContinuousScene)).steps, fullTrace.steps());
});

test('parameter animations capture starts in succession and reject another writer to a dependent object', async () => {
  class RoundTrip extends Scene {
    override async construct() {
      const rig = makeOrbit();
      const publish = (sample: ReturnType<typeof orbit>) => { this.state = { angle: sample.angle }; };
      await this.play(new Succession([
        new FollowAngle(rig, Math.PI, publish, { runTime: 0.5 }),
        new FollowAngle(rig, 0, publish, { runTime: 0.5 }),
      ]), { rateFunc: linear });
    }
  }
  const scene = await renderAt(RoundTrip, 0.75, new SnapshotSink(), { fps: 60 });
  assert.ok(Math.abs((scene.state.angle as number) - Math.PI / 2) < 1e-12);
  class Conflicting extends Scene {
    override async construct() {
      const rig = makeOrbit();
      await this.play(new FollowAngle(rig, Math.PI), rig.dot.animate.shift([1, 0]));
    }
  }
  await assert.rejects(new Conflicting(new NullSink()).run(), /only once/);
});

test('every supported recipe produces nonempty SVG, text, elements and a named-step trace through public APIs', async () => {
  assert.deepEqual(Object.keys(recipes), ['document', 'extensions', 'continuous', 'choreography', 'invariants']);
  for (const SceneClass of Object.values(recipes)) {
    const result = await outputs(SceneClass);
    assert.match(result.svg, /^<svg/);
    assert.ok(result.text.trim().length > 0);
    assert.ok(result.elements.length > 0);
    assert.ok(result.trace.steps.length >= 2);
    assert.equal(result.index.steps.length, result.trace.steps.length);
  }
});

test('invariant recipe: the sampled orbit holds its claim on every frame, the morphed one fails exactly where it cuts across', async () => {
  const held = await invariantFailures(SampledOrbit);
  assert.deepEqual(held.failures, []);
  assert.deepEqual(held.vacuous, []);
  assert.equal(held.held['the dot stays on its circle'], held.checked['the dot stays on its circle'], 'it held on every frame it ran');
  assert.ok(held.checked['the dot stays on its circle']! > 30, 'the claim was checked on every frame of the run');
  const broken = await invariantFailures(MorphedOrbit);
  assert.ok(broken.failures.length > 0);
  assert.ok(broken.failures.every((f) => f.invariant === 'the dot stays on its circle' && f.step === 'turn'));
  // Half way, a straight morph passes through the centre: the dot is a whole radius off its circle
  assert.ok(broken.failures.some((f) => f.message === 'the dot is 2.000 off its circle'), JSON.stringify(broken.failures.slice(0, 3)));
  // The same run can feed another sink: invariants ride along with whatever else is watching
  const frames: number[] = [];
  await invariantFailures(SampledOrbit, { async frame(scene) { frames.push(scene.frameCount); } });
  // Every frame but the one run() draws before construct() registers the claim
  assert.equal(frames.length, held.checked['the dot stays on its circle']! + 1);
  assert.ok(Object.hasOwn(recipes, 'invariants'));
});

test('a claim that reads a misspelt key finds nothing on every frame: it is reported as vacuous, not as held', async () => {
  const { Scene, Dot, linear, view } = await import('rayner');
  class Misspelt extends Scene {
    override async construct() {
      this.state = { angle: 0 };
      const dot = view(this, (st) => Object.assign(new Dot().moveTo([2 * Math.cos(st.angle as number), 2 * Math.sin(st.angle as number)]), { key: 'orbit:dot' }), { place: false });
      this.add(dot);
      this.addInvariant('the dot stays on its circle', (scene) => {
        const found = scene.find('orbit:dto');
        if (!found) return;
        return Math.abs(Math.hypot(...found.center()) - 2) <= 1e-3 || 'off its circle';
      });
      await this.step('turn');
      await this.play(dot.tween((t) => ({ angle: t })), { runTime: 0.3, rateFunc: linear });
    }
  }
  const result = await invariantFailures(Misspelt);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.vacuous, ['the dot stays on its circle']);
  assert.equal(result.held['the dot stays on its circle'], undefined);
});
