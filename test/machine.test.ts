// Machines: a model driven by events as an ordinary schedule, and rayner check's exploration of
// every state the events reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Group, Rectangle, SetState, Machine, machinesOf, view, NullSink, StringSink, SnapshotSink, TraceSink, renderAt, traceScene, loadFonts, Transform } from '../src/index.ts';
import type { Transition, View } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { exploreMachines } from '../tools/lib/explain-check.ts';

await loadFonts();

type Lamp = { level: number };
const LEVELS = ['off', 'dim', 'bright'] as const;
const next = (s: Lamp, e: 'UP' | 'OFF'): Lamp => ({ level: e === 'OFF' ? 0 : Math.min(2, s.level + 1) });

/** A lamp of three levels as a machine; `blind` draws the same picture whatever the level. */
function lampScene(blind = false, size = 0.5) {
  return class LampScene extends Scene<Lamp> {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => {
        const word = new Text(blind ? 'lamp' : `lamp ${LEVELS[st.level]}`, { fontSize: st.level === 2 ? size : 0.5 });
        word.key = 'lamp:word';
        const g = new Group(new Rectangle({ width: 4, height: 1.2 }), word);
        g.key = 'lamp';
        return g;
      });
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [picture], runTime: 0.3 });
      await this.step('press');
      await this.play(this.machine.replay(['UP', 'UP', 'UP', 'OFF', 'UP']));
      await this.wait(0.2);
    }
  };
}

test('SetState takes a model step: a function of a copy of the state when it begins, recorded with its event', async () => {
  const scene = await new (class extends Scene<{ n: number }> {
    override state = { n: 1 };
    override async construct() {
      await this.step('a');
      const steps: number[] = [];
      await this.play(new SetState(this, (s) => { steps.push(s.n); (s as { n: number }).n = 99; return { n: s.n === 99 ? 2 : -1 }; }, { event: 'TICK' }));
      // The function got a copy: writing to it did not touch the scene's state
      assert.deepEqual(steps, [1]);
      assert.deepEqual(this.state, { n: 2 });
    }
  })(new NullSink()).run();
  assert.deepEqual(scene.steps[0]!.evidence, [{ kind: 'event', event: 'TICK' }]);
  assert.throws(() => new SetState(new Scene(new NullSink()), { n: 1 }, { event: '' }), TypeError);
});

test('a machine replays events through the model as one schedule: state, evidence, seeking and trace follow the model', async () => {
  const Lamp = lampScene();
  const ran = await new Lamp(new NullSink()).run();
  // UP UP UP OFF UP from off: dim, bright, bright (capped), off, dim
  assert.deepEqual(ran.state, { level: 1 });
  assert.deepEqual(ran.steps[0]!.evidence!.filter((e) => e.kind === 'event').map((e) => e.event), ['UP', 'UP', 'UP', 'OFF', 'UP']);
  // Each event's view sync recorded what its keyed morph paired, after the event
  const kinds = ran.steps[0]!.evidence!.map((e) => e.kind);
  assert.equal(kinds[0], 'event');
  assert.ok(kinds.includes('match'));
  assert.deepEqual(machinesOf(ran), [ran.machine]);
  // A machine is an ordinary play: seeking renders the frame a full run renders, and skipped traces equal played ones
  const full = new StringSink();
  await new Lamp(full).run();
  for (const t of [0.35, 0.8, 1.4]) {
    const snap = new SnapshotSink();
    const at = await renderAt(Lamp, t, snap);
    assert.equal(snap.svg, full.frames[Math.round(at.time * at.fps)], `t = ${t}`);
  }
  const fullTrace = new TraceSink();
  await new Lamp(fullTrace).run();
  assert.deepEqual((await traceScene(Lamp)).steps, fullTrace.steps());
  assert.throws(() => ran.machine.send('DOWN' as 'UP'), RangeError);
  assert.throws(() => new Machine(ran, { start: { level: 0 }, events: [], next, views: [] }), TypeError);
  // A picture that closes over variables outside the state cannot be redrawn for an explored state
  assert.throws(() => new Machine(ran, { start: { level: 0 }, events: ['UP', 'UP'], next, views: [] }), TypeError);
});

