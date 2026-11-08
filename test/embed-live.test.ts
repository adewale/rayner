// The live machine's logic, as the player runs it (explain/live.ts and app/embed-live.ts): where a
// machine is live, which of a link's events are kept, how the log sits in a URL, and the picture a log lands on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { Scene, Text, Group, Rectangle } from '../src/index.ts';
import { NullSink, StringSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Sink } from '../src/index.ts';
import { stage, Machine, refuse, view } from '../explain/index.ts';
import { acceptedLog, decodeLog, encodeLog, explore, exploreAndClose, outcomes } from '../app/embed-live.ts';
import type { Exploration } from '../app/embed-live.ts';
import { liveSteps, logStart, runLive } from '../explain/live.ts';
import type { LiveSession } from '../explain/live.ts';
import { Lru } from '../app/embed-lru.ts';
import { pictureChange } from '../explain/trace.ts';

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
  assert.equal(live.get('press')!.identity, live.get('press')!.machine.identity);
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

test('a live run stops as the step ends, plays the log there, and is a function of the log', async () => {
  // Code the scene runs between its last play and its next step runs, as the trace records the step; the next step's never does.
  let ranAfter = 0;
  const Lamp = lampScene({ after: () => { ranAfter++; } });
  const at = liveSteps(await new Lamp(new NullSink()).run()).get('press')!;
  ranAfter = 0;
  const press = 'press';
  const empty = await runLive(Lamp, press, at, []);
  assert.deepEqual(empty.rest, { level: 1 });
  assert.equal(ranAfter, 1, 'the run stopped as the step ended, after the code that follows its last play');
  assert.equal(empty.scene.currentStep?.name, 'press', 'and before the next step began');
  assert.equal(empty.scene.phase, 'stopped', 'the scene is stopped, not merely abandoned');
  // A construct that swallows the stop cannot run on to the next step's code (N10).
  let after = 0;
  class Swallowing extends lampScene() {
    override async construct() {
      try { await super.construct(); } catch { after++; await this.wait(1).catch(() => {}); after++; }
    }
  }
  const swallowed = await runLive(Swallowing, press, at, []);
  assert.equal(swallowed.scene.phase, 'stopped');
  assert.equal(swallowed.scene.frameCount, empty.scene.frameCount, 'no frame after the stop');
  const a = new StringSink(), b = new StringSink();
  const one = await runLive(Lamp, press, at, ['UP', 'DOWN', 'UP'], { sink: a });
  await runLive(Lamp, press, at, ['UP', 'DOWN', 'UP'], { sink: b });
  assert.deepEqual(one.scene.state, { level: 2 });
  assert.equal(svgOf(a), svgOf(b), 'the same log draws the same picture');
  assert.match(JSON.stringify(one.shown), /lamp bright/);
  // Animated, the last event plays frame by frame from the picture before it, and lands on the same picture.
  const frames: string[] = [];
  let started = 0;
  const animated = new StringSink();
  const counting: Sink = { frame: async (scene, dt) => { frames.push(String(dt)); return animated.frame(scene); } };
  await runLive(Lamp, press, at, ['UP', 'DOWN', 'UP'], { animate: counting, onStart: () => { started = frames.length; } });
  assert.equal(started, 1, 'onStart follows the first frame, the picture before the last event');
  assert.ok(frames.length >= 9, `${frames.length} frames: the last event's 0.3 s played`);
  assert.equal(svgOf(animated), svgOf(a), 'an animated landing is the picture a fresh run draws');
  const before = new StringSink();
  await runLive(Lamp, press, at, ['UP', 'DOWN'], { sink: before });
  assert.equal(animated.frames[0], svgOf(before), 'the animation starts from the picture the log before it lands on');
  assert.notEqual(svgOf(before), svgOf(a));
  // From the machine's start, the views are redrawn there first.
  const fromStart = await runLive(Lamp, press, at, ['UP'], { from: 'start' });
  assert.deepEqual(fromStart.scene.state, { level: 1 });
  assert.deepEqual(fromStart.rest, { level: 1 });
  // A log the machine does not take throws, as send does.
  await assert.rejects(runLive(Lamp, press, at, ['UP', 'UP', 'UP']), /refused/);
  await assert.rejects(runLive(Lamp, 'nowhere', at, []), /^RangeError: runLive\(\): the scene never reached the step "nowhere"; give a step the scene's run reaches$/);
});

test('a kept run plays the next event from its picture, landing where a fresh run of the longer log lands', async () => {
  let ranAfter = 0;
  const Lamp = lampScene({ after: () => { ranAfter++; } });
  const press = 'press';
  const at = liveSteps(await new Lamp(new NullSink()).run()).get('press')!;
  ranAfter = 0;
  const kept = await runLive(Lamp, press, at, ['UP'], { keep: true });
  assert.equal(ranAfter, 1, 'the run reached the end of the step');
  const session = kept.session!;
  assert.deepEqual([session.log, session.open, session.busy], [['UP'], true, false]);
  // Skipped, then drawn: the picture of the fresh run of the same log.
  const a = new StringSink(), fresh = new StringSink();
  const down = await session.send('DOWN', { sink: a });
  await runLive(Lamp, press, at, ['UP', 'DOWN'], { sink: fresh });
  assert.deepEqual(down.scene.state, { level: 1 });
  assert.equal(svgOf(a), svgOf(fresh));
  assert.deepEqual(session.log, ['UP', 'DOWN']);
  // Animated: frame by frame from the picture now, onStart after the first, landing on the fresh run's picture.
  const frames: string[] = [], animated = new StringSink(), freshAnimated = new StringSink();
  let started = 0;
  const counting: Sink = { frame: async (scene, dt) => { frames.push(String(dt)); return animated.frame(scene); } };
  const up = await session.send('UP', { animate: counting, onStart: () => { started = frames.length; } });
  await runLive(Lamp, press, at, ['UP', 'DOWN', 'UP'], { animate: freshAnimated });
  assert.equal(started, 1);
  assert.equal(animated.frames[0], svgOf(a), 'the animation starts from the picture the session held');
  assert.deepEqual(animated.frames, freshAnimated.frames, 'every frame is the fresh run’s');
  assert.match(JSON.stringify(up.shown), /lamp bright/);
  assert.equal(up.scene.currentStep?.name, 'press', 'a kept run stays in the step');
  // A refused event fails the send and closes the session; so does close().
  await assert.rejects(session.send('UP'), /refused/);
  assert.equal(session.open, false);
  await assert.rejects(session.send('DOWN'), /^Error: session\.send\(\): this live session is closed or busy; start a fresh run$/);
  const other = (await runLive(Lamp, press, at, [], { keep: true })).session!;
  other.close();
  assert.equal(other.open, false);
  await assert.rejects(other.send('UP'), /closed or busy/);
  // One event at a time.
  const third = (await runLive(Lamp, press, at, [], { keep: true })).session!;
  const first = third.send('UP');
  await assert.rejects(third.send('DOWN'), /closed or busy/);
  await first;
  third.close();
});

test('an event is announced by what it changed of the picture', () => {
  const at = (...entries: object[]) => ({ picture: { entries } });
  assert.equal(pictureChange(at({ what: 'A lamp, bright', marked: { lit: ['bulb'] }, items: [] }, { what: 'Code' }), at({ what: 'A lamp, dim', items: [] }, { what: 'Code' })), 'A lamp, bright, bulb (lit)');
  assert.equal(pictureChange(at({ what: 'Same' }), at({ what: 'Same' })), '');
  assert.equal(pictureChange(at({ what: 'New.' }), undefined), 'New');
  // A thing that only moved in the list is not news; one whose parts changed is.
  assert.equal(pictureChange(at({ what: 'Code', items: ['a'] }, { what: 'A lamp', items: [] }), at({ what: 'A lamp', items: [] }, { what: 'Code', items: ['a'] })), '');
  assert.equal(pictureChange(at({ what: 'Code', items: ['b'] }, { what: 'A lamp', items: [] }), at({ what: 'A lamp', items: [] }, { what: 'Code', items: ['a'] })), 'Code');
  // In the picture's language: French sets a no-break space before the semicolon between things.
  const fr = (...entries: object[]) => ({ picture: { entries, lang: 'fr' } });
  assert.equal(pictureChange(fr({ what: 'Une lampe', items: ['x'] }, { what: 'Du code', items: ['y'] }), fr()), 'Une lampe\u202f; Du code');
});

/** A held run as the player sees it: its log, whether it is open or playing, and whether it was closed. */
function fakeSession(log: string[], { busy = false } = {}) {
  const s = { log, open: true, busy, closed: 0, send: () => Promise.reject(new Error('not played')), close() { s.open = false; s.closed++; } };
  return s as typeof s & LiveSession;
}

test('the exploration: one transition for send, undo, reset, link, held and leave, which keeps a held run only while it can play the next event, at its own step', () => {
  const now = { step: 'press' };
  const none: Exploration<typeof now> = { kind: 'none' };
  const linked = explore(none, { kind: 'link', now, log: ['UP'] });
  assert.deepEqual(linked, { kind: 'live', now, log: ['UP'], session: null });
  // Sending, Undo and Reset change nothing when no step is live, and Undo and Reset nothing with nothing sent.
  for (const action of [{ kind: 'send', event: 'UP' }, { kind: 'undo' }, { kind: 'reset' }] as const) assert.equal(explore(none, action), none);
  const empty = explore(none, { kind: 'link', now, log: [] });
  assert.equal(explore(empty, { kind: 'undo' }), empty);
  assert.equal(explore(empty, { kind: 'reset' }), empty);

  // A run held at the log's picture is taken; one held for another log is not.
  const held = fakeSession(['UP']);
  const holding = exploreAndClose(linked, { kind: 'held', now, session: held });
  assert.equal(holding.kind === 'live' && holding.session, held);
  const stale = fakeSession(['UP', 'DOWN']);
  assert.equal(exploreAndClose(holding, { kind: 'held', now, session: stale }), holding);
  assert.equal(stale.closed, 1, 'a run held for a log no longer on show is closed, not kept');
  const orphan = fakeSession([]);
  assert.equal(exploreAndClose(none, { kind: 'held', now, session: orphan }), none);
  assert.equal(orphan.closed, 1, 'a run that arrives when nothing is live is closed');
  // A run held at another step is not taken, even when its log matches the one on show: the reader
  // moved from step A to step B, both with nothing sent, and A's run arrives late.
  const a = { step: 'a' }, b = { step: 'b' };
  const atB = explore({ kind: 'none' } as Exploration<typeof a>, { kind: 'link', now: b, log: [] });
  const late = fakeSession([]);
  assert.equal(exploreAndClose(atB, { kind: 'held', now: a, session: late }), atB);
  assert.equal(late.closed, 1, 'a run held for another step is closed, not kept');
  const ours = fakeSession([]);
  assert.equal((exploreAndClose(atB, { kind: 'held', now: b, session: ours }) as { session: unknown }).session, ours);

  // A send keeps an idle run at the log before the event: it plays the event from there.
  const sent = exploreAndClose(holding, { kind: 'send', event: 'DOWN' });
  assert.deepEqual(sent, { kind: 'live', now, log: ['UP', 'DOWN'], session: held });
  assert.equal(held.closed, 0);
  // A send while the run still plays (an animated landing cut short) drops it, closed.
  const playing = fakeSession(['UP'], { busy: true });
  const cut = exploreAndClose({ kind: 'live', now, log: ['UP'], session: playing }, { kind: 'send', event: 'DOWN' });
  assert.deepEqual(cut, { kind: 'live', now, log: ['UP', 'DOWN'], session: null });
  assert.equal(playing.closed, 1);
  // A run whose picture is behind the log (a landing drawn from the kept pictures) cannot play the next event.
  const behind = fakeSession(['UP']);
  assert.equal((exploreAndClose({ kind: 'live', now, log: ['UP', 'DOWN'], session: behind }, { kind: 'send', event: 'UP' }) as { session: unknown }).session, null);
  assert.equal(behind.closed, 1);

  // Undo and Reset go back past the held picture, even while it plays: the run is closed.
  for (const action of [{ kind: 'undo' }, { kind: 'reset' }] as const) {
    const run = fakeSession(['UP', 'DOWN'], { busy: true });
    const after = exploreAndClose({ kind: 'live', now, log: ['UP', 'DOWN'], session: run }, action);
    assert.deepEqual(after, { kind: 'live', now, log: action.kind === 'undo' ? ['UP'] : [], session: null });
    assert.equal(run.closed, 1, `${action.kind} closes the run`);
  }
  // Leaving the step, and a link to another log, close the held run.
  for (const action of [{ kind: 'leave' }, { kind: 'link', now, log: [] }] as const) {
    const run = fakeSession(['UP']);
    exploreAndClose({ kind: 'live', now, log: ['UP'], session: run }, action);
    assert.equal(run.closed, 1, `${action.kind} closes the run`);
  }
});

test('leaving a live step lets its held run end: the scene paused in the step finishes', async () => {
  const Lamp = lampScene();
  const press = 'press';
  let ended = false;
  class Watched extends Lamp {
    override async run() {
      try { return await super.run(); } finally { ended = true; }
    }
  }
  const run = await runLive(Watched, press, liveSteps(await new Lamp(new NullSink()).run()).get('press')!, ['UP'], { keep: true });
  const live = exploreAndClose({ kind: 'none' } as Exploration<string>, { kind: 'link', now: 'press', log: ['UP'] });
  const holding = exploreAndClose(live, { kind: 'held', now: 'press', session: run.session! });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ended, false, 'held: the run waits in the step');
  exploreAndClose(holding, { kind: 'leave' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ended, true, 'left: the run ended');
  assert.equal(run.session!.open, false);
});

test('the kept pictures hold the most recently used eight, dropping the oldest', () => {
  const lru = new Lru<string, number>(3);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.set('c', 3);
  assert.equal(lru.get('a'), 1, 'reading makes an entry the newest');
  lru.set('d', 4);
  assert.deepEqual(lru.keys(), ['c', 'a', 'd'], 'b, the least recently used, went');
  lru.set('c', 5);
  assert.deepEqual(lru.keys(), ['a', 'd', 'c']);
  assert.equal(lru.get('b'), undefined);
  lru.clear();
  assert.deepEqual(lru.keys(), []);
  assert.throws(() => new Lru(0), /new Lru\(\): size 0 is not a positive integer/);
  // However many pictures a reader visits, the player holds at most eight.
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 30 }), { maxLength: 80 }), (visits) => {
    const kept = new Lru<number, number>(8);
    for (const v of visits) if (kept.get(v) === undefined) kept.set(v, v);
    assert.ok(kept.keys().length <= 8);
    const recent = [...new Set([...visits].reverse())].slice(0, 8);
    assert.deepEqual(new Set(kept.keys()), new Set(recent));
  }));
});

