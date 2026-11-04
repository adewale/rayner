import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Scene, Group, Rectangle, Circle, Dot, Line, Text, FadeIn, MoveAlongPath,
  GrowFromEdge, PulseAlongPath, SetState, AnimationGroup, LaggedStart, Succession,
  SnapshotSink, StringSink, NullSink, TraceSink, renderAt, traceScene, StateReadout, view,
  loadFonts, toSvgString, linear, easeInQuad, UP, DOWN, LEFT, RIGHT,
} from '../src/index.ts';
import type { Mobject, Vec } from '../src/index.ts';
import { fc, params } from './lib/pbt.ts';

await loadFonts();

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const data = (m: Mobject) => m.family().map(x => ({
  points: x.pointArrays().map(p => [...p]), style: { ...x.style },
}));

test('GrowFromEdge anchors each cardinal edge, captures placement at begin, and preserves the perpendicular extent', () => {
  for (const edge of [UP, DOWN, LEFT, RIGHT]) {
    const box = new Rectangle({ width: 4, height: 2 }).moveTo([2, -1]);
    const animation = new GrowFromEdge(box, edge);
    box.shift([1, 2]); // placement is captured at begin, not construction
    const before = box.copy(), target = box.box()!;
    const axis = edge[0] === 0 ? 1 : 0;
    const anchor = edge[axis] < 0 ? target[axis]! : target[axis + 2]!;
    animation.begin();
    for (const alpha of [0, 0.25, 0.5, 1, 0.1, 1]) {
      animation.interpolate(alpha);
      const b = box.box()!;
      close(edge[axis] < 0 ? b[axis]! : b[axis + 2]!, anchor);
      close(b[axis + 2]! - b[axis]!, (target[axis + 2]! - target[axis]!) * (0.001 + 0.999 * alpha));
      close(b[1 - axis]!, target[1 - axis]!);
      close(b[3 - axis]!, target[3 - axis]!);
      close(box.style.opacity, alpha);
    }
    animation.finish();
    assert.deepEqual(data(box), data(before));
  }
});

test('GrowFromEdge preserves the old diagram growth frame for frame, including child opacity and lag', async () => {
  class OldGrowth extends FadeIn {
    override createStartingMobject(): Mobject {
      return super.createStartingMobject().stretch(0.001, 1, { aboutEdge: DOWN });
    }
  }
  const run = async (modern: boolean) => {
    const sink = new StringSink();
    class Demo extends Scene {
      override async construct() {
        const row = new Group(new Rectangle().setOpacity(0.4), new Circle().shift(RIGHT).setOpacity(0.7));
        await this.play(modern ? new GrowFromEdge(row, DOWN, { lagRatio: 0.15 }) : new OldGrowth(row, { lagRatio: 0.15 }));
      }
    }
    await new Demo(sink).run();
    return sink.frames;
  };
  assert.deepEqual(await run(true), await run(false));
});

test('GrowFromEdge rejects malformed directions and scale values before changing the drawing', () => {
  const box = new Rectangle(), before = data(box);
  for (const edge of [[0, 0], [0.5, 0.5], [2, 0], [NaN, 0], [0], ['1', 0], { 0: 1, 1: 0 }])
    assert.throws(() => new GrowFromEdge(box, edge as Vec), /edge must be/);
  for (const initialScale of [-1, 1.1, NaN, Infinity, '0', new Number(0)])
    assert.throws(() => new GrowFromEdge(box, DOWN, { initialScale: initialScale as number }), /initialScale/);
  assert.deepEqual(data(box), before);
  const zero = new GrowFromEdge(box, LEFT, { initialScale: 0 }); zero.begin(); zero.finish();
  assert.deepEqual(data(box), before);
});

