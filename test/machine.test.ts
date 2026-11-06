// Machines: a model driven by events as an ordinary schedule, and rayner check's exploration of
// every state the events reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Text, Group, Rectangle, SetState, Machine, refuse, isRefusal, view, Transform, AnimationGroup, TransformMatching, matchByKey } from '../src/index.ts';
import { NullSink, StringSink, SnapshotSink, renderAt } from '../src/output.ts';
import { machinesOf, TraceSink, traceScene, loadFonts } from '../explain/testing.ts';
import type { Transition, View, ViewSync } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { exploreMachines } from '../tools/lib/explain-check.ts';
import { logStart } from '../app/embed-live.ts';

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

test('without an authored transition, the views morph by key, staged: what goes is gone by halfway, and what comes starts there', async () => {
  // The lamp's word is keyed: "lamp off" and "lamp dim" are different words, so the old fades out and the new fades in.
  const scene = new Scene<Lamp>(new NullSink());
  scene.state = { level: 0 };
  const lamp = view(scene, (st: Lamp) => Object.assign(new Group(
    Object.assign(new Rectangle({ width: 4, height: 1.2 }), { key: 'lamp:box' }),
    Object.assign(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), { key: 'lamp:word' }),
  ), { key: 'lamp' }));
  scene.add(lamp);
  const machine = new Machine<Lamp, 'UP' | 'OFF'>(scene, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [lamp] });
  const step = machine.send('UP');
  const sync = (step.animations[1] as AnimationGroup).animations[0] as ViewSync;
  assert.equal(sync.staged, true);
  scene.state = { level: 1 };
  sync.begin();
  const inner = sync.inner as TransformMatching;
  // A replaced word is not morphed glyph by glyph: its glyphs leave and the new word's come.
  assert.ok(inner.fadesOut.length > 0 && inner.fadesIn.length > 0);
  const seen = (rows: { sub: { style: { opacity: number } } }[]) => Math.max(...rows.map((r) => r.sub.style.opacity));
  sync.interpolate(0.25);
  assert.ok(seen(inner.fadesOut) > 0 && seen(inner.fadesIn) === 0, 'a quarter through: the old word fading, the new one not yet shown');
  sync.interpolate(0.5);
  assert.ok(seen(inner.fadesOut) === 0 && seen(inner.fadesIn) === 0, 'halfway: neither word, so they never overlap');
  sync.interpolate(0.75);
  assert.ok(seen(inner.fadesOut) === 0 && seen(inner.fadesIn) > 0, 'three quarters: the new word coming');
  sync.finish();
  assert.deepEqual(lamp.texts, ['lamp dim']);
  // Unstaged (a view's own sync), both fade at once.
  const plain = new TransformMatching(lamp.current, lamp.placed({ level: 2 }), { key: matchByKey({ text: 'whole' }), replace: false });
  plain.begin();
  plain.interpolate(0.25);
  assert.ok(seen(plain.fadesOut) > 0 && seen(plain.fadesIn) > 0);
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
/** A lamp whose UP has an authored transition, given the transition and the lamp's view. */
function litLamp(transition: (t: Transition<Lamp, 'UP' | 'OFF'>, lamp: View) => import('../src/index.ts').Animation, invariant = false) {
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
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next: nextUp, views: [picture], transition: { UP: (t) => transition(t, picture) } });
      await this.step('press');
      await this.play(this.machine.replay(['UP', 'UP', 'OFF']));
    }
  };
}
/** UP morphs the picture into the picture of the state it reaches. */
const morphUp = (t: Transition<Lamp, 'UP' | 'OFF'>, lamp: View) => new Transform(lamp.current, t.target(lamp));

test('a refused event: next says undefined, exploration does not follow it, and sending it is refused before anything plays', async () => {
  const ran = await new (litLamp(morphUp))(new NullSink()).run();
  assert.equal(ran.machine.after({ level: 2 }, 'UP'), undefined);
  assert.deepEqual(ran.machine.outcome({ level: 2 }, 'UP'), { refused: null });
  assert.deepEqual(ran.machine.reachable().map((r) => r.state.level), [0, 1, 2]);
  assert.throws(() => ran.machine.send('UP', { level: 2 }), /UP is refused in \{"level":2\}$/);
});

