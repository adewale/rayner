// Scene: an ordered list of top-level mobjects, a clock, and a frame loop.
//
// play() is async so one scene definition drives both a real-time browser
// sink (which awaits requestAnimationFrame) and an offline string sink
// (which resolves immediately). The loop itself uses a fixed dt, so output is
// deterministic regardless of sink.

import { prepareAnimation, AnimationGroup, animationName } from './animation.ts';
import { Succession, bindSuccessions, takeCopies, recordEvidence, assertTime, landBegun } from './animation.ts';
import { beginAnimation, interpolateAnimation, finishAnimation, whenReady, settle, cleanUp, paintTargets } from './animation.ts';
import { membersOf, runningOf, runTimeOf, rateFuncOf, phaseOf, playOptions } from './animation.ts';
import type { ScheduledAnimation, Playable, PlayOptions } from './animation.ts';
import { paintDefaults, mobjectName, hasUpdaters, replaceChild } from './mobject.ts';
import type { Mobject } from './mobject.ts';
import { NEUTRAL_COLORS } from './color.ts';
import type { SceneColors } from './color.ts';
import { perf } from './perf.ts';
import {textContextOf, withTextContext} from './text-context.ts';
import { loadFonts } from './fonts.ts';
import {canonicalJson, cloneJson} from './json.ts';
import type {JsonObject} from './json.ts';
import { Frame } from './frame.ts';

/**
 * Thrown by a sink to end the run early (seeking). Once a sink throws it, the
 * scene is stopped for good: a construct() that catches it anyway cannot emit
 * another frame (see Scene.phase).
 */
export class StopScene extends Error {}

/**
 * Free-form data attached to a step; travels with the trace. A string `caption` holds the step
 * until read (see Scene.captionWpm). A layer above the engine names its own fields by declaring
 * them on this interface: rayner/explain adds a step's title, line and kind.
 */
export interface StepMeta {
  caption?: string;
  [key: string]: unknown;
}

/** A named step: from `step()` to the next step or the end of the scene. */
export interface Step {
  name: string;
  path: string;
  t0: number;
  frame0: number;
  t1: number | null;
  frame1: number | null;
  /**
   * When the caption-reading hold began, and on which frame, if the step needed one. The frames
   * from `holdFrame` to `frame1` show one picture: the player, playing one step, stops at
   * `holdFrame`, and a continuous render plays on to `t1`. `holdFrame ?? frame1` is where the
   * picture stops changing, held or not.
   */
  hold?: number;
  holdFrame?: number;
  /**
   * A copy of the metadata `this.step()` was given, as JSON, frozen deeply: it cannot change once
   * the step has begun. A write to it throws the language's own TypeError, which names the property
   * (see "Error messages" in docs/ENGINE.md).
   */
  readonly meta: Readonly<StepMeta>;
  /**
   * What happened during the step, as recorded by Scene.record() (in order).
   * Scene.step() always sets it.
   */
  evidence?: Evidence[];
}

/**
 * A step that has ended: its `t1` and `frame1` are set. What a sink hears as a step ends
 * (Sink.stepEnd), what a step's metadata function is given (the step it closes), and what
 * traceRun's AtRest callback sees; a running Step's are null.
 */
export type EndedStep = Step & { t1: number; frame1: number };

/**
 * One fact recorded during a step (see Scene.record): what an animation did,
 * such as the hunks a TransformDiff animated. JSON, like the state.
 */
export type Evidence = { kind: string } & Record<string, unknown>;
/**
 * An invariant of the picture, on one frame: a message when it fails, `true` when it held, and
 * nothing (or false) when there was nothing to check, such as before the parts it reads are
 * drawn. An invariant that never holds on any frame of a run was never tested, so rayner check
 * fails it: a misspelt key finds nothing and cannot pass for an invariant that held.
 */
export type Invariant = (scene: Scene<any, any>) => string | boolean | null | undefined | void;

/**
 * What a scene renders into: called once per frame (dt = 0 for the first),
 * and at step boundaries if it cares. Async, so a sink can pace or stop the run.
 */
export interface Sink {
  frame(scene: Scene, dt: number): Promise<void>;
  stepBegin?(scene: Scene, step: Step): Promise<void>;
  stepEnd?(scene: Scene, step: EndedStep): Promise<void>;
  /**
   * Frames that end before this time are counted, not rendered: the one way to skip frames. A sink
   * that draws only from some point says so here, and may move it between plays (the live player's
   * sink skips to a step, then draws a reader's event frame by frame; the player's runner skips to
   * the step it is headed for); one that draws nothing (NullSink, TraceSink) skips every frame with
   * Infinity. Without it every frame is drawn. A time in seconds, 0 or more, or Infinity; the scene
   * refuses NaN or a negative time when it next reads it, which every play and wait does.
   */
  readonly skipUntil?: number;
}

export interface SceneOptions {
  fps?: number;
}

/** The author's mutable state; stateJson() validates and copies its JSON representation. */
export type SceneState = Record<string, unknown>;

/** Where an addJson part goes: into stateJson(), the model's JSON, or into shownJson(), what is shown. */
export type JsonInto = 'state' | 'shown';

/**
 * What a scene is doing (`Scene.phase`): `idle` between calls, `playing` in play(), `waiting` in
 * wait(), `ending-step` while step() (or the end of the scene) closes the running step and
 * `beginning-step` while it opens the next, and `stopped` for good once a sink has stopped the run.
 * One runs at a time: play(), wait() and step() refuse to start while another has not finished,
 * except from a step listener (onStep, onStepEnd), which may play and wait in the step.
 */
export type ScenePhase = 'idle' | 'playing' | 'waiting' | 'ending-step' | 'beginning-step' | 'stopped';

/** Who a refusal names, for each phase another call can find the scene in. */
const RUNNING: Record<Exclude<ScenePhase, 'idle' | 'stopped'>, string> = {
  playing: 'a play()',
  waiting: 'a wait()',
  'ending-step': 'a step()',
  'beginning-step': 'a step()',
};

/** Scripts written without spaces between words: a caption in them is counted by letters. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;
/** A combining mark: part of the letter before it. */
const MARK = /\p{M}/u;
/** Letters of a script without spaces that read as one word, as a reader's pace goes: about 240 Han characters a minute at 160 words. */
const LETTERS_PER_WORD = 1.5;