test('PulseAlongPath evaluates the route and opacity from alpha, keeps family opacity ratios, and captures the path at begin', () => {
  const a = new Dot().moveTo([-1, 0]).setOpacity(0.4);
  const b = new Dot().moveTo([1, 0]).setOpacity(0.7);
  const group = new Group(a, b).setOpacity(0.3);
  a.setOpacity(0.4); b.setOpacity(0.7);
  const path = new Line([-3, 0], [3, 0]);
  const pulse = new PulseAlongPath(group, path, { fromCurrent: false });
  path.shift([1, 2]);
  pulse.begin();
  path.shift([100, 100]); // the running effect reads its captured path
  const ids = group.family().map(m => m.id);
  for (const alpha of [0.5, 0.1, 0.9, 0.5, 1, 0]) {
    pulse.interpolate(alpha);
    close(group.center()[0], -2 + 6 * alpha); close(group.center()[1], 2);
    const envelope = Math.sin(Math.PI * alpha);
    close(group.style.opacity, 0.3 * envelope);
    close(a.style.opacity, 0.4 * envelope); close(b.style.opacity, 0.7 * envelope);
    assert.deepEqual(group.family().map(m => m.id), ids);
  }
});

test('PulseAlongPath preserves the old message-token frames and restores authored opacity after removal', async () => {
  class OldToken extends MoveAlongPath {
    override interpolate(alpha: number) { super.interpolate(alpha); this.mobject.setOpacity(Math.sin(Math.PI * alpha)); }
  }
  const run = async (modern: boolean) => {
    const sink = new StringSink();
    class Demo extends Scene {
      override async construct() {
        const token = new Dot().moveTo([-3, 0]), route = new Line([-3, 0], [3, 0]);
        await this.play(modern ? new PulseAlongPath(token, route) : new OldToken(token, route, { rateFunc: linear, remover: true }));
        await this.wait(0.1);
      }
    }
    await new Demo(sink).run(); return sink.frames;
  };
  assert.deepEqual(await run(true), await run(false));
  const host = new Scene(new NullSink()), dot = new Dot().setOpacity(0.4), path = new Line([0, 0], [2, 0]);
  const pulse = new PulseAlongPath(dot, path, { fromCurrent: false });
  await host.play(pulse, { runTime: 0 });
  assert.ok(!host.familyMembers().includes(dot));
  close(dot.style.opacity, 0.4); close(dot.center()[0], 2);
  await host.play(pulse, { runTime: 0.2 });
  close(dot.style.opacity, 0.4);
});

test('PulseAlongPath applies a supplied easing once and supports retaining the invisible token', async () => {
  const sink = new SnapshotSink();
  class Demo extends Scene {
    dot = new Dot();
    override async construct() {
      await this.play(new PulseAlongPath(this.dot, new Line([0, 0], [4, 0]), { rateFunc: easeInQuad, remover: false }));
    }
  }
  const scene = await renderAt(Demo, 0.5, sink) as Demo;
  close(scene.dot.center()[0], 1);
  close(scene.dot.style.opacity, Math.sin(Math.PI / 4));
  const full = new Demo(new NullSink()); await full.run();
  assert.ok(full.familyMembers().includes(full.dot));
  assert.ok(Math.abs(full.dot.style.opacity) < 1e-15);
});

test('SetState copies validated input, replaces rather than merges, and gives every begin a fresh snapshot', () => {
  const host = new Scene<{ count: number; nested?: { values: number[] } }>(new NullSink());
  host.state = { count: 0, nested: { values: [0] } };
  const input = { count: 3, nested: { values: [1, 2] } };
  const change = new SetState(host, input);
  assert.equal(change.runTime, 0); assert.equal(change.mobject.hasPoints(), false);
  input.count = 90; input.nested.values[0] = 90;
  change.begin(); assert.deepEqual(host.state, { count: 3, nested: { values: [1, 2] } });
  host.state.nested!.values[0] = 80;
  change.begin(); assert.deepEqual(host.state, { count: 3, nested: { values: [1, 2] } });
  new SetState(host, { count: 5 }).begin(); assert.deepEqual(host.state, { count: 5 });
});

