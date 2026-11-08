// Stage and diagram actions (explain/action.ts): each is awaitable and composable. Awaited, it
// plays its beats as separate plays, as it always has; composed, it plays in a play, a Succession
// or a group, with the same side effects between its animations. It plays once, and an action
// never played by the end of its step fails the scene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Succession, FadeIn, Circle, Rectangle, AnimationGroup } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import { stage, Diagram } from '../explain/index.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { diagramKey, snapshotResolver, useDiagrams } from '../integrations/agentic-mermaid/snapshot.ts';
import { fixedSnapshot, square } from './lib/random-snapshot.ts';

await loadFonts();

const spec = { source: 'graph LR\nA --> B', style: 'nord' };
function fixture(): DiagramSnapshot {
  const shape = (x: number) => square(x, { fill: '#fff', stroke: '#000' });
  return fixedSnapshot(
    spec,
    [
      { id: 'A', role: 'node', kind: 'shape', shapes: [shape(0)] },
      { id: 'B', role: 'node', kind: 'shape', shapes: [shape(3)] },
      { id: 'edge:A->B#0', role: 'edge', kind: 'connector', shapes: [shape(1)], from: 'A', to: 'B', route: [[0.25, 0], [2.75, 0]] },
    ],
    { palette: { paper: '#123456', ink: '#fff', accent: '#ff0', muted: '#aaa' } },
  );
}
/** A scene with a stage and the fixture's snapshot bound, at 30 fps, and its frames counted. */
function setUp() {
  const scene = new Scene(new NullSink());
  useDiagrams(scene, snapshotResolver({ [diagramKey(spec)]: fixture() }));
  return { scene, s: stage(scene, { heading: false }) };
}

test('an awaited action plays each beat in a play of its own; composed in a Succession, its beats run one after another in one play', async () => {
  // Awaited: a walk of one hop is three plays (token in, move, token out), each rounded to whole frames.
  const a = setUp();
  const d = await a.s.show(spec, { build: 'frame' });
  await d.reveal('rest');
  const before = a.scene.frameCount;
  await d.walk([['A', 'B']]);
  const fps = a.scene.fps;
  assert.equal(a.scene.frameCount - before, 2 * Math.round(0.18 * fps) + Math.round(0.8 * fps));
  assert.deepEqual(a.scene.stateJson().walks, [{ from: 'A', to: 'B', edge: 'edge:A->B#0' }]);

  // Composed: a Succession of an entry, a reveal and the walk is one play of their summed run time,
  // and the walk is recorded at the same moment, after its move.
  const b = setUp();
  const e = await b.s.show(spec, { build: 'frame' });
  const dot = new Circle({ radius: 0.2 });
  const start = b.scene.frameCount;
  await b.scene.play(new Succession([b.s.enter(dot, { runTime: 0.5 }), e.reveal('rest'), e.walk([['A', 'B']])]));
  const reveal = 0.65 + 2 * 0.12 * 0.65;
  assert.equal(b.scene.frameCount - start, Math.round((0.5 + reveal + 0.18 + 0.8 + 0.18) * fps));
  assert.deepEqual(b.scene.stateJson().walks, [{ from: 'A', to: 'B', edge: 'edge:A->B#0' }]);
  assert.ok(e.visible.has('B') && b.scene.familyMembers().includes(dot));
  // The token faded out and left the diagram, as an awaited walk's does.
  assert.equal(e.root.family().filter((m) => m.constructor.name === 'Dot').length, 0);
});

test('actions play together in one play: a camera move beside a walk, and a value read before the play', async () => {
  const { scene, s } = setUp();
  const d = await s.show(spec);
  const card = s.card([['field', '1']], { at: [-5, -2] });
  // A card's value is there as soon as the action is made, so it can be placed or read before the play.
  assert.equal(card.value.values.get('field')?.text, '1');
  const before = scene.frameCount;
  await scene.play(s.focus(d.get('A')), d.walk([['A', 'B']]), card);
  // One play lasts as long as its longest member: the walk (0.18 + 0.8 + 0.18 s).
  assert.equal(scene.frameCount - before, Math.round((0.18 + 0.8 + 0.18) * scene.fps));
  assert.ok(scene.familyMembers().includes(card.value), 'the card was faded in and kept');
  assert.notDeepEqual(scene.frame.box(), [-8, -4.5, 8, 4.5], 'the camera moved');
  assert.equal((scene.stateJson().walks as unknown[]).length, 1);
});