/**
 * How many words a caption is, for its reading time. Words are what whitespace separates, except in
 * scripts written without spaces (Chinese, Japanese, Thai, Lao, Khmer, Myanmar, Tibetan), where every
 * LETTERS_PER_WORD of their letters count as a word, and a token is always at least one. A letter is a code point
 * of such a script that is not a combining mark (\p{M}): vowel signs, tone marks and Khmer's subscript sign are
 * parts of a letter. A character's category is fixed once it is assigned, so every Node and browser counts alike;
 * grapheme clusters are not, since their rules change between Unicode versions, and nor are a dictionary's word breaks.
 */
function captionWords(caption: string): number {
  let words = 0;
  for (const token of caption.trim().split(/\s+/)) {
    if (!token) continue;
    if (!UNSPACED.test(token)) { words++; continue; }
    let unspaced = 0;
    for (const ch of token) if (UNSPACED.test(ch) && !MARK.test(ch)) unspaced++;
    // A token is at least a word: a lone character (a numeral, `int('三')`) reads as one.
    words += Math.max(1, unspaced / LETTERS_PER_WORD);
  }
  return words;
}

/** A scene class, as traceScene(), renderFrame() and the registries take it. */
export type SceneClass = new (sink: Sink, opts?: SceneOptions) => Scene;

/**
 * Two animations in one play() must not drive the same mobject (or one
 * inside the other): each writes the mobject's points and style every frame,
 * so the last one listed would silently win. Nested groups (LaggedStart,
 * AnimationGroup) are checked through their members.
 */
function assertDisjoint(anims: readonly ScheduledAnimation[]): void {
  assertOnce(anims);
  assertDisjointOnce(anims);
}

/** One instance listed twice in a play (beside itself, or in a group too) would begin twice. */
function assertOnce(anims: readonly ScheduledAnimation[]): void {
  const listed = new Set<ScheduledAnimation>();
  const visit = (a: ScheduledAnimation): void => {
    if (listed.has(a)) throw new Error(`this.play(): ${animationName(a)} is listed twice in one play; an animation plays once, so make another for the second`);
    listed.add(a);
    if (a instanceof AnimationGroup) membersOf(a).forEach(visit);
  };
  anims.forEach(visit);
}

/**
 * The animations a group plays together, down to the ones that drive mobjects. A group whose
 * members are made when its turn comes (an action's beat, a machine's transition) stands for
 * itself until then, with the targets it declares.
 */
const leaves = (a: ScheduledAnimation): ScheduledAnimation[] => (a instanceof AnimationGroup && !(a instanceof Succession) && membersOf(a).length ? membersOf(a).flatMap(leaves) : [a]);
/** The mobjects an animation drives, each family member counted: a Succession's members' together. */
const driven = (a: ScheduledAnimation): Mobject[] => (a instanceof Succession ? membersOf(a).flatMap(leaves).flatMap(driven) : a.targets().flatMap(m => m.family()));
/** Two writers of `m` in one play: `other`, and `a`, begun beside it, or at its turn in the play by what `call` names ('s.card()'). */
const twoWriters = (other: ScheduledAnimation, a: ScheduledAnimation, m: Mobject, call?: string): Error =>
  call
    ? new Error(`${call}: ${animationName(a)}, begun at its turn, and ${animationName(other)} both animate ${mobjectName(m)}; one play can drive a mobject only once, so sequence them, or combine them into one Transform`)
    : new Error(`this.play(): ${animationName(other)} and ${animationName(a)} both animate ${mobjectName(m)}; one play can drive a mobject only once, so sequence them, or combine them into one Transform`);

function assertDisjointOnce(anims: readonly ScheduledAnimation[]): void {
  const seen = new Map<Mobject, ScheduledAnimation>();
  // A Succession's members run one at a time, so they may share mobjects with each
  // other (each is checked on its own below), but not with anything beside them.
  for (const a of anims.flatMap(leaves)) {
    if (a instanceof Succession) for (const member of membersOf(a)) assertDisjointOnce([member]);
    for (const m of driven(a)) {
      const other = seen.get(m);
      if (other && other !== a) throw twoWriters(other, a, m);
      seen.set(m, a);
    }
  }
}

/**
 * Animations begun after their play began (a Succession's member at its turn, what an action's
 * beat or a machine's transition makes then) against what else the play drives now: everything
 * in it but these, a Succession only by its running member. `call` names what made them.
 */
function assertDisjointInPlay(playing: readonly ScheduledAnimation[], begun: readonly ScheduledAnimation[], call?: string): void {
  const skip = new Set(begun), now = new Map<Mobject, ScheduledAnimation>();
  const visit = (a: ScheduledAnimation): void => {
    if (skip.has(a)) return;
    if (a instanceof Succession) {
      const running = runningOf(a);
      if (running) visit(running);
    } else if (a instanceof AnimationGroup && membersOf(a).length) membersOf(a).forEach(visit);
    else for (const m of driven(a)) now.set(m, a);
  };
  playing.forEach(visit);
  for (const a of begun.flatMap(leaves))
    for (const m of driven(a)) {
      const other = now.get(m);
      if (other) throw twoWriters(other, a, m, call);
    }
}

/** Maintain one root per subtree while preserving the requested draw order. */
function admitRoots(current: readonly Mobject[], incoming: readonly Mobject[]): Mobject[] {
  let roots = [...current];
  const owner = new Map<Mobject, Mobject>();
  for (const root of roots) for (const member of root.family()) owner.set(member, root);
  for (const m of incoming) {
    if (owner.has(m) && owner.get(m) !== m) continue;
    const family = m.family(), covered = new Set(family);
    roots = roots.filter((root) => !covered.has(root));
    roots.push(m);
    for (const member of family) owner.set(member, m);
  }
  return roots;
}