test('a live run drives the same machine it was given: same events in the same order, same start, same views, or it is refused', async () => {
  // A scene whose machine's events swap order on every run: the same index names another machine.
  // Before, the player took whatever machine the index named.
  let runs = 0;
  class Swapping extends Scene<Lamp> {
    override state = { level: 0 };
    override async construct() {
      const picture = view(this, (st: Lamp) => Object.assign(new Group(Object.assign(new Text(`lamp ${LEVELS[st.level]}`, { fontSize: 0.5 }), { key: 'lamp:word' })), { key: 'lamp' }));
      this.add(picture);
      const events: Press[] = runs++ % 2 ? ['DOWN', 'UP'] : ['UP', 'DOWN'];
      const machine = new Machine<Lamp, Press>(this, { start: { level: 0 }, events, views: [picture], runTime: 0.2, next: (st, e) => ({ level: e === 'UP' ? Math.min(2, st.level + 1) : Math.max(0, st.level - 1) }) });
      await this.step('press', { caption: 'Press.' });
      await this.play(machine.replay(['UP']));
    }
  }
  const press = 'press';
  runs = 0;
  const at = liveSteps(await new Swapping(new NullSink()).run()).get('press')!;
  await assert.rejects(runLive(Swapping, press, at, []), /^Error: runLive\(\): the run to "press" made different machines; a scene must make the same machines on every run$/);
  // The next run makes the first order again: the same machine, which plays.
  assert.deepEqual((await runLive(Swapping, press, at, ['UP'])).rest, { level: 1 });
  // Identity reads events in order, the start and the views' keys.
  const scene = new Scene<Lamp>(new NullSink());
  const spec = { start: { level: 0 }, next: (s: Lamp) => s, views: [] };
  const id = (o: object) => new Machine(scene, { ...spec, events: ['UP', 'DOWN'], ...o }).identity;
  assert.equal(id({}), id({}));
  assert.notEqual(id({}), id({ events: ['DOWN', 'UP'] }));
  assert.notEqual(id({}), id({ start: { level: 1 } }));
  assert.equal(id({ start: { level: 0, x: 1 } }), id({ start: { x: 1, level: 0 } }), 'a start written in another key order is the same start');
});
