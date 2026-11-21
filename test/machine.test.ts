// Machines: a model driven by events as an ordinary schedule, and rayner check's exploration of
// every state the events reach.
import { test } from 'node:test';
import type { Transition, View } from '../explain/index.ts';
import { ViewSync } from '../explain/view.ts';
import assert from 'node:assert/strict';
import { Scene, Text, Group, Rectangle, Transform, Animation, AnimationGroup, Succession, keyed } from '../src/index.ts';
import type { Mobject } from '../src/index.ts';
import { NullSink, renderFrame } from '../src/timeline.ts';
import { StringSink } from '../src/svg.ts';
import { SnapshotSink } from '../src/svg.ts';
import { TraceSink, traceScene, loadFonts } from '../explain/testing.ts';
import { machinesOf } from '../explain/internal.ts';
import { stage, having, Machine, refuse, isRefusal, view } from '../explain/index.ts';
import { SetState } from '../explain/state.ts';
import { exploreMachines } from '../tools/lib/explain-check.ts';
import { decodeLog, encodeLog } from '../app/embed-live.ts';
import { liveBase, liveSteps, logStart, runLive } from '../explain/live.ts';
import { whenReady, beginAnimation, interpolateAnimation, finishAnimation, matchRows } from '../src/animation.ts';
import { describeScenario } from '../explain/describe.ts';

await loadFonts();

test('transient machine results reach views and traces without multiplying durable states', async () => {
  class Responses extends Scene {
    override state = {on: true};
    override shown: {guide: string; result?: {status: number}} = {guide: 'keep'};
    override async construct() {
      const s = stage(this, {heading: false});
      await this.step('responses');
      const picture = view(this, (st, sh) => new Group(keyed(new Text(`${st.on ? 'On' : 'Off'}: ${sh.result?.status ?? 'Ready'}`, {fontSize: 0.6}), 'response')));
      s.keep(picture);
      const machine = new Machine(this, {
        start: {on: true}, events: ['ok', 'denied', 'clear'] as const,
        next: st => ({...st}), views: [picture], runTime: 0.2,
        result: ({event}) => event === 'clear' ? undefined : {status: event === 'ok' ? 200 : 403},
      });
      await machine.sendSequence(['ok', 'denied']);
      assert.deepEqual(this.state, {on: true});
      assert.deepEqual(this.shown, {guide: 'keep', result: {status: 403}});
      assert.deepEqual(picture.texts, ['On: 403']);
      assert.equal(machine.reachable().length, 1);
      await machine.send('clear');
      assert.deepEqual(this.shown, {guide: 'keep'});
      assert.deepEqual(picture.texts, ['On: Ready']);
    }
  }
  const scene = await new Responses(new NullSink()).run();
  const explored = await exploreMachines(scene, Responses);
  assert.equal(explored[0]!.states, 1);
  assert.deepEqual(explored[0]!.problems, []);
});

type Lamp = { level: number };
class LampHost extends Scene { override state: Lamp = { level: 0 }; }
const LEVELS = ['off', 'dim', 'bright'] as const;
const next = (s: Lamp, e: 'UP' | 'OFF'): Lamp => ({ level: e === 'OFF' ? 0 : Math.min(2, s.level + 1) });

test('a machine refuses invalid JSON in start at construction, with its field path', () => {
  const scene = new Scene(new NullSink());
  const machine = (value: unknown) => new Machine(scene, { start: { value }, events: ['tick'], next: () => ({}), views: [] });
  for (const value of [NaN, Infinity, new Date(0), () => 1]) {
    assert.throws(() => machine(value), /^TypeError: new Machine\(\): start\.value must /);
  }
  assert.throws(() => machine(Array(1)), /^TypeError: new Machine\(\): start\.value\[0\] must not be an array hole/);
  assert.deepEqual(machinesOf(scene), [], 'an invalid model never registers');
  const value = { optional: undefined, payload: [1] };
  const valid = machine(value);
  value.payload[0] = 9;
  assert.deepEqual(valid.spec.start, { value: { payload: [1] } });
  assert.throws(() => valid.send('tick', { value: NaN }), /^TypeError: machine\.send\(\): from\.value must /);
});

test('a machine plays prototype-named events through their own transition or the default', async () => {
  const names = ['constructor', 'valueOf', '__proto__'];
  const authored: string[] = [];
  const scene = await new (class extends Scene {
    override state: Lamp = { level: 0 };
    override async construct() {
      await this.step('press');
      const machine = new Machine<Lamp, string>(this, {
        start: this.state, events: names, views: [], next: s => ({ level: s.level + 1 }),
        transition: { ['__proto__']: t => { authored.push(t.event); return new Animation(new Group(), {runTime: 0.2}); } },
      });
      await machine.sendSequence(names);
    }
  })(new NullSink()).run();
  assert.deepEqual(authored, ['__proto__']);
  assert.equal(scene.state.level, names.length);
  assert.deepEqual(scene.steps[0]!.evidence!.filter(e => e.kind === 'event').map(e => e.event), names);
});

/** A lamp of three levels as a machine; `blind` draws the same picture whatever the level. */
function lampScene(blind = false, size = 0.5) {
  return class LampScene extends Scene {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => {
        const word = new Text(blind ? 'lamp' : `lamp ${LEVELS[st.level]}`, { fontSize: st.level === 2 ? size : 0.5 });
        keyed(word, 'lamp:word');
        const g = new Group(new Rectangle({ width: 4, height: 1.2 }), word);
        keyed(g, 'lamp');
        return g;
      });
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [picture], runTime: 0.3 });
      await this.step('press');
      await this.play(this.machine.sendSequence(['UP', 'UP', 'UP', 'OFF', 'UP']));
      await this.wait(0.2);
    }
  };
}

