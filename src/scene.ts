// Scene: an ordered list of top-level mobjects, a clock, and a frame loop.
//
// play() is async so one scene definition drives both a real-time browser
// sink (which awaits requestAnimationFrame) and an offline string sink
// (which resolves immediately). The loop itself uses a fixed dt, so output is
// deterministic regardless of sink.

import { prepareAnimation, AnimationGroup } from './animation.ts';
import { Succession, bindSuccessions, takeCopies } from './animation.ts';
import { bindRecorders } from './animation.ts';
import type { ScheduledAnimation as Animation, Playable, PlayOpts } from './animation.ts';
import type { Mobject } from './mobject.ts';
import { perf } from './perf.ts';
import {Text} from './text.ts';
import type {TextOpts} from './text.ts';
import {textContextOf, withTextContext} from './text-context.ts';
import { loadFonts } from './fonts.ts';
import {jsonObject} from './json.ts';
import type {JsonObject} from './json.ts';
import { Frame } from './frame.ts';

/**
 * Thrown by a sink to end the run early (seeking). Once a sink throws it, the
 * scene is stopped for good: a construct() that catches it anyway cannot emit
 * another frame (see Scene.stopped).
 */
export class StopScene extends Error {}

/** Free-form data attached to a step; travels with the trace. A string `caption` holds the step until read. */
export interface StepMeta {
  title?: string;
  line?: string;
  caption?: string;
  detail?: boolean;
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
  /** When the caption-reading hold began, if the step needed one. Players stop here; timed playback continues to t1. */
  hold?: number;
  meta: StepMeta;
  /**
   * What happened during the step, as recorded by Scene.record() (in order).
   * Scene.step() always sets it; a step rebuilt elsewhere (an index) may not.
   */
  evidence?: Evidence[];
}

/**
 * One fact recorded during a step (see Scene.record): what an animation did,
 * such as the hunks a TransformDiff animated. JSON, like the state.
 */
export type Evidence = { kind: string } & Record<string, unknown>;

/**
 * What a scene renders into: called once per frame (dt = 0 for the first),
 * and at step boundaries if it cares. Async, so a sink can pace or stop the run.
 */
export interface Sink {
  frame(scene: Scene, dt: number): Promise<void>;
  stepBegin?(scene: Scene, step: Step): Promise<void>;
  stepEnd?(scene: Scene, step: Step): Promise<void>;
}

export interface SceneOptions {
  fps?: number;
  /** Frames that end before this time are counted, not rendered (seeking). */
  skipUntil?: number;
}

/** The author's mutable state; describe() validates and snapshots its JSON representation. */
export type SceneState = Record<string, unknown>;

/** A scene class, as traceScene(), renderAt() and the registries take it. */
export type SceneClass = new (sink: Sink, opts?: SceneOptions) => Scene;

/**
 * Two animations in one play() must not drive the same mobject (or one
 * inside the other): each writes the mobject's points and style every frame,
 * so the last one listed would silently win. Nested groups (LaggedStart,
 * AnimationGroup) are checked through their members.
 */
function assertDisjoint(anims: readonly Animation[]): void {
  const seen = new Map<Mobject, Animation>();
  // A Succession's members run one at a time, so they may share mobjects with each
  // other (each is checked on its own below), but not with anything beside them.
  const leaves = (a: Animation): Animation[] => (a instanceof AnimationGroup && !(a instanceof Succession) ? a.animations.flatMap(leaves) : [a]);
  const driven = (a: Animation): Mobject[] => (a instanceof Succession ? a.animations.flatMap(leaves).flatMap(driven) : a instanceof AnimationGroup ? a.mobjects.flatMap(m => m.family()) : a.mobject.family());
  for (const a of anims.flatMap(leaves)) {
    if (a instanceof Succession) for (const member of a.animations) assertDisjoint([member]);
    for (const m of driven(a)) {
      const other = seen.get(m);
      if (other && other !== a) {
        const name = (x: Animation) => `${x.constructor.name}(${!(x instanceof AnimationGroup) ? `${x.mobject.constructor.name}#${x.mobject.id}` : '...'})`;
        throw new Error(`play(): ${name(other)} and ${name(a)} both animate ${m.constructor.name}#${m.id}; one play() can drive a mobject only once (sequence them, or combine into one Transform)`);
      }
      seen.set(m, a);
    }
  }
}

