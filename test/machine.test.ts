// Machines: a model driven by events as an ordinary schedule, and rayner check's exploration of
// every state the events reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Group, Rectangle, SetState, Machine, machinesOf, view, NullSink, StringSink, SnapshotSink, TraceSink, renderAt, traceScene, loadFonts } from '../src/index.ts';
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
      s.keep(picture, { describe: () => picture.shown.join(' ') });
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