test('SetState takes a model step: a function of a copy of the state when it begins, recorded with its event', async () => {
  const scene = await new (class extends Scene {
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
  for (const frame of [11, 24, 42]) {
    const snap = new SnapshotSink();
    await renderFrame(Lamp, frame, snap);
    assert.equal(snap.svg, full.frames[frame], `frame ${frame}`);
  }
  const fullTrace = new TraceSink({ skipUntil: 0 });
  await new Lamp(fullTrace).run();
  assert.deepEqual((await traceScene(Lamp)).steps, fullTrace.steps());
  assert.throws(() => ran.machine.send('DOWN' as 'UP'), RangeError);
  assert.throws(() => new Machine(ran, { start: { level: 0 }, events: [], next, views: [] }), /^RangeError: new Machine\(\): it needs at least one event/);
  // A picture that closes over variables outside the state cannot be redrawn for an explored state
  assert.throws(() => new Machine(ran, { start: { level: 0 }, events: ['UP', 'UP'], next, views: [] }), /^Error: new Machine\(\): an event is listed twice/);
});

test('without an authored transition, the views morph by key, staged: what goes is gone by halfway, and what comes starts there', async () => {
  // The lamp's word is keyed: "lamp off" and "lamp dim" are different words, so the old fades out and the new fades in.
  const scene = new LampHost(new NullSink());
  const lamp = view(scene, (st: Lamp) => keyed(new Group(
    keyed(new Rectangle({ width: 4, height: 1.2 }), 'lamp:box'),
    keyed(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), 'lamp:word'),
  ), 'lamp'));
  scene.add(lamp);
  const machine = new Machine<Lamp, 'UP' | 'OFF'>(scene, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [lamp] });
  // The morph machine.send plays for each view: the view's sync with the machine's match.
  const sync = new ViewSync(lamp, { match: machine.spec.match, runTime: 0.6 });
  assert.equal(sync.staged, true);
  scene.state = { level: 1 };
  beginAnimation(sync);
  const inner = sync.inner as Transform;
  // A replaced word is not morphed glyph by glyph: its glyphs leave and the new word's come.
  assert.ok(inner[matchRows].fadesOut.length > 0 && inner[matchRows].fadesIn.length > 0);
  const seen = (rows: { sub: { style: { opacity: number } } }[]) => Math.max(...rows.map((r) => r.sub.style.opacity));
  interpolateAnimation(sync, 0.25);
  assert.ok(seen(inner[matchRows].fadesOut) > 0 && seen(inner[matchRows].fadesIn) === 0, 'a quarter through: the old word fading, the new one not yet shown');
  interpolateAnimation(sync, 0.5);
  assert.ok(seen(inner[matchRows].fadesOut) === 0 && seen(inner[matchRows].fadesIn) === 0, 'halfway: neither word, so they never overlap');
  interpolateAnimation(sync, 0.75);
  assert.ok(seen(inner[matchRows].fadesOut) === 0 && seen(inner[matchRows].fadesIn) > 0, 'three quarters: the new word coming');
  finishAnimation(sync);
  assert.deepEqual(lamp.texts, ['lamp dim']);
  // Unstaged (`staged: false`), both fade at once.
  const plain = new Transform(lamp.current, lamp.placed({ level: 2 }), { match: { by: 'key', text: 'whole' }, replace: false });
  beginAnimation(plain);
  interpolateAnimation(plain, 0.25);
  assert.ok(seen(plain[matchRows].fadesOut) > 0 && seen(plain[matchRows].fadesIn) > 0);
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
  // A state built with its keys in another order is the same state, reached once.
  type Pair = { a: number; b: number };
  const flip = new Machine<Pair, 'FLIP' | 'BACK'>(Object.assign(new Scene(new NullSink()), { state: { a: 0, b: 0 } }), {
    start: { a: 0, b: 0 }, events: ['FLIP', 'BACK'], views: [],
    next: (s, e) => (e === 'FLIP' ? { b: 1 - s.b, a: s.a } : { a: s.a, b: 1 - s.b }),
  });
  assert.deepEqual(flip.reachable().map((r) => r.path), [[], ['FLIP']]);
});

test('machine exploration distinguishes a closed graph exactly at its limit from an equally sized truncated prefix', () => {
  const scene = new LampHost(new NullSink());
  const closed = new Machine(scene, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [], limit: 3 });
  assert.deepEqual(closed.explore(), { states: [
    { state: { level: 0 }, path: [] },
    { state: { level: 1 }, path: ['UP'] },
    { state: { level: 2 }, path: ['UP', 'UP'] },
  ], complete: true });
  const growing = new Machine(scene, { start: { level: 0 }, events: ['UP'], next: (s) => ({ level: s.level + 1 }), views: [], limit: 3 });
  assert.deepEqual(growing.reachable(), closed.reachable(), 'identical retained states do not imply identical coverage');
  assert.equal(growing.explore().complete, false);
  const singleton = new Machine(scene, { start: { level: 0 }, events: ['STAY'], next: (s) => s, views: [], limit: 1 });
  assert.deepEqual(singleton.explore(), { states: [{ state: { level: 0 }, path: [] }], complete: true });
});

test('Machine rejects invalid exploration limits at JavaScript boundaries before registration', () => {
  const scene = new LampHost(new NullSink());
  for (const limit of [0, -1, 1.5, Infinity, -Infinity, NaN, '3', new Number(3), null, {}]) {
    assert.throws(() => new Machine(scene, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [], limit: limit as number }),
      /^RangeError: new Machine\(\): limit must be a positive finite integer$/);
    assert.equal(machinesOf(scene).length, 0);
  }
  const defaulted = new Machine(scene, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [], limit: undefined });
  assert.equal(defaulted.spec.limit, 256);
});

test('Machine rejects a same-shaped view of another scene before it can read the wrong state', () => {
  const left = new LampHost(new NullSink()), right = new LampHost(new NullSink());
  const foreign = view(left, (s) => new Rectangle({ width: 1 + s.level, height: 1 }));
  assert.throws(() => new Machine(right, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [foreign] }),
    /^RangeError: new Machine\(\): every view must belong to this scene/);
  assert.equal(machinesOf(right).length, 0);
  const own = view(right, (s) => new Rectangle({ width: 1 + s.level, height: 1 }));
  assert.doesNotThrow(() => new Machine(right, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [own] }));
});

/** The start is either absorbing, or the first state of the same chain as the live origin. */
function originScene(limit: number, absorbingStart: boolean) {
  return class Origins extends Scene {
    override state = { n: 1 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st) => keyed(new Text(`state ${st.n}`, { fontSize: 0.6 }), 'state'));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      const machine = new Machine(this, {
        start: { n: 0 }, events: ['NEXT', 'RESET'], views: [picture], limit, runTime: 0.05,
        next: (st, event) => event === 'RESET' ? (absorbingStart ? { n: 0 } : undefined)
          : st.n === 0 && absorbingStart ? st : st.n === 6 ? undefined : { n: st.n + 1 },
      });
      await this.step('press');
      await this.play(machine.send('NEXT'));
    }
  };
}