test('SetState refuses lossy JSON at JavaScript boundaries and retains own prototype-sensitive keys', () => {
  const host = new Scene(new NullSink());
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const invalid of [{ n: NaN }, { n: Infinity }, { date: new Date() }, { fn: () => 1 }, { a: [undefined] }, { a: Array(1) }, cycle])
    assert.throws(() => new SetState(host, invalid), /SetState state/);
  const ownKey = JSON.parse('{"__proto__":{"safe":true},"count":1}');
  new SetState(host, ownKey).begin();
  assert.ok(Object.hasOwn(host.state, '__proto__'));
  assert.equal(Object.getPrototypeOf(host.state), Object.prototype);
});

test('SetState sequences state-derived views at the correct turn and leaves no drawable placeholder', async () => {
  class Demo extends Scene<{count: number}> {
    override state = { count: 0 };
    override async construct() {
      const readout = view(this, (s) => new StateReadout([['count', s.count]]), { place: 'left' }); this.add(readout);
      await this.step('updates');
      await this.play(new Succession([
        new SetState(this, { count: 3 }), readout.sync({ runTime: 0.5 }),
        new SetState(this, { count: 9 }), readout.sync({ runTime: 0.5 }),
      ]));
      this.state.count = Number(readout.current.values.count!.text);
      await this.step('result');
    }
  }
  for (const [time, expected] of [[0.25, 3], [0.75, 9]]) {
    const scene = await renderAt(Demo, time!, new SnapshotSink()); assert.equal(scene.state.count, expected);
  }
  const trace = await traceScene(Demo);
  assert.equal(trace.steps[0]!.after!.count, 9);
  const full = new Demo(new NullSink()); await full.run();
  assert.equal(full.mobjects.length, 1, 'only the readout remains');
});

test('SetState rejects simultaneous writers and a mismatched scene before any state changes', async () => {
  const a = new Scene<{count: number}>(new NullSink()), b = new Scene<{count: number}>(new NullSink());
  a.state = { count: 0 }; b.state = { count: 0 };
  await assert.rejects(a.play(new SetState(a, { count: 1 }), new SetState(a, { count: 2 })), /only once/);
  assert.equal(a.state.count, 0);
  await assert.rejects(a.play(new Succession([new SetState(a, { count: 3 }), new SetState(b, { count: 4 })])), /belongs to/);
  assert.equal(a.state.count, 0); assert.equal(b.state.count, 0);
});

test('extracted animations compose in nested schedules and preserve every seeked frame and trace', async () => {
  class Demo extends Scene {
    override async construct() {
      const bar = new Rectangle().shift([-3, 0]), token = new Dot(), route = new Line([0, 0], [3, 0]);
      const label = new Text('travel').shift([0, 2]);
      await this.step('effects');
      await this.play(new LaggedStart([
        new GrowFromEdge(bar, DOWN, { runTime: 0.4 }),
        new AnimationGroup([new PulseAlongPath(token, route, { runTime: 0.6 }), new FadeIn(label, { runTime: 0.6 })]),
      ]));
      await this.play(new SetState(this, { done: true }));
      await this.step('end'); await this.wait(0.1);
    }
  }
  const sink = new StringSink(), played = new Demo(sink); await played.run();
  for (let frame = 0; frame < sink.frames.length; frame++) {
    const snapshot = new SnapshotSink();
    await renderAt(Demo, frame / played.fps, snapshot);
    assert.equal(snapshot.svg, sink.frames[frame], `frame ${frame}`);
  }
  const fullTrace = new TraceSink(); await new Demo(fullTrace).run();
  assert.deepEqual((await traceScene(Demo)).steps, fullTrace.steps());
});

