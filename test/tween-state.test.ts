import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Dot, Rectangle, VMobject, Succession, AnimationGroup, keyed, linear } from '../src/index.ts';
import type { Sink } from '../src/index.ts';
import { StringSink, SnapshotSink } from '../src/svg.ts';
import { NullSink, renderFrame } from '../src/timeline.ts';
import { Machine, tweenState, view } from '../explain/index.ts';
import { SetState } from '../explain/state.ts';
import { thereAndBack } from '../extras/index.ts';
import type { ViewPlace } from '../explain/index.ts';

type Pair = { x: number; y: number };
class PairScene extends Scene { override state: Pair = { x: 0, y: 0 }; }
const host = () => new PairScene(new NullSink());
const pictures = (s: PairScene) => [
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
    await assert.rejects(s.play(action, replay ? machine.sendSequence(['NEXT']) : machine.send('NEXT')), /both animate .*Scene\.state/);
    assert.equal(samples, 0);
    assert.deepEqual(s.state, { x: 0, y: 0 });
  }
});

test('one sample feeds two dependent views atomically on every frame and leaves no resource on stage', async () => {
  let frames = 0, samples = 0;
  const reads: Pair[][] = [[], []];
  class Coupled extends Scene {
    override state: Pair = { x: 0, y: 0 };
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
    assert.deepEqual(s.mobjects, [s.a, s.b]);
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

test('model write reservations stay out of the drawing order in every play and seek', async () => {
  class Tracking extends Scene {
    override state = { x: 2 };
    marker = keyed(new Dot().addUpdater(m => m.moveTo(this.mobjects.at(-1)!)), 'tracker');
    subject = keyed(view(this, ({ x }) => new Rectangle({ width: 1, height: 1 }).moveTo([x, 1]), { place: false }), 'subject');
    override async construct() {
      this.add(this.marker, this.subject);
      await this.subject.tween(t => ({ x: 2 + t }), { runTime: 0.1 });
      const sweep = (start: number) => tweenState(this, t => ({ x: start + t }), { views: [this.subject], runTime: 0.1 });
      await this.play(sweep(3));
      await this.play(new AnimationGroup([new Succession([sweep(4)])]));
      await this.play(new SetState(this, { x: 5 }));
    }
  }
  const frames: number[] = [];
  const check = (scene: Tracking) => {
    assert.deepEqual(scene.mobjects.map(m => m.key), ['tracker', 'subject']);
    close(scene.marker.center()[0], scene.subject.center()[0]);
    close(scene.marker.center()[1], 1);
  };
  const ran = new Tracking({ async frame(scene) {
    const s = scene as Tracking;
    if (s.mobjects.includes(s.subject)) { check(s); frames.push(s.frameCount); }
  } });
  await ran.run();
  assert.equal(frames.length, 10);
  check(ran);
  for (const frame of [1, 4, 7, 10]) check(await renderFrame(Tracking, frame) as Tracking);
});

test('a sampled path can disappear and a bar can flatten without moving or rescaling their later frames', async () => {
  class Placed extends Scene {
    override state = { t: 0 };
    route = view(this, ({ t }) => {
      const path = new VMobject();
      if (t < 0.4 || t > 0.6) path.startNewPath([-1, 0]).addLineTo([1, 0]);
      return path;
    }).scale(1.5).moveTo([4, 2]);
    bar = view(this, ({ t }) => new Rectangle({ width: 2, height: Math.abs(1 - 2 * t) + 3e-7 })).moveTo([0, 3]);
    growing = view(this, ({ t }) => new Rectangle({ width: 2, height: t + 3e-7 })).scale(1.5).moveTo([0, -3]);
    override async construct() {
      this.add(this.route, this.bar, this.growing);
      const views = [this.route, this.bar, this.growing];
      await tweenState(this, t => ({ t }), { views, runTime: 1, rateFunc: linear });
      // Finish empty and nearly flat, then adopt visible pictures in the following rebuild/sync.
      await tweenState(this, t => ({ t: 1 - t / 2 }), { views, runTime: 0.2, rateFunc: linear });
      this.state = { t: 1 };
      this.route.rebuild();
      await this.bar.sync({ match: 'index', runTime: 0.1 });
    }
  }
  const full = new StringSink();
  const check = (s: Placed) => {
    if (s.state.t >= 0.4 && s.state.t <= 0.6) assert.equal(s.route.current.box(), null);
    else {
      assert.deepEqual(s.route.current.center(), [4, 2]);
      close(s.route.current.width(), 3);
    }
    close(s.bar.current.width(), 2);
    close(s.growing.current.width(), 3);
  };
  const played = new Placed({ async frame(scene) {
    await full.frame(scene);
    check(scene as Placed);
  } });
  await played.run();
  assert.equal(full.frames.length, 40);
  check(played);
  for (const frame of [15, 27, 18, 30, 36, 39, 1]) {
    const snap = new SnapshotSink();
    const sought = await renderFrame(Placed, frame, snap) as Placed;
    check(sought);
    assert.equal(snap.svg, full.frames[frame], `placed seek ${frame}`);
  }
});

test('shared sampling resolves pictures after a preceding sync, and seeks match full frames in either order', async () => {
  class Shared extends Scene {
    override state: Pair = { x: 0, y: 0 };

    override async construct() {
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

test('a state tween clamps eased samples to the interval and finishes on its last eased sample', async () => {
  const seen: number[] = [];
  const s = new PairScene({ async frame(scene) { seen.push(scene.stateJson().x as number); } });
  const views = pictures(s);
  s.add(...views);
  await tweenState(s, t => ({ x: t, y: t * 2 }), { views, runTime: 0.1, rateFunc: t => t < 0.5 ? -0.2 : t < 1 ? 1.2 : 0.25 });
  assert.deepEqual(seen, [0, 1, 0.25]);
  assert.deepEqual(s.state, { x: 0.25, y: 0.5 });
  close(views[0].current.width(), 1.25); close(views[1].current.height(), 1.5);
});

test('default placement keeps intrinsic height and width changes at their model dimensions on every frame', async () => {
  let checked = 0;
  class DefaultPlaced extends Scene {
    override state = { n: 0 };
    tall = view(this, (st) => new Rectangle({ width: 1, height: 1 + st.n }));
    wide = view(this, (st) => new Rectangle({ width: 1 + st.n, height: 1 }));
    override async construct() {
      this.add(this.tall, this.wide);
      await tweenState(this, (t) => ({ n: t }), { views: [this.tall, this.wide], runTime: 0.2, rateFunc: linear });
    }
  }
  const scene = new DefaultPlaced({ async frame(ran) {
    const s = ran as DefaultPlaced;
    if (!s.mobjects.includes(s.tall)) return;
    checked++;
    close(s.tall.current.height(), 1 + s.state.n); close(s.tall.current.width(), 1);
    close(s.wide.current.width(), 1 + s.state.n); close(s.wide.current.height(), 1);
  } });
  await scene.run();
  assert.equal(checked, 6);
  assert.deepEqual(scene.state, { n: 1 });
  close(scene.tall.current.height(), 2); close(scene.wide.current.width(), 2);
});

test('sampled fits preserve moved and scaled anchors through returning tweens, later syncs and rebuilds', async () => {
  for (const place of ['left', 'center', 'right'] as const satisfies readonly ViewPlace[]) {
    const s = Object.assign(new Scene(new NullSink()), { state: { n: 0 } });
    const v = view(s, (st) => new Rectangle({ width: 1 + st.n, height: 2 + st.n }), { place });
    v.scale(2.5).moveTo([3, -1]); s.add(v);
    const anchor = () => { const b = v.current.box()!; return [place === 'left' ? b[0] : place === 'right' ? b[2] : (b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
    const start = anchor();
    const fits = (n: number) => {
      close(v.current.width(), 2.5 * (1 + n)); close(v.current.height(), 2.5 * (2 + n));
      anchor().forEach((coordinate, i) => close(coordinate, start[i]!));
    };
    // The first tween also covers the existing one-view API, which shares the same sampler.
    await v.tween((t) => ({ n: t }), { runTime: 0.2, rateFunc: linear }); fits(1);
    s.state = { n: 2 };
    await v.sync({ match: 'index', runTime: 0.2 }); fits(2);
    await tweenState(s, (t) => ({ n: 2 + t }), { views: [v], runTime: 0.2, rateFunc: thereAndBack }); fits(2);
    await v.tween((t) => ({ n: 2 * (1 - t) }), { runTime: 0.2, rateFunc: linear }); fits(0);
    s.state = { n: 3 }; v.rebuild(); fits(3);
  }
});

test('default placed and scaled sampled pictures seek to the same frames as a full run', async () => {
  class Sized extends Scene {
    override state = { n: 0 };

    override async construct() {
      const tall = view(this, (st) => new Rectangle({ width: 1, height: 1 + st.n })).scale(1.5).moveTo([-2, 1]);
      const wide = view(this, (st) => new Rectangle({ width: 1 + st.n, height: 1 }), { place: 'left' }).scale(0.75).moveTo([2, -1]);
      this.add(tall, wide);
      await tweenState(this, (t) => ({ n: t }), { views: [tall, wide], runTime: 0.6, rateFunc: linear });
      this.state = { n: 2 };
      await this.play(tall.sync({ match: 'index', runTime: 0.2 }), wide.sync({ match: 'index', runTime: 0.2 }));
      await tweenState(this, (t) => ({ n: 2 * (1 - t) }), { views: [tall, wide], runTime: 0.4, rateFunc: linear });
      close(tall.current.height(), 1.5); close(wide.current.width(), 0.75);
    }
  }
  const full = new StringSink(); await new Sized(full).run();
  assert.equal(full.frames.length, 37);
  for (const k of [36, 17, 30, 1, 24, 18, 6, 0]) {
    const snap = new SnapshotSink(); await renderFrame(Sized, k, snap);
    assert.equal(snap.svg, full.frames[k], `placed seek ${k}`);
  }
});