test('check retains each origin\'s completeness before deduplicating their overlapping states, and describe reports both', async () => {
  for (const limit of [3, 6]) {
    const Source = originScene(limit, true);
    const ran = await new Source(new NullSink()).run();
    const [checked] = await exploreMachines(ran, Source);
    assert.equal(checked!.states, limit);
    assert.equal(checked!.sampled, limit === 3);
    assert.deepEqual(checked!.problems, []);
    const described = await describeScenario(Source, {}, { drawings: false });
    assert.equal(described.machines!.length, 1);
    assert.deepEqual(described.machines![0], {
      events: ['NEXT', 'RESET'], start: { n: 0 }, states: 1, observations: 1, complete: true, step: 'press',
      live: { from: 'rest', state: { n: 2 }, states: limit, observations: limit, complete: limit === 6, ...(limit === 3 ? { sampled: true } : {}) },
    });
  }
});

test('a live origin already in the start\'s sampled prefix still gets its own exploration budget', async () => {
  const Source = originScene(3, false);
  const ran = await new Source(new NullSink()).run();
  const [checked] = await exploreMachines(ran, Source);
  // From start: 0,1,2. From rest: 2,3,4. Skipping a previously seen origin would miss 3 and 4.
  assert.equal(checked!.states, 5);
  assert.equal(checked!.sampled, true);
  assert.deepEqual(checked!.problems, []);
  const [described] = (await describeScenario(Source, {}, { drawings: false })).machines!;
  assert.deepEqual([described!.states, described!.complete, described!.sampled], [3, false, true]);
  assert.deepEqual(described!.live, { from: 'rest', state: { n: 2 }, states: 3, observations: 3, complete: false, sampled: true });
});

test('rayner check draws every reachable state: a picture that cannot tell two states apart fails, named by its shortest events', async () => {
  const good = await exploreMachines(await new (lampScene())(new NullSink()).run(), lampScene());
  assert.equal(good[0]!.phoneWarnings.length, 3);
  assert.deepEqual(good.map(({ phoneWarnings, ...m }) => m), [{ events: ['UP', 'OFF'], states: 3, observations: 3, sampled: false, diagrams: false, problems: [], motion: [] }]);
  const blind = await exploreMachines(await new (lampScene(true))(new NullSink()).run(), lampScene(true));
  assert.deepEqual(blind[0]!.problems, [
    'after UP: the picture is described exactly as at the start, a different observation',
    'after UP, UP: the picture is described exactly as at the start, a different observation',
  ]);
});

test('rayner check measures every label an explored state shows: one too small to read fails, named by its shortest events', async () => {
  const Small = lampScene(false, 0.12);
  const [lamp] = await exploreMachines(await new Small(new NullSink()).run(), Small);
  const desktop = lamp!.problems.filter((p) => p.includes('1280 px stage'));
  assert.equal(desktop.length, 1, JSON.stringify(lamp!.problems));
  assert.match(desktop[0]!, /^after UP, UP: “lamp bright” is \d+(\.\d)? px at a 1280 px stage, under 14$/);
  // Far too small for a phone as well, even in the live step's close-up.
  assert.equal(lamp!.problems.length, 2, JSON.stringify(lamp!.problems));
});

/**
 * The lamp under a note that stays still: the note is drawn in the first step and the machine plays in
 * the second, the live step, so the note is no part of what that step changed. `note` and `word` are
 * their font sizes; with `play: false` the machine is made but never played, so no step is live.
 */
function notedLamp({ note, word, play = true }: { note: number; word: number; play?: boolean }) {
  return class NotedLamp extends Scene {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => keyed(new Group(
        new Rectangle({ width: 4, height: 1.2 }),
        keyed(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: word }), 'lamp:word'),
      ), 'lamp'));
      const caption = keyed(new Text('the hall light', { fontSize: note }).moveTo([-5, 3]), 'note');
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      s.keep(caption, { describe: () => 'a note: the hall light' });
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [picture], runTime: 0.3 });
      await this.step('draw');
      this.add(picture, caption);
      await this.wait(0.2);
      await this.step('press');
      if (play) await this.play(this.machine.sendSequence(['UP', 'UP']));
      else await this.play(picture.sync({ runTime: 0.2 }));
    }
  };
}
const phoneProblems = async (S: ReturnType<typeof notedLamp>) =>
  (await exploreMachines(await new S(new NullSink()).run(), S))[0]!.problems.filter((p) => p.includes('px phone'));