test('s.show composes in play(), which waits for the layout it reads, and gives its diagram once it begins', async () => {
  const { scene, s } = setUp();
  const shown = s.show(spec);
  assert.throws(() => shown.value, /once the play that holds it begins/);
  const box = new Rectangle({ width: 1, height: 1 });
  await scene.play(shown, s.enter(box));
  assert.ok(shown.value instanceof Diagram);
  assert.ok(scene.mobjects.includes(shown.value.root) && shown.value.visible.has('B'));
});

test('s.show composes inside a Succession or group: the play waits for its layout, then lays out its turn', async () => {
  // In a Succession built before its layout is read: the box enters, then the diagram builds, one play of their summed time.
  const a = setUp();
  const box = new Rectangle({ width: 1, height: 1 });
  const shown = a.s.show(spec);
  const inTurn = new Succession([a.s.enter(box, { runTime: 0.5 }), shown]);
  const start = a.scene.frameCount;
  await a.scene.play(inTurn);
  assert.ok(shown.runTime > 0, 'its run time is known once the play began');
  assert.equal(a.scene.frameCount - start, Math.round((0.5 + shown.runTime) * a.scene.fps), 'the entry, then the build, in one play');
  assert.ok(shown.value instanceof Diagram && a.scene.mobjects.includes(shown.value.root));
  // Nested in a group inside a Succession: the group's members' layout is waited for too.
  const b = setUp();
  const nested = b.s.show(spec);
  await b.scene.play(new Succession([new AnimationGroup([nested, b.s.enter(new Circle({ radius: 0.2 }))])]));
  assert.ok(nested.value instanceof Diagram && b.scene.mobjects.includes(nested.value.root));
});

test('an action plays once: a second play, or awaiting one that played in a play, is refused', async () => {
  const { scene, s } = setUp();
  const entry = s.enter(new Circle({ radius: 0.3 }));
  await scene.play(entry);
  await assert.rejects(scene.play(entry), /s\.enter\(\): it has already played in a play; an action plays once/);
  await assert.rejects(async () => entry, /already played in a play[^]*read what it gave from its value/);
  const card = s.card([['k', 'v']]);
  const value = await card;
  assert.equal(await card, value, 'awaiting it again gives the same card, without a second play');
  await assert.rejects(scene.play(card), /s\.card\(\): it has already played; an action plays once/);
  // A Succession that holds it twice is refused before either plays.
  const pin = s.pin([0, 0]);
  await assert.rejects(scene.play(new Succession([pin, pin])), /this\.play\(\): s\.pin\(\) is listed twice in one play/);
  await scene.play(pin);
});

