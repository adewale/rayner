// Animations are pure functions of alpha over two fixed endpoints.
// begin() settles the endpoints (and aligns their structure); every frame
// is then `mobject = blend(start, end, rateFunc(t / runTime))`.

import { smooth, linear, clip } from './rate.ts';
import type { RateFunc } from './rate.ts';
import type { Mobject, AnimateBuilderBase } from './mobject.ts';
import { Group, adoptState, followScene, mobjectName, savedState, withArticle, alignFamily, alignData, matchingFrameFor, interpolateData, dropBox, copyAlone } from './mobject.ts';
import type { VMobject } from './vmobject.ts';
import type { Scene } from './scene.ts';
import { beginWhenReady, afterHeld, beginAnimations, inTurn } from './scene.ts';
import * as V from './vec.ts';
import type { Vec } from './vec.ts';
import type { Box } from './mobject.ts';
import { center, pointsBox } from './box.ts';
import { Circle, SurroundingRectangle, boxOf } from './shapes.ts';
import { NEUTRAL_COLORS } from './color.ts';

export interface AnimationOptions {
  runTime?: number;
  rateFunc?: RateFunc;
  /** 0: children move together; 1: one after another. */
  lagRatio?: number;
  /** Remove what the animation animates (its `targets()`, by default its mobject) from the scene when it ends. */
  remover?: boolean;
}

/** What play() accepts besides animations: a trailing options object. */
export type PlayOptions = Pick<AnimationOptions, 'runTime' | 'rateFunc' | 'lagRatio'>;

/**
 * One family member and its counterparts, zipped by index: [mobject's, starting
 * copy's] for most animations, plus the target's for a Transform.
 */
export type FamilyRow = Mobject[];

/** A family member that draws something: a path with points. Containers (groups, Text) draw nothing themselves. */
const draws = (m: Mobject | undefined): boolean => !!m && 'subpaths' in m && m.hasPoints();

/**
 * Where each row sits in a lagRatio stagger. Only rows that draw take a place
 * (manim staggers family_members_with_points), so wrapping shapes in another
 * Group, or a Text in a Group, does not delay them. Rows that draw nothing get
 * -1 and follow the animation's overall alpha.
 */
function lagSlots(rows: readonly FamilyRow[]): { index: Int32Array; count: number } {
  const index = new Int32Array(rows.length);
  let count = 0;
  for (let i = 0; i < rows.length; i++) index[i] = draws(rows[i]![0]) ? count++ : -1;
  return { index, count };
}

/**
 * @internal Refuse a time that is not a finite number from 0 to `max`: NaN plays no frames and finishes
 * silently, Infinity never ends.
 */
export function assertTime(api: string, what: string, value: number, max = Infinity): void {
  if (!Number.isFinite(value) || value < 0 || value > max)
    throw new RangeError(`${api}: ${what} is ${String(value)}; give a finite number from 0${max === Infinity ? '' : ` to ${max}`}`);
}

/**
 * Where an animation is in its life: `idle` until it begins, `begun` from then until it has
 * finished, every member with it, and `finished` once it has. It interpolates and finishes only
 * while begun, before its play has finished it: a `Succession` whose play has finished it while a
 * member waits, or a group holding one, is still begun while its members finish in turn. It begins
 * only when idle or finished; a finished animation may begin again (play it once more).
 */
export type AnimationPhase = 'idle' | 'begun' | 'finished';

/**
 * Keys of the engine's own members, private to this module: whether an animation still waits for
 * something at its turn, how it lands after a failure, which timing its kind refuses, and the
 * mobjects whose families it zips. No author can name any of them, so no subclass or field
 * overrides or collides with them.
 */
const waits = Symbol('waits');
const lands = Symbol('lands');
const refuseTiming = Symbol('refuseTiming');
const rowMobjects = Symbol('rowMobjects');

/**
 * @internal Keys of the engine's hooks on an animation, which a play, a group and an action call and
 * the engine's own animations and rayner/explain's override: `takeOptions`, the options a play gives
 * it; `whenReady`, what it must wait for before it begins; `settle`, fixing its run time once that is
 * ready; `cleanUp`, what the end of its play takes off the scene. Symbols, so no member an author
 * writes on an animation shares a name with one or replaces it.
 */
export const takeOptions = Symbol('takeOptions');
/** @internal See takeOptions. */
export const whenReady = Symbol('whenReady');
/** @internal See takeOptions. */
export const settle = Symbol('settle');
/** @internal See takeOptions. */
export const cleanUp = Symbol('cleanUp');
/**
 * @internal Keys of what the engine reads on an animation, set apart from any name an author's member
 * may have: `paintTargets`, what takes the scene's colours before it begins; `playScene`, the scene a
 * group's play runs on, which play() sets; `playsOn`, the scene an animation that changes its scene's
 * state belongs to (an action's), which a play on another scene refuses.
 */
export const paintTargets = Symbol('paintTargets');
/** @internal See paintTargets. */
export const playScene = Symbol('playScene');
/** @internal See paintTargets. */
export const playsOn = Symbol('playsOn');

/**
 * @internal The engine's calls of an animation's lifecycle, set by AnimationTiming: a play, a group,
 * a Succession and an animation that runs another begin, draw and finish it through these, which keep
 * its private phase and call only its protected hooks. The class has no public lifecycle method, so
 * nothing an author writes on an animation (a method, a field, an assignment) is called in their place.
 * `api` is the author's call a refusal names: `this.play()`, which every play, group and Succession
 * runs under, unless sampleAnimation() says otherwise.
 */
export let beginAnimation: (a: ScheduledAnimation, api?: string) => void;
/** @internal See beginAnimation. */
export let interpolateAnimation: (a: ScheduledAnimation, alpha: number, api?: string) => void;
/** @internal See beginAnimation. */
export let finishAnimation: (a: ScheduledAnimation, alpha?: number, api?: string) => void;
/**
 * @internal What a play reads of an animation's timing and life, read from its private fields, so no
 * getter a subclass writes stands in for them.
 */
export let runTimeOf: (a: ScheduledAnimation) => number;
/** @internal See runTimeOf. */
export let rateFuncOf: (a: ScheduledAnimation) => RateFunc;
/** @internal See runTimeOf. */
export let phaseOf: (a: ScheduledAnimation) => AnimationPhase;
/** Whether the end of an animation's play removes what it animates from the scene (the `remover` option). */
let isRemover: (a: ScheduledAnimation) => boolean;
/** Land after a failure (see landBegun): it ends finished, whatever its landing throws. */
let landAnimation: (a: ScheduledAnimation, scene: Scene | null) => void;

/** Options a play gives its animations, as one play's: what is set apart from what is not. */
type Timing = Pick<AnimationOptions, 'rateFunc' | 'lagRatio'>;

/** The easing in a play's options (its rateFunc and lagRatio, those given): what an action hands to what its beats make. */
const easingOf = ({ rateFunc, lagRatio }: PlayOptions): Timing => ({ ...(rateFunc != null ? { rateFunc } : {}), ...(lagRatio != null ? { lagRatio } : {}) });

/**
 * Hand `easing`, what a play gave an action, to `a`, made or begun for it at its turn: checked as a
 * play's options are (refused under `api`, the action's call), then given.
 */
function handEasing(a: ScheduledAnimation, easing: Timing, api: string): void {
  if (easing.rateFunc == null && easing.lagRatio == null) return;
  a[refuseTiming](api, easing, true);
  a[takeOptions](easing);
}

/**
 * @internal Check `opts`, a play's options, against every one of `anims`, changing nothing, and return
 * what gives them the options: a play refused before anything begins (by these checks, or by the
 * one-writer check the play makes between the two) leaves its animations as they were.
 */
export function playOptions(anims: readonly ScheduledAnimation[], opts: PlayOptions): () => void {
  const { runTime, rateFunc, lagRatio } = opts;
  if (runTime != null) assertTime('this.play()', 'its runTime', runTime);
  if (lagRatio != null) assertTime('this.play()', 'its lagRatio', lagRatio);
  const given = runTime != null ? 'runTime' : rateFunc != null ? 'rateFunc' : lagRatio != null ? 'lagRatio' : null;
  if (given) for (const a of anims) {
    if (phaseOf(a) === 'begun') throw new Error(`this.play(): ${animationName(a)} is playing, and its play fixed its frames from its ${given}; give it options before it begins, or after it finishes`);
    a[refuseTiming]('this.play()', { rateFunc, lagRatio }, true);
  }
  return () => { for (const a of anims) a[takeOptions](opts); };
}

/**
 * Shared scheduling contract for a drawable animation or a group of animations.
 *
 * The engine begins, draws and finishes an animation through module functions (beginAnimation and
 * its siblings), which keep the phase (see AnimationPhase) and call the protected hooks
 * `doBegin()`, `doInterpolate()` and `doFinish()`, which a subclass overrides. Its phase and timing
 * are private fields, read by the engine through module functions too.
 */