test('growth and pulse can resample arbitrary alpha order without accumulating geometry', () => {
  fc.assert(fc.property(
    fc.double({ min: 0.1, max: 5, noNaN: true }),
    fc.double({ min: -10, max: 10, noNaN: true }),
    fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 8 }),
    (width, shift, alphas) => {
      const box = new Rectangle({ width, height: 1 }).moveTo([shift, 0]);
      const grow = new GrowFromEdge(box, LEFT); grow.begin();
      const dot = new Dot(), pulse = new PulseAlongPath(dot, new Line([shift, 0], [shift + width, 0]), { fromCurrent: false }); pulse.begin();
      const scene = new Scene(new NullSink()).add(box, dot);
      grow.interpolate(0.5); pulse.interpolate(0.5); const middle = toSvgString(scene);
      for (const alpha of alphas) { grow.interpolate(alpha); pulse.interpolate(alpha); }
      grow.interpolate(0.5); pulse.interpolate(0.5);
      assert.equal(toSvgString(scene), middle);
      close(dot.center()[0], shift + width / 2);
    }), params(80));
});

test('Follow samples one value for several drawings: exact ends, linear between, start read when the play begins', async () => {
  const { Follow, Transform } = await import('../src/index.ts');
  const dot = new Dot({ radius: 0.1 }), bar = new Rectangle({ width: 1, height: 1 });
  dot.key = 'dot';
  const ids = [dot.id, bar.id];
  const seen: number[] = [];
  const draw = (v: number) => { seen.push(v); return [new Dot({ radius: 0.1 }).moveTo([v, 0]), new Rectangle({ width: 1, height: 1 }).moveTo([0, v / 2])]; };
  const a = new Follow({ from: 0.1, to: 0.7, draw }, { targets: [dot, bar], rateFunc: linear });
  assert.deepEqual(a.targets(), [dot, bar]);
  a.begin();
  for (const alpha of [0, 0.5, 1, 0.25, 1, 0]) {
    a.interpolate(alpha);
    const v = a.valueAt(alpha);
    close(dot.center()[0], v); close(bar.center()[1], v / 2);
  }
  // Each drawing is written into its target, which keeps its identity and key
  assert.deepEqual([dot.id, bar.id], ids);
  assert.equal(dot.key, 'dot');
  assert.equal(a.valueAt(0), 0.1); assert.equal(a.valueAt(1), 0.7);
  assert.equal(seen[0], 0.1, 'begin draws the start');
  // A function start is read at begin(): in a Succession the second leg starts where the first ended
  let value = 0;
  const log: number[] = [];
  const leg = (to: number) => new Follow({ from: () => value, to, draw: (v) => { value = v; log.push(v); return new Dot({ radius: 0.1 }).moveTo([v, 0]); } }, { targets: [dot], rateFunc: linear, runTime: 0.2 });
  const first = leg(2), second = leg(1);
  const scene = new Scene(new NullSink());
  scene.add(dot, bar);
  await scene.play(new Succession([first, second]));
  assert.equal(first.start, 0); assert.equal(second.start, 2); assert.equal(value, 1);
  assert.ok(log.every((v, i) => i === 0 || Math.abs(v - log[i - 1]!) < 0.5), 'no jump between the legs');
  // Invalid specs are refused before anything is drawn
  assert.throws(() => new Follow({ from: 0, to: NaN, draw }, { targets: [dot, bar] }), RangeError);
  assert.throws(() => new Follow({ from: Infinity, to: 1, draw }, { targets: [dot, bar] }), RangeError);
  assert.throws(() => new Follow({ from: 0, to: 1, draw }, { targets: [] }), TypeError);
  assert.throws(() => new Follow({ from: 0, to: 1, draw }, { targets: [{} as Mobject] }), TypeError);
  assert.throws(() => new Follow({ from: 0, to: 1, draw }, { targets: [dot, dot] }), TypeError);
  const bad = new Follow({ from: () => NaN, to: 1, draw }, { targets: [dot, bar] });
  assert.throws(() => bad.begin(), RangeError);
  // What draw returns must be one fresh picture per target, of the target's shape
  assert.throws(() => new Follow({ from: 0, to: 1, draw }, { targets: [dot] }).begin(), /2 pictures for 1 targets/);
  assert.throws(() => new Follow({ from: 0, to: 1, draw: () => dot }, { targets: [dot] }).begin(), /fresh mobjects/);
  const cell = new Group(new Rectangle(), new Text('a'));
  cell.children[1]!.key = 'cell:label';
  assert.throws(() => new Follow({ from: 0, to: 1, draw: () => new Group(new Rectangle()) }, { targets: [cell] }).begin(), /cell:label would be lost/);
  // One writer per mobject: play() refuses a Follow beside anything else that writes one of its targets
  await assert.rejects(() => scene.play(new Follow({ from: 0, to: 1, draw }, { targets: [dot, bar] }), new Transform(bar, bar.copy().shift([1, 0]))), /both animate/);
  await assert.rejects(() => scene.play(new Follow({ from: 0, to: 1, draw: (v) => new Dot().moveTo([v, 0]) }, { targets: [dot] }), new Follow({ from: 0, to: 1, draw: (v) => new Dot().moveTo([0, v]) }, { targets: [dot] })), /both animate/);
  await scene.play(new Follow({ from: 0, to: 1, draw: (v) => new Dot({ radius: 0.1 }).moveTo([v, 0]) }, { targets: [dot] }), new Transform(bar, bar.copy().shift([1, 0])), { runTime: 0.1 });
});

