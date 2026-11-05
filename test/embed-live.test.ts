// The live machine's logic, as the player runs it (app/embed-live.ts): where a machine is live,
// which of a link's events are kept, how the log sits in a URL, and the picture a log lands on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { Scene, Text, Group, Rectangle, Machine, refuse, view, NullSink, StringSink, loadFonts, traceScene } from '../src/index.ts';
import type { Sink } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { acceptedLog, decodeLog, encodeLog, liveSteps, logStart, outcomes, pictureChange, runLive } from '../app/embed-live.ts';

await loadFonts();

type Lamp = { level: number };
type Press = 'UP' | 'DOWN' | 'OFF';
const LEVELS = ['off', 'dim', 'bright'] as const;
/** A lamp of three levels. UP past bright is refused, with a reason; DOWN from off is refused, without one; OFF from off is past the story. */
function lampScene({ after = (_scene: Scene<Lamp>) => {} } = {}) {
  return class LampScene extends Scene<Lamp> {
    machine!: Machine<Lamp, Press>;
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
      this.machine = new Machine<Lamp, Press>(this, {
        start: { level: 0 },
        events: ['UP', 'DOWN', 'OFF'],
        labels: { UP: 'Brighter' },
        // UP at its brightest says why; DOWN when off is refused with no reason.
        next: (st, e) => (e === 'UP' ? (st.level < 2 ? { level: st.level + 1 } : refuse('It is as bright as it goes')) : e === 'DOWN' ? (st.level > 0 ? { level: st.level - 1 } : undefined) : { level: 0 }),
        bound: (st, e) => (e === 'OFF' && st.level === 0 ? 'The lamp is already off' : undefined),
        views: [picture],
        runTime: 0.3,
      });
      await this.step('intro', { caption: 'A lamp.' });
      await this.wait(0.2);
      await this.step('press', { caption: 'Press the switch.' });
      await this.play(this.machine.replay(['UP']));
      after(this);
      await this.step('later', { caption: 'The end.' });
      await s.clear();
    }
  };
}

test('a machine is live at the step it last played in, and nowhere before it played', async () => {
  const Lamp = lampScene();
  const ran = await new Lamp(new NullSink()).run();
  const live = liveSteps(ran);
  assert.deepEqual([...live.keys()], ['press']);
  assert.equal(live.get('press')!.index, 0);
  assert.equal(live.get('press')!.machine, ran.machine);
  assert.deepEqual([...liveSteps(new Scene(new NullSink())).keys()], []);
});

test('buttons say what outcome says: the label, and a refusal’s or the story’s reason', () => {
  const ran = new (lampScene())(new NullSink());
  const machine = new Machine<Lamp, Press>(ran, { start: { level: 0 }, events: ['UP', 'DOWN', 'OFF'], labels: { UP: 'Brighter' }, next: (st, e) => (e === 'UP' && st.level < 2 ? { level: st.level + 1 } : e === 'DOWN' && st.level > 0 ? { level: st.level - 1 } : e === 'OFF' ? { level: 0 } : e === 'UP' ? refuse('Too bright') : undefined), bound: (st, e) => (e === 'OFF' && st.level === 0 ? 'Already off' : undefined), views: [] });
  assert.deepEqual(outcomes(machine as never, { level: 2 }), [
    { event: 'UP', label: 'Brighter', kind: 'refused', reason: 'Too bright' },
    { event: 'DOWN', label: 'DOWN', kind: 'next' },
    { event: 'OFF', label: 'OFF', kind: 'next' },
  ]);
  assert.deepEqual(outcomes(machine as never, { level: 0 }).map((o) => o.kind), ['next', 'refused', 'beyond']);
  // A refusal with no reason (next returns undefined) has none: the player says its own words.
  assert.deepEqual(outcomes(machine as never, { level: 0 })[1], { event: 'DOWN', label: 'DOWN', kind: 'refused', reason: null });
  // A label must name one of the machine's events, in words.
  assert.throws(() => new Machine(ran, { start: {}, events: ['A'], labels: { B: 'b' } as never, next: () => ({}), views: [] }), /labels name its events/);
  assert.throws(() => new Machine(ran, { start: {}, events: ['A'], labels: { A: ' ' }, next: () => ({}), views: [] }), /must be words/);
});