test('at a live step, every label a reachable state shows reads 12 px on a phone: on the whole picture, or whole in one of the step’s close-ups', async () => {
  // A note at 0.4 reads 8.9 px on the 358 px stage, and the step's close-ups are of the lamp it changed: it fails at every state, named.
  const small = await phoneProblems(notedLamp({ note: 0.4, word: 0.6 }));
  assert.equal(small.length, 3, JSON.stringify(small));
  assert.match(small[0]!, /^at the start: “the hall light” reads 8.9 px on the whole picture at a 390 px phone, and no close-up of "press" shows it larger, under 12; the player shows a live step's whole picture after each press, so draw it at a size of at least 0\.54/);
  // At 0.56, as the Poppy series draws every label, it reads 12.5 px on the whole picture.
  assert.deepEqual(await phoneProblems(notedLamp({ note: 0.56, word: 0.6 })), []);
  // The lamp's word at 0.5 reads 11.2 px whole, but it is what the step changed, so its close-up reads it at 12.
  assert.deepEqual(await phoneProblems(notedLamp({ note: 0.56, word: 0.5 })), []);
  const closeUpOnly = notedLamp({ note: 0.56, word: 0.5 });
  const warned = (await exploreMachines(await new closeUpOnly(new NullSink()).run(), closeUpOnly))[0]!;
  assert.ok(warned.phoneWarnings.length > 0);
  assert.ok(warned.phoneWarnings.some(p => p.includes('whole picture') && p.includes('after a live event')));
  const readable = notedLamp({ note: 0.56, word: 0.6 });
  assert.deepEqual((await exploreMachines(await new readable(new NullSink()).run(), readable))[0]!.phoneWarnings, []);

  // A machine that never plays is live nowhere: the reader never drives it, so the phone floor does not apply.
  assert.deepEqual(await phoneProblems(notedLamp({ note: 0.4, word: 0.6, play: false })), []);
});

/** The lamp with an authored transition for UP, and (optionally) an invariant on the box. */
/** A lamp whose UP has an authored transition, given the transition and the lamp's view. */
function litLamp(transition: (t: Transition<Lamp, 'UP' | 'OFF'>, lamp: View) => Animation | AnimationGroup, invariant = false) {
  const nextUp = (s: Lamp, e: 'UP' | 'OFF'): Lamp | undefined => (e === 'UP' && s.level === 2 ? undefined : next(s, e));
  return class LitLamp extends Scene {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => {
        const word = new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 });
        keyed(word, 'lamp:word');
        const box = new Rectangle({ width: 4, height: 1.2 });
        keyed(box, 'lamp:box');
        const g = new Group(box, word);
        keyed(g, 'lamp');
        return g;
      });
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      if (invariant) this.addInvariant('the box stays on screen', (scene) => {
        const b = scene.find('lamp:box')?.box();
        if (!b) return;
        return b[0] >= -8 && b[2] <= 8 ? true : `the box spans ${b[0].toFixed(2)} to ${b[2].toFixed(2)}`;
      });
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next: nextUp, views: [picture], runTime: 1.1, transition: { UP: (t) => transition(t, picture) } });
      await this.step('press');
      await this.play(this.machine.sendSequence(['UP', 'UP', 'OFF']));
    }
  };
}
/** UP morphs the picture into the picture of the state it reaches. */
const morphUp = (t: Transition<Lamp, 'UP' | 'OFF'>, lamp: View) => new Transform(lamp.current, t.target(lamp));

test('a machine refuses an event name a link cannot carry: empty, or with a comma, which a shared link would split', () => {
  const scene = new LampHost(new NullSink());
  const spec = { start: { level: 0 }, next: (s: Lamp) => s, views: [] };
  assert.throws(() => new Machine(scene, { ...spec, events: ['a,b'] }), /^RangeError: new Machine\(\): "a,b" is not an event name/);
  assert.throws(() => new Machine(scene, { ...spec, events: ['UP', ''] }), /^RangeError: new Machine\(\): "" is not an event name/);
  assert.throws(() => new Machine(scene, { ...spec, events: [' '] }), /is not an event name/);
  // The defect it closes: a comma in an event comes back from a link as two events.
  const viaLink = (log: readonly string[]) => decodeLog(new URLSearchParams(`sent=${encodeLog(log)}`).get('sent'));
  assert.deepEqual(viaLink(['a,b']), ['a', 'b']);
  // Events with spaces and colons still travel.
  const words = new Machine(scene, { ...spec, events: ['start A', 'A lands', 'x:1'] });
  assert.deepEqual(viaLink(words.spec.events), ['start A', 'A lands', 'x:1']);
});

test('nothing changes a machine’s model once it is made: not the caller’s spec, nor its own', () => {
  const scene = new LampHost(new NullSink());
  const start = { level: 0 }, events: Array<'UP' | 'DOWN'> = ['UP'];
  const machine = new Machine<Lamp, 'UP' | 'DOWN'>(scene, { start, events, next: (s) => (s.level < 3 ? { level: s.level + 1 } : undefined), views: [] });
  const explored = () => machine.reachable().map((r) => r.state.level);
  const identity = machine.identity;
  start.level = 2;
  events.push('DOWN');
  machine.spec.start.level = 9;
  assert.throws(() => (machine.spec.events as Array<string>).push('DOWN'), TypeError);
  assert.throws(() => Object.assign(machine.spec, { limit: 1 }), TypeError);
  assert.deepEqual([machine.identity, machine.spec.start, machine.spec.events, explored()], [identity, { level: 0 }, ['UP'], [0, 1, 2, 3]]);
});

test('a refused event: next says undefined, exploration does not follow it, and sending it is refused before anything plays', async () => {
  const ran = await new (litLamp(morphUp))(new NullSink()).run();
  assert.equal(ran.machine.after({ level: 2 }, 'UP'), undefined);
  assert.deepEqual(ran.machine.outcome({ level: 2 }, 'UP'), { refused: null });
  assert.deepEqual(ran.machine.reachable().map((r) => r.state.level), [0, 1, 2]);
  assert.throws(() => ran.machine.send('UP', { level: 2 }), /UP is refused in \{"level":2\}$/);
});

test('a model refuses with its reason: refuse(reason) where next refuses, and outcome, send and exploration treat it as a refusal', () => {
  const scene = new LampHost(new NullSink());
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
});

test('a schedule built for one state refuses to play from another', async () => {
  class Stale extends Scene {
    override state: Lamp = { level: 0 };
    override async construct() {
      const picture = view(this, (st: Lamp) => new Text(`lamp ${LEVELS[st.level]}`));
      this.add(picture);
      const machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [picture] });
      await this.step('stale');
      const built = machine.send('UP');
      this.state = { level: 2 };
      await this.play(built);
    }
  }
  await assert.rejects(new Stale(new NullSink()).run(), /UP was built for \{"level":0\} but plays from \{"level":2\}/);
  // The same state with its keys in another order is the state it was built for.
  type Pair = { a: number; b: number };
  class Reordered extends Scene {
    override state: Pair = { a: 1, b: 2 };
    override async construct() {
      const picture = view(this, (st: Pair) => new Text(`a ${st.a} b ${st.b}`));
      this.add(picture);
      const machine = new Machine<Pair, 'UP'>(this, { start: { a: 1, b: 2 }, events: ['UP'], next: (s) => ({ a: s.a + 1, b: s.b }), views: [picture] });
      await this.step('reordered');
      const built = machine.send('UP');
      this.state = { b: 2, a: 1 };
      await this.play(built);
    }
  }
  assert.deepEqual((await new Reordered(new NullSink()).run()).state, { a: 2, b: 2 });
});

test('an authored transition plays, the views land on the state it reaches, and rayner check plays every reachable one', async () => {
  const Lit = litLamp(morphUp, true);
  const ran = await new Lit(new NullSink()).run();
  assert.deepEqual(ran.state, { level: 0 });
  assert.deepEqual(ran.steps[0]!.evidence!.filter((e) => e.kind === 'event').map((e) => e.event), ['UP', 'UP', 'OFF']);
  const [explored] = await exploreMachines(ran, Lit);
  assert.deepEqual(explored!.problems, []);
});