test('reachable states are found breadth first, each with its shortest events, up to the limit', async () => {
  const ran = await new (lampScene())(new NullSink()).run();
  assert.deepEqual(ran.machine.reachable(), [
    { state: { level: 0 }, path: [] },
    { state: { level: 1 }, path: ['UP'] },
    { state: { level: 2 }, path: ['UP', 'UP'] },
  ]);
  const capped = new Machine<Lamp, 'UP' | 'OFF'>(ran, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [], limit: 2 });
  assert.equal(capped.reachable().length, 2);
});

test('rayner check draws every reachable state: a picture that cannot tell two states apart fails, named by its shortest events', async () => {
  const good = await exploreMachines(await new (lampScene())(new NullSink()).run());
  assert.deepEqual(good, [{ events: ['UP', 'OFF'], states: 3, sampled: false, problems: [] }]);
  const blind = await exploreMachines(await new (lampScene(true))(new NullSink()).run());
  assert.deepEqual(blind[0]!.problems, [
    'after UP: the picture is described exactly as at the start, a different state',
    'after UP, UP: the picture is described exactly as at the start, a different state',
  ]);
});

test('rayner check measures every label an explored state shows: one too small to read fails, named by its shortest events', async () => {
  const [lamp] = await exploreMachines(await new (lampScene(false, 0.12))(new NullSink()).run());
  assert.equal(lamp!.problems.length, 1, JSON.stringify(lamp!.problems));
  assert.match(lamp!.problems[0]!, /^after UP, UP: “lamp bright” is \d+(\.\d)? px at a 1280 px stage, under 14$/);
});

/** The lamp with an authored transition for UP, and (optionally) an invariant on the box. */
function litLamp(transition: (t: Transition<Lamp, 'UP' | 'OFF'>) => import('../src/index.ts').Animation, invariant = false) {
  const nextUp = (s: Lamp, e: 'UP' | 'OFF'): Lamp | undefined => (e === 'UP' && s.level === 2 ? undefined : next(s, e));
  return class LitLamp extends Scene<Lamp> {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => {
        const word = new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 });
        word.key = 'lamp:word';
        const box = new Rectangle({ width: 4, height: 1.2 });
        box.key = 'lamp:box';
        const g = new Group(box, word);
        g.key = 'lamp';
        return g;
      });
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      if (invariant) this.addInvariant('the box stays on screen', (scene) => {
        const b = scene.find('lamp:box')?.box();
        if (!b) return;
        return b[0] >= -8 && b[2] <= 8 ? true : `the box spans ${b[0].toFixed(2)} to ${b[2].toFixed(2)}`;
      });
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next: nextUp, views: [picture], transition: { UP: transition } });
      await this.step('press');
      await this.play(this.machine.replay(['UP', 'UP', 'OFF']));
    }
  };
}
/** UP morphs the picture into the picture of the state it reaches. */
const morphUp = ({ views, targets }: Transition<Lamp, 'UP' | 'OFF'>) => new Transform((views[0] as View).current, targets[0]!);

test('a refused event: next says undefined, exploration does not follow it, and sending it is refused before anything plays', async () => {
  const ran = await new (litLamp(morphUp))(new NullSink()).run();
  assert.equal(ran.machine.after({ level: 2 }, 'UP'), undefined);
  assert.deepEqual(ran.machine.reachable().map((r) => r.state.level), [0, 1, 2]);
  assert.throws(() => ran.machine.send('UP', { level: 2 }), /UP is refused in \{"level":2\}/);
});

test('a schedule built for one state refuses to play from another', async () => {
  class Stale extends Scene<Lamp> {
    override state = { level: 0 };
    override async construct() {
      const picture = view(this, (st: Lamp) => new Text(`lamp ${LEVELS[st.level]}`));
      this.add(picture);
      const machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [picture] });
      const built = machine.send('UP');
      this.state = { level: 2 };
      await this.step('stale');
      await this.play(built);
    }
  }
  await assert.rejects(new Stale(new NullSink()).run(), /UP was built for \{"level":0\} but plays from \{"level":2\}/);
});

