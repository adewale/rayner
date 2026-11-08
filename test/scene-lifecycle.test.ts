// The scene's and an animation's lifecycles as data (src/scene.ts, src/animation.ts): an animation's
// phase (idle, begun, finished), the scene's phase (one play, wait or step at a time), each step's
// exact hold and rest frames, the step-end hook, step metadata as a function of the step before,
// and the timeline's preconditions (fps, run times, lag ratios, waits, steps that draw a frame).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Circle, Rectangle, FadeIn, FadeOut, Create, AnimationGroup, Succession, Transform, DecimalNumber, Text } from '../src/index.ts';
import { thereAndBack } from '../src/rate.ts';
import { NullSink, SnapshotSink, renderAt, StopScene } from '../src/output.ts';
import { traceScene } from '../src/testing.ts';
import { captionWords, stillFrame } from '../src/scene.ts';
import type { Step } from '../src/index.ts';
import { loadFonts } from '../explain/testing.ts';

await loadFonts();

// ---- the animation's phase ------------------------------------------------

test('an animation listed twice in one play is refused before anything begins (the double begin that left a circle invisible)', async () => {
  const scene = new Scene(new NullSink());
  const circle = new Circle({ radius: 1 }), other = new Rectangle();
  const f = new FadeIn(circle);
  await assert.rejects(scene.play(new AnimationGroup([f, new FadeIn(other)]), f), /this\.play\(\): a FadeIn is listed twice in one play; an animation plays once/);
  assert.equal(f.phase, 'idle', 'nothing began');
  // Listed twice inside one Succession too.
  const g = new FadeIn(new Circle());
  await assert.rejects(scene.play(new Succession([g, g])), /listed twice in one play/);
  // Played alone, the same FadeIn draws the circle.
  await scene.play(f);
  assert.equal(circle.style.opacity, 1);
  assert.equal(f.phase, 'finished');
});

test('an animation begins once at a time, and interpolates and finishes only once begun; a finished one may play again', () => {
  const a = new FadeIn(new Circle());
  assert.equal(a.phase, 'idle');
  assert.throws(() => a.interpolate(0.5), /animation\.interpolate\(\): a FadeIn has not begun; begin\(\) it first/);
  assert.throws(() => a.finish(), /animation\.finish\(\): a FadeIn has not begun/);
  a.begin();
  assert.equal(a.phase, 'begun');
  assert.throws(() => a.begin(), /animation\.begin\(\): a FadeIn has already begun/);
  a.interpolate(0.5);
  a.finish();
  assert.equal(a.phase, 'finished');
  assert.throws(() => a.finish(), /has already finished/);
  assert.throws(() => a.interpolate(0.2), /has finished/);
  a.begin();
  a.finish();
  assert.equal(a.phase, 'finished', 'replayed');
});

test('a begin() that throws leaves the animation idle, to begin again', () => {
  let fail = true;
  class Flaky extends FadeIn {
    override begin(): void {
      if (fail) throw new Error('flaky');
      super.begin();
    }
  }
  const a = new Flaky(new Circle());
  assert.throws(() => a.begin(), /flaky/);
  assert.equal(a.phase, 'idle');
  fail = false;
  a.begin();
  assert.equal(a.phase, 'begun');
});

// ---- the scene's phase -----------------------------------------------------

test('two plays started together are refused, not interleaved: await each', async () => {
  class Together extends Scene {
    override async construct() {
      await this.step('both');
      await Promise.all([this.play(new FadeIn(new Circle())), this.play(new FadeIn(new Rectangle()))]);
    }
  }
  await assert.rejects(new Together(new NullSink()).run(), /this\.play\(\): a play\(\) is still running; await each play\(\), wait\(\) and step\(\) before the next/);
  class PlayDuringWait extends Scene {
    override async construct() {
      await this.step('both');
      void this.wait(1);
      await this.play(new FadeIn(new Circle()));
    }
  }
  await assert.rejects(new PlayDuringWait(new NullSink()).run(), /this\.play\(\): a wait\(\) is still running/);
});