/**
 * Holds its picture still, after waiting a moment at its turn for what it reads, as a member made at
 * its turn waits for a diagram's layout: asked before its turn (as a play first asks), it has nothing
 * to wait for yet, so only the running play can wait for it.
 */
class WaitsToRead extends Animation {
  #asked = 0;
  #read = false;
  constructor(m: Mobject) { super(m, { runTime: 0.1 }); }
  override [whenReady](): Promise<unknown> | null {
    if (this.#read || this.#asked++ === 0) return null;
    return new Promise((done) => setTimeout(done, 5)).then(() => { this.#read = true; });
  }
  protected override doBegin(): void {}
  protected override doInterpolate(): void {}
  protected override doFinish(): void {}
}

test('rayner check plays a transition as the page plays it: one whose member waits for what it reads plays in both', async () => {
  // The morph, then a member that waits at its turn: only a running play can wait for it.
  const Waiting = litLamp((t, lamp) => new Succession([new Transform(lamp.current, t.target(lamp)), new WaitsToRead(lamp.current)]), true);
  const ran = await new Waiting(new NullSink()).run();
  assert.deepEqual(ran.steps[0]!.evidence!.filter((e) => e.kind === 'event').map((e) => e.event), ['UP', 'UP', 'OFF']);
  // The page's own path: the run to the live step, then the reader's event sent there.
  const [machine] = machinesOf(ran);
  const live = await runLive(Waiting, 'press', { index: 0, identity: machine!.identity }, ['UP']);
  assert.deepEqual(live.scene.state, { level: 1 });
  const [explored] = await exploreMachines(ran, Waiting);
  assert.deepEqual(explored!.problems, []);
  assert.equal(explored!.states, 3);
});

test('deliberate defect: a transition that ends somewhere else fails, named by its shortest events and its event', async () => {
  // It morphs to the right picture two units to the right: the landing would leave the view there.
  const Misplaced = litLamp((t, lamp) => new Transform(lamp.current, t.target(lamp).copy().shift([2, 0])));
  const ran = await new Misplaced(new NullSink()).run();
  const [explored] = await exploreMachines(ran, Misplaced);
  // Each misplaced landing also moves the view for good, so a later state can drift off the stage.
  for (const named of ['UP', 'after UP, UP'])
    assert.ok(explored!.problems.includes(`${named}: the transition ends somewhere other than the picture of the state it reaches`), JSON.stringify(explored!.problems));
});

test('deliberate defect: a transition that breaks an invariant on the way fails, though it lands', async () => {
  // It swings the picture off screen and back, ending where the model says.
  const swing = (t: Transition<Lamp, 'UP' | 'OFF'>, v: View) => {
    const target = t.target(v);
    return new Succession([new Transform(v.current, v.current.copy().shift([30, 0]), { runTime: 0.5 }), new Transform(v.current, target, { runTime: 0.5 })]);
  };
  const Swing = litLamp(swing, true);
  const [explored] = await exploreMachines(await new Swing(new NullSink()).run(), Swing);
  // Every frame the transition draws is checked: the first that fails is named, by how far through it is.
  const failed = explored!.problems.filter((p) => p.startsWith('UP: the invariant'));
  assert.equal(failed.length, 1, JSON.stringify(explored!.problems));
  assert.match(failed[0]!, /^UP: the invariant "the box stays on screen" fails ([1-9]|[1-4]\d)% through the transition: the box spans /);
});

test('what is shown may change between a machine\'s events; exploration draws its states under the last', async () => {
  class Shown extends Scene {
    override shown: { room?: string } = {};
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      // Which room the lamp is in is what is shown, not part of the lamp's model.
      const picture = view(this, (st: Lamp, shown) => {
        // Too small to read in the hall: exploration drawing there would say so.
        const word = new Text(`${String(shown.room ?? 'hall')} lamp ${LEVELS[st.level]}`, { fontSize: shown.room === 'hall' ? 0.08 : 0.6 });
        keyed(word, 'lamp:word');
        return keyed(new Group(new Rectangle({ width: 6, height: 1.2 }), word), 'lamp');
      });
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [picture], runTime: 0.3 });
      this.shown = { room: 'kitchen' };
      await this.step('press');
      await this.play(this.machine.send('UP'));
      // A guided tour moves what is shown between events (a code panel's focus, say).
      this.shown = { room: 'study' };
      await this.play(this.machine.send('UP'));
      // Afterwards the scene shows another room without playing the machine there.
      this.shown = { room: 'hall' };
      await this.play(picture.sync({ runTime: 0.2 }));
    }
  }
  const scene = await new Shown(new NullSink()).run() as Shown;
  assert.deepEqual(scene.machine.playedUnder, { room: 'study' });
  // The states were drawn in the study, where the machine last played, not the hall the step ended in:
  // no label is too small to read.
  const [explored] = await exploreMachines(scene, Shown);
  assert.deepEqual(explored!.problems, []);
  assert.equal(explored!.states, 3);
  // Exploration runs the scene again: the run it was given is left as it ended.
  assert.deepEqual(scene.shown, { room: 'hall' });
  assert.match(scene.machine.spec.views[0]!.texts.join(' '), /hall lamp/);
});

test('exploration checks a machine on the stage where it last played, not the stage the run ends with', async () => {
  /** The lamp, cleared away after its events: in a later step, or (`within`) in the step where it played. */
  const cleared = (within: boolean) => class Cleared extends Scene {
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => {
        const word = new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 });
        keyed(word, 'lamp:word');
        return keyed(new Group(new Rectangle({ width: 4, height: 1.2 }), word), 'lamp');
      });
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      const machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next, views: [picture], runTime: 0.3 });
      await this.step('press', { caption: 'Press the switch.' });
      await this.play(machine.sendSequence(['UP', 'UP']));
      // A later step clears the lamp away and shows something else.
      if (!within) await this.step('later', { caption: 'Something else.' });
      await s.clear();
      await s.enter(new Text('the end', { fontSize: 0.5 }), { describe: 'The end' });
    }
  };
  // Cleared as the step where it played ends, the lamp is gone: exploration says so rather than checking nothing.
  const Gone = cleared(true);
  const [blind] = await exploreMachines(await new Gone(new NullSink()).run(), Gone);
  assert.match(blind!.problems[0]!, /not on the stage where it last played/);
  const Cleared = cleared(false);
  const ran = await new Cleared(new NullSink()).run();
  // On the stage of the step where it played, every state is checked and passes.
  const [explored] = await exploreMachines(ran, Cleared);
  assert.deepEqual(explored!.problems, []);
  assert.equal(explored!.states, 3);
});