test('a model refuses with its reason: refuse(reason) where next refuses, and outcome, send and exploration treat it as a refusal', () => {
  const scene = new Scene(new NullSink());
  // The lamp's own rule, said where it is decided.
  const lamp = new Machine<Lamp, 'UP' | 'OFF'>(scene, {
    start: { level: 0 }, events: ['UP', 'OFF'], views: [],
    next: (s, e) => (e === 'UP' && s.level === 2 ? refuse(`the lamp is ${LEVELS[s.level]} already, its brightest`) : next(s, e)),
  });
  assert.deepEqual(lamp.outcome({ level: 2 }, 'UP'), { refused: 'the lamp is bright already, its brightest' });
  assert.deepEqual(lamp.model({ level: 2 }, 'UP'), { refused: 'the lamp is bright already, its brightest' });
  assert.deepEqual(lamp.outcome({ level: 1 }, 'UP'), { next: { level: 2 } });
  assert.equal(lamp.after({ level: 2 }, 'UP'), undefined);
  assert.deepEqual(lamp.reachable().map((r) => r.state.level), [0, 1, 2]);
  assert.throws(() => lamp.send('UP', { level: 2 }), /UP is refused in \{"level":2\}: the lamp is bright already, its brightest/);
  // A refusal is a value of its own, recognised across copies of the library; its reason must be words.
  const r = refuse('no');
  assert.ok(isRefusal(r) && !isRefusal({ reason: 'no' }) && !isRefusal(undefined) && !isRefusal({ level: 0 }));
  assert.ok(Object.isFrozen(r));
  assert.throws(() => refuse(' '), /reason must be words/);
  // One way to say why: a separate why(state, event) is refused, and says what to write instead.
  assert.throws(() => new Machine(scene, { start: {}, events: ['A'], next: () => undefined, views: [], why: () => 'no' } as never), /return refuse\(reason\) from next/);
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
  const ran = await new (litLamp((t, lamp) => new Transform(lamp.current, t.target(lamp).copy().shift([2, 0]))))(new NullSink()).run();
  const [explored] = await exploreMachines(ran);
  // Each misplaced landing also moves the view for good, so a later state can drift off the stage.
  for (const named of ['UP', 'after UP, UP'])
    assert.ok(explored!.problems.includes(`${named}: the transition ends somewhere other than the picture of the state it reaches`), JSON.stringify(explored!.problems));
});

test('deliberate defect: a transition that breaks an invariant on the way fails, though it lands', async () => {
  // It swings the picture off screen and back, ending where the model says.
  const swing = (t: Transition<Lamp, 'UP' | 'OFF'>, v: View) => {
    const target = t.target(v);
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

test('exploration checks a machine on the stage where it last played, not the stage the run ends with', async () => {
  class Cleared extends Scene<Lamp> {
    override state = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => {
        const word = new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 });
        word.key = 'lamp:word';
        return Object.assign(new Group(new Rectangle({ width: 4, height: 1.2 }), word), { key: 'lamp' });
      });
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      const machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [picture], runTime: 0.3 });
      await this.step('press', { caption: 'Press the switch.' });
      await this.play(machine.replay(['UP', 'UP']));
      // A later step clears the lamp away and shows something else.
      await this.step('later', { caption: 'Something else.' });
      await s.clear();
      await s.enter(new Text('the end', { fontSize: 0.5 }), { describe: 'The end' });
    }
  }
  const ran = await new Cleared(new NullSink()).run();
  assert.equal(machinesOf(ran)[0]!.lastPlayedIn, 'press');
  // On the final stage the lamp is gone: exploration says so rather than checking nothing.
  const [blind] = await exploreMachines(ran);
  assert.match(blind!.problems[0]!, /not on the stage where it last played/);
  // On the stage of the step where it played, every state is checked and passes.
  const trace = await traceScene(Cleared);
  const [explored] = await exploreMachines(ran, async (step) => {
    const s = trace.steps.find((x) => x.step === step)!;
    return renderAt(Cleared, Math.max(s.t0, s.t1! - 0.5 / trace.fps), new NullSink());
  });
  assert.deepEqual(explored!.problems, []);
  assert.equal(explored!.states, 3);
});

test('a transition finds each view by the view itself, and refuses a view the machine does not have', async () => {
  class Two extends Scene<Lamp> {
    override state = { level: 0 };
    override async construct() {
      const lamp = view(this, (st: Lamp) => Object.assign(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), { key: 'lamp' }));
      const meter = view(this, (st: Lamp) => Object.assign(new Text(`level ${st.level}`, { fontSize: 0.5 }).moveTo([0, -2]), { key: 'meter' }));
      const stranger = view(this, () => new Text('elsewhere'));
      this.add(lamp, meter);
      let asked: unknown = null;
      // The views are listed meter first; the transition still gets the lamp's own target.
      const machine = new Machine<Lamp, 'UP' | 'OFF'>(this, {
        start: { level: 0 }, events: ['UP', 'OFF'], next, views: [meter, lamp],
        transition: {
          UP: (t) => {
            assert.match((t.target(lamp) as Text).text, /^lamp /);
            try { t.target(stranger); } catch (e) { asked = (e as Error).message; }
            return t.choreograph(lamp).rest();
          },
        },
      });
      await this.step('press');
      await this.play(machine.send('UP'));
      assert.match(String(asked), /a view this machine does not have/);
    }
  }
  await new Two(new NullSink()).run();
});