test('a step begun without await is refused, so steps are never recorded out of order', async () => {
  const order: string[] = [];
  class Unawaited extends Scene {
    override async construct() {
      await this.step('a');
      await this.play(new FadeIn(new Circle()));
      void this.step('b');
      await this.step('c');
    }
  }
  const scene = new Unawaited({ async frame() {}, async stepBegin(_s, step) { order.push(step.name); } });
  await assert.rejects(scene.run(), /this\.step\(\): a step\(\) is still running; await each/);
  assert.deepEqual(order, ['a', 'b'], 'b began; c, called while b was beginning, was refused, not recorded before it');
  // A play not awaited at the end of construct() is refused as the scene ends.
  class Trailing extends Scene {
    override async construct() {
      await this.step('only');
      void this.play(new FadeIn(new Circle()));
    }
  }
  await assert.rejects(new Trailing(new NullSink()).run(), /this\.construct\(\): a play\(\) is still running/);
});

test('a step listener may play and wait in the step: onStep opens it, onStepEnd adds to it before its hold', async () => {
  const seen: string[] = [];
  class Listened extends Scene {
    override async construct() {
      this.onStep(async (s) => {
        seen.push(`begin ${s.name} ${this.phase}`);
        await this.play(new FadeIn(new Circle({ radius: 0.1 })), { runTime: 0.2 });
      });
      this.onStepEnd(async (s) => {
        seen.push(`end ${s.name} ${this.phase} current=${this.currentStep?.name}`);
        await this.wait(0.1);
      });
      await this.step('one', { caption: 'one two three four five six seven eight' });
      await this.play(new FadeIn(new Rectangle()), { runTime: 0.5 });
    }
  }
  const scene = await new Listened(new NullSink()).run();
  assert.deepEqual(seen, ['begin one beginning-step', 'end one ending-step current=one']);
  const [one] = scene.steps as [Step];
  // 0.2 s heading, 0.5 s play, 0.1 s end listener: 24 frames of motion, then the hold to 3 s.
  assert.equal(one.holdFrame, 24);
  assert.equal(one.hold, 24 / 30);
  assert.equal(one.frame1, 90);
  assert.equal(stillFrame(one), 24);
  assert.equal(scene.phase, 'idle');
});

test('onStepEnd: a listener that throws stops the step from ending; its remover removes only it', async () => {
  class Refuses extends Scene {
    override async construct() {
      this.onStepEnd((s) => { throw new Error(`not yet: ${s.name}`); });
      await this.step('one');
      await this.wait(0.1);
      await this.step('two');
    }
  }
  await assert.rejects(new Refuses(new NullSink()).run(), /not yet: one/);
  let calls = 0;
  class Removed extends Scene {
    override async construct() {
      const off = this.onStepEnd(() => { calls++; });
      this.onStepEnd(() => { calls += 10; });
      await this.step('one');
      await this.wait(0.1);
      off();
      await this.step('two');
      await this.wait(0.1);
    }
  }
  await new Removed(new NullSink()).run();
  assert.equal(calls, 20);
});

test('a stopped scene reports its phase, and refuses every call', async () => {
  class Stops extends Scene {
    override async construct() {
      await this.step('one');
      await this.wait(1);
    }
  }
  let n = 0;
  const scene = new Stops({ async frame() { if (++n === 3) throw new StopScene(); } });
  await scene.run();
  assert.equal(scene.phase, 'stopped');
  await assert.rejects(scene.wait(0.1), StopScene);
});

// ---- frames on Step, and the trace -----------------------------------------