test('a transition finds each view by the view itself, and refuses a view the machine does not have', async () => {
  class Two extends Scene {
    override state: Lamp = { level: 0 };
    override async construct() {
      const lamp = view(this, (st: Lamp) => keyed(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), 'lamp'));
      const meter = view(this, (st: Lamp) => keyed(new Text(`level ${st.level}`, { fontSize: 0.5 }).moveTo([0, -2]), 'meter'));
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
  const bounded = (bound: (s: Lamp, e: 'UP' | 'OFF') => string | undefined) => class extends Scene {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => keyed(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), 'lamp'));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next: nextUp, views: [picture], bound });
      await this.step('press');
      await this.play(this.machine.sendSequence(['UP']));
    }
  };
  // This story never turns the lamp past dim, though the lamp could go brighter.
  const Story = bounded((st, e) => (e === 'UP' && st.level >= 1 ? 'This story stops at dim' : undefined));
  const story = await new Story(new NullSink()).run();
  assert.deepEqual(story.machine.outcome({ level: 1 }, 'UP'), { beyond: 'This story stops at dim' });
  assert.deepEqual(story.machine.outcome({ level: 0 }, 'UP'), { next: { level: 1 } });
  assert.deepEqual(story.machine.reachable().map((r) => r.state.level), [0, 1]);
  assert.throws(() => story.machine.send('UP', { level: 1 }), /UP is beyond the story in \{"level":1\}: This story stops at dim/);
  assert.deepEqual((await exploreMachines(story, Story))[0]!.problems, []);
  // A bound placed where the lamp refuses anyway (at bright) is a refusal mislabelled.
  const Wrong = bounded((st, e) => (e === 'UP' && st.level === 2 ? 'This story stops at bright' : undefined));
  const wrong = await new Wrong(new NullSink()).run();
  assert.ok((await exploreMachines(wrong, Wrong))[0]!.problems.some((p) => /after UP, UP, UP: the bound says "This story stops at bright", but the model refuses it anyway/.test(p)));
  // The model's own refusal carries its reason.
  assert.deepEqual(wrong.machine.outcome({ level: 2 }, 'UP'), { beyond: 'This story stops at bright' });
  const free = bounded(() => undefined);
  const lamp = await new free(new NullSink()).run();
  assert.deepEqual(lamp.machine.outcome({ level: 2 }, 'UP'), { refused: 'the lamp is already bright' });
});

test('end finishes the story at a state: the model\'s moves from it are beyond the story, its refusals stay refusals', async () => {
  // UP is refused at bright; this story ends once the lamp is bright.
  const nextUp = (s: Lamp, e: 'UP' | 'OFF') => (e === 'UP' && s.level === 2 ? refuse(`the lamp is already ${LEVELS[s.level]}`) : next(s, e));
  class Ends extends Scene {
    machine!: Machine<Lamp, 'UP' | 'OFF'>;
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => keyed(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), 'lamp'));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      this.machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start: { level: 0 }, events: ['UP', 'OFF'], next: nextUp, views: [picture],
        end: (st) => (st.level === 2 ? 'the lamp is bright' : undefined) });
      await this.step('press');
      await this.play(this.machine.sendSequence(['UP', 'UP']));
    }
  }
  const ends = await new Ends(new NullSink()).run();
  assert.deepEqual(ends.machine.outcome({ level: 2 }, 'OFF'), { beyond: 'the lamp is bright' });
  assert.deepEqual(ends.machine.outcome({ level: 2 }, 'UP'), { refused: 'the lamp is already bright' });
  assert.deepEqual(ends.machine.outcome({ level: 1 }, 'UP'), { next: { level: 2 } });
  assert.deepEqual(ends.machine.reachable().map((r) => r.state.level), [0, 1, 2]);
  assert.deepEqual((await exploreMachines(ends, Ends))[0]!.problems, []);
  // A live step that ends finished starts the reader's events from the machine's start.
  assert.deepEqual(logStart(ends.machine as never, { level: 2 }), { from: 'start', state: { level: 0 } });
  assert.deepEqual((await describeScenario(Ends, {}, { drawings: false })).machines![0]!.live,
    { from: 'start', state: { level: 0 }, states: 3, observations: 3, complete: true });
});

test('check and describe explore a shared step\'s resting state only with the machine that owns its controls', async () => {
  type Chapter = { level: number } | { count: number };
  let offerLast = false;
  class SharedStep extends Scene {
    override state: Chapter = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, st => new Text('level' in st ? `level ${st.level}` : `count ${st.count}`, { fontSize: 0.6 }));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      const first = new Machine<Chapter, 'UP'>(this, {
        start: { level: 0 }, events: ['UP'], views: [picture], match: 'index', runTime: 0.05,
        next: st => ({ level: 1 - having(st, 'level').level }),
      });
      const last = new Machine<Chapter, 'COUNT'>(this, {
        start: { count: 0 }, events: ['COUNT'], views: [picture], match: 'index', runTime: 0.05,
        next: st => ({ count: (having(st, 'count').count + 1) % 3 }),
      });
      await this.step('press');
      await first.send('UP');
      this.state = { count: 0 };
      await last.send('COUNT');
      if (offerLast) last.offer();
    }
  }
  const { machines } = await describeScenario(SharedStep, {}, { drawings: false });
  assert.equal(machines!.length, 2);
  assert.deepEqual(machines!.map((m) => m.step), ['press', 'press']);
  assert.equal(machines![0]!.live, undefined, 'the first machine is not the one whose buttons the player shows');
  assert.deepEqual(machines![1]!.live, { from: 'rest', state: { count: 1 }, states: 3, observations: 3, complete: true });
  const checked = await exploreMachines(await new SharedStep(new NullSink()).run(), SharedStep);
  assert.deepEqual(checked.map(({states, observations, sampled, problems}) => ({states, observations, sampled, problems})), [
    { states: 2, observations: 2, sampled: false, problems: [] },
    { states: 3, observations: 3, sampled: false, problems: [] },
  ]);
  offerLast = true;
  const offered = await exploreMachines(await new SharedStep(new NullSink()).run(), SharedStep);
  assert.deepEqual(offered.map(({ step, states, problems }) => [step, states, problems]), [
    [undefined, 2, []], ['press', 3, []],
  ]);
});