abstract class AnimationTiming {
  #runTime: number;
  #lagRatio: number;
  #rateFunc: RateFunc;
  /** Whether the end of its play removes what it animates from the scene (see isRemover). */
  readonly #remover: boolean;
  /** Where it is in its life (see AnimationPhase). */
  get phase(): AnimationPhase { return this.#phaseNow(); }
  /** What a begin, a finish and a landing set; whether its members still finish in turn is read from them (see waits). */
  #phase: 'idle' | 'begun' | 'finished' = 'idle';
  constructor({runTime = 1, rateFunc = smooth, lagRatio = 0, remover = false}: AnimationOptions = {}) {
    const api = `new ${new.target.name}()`;
    assertTime(api, 'its runTime', runTime);
    assertTime(api, 'its lagRatio', lagRatio);
    this.#runTime = runTime; this.#lagRatio = lagRatio; this.#rateFunc = rateFunc; this.#remover = remover;
  }
  static {
    beginAnimation = (a, api = 'this.play()') => a.#begin(api);
    interpolateAnimation = (a, alpha, api = 'this.play()') => a.#interpolate(alpha, api);
    finishAnimation = (a, alpha, api = 'this.play()') => a.#finish(alpha, api);
    runTimeOf = (a) => a.#runTime;
    rateFuncOf = (a) => a.#rateFunc;
    phaseOf = (a) => a.#phaseNow();
    isRemover = (a) => a.#remover;
    landAnimation = (a, scene) => {
      if (a.#phaseNow() !== 'begun') return;
      try { a[lands](scene); }
      catch { /* the failure's error is reported instead */ }
      finally { a.#phase = 'finished'; }
    };
  }
  #phaseNow(): AnimationPhase { return this.#phase === 'finished' && this[waits]() ? 'begun' : this.#phase; }
  /** Seconds the animation runs: finite and not negative, checked on every set; fixed while it plays. */
  get runTime(): number { return this.#runTime; }
  set runTime(value: number) {
    this.#refuseWhileBegun('animation.runTime', 'runTime');
    assertTime('animation.runTime', `the runTime of ${animationName(this)}`, value);
    this.#runTime = value;
  }
  /** 0: members (or rows) move together; 1: one after another. Finite and not negative, checked on every set; fixed while it plays. */
  get lagRatio(): number { return this.#lagRatio; }
  set lagRatio(value: number) {
    this.#refuseWhileBegun('animation.lagRatio', 'lagRatio');
    assertTime('animation.lagRatio', `the lagRatio of ${animationName(this)}`, value);
    this[refuseTiming]('animation.lagRatio', { lagRatio: value });
    this.#lagRatio = value;
  }
  /** From the fraction of the run time elapsed to progress. Checked on every set (a Succession's never decreases); fixed while it plays. */
  get rateFunc(): RateFunc { return this.#rateFunc; }
  set rateFunc(value: RateFunc) {
    this.#refuseWhileBegun('animation.rateFunc', 'rateFunc');
    this[refuseTiming]('animation.rateFunc', { rateFunc: value });
    this.#rateFunc = value;
  }
  /** @internal Refuse, under `api`, a timing this kind of animation cannot take; any, by default. */
  [refuseTiming](_api: string, _timing: Timing, _play = false): void {}
  /** @internal Take a play's options, checked already (see playOptions). */
  [takeOptions]({ runTime, rateFunc, lagRatio }: PlayOptions = {}): this {
    if (runTime != null) this.#runTime = runTime;
    if (rateFunc != null) this.#rateFunc = rateFunc;
    if (lagRatio != null) this.#lagRatio = lagRatio;
    return this;
  }

  /** A play fixes its frames from the timing it begins with, so none of it may change while it plays. */
  #refuseWhileBegun(api: string, what: 'runTime' | 'lagRatio' | 'rateFunc'): void {
    if (this.#phaseNow() === 'begun') throw new Error(`${api}: ${animationName(this)} is playing, and its play fixed its frames from its ${what}; change it before it begins, or after it finishes`);
  }

  /** Begin: fix the endpoints (see doBegin). Refused while begun; a doBegin() that throws leaves the phase as it was. */
  #begin(api: string): void {
    if (this.#phaseNow() === 'begun')
      throw new Error(`${api}: ${animationName(this)} has already begun${this.#phase === 'finished' ? ', and its members still finish in turn' : ''}; an animation plays in one place at a time, so make another for the second`);
    const was = this.#phase;
    this.#phase = 'begun';
    try { this.doBegin(); } catch (e) { this.#phase = was; throw e; }
  }
  /** Draw the frame at `alpha`, already passed through rateFunc by the caller (see doInterpolate). Only while begun. */
  #interpolate(alpha: number, api: string): void {
    if (this.#phase !== 'begun') throw new Error(`${api}: ${animationName(this)} ${this.#phase === 'idle' ? 'has not begun' : 'has finished'}; begin it first`);
    this.doInterpolate(alpha);
  }
  /** Finish, at rateFunc(1) unless given another alpha (see doFinish). Only while begun; then finished. */
  #finish(alpha: number | undefined, api: string): void {
    if (this.#phase !== 'begun') throw new Error(`${api}: ${animationName(this)} ${this.#phase === 'idle' ? 'has not begun' : 'has already finished'}; begin it first`);
    this.doFinish(alpha);
    this.#phase = 'finished';
  }

  /**
   * How it lands after a failure (see landBegun): finished and cleaned up from `scene`, as the end of
   * its play would leave it. A group lands only the members that have begun, so a Succession's later
   * members, an action's later beats and their side effects never happen. A group may come here
   * finished while its members still finish in turn: it lands them.
   * @internal
   */
  [lands](scene: Scene | null): void {
    if (this.#phase !== 'begun') return;
    this.doFinish();
    if (scene) this[cleanUp](scene);
  }
  /**
   * Whether, begun in a play, it still waits for something it made or began at its turn to begin
   * (see beginWhenReady), or, finished, for its members to finish in turn (then it is still begun):
   * a Succession that holds it waits for it before its next member. Nothing does, by default; only
   * the engine's groups answer otherwise.
   * @internal
   */
  [waits](): boolean { return false; }

  /** Called as it begins: fix the endpoints. Copies live here, never in the constructor. */
  protected abstract doBegin(): void;
  /** Called for each frame with alpha already passed through rateFunc: a pure function of alpha over the endpoints. */
  protected abstract doInterpolate(alpha: number): void;
  /** Called as it finishes: end where the last frame drew, at `alpha` (rateFunc(1) when not given). */
  protected abstract doFinish(alpha?: number): void;
  /** @internal Remove what the animation took off the stage, after it finished. */
  abstract [cleanUp](scene: Scene): void;
  /** The mobjects this animation writes: what play() admits to the scene and allows one writer each. */
  abstract targets(): Mobject[];
  /**
   * What this animation decided when it began, for the step's trace: read once, right
   * after it begins, and recorded with Scene.record. null (the default) records nothing.
   * Matching transforms report what they paired, TransformDiff the hunks it animated,
   * a sampled animation the interval it sampled.
   */
  evidence(): Evidence | null { return null; }
  /**
   * @internal What must settle before this animation can begin, or null (the default). play() waits
   * for every one among its animations, a group's members included, before it begins any of them:
   * rayner/explain's `s.show` and `d.morph` read a diagram's layout first.
   */
  [whenReady](): Promise<unknown> | null { return null; }
  /**
   * @internal Fix the run time, once what it reads is ready (see whenReady) and before it begins:
   * play() settles its animations, and a group its members, then lays out their times. Nothing
   * to do for an animation whose run time is known when it is made.
   */
  [settle](): void {}
}

/**
 * Draw `animation`'s frame at `alpha` outside a play, for a test of a custom animation: it begins
 * first if it is idle or finished, then draws `alpha` (eased progress, what its rate function gives,
 * as a play passes it). Nothing joins a scene and nothing finishes; samples may come in any order,
 * since every frame is a function of alpha over the endpoints fixed as it began.
 */
export function sampleAnimation(animation: ScheduledAnimation, alpha: number): void {
  if (phaseOf(animation) !== 'begun') beginAnimation(animation, 'sampleAnimation()');
  interpolateAnimation(animation, alpha, 'sampleAnimation()');
}

/**
 * Record what an animation decided as it began. Called by whoever began it: play() for
 * the animations it is given and a Succession's members, a group for its own members.
 * A group records nothing itself; its members do, in the order they begin. Read now, it is
 * recorded in turn order (see inTurn): after what waits before it in the frame.
 */
export function recordEvidence(a: ScheduledAnimation, scene: Scene | null): void {
  if (!scene || a instanceof AnimationGroup) return;
  const e = a.evidence();
  if (!e) return;
  const { kind, ...data } = e;
  inTurn(scene, () => scene.record(kind, data));
}
/**
 * Any animation a play, a group or a transition runs. `Animation` is the class a custom animation
 * extends, one that animates its `mobject`; a group animates no one mobject, so it is not an
 * `Animation`, and this names either.
 */
export type ScheduledAnimation = Animation | AnimationGroup;

/**
 * @internal Land the animations a failure left begun, last begun first: each ends finished, so none
 * is left begun and each may begin again; what had begun lands as the end of its play would land
 * it, and what had not begun never begins. A group whose member throws as it begins lands the
 * members before it; a play that fails, as it begins or after, lands every animation it was given.
 */
export function landBegun(begun: readonly ScheduledAnimation[], scene: Scene | null): void {
  for (const a of [...begun].reverse()) landAnimation(a, scene);
}

/**
 * @internal The keys of what an Animation fixed as it began: `starting`, the copy of its mobject it
 * starts from, and `families`, each family member of its mobject zipped with its counterparts (see
 * FamilyRow). Symbols, so no member an author writes on a subclass shares a name with one.
 */
export const families = Symbol('families');
/** The key of an Animation's starting copy (see families). */
const starting = Symbol('starting');
/** The key of how an Animation makes its starting copy, which an engine animation that starts elsewhere overrides. */
const startingCopy = Symbol('startingCopy');

/** Stagger `alpha` across `count` rows by `lag` (manim's get_sub_alpha): row `index`'s own alpha. */
function staggered(lag: number, alpha: number, index: number, count: number): number {
  if (lag === 0) return alpha;
  // Every member is done at the end: (count - 1) * lag + 1 - index * lag is not always 1 in floating point
  if (alpha >= 1) return 1;
  const fullLength = (count - 1) * lag + 1;
  const value = alpha * fullLength;
  const lower = index * lag;
  return clip(value - lower, 0, 1);
}

export class Animation extends AnimationTiming {
  mobject: Mobject;
  /** @internal Set as it begins. */ [starting]!: Mobject;
  /** @internal Set as it begins. */ [families]!: FamilyRow[];
  /** Where each row sits in the stagger; set as it begins. */
  #slots!: { index: Int32Array; count: number };
  constructor(mobject: Mobject, opts: AnimationOptions = {}) { super(opts); this.mobject = mobject; }
  override targets(): Mobject[] { return [this.mobject]; }
  /**
   * What takes the scene's colours before this begins (see Mobject.defaultColors): what it draws,
   * and what it morphs toward, so both endpoints are fixed in the scene's colours.
   * @internal
   */
  [paintTargets](): Mobject[] { return this.targets(); }
  /** Called when play starts. Copies live here, never in the constructor. */
  protected override doBegin(): void {
    this[starting] = this[startingCopy]();
    const fams = this[rowMobjects]().map((m) => m.family());
    // Aligned families: every one is as long as the first
    this[families] = fams[0]!.map((_, i) => fams.map((f) => f[i]!));
    this.#slots = lagSlots(this[families]);
    this.doInterpolate(0);
  }

  /** @internal The starting copy (see families): the mobject as it is when the play begins. */
  [startingCopy](): Mobject { return this.mobject.copy(); }

  /** @internal The mobjects whose families are zipped as arguments to interpolateSubmobject. */
  [rowMobjects](): Mobject[] { return [this.mobject, this[starting]]; }

  /**
   * Finishes on rateFunc(1): for a there-and-back rate function that is the start.
   * A group passes the alpha its own timeline finishes each member on instead.
   */
  protected override doFinish(alpha: number = this.rateFunc(1)): void { this.doInterpolate(alpha); }

  /** @internal A remover takes what it animates (its targets) off the scene. */
  override [cleanUp](scene: Scene): void { if (isRemover(this)) scene.remove(...this.targets()); }

  /** alpha already passed through rateFunc by the scene. */
  protected override doInterpolate(alpha: number): void {
    const rows = this[families], n = rows.length, { index, count } = this.#slots, lag = this.lagRatio;
    for (let i = 0; i < n; i++) {
      const slot = index[i]!;
      this.interpolateSubmobject(...rows[i]!, slot < 0 ? alpha : staggered(lag, alpha, slot, count));
    }
    this.mobject.invalidateBox();
  }

  /**
   * One family row at `alpha`: called as (sub, start, alpha), or
   * (sub, start, target, alpha) for a Transform.
   */
  protected interpolateSubmobject(..._row: [...FamilyRow, number]): void {}
}

/** A path's structure: its subpaths and their closed flags. */
interface PathShape { subpaths: Float32Array[]; closed: boolean[] }

export interface TransformOptions extends AnimationOptions {
  replace?: boolean;
}

/**
 * What a Transform knows of its target as it begins: `owned`, built for it alone, so it is used without
 * copying; `same`, the mobject's own structure, so it needs no alignment.
 */
interface KnownTarget { owned: boolean; same: boolean }
const UNKNOWN: KnownTarget = { owned: false, same: false };
/** A target built for the animation alone, as a copy of its mobject: FadeIn's and FadeOut's. */
const OWN_COPY: KnownTarget = { owned: true, same: true };
/** The key of what a Transform knows of its target as it begins: what it was made knowing, or what an engine subclass answers. */
const knownAtBegin = Symbol('knownAtBegin');

/**
 * @internal A Transform the engine makes knowing its target (see KnownTarget): a target built for it
 * alone (`owned`), or one of the mobject's own structure (`same`). No author's Transform is told
 * either; each copies its target and aligns it.
 */
export let knownTransform: (mobject: Mobject, target: Mobject, k: Partial<KnownTarget>, opts?: TransformOptions) => Transform;

/** Blend `mobject` into `target`. With replace=true, the scene keeps `target` afterwards. */
export class Transform extends Animation {
  target: Mobject;
  readonly replace: boolean;
  /** What the engine that made it knows of its target (see knownTransform). */
  #known: KnownTarget = UNKNOWN;
  /** The target it morphs toward, fixed as it begins: the target itself when owned, else a copy. */
  #targetCopy!: Mobject;
  /** Path structure of the mobject and target families before alignment, restored as it finishes. */
  #shapes: WeakMap<Mobject, PathShape> | null = null;

  constructor(mobject: Mobject, target: Mobject, { replace = false, ...opts }: TransformOptions = {}) {
    super(mobject, opts);
    this.target = target;
    this.replace = replace;
  }
  static {
    knownTransform = (mobject, target, k, opts) => {
      const t = new Transform(mobject, target, opts);
      t.#known = { ...UNKNOWN, ...k };
      return t;
    };
  }

  /** @internal What it knows of its target as it begins: what it was made knowing, unless an engine subclass that builds its target says otherwise. */
  [knownAtBegin](): KnownTarget { return this.#known; }

  /** @internal */ override [paintTargets](): Mobject[] { return [this.mobject, this.target]; }

  protected override doBegin(): void {
    // An animation that built its own target (FadeIn, .animate) hands it
    // over as is: nothing else holds it, so copying it again is pure cost. And a
    // target that is a copy of the mobject needs no alignment: same structure.
    const { owned, same } = this[knownAtBegin]();
    const copy = this.#targetCopy = owned ? this.target : this.target.copy();
    this.#shapes = null;
    if (!same) {
      // Families first, so the shapes recorded include any path alignFamily moved into a child of its own
      this.mobject[alignFamily](copy);
      const shapes = this.#shapes = new WeakMap<Mobject, PathShape>();
      const from = this.mobject.family(), to = copy.family();
      for (const m of [...from, ...to]) {
        const p = m as Partial<Pick<VMobject, 'subpaths' | 'closed'>>;
        if (p.subpaths && p.closed) shapes.set(m, { subpaths: p.subpaths.map((a) => a.slice()), closed: p.closed.slice() });
      }
      for (let i = 0; i < from.length; i++) from[i]![alignData](to[i]!);
    }
    super.doBegin();
  }

  /**
   * Alignment pads paths with point-sized subpaths and extra curves so both ends
   * interpolate. Finishing exactly on an end gives each path that end's own
   * structure back: the same geometry, with no zero-length subpaths left over
   * (a stroked one draws a dot with round caps).
   */
  protected override doFinish(alpha?: number): void {
    const a = alpha ?? this.rateFunc(1);
    super.doFinish(a);
    const shapes = this.#shapes;
    if (!shapes || (a !== 1 && a !== 0)) return;
    const unrestored: FamilyRow[] = [];
    for (const row of this[families]) {
      const [sub, , target] = row;
      const shape = shapes.get(a === 1 ? target! : sub!);
      // Alignment pairs members by index, so a path may sit opposite a non-path: leave those
      if (!shape || !('subpaths' in sub!) || !('subpaths' in target!)) { unrestored.push(row); continue; }
      for (const m of a === 1 ? [sub!, target!] : [sub!]) {
        const v = m as VMobject;
        v.subpaths = shape.subpaths.map((p) => p.slice());
        v.closed = shape.closed.slice();
        v.touchPoints();
        v.invalidateBox();
      }
    }
    if (a === 1) for (const [sub, start, target] of unrestored) {
      if (!sub!.hasPoints()) continue;
      if ('subpaths' in sub! && !('subpaths' in target!)) {
        // A path opposite something that draws nothing (a group, a Text's advance box) has
        // collapsed to a point; left in place, a stroked one draws a round-capped dot
        const v = sub as VMobject;
        v.subpaths = []; v.closed = [];
        v.touchPoints(); v.invalidateBox();
        continue;
      }
      // Collapsed onto the target's centre as measured over its aligned control points.
      // Restoring the target's own curves can move its box (subdivided handles hug the
      // curve tighter), so finish the row again on the restored target.
      this.interpolateSubmobject(sub!, start!, target!, 1);
    }
    this.mobject.invalidateBox();
  }

  /** @internal */ override [rowMobjects](): Mobject[] { return [this.mobject, this[starting], this.#targetCopy]; }

  protected override interpolateSubmobject(sub: Mobject, start: Mobject, target: Mobject, alpha: number): void {
    sub.interpolate(start, target, alpha);
  }

  /** @internal */
  override [cleanUp](scene: Scene): void {
    super[cleanUp](scene);
    if (this.replace) scene.replace(this.mobject, this.target);
  }
}

/** A Transform whose target is the result of recorded .animate calls. */
function fromAnimateBuilder(builder: AnimateBuilderBase): Transform {
  // The built target is this animation's alone; its structure may differ (setText), so it still aligns
  return knownTransform(builder.mobject, builder.buildTarget(), { owned: true });
}

export interface FadeOptions extends TransformOptions { shift?: Vec | null; scale?: number }

export class FadeIn extends Transform {
  readonly #shift: Vec | null;
  readonly #scale: number;
  /** The invisible start, made as it begins. */
  #start!: Mobject;

  constructor(mobject: Mobject, { shift = null, scale = 1, ...opts }: FadeOptions = {}) {
    super(mobject, mobject, opts);
    this.#shift = shift; this.#scale = scale;
  }
  /** @internal */ override [knownAtBegin](): KnownTarget { return OWN_COPY; }
  protected override doBegin(): void {
    // Start state: invisible, displaced; end state: the mobject as it is.
    this.target = this.mobject.copy();
    const start = this.mobject.copy();
    for (const m of start.family()) m.style.opacity = 0;
    if (this.#shift) start.shift(V.mul(this.#shift, -1));
    if (this.#scale !== 1) start.scale(this.#scale);
    this.#start = start;
    super.doBegin();
  }
  /** @internal */ override [startingCopy](): Mobject { return this.#start; }
}

export class FadeOut extends Transform {
  readonly #shift: Vec | null;
  readonly #scale: number;

  constructor(mobject: Mobject, { shift = null, scale = 1, ...opts }: FadeOptions = {}) {
    super(mobject, mobject, { remover: true, ...opts });
    this.#shift = shift; this.#scale = scale;
  }
  /** @internal */ override [knownAtBegin](): KnownTarget { return OWN_COPY; }
  protected override doBegin(): void {
    const end = this.mobject.copy();
    for (const m of end.family()) m.style.opacity = 0;
    if (this.#shift) end.shift(this.#shift);
    if (this.#scale !== 1) end.scale(this.#scale);
    this.target = end;
    super.doBegin();
  }
  protected override doFinish(alpha?: number): void {
    // Removed: restore so the mobject can be shown again later, where it was, at its size
    // and opacity (manim's FadeOut also interpolates back to 0 once removed). Kept on
    // screen (remover: false): finish, and give back only the opacity, as before.
    if (isRemover(this)) { super.doFinish(0); return; }
    super.doFinish(alpha);
    for (const [m, start] of this[families]) m!.style.opacity = start!.style.opacity;
  }
}

export interface GrowFromEdgeOptions extends AnimationOptions {
  /** Nonzero by default to keep the starting path nondegenerate; in [0, 1]. */
  initialScale?: number;
}

/** Fade in while expanding along one axis from a fixed cardinal edge. */
export class GrowFromEdge extends FadeIn {
  readonly edge: Vec;
  readonly #axis: 0 | 1;
  readonly #initialScale: number;

  constructor(mobject: Mobject, edge: Readonly<Vec> = [0, -1], { initialScale = 0.001, ...opts }: GrowFromEdgeOptions = {}) {
    if (!Array.isArray(edge) || edge.length !== 2 || !Number.isFinite(edge[0]) || !Number.isFinite(edge[1]) ||
      Math.abs(edge[0]) + Math.abs(edge[1]) !== 1 || (edge[0] !== 0 && edge[1] !== 0))
      throw new TypeError('new GrowFromEdge(): the edge must be one unit step along an axis: [0, 1], [0, -1], [-1, 0] or [1, 0]');
    if (!Number.isFinite(initialScale) || initialScale < 0 || initialScale > 1)
      throw new RangeError('new GrowFromEdge(): initialScale must be a number from 0 to 1');
    super(mobject, opts);
    this.edge = [edge[0], edge[1]]; this.#axis = edge[0] === 0 ? 1 : 0; this.#initialScale = initialScale;
  }

  /** @internal */ override [startingCopy](): Mobject {
    return super[startingCopy]().stretch(this.#initialScale, this.#axis, { aboutEdge: this.edge });
  }
}

/** Create's default border, sized for text at the default font size (0.4). */
const CREATE_BORDER = 0.012;

/**
 * Draw a path in: the stroke traces along the path, then the fill fades in.
 * Fill-only shapes (glyphs, filled dots) have no stroke to trace, so they get
 * a temporary outline in the fill color, kept until the fill is complete and
 * removed at finish (manim's DrawBorderThenFill). Without it they stay invisible until the fill
 * pops in over a few frames.
 */
export class Create extends Animation {
  readonly #borderWidth: number;
  /** The border was left to the default, so it follows the size of the text it outlines. */
  readonly #autoBorder: boolean;

  constructor(mobject: Mobject, { borderWidth, ...opts }: AnimationOptions & { borderWidth?: number } = {}) {
    super(mobject, { lagRatio: 0.2, ...opts });
    this.#borderWidth = borderWidth ?? CREATE_BORDER;
    this.#autoBorder = borderWidth == null;
  }
  /** Per-row border widths, fixed as it begins: a glyph's border scales with its text's current size. */
  readonly #borders = new Map<Mobject, number>();
  protected override doBegin(): void {
    this.#borders.clear();
    super.doBegin();
  }
  #border(sub: Mobject): number {
    if (!this.#autoBorder) return this.#borderWidth;
    let w = this.#borders.get(sub);
    if (w == null) {
      const size = (sub.parent as { textSize?: () => number } | null)?.textSize?.();
      // abs: a mirrored text reads back a negative size
      w = size != null && Number.isFinite(size) && size !== 0 ? this.#borderWidth * Math.abs(size) / 0.4 : this.#borderWidth;
      this.#borders.set(sub, w);
    }
    return w;
  }
  protected override interpolateSubmobject(sub: Mobject, start: Mobject, alpha: number): void {
    const s0 = start.style, s = sub.style;
    // Exactly 1 once drawn: (1 - 0.66) / 0.34 is 0.9999999999999999, which would leave the fill a hair short
    const fill = alpha >= 1 ? 1 : clip((alpha - 0.66) / 0.34, 0, 1);
    s.drawFraction = alpha;
    s.fillOpacity = s0.fillOpacity * fill;
    s.opacity = s0.opacity * (alpha > 0 ? 1 : 0);
    if (s0.stroke === 'none' && s0.fill !== 'none') {
      s.stroke = s0.fill;
      s.strokeWidth = this.#border(sub);
      // Full strength until the end: fading it while the fill fades in leaves both near 50%
      // mid-crossover, a visible dip the motion verifier flags as a pop
      s.strokeOpacity = s0.fillOpacity;
    }
  }
  protected override doFinish(alpha?: number): void {
    super.doFinish(alpha);
    for (const [sub, start] of this[families] as Array<[Mobject, Mobject]>) {
      delete sub.style.drawFraction;
      // Restore the temporary border to what the shape had
      sub.style.stroke = start.style.stroke;
      sub.style.strokeWidth = start.style.strokeWidth;
      sub.style.strokeOpacity = start.style.strokeOpacity;
    }
  }
}

/**
 * @internal A group's members, read through this (set by AnimationGroup): its own field, so no member
 * an author writes on a subclass stands in for it.
 */
export let membersOf: (g: AnimationGroup) => readonly ScheduledAnimation[];
/**
 * Take `members` as a group's members, for a group that knows them only once its play begins
 * (an animation of beats decided then, what is made at its turn): laid out from their run times, as
 * the constructor lays them out, or at `slots`, each member's start and end in the group's time. A
 * run time given to the group, or to play(), is kept.
 */
let adoptMembers: (g: AnimationGroup, members: ScheduledAnimation[], slots?: Array<[start: number, end: number]>) => void;
/** Each member's start and end in a group's time, and the latest end, set by AnimationGroup. */
let timingsOf: (g: AnimationGroup) => ReadonlyArray<readonly [start: number, end: number]>;
let maxEndOf: (g: AnimationGroup) => number;

/** Run several animations together; lagRatio staggers their start times. */
export class AnimationGroup extends AnimationTiming {
  #members: ScheduledAnimation[];
  #timings: Array<[start: number, end: number]> = [];
  #maxEnd = 0;
  /** A run time was given (to the constructor or play()): re-staggering keeps it. */
  #ownRunTime: boolean;

  constructor(animations: ScheduledAnimation[], { lagRatio = 0, rateFunc = linear, ...opts }: AnimationOptions = {}) {
    super({ lagRatio, rateFunc, ...opts });
    this.#members = animations;
    this.#layOut();
    this.#ownRunTime = opts.runTime != null;
    if (!this.#ownRunTime) this.runTime = this.#maxEnd;
  }
  static {
    membersOf = (g) => g.#members;
    timingsOf = (g) => g.#timings;
    maxEndOf = (g) => g.#maxEnd;
    adoptMembers = (g, members, slots) => {
      g.#members = members;
      if (slots) {
        g.#timings = slots;
        g.#maxEnd = Math.max(0, ...slots.map(([, end]) => end));
      } else g.#layOut();
      if (!g.#ownRunTime) g.runTime = g.#maxEnd;
    };
  }
  /** Timings: each starts lagRatio * (previous run time) after the previous. */
  #layOut(): void {
    const animations = this.#members, lagRatio = this.lagRatio;
    let start = 0, end = 0;
    this.#timings = animations.map((a, i) => {
      if (i > 0) start += lagRatio * runTimeOf(animations[i - 1]!);
      end = Math.max(end, start + runTimeOf(a));
      return [start, start + runTimeOf(a)];
    });
    this.#maxEnd = end;
  }
  /** A lagRatio given to play() re-staggers the members, as one given to the constructor does. @internal */
  override [takeOptions](opts: PlayOptions = {}): this {
    super[takeOptions](opts);
    if (opts.runTime != null) this.#ownRunTime = true;
    if (opts.lagRatio != null) {
      this.#layOut();
      if (!this.#ownRunTime) this.runTime = this.#maxEnd;
    }
    return this;
  }
  /** @internal The scene the play runs on, set by play() (see bindSuccessions): members record their evidence to it as they begin. */
  [playScene]: Scene | null = null;
  /** @internal What every member waits for before it can begin: a play waits for all of it. */
  override [whenReady](): Promise<unknown> | null {
    const waits = this.#members.map((a) => a[whenReady]()).filter((r): r is Promise<unknown> => r !== null);
    return waits.length ? Promise.all(waits) : null;
  }
  /** @internal Settle the members, then lay out their times again: a member may know its run time only now. */
  override [settle](): void {
    for (const a of this.#members) a[settle]();
    this.#layOut();
    if (!this.#ownRunTime) this.runTime = this.#maxEnd;
  }
  /** Members begin in order; when one throws, those already begun land (see landBegun), so each can begin again. */
  protected override doBegin(): void {
    const begun: ScheduledAnimation[] = [];
    try {
      for (const a of this.#members) {
        beginAnimation(a);
        begun.push(a);
        recordEvidence(a, this[playScene]);
      }
    } catch (e) { landBegun(begun, this[playScene]); throw e; }
  }
  /** Each member finishes where the group's own timeline puts it at rateFunc(1) (a there-and-back group ends at the start). */
  protected override doFinish(alpha: number = this.rateFunc(1)): void {
    this.#members.forEach((a, i) => finishAnimation(a, rateFuncOf(a)(this.#memberTime(alpha, i))));
  }
  /** @internal */
  override [cleanUp](scene: Scene): void { for (const a of this.#members) a[cleanUp](scene); }
  /** @internal After a failure, each member that has begun lands on its own, last first; nothing else begins. */
  override [lands](scene: Scene | null): void { landBegun(this.#members, scene); }
  /** @internal Whether a member still waits for something made at its turn to begin (see AnimationTiming's waits). */
  override [waits](): boolean { return this.#members.some((a) => a[waits]()); }
  /** Member i's own time fraction at group alpha. */
  #memberTime(alpha: number, i: number): number {
    const [s, e] = this.#timings[i]!, t = alpha * this.#maxEnd;
    // A member with no run time happens all at once when the group reaches its start
    if (e - s <= 0) return t >= s ? 1 : 0;
    return clip((t - s) / (e - s), 0, 1);
  }
  /** Receives raw time fraction (scene applies this.rateFunc first). */
  protected override doInterpolate(alpha: number): void {
    this.#members.forEach((a, i) => interpolateAnimation(a, rateFuncOf(a)(this.#memberTime(alpha, i))));
  }
  /** What its members write; a group has no mobject of its own, and nested groups contribute their members'. */
  override targets(): Mobject[] {
    return this.#members.flatMap((a) => a.targets()).filter(Boolean);
  }
}

export class LaggedStart extends AnimationGroup {
  constructor(animations: ScheduledAnimation[], opts: AnimationOptions = {}) { super(animations, { lagRatio: 0.2, ...opts }); }
}

/** What play() accepts: an animation, or a `mobject.animate` builder. */
export type Playable = ScheduledAnimation | AnimateBuilderBase;

function isAnimateBuilder(x: unknown): x is AnimateBuilderBase {
  return !!x && !!(x as Partial<AnimateBuilderBase>)._isAnimateBuilder;
}

/** How an error names an animation: an action by its call (`s.card()`), any other by its kind. */
export function animationName(a: object): string {
  const name = (a as { name?: unknown }).name;
  if (typeof name === 'string' && name) return name;
  const kind = a.constructor.name;
  return withArticle(kind);
}

/** Normalize play() arguments: builders become Transforms. */
export function prepareAnimation(x: Playable): ScheduledAnimation {
  return isAnimateBuilder(x) ? fromAnimateBuilder(x) : x;
}

export interface MoveAlongPathOptions extends AnimationOptions { fromCurrent?: boolean }

/**
 * Move a mobject's center along a path. If the mobject isn't at the path's
 * start (a token at a box's center riding an edge that starts at the box's
 * border), the offset is blended out over the move instead of snapping on the
 * first frame: position(α) = path(α) + (1 − α)·(start − path(0)).
 * Pass { fromCurrent: false } for manim's snap-to-path behavior.
 */
export class MoveAlongPath extends Animation {
  path: VMobject;
  readonly #fromCurrent: boolean;
  /** Where the mobject's center is off the path's start; set as it begins. */
  #offset!: Vec;

  constructor(mobject: Mobject, path: VMobject, { fromCurrent = true, ...opts }: MoveAlongPathOptions = {}) {
    super(mobject, opts); this.path = path; this.#fromCurrent = fromCurrent;
  }
  protected override doBegin(): void {
    const c = this.mobject.center(), p0 = this.path.pointFromProportion(0);
    this.#offset = this.#fromCurrent ? [c[0] - p0[0], c[1] - p0[1]] : [0, 0];
    super.doBegin();
  }
  protected override doInterpolate(alpha: number): void {
    const p = this.path.pointFromProportion(alpha);
    const k = 1 - alpha;
    // Pure in alpha: every frame is the starting copy translated, never the previous
    // frame moved again. Accumulated Float32 rounding would otherwise make a seeked
    // frame differ from the full run by an ulp, which a later alignment can amplify.
    const c = this[starting].center();
    const dx = p[0] + k * this.#offset[0] - c[0], dy = p[1] + k * this.#offset[1] - c[1];
    const fams = this[families];
    for (let i = 0; i < fams.length; i++) {
      const [sub, start] = fams[i] as [Mobject, Mobject];
      const mine = sub.pointArrays(), from = start.pointArrays();
      for (let j = 0; j < mine.length; j++) {
        const m = mine[j]!, x = from[j]!;
        for (let q = 0; q < m.length; q += 2) { m[q] = x[q]! + dx; m[q + 1] = x[q + 1]! + dy; }
      }
      sub.touchPoints(); dropBox(sub);
    }
    this.mobject.invalidateBox();
  }
}

/** Travel along a fixed route while fading in and out; remove the token by default. */
export class PulseAlongPath extends MoveAlongPath {
  readonly #sourcePath: VMobject;

  constructor(mobject: Mobject, path: VMobject, opts: MoveAlongPathOptions = {}) {
    super(mobject, path, { rateFunc: linear, remover: true, ...opts });
    this.#sourcePath = path;
  }

  protected override doBegin(): void {
    // The path, like the starting geometry, is fixed when the play begins.
    this.path = this.#sourcePath.copy();
    super.doBegin();
  }

  protected override doInterpolate(alpha: number): void {
    super.doInterpolate(alpha);
    const opacity = Math.sin(Math.PI * alpha);
    for (const [sub, start] of this[families]) sub!.style.opacity = start!.style.opacity * opacity;
  }

  /** @internal */
  override [cleanUp](scene: Scene): void {
    super[cleanUp](scene);
    // A removed token can be used again without inheriting its invisible end.
    if (isRemover(this)) for (const [sub, start] of this[families]) sub!.style.opacity = start!.style.opacity;
  }
}

// ---- emphasis ----

export interface CircumscribeOptions extends AnimationOptions {
  color?: string;
  /** 'rect': a SurroundingRectangle; 'circle': a circle through the box's corners, plus buff. */
  shape?: 'rect' | 'circle';
  buff?: number;
  strokeWidth?: number;
  /** Rounds a 'rect' outline's corners. */
  cornerRadius?: number;
  /** Stay drawn, at full strength, and stay in the scene afterwards. */
  keep?: boolean;
  /** How a non-kept outline leaves: true fades it, false retracts the stroke along its path. */
  fadeOut?: boolean;
}

/** Where drawing in ends and leaving begins, as a fraction of the run. */
const CIRCUMSCRIBE_DRAWN = 2 / 3;

/**
 * Draw an outline around a mobject (or a Box), then take it away: "look
 * here". Over the first two thirds of the run the outline draws in, as
 * Create draws a path; over the last third it fades out (or, with
 * `fadeOut: false`, retracts), and the scene drops it at the end.
 *
 * With `keep: true` it holds at full strength instead and stays in the
 * scene, so the step's last frame still shows what was pointed at: a reader
 * who stops on a step sees its last frame, and a pulse that is over by then
 * points at nothing. Remove it later with FadeOut(c.outline).
 *
 * The animation's mobject is the outline itself (`outline`), which is what
 * play() adds to the scene; the target is only measured. The outline exists
 * from construction, so a scene can hold it, but its shape is refitted to the
 * target's box at begin(), when the play starts.
 */
export class Circumscribe extends Animation {
  readonly target: Mobject | Box;
  readonly shape: 'rect' | 'circle';
  readonly buff: number;
  readonly cornerRadius: number;
  readonly keep: boolean;
  readonly #fadeOut: boolean;
  /** The outline's opacity when the play began: what drawing in reaches. Set as it begins. */
  #baseOpacity!: number;

  constructor(target: Mobject | Box, { color, shape = 'rect', buff = 0.15, strokeWidth = 0.04, cornerRadius = 0, keep = false, fadeOut = true, ...opts }: CircumscribeOptions = {}) {
    const stroke = color ?? NEUTRAL_COLORS.emphasis;
    const fit = (): VMobject => shape === 'circle'
      ? circleAround(target, buff, { stroke, strokeWidth })
      : new SurroundingRectangle(target, { buff, cornerRadius, stroke, strokeWidth });
    const outline = fit();
    if (color === undefined) followScene(outline, { stroke: 'emphasis' });
    super(outline, { rateFunc: linear, ...opts, remover: !keep });
    this.target = target; this.shape = shape; this.buff = buff; this.cornerRadius = cornerRadius;
    this.keep = keep; this.#fadeOut = fadeOut;
  }

  /** The outline this animation draws: on screen from begin(), and afterwards if `keep`. */
  get outline(): VMobject { return this.mobject as VMobject; }

  protected override doBegin(): void {
    // Refit to where the target is now; the points are this play's fixed endpoint
    const o = this.outline;
    const fresh = this.shape === 'circle'
      ? circleAround(this.target, this.buff)
      : new SurroundingRectangle(this.target, { buff: this.buff, cornerRadius: this.cornerRadius });
    o.subpaths = fresh.subpaths; o.closed = fresh.closed;
    o.touchPoints(); o.invalidateBox();
    this.#baseOpacity = o.style.opacity;
    super.doBegin();
  }

  /** Style only, from alpha alone: the points were fixed at begin(). */
  protected override doInterpolate(alpha: number): void {
    const s = this.outline.style;
    const drawn = smooth(alpha / CIRCUMSCRIBE_DRAWN);
    const gone = this.keep ? 0 : smooth((alpha - CIRCUMSCRIBE_DRAWN) / (1 - CIRCUMSCRIBE_DRAWN));
    s.drawFraction = this.#fadeOut ? drawn : drawn * (1 - gone);
    // Nothing drawn shows nothing: an empty dash with round caps would still be a dot
    s.opacity = s.drawFraction > 0 ? this.#baseOpacity * (this.#fadeOut ? 1 - gone : 1) : 0;
  }

  protected override doFinish(): void {
    super.doFinish();
    const s = this.outline.style;
    if (!this.keep) {
      // Leaving the scene: restore it so the outline can be shown again
      delete s.drawFraction; s.opacity = this.#baseOpacity;
    } else if (s.drawFraction! >= 1) {
      delete s.drawFraction; // fully drawn: a plain shape from here on
    }
  }
}

/** The circle Circumscribe draws: centered on the box, through its corners, buff out. From 3 o'clock, clockwise (see Circle). */
function circleAround(target: Mobject | Box, buff: number, style: { stroke?: string; strokeWidth?: number } = {}): Circle {
  const b = boxOf(target, 'new Circumscribe()');
  const radius = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + buff;
  return new Circle({ radius, fill: 'none', ...style }).shift(center(b));
}

// ---- restore, copies, sequencing ----

/**
 * Transform a mobject back to the state saveState() stored:
 *
 *   box.saveState();
 *   await this.play(box.animate.setFill(RED).scale(1.5));
 *   await this.play(new Restore(box));
 *
 * The saved state is read when the play begins. When it ends (with a rate
 * function that ends at 1), the mobject equals the saved state exactly, in
 * points, style and structure, as restore() would leave it.
 */
export class Restore extends Transform {
  /** The saved state this run returns to, read as it begins. */
  #state!: Mobject;
  /** Whether nothing structural changed since the save, read as it begins. */
  #same = false;

  constructor(mobject: Mobject, opts: Omit<TransformOptions, 'replace'> = {}) { super(mobject, mobject, opts); }

  /** @internal A fresh copy is this animation's alone; it needs no alignment if nothing structural changed since the save. */
  override [knownAtBegin](): KnownTarget { return { owned: true, same: this.#same }; }

  protected override doBegin(): void {
    const saved = savedState(this.mobject);
    if (!saved) throw new Error(`new Restore(): ${mobjectName(this.mobject)} has no saved state; call m.saveState() first`);
    this.#state = saved;
    this.target = saved.copy(); this.#same = this.mobject.sameShapeAs(saved, true);
    super.doBegin();
  }

  protected override doFinish(): void {
    super.doFinish();
    // Alignment may have subdivided curves or added null children on the way: end
    // on the saved data itself. Same picture, exact data.
    if (this.rateFunc(1) === 1) adoptState(this.mobject, this.#state);
  }
}

/** The key of TransformFromCopy's copy of its source, taken before anything in its play begins (see takeCopies). */
const takeCopy = Symbol('takeCopy');

/**
 * A copy of `source` morphs into `target`: `source` stays where it is,
 * unchanged, and the scene holds `target` at the end (the copy hands over to
 * it, as with `replace`). The copy is made when the play begins, before any
 * animation in the play begins (see takeCopies), so it is `source` as the
 * play found it whatever the argument order; until then `mobject` is an empty
 * placeholder, so the copy, a different mobject from `source`, conflicts with
 * nothing: `play(new TransformFromCopy(a, b), a.animate.scale(1.2))` and
 * `play(new Create(a), new TransformFromCopy(a, b))` are fine.
 */
export class TransformFromCopy extends Transform {
  readonly source: Mobject;
  /** The copy taken for the next begin, or null. */
  #taken: Mobject | null = null;

  constructor(source: Mobject, target: Mobject, opts: Omit<TransformOptions, 'replace'> = {}) {
    super(new Group(), target, { ...opts, replace: true });
    this.source = source;
  }

  /** @internal Copy the source now, for the next begin; a second call before it keeps the first copy. */
  [takeCopy](): void {
    if (this.#taken) return;
    this.#taken = this.source.copy();
    const from = this.source.family();
    this.#taken.family().forEach((m, i) => { if (from[i]) copiedFrom.set(m, from[i]); });
  }

  protected override doBegin(): void {
    this[takeCopy]();
    this.mobject = this.#taken!; this.#taken = null;
    super.doBegin();
  }
}

/** Each part of a TransformFromCopy's copy, to the part of the source it copies: the motion verifier's provenance. */
export const copiedFrom = new WeakMap<Mobject, Mobject>();

/**
 * Make every TransformFromCopy's copy in `anims` (nested in groups too, and a
 * Succession's first member, which begins with the play) before any of them
 * begins: another animation's begin() may change the source (Create hides it).
 */
export function takeCopies(anims: readonly ScheduledAnimation[]): void {
  for (const a of anims) {
    if (a instanceof TransformFromCopy) a[takeCopy]();
    else if (a instanceof Succession) takeCopies(membersOf(a).slice(0, 1));
    else if (a instanceof AnimationGroup) takeCopies(membersOf(a));
  }
}

/**
 * Where a Succession is in its play, as one value: each change is made in one place (see Succession).
 *
 * - `idle`: not in a play: before its first, or once its last member has finished (or it landed).
 * - `running`: its members follow the play's time; the running member runs, and those before it have finished.
 * - `held`: the running member holds it. It waits to begin, or for something it made at its turn to
 *   begin; or, `closing`, it has finished and its own members still finish in turn before it is
 *   cleaned up. The play's time carries on meanwhile, and the Succession catches up in the turn the
 *   scene takes after that member (see afterHeld).
 *
 * In a play it keeps `play`, which names that play (a turn taken for an earlier one does nothing),
 * `reached`, the time its last frame drew, `to`, where the play has taken it, and `finishing`,
 * whether its play has finished it, so every member still to come begins and finishes in turn, at
 * `endAt`, the alpha it was finished at.
 */
type SuccessionState =
  | { is: 'idle' }
  | { is: 'running'; play: object; reached: number; to: number; finishing: boolean; endAt: number }
  | { is: 'held'; play: object; reached: number; to: number; finishing: boolean; endAt: number; closing: boolean };

/**
 * The key of whether a Succession stands for one call that plays what its beats make (see Beats): a
 * play's `rateFunc` and `lagRatio` then reach what each beat makes, as they reach an animation, and
 * its own time stays linear.
 */
const passesEasing = Symbol('passesEasing');
/** The key of what a Succession does once its last member has finished and been cleaned up, as its play finished it. Nothing, by default. */
const ended = Symbol('ended');
/** The key of the call a Succession made at its turn belongs to (`machine.send()`), which its messages name. */
const madeBy = Symbol('madeBy');
/** @internal The member a Succession runs now, read by play()'s one-writer check; undefined outside a play. */
export let runningOf: (s: Succession) => ScheduledAnimation | undefined;

/**
 * Run animations one after another: each begins when the previous ends, as
 * consecutive play() calls would, so members may drive the same mobject:
 *
 *   await this.play(new Succession([new Create(box), box.animate.shift([1, 0]), new FadeOut(box)]));
 *
 * Each member begins at its turn (its endpoints are fixed from the state the
 * previous one left) and is finished and cleaned up at its end, through the
 * scene, exactly as a play would. Run time is the sum of the members' (frame
 * counts match consecutive plays when each is a whole number of frames). Time
 * through a Succession is linear by default; members ease with their own
 * rate functions, and a group rate function must not run time back past the
 * start of a member that has finished. It takes no lagRatio.
 *
 * A member's turn is taken in turn order with everything else begun or made at
 * its turn in the same frame (see beginWhenReady). A member that waits to begin
 * (an action's beat whose picture reads a diagram's layout, or one begun after
 * something else that waits) holds the Succession: the members after it begin
 * only once it has begun, at the time the play has reached, however short it is.
 */
export class Succession extends AnimationGroup {
  /** Index of the member running now; earlier ones have finished. Set as it begins. */
  #active = -1;
  /** What a play gave an action to pass to what its beats make (see passesEasing). */
  #easing: Timing = {};
  /** @internal Whether it passes a play's easing to its beats (see passesEasing): an animation of beats does. */
  readonly [passesEasing]: boolean = false;
  /** @internal The call it belongs to when the engine made it at a turn (see madeBy). */
  [madeBy]: string | undefined = undefined;

  /** Members join `scene` (set by play(), see bindSuccessions) as they begin, as each would in a play of its own. */
  constructor(animations: Playable[], opts: Omit<AnimationOptions, 'lagRatio'> = {}) {
    super(animations.map((x) => isAnimateBuilder(x) ? new BuiltTransform(x) : x), { rateFunc: linear, ...opts, lagRatio: 1 });
    if (opts.rateFunc) assertForward('new Succession()', opts.rateFunc, timingsOf(this), maxEndOf(this));
  }
  static {
    runningOf = (s) => s.#state.is === 'idle' ? undefined : membersOf(s)[s.#active];
  }

  /**
   * @internal Its members run one after another, so it takes no lagRatio, and its time must not run
   * back past the start of a member that has finished. An action's play gives both to what its beats
   * make instead (see passesEasing).
   */
  override [refuseTiming](api: string, { rateFunc, lagRatio }: Timing, play = false): void {
    if (play && this[passesEasing]) return;
    const what = this[madeBy] ? 'it plays its parts' : 'a Succession runs its members';
    if (lagRatio != null) throw new RangeError(`${api}: ${what} one after another, so it takes no lagRatio, and it was given ${lagRatio}; stagger them in a LaggedStart or an AnimationGroup instead`);
    if (rateFunc) assertForward(api, rateFunc, timingsOf(this), maxEndOf(this));
  }

  /** @internal A play's runTime stretches it; its rateFunc warps its time, or, for an action, reaches what its beats make, with its lagRatio. */
  override [takeOptions]({ runTime, rateFunc, lagRatio }: PlayOptions = {}): this {
    if (!this[passesEasing]) return super[takeOptions]({ runTime, rateFunc });
    this.#easing = easingOf({ rateFunc, lagRatio });
    return super[takeOptions]({ runTime });
  }

  /** Where it is in its play (see SuccessionState). */
  #state: SuccessionState = { is: 'idle' };

  protected override doBegin(): void {
    this.#active = -1;
    this.#state = { is: 'running', play: {}, reached: 0, to: 0, finishing: false, endAt: 1 };
    this.#beginNext();
  }

  /** The call messages name it by: an action's (`view.sync()`), the call the engine made it for (`machine.send()`), or `new Succession()`. */
  #call(): string {
    const name = (this as { name?: unknown }).name;
    return typeof name === 'string' && name ? name : this[madeBy] ?? 'new Succession()';
  }

  /** Its state in a play: refused outside one, which only a hook called directly could reach. */
  #playing(): Exclude<SuccessionState, { is: 'idle' }> {
    const s = this.#state;
    if (s.is === 'idle') {
      const call = this.#call();
      throw new Error(`${call}: ${animationName(this)} is not in a play; play it with this.play()`);
    }
    return s;
  }

  /** Begin the next member at its turn: through the scene, in turn order with what else begins in this frame. */
  #beginNext(): void {
    const scene = this[playScene], { play } = this.#playing();
    const next = membersOf(this)[++this.#active];
    if (!next) return;
    handEasing(next, this.#easing, this.#call());
    // A Succession the engine made for a call names that call, as this one does.
    if (next instanceof Succession && next[madeBy] === undefined && this.#call() !== 'new Succession()') next[madeBy] = this.#call();
    if (!scene) return beginAnimation(next);
    // A turn taken for an earlier play (one that has landed since) begins nothing.
    beginWhenReady(scene, [next], 'new Succession()', () => { if (this.#in(play)) beginAnimations(scene, [next]); });
  }

  /** Whether it is still in the play `play` began. */
  #in(play: object): boolean {
    const s = this.#state;
    return s.is !== 'idle' && s.play === play;
  }

  /**
   * The time `alpha` reaches: the running member follows it, backwards too (a there-and-back group
   * around a one-beat action), but never back past the start of the running member, since a finished
   * member cannot run again.
   */
  protected override doInterpolate(alpha: number): void {
    const s = this.#playing(), t = alpha * maxEndOf(this);
    const start = timingsOf(this)[this.#active]?.[0] ?? maxEndOf(this);
    if (t < s.reached - 1e-9 && t < start - 1e-9) {
      const call = this.#call();
      throw new Error(`${call}: its time ran backwards, from ${s.reached} s to ${t} s, past the start of its member at ${start} s after the one before it finished, and a finished member cannot run again; give it, and any group around it, a rate function that never decreases`);
    }
    this.#state = { ...s, reached: t, to: t };
    if (s.is === 'running') this.#catchUp();
  }

  /** Every member still to come begins and finishes in turn, then the last one finishes, at the time `alpha` gives it. */
  protected override doFinish(alpha: number = this.rateFunc(1)): void {
    const s = this.#playing();
    this.#state = { ...s, finishing: true, endAt: alpha };
    if (s.is === 'running') this.#catchUp();
  }

  /**
   * Take the members to where the play has taken it: each whose turn has come finishes and is
   * cleaned up, as the end of a play would, and the next begins; then the running one draws its
   * frame (finishing, every member ends instead, and so does it, the last at the time its play
   * finished it at). A member that waits to begin, or, finished, for its own members to finish,
   * holds it here: it carries on in a turn the scene takes once that member has, so whatever the
   * members do happens in their order.
   */
  #catchUp(closing = false): void {
    const scene = this[playScene], members = membersOf(this), timings = timingsOf(this);
    for (;;) {
      const a = members[this.#active];
      if (a && (closing ? a[waits]() : phaseOf(a) !== 'begun' || a[waits]())) return this.#hold(closing);
      if (a && closing) {
        closing = false;
        if (scene) a[cleanUp](scene);
        this.#beginNext();
        continue;
      }
      const { to, finishing, endAt } = this.#playing();
      // A frame exactly on a boundary shows the earlier member's end, as its play's last frame does
      const due = this.#active < members.length &&
        (finishing || (this.#active + 1 < members.length && to > timings[this.#active + 1]![0]));
      if (!due) break;
      if (a) {
        const last = finishing && this.#active === members.length - 1;
        finishAnimation(a, last ? rateFuncOf(a)(this.#local(endAt * maxEndOf(this))) : undefined);
        closing = true;
      } else this.#beginNext();
    }
    const { to, finishing } = this.#playing();
    if (finishing) {
      this.#state = { is: 'idle' };
      return this[ended]();
    }
    const a = members[this.#active];
    if (!a) return;
    interpolateAnimation(a, rateFuncOf(a)(this.#local(to)));
  }

  /** The running member's own time fraction at time `t` of the Succession. */
  #local(t: number): number {
    const [start, end] = timingsOf(this)[this.#active]!;
    return clip((t - start) / (end - start || 1), 0, 1);
  }

  /** Held by the running member: carry on in a turn the scene takes after what it waits for (see afterHeld). */
  #hold(closing: boolean): void {
    const scene = this[playScene];
    const call = this.#call();
    if (!scene) throw new Error(`${call}: ${animationName(membersOf(this)[this.#active]!)} waits to begin, or for its own members, in a Succession with no scene, and only a play can wait; play the Succession with this.play()`);
    const s = this.#playing();
    this.#state = { ...s, is: 'held', closing };
    afterHeld(scene, 'new Succession()', () => {
      const now = this.#state;
      // Landed meanwhile, or played again: this turn was taken for another play.
      if (now.is !== 'held' || now.play !== s.play) return;
      this.#state = { is: 'running', play: now.play, reached: now.reached, to: now.to, finishing: now.finishing, endAt: now.endAt };
      this.#catchUp(now.closing);
    });
  }

  /** @internal Called once its last member has finished and been cleaned up, as its play finished it. Nothing, by default. */
  [ended](): void {}

  /** @internal Whether a member holds it (see #catchUp). */
  override [waits](): boolean { return this.#state.is === 'held'; }

  /** @internal After a failure: the running member lands, if it has begun; no member after it begins. */
  override [lands](scene: Scene | null): void {
    this.#state = { is: 'idle' };
    super[lands](scene);
  }

  /** @internal Members were cleaned up as each finished. */
  override [cleanUp](_scene: Scene): void {}

  /** What its members that have begun write: members join the scene as they begin. */
  override targets(): Mobject[] { return this.#membersBegun(); }

  /** The mobjects of the members that have begun, as each joins the scene. */
  #membersBegun(): Mobject[] {
    const members = membersOf(this), cur = members[this.#active], s = this.#state;
    const closing = s.is === 'held' && s.closing;
    const upTo = cur && !closing && phaseOf(cur) !== 'begun' ? this.#active : this.#active + 1;
    return members.slice(0, upTo).flatMap((a) => a instanceof Succession ? a.#membersBegun()
      : a instanceof AnimationGroup ? membersOf(a).flatMap((m) => m.targets()).filter(Boolean) : [a.mobject]).filter(Boolean);
  }
}

/**
 * Refuse a rate function that runs a Succession's time back past the start of a member that has
 * finished, over `timings` of `total` seconds: a finished member does not run again. Within one
 * member time may run back (a there-and-back Succession of one member). Sampled at 240 points,
 * finer than a second at most fps.
 */
function assertForward(api: string, rateFunc: RateFunc, timings: ReadonlyArray<readonly [number, number]>, total: number): void {
  const starts = timings.slice(1).map(([start]) => start);
  let reached = -Infinity;
  for (let i = 0; i <= 240; i++) {
    const t = rateFunc(i / 240) * total;
    reached = Math.max(reached, t);
    // The start of the latest member the time has reached, whose members before it have finished
    const passed = starts.filter((s) => s < reached - 1e-9).at(-1);
    if (passed !== undefined && t < passed - 1e-9)
      throw new RangeError(`${api}: its rate function must not run its time back past the start of a part that has finished, and this one goes from ${reached.toFixed(3)} s back to ${t.toFixed(3)} s, before the member at ${passed.toFixed(3)} s; give one such as linear or smooth, and run a there-and-back motion as its own play`);
  }
}

/**
 * A `.animate` builder as a Transform whose target is built when it begins.
 * In a Succession that is after the members before it have run, so
 * `box.animate.shift(UP)` shifts from wherever they left the box.
 */
class BuiltTransform extends Transform {
  readonly #builder: AnimateBuilderBase;
  constructor(builder: AnimateBuilderBase) { super(builder.mobject, builder.mobject); this.#builder = builder; }
  /** @internal The built target is this animation's alone; its structure may differ (setText), so it still aligns. */
  override [knownAtBegin](): KnownTarget { return { owned: true, same: false }; }
  protected override doBegin(): void {
    this.target = this.#builder.buildTarget();
    super.doBegin();
  }
}

/**
 * @internal An animation whose members are made when its turn comes in a play, from the pictures on
 * screen then: an action's beat, or a machine's transition. Until then it stands for the mobjects it
 * declares it writes. As it begins it makes its members; once what they read is ready (the play
 * waits for that before its next frame, see beginWhenReady) they are settled, laid out in its run
 * time, and begun through the scene, which checks them against everything else the play drives.
 * Until they have begun it waits (see waits): a Succession that holds it begins nothing after it,
 * so one shorter than a frame still plays, held and then finished. When one of them throws as it
 * begins, those begun before it land, and it has made nothing. Messages name it by `call`, the
 * call it belongs to (`s.card()`, `machine.send("UP")`), and `subject`, what it is (`a beat`, `the
 * transition`). A play's `rateFunc` and `lagRatio`, passed on by the action that holds it, reach what
 * it makes, as they reach an animation.
 */
export abstract class MadeAtTurn extends AnimationGroup {
  protected readonly call: string;
  readonly #subject: string;
  readonly #declared: readonly Mobject[];
  /** What a play gave the action that holds it, for what it makes. */
  #easing: Timing = {};
  /** Its members: not made before it begins, waiting for what they read (with the alpha a frame gave it meanwhile), or begun. */
  #turn: { made: 'not yet' } | { made: 'waiting'; at: number | null } | { made: 'begun' } = { made: 'not yet' };

  constructor(call: string, subject: string, runTime: number, declared: readonly Mobject[] = []) {
    super([], { runTime, rateFunc: linear });
    this.call = call;
    this.#subject = subject;
    this.#declared = declared;
  }
  /** @internal Its run time is planned; a play's rateFunc and lagRatio are for what it makes. */
  override [takeOptions]({ runTime, ...easing }: PlayOptions = {}): this {
    this.#easing = easingOf(easing);
    return super[takeOptions]({ runTime });
  }
  /** Its members, made as its turn comes. */
  protected abstract make(): ScheduledAnimation[];
  /** Each member's start and end in its own time, once settled; it may refuse members that do not fit. All of it by default. */
  protected slots(made: readonly ScheduledAnimation[]): Array<[number, number]> {
    return made.map(() => [0, 1]);
  }
  /**
   * Called once what it made has finished and left the scene, as the end of its play leaves it; or,
   * after a failure, once what it made has landed, if it had begun. Nothing, by default.
   */
  protected after(): void {}
  protected override doBegin(): void {
    const scene = this[playScene];
    if (!scene) throw new Error(`${this.call}: ${this.#subject} has no scene to play on; play it with this.play() on the scene it belongs to`);
    adoptMembers(this, [], []);
    this.#turn = { made: 'not yet' };
    const members = this.make();
    for (const a of members) {
      if (a instanceof Succession && a[madeBy] === undefined) a[madeBy] = this.call;
      handEasing(a, this.#easing, this.call);
    }
    const turn: { made: 'waiting'; at: number | null } = { made: 'waiting', at: null };
    this.#turn = turn;
    beginWhenReady(scene, members, this.call, () => {
      // Landed meanwhile, after a failure: what it made never begins.
      if (this.#turn !== turn) return;
      for (const a of members) a[settle]();
      // Its members before they begin, so the scene checks them, not what it declared, against the play.
      adoptMembers(this, members, this.slots(members));
      this.#turn = { made: 'begun' };
      try { beginAnimations(scene, members, this.call); }
      catch (e) {
        // Those begun before the one that threw have landed: it made nothing that plays.
        adoptMembers(this, [], []);
        this.#turn = { made: 'not yet' };
        throw e;
      }
      // Begun after the play waited: it takes the frame it was given while it waited.
      if (turn.at !== null) super.doInterpolate(turn.at);
    });
  }
  protected override doInterpolate(alpha: number): void {
    const turn = this.#turn;
    if (turn.made === 'waiting') turn.at = alpha;
    else super.doInterpolate(alpha);
  }
  protected override doFinish(alpha?: number): void {
    // A play, a group and a Succession each wait for what it made before they finish it.
    if (this.#turn.made === 'waiting') throw new Error(`${this.call}: ${this.#subject} was finished while what it made still waited for what it reads; play it with this.play(), or in a Succession or group that plays, which wait for it`);
    super.doFinish(alpha);
  }
  /** @internal Whether what it made has yet to begin, or a member of it waits in turn. */
  override [waits](): boolean {
    return this.#turn.made === 'waiting' || super[waits]();
  }
  /** @internal What it made is cleaned up, then `after` runs. */
  override [cleanUp](scene: Scene): void {
    super[cleanUp](scene);
    this.after();
  }
  /** @internal After a failure: what it made lands, then `after` runs, if it has begun; it never begins if it has not. */
  override [lands](scene: Scene | null): void {
    const began = this.#turn.made === 'begun';
    this.#turn = { made: 'not yet' };
    super[lands](scene);
    if (began) this.after();
  }
  /** Before its members are made, what it declares; then theirs. */
  override targets(): Mobject[] {
    return this.#turn.made === 'begun' ? super.targets() : [...this.#declared];
  }
  /** @internal Its members are made when its turn comes; its run time was planned. */
  override [settle](): void {}
}

/**
 * @internal One play of an animation of beats (see Beats): its run time, fixed when the plan is
 * made, and what it does when its turn comes. `play` makes the beat's side effects and its
 * animations at that moment (none plays nothing); `after` runs once they have finished and left
 * the scene.
 */
export interface Beat {
  runTime: number;
  play: () => ScheduledAnimation[];
  after?: () => void;
}

/** @internal What deciding an animation of beats gives: what it gives, its beats in order, and what happens before the first and after the last. */
export interface BeatPlan<T> {
  value: T;
  beats: readonly Beat[];
  start?: () => void;
  end?: () => void;
}

/** A beat's animations must take the run time it was planned with: a play of each, or a slot in its Succession. */
function checkBeatTime(call: string, beat: Beat, made: readonly ScheduledAnimation[]): void {
  if (!made.length) return;
  const took = Math.max(...made.map(runTimeOf));
  if (Math.abs(took - beat.runTime) > 1e-9)
    throw new Error(`${call}: one of its plays takes ${took} s, where ${beat.runTime} s was planned`);
}

/**
 * A beat as a member of its Succession: made when its turn comes, then begun through the scene as
 * a play begins its animations; `after` runs once they are cleaned up, as it does after a play, and
 * after a failure once they have landed, if they had begun.
 */
class BeatPlay extends MadeAtTurn {
  readonly #beat: Beat;
  constructor(beat: Beat, call: string) {
    super(call, 'a beat', beat.runTime);
    this.#beat = beat;
  }
  protected override make(): ScheduledAnimation[] {
    return this.#beat.play();
  }
  /** Each animation from the beat's start, for its own run time, which must be the beat's planned one. */
  protected override slots(made: readonly ScheduledAnimation[]): Array<[number, number]> {
    checkBeatTime(this.call, this.#beat, made);
    return made.map((a) => [0, runTimeOf(a)]);
  }
  protected override after(): void {
    this.#beat.after?.();
  }
}

/** What deciding an animation of beats gave: its plan, or the error deciding it (or reading what it reads) threw; null until a late one is decided. */
type BeatDecision<T> = { plan: BeatPlan<T> } | { error: unknown } | null;

/**
 * Where an animation of beats is in its life, as one value: each change is made in one place below.
 *
 * - `reading`: made, not played, and what it reads is not ready (`ready` has not settled).
 * - `ready`: made, not played, and what it reads is ready; a late one is decided as it begins.
 * - `alone`: playing alone, beat by beat; `run` is what it gives then.
 * - `composed`: begun by a play, or by the Succession or group that holds it.
 * - `ended`: its last beat has played and its `end` has run, after it played alone (`run`) or
 *   composed (`run` is null).
 *
 * Before it plays it may be `reading`, then `ready`; it plays once, alone or composed, then ends.
 * A begin that fails leaves it as it was, unplayed, whatever failed: what it reads not ready,
 * deciding it, its `start`, or its first beat's making or beginning. It can then play again. What
 * a `start` that ran did stays done. A play that fails after it began leaves it as it was then,
 * `alone` (its `run` rejecting with the failure) or `composed`, and its `end` does not run: it has
 * played, so it cannot play again.
 */
type BeatsState<T> =
  | { is: 'reading'; decision: BeatDecision<T> }
  | { is: 'ready'; decision: BeatDecision<T> }
  | { is: 'alone'; decision: BeatDecision<T>; run: Promise<T> }
  | { is: 'composed'; plan: BeatPlan<T> }
  | { is: 'ended'; plan: BeatPlan<T>; run: Promise<T> | null };

/**
 * @internal An animation made of beats, on the scene it changes, that plays once: alone, each beat
 * in a play of its own on that scene (see alone), or composed, handed to play(), a Succession or a
 * group, its beats one after another as a Succession's members, each made at its turn (see
 * MadeAtTurn). Both run the same beats, with the same side effects at the same moments between
 * them. A play's `rateFunc` and `lagRatio` reach what its beats make, as they reach an animation;
 * its own time stays linear.
 *
 * `make` decides it when it is made, or, with `late`, once `ready` has settled and the play that
 * holds it begins (a play waits for `ready`, a group's members' included, and so does a play for
 * what is made at its turn there): its run time is known from then. Its `start` runs before its
 * first beat and its `end` after its last, alone or composed. rayner/explain's actions are these:
 * `name` is the call that made one (`s.card()`), which its refusals name.
 */
export abstract class Beats<T> extends Succession {
  /** The call that made it, as messages name it: `s.card()`, `d.walk()`. */
  readonly name: string;
  /** @internal The scene it plays on: a play on another scene refuses it. */
  readonly [playsOn]: Scene;
  /** @internal A play's rateFunc and lagRatio reach what its beats make, as they reach an animation; its own time stays linear. */
  override readonly [passesEasing] = true;
  /** What decides it: what it gives and its beats. */
  readonly #make: () => BeatPlan<T>;
  /** Settles once what it reads is ready, recording a failure as its decision; null when it reads nothing. */
  readonly #waiting: Promise<void> | null;
  #state: BeatsState<T>;

  constructor(scene: Scene<any, any>, name: string, make: () => BeatPlan<T>, { ready, late = false }: { ready?: Promise<unknown>; late?: boolean } = {}) {
    let decision: BeatDecision<T> = null;
    if (!late)
      try {
        decision = { plan: make() };
      } catch (error) {
        decision = { error };
      }
    super(decision && 'plan' in decision ? decision.plan.beats.map((b) => new BeatPlay(b, name)) : []);
    this.name = name;
    this[playsOn] = scene;
    this.#make = make;
    this.#state = { is: ready ? 'reading' : 'ready', decision };
    this.#waiting = ready
      ? ready.then(
          () => {
            if (this.#state.is === 'reading') this.#state = { is: 'ready', decision: this.#state.decision };
          },
          (error: unknown) => {
            const s = this.#state;
            if (s.is === 'reading') this.#state = { is: 'ready', decision: s.decision && 'error' in s.decision ? s.decision : { error } };
            else if (s.is === 'alone' && !(s.decision && 'error' in s.decision)) this.#state = { ...s, decision: { error } };
          },
        )
      : null;
  }

  /** What it was decided to give, once decided; null before a late one is. Throws what deciding it, or reading what it reads, threw. */
  protected decided(): BeatPlan<T> | null {
    const s = this.#state;
    const decision: BeatDecision<T> = 'plan' in s ? { plan: s.plan } : s.decision;
    if (decision && 'error' in decision) throw decision.error;
    return decision ? decision.plan : null;
  }

  /** Called once it has begun to play, alone or composed: from then it has played. Nothing, by default. */
  protected playing(): void {}

  /** The refusal of a second play, after it played `how`, for a play `now`. */
  #playedAlready(how: 'alone' | 'composed', now: 'alone' | 'composed'): Error {
    return new Error(
      `${this.name}: it has already played${how === 'composed' ? ' in a play' : ''}; it plays once, so call it again to play it again` +
        (how === 'composed' && now === 'alone' ? ', and read what it gave from its value' : ''),
    );
  }

  /** How it played, once it has: alone or composed; null before. */
  #played(): 'alone' | 'composed' | null {
    const s = this.#state;
    switch (s.is) {
      case 'reading': case 'ready': return null;
      case 'alone': case 'composed': return s.is;
      case 'ended': return s.run ? 'alone' : 'composed';
    }
  }

  /**
   * Its plan, deciding a late one now (once what it reads is ready), its beats laid out as this
   * Succession's members; throws what deciding it threw. Called from `ready`, before it begins, or `alone`.
   */
  #decide(): BeatPlan<T> {
    const s = this.#state;
    if (s.is === 'composed' || s.is === 'ended') return s.plan;
    if (s.decision) {
      if ('error' in s.decision) throw s.decision.error;
      return s.decision.plan;
    }
    let plan: BeatPlan<T>;
    try {
      plan = this.#make();
    } catch (error) {
      this.#state = { ...s, decision: { error } };
      throw error;
    }
    this.#state = { ...s, decision: { plan } };
    // Laid out as a Succession lays out its members; a run time given to play() is kept.
    adoptMembers(this, plan.beats.map((b) => new BeatPlay(b, this.name)));
    return plan;
  }

  /** @internal */ override [whenReady](): Promise<unknown> | null {
    return this.#state.is === 'reading' ? this.#waiting : null;
  }

  /** @internal Decided now, if it was not when made: what it reads is ready, and the play that holds it is beginning. */
  override [settle](): void {
    const s = this.#state;
    if (s.is === 'reading') throw new Error(`${this.name}: played before what it reads was ready; hand it to play(), or to a Succession or group that plays, which waits for it`);
    if (s.is === 'ready') this.#decide();
  }

  /** Composed: begun by a play, or by the Succession or group that holds it. A begin that fails leaves it unplayed. */
  protected override doBegin(): void {
    const s = this.#state;
    const how = this.#played();
    if (how) throw this.#playedAlready(how, 'composed');
    if (s.is === 'reading') throw new Error(`${this.name}: begun before what it reads was ready; hand it to play(), or to a Succession or group that plays, which waits for it`);
    const plan = this.#decide();
    plan.start?.();
    super.doBegin();
    // Composed only once it has begun: a start or a first beat that throws leaves it unplayed.
    this.#state = { is: 'composed', plan };
    this.playing();
  }

  /** @internal Its last beat has finished and gone: its `end` runs. */
  override [ended](): void {
    const s = this.#state;
    if (s.is !== 'composed') return;
    this.#state = { is: 'ended', plan: s.plan, run: null };
    s.plan.end?.();
  }

  /**
   * Played alone: each beat in a play of its own on its scene, then what it gives. Called again once
   * it plays alone, it gives the same promise; after a composed play, a promise that rejects.
   */
  protected alone(): Promise<T> {
    const s = this.#state;
    if (s.is === 'alone' || (s.is === 'ended' && s.run)) return s.run!;
    if (s.is !== 'reading' && s.is !== 'ready') return Promise.reject(this.#playedAlready(this.#played()!, 'alone'));
    // It starts after this state is set (an await, of what it reads or of nothing), so it ends after it too.
    // A beat that fails leaves it alone, its run rejecting with the failure.
    let run!: Promise<T>;
    run = (async () => {
      await this.#waiting;
      const plan = this.#decide();
      plan.start?.();
      for (const beat of plan.beats) {
        const made = beat.play();
        checkBeatTime(this.name, beat, made);
        if (made.length) await this[playsOn].play(...made);
        beat.after?.();
      }
      this.#state = { is: 'ended', plan, run };
      plan.end?.();
      return plan.value;
    })();
    this.#state = { is: 'alone', decision: s.decision, run };
    this.playing();
    return run;
  }
}

/**
 * @internal An animation that runs another inside it, made as it begins: begun with it, each frame
 * drawn at its own rate function of this one's eased time, and finished with it, as a group runs a
 * member that fills it. What it runs never joins the scene by itself: this animation stands for
 * it, with its own targets, evidence and clean-up. `enclose()` makes it as this one begins, or
 * gives null when there is nothing to draw.
 */
export abstract class Enclosing extends Animation {
  /** What it runs, once begun; null before, or when there is nothing to draw. */
  #inner: ScheduledAnimation | null = null;
  /** What it runs, made as it begins: called once per begin. */
  protected abstract enclose(): ScheduledAnimation | null;
  protected override doBegin(): void {
    this.#inner = null;
    const inner = this.enclose();
    if (inner) beginAnimation(inner);
    this.#inner = inner;
  }
  protected override doInterpolate(alpha: number): void {
    const inner = this.#inner;
    if (inner) interpolateAnimation(inner, rateFuncOf(inner)(alpha));
  }
  protected override doFinish(alpha: number = this.rateFunc(1)): void {
    const inner = this.#inner;
    if (inner) finishAnimation(inner, rateFuncOf(inner)(alpha));
  }
}

/**
 * @internal Run `animation` to its end at once, outside any play: begun and finished, as a play
 * of no frames would leave what it animates, with nothing joining or leaving a scene.
 */
export function finishAtOnce(animation: ScheduledAnimation): void {
  beginAnimation(animation);
  finishAnimation(animation);
}

/**
 * Bind nested schedules to their scene, validating scene-bound state changes before
 * beginning: a Succession's members join it as they begin, and every group records
 * its members' evidence to it.
 */
export function bindSuccessions(anims: readonly ScheduledAnimation[], scene: Scene): void {
  for (const a of anims) {
    // A scene-bound animation (one that changes its scene's state, such as an action) names its scene under playsOn.
    const host = (a as { [playsOn]?: Scene })[playsOn];
    if (host && host !== scene) throw new Error(`this.play(): ${animationName(a)} belongs to another scene; play it on the scene it was made for`);
    if (!(a instanceof AnimationGroup)) continue;
    a[playScene] = scene;
    bindSuccessions(membersOf(a), scene);
  }
}

// ---- matching transforms ----
// Value imports for this block only, here so the block stays one piece (imports
// are hoisted; neither module imports this one).
import { VMobject as VMobjectClass } from './vmobject.ts';
import { Text, matchesClusters, clusterKeyOf } from './text.ts';
import type { Evidence } from './scene.ts';

/**
 * What a part matches by: equal strings pair up; undefined never matches.
 * `root` is the picture the part belongs to (the transform's source or target),
 * so a key can stop reading ancestors there; a key that ignores it is fine.
 */
export type MatchKey = (part: Mobject, root: Mobject) => string | undefined;

export interface MatchByKeyOptions {
  /** How parts under no key below the root pair, when given; it takes precedence over `unkeyed`. */
  fallback?: MatchKey;
  /**
   * Parts under no key below the root, without a fallback: 'fade' (default) pairs them with
   * nothing, so they fade out and in; 'by-place' pairs each with the part at the same place in
   * the other picture, as if the whole picture were one keyed component.
   */
  unkeyed?: 'fade' | 'by-place';
  /**
   * A keyed Text whose words change: 'by-place' (default) morphs its glyphs place by
   * place, as a readout's digits should; 'whole' pairs it only with the same words, so a
   * relabelled part fades out and in, as a renamed state or event should.
   */
  text?: 'by-place' | 'whole';
}

/**
 * Pair parts by the keys their author gave (`mobject.key`). A part inside a
 * keyed container pairs with the part at the same place inside the container
 * of the same key on the other side, so a keyed cell, label or node is kept as
 * one component wherever it moves and its own parts morph inside it. A keyed
 * part pairs by its own key; the nearest key wins when keyed containers nest.
 * Anything under no key below the root pairs by `fallback`, by default not at
 * all. The root's own key, and keys above it, are not read: they would make
 * every part the same component. A key two containers share pairs by distance,
 * as any repeated key does. `View.sync({ match: 'key' })` uses the defaults.
 */
export function matchByKey({ fallback, unkeyed = 'fade', text = 'by-place' }: MatchByKeyOptions = {}): MatchKey {
  return (part, root) => {
    const path: number[] = [];
    let under = false;
    for (let m: Mobject = part; m !== root; m = m.parent!) {
      if (!m.parent) return fallback?.(part, root); // not under the root: nothing above it is this picture's
      if (m.key !== undefined) {
        const words = text === 'whole' && m instanceof Text ? `|${m.text}` : '';
        return `${m.key}${words}|${path.reverse().join('.')}`;
      }
      path.push(m.parent.children.indexOf(m));
      under = true;
    }
    if (fallback) return fallback(part, root);
    return unkeyed === 'by-place' && under ? `\u0000|${path.reverse().join('.')}` : undefined;
  };
}

export interface MatchingOptions extends TransformOptions {
  /** Unmatched parts fade (default). false: morph them into each other by index, fading only the leftovers. */
  fadeMismatches?: boolean;
  /**
   * Pair runs of consecutive equal keys first, longest first, in family order
   * (reading order for Text and Code). For text, where order is meaning; shapes
   * in a diagram have no order and pair by distance alone.
   */
  ordered?: boolean;
  /**
   * Unmatched parts in turn instead of together: the source's go over the first half, the
   * target's come over the second, while matched parts morph throughout. A part that leaves and
   * one that takes its place (a word replaced by another) never overlap. Default false.
   */
  staged?: boolean;
}

export interface TransformMatchingOptions extends MatchingOptions { key: MatchKey }

/** What a TransformMatching did with each part; see TransformMatching.summary(). */
export interface MatchSummary { matched: number; morphed: number; removed: number; added: number }

/** A matched (or morphed) part: it blends from `start` into `end`, both fixed at begin(). */
interface MoveRow { sub: Mobject; start: Mobject; end: Mobject }
/**
 * An unmatched part, scaled between its full size (`pts`) and the point
 * (tx, ty) as it fades: where it shrinks to, or grows from. With `ride`, its
 * center at full size (a glyph of a Text line, in TransformMatchingText), the
 * center rides with the line instead, between that center and (tx, ty) as the
 * whole animation runs, and the part scales about it as its own (lagged) share
 * runs: a lagged glyph waits inside its line, not where the line was.
 */
interface FadeRow { sub: Mobject; pts: Float32Array[]; opacity: number; tx: number; ty: number; ride?: Vec }
/** A container's own points (a Text's advance box), blended between two fixed snapshots. */
interface FrameRow { node: Mobject; from: Float32Array[]; to: Float32Array[]; start?: Mobject; end?: Mobject }
/** Where a source frame's contents go: p -> k * p + (bx, by). */
interface Carry { k: number; bx: number; by: number }

/**
 * A Transform that pairs parts by key instead of by position in the family.
 * The parts of each side are its drawable pieces: every visible VMobject that
 * has points (a Text's glyphs, an Arrow's line and tip; not a Text's advance
 * box). Parts with equal keys pair up, by least total distance when a key
 * occurs more than once, and each pair morphs like a Transform. A source part
 * with no partner shrinks and fades out, a target part with no partner grows
 * and fades in, both carried along with the matched parts around them.
 *
 * One animation of the source: the pairing is computed at begin(), and the
 * target's unmatched parts are copied into the source (into the container that
 * corresponds to theirs), so play() sees one mobject and the scene draws
 * everything that moves. With `replace` (the default) the scene holds `target`
 * afterwards, as with manim's TransformMatchingShapes. The target is never
 * modified. See docs/MATCHING.md.
 */
/** What a TransformMatching's frames write, fixed as it begins. */
interface MatchRows {
  moves: MoveRow[];
  fadesOut: FadeRow[];
  fadesIn: FadeRow[];
  frames: FrameRow[];
  /** The source family after the copies were attached: whose boxes go stale each frame. */
  touched: Mobject[];
}
/** @internal The key of what a TransformMatching's frames write (see MatchRows), fixed as it begins. */
export const matchRows = Symbol('matchRows');

export class TransformMatching extends Animation {
  readonly target: Mobject;
  key: MatchKey;
  readonly #fadeMismatches: boolean;
  readonly ordered: boolean;
  readonly replace: boolean;
  readonly staged: boolean;
  // Set by begin(), in source order: [source part, target part]
  /** Parts paired by key. */
  pairs!: Array<[Mobject, Mobject]>;
  /** Unmatched parts morphed by index (fadeMismatches: false). */
  morphed!: Array<[Mobject, Mobject]>;
  /** Source parts that fade out. */
  removed!: Mobject[];
  /** Target parts that fade in (as copies inside the source). */
  added!: Mobject[];
  /** @internal What its frames write, fixed as it begins. */
  [matchRows]!: MatchRows;

  constructor(mobject: Mobject, target: Mobject, { key, fadeMismatches = true, ordered = false, replace = true, staged = false, ...opts }: TransformMatchingOptions) {
    super(mobject, opts);
    this.target = target; this.key = key; this.#fadeMismatches = fadeMismatches; this.ordered = ordered;
    this.replace = replace; this.staged = staged;
  }

  /** @internal */ override [paintTargets](): Mobject[] { return [this.mobject, this.target]; }

  /** How many parts were matched, morphed, faded out and faded in. */
  summary(): MatchSummary {
    return { matched: this.pairs.length, morphed: this.morphed.length, removed: this.removed.length, added: this.added.length };
  }

  /** What play() records once this has begun: the counts, as `match` evidence. */
  override evidence(): Evidence { return { kind: 'match', ...this.summary() }; }

  protected override doBegin(): void {
    const src = this.mobject, tgt = this.target;
    const sParts = partsOf(src), tParts = partsOf(tgt);
    // Containers with points of their own (Text, whose advance box is a point
    // array) are frames: a glyph belongs to its line. Each target frame takes
    // the source frame most of its matched parts come from, so a line's advance
    // box travels with its glyphs and a new glyph joins the line it ends up in.
    const sFrames = framesOf(src), tFrames = framesOf(tgt);
    const frameOfS = (p: Mobject) => frameOf(p, src), frameOfT = (p: Mobject) => frameOf(p, tgt);
    const sIndex = new Map(sFrames.map((f, i) => [f, i])), tIndex = new Map(tFrames.map((f, i) => [f, i]));
    const sf = Int32Array.from(sParts, (p) => sIndex.get(frameOfS(p))!), tf = Int32Array.from(tParts, (p) => tIndex.get(frameOfT(p))!);
    const toSource = new Map<Mobject, Mobject>([[tgt, src]]);
    const mapFrames = (pairOf: Int32Array): void => {
      const votes = new Map<number, number>();
      pairOf.forEach((j, i) => { if (j >= 0) { const k = sf[i]! * tFrames.length + tf[j]!; votes.set(k, (votes.get(k) ?? 0) + 1); } });
      const mapped = new Set<Mobject>(toSource.values());
      for (const [k] of [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
        const fs = sFrames[Math.floor(k / tFrames.length)]!, ft = tFrames[k % tFrames.length]!;
        if (!toSource.has(ft) && !mapped.has(fs)) { toSource.set(ft, fs); mapped.add(fs); }
      }
    };
    // Ordered: runs pair first and decide which line is which; a lone leftover
    // then pairs only within its own line, so stray letters do not fly across
    // the text (and each line stays one piece, the way MotionSink sees a Text)
    const pairOf = matchParts(sParts, tParts, [src, tgt], this.key, this.ordered, (runs) => {
      mapFrames(runs);
      return [sf, Int32Array.from(tf, (f) => sIndex.get(toSource.get(tFrames[f]!)!) ?? -1)];
    });
    if (!this.ordered) mapFrames(pairOf);
    const taken = new Set(pairOf), removed = sParts.filter((_, i) => pairOf[i]! < 0), added = tParts.filter((_, j) => !taken.has(j));
    const m = this.#fadeMismatches ? 0 : Math.min(removed.length, added.length);
    this.pairs = sParts.flatMap((s, i): Array<[Mobject, Mobject]> => (pairOf[i]! >= 0 ? [[s, tParts[pairOf[i]!]!]] : []));
    this.morphed = removed.slice(0, m).map((s, i) => [s, added[i]!]);
    this.removed = removed.slice(m);
    this.added = added.slice(m);
    // A frame follows morphed contents too. With no equal glyph shapes (for
    // example, an anisotropically compressed label), matched-only votes leave
    // its transform metadata behind while its glyphs move to the target.
    if (m) {
      const withMorphs = pairOf.slice();
      for (const [s, t] of this.morphed) withMorphs[sParts.indexOf(s)] = tParts.indexOf(t);
      mapFrames(withMorphs);
    }
    const linked = [...this.pairs, ...this.morphed];
    // Where each source frame's contents go: scaled as its advance box scales
    // (a font size change), translated by the median move of its matched parts
    const carry = new Map<Mobject, Carry>();
    for (const [ft, fs] of toSource) {
      const hs = ownHeight(fs), ht = ownHeight(ft);
      const k = hs > 1e-9 && ht > 1e-9 && !(fs instanceof VMobjectClass) ? ht / hs : 1;
      const ds = linked.filter(([s, t]) => frameOfS(s) === fs && frameOfT(t) === ft).map(([s, t]) => {
        const a = ownCenter(s), b = ownCenter(t);
        return [b[0] - k * a[0], b[1] - k * a[1]] as Vec;
      });
      const [bx, by] = ds.length ? median(ds) : V.sub(ft.center(), V.mul(fs.center(), k));
      carry.set(fs, { k, bx, by });
    }

    // Endpoints. Copies only of single parts and frames, never of subtrees.
    const fadesOut = this.removed.map((s): FadeRow => {
      const c = ownCenter(s), { k, bx, by } = carry.get(frameOfS(s)) ?? IDENTITY;
      return { sub: s, pts: s.pointArrays().map((a) => a.slice()), opacity: s.style.opacity, tx: k * c[0] + bx, ty: k * c[1] + by };
    });
    const moves = linked.map(([s, t]): MoveRow => {
      const end = bare(t);
      s[alignData](end);
      return { sub: s, start: bare(s), end };
    });
    const frames: FrameRow[] = [];
    for (const [ft, fs] of toSource) {
      if (fs instanceof VMobjectClass || ft instanceof VMobjectClass) continue; // a path's points are a part's
      const targetFrame = ft[matchingFrameFor](fs);
      const from = fs.pointArrays(), to = targetFrame.pointArrays();
      if (fs.pointKind() !== targetFrame.pointKind()) {
        // A metadata-only source may explicitly normalize another frame kind.
        // Native geometry never treats an unrelated equal-length array as a box.
        if (!fs.boundingPointArrays().length && from.length)
          frames.push({ node: fs, from: [], to: [], start: bare(fs), end: bare(targetFrame) });
        continue;
      }
      if (from.length === to.length && from.every((a, i) => a.length === to[i]!.length)) {
        frames.push({ node: fs, from: from.map((a) => a.slice()), to: to.map((a) => a.slice()) });
      }
    }
    // A target frame no source frame took (a new line) gets a bare copy of
    // itself in the source, where its new parts grow in place
    for (const ft of tFrames) {
      if (toSource.has(ft)) continue;
      const stage = bare(ft);
      toSource.get(frameOfT(ft))!.add(stage);
      toSource.set(ft, stage);
    }
    const fadesIn = this.added.map((t): FadeRow => {
      const sub = bare(t), home = toSource.get(frameOfT(t))!, c = ownCenter(t), { k, bx, by } = carry.get(home) ?? IDENTITY;
      home.add(sub);
      return { sub, pts: t.pointArrays().map((a) => a.slice()), opacity: t.style.opacity, tx: (c[0] - bx) / k, ty: (c[1] - by) / k };
    });
    this[matchRows] = { moves, fadesOut, fadesIn, frames, touched: src.family() };
    this.doInterpolate(0);
  }

  protected override doInterpolate(alpha: number): void {
    const { moves, fadesOut, fadesIn, frames, touched } = this[matchRows], lag = this.lagRatio;
    const n = moves.length + fadesOut.length + fadesIn.length;
    let i = 0;
    for (const { sub, start, end } of moves) sub.interpolate(start, end, staggered(lag, alpha, i++, n));
    // Staged: what leaves is gone by halfway, and what comes starts there.
    const out = this.staged ? (a: number) => Math.min(1, 2 * a) : (a: number) => a,
      into = this.staged ? (a: number) => Math.max(0, 2 * a - 1) : (a: number) => a;
    for (const r of fadesOut) fade(r, 1 - out(staggered(lag, alpha, i++, n)), alpha, true);
    for (const r of fadesIn) fade(r, into(staggered(lag, alpha, i++, n)), alpha, false);
    for (const { node, from, to, start, end } of frames) {
      if (start && end) { node[interpolateData](start, end, alpha); continue; }
      const mine = node.pointArrays();
      for (let j = 0; j < mine.length; j++) {
        const m = mine[j]!, x = from[j]!, y = to[j]!;
        if (alpha >= 1) m.set(y);
        else if (alpha <= 0) m.set(x);
        else for (let q = 0; q < m.length; q++) m[q] = x[q]! + (y[q]! - x[q]!) * alpha;
      }
      node.touchPoints();
    }
    for (const m of touched) dropBox(m);
    this.mobject.invalidateBox();
  }

  /** @internal */
  override [cleanUp](scene: Scene): void {
    super[cleanUp](scene);
    if (this.replace) scene.replace(this.mobject, this.target);
  }
}

/** Parts that look the same regardless of position and size pair up: VMobject.shapeKey(). */
export class TransformMatchingShapes extends TransformMatching {
  constructor(mobject: Mobject, target: Mobject, opts: MatchingOptions = {}) { super(mobject, target, { ...opts, key: shapeKeyOf }); }
}

/**
 * Glyphs pair with glyphs of the same character in the same font and weight,
 * in reading order first, so 'cache' -> 'cached' keeps its five letters and
 * grows a d, and an inserted line of code leaves the others in place. Works
 * on Text, Code and groups of them; any other part matches by shape. A glyph
 * that fades stays inside its line (fadeInsideLines), so a line's extent
 * never jumps.
 *
 * Cost: one scan of both texts per matching run found (longestRuns), so one
 * edit is cheap but scattered edits over many lines cost seconds at begin();
 * for code, prefer TransformDiff.
 */
export class TransformMatchingText extends TransformMatching {
  constructor(mobject: Mobject, target: Mobject, opts: MatchingOptions = {}) { super(mobject, target, { ordered: true, ...opts, key: textKeyOf }); }

  protected override doBegin(): void {
    const plain = this.key;
    const texts = [...this.mobject.family(), ...this.target.family()].filter(m => 'text' in m && m.children.length > 0);
    if (texts.length && texts.every(m => m instanceof Text && matchesClusters(m)))
      this.key = (part, root) => {
        const cluster = (part as Mobject & {cluster?: number}).cluster, parent = part.parent;
        return cluster == null || !(parent instanceof Text) ? plain(part, root) : clusterKeyOf(parent, cluster) ?? plain(part, root);
      };
    try { super.doBegin(); } finally { this.key = plain; }
    fadeInsideLines(this, true);
    this.doInterpolate(0);
  }
}

/**
 * Keep a line's fading glyphs inside the line. A removed glyph shrinks to where
 * its line carries it, which can be past the end of the line it becomes (`c a`
 * -> `c`), and an added one grows from where the line was, which can be past
 * the old line's end; invisible, but a Text is one unit to the motion verifier
 * (MotionSink), so its extent would jump when the scene swaps in the target.
 * Each fade's point is clamped into its line's x extent instead: a removed
 * glyph's into the line it becomes (the frame's end), an added glyph's into the
 * line it joins (the frame's start). With `ride`, each such fade also rides
 * with its line (FadeRow), so a lagged one waits inside the line as it moves.
 * Parts not in a Text line are untouched. Runs as it begins, after the rows are fixed; the caller
 * draws frame 0 again.
 */
function fadeInsideLines(t: TransformMatching, ride: boolean): void {
  const { frames, fadesIn, fadesOut } = t[matchRows];
  const edges = new Map(frames.map((f) => [f.node, f]));
  // A Text's advance box is a point array (four corners since the reader pass; two before):
  // clamp to its x extent whatever its length, or the growing glyphs start outside the line
  const inside = (r: FadeRow, box: Float32Array | undefined) => {
    if (!box || box.length < 4) return;
    let x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < box.length; i += 2) { x0 = Math.min(x0, box[i]!); x1 = Math.max(x1, box[i]!); }
    r.tx = Math.min(Math.max(r.tx, x0), x1);
    if (ride) { const b = pointsBox(r.pts); if (b) r.ride = center(b); }
  };
  for (const r of fadesIn) inside(r, edges.get(r.sub.parent!)?.from[0]);
  for (const r of fadesOut) inside(r, edges.get(frameOf(r.sub, t.mobject))?.to[0]);
}

const IDENTITY: Carry = { k: 1, bx: 0, by: 0 };

const shapeKeyOf: MatchKey = (p) => (p instanceof VMobjectClass ? p.shapeKey() : undefined);

// A glyph's cluster is the UTF-16 index in its Text's source string where its character starts
const textKeyOf: MatchKey = (p, root) => {
  const t = p.parent, cluster = (p as { cluster?: number }).cluster;
  if (t instanceof Text && cluster != null) {
    const cp = t.text.codePointAt(cluster);
    return `${t.font} ${t.weight} ${cp === undefined ? '' : String.fromCodePoint(cp)}`;
  }
  const k = shapeKeyOf(p, root);
  return k === undefined ? undefined : 'shape ' + k;
};

/** The drawable parts of a mobject, depth first: visible VMobjects with points. */
function partsOf(root: Mobject): Mobject[] {
  return root.family().filter((m) => m instanceof VMobjectClass && m.style.opacity > 0 && m.hasPoints());
}

/** The root, and every container below it with points of its own. */
function framesOf(root: Mobject): Mobject[] {
  return root.family().filter((m) => m === root || (!(m instanceof VMobjectClass) && m.pointArrays().length > 0));
}

/** The nearest frame strictly above `m`, or the root. */
function frameOf(m: Mobject, root: Mobject): Mobject {
  let p = m === root ? null : m.parent;
  while (p && p !== root && (p instanceof VMobjectClass || p.pointArrays().length === 0)) p = p.parent;
  return p ?? root;
}

/** A copy of `m` without its children: matching moves parts one by one. */
function bare<M extends Mobject>(m: M): M { return copyAlone(m); }

/** Box of a mobject's own points (not its children's), or null. */
function ownBox(m: Mobject): Box | null { return pointsBox(m.boundingPointArrays()); }
function ownCenter(m: Mobject): Vec { const b = ownBox(m); return b ? center(b) : [0, 0]; }
function ownHeight(m: Mobject): number { const b = ownBox(m); return b ? b[3] - b[1] : 0; }

/** Per-coordinate median: robust to the few parts that pair across lines. */
function median(ds: Vec[]): Vec {
  const mid = (xs: number[]) => { xs.sort((a, b) => a - b); const h = xs.length >> 1; return xs.length % 2 ? xs[h]! : (xs[h - 1]! + xs[h]!) / 2; };
  return [mid(ds.map((d) => d[0])), mid(ds.map((d) => d[1]))];
}

/**
 * Pair parts with equal keys; returns each source part's target index, or -1.
 * With `ordered`, runs of consecutive equal keys (at least two) pair first,
 * longest first, nearest first among equally long ones, as manim's
 * TransformMatchingStrings pairs longest matching substrings; `scopes` then
 * sees those pairs and confines the rest to equal scopes (-1: none). Every
 * key's remaining parts pair so the total squared distance travelled is least:
 * a group that moves as a whole keeps its order, which nearest-first greedy
 * pairing does not. Deterministic: ties go to the earlier part.
 */
function matchParts(src: Mobject[], tgt: Mobject[], roots: [Mobject, Mobject], key: MatchKey, ordered: boolean, scopes: (runs: Int32Array) => [Int32Array, Int32Array]): Int32Array {
  // Keys as small integers, -1 for "never matches"
  const ids = new Map<string, number>();
  const idOf = (p: Mobject, root: Mobject) => { const k = key(p, root); if (k === undefined) return -1; let i = ids.get(k); if (i === undefined) ids.set(k, (i = ids.size)); return i; };
  const ks = src.map((p) => idOf(p, roots[0])), kt = tgt.map((p) => idOf(p, roots[1]));
  const cs = src.map(ownCenter), ct = tgt.map(ownCenter);
  const dist2 = (i: number, j: number) => (cs[i]![0] - ct[j]![0]) ** 2 + (cs[i]![1] - ct[j]![1]) ** 2;
  const pairOf = new Int32Array(src.length).fill(-1), taken = new Uint8Array(tgt.length);
  let ss: Int32Array | null = null, st: Int32Array | null = null;
  if (ordered) { longestRuns(ks, kt, pairOf, taken, dist2); [ss, st] = scopes(pairOf); }
  // Remaining parts by key (and scope), in order of first appearance
  const left = new Map<number, [number[], number[]]>(), nk = ids.size;
  ks.forEach((k, i) => {
    if (k < 0 || pairOf[i] !== -1 || (ss && ss[i]! < 0)) return;
    const g = k + nk * (ss ? ss[i]! : 0), l = left.get(g);
    if (l) l[0].push(i); else left.set(g, [[i], []]);
  });
  kt.forEach((k, j) => { if (k >= 0 && !taken[j] && !(st && st[j]! < 0)) left.get(k + nk * (st ? st[j]! : 0))?.[1].push(j); });
  for (const [is, js] of left.values()) {
    if (!js.length) continue;
    // Rows must not outnumber columns: transpose when the source has more
    const flip = is.length > js.length, rows = flip ? js : is, cols = flip ? is : js;
    const cost = rows.map((r) => cols.map((c) => (flip ? dist2(c, r) : dist2(r, c))));
    assign(cost).forEach((c, r) => {
      const i = flip ? cols[c]! : rows[r]!, j = flip ? rows[r]! : cols[c]!;
      pairOf[i] = j; taken[j] = 1;
    });
  }
  return pairOf;
}

/**
 * Repeatedly pair the longest run of equal, unpaired keys (manim's SequenceMatcher loop).
 * Each run found costs one O(N·M) scan of both sides, so the whole is O(runs·N·M):
 * one edit in 80 lines of code takes about 90 ms, but scattered edits (a change
 * on every line) leave many short runs and cost seconds (1.2 s for 80 lines).
 * The scan order and tie-breaks decide the pairing, which traces record: keep them.
 */
function longestRuns(ks: number[], kt: number[], pairOf: Int32Array, taken: Uint8Array, dist2: (i: number, j: number) => number): void {
  const n = ks.length, m = kt.length;
  let prev = new Int32Array(m + 1), cur = new Int32Array(m + 1);
  for (;;) {
    // run[i][j]: length of the common run ending at source i - 1, target j - 1
    let best = 1, bi = 0, bj = 0, bd = Infinity;
    prev.fill(0);
    for (let i = 1; i <= n; i++) {
      const a = pairOf[i - 1] === -1 ? ks[i - 1]! : -1;
      for (let j = 1; j <= m; j++) {
        const l = a >= 0 && a === kt[j - 1] && !taken[j - 1] ? prev[j - 1]! + 1 : 0;
        cur[j] = l;
        if (l > best) { best = l; bi = i; bj = j; bd = dist2(i - 1, j - 1); }
        else if (l === best && l > 1) { const d = dist2(i - 1, j - 1); if (d < bd) { bi = i; bj = j; bd = d; } }
      }
      [prev, cur] = [cur, prev];
    }
    if (best < 2) return;
    for (let q = 1; q <= best; q++) { pairOf[bi - q] = bj - q; taken[bj - q] = 1; }
  }
}

/**
 * Rows to distinct columns (rows <= columns) at least total cost: the
 * Hungarian method with potentials, O(rows^2 * columns): 300 alike parts take
 * 20 ms at begin(), 600 take 100 ms. Strict comparisons keep it deterministic.
 */
function assign(cost: number[][]): number[] {
  const n = cost.length, m = cost[0]!.length;
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  const minv = new Float64Array(m + 1), used = new Uint8Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    minv.fill(Infinity); used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0]!, row = cost[i0 - 1]!;
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const c = row[j - 1]! - u[i0]! - v[j]!;
        if (c < minv[j]!) { minv[j] = c; way[j] = j0; }
        if (minv[j]! < delta) { delta = minv[j]!; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]!]! += delta; v[j]! -= delta; } else minv[j]! -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]!; p[j0] = p[j1]!; j0 = j1; } while (j0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) out[p[j]! - 1] = j - 1;
  return out;
}

/**
 * An unmatched part at `size` (0: the point (tx, ty), invisible; 1: as it was), written over its snapshot.
 * A riding row (see FadeRow) is placed by the whole animation's `alpha` too: `out` says whether it fades out.
 */
function fade(r: FadeRow, size: number, alpha: number, out: boolean): void {
  const mine = r.sub.pointArrays(), k = 1 - size;
  const c = r.ride;
  if (c) {
    // Where its center is now: on the way, with the line, from where it starts to where it ends
    const [x0, y0, x1, y1] = out ? [c[0], c[1], r.tx, r.ty] : [r.tx, r.ty, c[0], c[1]];
    const cx = alpha >= 1 ? x1 : alpha <= 0 ? x0 : x0 + (x1 - x0) * alpha, cy = alpha >= 1 ? y1 : alpha <= 0 ? y0 : y0 + (y1 - y0) * alpha;
    for (let j = 0; j < mine.length; j++) {
      const m = mine[j]!, x = r.pts[j]!;
      if (size >= 1 && cx === c[0] && cy === c[1]) { m.set(x); continue; }
      for (let q = 0; q < m.length; q += 2) { m[q] = (x[q]! - c[0]) * size + cx; m[q + 1] = (x[q + 1]! - c[1]) * size + cy; }
    }
    r.sub.style.opacity = size >= 1 ? r.opacity : r.opacity * Math.max(0, size);
    r.sub.touchPoints();
    return;
  }
  for (let j = 0; j < mine.length; j++) {
    const m = mine[j]!, x = r.pts[j]!;
    if (size >= 1) { m.set(x); continue; }
    // Scaling about its own center while that center slides to (tx, ty) is, folded, one multiply-add
    for (let q = 0; q < m.length; q += 2) { m[q] = x[q]! * size + k * r.tx; m[q + 1] = x[q + 1]! * size + k * r.ty; }
  }
  r.sub.style.opacity = size >= 1 ? r.opacity : r.opacity * Math.max(0, size);
  r.sub.touchPoints();
}

// ---- diff-driven transforms ----
// Imports for this block only, as in the matching block above.
import type { Code, CodeSpan } from './text.ts';
import { diffLines, diffTokens, hunkHeader } from './diff.ts';
import type { Hunk } from './diff.ts';

export interface TransformDiffOptions extends Omit<MatchingOptions, 'ordered'> {
  /**
   * The diff to animate, as unified-diff hunks (diffLines, or parseUnifiedDiff
   * of `git diff` output). They are the truth: the animation follows them even
   * where diffLines would differ, and begin() throws if they do not describe
   * the two texts. Default: diffLines of the two texts.
   */
  hunks?: readonly Hunk[];
}

/**
 * What a TransformDiff does with each line, by index: `same` lines (outside
 * the hunks, or context) move as wholes, `changed` pairs (a removed line and
 * the added line most like it, in one hunk) morph token by token, `removed`
 * lines fade out, `added` lines fade in.
 */
export interface LinePlan { same: Array<[number, number]>; changed: Array<[number, number]>; removed: number[]; added: number[] }

/**
 * A matching transform between two Code blocks whose pairing is the diff:
 *
 *   await this.play(new TransformDiff(before, after));
 *   await this.play(new TransformDiff(before, after, { hunks: parseUnifiedDiff(diffText) }));
 *
 * Every glyph of an unchanged line pairs with the same character of the line
 * the hunks say it became, so the line travels whole. In a hunk, a removed line
 * pairs with the added line most like it (by a token diff, in order) and their
 * shared tokens' glyphs pair character for character; every other glyph of
 * the hunk fades out or grows in. Nothing pairs across lines the diff does not
 * relate, so the picture cannot show a change the diff does not contain.
 *
 * A TransformMatching with the pairing as its key: `pairs`, `removed`,
 * `added`, `summary()` and replace work as there. In a scene, begin() records
 * `{ kind: 'diff', hunks, lines, ...summary() }` (see Scene.record).
 */
export class TransformDiff extends TransformMatching {
  readonly before: Code;
  readonly after: Code;
  /** The hunks given to the constructor, or null to compute them. */
  readonly #given: readonly Hunk[] | null;
  // Set by begin()
  /** The hunks animated: the ones given, or diffLines of the two texts. */
  hunks!: Hunk[];
  plan!: LinePlan;
  /** Each paired glyph's key; every other part has none, so it fades. */
  readonly keys: Map<Mobject, string>;

  constructor(before: Code, after: Code, { hunks, ...opts }: TransformDiffOptions = {}) {
    const keys = new Map<Mobject, string>();
    super(before, after, { ...opts, ordered: false, key: (p) => keys.get(p) });
    this.before = before; this.after = after;
    this.#given = hunks ?? null;
    this.keys = keys;
  }

  protected override doBegin(): void {
    const a = this.before.lines.map((t) => t.text), b = this.after.lines.map((t) => t.text);
    this.hunks = this.#given ? this.#given.map((h) => ({ ...h, ops: [...h.ops], lines: [...h.lines] })) : diffLines(a, b);
    this.plan = planLines(this.hunks, a, b);
    const keys = this.keys;
    keys.clear();
    // Glyph for glyph by source index: same text, same glyphs
    const pair = (x: CodeSpan, y: CodeSpan): void => {
      const at = new Map(y.children.map((g) => [clusterOf(g) - y.from, g]));
      for (const g of x.children) {
        const h = at.get(clusterOf(g) - x.from);
        if (h) { const k = `${keys.size}`; keys.set(g, k); keys.set(h, k); }
      }
    };
    for (const [i, j] of this.plan.same) pair(this.before.lineSpan(i), this.after.lineSpan(j));
    for (const [i, j] of this.plan.changed) {
      for (const t of diffTokens(a[i]!, b[j]!)) if (t.op === '=') pair(this.before.span(i, ...t.a), this.after.span(j, ...t.b));
    }
    super.doBegin();
    // A rewritten line that grows past its old ends (`return x` -> `const y = await x`)
    // would start its new glyphs, carried back with the line, beyond the old
    // line, and end its removed ones beyond the new: they start (and end) inside
    // the line instead, at its nearest edge, so the line grows and shrinks smoothly.
    fadeInsideLines(this, false);
    this.doInterpolate(0);
  }

  override evidence(): Evidence {
    const { same, changed, removed, added } = this.plan;
    return { kind: 'diff', hunks: this.hunks, lines: { unchanged: same.length, changed: changed.length, removed: removed.length, added: added.length }, ...this.summary() };
  }
}

/** Give every matching transform in `anims` (nested in groups too) the scene it records its pairing to. */

// A span's children are its line's glyphs, which carry their source index
const clusterOf = (g: Mobject): number => (g as { cluster?: number }).cluster ?? -1;

// A removed and an added line pair when their shared tokens are at least this
// share of both lines' non-space characters (difflib's ratio): a rewritten
// line morphs, an unrelated one fades out while the other grows in.
const PAIR_RATIO = 0.5;

/** Read hunks against the two texts: which lines stay, pair, go, come. Throws where they disagree. */
function planLines(hunks: readonly Hunk[], a: readonly string[], b: readonly string[]): LinePlan {
  const plan: LinePlan = { same: [], changed: [], removed: [], added: [] };
  const fail = (msg: string): never => { throw new Error(`new TransformDiff(): ${msg}; the hunks do not describe these two texts`); };
  const show = (side: string, k: number, text: string | undefined) => `${side} line ${k + 1} is ${text === undefined ? 'past the end' : JSON.stringify(text)}`;
  const same = (i: number, j: number, where: string): void => {
    if (a[i] === undefined || a[i] !== b[j]) fail(`${where}, ${show('before', i, a[i])} but ${show('after', j, b[j])}`);
    plan.same.push([i, j]);
  };
  let i = 0, j = 0;
  for (const h of hunks) {
    const name = `hunk ${hunkHeader(h)}`;
    const o0 = h.oldLines ? h.oldStart - 1 : h.oldStart, n0 = h.newLines ? h.newStart - 1 : h.newStart;
    if (o0 < i || n0 < j) fail(`${name} overlaps the one before it, or is out of order`);
    if (o0 - i !== n0 - j) fail(`${name} leaves ${o0 - i} unchanged lines before it in the old text and ${n0 - j} in the new`);
    const count = (...k: string[]) => h.ops.filter((op) => k.includes(op)).length;
    if (h.ops.length !== h.lines.length || count('-', '=') !== h.oldLines || count('+', '=') !== h.newLines) {
      fail(`${name} has ${count('-')} removed, ${count('+')} added and ${count('=')} context lines, which its header does not count`);
    }
    while (i < o0) same(i++, j++, `before ${name}`);
    const gone: number[] = [], come: number[] = [];
    h.ops.forEach((op, k) => {
      const text = h.lines[k];
      if (op === '=') { if (a[i] !== text) fail(`${name} has context ${JSON.stringify(text)}, but ${show('before', i, a[i])}`); same(i++, j++, `in ${name}`); }
      else if (op === '-') { if (a[i] !== text) fail(`${name} removes ${JSON.stringify(text)}, but ${show('before', i, a[i])}`); gone.push(i++); }
      else { if (b[j] !== text) fail(`${name} adds ${JSON.stringify(text)}, but ${show('after', j, b[j])}`); come.push(j++); }
    });
    pairLines(gone, come, a, b, plan);
  }
  if (a.length - i !== b.length - j) fail(`after the last hunk the old text has ${a.length - i} more lines and the new ${b.length - j}`);
  while (i < a.length) same(i++, j++, 'after the last hunk');
  return plan;
}

/**
 * Pair a hunk's removed lines with its added lines, in order, for the most
 * shared token characters in all (an LCS over lines, scored by token diffs);
 * a pair must reach PAIR_RATIO. The rest are removed or added.
 */
function pairLines(gone: number[], come: number[], a: readonly string[], b: readonly string[], plan: LinePlan): void {
  const n = gone.length, m = come.length, w = m + 1;
  const ink = (s: string) => s.replace(/\s+/g, '').length;
  const score = (x: string, y: string): number => {
    let shared = 0;
    for (const t of diffTokens(x, y)) if (t.op === '=') shared += ink(t.text);
    return shared > 0 && 2 * shared >= PAIR_RATIO * (ink(x) + ink(y)) ? shared : 0;
  };
  const s = gone.map((i) => come.map((j) => score(a[i]!, b[j]!)));
  // best[p * w + q]: the most shared characters pairing gone[p..] with come[q..]
  const best = new Float64Array((n + 1) * w);
  for (let p = n - 1; p >= 0; p--) {
    for (let q = m - 1; q >= 0; q--) {
      const both = s[p]![q]! ? s[p]![q]! + best[(p + 1) * w + q + 1]! : 0;
      best[p * w + q] = Math.max(both, best[(p + 1) * w + q]!, best[p * w + q + 1]!);
    }
  }
  const gonePaired = new Uint8Array(n), comePaired = new Uint8Array(m);
  for (let p = 0, q = 0; p < n && q < m;) {
    // Ties pair first, then pass the removed line, then the added one: deterministic
    if (s[p]![q]! && s[p]![q]! + best[(p + 1) * w + q + 1]! === best[p * w + q]) {
      plan.changed.push([gone[p]!, come[q]!]); gonePaired[p] = 1; comePaired[q] = 1; p++; q++;
    } else if (best[(p + 1) * w + q] === best[p * w + q]) p++;
    else q++;
  }
  plan.removed.push(...gone.filter((_, p) => !gonePaired[p]));
  plan.added.push(...come.filter((_, q) => !comePaired[q]));
}