test('each step records its hold and rest frames exactly, and the trace carries them', async () => {
  class Timed extends Scene {
    override async construct() {
      await this.step('held', { caption: 'A caption long enough to hold the picture after the play ends.' });
      await this.play(new FadeIn(new Circle()), { runTime: 0.5 });
      await this.step('unheld');
      await this.play(new FadeOut(new Circle()), { runTime: 0.4 });
    }
  }
  const trace = await traceScene(Timed);
  const [held, unheld] = trace.steps;
  assert.equal(held!.holdFrame, 15);
  assert.ok(held!.frame1! > held!.holdFrame!);
  assert.equal(stillFrame(held!), held!.holdFrame);
  // With no hold there is no hold frame, and the picture stops on the last frame.
  assert.equal(unheld!.hold, undefined);
  assert.equal(unheld!.holdFrame, undefined);
  assert.equal(stillFrame(unheld!), unheld!.frame1);
  assert.equal(unheld!.frame1, unheld!.frame0 + 12);
  // A seek to the rest frame draws the frame a full run draws there.
  const frames: string[] = [];
  const full = new SnapshotSink();
  await new Timed({ async frame(scene) { await full.frame(scene); frames[scene.frameCount] = full.svg; } }).run();
  for (const s of trace.steps) {
    const sink = new SnapshotSink();
    await renderAt(Timed, s.frame1! / trace.fps, sink);
    assert.equal(sink.svg, frames[s.frame1!], s.step);
  }
});

test('a step that draws no frame of its own rests on the frame it began (collection refuses one; see explain-gates)', async () => {
  class Empty extends Scene {
    override async construct() {
      await this.step('one');
      await this.wait(0.5);
      await this.step('nothing');
      await this.step('three', { caption: 'Words to read.' });
    }
  }
  const trace = await traceScene(Empty);
  const nothing = trace.steps[1]!;
  assert.equal(nothing.frame1, nothing.frame0);
  assert.equal(nothing.frame1, trace.steps[0]!.frame1, 'the step before\'s last frame');
  // A caption alone holds, so the step draws its own frames.
  assert.ok(trace.steps[2]!.frame1! > trace.steps[2]!.frame0);
});

// ---- step metadata ---------------------------------------------------------

test('step metadata may be a function of the step it closes, called once that step has held for its caption', async () => {
  let closed: Step | null | undefined;
  class Reports extends Scene {
    override async construct() {
      await this.step('first', (before) => ((closed = before), { caption: 'Three short words.' }));
      assert.equal(closed, null, 'no step before the first');
      await this.play(new FadeIn(new Circle()), { runTime: 0.2 });
      await this.step('second', (before) => ({ caption: `The step before ended at frame ${before!.frame1}, held from ${before!.holdFrame}.` }));
      await this.wait(0.2);
    }
  }
  const scene = await new Reports(new NullSink()).run();
  const [first, second] = scene.steps as [Step, Step];
  assert.equal(second.meta.caption, `The step before ended at frame ${first.frame1}, held from ${first.holdFrame}.`);
  assert.ok(first.hold != null && first.frame1! > first.holdFrame!);
});

test('step metadata is copied as JSON when the step begins: a later change rewrites nothing, and non-JSON is refused', async () => {
  const meta = { caption: 'Two words.', list: [1, 2] };
  class Mutates extends Scene {
    override async construct() {
      await this.step('one', meta);
      meta.list.push(3);
      meta.caption = 'changed';
      await this.wait(0.2);
    }
  }
  const trace = await traceScene(Mutates);
  assert.deepEqual(trace.steps[0]!.meta, { caption: 'Two words.', list: [1, 2] });
  class Fn extends Scene {
    override async construct() { await this.step('one', { caption: 'x', at: () => 1 } as never); }
  }
  await assert.rejects(new Fn(new NullSink()).run(), /this\.step\(\): its metadata\.at must contain finite, acyclic JSON data/);
  class NotObject extends Scene {
    override async construct() { await this.step('one', () => 3 as never); }
  }
  await assert.rejects(new NotObject(new NullSink()).run(), /this\.step\(\): the metadata of step "one" must be an object, or a function of the step before that returns one/);
});

// ---- timeline gates --------------------------------------------------------