test('a link’s log keeps its longest prefix the machine takes, and says where and why it stopped', async () => {
  const ran = await new (lampScene())(new NullSink()).run();
  const m = ran.machine as unknown as Machine<object, string>;
  assert.deepEqual(acceptedLog(m, { level: 0 }, ['UP', 'UP', 'DOWN']), { kept: ['UP', 'UP', 'DOWN'], states: [{ level: 0 }, { level: 1 }, { level: 2 }, { level: 1 }] });
  assert.deepEqual(acceptedLog(m, { level: 1 }, ['UP', 'UP', 'DOWN']).stopped, { event: 'UP', kind: 'refused', reason: 'It is as bright as it goes' });
  assert.deepEqual(acceptedLog(m, { level: 1 }, ['UP', 'UP']).kept, ['UP']);
  assert.deepEqual(acceptedLog(m, { level: 0 }, ['OFF']).stopped, { event: 'OFF', kind: 'beyond', reason: 'The lamp is already off' });
  assert.deepEqual(acceptedLog(m, { level: 0 }, ['DOWN']).stopped, { event: 'DOWN', kind: 'refused', reason: null });
  assert.deepEqual(acceptedLog(m, { level: 0 }, ['UP', 'JUMP', 'UP']), { kept: ['UP'], states: [{ level: 0 }, { level: 1 }], stopped: { event: 'JUMP', kind: 'unknown', reason: null } });
});

test('a log round-trips through a URL: commas between events, spaces as +, colons kept', () => {
  assert.equal(encodeLog(['open B: goat', 'stay', 'a+b']), 'open+B:+goat,stay,a%2Bb');
  const url = new URL('https://example.com/?step=x');
  url.search += `&sent=${encodeLog(['open B: goat', 'stay'])}`;
  assert.deepEqual(decodeLog(url.searchParams.get('sent')), ['open B: goat', 'stay']);
  assert.deepEqual(decodeLog(null), []);
  // Any events without a comma survive the URL, written by hand or re-encoded by URLSearchParams.
  fc.assert(fc.property(fc.array(fc.string({ minLength: 1 }).filter((e) => !e.includes(',')), { maxLength: 6 }), (log) => {
    const written = new URL(`https://example.com/?step=x&sent=${encodeLog(log)}`);
    assert.deepEqual(decodeLog(written.searchParams.get('sent')), log);
    const reencoded = new URL(written);
    reencoded.searchParams.set('step', 'y');
    assert.deepEqual(decodeLog(reencoded.searchParams.get('sent')), log);
  }));
});

test('the log starts where the step leaves the machine, or at its start when no event goes anywhere there', async () => {
  const ran = await new (lampScene())(new NullSink()).run();
  const m = ran.machine as unknown as Machine<object, string>;
  assert.deepEqual(logStart(m, { level: 1 }), { from: 'rest', state: { level: 1 } });
  const stuck = new Machine<Lamp, 'UP'>(ran, { start: { level: 0 }, events: ['UP'], next: (st) => (st.level < 2 ? { level: st.level + 1 } : undefined), views: [] });
  assert.deepEqual(logStart(stuck as never, { level: 2 }), { from: 'start', state: { level: 0 } });
  const never = new Machine<Lamp, 'UP'>(ran, { start: { level: 2 }, events: ['UP'], next: () => undefined, views: [] });
  assert.equal(logStart(never as never, { level: 2 }), null);
});

/** The picture `sink` holds now, as SVG. */
const svgOf = (sink: StringSink) => (sink as unknown as { frames: string[] }).frames.at(-1)!;

