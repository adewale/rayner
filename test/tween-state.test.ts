import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Rectangle, Succession, AnimationGroup } from '../src/index.ts';
import type { Sink } from '../src/index.ts';
import { StringSink, SnapshotSink } from '../src/svg.ts';
import { NullSink, renderFrame } from '../src/timeline.ts';
import { Machine, tweenState, view } from '../explain/index.ts';
import { SetState } from '../explain/state.ts';
import { thereAndBack } from '../extras/index.ts';

type Pair = { x: number; y: number };
const host = () => { const s = new Scene<Pair>(new NullSink()); s.state = { x: 0, y: 0 }; return s; };
const pictures = (s: Scene<Pair>) => [
  view(s, (st) => new Rectangle({ width: 1 + st.x, height: 1 }), { place: false }),
  view(s, (st) => new Rectangle({ width: 1, height: 1 + st.y }), { place: false }),
] as const;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);

test('two tweens of one model reject before either sampler runs, directly and inside a parallel group', async () => {
  for (const grouped of [false, true]) {
    const s = host(), [a, b] = pictures(s);
    let samples = 0;
    const actions = [a.tween((t) => { samples++; return { x: t, y: 0 }; }), b.tween((t) => { samples++; return { x: 0, y: t }; })];
    await assert.rejects(grouped ? s.play(new AnimationGroup(actions)) : s.play(...actions), /both animate .*Scene\.state/);
    assert.equal(samples, 0);
    assert.deepEqual(s.state, { x: 0, y: 0 });
    close(a.current.width(), 1); close(b.current.height(), 1);
  }
});

test('a sampled model conflicts with discrete state adoption, and foreign or duplicate views are refused at admission', async () => {
  const s = host(), other = host(), views = pictures(s), foreign = pictures(other)[0];
  let samples = 0;
  await assert.rejects(s.play(tweenState(s, (t) => { samples++; return { x: t, y: t }; }, { views }), new SetState(s, { x: 3, y: 4 })), /both animate .*Scene\.state/);
  assert.equal(samples, 0);
  assert.throws(() => tweenState(s, () => ({ x: 0, y: 0 }), { views: [foreign] }), /every view must read this scene's model/);
  assert.throws(() => tweenState(s, () => ({ x: 0, y: 0 }), { views: [views[0], views[0]] }), /view is listed twice/);
  assert.throws(() => tweenState(s, () => ({ x: 0, y: 0 }), { views: [] }), /needs the views/);
});

test('a sampled model and a machine event or replay declare their shared write before either begins', async () => {
  for (const replay of [false, true]) {
    const s = host(), views = pictures(s);
    const machine = new Machine(s, { start: { x: 0, y: 0 }, events: ['NEXT'], next: (st) => ({ x: st.x + 1, y: st.y }), views: [views[0]] });
    let samples = 0;
    const action = tweenState(s, (t) => { samples++; return { x: 0, y: t }; }, { views: [views[1]] });
    await assert.rejects(s.play(action, replay ? machine.replay(['NEXT']) : machine.send('NEXT')), /both animate .*Scene\.state/);
    assert.equal(samples, 0);
    assert.deepEqual(s.state, { x: 0, y: 0 });
  }
});

test('one sample feeds two dependent views atomically on every frame and leaves no resource on stage', async () => {
  let frames = 0, samples = 0;
  const reads: Pair[][] = [[], []];
  class Coupled extends Scene<Pair> {
    override state = { x: 0, y: 0 };
    a = view(this, (st) => { reads[0]!.push(st); return new Rectangle({ width: 1 + st.x, height: 1 }); }, { place: false });
    b = view(this, (st) => { reads[1]!.push(st); return new Rectangle({ width: 1, height: 1 + st.y }); }, { place: false });
    override async construct() {
      this.add(this.a, this.b);
      const action = tweenState(this, (t) => { samples++; return { x: t, y: 2 * t }; }, { views: [this.a, this.b], runTime: 0.5 });
      await action;
      await assert.rejects(this.play(action), /already played/);
    }
  }
  const sink: Sink = { async frame(scene) {
    const s = scene as Coupled;
    if (!s.a || !s.mobjects.includes(s.a)) return;
    frames++;
    assert.equal(s.state.y, 2 * s.state.x);
    close(s.a.current.width(), 1 + s.state.x); close(s.b.current.height(), 1 + s.state.y);
  } };
  const s = new Coupled(sink);
  await s.run();
  assert.ok(frames >= 15);
  assert.equal(reads[0]!.length, samples + 1);
  assert.equal(reads[1]!.length, samples + 1);
  for (let i = 0; i < samples + 1; i++) assert.equal(reads[0]![i], reads[1]![i], `draws share sample ${i}`);
  assert.deepEqual(s.state, { x: 1, y: 2 });
  assert.deepEqual(s.mobjects, [s.a, s.b]);
});

test('shared sampling resolves pictures after a preceding sync, and seeks match full frames in either order', async () => {
  class Shared extends Scene<Pair> {
    override async construct() {
      this.state = { x: 0, y: 0 };
      const [a, b] = pictures(this), old = a.current;
      this.add(a, b);
      this.state = { x: 1, y: 2 };
      await this.play(new Succession([
        a.sync({ match: 'index', runTime: 0.2 }), b.sync({ match: 'index', runTime: 0.2 }),
        tweenState(this, (t) => ({ x: 1 + t, y: 2 + 2 * t }), { views: [a, b], runTime: 0.6 }),
      ]));
      assert.notEqual(a.current, old);
      close(old.width(), 2); close(a.current.width(), 3); close(b.current.height(), 5);
    }
  }
  const full = new StringSink();
  await new Shared(full).run();
  assert.ok(full.frames.length >= 30);
  for (const k of [full.frames.length - 1, 16, 24, 13, 0]) {
    const snap = new SnapshotSink();
    await renderFrame(Shared, k, snap);
    assert.equal(snap.svg, full.frames[k], `seek ${k}`);
  }
});

test('shared sampling preserves there-and-back endpoints and permits sequential model writers', async () => {
  const s = host(), views = pictures(s);
  s.add(...views);
  await s.play(tweenState(s, (t) => ({ x: t, y: 2 * t }), { views, rateFunc: thereAndBack, runTime: 0.2 }));
  assert.deepEqual(s.state, { x: 0, y: 0 });
  close(views[0].current.width(), 1); close(views[1].current.height(), 1);
  await s.play(new Succession([
    tweenState(s, (t) => ({ x: t, y: t }), { views, runTime: 0.1 }),
    tweenState(s, (t) => ({ x: 1 + t, y: 1 + t }), { views, runTime: 0.1 }),
  ]));
  assert.deepEqual(s.state, { x: 2, y: 2 });
});