test('fps must be above 0 and at most 240, where a trace time rounded to 1 ms still finds its frame', () => {
  for (const fps of [0, -30, NaN, Infinity, 241])
    assert.throws(() => new Scene(new NullSink(), { fps }), /new Scene\(\): fps is .*; give a number above 0 and at most 240/, String(fps));
  assert.equal(new Scene(new NullSink(), { fps: 240 }).fps, 240);
  // At 240 fps, every frame's time, rounded to 1 ms, is within half a frame of it.
  for (let k = 0; k < 2400; k++) assert.equal(Math.round((Math.round((k / 240) * 1000) / 1000) * 240), k);
});

test('run times, lag ratios and waits are finite and not negative', async () => {
  for (const runTime of [NaN, Infinity, -1])
    assert.throws(() => new FadeIn(new Circle(), { runTime }), /new FadeIn\(\): its runTime is .*; give a finite number from 0/, String(runTime));
  assert.throws(() => new Create(new Circle(), { lagRatio: NaN }), /new Create\(\): its lagRatio is NaN/);
  assert.throws(() => new AnimationGroup([], { lagRatio: -0.5 }), /new AnimationGroup\(\): its lagRatio is -0\.5/);
  const scene = new Scene(new NullSink());
  await assert.rejects(scene.play(new FadeIn(new Circle()), { runTime: Infinity }), /this\.play\(\): its runTime is Infinity/);
  await assert.rejects(scene.play(new FadeIn(new Circle()), { lagRatio: NaN }), /this\.play\(\): its lagRatio is NaN/);
  for (const t of [NaN, Infinity, -0.5]) await assert.rejects(scene.wait(t), /this\.wait\(\): the time is .*; give a finite number from 0/, String(t));
  assert.equal(scene.phase, 'idle', 'a refused call leaves the scene as it was');
});

test('a DecimalNumber blends its value only with another number: into a Text it ends as the text, never NaN', async () => {
  const scene = new Scene(new NullSink());
  const n = new DecimalNumber(5);
  scene.add(n);
  await scene.play(new Transform(n, new Text('five')));
  assert.equal(n.text, 'five');
  assert.ok(!n.text.includes('NaN'));
  const m = new DecimalNumber(1);
  scene.add(m);
  await scene.play(new Transform(m, new DecimalNumber(3)));
  assert.equal(m.text, '3');
});