test('a live run stops at the step’s resting picture, plays the log there, and is a function of the log', async () => {
  // Code the scene runs between its last play and its next step must not reach the reader's stage.
  let ranAfter = 0;
  const Lamp = lampScene({ after: () => { ranAfter++; } });
  const trace = await traceScene(Lamp);
  ranAfter = 0;
  const press = trace.steps.find((s) => s.step === 'press')!;
  const empty = await runLive(Lamp, press, 0, []);
  assert.deepEqual(empty.rest, { level: 1 });
  assert.equal(ranAfter, 0, 'the run stopped as the step came to rest');
  const a = new StringSink(), b = new StringSink();
  const one = await runLive(Lamp, press, 0, ['UP', 'DOWN', 'UP'], { sink: a });
  await runLive(Lamp, press, 0, ['UP', 'DOWN', 'UP'], { sink: b });
  assert.deepEqual(one.scene.state, { level: 2 });
  assert.equal(svgOf(a), svgOf(b), 'the same log draws the same picture');
  assert.match(JSON.stringify(one.shown), /lamp bright/);
  // Animated, the last event plays frame by frame from the picture before it, and lands on the same picture.
  const frames: string[] = [];
  let started = 0;
  const animated = new StringSink();
  const counting: Sink = { frame: async (scene, dt) => { frames.push(String(dt)); return animated.frame(scene); } };
  await runLive(Lamp, press, 0, ['UP', 'DOWN', 'UP'], { animate: counting, onStart: () => { started = frames.length; } });
  assert.equal(started, 1, 'onStart follows the first frame, the picture before the last event');
  assert.ok(frames.length >= 9, `${frames.length} frames: the last event's 0.3 s played`);
  assert.equal(svgOf(animated), svgOf(a), 'an animated landing is the picture a fresh run draws');
  const before = new StringSink();
  await runLive(Lamp, press, 0, ['UP', 'DOWN'], { sink: before });
  assert.equal(animated.frames[0], svgOf(before), 'the animation starts from the picture the log before it lands on');
  assert.notEqual(svgOf(before), svgOf(a));
  // From the machine's start, the views are redrawn there first.
  const fromStart = await runLive(Lamp, press, 0, ['UP'], { from: 'start' });
  assert.deepEqual(fromStart.scene.state, { level: 1 });
  assert.deepEqual(fromStart.rest, { level: 1 });
  // A log the machine does not take throws, as send does.
  await assert.rejects(runLive(Lamp, press, 0, ['UP', 'UP', 'UP']), /refused/);
  await assert.rejects(runLive(Lamp, { step: 'nowhere', t1: 1 }, 0, []), /never reached/);
});

test('a kept run plays the next event from its picture, landing where a fresh run of the longer log lands', async () => {
  let ranAfter = 0;
  const Lamp = lampScene({ after: () => { ranAfter++; } });
  const press = (await traceScene(Lamp)).steps.find((s) => s.step === 'press')!;
  ranAfter = 0;
  const kept = await runLive(Lamp, press, 0, ['UP'], { keep: true });
  const session = kept.session!;
  assert.deepEqual([session.log, session.open, session.busy], [['UP'], true, false]);
  // Skipped, then drawn: the picture of the fresh run of the same log.
  const a = new StringSink(), fresh = new StringSink();
  const down = await session.send('DOWN', { sink: a });
  await runLive(Lamp, press, 0, ['UP', 'DOWN'], { sink: fresh });
  assert.deepEqual(down.scene.state, { level: 1 });
  assert.equal(svgOf(a), svgOf(fresh));
  assert.deepEqual(session.log, ['UP', 'DOWN']);
  // Animated: frame by frame from the picture now, onStart after the first, landing on the fresh run's picture.
  const frames: string[] = [], animated = new StringSink(), freshAnimated = new StringSink();
  let started = 0;
  const counting: Sink = { frame: async (scene, dt) => { frames.push(String(dt)); return animated.frame(scene); } };
  const up = await session.send('UP', { animate: counting, onStart: () => { started = frames.length; } });
  await runLive(Lamp, press, 0, ['UP', 'DOWN', 'UP'], { animate: freshAnimated });
  assert.equal(started, 1);
  assert.equal(animated.frames[0], svgOf(a), 'the animation starts from the picture the session held');
  assert.deepEqual(animated.frames, freshAnimated.frames, 'every frame is the fresh run’s');
  assert.match(JSON.stringify(up.shown), /lamp bright/);
  assert.equal(ranAfter, 0, 'a kept run stays in the step');
  // A refused event fails the send and closes the session; so does close().
  await assert.rejects(session.send('UP'), /refused/);
  assert.equal(session.open, false);
  await assert.rejects(session.send('DOWN'), /closed or busy/);
  const other = (await runLive(Lamp, press, 0, [], { keep: true })).session!;
  other.close();
  assert.equal(other.open, false);
  await assert.rejects(other.send('UP'), /closed or busy/);
  // One event at a time.
  const third = (await runLive(Lamp, press, 0, [], { keep: true })).session!;
  const first = third.send('UP');
  await assert.rejects(third.send('DOWN'), /closed or busy/);
  await first;
  third.close();
});

test('an event is announced by what it changed of the picture', () => {
  const at = (...entries: object[]) => ({ picture: { entries } });
  assert.equal(pictureChange(at({ what: 'A lamp, dim', items: [] }, { what: 'Code' }), at({ what: 'A lamp, bright', marked: { lit: ['bulb'] }, items: [] }, { what: 'Code' })), 'A lamp, bright, bulb (lit)');
  assert.equal(pictureChange(at({ what: 'Same' }), at({ what: 'Same' })), '');
  assert.equal(pictureChange(undefined, at({ what: 'New.' })), 'New');
});