test('one machine offered twice reopens and checks each historical model and shown state, including its first unsent step', async () => {
  class Chapters extends Scene {
    override state: Lamp = { level: 10 };
    override shown = { chapter: 'early' };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st, sh) => new Text(`${sh.chapter} ${st.level}`, {
        fontSize: sh.chapter === 'late' && st.level === 21 ? 0.08 : 0.6,
      }));
      this.add(picture);
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      const machine = new Machine<Lamp, 'UP'>(this, {
        start: { level: 0 }, events: ['UP'], views: [picture], match: 'index', runTime: 0.1,
        next: st => st.level % 10 === 0 ? { level: st.level + 1 } : undefined,
      });
      await this.step('first');
      machine.offer();
      machine.offer();
      await this.step('guided');
      this.shown = { chapter: 'guided' };
      await machine.send('UP');
      await this.step('second');
      this.state = { level: 20 };
      this.shown = { chapter: 'late' };
      await picture.sync({ match: 'index' });
      machine.offer();
      await this.step('last');
      this.shown = { chapter: 'last' };
      await machine.send('UP');
    }
  }
  const ran = await new Chapters(new NullSink()).run(), places = liveSteps(ran);
  assert.deepEqual([...places.keys()], ['first', 'second']);
  assert.equal(places.get('first')!.machine, places.get('second')!.machine);
  for (const [step, level, chapter] of [['first', 10, 'early'], ['second', 20, 'late']] as const) {
    const result = await runLive(Chapters, step, places.get(step)!, ['UP']);
    assert.deepEqual(result.rest, { level });
    assert.deepEqual(result.scene.state, { level: level + 1 });
    assert.equal(result.shown.chapter, chapter);
    assert.deepEqual(result.machine.spec.views[0]!.texts, [`${chapter} ${level + 1}`]);
  }
  const { machines } = await describeScenario(Chapters, {}, { drawings: false });
  assert.equal(machines!.length, 1);
  assert.deepEqual(machines![0]!.offers, [10, 20].map((level, i) => ({
    step: i === 0 ? 'first' : 'second', live: { from: 'rest', state: { level }, states: 2, observations: 2, complete: true },
  })));
  const checked = await exploreMachines(ran, Chapters);
  assert.deepEqual(checked.map(({ step, states }) => [step, states]), [['first', 4], ['second', 4]]);
  assert.deepEqual(checked[0]!.problems, []);
  assert.ok(checked[1]!.problems.some((p) => /from the state at "second", after UP: “late 21” reads|from the state at "second", after UP: “late 21” is/.test(p)), JSON.stringify(checked[1]!.problems));
});

test('exploration also walks the states a reader reaches from the live step, not only from the start', async () => {
  // The machine starts bright, where UP is refused; the scene plays it from off, so the step rests at dim,
  // a state the start never reaches. Dim's label is too small to read: only the walk from the step finds it.
  class FromStep extends Scene {
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => keyed(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: st.level === 1 ? 0.08 : 0.5 }), 'lamp'));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      const machine = new Machine<Lamp, 'UP'>(this, {
        start: { level: 2 }, events: ['UP'], views: [picture],
        next: (st) => (st.level === 2 ? undefined : { level: st.level + 1 }),
      });
      await this.step('press', { caption: 'Press it.' });
      await this.play(machine.sendSequence(['UP'], { level: 0 }));
    }
  }
  const ran = await new FromStep(new NullSink()).run();
  const [explored] = await exploreMachines(ran, FromStep);
  assert.ok(explored!.problems.some((p) => /^from the state at "press", at the start: “lamp dim” is .* px/.test(p)), JSON.stringify(explored!.problems));
});

/**
 * A lamp that starts bright, where UP and OFF are refused (OFF turns only dim off), so only a walk from the live step reaches off and dim; off's
 * label is too small to read. The step plays UP from off (to dim), then `rest` moves it back to off: by code
 * after its last play, or by an end listener's play. The reader starts from off, and only exploration from
 * off finds the small label.
 */
function restingLamp(rest: 'code' | 'listener', caption?: string) {
  return class RestingLamp extends Scene {
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => keyed(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: st.level === 0 ? 0.08 : 0.5 }), 'lamp'));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      const machine = new Machine<Lamp, 'UP' | 'OFF'>(this, {
        start: { level: 2 }, events: ['UP', 'OFF'], views: [picture], runTime: 0.2,
        next: (st, e) => (e === 'OFF' ? (st.level === 1 ? { level: 0 } : undefined) : st.level === 2 ? undefined : { level: st.level + 1 }),
      });
      if (rest === 'listener') this.onStepEnd(async (st) => { if (st.name === 'press') await this.play(machine.send('OFF')); });
      await this.step('press', caption ? { caption } : {});
      await this.play(machine.sendSequence(['UP'], { level: 0 }));
      if (rest === 'code') this.state = { level: 0 };
    }
  };
}

test('the live player and check start a live step from one state, the step\'s end: code after its last play included, held for a caption or not', async () => {
  for (const caption of [undefined, 'A caption long enough to hold the step for a reading after its last play.']) {
    const Lamp = restingLamp('code', caption);
    const trace = await traceScene(Lamp);
    const press = trace.steps.find((st) => st.step === 'press')!;
    assert.equal(press.holdFrame != null, !!caption);
    const ran = await new Lamp(new NullSink()).run();
    const [machine] = machinesOf(ran);
    const run = await runLive(Lamp, 'press', { index: 0, identity: machine!.identity }, []);
    // The player's state is the trace's: before, it stopped at the still frame, before the code that sets off.
    assert.deepEqual(run.rest, { level: 0 });
    assert.deepEqual(press.after, run.rest);
    assert.deepEqual(logStart(machine!, run.rest), { from: 'rest', state: { level: 0 } });
    // The one helper the player, the build, the review and the cost measurement start the reader from.
    const started = await liveBase(Lamp, 'press', { index: 0, identity: machine!.identity });
    assert.deepEqual(started.base, { from: 'rest', state: { level: 0 } });
    assert.equal(started.machine.identity, machine!.identity);
    // Check explores from that state: the small label is reached only from off.
    const [explored] = await exploreMachines(ran, Lamp);
    assert.ok(explored!.problems.some((p) => /^from the state at "press", at the start: “lamp off” is .* px/.test(p)), JSON.stringify(explored!.problems));
  }
});