test('an action made but never played fails its step, and the scene at its end', async () => {
  class Forgot extends Scene {
    override async construct() {
      const s = stage(this, { heading: false });
      await this.step('one');
      s.enter(new Circle({ radius: 0.3 }));
      await this.step('two');
    }
  }
  await assert.rejects(new Forgot(new NullSink()).run(), /s\.enter\(\): it was made in step "one" but never played; await an action, or hand it to play\(\)/);
  class AtTheEnd extends Scene {
    override async construct() {
      const s = stage(this, { heading: false });
      await this.step('only');
      // Built into a group that never plays: still never played.
      new AnimationGroup([s.clear(), new FadeIn(new Circle())]);
    }
  }
  await assert.rejects(new AtTheEnd(new NullSink()).run(), /s\.clear\(\): it was made in step \"only\" but never played/);
  class Played extends Scene {
    override async construct() {
      const s = stage(this, { heading: false });
      await this.step('only');
      const later = s.note('kept for the next play');
      await this.play(new Succession([later]));
    }
  }
  await new Played(new NullSink()).run();
});

test('an action’s errors surface when it plays, awaited or composed, not when it is called', async () => {
  const { scene, s } = setUp();
  const d = await s.show(spec, { build: 'frame' });
  const walk = d.walk([['B', 'A']]);
  await assert.rejects(async () => walk, /d\.walk\(\): B -> A is not a link of this diagram/);
  // Revealed by the reveal before it in the same Succession: a walk checks its links when it plays.
  await scene.play(new Succession([d.reveal(['A', 'B', 'edge:A->B#0']), d.walk([['A', 'B']])]));
  assert.equal((scene.stateJson().walks as unknown[]).length, 1);
  await assert.rejects(scene.play(s.focus([])), /nothing to look at/);
});

test('an action that waits, made in a machine transition, plays there: the play waits for it as its turn comes, and draws the same frames', async () => {
  const { Machine } = await import('../explain/machine.ts');
  const { view } = await import('../explain/view.ts');
  const { Action } = await import('../explain/action.ts');
  const { StringSink } = await import('../src/svg.ts');
  // A late action, waiting on `ready` as s.show does while it reads a diagram's layout, or the same action reading nothing.
  const fade = (scene: InstanceType<typeof Scene>, n: number, waits: boolean) =>
    new Action(scene, 's.show()', () => ({ value: undefined, beats: [{ runTime: 0.2, play: () => [new FadeIn(new Circle({ radius: 0.2 }).moveTo([n, -2]), { runTime: 0.2 })] }] }),
      waits ? { ready: new Promise((r) => setTimeout(r, 5)), late: true } : {});
  const run = async (waits: boolean) => {
    class InTransition extends Scene<{ n: number }> {
      override async construct() {
        this.state = { n: 0 };
        const v = view(this, (s: { n: number }) => new Circle({ radius: 0.5 + s.n / 10 }));
        // The second event's transition is made only once the first has landed, mid-play: the play waits for it there.
        const m = new Machine(this, { start: { n: 0 }, events: ['UP'], next: (s) => ({ n: s.n + 1 }), views: [v], transition: { UP: (t) => fade(this, t.after.n, waits) } });
        await this.step('a');
        this.add(v);
        await this.play(m.replay(['UP', 'UP']));
      }
    }
    const sink = new StringSink();
    const scene = new InTransition(sink);
    await scene.run();
    return { frames: sink.frames, n: scene.state.n };
  };
  const waiting = await run(true), immediate = await run(false);
  assert.equal(waiting.n, 2);
  assert.ok(waiting.frames.length > 0);
  assert.deepEqual(waiting.frames, immediate.frames, 'waiting changes nothing the frames show');

  // A real s.show, reading its diagram's layout, as a transition.
  const { scene: bare, s } = setUp();
  const scene = bare as unknown as Scene<{ n: number }>;
  const v = view(scene, (st: { n: number }) => new Circle({ radius: 0.5 + st.n / 10 }));
  scene.state = { n: 0 };
  let shown: ReturnType<typeof s.show> | null = null;
  const m = new Machine(scene, { start: { n: 0 }, events: ['UP'], next: (st: { n: number }) => ({ n: st.n + 1 }), views: [v], transition: { UP: () => (shown = s.show(spec)) } });
  scene.add(v);
  await scene.play(m.send('UP'));
  assert.ok(shown!.value instanceof Diagram && scene.mobjects.includes(shown!.value.root));
});

test('what an action or a machine transition makes as its turn comes has one writer per mobject too, checked against what else the play drives then', async () => {
  const { Action } = await import('../explain/action.ts');
  const { Machine } = await import('../explain/machine.ts');
  const { view } = await import('../explain/view.ts');
  const { FadeOut, Transform } = await import('../src/index.ts');
  const { scene } = setUp();
  const fadeIn = (c: Circle, runTime = 1) => new Action(scene, 'x()', () => ({ value: undefined, beats: [{ runTime, play: () => [new FadeIn(c, { runTime })] }] }));
  // The seeded defect: a beat fades in the circle a FadeOut beside it in the same play fades out.
  // Without the check, the play is accepted and whichever writes last wins.
  const c = new Circle();
  const beside = fadeIn(c);
  await assert.rejects(scene.play(beside, new FadeOut(c)), /^Error: this\.play\(\): a FadeOut and a FadeIn, made by x\(\) as its turn came, both animate a Circle; one play can drive a mobject only once, so sequence them, or combine them into one Transform$/);
  // Begun later, at its turn in a Succession beside the beat: refused as it begins.
  const d = new Circle(), later = fadeIn(d);
  await assert.rejects(scene.play(later, new Succession([new FadeIn(new Circle(), { runTime: 0.5 }), new FadeOut(d, { runTime: 0.5 })])), /a FadeIn and a FadeOut both animate a Circle/);
  // Two animations one beat makes, on one mobject.
  const e = new Circle();
  const twice = new Action(scene, 'y()', () => ({ value: undefined, beats: [{ runTime: 1, play: () => [new FadeIn(e), new FadeOut(e)] }] }));
  await assert.rejects(scene.play(twice), /^Error: this\.play\(\): a FadeIn and a FadeOut both animate a Circle/);
  // A machine's transition, made at its turn, against an animation beside the machine.
  const counting = scene as unknown as Scene<{ n: number }>;
  counting.state = { n: 0 };
  const v = view(counting, (st: { n: number }) => new Circle({ radius: 0.5 + st.n / 10 }));
  scene.add(v);
  const ring = new Circle({ radius: 2 });
  scene.add(ring);
  const m = new Machine(counting, { start: { n: 0 }, events: ['UP'], next: (st: { n: number }) => ({ n: st.n + 1 }), views: [v], transition: { UP: () => new AnimationGroup([v.sync(), new Transform(ring, new Circle({ radius: 1 }))]) } });
  await assert.rejects(scene.play(m.send('UP'), new FadeOut(ring)), /made by machine\.send\(\): the transition for UP as its turn came, both animate a Circle/);
  // Sequenced, the same writers are fine: the beat, then the FadeOut.
  const f = new Circle();
  await scene.play(new Succession([fadeIn(f), new FadeOut(f)]));
  assert.ok(!scene.familyMembers().includes(f), 'faded in, then out');
});

test('an action’s life: a begin refused while what it reads is not ready, or because deciding it failed, leaves it unplayed', async () => {
  const { Action } = await import('../explain/action.ts');
  const { scene } = setUp();
  const circle = new Circle();
  let open!: () => void;
  const ready = new Promise<void>((r) => (open = r));
  const late = new Action(scene, 'z()', () => ({ value: 7, beats: [{ runTime: 0.2, play: () => [new FadeIn(circle, { runTime: 0.2 })] }] }), { ready, late: true });
  // Reading: its value is not known, and a begin outside a play, which waits for nothing, is refused.
  assert.throws(() => late.value, /^Error: z\(\): what it gives is known once the play that holds it begins/);
  assert.throws(() => late.begin(), /^Error: z\(\): begun before what it reads was ready; hand it to play\(\), or to a Succession or group that plays, which waits for it$/);
  assert.throws(() => late.settle(), /^Error: z\(\): played before what it reads was ready/);
  assert.equal(late.phase, 'idle');
  // Ready, it plays in a play: the refused begin did not mark it played.
  open();
  await scene.play(late);
  assert.equal(late.value, 7);
  assert.equal(circle.style.opacity, 1);
  // Ended: a second play is refused, as is awaiting it.
  await assert.rejects(scene.play(late), /z\(\): it has already played in a play/);
  await assert.rejects(async () => late, /z\(\): it has already played in a play; [^]*read what it gave from its value$/);

  // Deciding it failed: each play throws that error, and none marks it played.
  let tries = 0;
  const broken = new Action(scene, 'w()', () => { tries++; throw new RangeError('w(): nothing to do'); });
  assert.equal(tries, 1, 'decided when it is made');
  await assert.rejects(scene.play(broken), /^RangeError: w\(\): nothing to do$/);
  await assert.rejects(scene.play(broken), /^RangeError: w\(\): nothing to do$/);
  assert.throws(() => broken.value, /^RangeError: w\(\): nothing to do$/);
  await assert.rejects(async () => broken, /^RangeError: w\(\): nothing to do$/);
  // Awaited, it was played, so a play now is refused as a second play.
  await assert.rejects(scene.play(broken), /w\(\): it has already played; an action plays once/);
  assert.equal(tries, 1, 'decided once');

  // What it reads failing is its error, when deciding it did not fail first.
  const unreadable = new Action(scene, 'u()', () => ({ value: undefined, beats: [] }), { ready: Promise.reject(new Error('u(): the layout could not be read')), late: true });
  await assert.rejects(scene.play(unreadable), /^Error: u\(\): the layout could not be read$/);
  // Awaited: it plays itself beat by beat, then ends; awaiting it again gives the same value.
  const awaited = new Action(scene, 'v()', () => ({ value: 'done', beats: [{ runTime: 0.1, play: () => [new FadeIn(new Circle(), { runTime: 0.1 })] }] }));
  assert.equal(await awaited, 'done');
  assert.equal(await awaited, 'done');
  await assert.rejects(scene.play(awaited), /v\(\): it has already played; an action plays once/);
});

test('the diagrams a scene made are counted on that scene, so another run in the same process never changes what a page needs', async () => {
  const { diagramsOn } = await import('../explain/diagrams.ts');
  const a = setUp(), b = setUp();
  assert.deepEqual([diagramsOn(a.scene), diagramsOn(b.scene)], [0, 0]);
  await a.s.show(spec, { build: 'frame' });
  // Before, one counter for the whole process: b's collection, running meanwhile, would have seen a's diagram.
  assert.deepEqual([diagramsOn(a.scene), diagramsOn(b.scene)], [1, 0]);
  await b.s.show(spec, { build: 'frame' });
  await b.s.show(spec, { build: 'frame', box: 'left' });
  assert.deepEqual([diagramsOn(a.scene), diagramsOn(b.scene)], [1, 2]);
});