test('an authored transition plays, the views land on the state it reaches, and rayner check plays every reachable one', async () => {
  const ran = await new (litLamp(morphUp, true))(new NullSink()).run();
  assert.deepEqual(ran.state, { level: 0 });
  assert.deepEqual(ran.steps[0]!.evidence!.filter((e) => e.kind === 'event').map((e) => e.event), ['UP', 'UP', 'OFF']);
  const [explored] = await exploreMachines(ran);
  assert.deepEqual(explored!.problems, []);
});

test('deliberate defect: a transition that ends somewhere else fails, named by its shortest events and its event', async () => {
  // It morphs to the right picture two units to the right: the landing would leave the view there.
  const ran = await new (litLamp(({ views, targets }) => new Transform((views[0] as View).current, targets[0]!.copy().shift([2, 0]))))(new NullSink()).run();
  const [explored] = await exploreMachines(ran);
  // Each misplaced landing also moves the view for good, so a later state can drift off the stage.
  for (const named of ['UP', 'after UP, UP'])
    assert.ok(explored!.problems.includes(`${named}: the transition ends somewhere other than the picture of the state it reaches`), JSON.stringify(explored!.problems));
});

test('deliberate defect: a transition that breaks an invariant on the way fails, though it lands', async () => {
  // It swings the picture off screen and back, ending where the model says.
  const swing = ({ views, targets }: Transition<Lamp, 'UP' | 'OFF'>) => {
    const v = views[0] as View, target = targets[0]!;
    return new Transform(v.current, target, { pathFunc: (a, b, t) => a.map((x, i) => x + (b[i]! - x) * t + (i === 0 ? 30 * Math.sin(Math.PI * t) : 0)) as typeof a });
  };
  const [explored] = await exploreMachines(await new (litLamp(swing, true))(new NullSink()).run());
  assert.ok(explored!.problems.some((p) => /^UP: the invariant "the box stays on screen" fails 50% through the transition/.test(p)), JSON.stringify(explored!.problems));
});

test('a machine plays under one shown: it records it, refuses another, and exploration draws its states under it', async () => {
  class Shown extends Scene<Lamp> {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state = { level: 0 };
    override async construct() {
      const s = stage(this);
      // Which room the lamp is in is what is shown, not part of the lamp's model.
      const picture = view(this, (st: Lamp, shown) => {
        const word = new Text(`${String(shown.room ?? 'hall')} lamp ${LEVELS[st.level]}`, { fontSize: 0.5 });
        word.key = 'lamp:word';
        return Object.assign(new Group(new Rectangle({ width: 6, height: 1.2 }), word), { key: 'lamp' });
      });
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [picture], runTime: 0.3 });
      this.shown = { room: 'kitchen' };
      await this.step('press');
      await this.play(this.machine.replay(['UP', 'UP']));
      // Afterwards the scene shows another room; the machine's states were seen in the kitchen.
      this.shown = { room: 'study' };
      await this.play(picture.sync({ runTime: 0.2 }));
      await assert.rejects(this.play(this.machine.send('OFF')), /plays under shown \{"room":"study"\}, but this machine played under \{"room":"kitchen"\}/);
    }
  }
  const scene = await new Shown(new NullSink()).run() as Shown;
  assert.deepEqual(scene.machine.playedUnder, { room: 'kitchen' });
  const [explored] = await exploreMachines(scene);
  assert.deepEqual(explored!.problems, []);
  assert.equal(explored!.states, 3);
  // The states were drawn in the kitchen, where the machine played, not the study the run ended in.
  assert.match(scene.machine.spec.views[0]!.texts.join(' '), /kitchen lamp/);
  // Exploration put back what the run left shown.
  assert.deepEqual(scene.shown, { room: 'study' });
});