/** Maintain one root per subtree while preserving the requested draw order. */
function admitRoots(current: readonly Mobject[], incoming: readonly Mobject[], back = false): Mobject[] {
  let roots = [...current];
  const owner = new Map<Mobject, Mobject>();
  for (const root of roots) for (const member of root.family()) owner.set(member, root);
  for (const m of back ? [...incoming].reverse() : incoming) {
    if (owner.has(m) && owner.get(m) !== m) continue;
    const family = m.family(), covered = new Set(family);
    roots = roots.filter((root) => !covered.has(root));
    if (back) roots.unshift(m); else roots.push(m);
    for (const member of family) owner.set(member, m);
  }
  return roots;
}

export class Scene<S extends object = SceneState> {
  sink: Sink;
  fps: number;
  skipUntil: number;
  mobjects: Mobject[];
  time: number;
  frameCount: number;
  steps: Step[];
  current: Step | null;
  state: {[K in keyof S]: S[K]};
  /** Every Scene.record() so far, in order, across steps. */
  evidence: Evidence[];
  /**
   * The camera: which box of the scene is on screen (see frame.ts). Held here,
   * not in `mobjects`: it is never drawn, and every walk over `mobjects`
   * (renderers, verifiers, clear(), scenes' own bookkeeping) stays camera-free.
   * play() animates it like any mobject; beginAnimations() just never adds it.
   */
  frame: Frame;
  /**
   * Set when a sink throws StopScene. From then on play(), wait(), step() and
   * emitFrame() rethrow it at once, so a construct() that swallows the stop in
   * a broad catch cannot emit frames after it (a seeked frame would differ from
   * the played one). run() still ends quietly.
   */
  stopped: boolean;
  // One entry per registration, so each remover removes exactly its own.
  private stepListeners: Array<{ listener: (step: Step) => unknown; on: boolean }>;
  private describers: Array<{ describer: () => SceneState }>;

  /**
   * skipUntil: frames that end before this time are not rendered or
   * interpolated, only counted (manim's skip_animations). Interpolation is a
   * pure function of alpha over endpoints fixed at begin(), so the state after
   * a skipped stretch is exactly the state a full run reaches. Plays with
   * active updaters are never skipped: updaters integrate over frames.
   */
  constructor(sink: Sink, { fps = 30, skipUntil = 0 }: SceneOptions = {}) {
    this.sink = sink;
    this.fps = fps;
    this.skipUntil = skipUntil;
    this.mobjects = [];
    this.time = 0;
    this.frameCount = 0;
    // Named steps: the addressable unit for deep links, traces and tests
    this.steps = [];
    this.current = null;
    // The explanation's own state; describe() snapshots it for traces
    this.state = {} as S;
    this.evidence = [];
    this.frame = new Frame();
    this.stopped = false;
    this.stepListeners = [];
    this.describers = [];
  }

  /** Rethrow a stop a sink already raised: nothing reaches the sink after it. */
  throwIfStopped(): void { if (this.stopped) throw new StopScene(); }

  /** Call the sink; a StopScene it throws stops the scene for good (see `stopped`). */
  async toSink(call: () => Promise<void> | undefined): Promise<void> {
    try { await call(); } catch (e) { if (e instanceof StopScene) this.stopped = true; throw e; }
  }

  /**
   * Run `listener` each time a step begins, after the sink hears about it.
   * Helpers use it (a stage that shows the step's title) instead of wrapping
   * step(). Returns a function that removes the listener.
   */
  onStep(listener: (step: Step) => unknown): () => void {
    const entry = { listener, on: true };
    this.stepListeners.push(entry);
    return () => { entry.on = false; this.stepListeners = this.stepListeners.filter((e) => e !== entry); };
  }