test('a Succession refuses a rate function that runs its time backwards, given to it, to play(), or by a group around it', async () => {
  assert.throws(() => new Succession([new FadeIn(new Circle())], { rateFunc: thereAndBack }), /new Succession\(\): a Succession's rate function must never decrease/);
  const scene = new Scene(new NullSink());
  await assert.rejects(scene.play(new Succession([new FadeIn(new Circle())]), { rateFunc: thereAndBack }), /this\.play\(\): a Succession's rate function must never decrease/);
  const inner = new Succession([new FadeIn(new Circle()), new FadeIn(new Rectangle())]);
  await assert.rejects(scene.play(new AnimationGroup([inner], { rateFunc: thereAndBack })), /new Succession\(\): its time ran backwards/);
});

// ---- caption reading time --------------------------------------------------

test('the caption rate is read from the scene\'s own class', async () => {
  class Slow extends Scene {
    static override captionWpm = 60;
    override async construct() { await this.step('one', { caption: 'one two three' }); }
  }
  const scene = await new Slow(new NullSink()).run();
  assert.equal(scene.steps[0]!.t1, 3, 'three words at 60 a minute');
});

test('caption words: whitespace separates words, and in scripts without spaces every 1.5 letters count as one', () => {
  assert.equal(captionWords('  one two\tthree '), 3);
  assert.equal(captionWords(''), 0);
  assert.equal(captionWords('哈希表处理冲突'), 7 / 1.5);
  assert.equal(captionWords('Hello 你好世界'), 1 + 4 / 1.5);
  // A token is at least a word: a lone numeral, or one beside Latin, reads as one.
  assert.equal(captionWords("int('三') returns 3"), 3);
  assert.equal(captionWords('API调用'), 2 / 1.5);
  assert.equal(captionWords('三'), 1);
  // Thai, with its combining marks: grapheme clusters, not code points (six code points, two clusters).
  assert.equal(captionWords('ที่นี่'), 2 / 1.5);
  // Khmer, where Node's and Chromium's dictionary word breaks differ; their grapheme clusters agree.
  assert.equal(captionWords('សួស្តីពិភពលោក'), 7 / 1.5);
  // Korean is written with spaces.
  assert.equal(captionWords('한국어는 띄어쓰기를 합니다'), 3);
});

test('a Chinese caption holds for its reading time, not as one word', async () => {
  class Chinese extends Scene {
    override async construct() { await this.step('one', { caption: '我们在这里看到一个哈希表如何处理冲突' }); }
  }
  const scene = await new Chinese(new NullSink()).run();
  // 18 characters are 12 words: 4.5 s at 160 words a minute.
  assert.equal(scene.steps[0]!.t1, 4.5);
});

// ---- the updater walk -------------------------------------------------------

test('a frame with no updater on stage builds no family to look for one', async () => {
  const { perf } = await import('../src/perf.ts');
  const scene = new Scene(new NullSink());
  const group = new Rectangle();
  for (let i = 0; i < 5; i++) group.add(new Circle());
  scene.add(group);
  perf.enable();
  try {
    perf.reset();
    await scene.wait(1);
    assert.equal(perf.counters.get('family()') ?? 0, 0);
  } finally { perf.disable(); }
  // With an updater, it runs on every frame.
  let ran = 0;
  group.children[2]!.addUpdater(() => { ran++; });
  await scene.wait(1);
  assert.equal(ran, 30);
});

test('a scene runs once, a step listener begins no step, and a listener leaves no play running', async () => {
  const { Scene, Circle, FadeIn } = await import('../src/index.ts');
  const { NullSink } = await import('../src/output.ts');
  class One extends Scene { override async construct() { await this.step('a', {}); await this.wait(0.1); } }
  const once = new One(new NullSink());
  await once.run();
  await assert.rejects(once.run(), /^Error: this\.run\(\): the scene has run already; make a new scene for another run$/);

  // From onStep, a step would draw no frame; from onStepEnd it would end itself again without end.
  for (const on of ['onStep', 'onStepEnd'] as const) {
    class Nested extends Scene {
      override async construct() {
        let fired = false;
        this[on](async () => { if (!fired) { fired = true; await this.step('inner', {}); } });
        await this.step('a', {}); await this.wait(0.1); await this.step('b', {}); await this.wait(0.1);
      }
    }
    await assert.rejects(new Nested(new NullSink()).run(), /^Error: this\.step\(\): a step listener began step "inner"; a listener may play and wait in its step/, on);
  }

  // A listener that fires a play without awaiting it: the next play would interleave frames with it.
  class Fired extends Scene {
    override async construct() {
      const c = new Circle();
      this.onStep(() => { void this.play(new FadeIn(c, { runTime: 0.5 })).catch(() => {}); });
      await this.step('a', {}); await this.wait(0.2);
    }
  }
  await assert.rejects(new Fired(new NullSink()).run(), /^Error: this\.onStep\(\): a listener of step "a" returned with a play\(\) or wait\(\) still running; await each play\(\) and wait\(\) it makes$/);

  // A listener that awaits its play is the intended use, and plays in the step.
  class Awaited extends Scene {
    override async construct() {
      const c = new Circle();
      this.onStep(async () => { await this.play(new FadeIn(c, { runTime: 0.2 })); });
      await this.step('a', {}); await this.wait(0.1);
    }
  }
  await new Awaited(new NullSink()).run();

  assert.throws(() => new One(new NullSink(), { fps: '30' as unknown as number }), /^TypeError: new Scene\(\): fps is string/);
  assert.throws(() => new One(new NullSink(), { fps: 0 }), /^RangeError: new Scene\(\): fps is 0/);
});