test('the live player and check start a live step after its end listeners: a listener that plays moves the state both start from, and the picture a link shows', async () => {
  const Lamp = restingLamp('listener');
  const trace = await traceScene(Lamp);
  const press = trace.steps.find((st) => st.step === 'press')!;
  const ran = await new Lamp(new NullSink()).run();
  const [machine] = machinesOf(ran);
  const run = await runLive(Lamp, 'press', { index: 0, identity: machine!.identity }, []);
  // Before, the player stopped at the still frame, before the listener played OFF, at dim.
  assert.deepEqual([run.rest, press.after], [{ level: 0 }, { level: 0 }]);
  const link = new SnapshotSink();
  await renderFrame(Lamp, press.frame1, link);
  const player = new SnapshotSink();
  await player.frame(run.scene);
  assert.equal(player.svg, link.svg, 'the player starts from the picture a link to the step shows');
  const [explored] = await exploreMachines(ran, Lamp);
  assert.ok(explored!.problems.some((p) => /^from the state at "press", at the start: “lamp off” is .* px/.test(p)), JSON.stringify(explored!.problems));
});

test('an authored transition lands a picture whose parts repeat a key by redrawing it, never by drawing one part twice', async () => {
  // Two parts share the key "part": a landing that matched by key would put the second part in both places.
  type N = { n: number };
  class Repeated extends Scene {
    pair!: View;
    override state: N = { n: 0 };
    override async construct() {
      this.pair = view(this, (st: N) => {
        const a = keyed(new Text(`a${st.n}`, { fontSize: 0.5 }).shift([-2, 0]), 'part');
        const b = keyed(new Text(`b${st.n}`, { fontSize: 0.5 }).shift([2, 0]), 'part');
        return keyed(new Group(a, b), 'pair');
      });
      this.add(this.pair);
      const machine = new Machine<N, 'UP'>(this, {
        start: { n: 0 }, events: ['UP'], next: (s) => ({ n: s.n + 1 }), views: [this.pair], runTime: 0.2,
        transition: { UP: (t) => new Transform(this.pair.current, t.target(this.pair), {runTime: 0.2}) },
      });
      await this.step('up');
      await this.play(machine.sendSequence(['UP', 'UP']));
    }
  }
  const ran = await new Repeated(new NullSink()).run() as Repeated;
  const parts = ran.pair.current.children;
  assert.equal(new Set(parts).size, 2, 'two distinct parts');
  assert.deepEqual(ran.pair.texts, ['a2', 'b2']);
  assert.deepEqual(parts.map((p) => Math.sign(p.center()[0])), [-1, 1]);
});

test('exploration refuses a run to the live step that made a different machine at the same place: events swapped, or another start', async () => {
  const made = (events: ('UP' | 'OFF')[], start: Lamp) => class extends Scene {
    override state: Lamp = { level: 0 };
    override async construct() {
      const s = stage(this);
      const picture = view(this, (st: Lamp) => keyed(new Group(new Rectangle({ width: 4, height: 1.2 }), keyed(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), 'lamp:word')), 'lamp'));
      s.keep(picture, { describe: () => picture.texts.join(' ') });
      this.add(picture);
      const machine = new Machine<Lamp, 'UP' | 'OFF'>(this, { start, events, next, views: [picture], runTime: 0.3 });
      await this.step('press');
      await this.play(machine.send('UP'));
    }
  };
  const ran = await new (made(['UP', 'OFF'], { level: 0 }))(new NullSink()).run();
  // Before, only the events were compared: two machines with the same events made in the other order, or a
  // machine with another start, passed as the same machine.
  // Exploration runs to the step as the player does, so the refusal is the player's own.
  for (const other of [made(['OFF', 'UP'], { level: 0 }), made(['UP', 'OFF'], { level: 1 })])
    await assert.rejects(exploreMachines(ran, other), /^Error: runLive\(\): the run to "press" made different machines/);
  const [explored] = await exploreMachines(ran, made(['UP', 'OFF'], { level: 0 }));
  assert.deepEqual(explored!.problems, []);
});


test('a kept reader run resets transient results when its first event starts from the machine start', async () => {
  class RestingResponse extends Scene {
    override state = {n: 0};
    override shown: {result?: {tag: string}} = {};
    override async construct() {
      const picture = view(this, (_st, shown) => new Group(keyed(new Text(shown.result?.tag ?? 'Ready'), 'response')));
      const machine = new Machine(this, {
        start: this.state, events: ['mark', 'clear'] as const, views: [picture], liveStart: 'start', runTime: 0.2,
        next: st => ({...st}), result: ({event}) => event === 'mark' ? {tag: 'Marked'} : undefined,
      });
      this.add(picture);
      await this.step('response');
      await machine.send('mark');
    }
  }
  const scene = await new RestingResponse(new NullSink()).run(), place = liveSteps(scene).get('response')!;
  const held = await runLive(RestingResponse, 'response', place, [], {from: 'start', keep: true});
  assert.deepEqual(held.machine.spec.views[0]!.texts, ['Marked'], 'the empty log retains the historic rest');
  const keptFrames: string[][] = [], freshFrames: string[][] = [];
  try {
    await held.session!.send('clear', {animate: {async frame(s) {keptFrames.push(machinesOf(s)[0]!.spec.views[0]!.texts);}}});
    await runLive(RestingResponse, 'response', place, ['clear'], {from: 'start', animate: {async frame(s) {freshFrames.push(machinesOf(s)[0]!.spec.views[0]!.texts);}}});
    assert.ok(keptFrames.length > 1);
    assert.deepEqual(keptFrames, freshFrames);
    assert.ok(keptFrames.every(words => words.join() === 'Ready'));
  } finally {held.session!.close();}
});