test('a bound stops the story where the model would go on; check fails a bound the model refuses anyway', async () => {
  // UP is refused at bright: that is the lamp's rule, and the model says so.
  const nextUp = (s: Lamp, e: 'UP' | 'OFF') => (e === 'UP' && s.level === 2 ? refuse(`the lamp is already ${LEVELS[s.level]}`) : next(s, e));
  const bounded = (bound: (s: Lamp, e: 'UP' | 'OFF') => string | undefined) => class extends Scene<Lamp> {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => Object.assign(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), { key: 'lamp' }));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next: nextUp, views: [picture], bound });
      await this.step('press');
      await this.play(this.machine.replay(['UP']));
    }
  };
  // This story never turns the lamp past dim, though the lamp could go brighter.
  const Story = bounded((st, e) => (e === 'UP' && st.level >= 1 ? 'This story stops at dim' : undefined));
  const story = await new Story(new NullSink()).run();
  assert.deepEqual(story.machine.outcome({ level: 1 }, 'UP'), { beyond: 'This story stops at dim' });
  assert.deepEqual(story.machine.outcome({ level: 0 }, 'UP'), { next: { level: 1 } });
  assert.deepEqual(story.machine.reachable().map((r) => r.state.level), [0, 1]);
  assert.throws(() => story.machine.send('UP', { level: 1 }), /UP is beyond the story in \{"level":1\}: This story stops at dim/);
  assert.deepEqual((await exploreMachines(story))[0]!.problems, []);
  // A bound placed where the lamp refuses anyway (at bright) is a refusal mislabelled.
  const Wrong = bounded((st, e) => (e === 'UP' && st.level === 2 ? 'This story stops at bright' : undefined));
  const wrong = await new Wrong(new NullSink()).run();
  assert.ok((await exploreMachines(wrong))[0]!.problems.some((p) => /after UP, UP, UP: the bound says "This story stops at bright", but the model refuses it anyway/.test(p)));
  // The model's own refusal carries its reason.
  assert.deepEqual(wrong.machine.outcome({ level: 2 }, 'UP'), { beyond: 'This story stops at bright' });
  const free = bounded(() => undefined);
  const lamp = await new free(new NullSink()).run();
  assert.deepEqual(lamp.machine.outcome({ level: 2 }, 'UP'), { refused: 'the lamp is already bright' });
});

test('end finishes the story at a state: the model\'s moves from it are beyond the story, its refusals stay refusals', async () => {
  // UP is refused at bright; this story ends once the lamp is bright.
  const nextUp = (s: Lamp, e: 'UP' | 'OFF') => (e === 'UP' && s.level === 2 ? refuse(`the lamp is already ${LEVELS[s.level]}`) : next(s, e));
  class Ends extends Scene<Lamp> {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => Object.assign(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), { key: 'lamp' }));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next: nextUp, views: [picture],
        end: (st) => (st.level === 2 ? 'the lamp is bright' : undefined) });
      await this.step('press');
      await this.play(this.machine.replay(['UP', 'UP']));
    }
  }
  const ends = await new Ends(new NullSink()).run();
  assert.deepEqual(ends.machine.outcome({ level: 2 }, 'OFF'), { beyond: 'the lamp is bright' });
  assert.deepEqual(ends.machine.outcome({ level: 2 }, 'UP'), { refused: 'the lamp is already bright' });
  assert.deepEqual(ends.machine.outcome({ level: 1 }, 'UP'), { next: { level: 2 } });
  assert.deepEqual(ends.machine.reachable().map((r) => r.state.level), [0, 1, 2]);
  assert.deepEqual((await exploreMachines(ends))[0]!.problems, []);
  // A live step that ends finished starts the reader's events from the machine's start.
  assert.deepEqual(logStart(ends.machine as never, { level: 2 }), { from: 'start', state: { level: 0 } });
  assert.throws(() => new Machine<Lamp, 'UP' | 'OFF'>(ends, { start: { level: 0 }, events: ['UP'], next, views: [], end: 'bright' as never }), /end is a function of the state/);
});

test('exploration also walks the states a reader reaches from the live step, not only from the start', async () => {
  // The machine starts bright, where UP is refused; the scene plays it from off, so the step rests at dim,
  // a state the start never reaches. Dim's label is too small to read: only the walk from the step finds it.
  class FromStep extends Scene<Lamp> {
    override state = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => Object.assign(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: st.level === 1 ? 0.08 : 0.5 }), { key: 'lamp' }));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      const machine = new Machine<Lamp, 'UP'>(this, {
        start: { level: 2 }, events: ['UP'], views: [picture],
        next: (st) => (st.level === 2 ? undefined : { level: st.level + 1 }),
      });
      await this.step('press', { caption: 'Press it.' });
      await this.play(machine.replay(['UP'], { level: 0 }));
    }
  }
  const ran = await new FromStep(new NullSink()).run();
  const trace = await traceScene(FromStep);
  const stageOf = async (step: string) => {
    const s = trace.steps.find((x) => x.step === step)!;
    return renderAt(FromStep, Math.max(s.t0, s.t1! - 0.5 / trace.fps), new NullSink());
  };
  const [explored] = await exploreMachines(ran, stageOf);
  assert.ok(explored!.problems.some((p) => /^from the state at "press", at the start: “lamp dim” is .* px/.test(p)), JSON.stringify(explored!.problems));
});