test('Follow admits its targets, removes them all as a remover, and seeks to the frame a full run renders', async () => {
  const { Follow } = await import('../src/index.ts');
  class Orbit extends Scene {
    override async construct(): Promise<void> {
      const dot = new Dot({ radius: 0.1 }).moveTo([2, 0]), radius = new Line([0, 0], [2, 0]), readout = new Text('0.00', { fontSize: 0.3 }).moveTo([0, -2.5]);
      this.add(new Circle({ radius: 2 }));
      // Not added beforehand: play() admits every target
      await this.step('sweep');
      await this.play(new Follow({
        from: 0, to: Math.PI,
        draw: (angle) => {
          const at: Vec = [2 * Math.cos(angle), 2 * Math.sin(angle)];
          // The readout grows a digit past 10 in other uses; a Text's glyphs carry no keys, so it may rebuild them
          return [new Dot({ radius: 0.1 }).moveTo(at), new Line([0, 0], at), new Text(angle.toFixed(angle > 3 ? 3 : 2), { fontSize: 0.3 }).moveTo([0, -2.5])];
        },
      }, { targets: [dot, radius, readout], runTime: 0.5, rateFunc: linear }));
      assert.ok(this.mobjects.includes(dot) && this.mobjects.includes(radius) && this.mobjects.includes(readout));
      await this.step('gone');
      await this.play(new Follow({ from: 1, to: 0, draw: (k) => [dot.copy().setStyle({ opacity: k }), readout.copy().setStyle({ opacity: k })] }, { targets: [dot, readout], runTime: 0.2, remover: true }));
      assert.ok(!this.mobjects.includes(dot) && !this.mobjects.includes(readout) && this.mobjects.includes(radius));
      await this.wait(0.1);
    }
  }
  const sink = new StringSink();
  const full = new Orbit(sink);
  await full.run();
  const fps = full.fps;
  for (const frame of [1, 3, Math.round(0.25 * fps), Math.round(0.5 * fps), sink.frames.length - 2]) {
    const snap = new SnapshotSink();
    const scene = await renderAt(Orbit, frame / fps, snap);
    assert.equal(snap.svg, sink.frames[Math.round(scene.time * scene.fps)], `frame ${frame}`);
  }
  // Mid-sweep the dot sits on the circle, where a morph between the two endpoint pictures would cut through its centre
  const mid = new SnapshotSink();
  const scene = await renderAt(Orbit, 0.25, mid);
  const dot = scene.mobjects.find((m) => m instanceof Dot)!;
  close(Math.hypot(dot.center()[0], dot.center()[1]), 2);
});
