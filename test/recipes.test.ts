import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StringSink, SnapshotSink, NullSink, renderAt, traceScene, TraceSink, Scene, Succession, linear } from 'rayner';
import { requestScene, route } from '../recipes/document.ts';
import { Diamond, StatusBadge } from '../recipes/extensions.ts';
import ContinuousScene, { orbit, makeOrbit, FollowAngle } from '../recipes/continuous.ts';
import { outputs, recipes } from '../recipes/render.ts';

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
    assert.deepEqual(result.trace.steps[1]!.evidence, [{ kind: 'route', cached, destination: expected }]);
  }
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
  const rig = makeOrbit(), ids = [rig.dot.id, rig.radius.id, rig.readout.id];
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
    assert.deepEqual([rig.dot.id, rig.radius.id, rig.readout.id], ids);
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
  assert.deepEqual(Object.keys(recipes), ['document', 'extensions', 'continuous', 'choreography']);
  for (const SceneClass of Object.values(recipes)) {
    const result = await outputs(SceneClass);
    assert.match(result.svg, /^<svg/);
    assert.ok(result.text.trim().length > 0);
    assert.ok(result.elements.length > 0);
    assert.ok(result.trace.steps.length >= 2);
    assert.equal(result.index.steps.length, result.trace.steps.length);
  }
});