  /**
   * Merge `describer()`'s JSON into every describe(), so helper evidence (such as
   * recorded walks) survives an author replacing `this.state`. Returns a remover.
   */
  addDescriber(describer: () => SceneState): () => void {
    const entry = { describer };
    this.describers.push(entry);
    return () => { this.describers = this.describers.filter((e) => e !== entry); };
  }

  /** Subclasses define the animation here. */
  async construct(): Promise<void> {}

  /** Explicit text creation stays bound to this scene's shaping service. */
  get textShaping() { return textContextOf(this.constructor); }
  text(value: string, opts: TextOpts = {}): Text { return new Text(value, {...opts, shaping: opts.shaping ?? this.textShaping}); }

  async run(): Promise<this> {
    return withTextContext(this.constructor, async () => {
      try {
        await loadFonts();
        await this.toSink(() => this.sink.frame(this, 0));
        await this.construct();
        await this.endCurrentStep();
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
   * traces and tests address. `meta` is free-form and travels with the trace.
   */
  async step(name: string, meta: StepMeta = {}): Promise<Step> {
    if (typeof meta === 'function') throw new TypeError('step(name, fn) is gone: call `await this.step(name)` where the step begins');
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new TypeError('step metadata must be an object');
    for (const key of ['title', 'line', 'caption'] as const)
      if (meta[key] !== undefined && typeof meta[key] !== 'string') throw new TypeError(`step ${name}: ${key} must be a string`);
    if (meta.detail !== undefined && typeof meta.detail !== 'boolean') throw new TypeError(`step ${name}: detail must be boolean`);
    this.throwIfStopped();
    await this.endCurrentStep();
    const s: Step = { name, path: name, t0: this.time, frame0: this.frameCount, t1: null, frame1: null, meta, evidence: [] };
    this.steps.push(s);
    this.current = s;
    await this.toSink(() => this.sink.stepBegin?.(this, s));
    // The listeners registered when the step began, minus any removed meanwhile; one added
    // during this dispatch first hears the next step.
    for (const entry of this.stepListeners.slice()) if (entry.on) await entry.listener(s);
    return s;
  }

  /** Words per minute a caption is read at; a step lasts at least that long. */
  static captionWpm = 160;

  async endCurrentStep(): Promise<void> {
    const s = this.current;
    if (!s) return;
    this.throwIfStopped();
    // A captioned step holds until its caption could have been read or spoken,
    // so narration (or a reader) never runs past the picture it describes.
    const caption = s.meta?.caption;
    if (typeof caption === 'string') {
      const words = caption.trim() ? caption.trim().split(/\s+/).length : 0;
      const need = words / Scene.captionWpm * 60;
      const left = need - (this.time - s.t0);
      if (left > 1e-9) {
        s.hold = this.time;
        // Whole frames, rounded up: the step lasts at least the reading time, never half a frame less.
        await this.wait(Math.ceil(left * this.fps - 1e-6) / this.fps);
      }
    }
    this.current = null;
    s.t1 = this.time; s.frame1 = this.frameCount;
    await this.toSink(() => this.sink.stepEnd?.(this, s));
  }

  hasUpdaters(): boolean {
    for (const top of this.mobjects) for (const m of top.family()) if (m.updaters.length) return true;
    // Camera: an updater on the frame (follow a dot) integrates over frames too
    return this.frame.updaters.length > 0;
  }

  /** The step running now, or null. */
  get currentStep(): Step | null { return this.current; }

  /**
   * What the explanation is about, for traces: a snapshot of `this.state`.
   * Scenes keep their explicit state there (head, tail, tokens...) and
   * mutate it as the animation makes the same change on screen.
   * State is JSON: that is what traces serve and tests hash.
   */
  describe(): JsonObject {
    const state = jsonObject(this.state, 'scene.state');
    for (const { describer } of this.describers) {
      const extra: unknown = describer();
      if (!extra || typeof extra !== 'object' || Array.isArray(extra))
        throw new TypeError('A describer must return a JSON object');
      // Define own keys, so a key such as "__proto__" is copied, not used as a prototype.
      for (const [k, value] of Object.entries(jsonObject(extra, 'scene describer')))
        Object.defineProperty(state, k, { value, enumerable: true, writable: true, configurable: true });
    }
    return state;
  }

  /**
   * Record a fact about the step running now, for traces and fidelity tests:
   * `{ kind, ...data }` is appended to the step's `evidence` (and to the
   * scene's, which also keeps what happens before the first step). Matching
   * transforms record what they paired; TransformDiff the hunks it animated.
   * Unlike `state`, evidence is what the animation did, not what the program
   * is: it lets a test check the picture against an outside oracle. Copied
   * as JSON when recorded.
   */
  record(kind: string, data: Record<string, unknown> & {kind?: never} = {}): void {
    if (typeof kind !== 'string' || !kind.trim()) throw new TypeError('Evidence kind must be a nonempty string');
    const payload = jsonObject(data, 'scene evidence');
    if (Object.hasOwn(payload, 'kind')) throw new TypeError('Evidence data must not override kind');
    const e: Evidence = {kind, ...payload};
    this.evidence.push(e);
    this.current?.evidence?.push(e);
  }

  // ---- mobject list ------------------------------------------------------

  familyMembers(): Mobject[] { return this.mobjects.flatMap((m) => m.family()); }

  add(...mobs: Mobject[]): this {
    // Re-adding a root moves it last; a child of a visible parent is a no-op.
    this.mobjects = admitRoots(this.mobjects, mobs);
    return this;
  }

  /**
   * Remove mobjects from the scene. Removing a group also removes any of its
   * descendants that are on screen in their own right, so
   * `new FadeOut(new Group(a, b))` clears a and b even though the group
   * itself was never added.
   */
  remove(...mobs: Mobject[]): this {
    const gone = new Set(mobs.flatMap((m) => m.family()));
    this.mobjects = this.mobjects.filter((m) => !gone.has(m));
    // Also detach from any group on screen
    for (const m of mobs) if (m.parent) m.parent.remove(m);
    return this;
  }

  replace(old: Mobject, ...replacements: Mobject[]): this {
    if (replacements.length === 1 && replacements[0] === old) return this;
    replacements = admitRoots([], replacements);
    const parent = this.mobjects.includes(old) ? null : this.familyMembers().find((m) => m.children.includes(old)) ?? null;
    if (parent && replacements.some((m) => m.family().includes(parent)))
      throw new Error('replace() cannot insert an ancestor into its descendant');
    const covered = new Set(replacements.flatMap((m) => m.family()));
    this.mobjects = this.mobjects.filter((m) => m === old || !covered.has(m));
    if (parent && !this.mobjects.includes(old)) {
      // Work from the original neighbours. Detaching an earlier sibling
      // changes indices, and retaining old among the replacements must keep
      // its backlink rather than detach it after insertion.
      const original = [...parent.children], at = original.indexOf(old);
      for (const r of replacements) {
        const other = r.parent !== parent ? r.parent : null;
        other?.remove(r);
        r.parent = parent;
      }
      const before = original.slice(0, at).filter((m) => !covered.has(m));
      const after = original.slice(at + 1).filter((m) => !covered.has(m));
      parent.children = [...before, ...replacements, ...after];
      if (!covered.has(old)) old.parent = null;
      parent.invalidateBox();
      return this;
    }
    const i = this.mobjects.indexOf(old);
    if (i < 0) { this.add(...replacements); return this; }
    for (const m of replacements) m.parent?.remove(m);
    this.mobjects.splice(i, 1, ...replacements);
    return this;
  }

  bringToFront(...mobs: Mobject[]): this { return this.add(...mobs); }
  bringToBack(...mobs: Mobject[]): this {
    this.mobjects = admitRoots(this.mobjects, mobs, true);
    return this;
  }
  clear(): this { this.mobjects = []; return this; }

  // ---- frame loop --------------------------------------------------------

  /** Count a frame. The clock is derived from the count, so it never drifts the way a running sum of dt does. */
  private tick(): void {
    this.frameCount++;
    this.time = this.frameCount / this.fps;
  }

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
  async play(...args: Playable[] | [...Playable[], PlayOpts]): Promise<void> {
    this.throwIfStopped(); // before begin(): a stopped scene changes nothing more
    const list: unknown[] = [...args];
    const last = list[list.length - 1];
    // An .animate builder is never the options: its prototype is not Object.prototype (Mobject.animate)
    const isOpts = last && Object.getPrototypeOf(last) === Object.prototype;
    const opts = (isOpts ? list.pop() : {}) as PlayOpts;
    const anims = list.map(prepareAnimation);
    for (const a of anims) a.setOptions(opts);
    assertDisjoint(anims);
    perf.span('anim.begin', () => this.beginAnimations(anims));
    const runTime = Math.max(...anims.map((a) => a.runTime));
    const dt = 1 / this.fps;
    const n = Math.max(1, Math.round(runTime * this.fps));
    let canSkip = this.skipUntil > this.time && !this.hasUpdaters();
    // A Succession begins its members (adding their mobjects) as it interpolates, so in
    // a play holding one, skipped frames still interpolate, and the first member to bring
    // an updater ends the skipping: the full run integrates it from the frame it joins.
    const sequenced = anims.some(function holds(a: Animation): boolean {
      return a instanceof Succession || (a instanceof AnimationGroup && a.animations.some(holds));
    });
    const interpolate = (t: number): void => perf.span('interpolate', () => {
      for (const a of anims) {
        const alpha = a.runTime > 0 ? Math.min(t / a.runTime, 1) : 1;
        a.interpolate(a.rateFunc(alpha));
      }
    });
    let skipped = 0;
    for (let f = 1; f <= n; f++) {
      // The last frame draws the finished animation even when runTime·fps rounded down.
      const t = f === n ? runTime : Math.min(f * dt, runTime);
      // skipUntil raised after this play began (the player sending a run on to a later step):
      // skip from here, as a play begun before it would. With skipUntil fixed, as in every other
      // run, this never holds: time only grows.
      if (!canSkip && this.time + dt + 1e-9 < this.skipUntil && !this.hasUpdaters()) canSkip = true;
      // Same comparison SeekSink uses to drop a frame, so the first frame shown is identical
      if (canSkip && this.time + dt + 1e-9 < this.skipUntil) {
        if (!sequenced) { this.tick(); skipped++; continue; }
        interpolate(t);
        if (!this.hasUpdaters()) { this.tick(); skipped++; continue; }
        canSkip = false;
      } else interpolate(t);
      await this.emitFrame(dt);
    }
    perf.count('frames skipped', skipped);
    perf.span('anim.finish', () => { for (const a of anims) { a.finish(); a.cleanUpFromScene(this); } });
  }

  beginAnimations(anims: readonly Animation[]): void {
    bindSuccessions(anims, this); // a Succession begins its members here, one by one, as their turns come
    bindRecorders(anims, this); // matching transforms record what they paired (Scene.record) as they begin
    takeCopies(anims); // every TransformFromCopy copies its source before anything in the play begins
    const present = new Set(this.familyMembers());
    for (const a of anims) {
      a.begin();
      const mobs = a instanceof AnimationGroup ? a.mobjects : [a.mobject];
      for (const m of mobs) {
        // Camera: animated like any mobject, but never added to the drawn list
        if (!m || m === this.frame || present.has(m)) continue;
        // A new wrapper around things already on screen (Indicate(new Group(a, b))) must not
        // draw them a second time on top: add it only if some drawable member is new.
        const drawn = m.family().filter((f) => f.boundingPointArrays().some((a) => a.length > 0));
        if (drawn.length && drawn.every((f) => present.has(f))) continue;
        this.add(m);
        for (const f of m.family()) present.add(f);
      }
    }
  }

  async wait(seconds = 1): Promise<void> {
    this.throwIfStopped();
    const dt = 1 / this.fps;
    const n = Math.round(seconds * this.fps);
    let canSkip = this.skipUntil > this.time && !this.hasUpdaters();
    for (let f = 0; f < n; f++) {
      // As in play: skipUntil raised during the wait skips from here.
      if (!canSkip && this.time + dt + 1e-9 < this.skipUntil && !this.hasUpdaters()) canSkip = true;
      if (canSkip && this.time + dt + 1e-9 < this.skipUntil) { this.tick(); continue; }
      await this.emitFrame(dt);
    }
  }
}