/** `value` and everything in it, frozen: a step's metadata, once copied. */
function deepFreeze<T extends object>(value: T): T {
  for (const v of Object.values(value)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(value);
}

/**
 * @internal Replace the drawn list of `scene` with `mobjects`, as they are: for a picture drawn without
 * some of what is on stage (the stage's heading), put back once it is drawn.
 */
export let setDrawn: (scene: Scene<any, any>, mobjects: readonly Mobject[]) => void;

declare const sceneTypes: unique symbol;
/**
 * A state type as a scene holds it: `S`'s own properties (an interface's too, which can then go
 * wherever a JSON record can), or anything for `Scene<any>`.
 */
type Held<S> = unknown extends S ? any : { [K in keyof S]: S[K] };

/**
 * A scene with typed state: `S` is the model's type (what `state` holds) and `Sh` the type of what
 * is shown of it (`shown`). An explainer declares both, `class X extends Scene<Model, Shown>`, and
 * every view, staged step and machine on it is typed from them. Untyped, both are JSON
 * records (SceneState).
 */
export class Scene<S extends object = SceneState, Sh extends object = SceneState> {
  /** @internal Where frames and step boundaries go (the constructor's sink). */
  sink: Sink;
  readonly fps: number;
  /**
   * @internal Frames that end before this time are counted, not rendered: the sink's `skipUntil`,
   * its one writer, or 0 when it has none. NaN or a negative time is refused here, where every play
   * and wait reads it.
   */
  get skipUntil(): number {
    const own = this.sink.skipUntil ?? 0;
    if (Number.isNaN(own) || own < 0) {
      const kind = (this.sink as { constructor?: { name?: string } }).constructor;
      const name = !kind?.name || kind === Object ? "the sink's" : `the ${kind.name}'s`;
      throw new RangeError(`sink.skipUntil: ${name} is ${String(own)}; give a time in seconds, 0 or more, or Infinity to skip every frame`);
    }
    return own;
  }
  /** The mobjects on stage, in drawing order: changed by add, remove, replace and the plays that add and remove. */
  get mobjects(): readonly Mobject[] { return this.#mobjects; }
  #mobjects: Mobject[] = [];
  /** Seconds since the run began: the frame count over fps. */
  get time(): number { return this.#time; }
  #time = 0;
  /** Frames since the run began: what a step's frame0, frame1 and holdFrame record, and what renderFrame seeks. */
  get frameCount(): number { return this.#frameCount; }
  #frameCount = 0;
  static {
    setDrawn = (scene, mobjects) => { scene.#mobjects = [...mobjects]; };
  }
  readonly steps: Step[];
  private current: Step | null;
  /** The model: what the explanation is about (a bucket's tokens, a statechart's configuration). JSON. */
  state: NoInfer<Held<S>>;
  /**
   * What is shown of it, apart from the model: which picture a phase shows, say. JSON. A view's
   * draw may read it; a machine never changes it. Kept apart so the model holds only the domain.
   */
  shown: NoInfer<Held<Sh>>;
  /**
   * Type-only, never set: the model and shown types, which views, steps and machines on the scene
   * infer theirs from. Each is joined with any JSON record, so a typed scene goes wherever a
   * `Scene` does; its `state` and `shown` still hold it to its own types.
   */
  declare readonly [sceneTypes]?: { state: S | Record<string, any>; shown: Sh | Record<string, any> };
  /** Every Scene.record() so far, in order, across steps. */
  readonly evidence: Evidence[];
  /**
   * The camera: which box of the scene is on screen (see frame.ts). Held here,
   * not in `mobjects`: it is never drawn, and every walk over `mobjects`
   * (renderers, verifiers, removeAll(), scenes' own bookkeeping) stays camera-free.
   * play() animates it like any mobject; beginAnimations() just never adds it.
   */
  frame: Frame;
  /**
   * What the scene is doing now (see ScenePhase). `stopped` once a sink throws StopScene: from
   * then on play(), wait(), step() and emitFrame() rethrow it at once, so a construct() that
   * swallows the stop in a broad catch cannot emit frames after it (a seeked frame would differ
   * from the played one). run() still ends quietly.
   */
  get phase(): ScenePhase { return this.#phase; }
  #phase: ScenePhase;
  /** How many step listeners are running: a play or wait they make runs inside the call that dispatched them. */
  #listening: number;
  /** How many play(), wait() and step() calls are running, nested ones included. */
  #running: number;
  /** Whether run() has been called: a scene runs once. */
  #ran: boolean;
  /** What the running play() was given: what an animation begun later in it is checked against. */
  #playing: readonly ScheduledAnimation[] = [];
  /** What was made at its turn in the running play and waits for what it reads: begun before the next frame. */
  #held: { ready: Promise<unknown>; begin: () => void }[] = [];
  /** Mobjects kept last in drawing order while on stage (see keepOnTop), in the order kept. */
  #onTop: Mobject[] = [];
  /** Where the run stops early (see stopAt), or null. */
  #stop: { path: string; at: (scene: Scene<any, any>) => unknown; reached: boolean } | null = null;
  // One entry per registration, so each remover removes exactly its own.
  private stepListeners: Array<{ listener: (step: Step) => unknown; on: boolean }>;
  private stepEndListeners: Array<{ listener: (step: Step) => unknown; on: boolean }>;
  private jsonParts: Array<{ part: () => SceneState; into: JsonInto }>;
  /** Named invariants of the picture, checked on every frame of a full run by an InvariantSink (see addInvariant). */
  readonly invariants: Map<string, Invariant>;
  /**
   * The colours engine defaults take here (see SceneColors): a part built without a colour takes
   * its role's colour from these when it first enters the scene, and an SVG sink draws `paper`
   * behind the frame. A stage sets them from its palette; without one they are NEUTRAL_COLORS.
   */
  colors: Readonly<SceneColors>;

  /**
   * The sink's skipUntil: frames that end before it are not rendered or
   * interpolated, only counted (manim's skip_animations). Interpolation is a
   * pure function of alpha over endpoints fixed at begin(), so the state after
   * a skipped stretch is exactly the state a full run reaches. Plays with
   * active updaters are never skipped: updaters integrate over frames.
   */
  constructor(sink: Sink, { fps = 30 }: SceneOptions = {}) {
    // Times are kept to 1 ms in a trace: up to 240 fps, half a frame is longer, so a rounded time still finds its frame.
    if (!(fps > 0 && fps <= 240)) throw new RangeError(`new Scene(): fps is ${String(fps)}; give a number above 0 and at most 240`);
    this.sink = sink;
    this.fps = fps;
    // Named steps: the addressable unit for deep links, traces and tests
    this.steps = [];
    this.current = null;
    // The explanation's own state, and what is shown of it; stateJson() and shownJson() copy them for traces
    this.state = {} as S;
    this.shown = {} as Sh;
    this.evidence = [];
    this.frame = new Frame();
    this.#phase = 'idle';
    this.#listening = 0;
    this.#running = 0;
    this.#ran = false;
    this.stepListeners = [];
    this.stepEndListeners = [];
    this.jsonParts = [];
    this.invariants = new Map();
    this.colors = NEUTRAL_COLORS;
  }

  /** Rethrow a stop a sink already raised: nothing reaches the sink after it. */
  private throwIfStopped(): void { if (this.#phase === 'stopped') throw new StopScene(); }

  /** Call the sink; a StopScene it throws stops the scene for good (see `phase`). */
  private async toSink(call: () => Promise<void> | undefined): Promise<void> {
    // What is kept on top is raised before the sink sees the scene, whatever wrote the drawn list.
    this.#raiseTop();
    try { await call(); } catch (e) { if (e instanceof StopScene) this.#phase = 'stopped'; throw e; }
  }

  /**
   * Run `body` as `phase`: refused while another play, wait or step runs, unless a step listener
   * makes the call; the phase before it comes back when it ends (unless the run has stopped).
   */
  async #exclusive<T>(phase: ScenePhase, api: string, body: () => Promise<T>): Promise<T> {
    this.throwIfStopped();
    const was = this.#phase;
    if (was !== 'idle' && !this.#listening)
      throw new Error(`${api}: ${RUNNING[was as keyof typeof RUNNING]} is still running; await each play(), wait() and step() before the next`);
    const listening = this.#listening;
    this.#phase = phase;
    this.#listening = 0;
    this.#running++;
    try { return await body(); }
    finally {
      this.#running--;
      this.#listening = listening;
      if (this.#phase !== 'stopped') this.#phase = was;
    }
  }

  /**
   * Run the listeners of `list` registered now, minus any removed meanwhile, each free to play and
   * wait in the step. A listener that returns with a play or wait it made still running is refused:
   * the next call would interleave its frames with that one's.
   */
  async #dispatch(api: 'this.onStep()' | 'this.onStepEnd()', list: Array<{ listener: (step: Step) => unknown; on: boolean }>, s: Step): Promise<void> {
    for (const entry of list.slice()) {
      if (!entry.on) continue;
      const running = this.#running;
      this.#listening++;
      try { await entry.listener(s); } finally { this.#listening--; }
      if (this.#running !== running)
        throw new Error(`${api}: a listener of step ${JSON.stringify(s.path)} returned with a play() or wait() still running; await each play() and wait() it makes`);
    }
  }

  /**
   * Run `listener` each time a step begins, after the sink hears about it.
   * Helpers use it (a stage that shows the step's title) instead of wrapping
   * step(). The listener may play and wait: that motion opens the step.
   * Returns a function that removes the listener.
   */
  onStep(listener: (step: Step) => unknown): () => void {
    const entry = { listener, on: true };
    this.stepListeners.push(entry);
    return () => { entry.on = false; this.stepListeners = this.stepListeners.filter((e) => e !== entry); };
  }

  /**
   * Run `listener` each time a step is about to end (at the next step() or the end of the scene),
   * while it is still `currentStep` and before its caption hold. Helpers use it instead of
   * wrapping step(): one that refuses to let the step end throws, one that adds to the step plays
   * or waits, and that motion is part of the step. Returns a function that removes the listener.
   */
  onStepEnd(listener: (step: Step) => unknown): () => void {
    const entry = { listener, on: true };
    this.stepEndListeners.push(entry);
    return () => { entry.on = false; this.stepEndListeners = this.stepEndListeners.filter((e) => e !== entry); };
  }

  /**
   * @internal Stop the run as the step `path` ends: after its end listeners and its caption hold,
   * once the sink has heard the end, with the step still current. The scene is then as the trace
   * records the step (`after`) and as a link to the step shows it: code the scene runs after the
   * step's last play has run. `at(scene)` runs there and may play and wait, as a step listener may,
   * and is held to the same rule: one that returns with a play or wait still running is refused.
   * Then the scene stops for good, as a sink's StopScene stops it (`phase` is `'stopped'`), so
   * construct() never continues. A step the run never reaches ends the run as usual, and `at` never
   * runs. The live player runs a scene to a step this way, and plays the reader's events in `at`;
   * check explores a machine from the same point.
   */
  stopAt(path: string, at: (scene: this) => unknown): void {
    if (this.#ran) throw new Error('this.stopAt(): the scene has begun its run; say where it stops before run()');
    this.#stop = { path, at: at as (scene: Scene<any, any>) => unknown, reached: false };
  }

  /** Stop here if the step that is ending is the one stopAt() named: run its callback, then stop for good. */
  async #stopIfReached(): Promise<void> {
    const stop = this.#stop;
    if (!stop || stop.reached || this.current?.path !== stop.path) return;
    stop.reached = true;
    const running = this.#running;
    // Free to play and wait, as a step listener is.
    this.#listening++;
    // Stopped for good whatever the callback does, a throw included: construct() never continues.
    try { await stop.at(this); } finally { this.#listening--; this.#phase = 'stopped'; }
    // A play it left running would tick on after the stop: refused, as a listener's is.
    if (this.#running !== running)
      throw new Error(`this.stopAt(): its callback at step ${JSON.stringify(stop.path)} returned with a play() or wait() still running; await each play() and wait() it makes`);
    throw new StopScene();
  }

  /**
   * Merge `part()`'s JSON into every stateJson() (`into: 'state'`, the default), so helper
   * evidence such as recorded walks survives an author replacing `this.state`; or into every
   * shownJson() (`'shown'`), for what a helper says the stage shows. Returns a remover. A part's
   * key may repeat one the state (or another part) has only with the same value: a collision
   * throws when the JSON is read, so an author's key is never silently replaced.
   */
  addJson(part: () => SceneState, into: JsonInto = 'state'): () => void {
    const entry = { part, into };
    this.jsonParts.push(entry);
    return () => { this.jsonParts = this.jsonParts.filter((e) => e !== entry); };
  }

  /**
   * Hold an invariant of the picture on every frame from now on: `check(scene)` returns
   * a message when it fails, `true` when it held, and nothing when there was nothing
   * to check on this frame. It reads the scene, by key (`scene.find`), and changes nothing;
   * an invariant that never returns `true` in a run fails `rayner check`. An InvariantSink runs every registered
   * check on every frame it is handed, so `rayner check`, which plays every scenario in full,
   * fails at the first frame an invariant breaks, mid-animation included. A seek skips frames
   * and so checks nothing between them. Names are unique per scene; returns a remover.
   */
  addInvariant(name: string, check: Invariant): () => void {
    if (!name.trim()) throw new RangeError('this.addInvariant(): an invariant needs a name');
    if (this.invariants.has(name)) throw new Error(`this.addInvariant(): ${JSON.stringify(name)} is already registered; give each invariant its own name`);
    this.invariants.set(name, check);
    return () => { if (this.invariants.get(name) === check) this.invariants.delete(name); };
  }

  /** Subclasses define the animation here. */
  async construct(): Promise<void> {}

  /** Explicit text creation stays bound to this scene's shaping service. */
  get textShaping() { return textContextOf(this.constructor); }

  async run(): Promise<this> {
    if (this.#ran) throw new Error('this.run(): the scene has run already; make a new scene for another run');
    this.#ran = true;
    return withTextContext(this.constructor, async () => {
      try {
        await loadFonts();
        await this.toSink(() => this.sink.frame(this, 0));
        await this.construct();
        await this.#exclusive('ending-step', 'this.construct()', () => this.#endStep());
      } catch (e) { if (!(e instanceof StopScene)) throw e; }
      return this;
    });
  }

  /**
   * Begin a named step; it lasts until the next step begins or the scene ends.
   *
   *   await this.step('push-a', { op: 'push' });
   *   await this.play(...);
   *
   * Names are stable tokens ("push-wrap"): they are what ?step= deep links,
   * traces and tests address. `meta` is free-form JSON and travels with the trace; it is copied
   * when the step begins, and the copy (`currentStep.meta`) is frozen, so neither a later change
   * to the object given nor a write to the copy changes what is recorded. Given a
   * function, step() first ends the running step (with its caption hold) and calls it with that
   * closed step, or null before the first: for words that report the step before's timing. Either
   * form is checked at that point, once the running step has ended.
   */
  async step(name: string, meta: StepMeta | ((closed: EndedStep | null) => StepMeta) = {}): Promise<Step> {
    if (this.#listening)
      throw new Error(`this.step(): a step listener began step ${JSON.stringify(name)}; a listener may play and wait in its step, so begin the next step from construct()`);
    return this.#exclusive('ending-step', 'this.step()', async () => {
      const closed = await this.#endStep();
      const given = typeof meta === 'function' ? meta(closed) : meta;
      // Frozen, deeply: what the trace records, and what the caption hold reads, cannot change after.
      const copy = deepFreeze(cloneJson(given, 'this.step()', 'its metadata')) as StepMeta;
      this.#phase = 'beginning-step';
      const s: Step = { name, path: name, t0: this.time, frame0: this.frameCount, t1: null, frame1: null, meta: copy, evidence: [] };
      this.steps.push(s);
      this.current = s;
      await this.toSink(() => this.sink.stepBegin?.(this, s));
      // The listeners registered when the step began, minus any removed meanwhile; one added
      // during this dispatch first hears the next step.
      await this.#dispatch('this.onStep()', this.stepListeners, s);
      return s;
    });
  }

  /**
   * Words per minute a caption is read at; a step lasts at least that long. Read from the scene's
   * own class, so a subclass may set its own rate (`static captionWpm = 120`).
   */
  static captionWpm = 160;

  /**
   * End the running step, as the next step() or the end of the scene does: its end listeners,
   * then its caption hold, then its end.
   */
  async #endStep(): Promise<EndedStep | null> {
    const s = this.current;
    if (!s) return null;
    this.throwIfStopped();
    await this.#dispatch('this.onStepEnd()', this.stepEndListeners, s);
    // A captioned step holds until its caption could have been read or spoken,
    // so narration (or a reader) never runs past the picture it describes.
    const caption = s.meta.caption;
    if (typeof caption === 'string') {
      const wpm = (this.constructor as typeof Scene).captionWpm;
      const need = captionWords(caption) / wpm * 60;
      const left = need - (this.time - s.t0);
      if (left > 1e-9) {
        s.hold = this.time;
        s.holdFrame = this.frameCount;
        // Whole frames, rounded up: the step lasts at least the reading time, never half a frame less.
        await this.#frames(Math.ceil(left * this.fps - 1e-6));
      }
    }
    const ended: EndedStep = Object.assign(s, { t1: this.time, frame1: this.frameCount });
    // The sink hears the end with the step still current, the scene as its resting frame showed it.
    await this.toSink(() => this.sink.stepEnd?.(this, ended));
    // Where stopAt() stops: the step as it ends, its end heard.
    await this.#stopIfReached();
    this.current = null;
    return ended;
  }

  /** @internal Whether any mobject on stage, or the camera, has an updater: then a seek cannot skip frames. */
  hasUpdaters(): boolean {
    for (const top of this.mobjects) if (hasUpdaters(top)) return true;
    // Camera: an updater on the frame (follow a dot) integrates over frames too
    return hasUpdaters(this.frame);
  }

  /** The step running now, or null. */
  get currentStep(): Step | null { return this.current; }

  /**
   * What the explanation is about, for traces: a copy of `this.state` as JSON, with the parts
   * helpers add (addJson). Scenes keep their explicit state there (head, tail, tokens...) and
   * mutate it as the animation makes the same change on screen.
   * State is JSON: that is what traces serve and tests hash.
   */
  stateJson(): JsonObject { return this.json(this.state, 'state'); }

  /** What is shown, for traces: a copy of `this.shown` as JSON, with what helpers say the stage shows. */
  shownJson(): JsonObject { return this.json(this.shown, 'shown'); }

  private json(base: object, into: JsonInto): JsonObject {
    const state = cloneJson(base, `this.${into}`, `this.${into}`);
    const fromParts = new Set<string>();
    for (const { part, into: where } of this.jsonParts) {
      if (where !== into) continue;
      const extra: unknown = part();
      if (!extra || typeof extra !== 'object' || Array.isArray(extra))
        throw new TypeError('this.addJson(): a part must return a JSON object');
      for (const [k, value] of Object.entries(cloneJson(extra, 'this.addJson()', 'the part'))) {
        // A part may restate a key with the value already there (a helper that also keeps its
        // key in the state), never replace one: the author's key would vanish from every trace.
        if (Object.hasOwn(state, k) && canonicalJson(state[k]) !== canonicalJson(value))
          throw new Error(fromParts.has(k)
            ? `this.addJson(): two parts write the key ${JSON.stringify(k)} into this.${into} with different values; give each part its own keys`
            : into === 'state'
              ? `this.state: the key ${JSON.stringify(k)} is also written by a helper, with another value; rename the scene's key, as a helper's keys (walks in the state, picture in what is shown) are reserved`
              : `this.shown: the key ${JSON.stringify(k)} is also written by a helper, with another value; rename the scene's key, as a helper's keys (walks in the state, picture in what is shown) are reserved`);
        fromParts.add(k);
        // Define own keys, so a key such as "__proto__" is copied, not used as a prototype.
        Object.defineProperty(state, k, { value, enumerable: true, writable: true, configurable: true });
      }
    }
    return state;
  }

  /**
   * Record a fact about the step running now, for traces and fidelity tests:
   * `{ kind, ...data }` is appended to the step's `evidence` (and to the
   * scene's, which also keeps what happens before the first step). play()
   * records each animation's `evidence()` as it begins: what a matching
   * transform paired, the hunks TransformDiff animated, the interval a sampled
   * animation sampled.
   * Unlike `state`, evidence is what the animation did, not what the program
   * is: it lets a test check the picture against an outside oracle. Copied
   * as JSON when recorded.
   */
  record(kind: string, data: Record<string, unknown> & {kind?: never} = {}): void {
    if (!kind.trim()) throw new RangeError('this.record(): kind must be a nonempty string');
    const payload = cloneJson(data, 'this.record()', 'data');
    const e: Evidence = {kind, ...payload};
    this.evidence.push(e);
    this.current?.evidence?.push(e);
  }

  // ---- mobject list ------------------------------------------------------

  familyMembers(): Mobject[] { return this.mobjects.flatMap((m) => m.family()); }

  /** The first mobject on stage, in drawing order and depth first, whose key is `key` (see Mobject.find). */
  find(key: string): Mobject | undefined {
    for (const m of this.mobjects) {
      const found = m.find(key);
      if (found) return found;
    }
    return undefined;
  }

  /** Every mobject on stage, in drawing order, whose key is `match` or passes it. */
  findAll(match: string | ((key: string) => boolean)): Mobject[] { return this.mobjects.flatMap((m) => m.findAll(match)); }

  add(...mobs: Mobject[]): this {
    for (const m of mobs) paintDefaults(m, this.colors);
    // Re-adding a root moves it last; a child of a visible parent is a no-op.
    this.#mobjects = admitRoots(this.mobjects, mobs);
    this.#raiseTop();
    return this;
  }

  /**
   * @internal Keep `mobs` drawn last, over anything added after them, in the order given (one kept
   * already moves last among them). Whenever one is on stage, as a root or inside one, the root that
   * holds it (its topmost ancestor on stage) stands at the end of `mobjects`: after each add and
   * replace, before every frame and step boundary the sink is handed,
   * and before a frame drawn outside the loop (drawFrame: renderFrame, the live run), so a
   * group added later that wraps it is raised again before anything is drawn. A sink handed the scene by other code reads the list as it stands. Keeping does not
   * add it. Returns a function that stops keeping them.
   * The stage keeps its heading, band, step number and line on top this way.
   */
  keepOnTop(...mobs: Mobject[]): () => void {
    this.#onTop = [...this.#onTop.filter((m) => !mobs.includes(m)), ...mobs];
    this.#raiseTop();
    return () => { this.#onTop = this.#onTop.filter((m) => !mobs.includes(m)); };
  }

  /** Move the roots that hold kept mobjects (see keepOnTop) to the end of the drawn list, in the order kept. */
  #raiseTop(): void {
    if (!this.#onTop.length) return;
    const roots = new Set(this.mobjects), top: Mobject[] = [];
    for (const m of this.#onTop) {
      // The topmost of it and its ancestors that is on stage
      let root: Mobject | undefined;
      for (let p: Mobject | null = m; p; p = p.parent) if (roots.has(p)) root = p;
      if (root && !top.includes(root)) top.push(root);
    }
    if (!top.length || top.every((m, i) => this.mobjects[this.mobjects.length - top.length + i] === m)) return;
    const kept = new Set(top);
    this.#mobjects = [...this.mobjects.filter((m) => !kept.has(m)), ...top];
  }

  /**
   * Remove mobjects from the scene. Removing a group also removes any of its
   * descendants that are on screen in their own right, so
   * `new FadeOut(new Group(a, b))` clears a and b even though the group
   * itself was never added.
   */
  remove(...mobs: Mobject[]): this {
    const gone = new Set(mobs.flatMap((m) => m.family()));
    this.#mobjects = this.mobjects.filter((m) => !gone.has(m));
    // Also detach from any group on screen
    for (const m of mobs) if (m.parent) m.parent.remove(m);
    return this;
  }

  replace(old: Mobject, ...replacements: Mobject[]): this {
    if (replacements.length === 1 && replacements[0] === old) return this;
    for (const m of replacements) paintDefaults(m, this.colors);
    replacements = admitRoots([], replacements);
    const parent = this.mobjects.includes(old) ? null : this.familyMembers().find((m) => m.children.includes(old)) ?? null;
    if (parent && replacements.some((m) => m.family().includes(parent)))
      throw new Error('this.replace(): a replacement cannot be an ancestor of the parent it goes into');
    const covered = new Set(replacements.flatMap((m) => m.family()));
    this.#mobjects = this.mobjects.filter((m) => m === old || !covered.has(m));
    if (parent && !this.mobjects.includes(old)) {
      replaceChild(parent, old, ...replacements);
      return this;
    }
    const i = this.mobjects.indexOf(old);
    if (i < 0) { this.add(...replacements); return this; }
    for (const m of replacements) m.parent?.remove(m);
    this.#mobjects.splice(i, 1, ...replacements);
    this.#raiseTop();
    return this;
  }

  /** @internal Empty the drawn list at once, unanimated: for tools and tests (a stage's `s.clear()` fades everything out). */
  removeAll(): this { this.#mobjects = []; return this; }

  // ---- frame loop --------------------------------------------------------

  /**
   * Count a frame. The clock is derived from the count, so it never drifts the way a running sum of
   * dt does. A stopped scene counts none, skipped or drawn: a play left running when it stopped ends there.
   */
  private tick(): void {
    this.throwIfStopped();
    this.#frameCount++;
    this.#time = this.#frameCount / this.fps;
  }

  /**
   * @internal Hand `sink` the picture as it is now, as one frame at dt 0, outside play() and wait():
   * what is kept on top is raised first, as before every frame the scene hands its own sink. For a
   * frame drawn after a run (renderFrame past the end) or between a live run's plays.
   */
  async drawFrame(sink: Sink): Promise<void> {
    this.#raiseTop();
    await sink.frame(this, 0);
  }

  /** @internal Advance one frame and hand it to the sink, unless it ends before skipUntil. */
  async emitFrame(dt: number): Promise<void> {
    this.throwIfStopped();
    this.tick();
    // Camera updaters run last, so a following frame sees this frame's positions
    perf.span('updaters', () => { for (const m of this.mobjects) m.update(dt); this.frame.update(dt); });
    const end = perf.begin('sink');
    try { await this.toSink(() => this.sink.frame(this, dt)); }
    finally { end(); }
  }

  /** Play animations together; a trailing plain object is options: { runTime, rateFunc, lagRatio }. */
  async play(...args: Playable[] | [...Playable[], PlayOptions]): Promise<void> {
    // Refused before begin(): a stopped scene, or one still in another call, changes nothing more
    await this.#exclusive('playing', 'this.play()', () => this.#play(args));
  }

  async #play(args: Playable[] | [...Playable[], PlayOptions]): Promise<void> {
    const list: unknown[] = [...args];
    const last = list[list.length - 1];
    // An .animate builder is never the options: its prototype is not Object.prototype (Mobject.animate)
    const isOpts = last && Object.getPrototypeOf(last) === Object.prototype;
    const opts = (isOpts ? list.pop() : {}) as PlayOptions;
    const anims = (list as Playable[]).map(prepareAnimation);
    if (!anims.length) throw new Error(`this.play(): it was given no animation${isOpts ? ', only options' : ''}; give it one or more, or hold the picture with this.wait()`);
    // What some animation reads before it can begin (a diagram's layout), a group's members' included: wait for it, once, here.
    const waits = anims.map((a) => a[whenReady]()).filter((r) => r !== null);
    if (waits.length) {
      await Promise.all(waits);
      this.throwIfStopped();
    }
    // Then every run time is known: a group lays out its members' times now.
    for (const a of anims) a[settle]();
    // Checked before any is given: a play refused before anything begins leaves its animations as they were.
    const giveOptions = playOptions(anims, opts);
    assertDisjoint(anims);
    giveOptions();
    this.#playing = anims;
    this.#held = [];
    // One that throws as it begins leaves none of the others begun: those it began first land.
    const idle = anims.filter((a) => phaseOf(a) !== 'begun');
    try { perf.span('anim.begin', () => this.beginAnimations(anims)); }
    catch (e) { this.#held = []; landBegun(idle, this); throw e; }
    // From here on, a failure (a member that throws at its turn, what was made at its turn failing to
    // be ready or refused, a frame that throws) lands everything the play began, and nothing waiting
    // begins: no animation is left begun. A stop is no failure: the scene is stopped for good, and
    // the picture stays as the stopping frame drew it.
    try { await this.#playFrames(anims); }
    catch (e) {
      this.#held = [];
      if (!(e instanceof StopScene)) landBegun(anims, this);
      throw e;
    }
  }

  /** The frames of a play whose animations have begun, then their finish. */
  async #playFrames(anims: readonly ScheduledAnimation[]): Promise<void> {
    if (this.#held.length) await this.#beginHeld();
    const runTime = Math.max(...anims.map(runTimeOf));
    const dt = 1 / this.fps;
    const n = Math.max(1, Math.round(runTime * this.fps));
    let canSkip = this.skipUntil > this.time && !this.hasUpdaters();
    // A Succession begins its members (adding their mobjects) as it interpolates, so in
    // a play holding one, skipped frames still interpolate, and the first member to bring
    // an updater ends the skipping: the full run integrates it from the frame it joins.
    const sequenced = anims.some(function holds(a: ScheduledAnimation): boolean {
      return a instanceof Succession || (a instanceof AnimationGroup && membersOf(a).some(holds));
    });
    const interpolate = async (t: number): Promise<void> => {
      perf.span('interpolate', () => {
        for (const a of anims) {
          const time = runTimeOf(a), alpha = time > 0 ? Math.min(t / time, 1) : 1;
          interpolateAnimation(a, rateFuncOf(a)(alpha));
        }
      });
      // What began at its turn in this frame and waits for what it reads begins before the frame is drawn.
      if (this.#held.length) await this.#beginHeld();
    };
    let skipped = 0;
    for (let f = 1; f <= n; f++) {
      // The last frame draws the finished animation even when runTime·fps rounded down.
      const t = f === n ? runTime : Math.min(f * dt, runTime);
      // skipUntil raised after this play began (the player sending a run on to a later step):
      // skip from here, as a play begun before it would. With skipUntil fixed, as in every other
      // run, this never holds: time only grows.
      if (!canSkip && this.time + dt + 1e-9 < this.skipUntil && !this.hasUpdaters()) canSkip = true;
      // A frame is skipped when it ends before skipUntil, by the same 1e-9 slack wait() uses
      if (canSkip && this.time + dt + 1e-9 < this.skipUntil) {
        if (!sequenced) { this.tick(); skipped++; continue; }
        await interpolate(t);
        if (!this.hasUpdaters()) { this.tick(); skipped++; continue; }
        canSkip = false;
      } else await interpolate(t);
      await this.emitFrame(dt);
    }
    perf.count('frames skipped', skipped);
    perf.span('anim.finish', () => { for (const a of anims) { finishAnimation(a); a[cleanUp](this); } });
    // What finishing began at its turn and waits (a last member of no run time, an action's last
    // beat) begins and lands now, the members after it in turn.
    if (this.#held.length) await this.#beginHeld();
  }

  /**
   * @internal Run `begin` once what `anims` read is ready (see the whenReady hook), in turn order: now
   * when nothing waits and nothing begun or made earlier in this frame of the running play waits;
   * otherwise in the running play, which waits for it, and begins what waited in the order the turns
   * came, before its next frame. So whatever is begun at its turn joins the stage, and records its
   * evidence, in turn order, whether or not something waits. For what is made when its turn comes in
   * a play (an action's beat, a machine's transition) and a Succession's members, after the play has
   * waited for everything it was given. `call` is what a refusal names: the call they belong to,
   * 's.card()', 'machine.send("UP")' or 'new Succession()'.
   */
  whenReady(anims: readonly ScheduledAnimation[], call: string, begin: () => void): void {
    const waits = anims.map((a) => a[whenReady]()).filter((r) => r !== null);
    if (!waits.length && !this.#held.length) return begin();
    this.#holdInPlay(call, waits.length ? Promise.all(waits) : Promise.resolve(), begin);
  }

  /**
   * @internal Run `then` in the running play once everything held in it so far has begun (see
   * whenReady): a Succession, which `call` names, carrying on after a member that waits.
   */
  afterHeld(call: string, then: () => void): void {
    this.#holdInPlay(call, Promise.resolve(), then);
  }

  /** Hold `begin` in the running play until `ready` settles; outside a play, refuse it under `call`, since only a play can wait. */
  #holdInPlay(call: string, ready: Promise<unknown>, begin: () => void): void {
    if (this.#phase !== 'playing') throw new Error(`${call}: what begins at its turn waits for what it reads, and only a play can wait for that; play it with this.play()`);
    this.#hold(ready, begin);
  }

  /** Hold `begin` until `ready` settles; a rejection is the play's error once it is awaited, never an unhandled one meanwhile. */
  #hold(ready: Promise<unknown>, begin: () => void): void {
    ready.catch(() => {});
    this.#held.push({ ready, begin });
  }

  /**
   * Begin what waited at its turn, in the order the turns came, each once what it reads is ready.
   * What a begin begins or holds in turn comes before the turns after it.
   */
  async #beginHeld(): Promise<void> {
    while (this.#held.length) {
      const h = this.#held.shift()!;
      await h.ready;
      this.throwIfStopped();
      const after = this.#held;
      this.#held = [];
      try { h.begin(); } finally { this.#held.push(...after); }
    }
  }

  /**
   * @internal Begin animations as play() does: successions bound, copies taken, then each begun.
   * Begun later in a running play (a Succession's member at its turn, or what an action's beat or a
   * machine's transition makes then, `call` naming it), they are checked first against what else
   * the play drives now: one writer per mobject holds for the whole play. When one throws as it
   * begins, those it began before land (see landBegun) before the error goes on, wherever the list
   * is begun: as a play begins, or at a turn inside it.
   */
  beginAnimations(anims: readonly ScheduledAnimation[], call?: string): void {
    if (this.#phase === 'playing' && anims !== this.#playing) {
      if (call) assertDisjoint(anims);
      assertDisjointInPlay(this.#playing, anims, call);
    }
    bindSuccessions(anims, this); // a Succession begins its members here, one by one, as their turns come; groups record their members' evidence
    takeCopies(anims); // every TransformFromCopy copies its source before anything in the play begins
    let present = new Set(this.familyMembers());
    // Whatever a play draws or morphs toward takes the scene's colours before it begins, so its
    // endpoints are fixed in them (a Succession's members take them as they begin, here).
    const paint = (a: ScheduledAnimation): void => {
      if (a instanceof Succession) return;
      if (a instanceof AnimationGroup) membersOf(a).forEach(paint);
      else for (const m of a[paintTargets]()) paintDefaults(m, this.colors);
    };
    for (const a of anims) paint(a);
    /** It joins the stage: each mobject it writes is added, unless it is on stage already. */
    const join = (a: ScheduledAnimation): void => {
      for (const m of a.targets()) {
        // Camera: animated like any mobject, but never added to the drawn list
        if (!m || m === this.frame || present.has(m)) continue;
        // A new wrapper around things already on screen (a Transform of new Group(a, b)) must not
        // draw them a second time on top: add it only if some drawable member is new.
        const drawn = m.family().filter((f) => f.boundingPointArrays().some((a) => a.length > 0));
        if (drawn.length && drawn.every((f) => present.has(f))) continue;
        this.add(m);
        for (const f of m.family()) present.add(f);
      }
    };
    const begun: ScheduledAnimation[] = [];
    try {
      for (const a of anims) {
        beginAnimation(a);
        begun.push(a);
        recordEvidence(a, this); // what it decided as it began (matching pairs, diff hunks, a sampled interval), in turn
        // Behind what waits before it in this frame, it joins the stage in its turn (see inTurn),
        // against the stage as it is then.
        if (!this.#held.length) join(a);
        else this.inTurn(() => { present = new Set(this.familyMembers()); join(a); });
      }
    } catch (e) { landBegun(begun, this); throw e; }
  }

  /**
   * @internal Do `seen`, what an animation does in sight as it begins (record its evidence, join the
   * stage), in turn order: now, unless something begun or made earlier in this frame of the running
   * play waits for what it reads; then in the play's turn after that (see whenReady), before its next
   * frame. So whatever begins beside one that waits, listed after it in a play, a group or a
   * Succession's member, is drawn and recorded after it, as it would be if nothing waited.
   */
  inTurn(seen: () => void): void {
    if (!this.#held.length) return seen();
    this.#hold(Promise.resolve(), seen);
  }

  /** Hold the picture for `seconds` (rounded to whole frames); updaters keep running. */
  async wait(seconds = 1): Promise<void> {
    assertTime('this.wait()', 'the time', seconds);
    await this.#exclusive('waiting', 'this.wait()', () => this.#frames(Math.round(seconds * this.fps)));
  }

  /** Emit `n` frames, skipping those that end before skipUntil, as wait() and the caption hold do. */
  async #frames(n: number): Promise<void> {
    const dt = 1 / this.fps;
    let canSkip = this.skipUntil > this.time && !this.hasUpdaters();
    for (let f = 0; f < n; f++) {
      // As in play: skipUntil raised during the wait skips from here.
      if (!canSkip && this.time + dt + 1e-9 < this.skipUntil && !this.hasUpdaters()) canSkip = true;
      if (canSkip && this.time + dt + 1e-9 < this.skipUntil) { this.tick(); continue; }
      await this.emitFrame(dt);
    }
  }
}
