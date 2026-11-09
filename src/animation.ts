// Animations are pure functions of alpha over two fixed endpoints.
// begin() settles the endpoints (and aligns their structure); every frame
// is then `mobject = blend(start, end, rateFunc(t / runTime))`.

import { smooth, linear, clip } from './rate.ts';
import type { RateFunc } from './rate.ts';
import type { Mobject, AnimateBuilderBase } from './mobject.ts';
import { Group, adoptState, followScene, mobjectName, withArticle } from './mobject.ts';
import type { VMobject } from './vmobject.ts';
import type { Scene } from './scene.ts';
import * as V from './vec.ts';
import type { Vec } from './vec.ts';
import type { Box } from './mobject.ts';
import { center, pointsBox } from './box.ts';
import { Circle, SurroundingRectangle, boxOf } from './shapes.ts';
import { NEUTRAL_COLORS } from './color.ts';

export interface AnimOptions {
  runTime?: number;
  rateFunc?: RateFunc;
  /** 0: children move together; 1: one after another. */
  lagRatio?: number;
  /** Remove the mobject from the scene when the animation ends. */
  remover?: boolean;
}

/** What play() accepts besides animations: a trailing options object. */
export type PlayOptions = Pick<AnimOptions, 'runTime' | 'rateFunc' | 'lagRatio'>;

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
 * @internal Refuse a time that is not a finite number from 0 to `max`: NaN plays no frames and lands
 * silently, Infinity never ends.
 */
export function assertTime(api: string, what: string, value: unknown, max = Infinity): void {
  if (typeof value !== 'number') throw new TypeError(`${api}: ${what} is ${typeof value}; give a finite number from 0${max === Infinity ? '' : ` to ${max}`}`);
  if (!Number.isFinite(value) || value < 0 || value > max)
    throw new RangeError(`${api}: ${what} is ${String(value)}; give a finite number from 0${max === Infinity ? '' : ` to ${max}`}`);
}

/**
 * Where an animation is in its life: `idle` until it begins, `begun` while it plays, `landing` once
 * its play has finished it while members of it still begin and finish in turn (a `Succession` held
 * by a member that waits, or a group holding one), and `finished` once it has landed, every member
 * with it. It interpolates and finishes only while begun, and begins only when idle or finished; a
 * finished animation may begin again (play it once more).
 */
export type AnimationPhase = 'idle' | 'begun' | 'landing' | 'finished';

/** The calls that keep an animation's phase, and the hooks a subclass overrides for each. */
const LIFECYCLE = { begin: 'doBegin', interpolate: 'doInterpolate', finish: 'doFinish', land: 'doLand' } as const;
/** The accessors that keep an animation's phase and times checked: an own property or an override would skip the check. */
const CHECKED = ['phase', 'runTime', 'lagRatio'] as const;
/** Animation classes already checked for an override of a lifecycle call (see AnimationTiming's constructor). */
const checkedClasses = new WeakSet<Function>();

/** The engine's own answers to waiting(): any other would hold a play, or let it run on, by its own rule. */
let engineWaits: Set<unknown> | null = null;
const engineWaiting = (): Set<unknown> =>
  (engineWaits ??= new Set([AnimationTiming.prototype.waiting, AnimationGroup.prototype.waiting, Succession.prototype.waiting, MadeAtTurn.prototype.waiting]));

/** The property `name` resolves to on `o`: its own, or the nearest prototype's. */
function resolved(o: object, name: string): PropertyDescriptor | undefined {
  for (let p: object | null = o; p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d) return d;
  }
  return undefined;
}

/**
 * @internal Refuse an animation whose lifecycle calls (`begin`, `interpolate`, `finish`, `land`) or
 * checked accessors (`phase`, `runTime`, `lagRatio`) are not the engine's: defined on the instance (a
 * class field, an assignment, `Object.defineProperty`) or on a prototype (an override, a patch made
 * after the class's first instance, a swapped prototype). Each would skip the phase or the time the
 * engine keeps. `waiting` may be only the engine's own: the default's, or a group's, a
 * Succession's or a MadeAtTurn's.
 * Called where every play and every group member passes before it begins: `begin()` itself,
 * `Scene.beginAnimations` (which reaches an animation whose own `begin` was replaced), a group's
 * begin for its members and a Succession's for each member at its turn.
 */
export function assertLifecycle(a: object, api: string): void {
  const base = AnimationTiming.prototype;
  for (const [call, hook] of Object.entries(LIFECYCLE))
    if ((a as Record<string, unknown>)[call] !== (base as unknown as Record<string, unknown>)[call])
      throw new TypeError(`${api}: ${animationName(a)} replaces ${call}(), which keeps the animation's phase; override ${hook}() instead`);
  if (!engineWaiting().has((a as { waiting?: unknown }).waiting))
    throw new TypeError(`${api}: ${animationName(a)} replaces waiting(), which tells a play and a Succession whether to wait for it; only the engine's groups answer it, so leave it to them`);
  for (const name of CHECKED) {
    const d = resolved(a, name), own = resolved(base, name)!;
    if (d?.get !== own.get || d?.set !== own.set)
      throw new TypeError(`${api}: ${animationName(a)} redefines ${name}, which the engine keeps checked; ${name === 'phase' ? 'begin(), interpolate() and finish() set it' : `set it through its accessor, or pass it as an option`}`);
  }
}

/**
 * Shared scheduling contract for a drawable animation or a group of animations.
 *
 * `begin()`, `interpolate()` and `finish()` keep the phase (see AnimationPhase), and each calls
 * its protected hook, `doBegin()`, `doInterpolate()` and `doFinish()`, which a subclass
 * overrides. Every caller, the scene, a group or another animation, goes through the guarded
 * call; a subclass's `super.doBegin()` does not. An animation that replaces a guarded call, or
 * redefines `phase`, `runTime` or `lagRatio`, is refused as it begins (see assertLifecycle); a
 * subclass that overrides a guarded call as a method is refused when its first instance is made.
 * The landing after a failure, `land()`, is guarded the same way, and `waiting()` may be only the
 * engine's own. The hooks are protected in TypeScript only: plain JavaScript (or a cast) that calls
 * one directly skips the guard, and a lifecycle call patched in while the animation plays is not seen.
 */
abstract class AnimationTiming {
  #runTime!: number;
  #lagRatio!: number;
  rateFunc: RateFunc;
  remover: boolean;
  /**
   * Where it is in its life (see AnimationPhase): set by begin() and finish(), and `landing` while,
   * finished by its play, it still waits for members to finish in turn (see waiting).
   */
  get phase(): AnimationPhase { return this.#phase === 'finished' && this.waiting() ? 'landing' : this.#phase; }
  /** What begin(), finish() and land() set: whether it is landing is read from its members. */
  #phase: 'idle' | 'begun' | 'finished' = 'idle';
  constructor({runTime = 1, rateFunc = smooth, lagRatio = 0, remover = false}: AnimOptions = {}) {
    const api = `new ${new.target.name}()`;
    if (!checkedClasses.has(new.target)) {
      for (let p = new.target.prototype; p !== AnimationTiming.prototype; p = Object.getPrototypeOf(p))
        for (const [call, hook] of Object.entries(LIFECYCLE))
          if (Object.hasOwn(p, call)) throw new TypeError(`${api}: it overrides ${call}(), which keeps the animation's phase; override ${hook}() instead`);
      checkedClasses.add(new.target);
    }
    assertTime(api, 'its runTime', runTime);
    assertTime(api, 'its lagRatio', lagRatio);
    this.#runTime = runTime; this.#lagRatio = lagRatio; this.rateFunc = rateFunc; this.remover = remover;
  }
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
    this.refuseLagRatio(value);
    this.#lagRatio = value;
  }
  /** Refuse a lagRatio this kind of animation cannot take (a Succession's is always 1); any by default. */
  protected refuseLagRatio(_value: number): void {}
  /** @internal */ setOptions({ runTime, rateFunc, lagRatio }: PlayOptions = {}): this {
    if (runTime != null) { this.#refuseWhileBegun('this.play()', 'runTime'); assertTime('this.play()', 'its runTime', runTime); this.#runTime = runTime; }
    if (rateFunc != null) this.rateFunc = rateFunc;
    if (lagRatio != null) { this.#refuseWhileBegun('this.play()', 'lagRatio'); assertTime('this.play()', 'its lagRatio', lagRatio); this.#lagRatio = lagRatio; }
    return this;
  }

  /** A play fixes its frames from the times it begins with, so neither may change while it plays. */
  #refuseWhileBegun(api: string, what: 'runTime' | 'lagRatio'): void {
    if (this.#phase === 'begun' || this.phase === 'landing') throw new Error(`${api}: ${animationName(this)} is playing, and its play fixed its frames from its ${what}; change it before it begins, or after it finishes`);
  }

  /** Begin: fix the endpoints (see doBegin). Refused while begun; a doBegin() that throws leaves the phase as it was. */
  begin(): void {
    assertLifecycle(this, 'animation.begin()');
    const phase = this.phase;
    if (phase === 'begun' || phase === 'landing')
      throw new Error(`animation.begin(): ${animationName(this)} has already begun${phase === 'landing' ? ', and its members still finish in turn' : ''}; an animation plays in one place at a time, so make another for the second`);
    const was = this.#phase;
    this.#phase = 'begun';
    try { this.doBegin(); } catch (e) { this.#phase = was; throw e; }
  }
  /** Draw the frame at `alpha`, already passed through rateFunc by the caller (see doInterpolate). Only while begun. */
  interpolate(alpha: number): void {
    if (this.#phase !== 'begun') throw new Error(`animation.interpolate(): ${animationName(this)} ${this.#phase === 'idle' ? 'has not begun' : 'has finished'}; begin() it first`);
    this.doInterpolate(alpha);
  }
  /** Land, at rateFunc(1) unless given another alpha (see doFinish). Only while begun; then finished. */
  finish(alpha?: number): void {
    if (this.#phase !== 'begun') throw new Error(`animation.finish(): ${animationName(this)} ${this.#phase === 'idle' ? 'has not begun' : 'has already finished'}; begin() it first`);
    this.doFinish(alpha);
    this.#phase = 'finished';
  }

  /**
   * @internal Land after its play failed (see landBegun): it ends finished, whatever its landing
   * throws, which is dropped (the failure's own error is the one to report). What it has begun
   * lands as the end of its play would land it; what it has not begun yet never begins (see doLand).
   */
  land(scene: Scene | null): void {
    const phase = this.phase;
    if (phase !== 'begun' && phase !== 'landing') return;
    try { this.doLand(scene); }
    catch { /* the failure's error is reported instead */ }
    finally { this.#phase = 'finished'; }
  }
  /**
   * @internal How it lands after a failure (see land): finished and cleaned up from `scene`, as the
   * end of its play would. A group lands only the members that have begun, so a Succession's later
   * members, an action's later beats and their side effects never happen. A group may come here
   * landing, finished while its members still finish in turn: it lands them.
   */
  protected doLand(scene: Scene | null): void {
    if (this.#phase !== 'begun') return;
    this.doFinish();
    if (scene) this.cleanUpFromScene(scene);
  }
  /**
   * @internal Whether, begun in a play, it still waits for something it made or began at its turn to
   * begin (see Scene.whenReady), or, finished, for its members to finish in turn (then its phase is
   * `landing`): a Succession that holds it waits for it before its next member. Nothing does, by
   * default; only the engine's groups answer otherwise, and any other answer is refused as the
   * animation begins (see assertLifecycle).
   */
  waiting(): boolean { return false; }

  /** Called by begin(): fix the endpoints. Copies live here, never in the constructor. */
  protected abstract doBegin(): void;
  /** Called by interpolate() with alpha already passed through rateFunc: a pure function of alpha over the endpoints. */
  protected abstract doInterpolate(alpha: number): void;
  /** Called by finish(): land where the last frame drew, at `alpha` (rateFunc(1) when not given). */
  protected abstract doFinish(alpha?: number): void;
  /** @internal Remove what the animation took off the stage, after it finished. */
  abstract cleanUpFromScene(scene: Scene): void;
  /** The mobjects this animation writes: what play() admits to the scene and allows one writer each. */
  abstract targets(): Mobject[];
  /**
   * What this animation decided when it began, for the step's trace: read once, right
   * after begin(), and recorded with Scene.record. null (the default) records nothing.
   * Matching transforms report what they paired, TransformDiff the hunks it animated,
   * a sampled animation the interval it sampled.
   */
  evidence(): Evidence | null { return null; }
  /**
   * What must settle before this animation can begin, or null (the default). play() waits for
   * every one among its animations, a group's members included, before it begins any of them:
   * rayner/explain's `s.show` and `d.morph` read a diagram's layout first.
   */
  /** @internal */ ready(): Promise<unknown> | null { return null; }
  /**
   * @internal Fix the run time, once what it reads is ready (see ready()) and before it begins:
   * play() settles its animations, and a group its members, then lays out their times. Nothing
   * to do for an animation whose run time is known when it is made.
   */
  settle(): void {}
}

/**
 * Record what an animation decided as it began. Called by whoever began it: play() for
 * the animations it is given and a Succession's members, a group for its own members.
 * A group records nothing itself; its members do, in the order they begin. Read now, it is
 * recorded in turn order (see Scene.inTurn): after what waits before it in the frame.
 */
export function recordEvidence(a: ScheduledAnimation, scene: Scene | null): void {
  if (!scene || a instanceof AnimationGroup) return;
  const e = a.evidence();
  if (!e) return;
  const { kind, ...data } = e;
  scene.inTurn(() => scene.record(kind, data));
}
export type ScheduledAnimation = Animation | AnimationGroup;

/**
 * @internal Land the animations a failure left begun, last begun first: each ends finished, so none
 * is left begun and each may begin again; what had begun lands as the end of its play would land
 * it, and what had not begun never begins (see AnimationTiming.land). A group whose member throws
 * as it begins lands the members before it; a play that fails, as it begins or after, lands every
 * animation it was given.
 */
export function landBegun(begun: readonly ScheduledAnimation[], scene: Scene | null): void {
  for (const a of [...begun].reverse()) a.land(scene);
}

export class Animation extends AnimationTiming {
  mobject: Mobject;
  /** @internal */ starting!: Mobject;
  /** @internal */ families!: FamilyRow[];
  /** @internal */ slots!: { index: Int32Array; count: number };
  constructor(mobject: Mobject, opts: AnimOptions = {}) { super(opts); this.mobject = mobject; }
  override targets(): Mobject[] { return [this.mobject]; }
  /**
   * What takes the scene's colours before this begins (see Mobject.defaultColors): what it draws,
   * and what it morphs toward, so both endpoints are fixed in the scene's colours.
   * @internal
   */
  paints(): Mobject[] { return this.targets(); }
  /** Called when play starts. Copies live here, never in the constructor. */
  protected override doBegin(): void {
    this.starting = this.createStartingMobject();
    this.families = this.zipFamilies();
    this.slots = lagSlots(this.families);
    this.interpolate(0);
  }

  protected createStartingMobject(): Mobject { return this.mobject.copy(); }

  /** The mobjects whose families are zipped as arguments to interpolateSubmobject. @internal */
  allMobjects(): Mobject[] { return [this.mobject, this.starting]; }

  /** @internal */ zipFamilies(): FamilyRow[] {
    const fams = this.allMobjects().map((m) => m.family());
    // Aligned families: every one is as long as the first
    return fams[0]!.map((_, i) => fams.map((f) => f[i]!));
  }

  /**
   * Lands on rateFunc(1): for a there-and-back rate function that is the start.
   * A group passes the alpha its own timeline lands each member on instead.
   */
  protected override doFinish(alpha: number = this.rateFunc(1)): void { this.interpolate(alpha); }

  /** @internal */
  override cleanUpFromScene(scene: Scene): void { if (this.remover) scene.remove(this.mobject); }

  /** alpha already passed through rateFunc by the scene. */
  protected override doInterpolate(alpha: number): void {
    const n = this.families.length, { index, count } = this.slots;
    for (let i = 0; i < n; i++) {
      const slot = index[i]!;
      this.interpolateSubmobject(...this.families[i]!, slot < 0 ? alpha : this.subAlpha(alpha, slot, count));
    }
    this.mobject.invalidateBox();
  }

  /** Stagger alpha across submobjects by lagRatio (manim's get_sub_alpha). @internal */
  subAlpha(alpha: number, index: number, count: number): number {
    const lag = this.lagRatio;
    if (lag === 0) return alpha;
    // Every member is done at the end: (count - 1) * lag + 1 - index * lag is not always 1 in floating point
    if (alpha >= 1) return 1;
    const fullLength = (count - 1) * lag + 1;
    const value = alpha * fullLength;
    const lower = index * lag;
    return clip(value - lower, 0, 1);
  }

  /**
   * One family row at `alpha`: called as (sub, start, alpha), or
   * (sub, start, target, alpha) for a Transform; see allMobjects().
   */
  protected interpolateSubmobject(..._row: [...FamilyRow, number]): void {}
}

/** A path's structure: its subpaths and their closed flags. */
interface PathShape { subpaths: Float32Array[]; closed: boolean[] }

export interface TransformOptions extends AnimOptions {
  replace?: boolean;
}

/** Blend `mobject` into `target`. With replace=true, the scene keeps `target` afterwards. */
export class Transform extends Animation {
  target: Mobject;
  readonly replace: boolean;
  /** The target was built for this animation alone, so begin() may use it without copying. @internal */
  ownsTarget: boolean;
  /** The target is a copy of the mobject: same structure, no alignment needed. @internal */
  sameStructure: boolean;
  /** Set by begin(). @internal */
  targetCopy!: Mobject;
  /** Path structure of the mobject and target families before alignment, restored on landing. */
  private shapes: WeakMap<Mobject, PathShape> | null = null;

  constructor(mobject: Mobject, target: Mobject, { replace = false, ...opts }: TransformOptions = {}) {
    super(mobject, opts);
    this.target = target;
    this.replace = replace;
    this.ownsTarget = false;
    this.sameStructure = false;
  }

  /** @internal */ override paints(): Mobject[] { return [this.mobject, this.target]; }

  protected override doBegin(): void {
    // An animation that built its own target (FadeIn, .animate) hands it
    // over as is: nothing else holds it, so copying it again is pure cost. And a
    // target that is a copy of the mobject needs no alignment: same structure.
    this.targetCopy = this.ownsTarget ? this.target : this.target.copy();
    this.shapes = null;
    if (!this.sameStructure) {
      // Families first, so the shapes recorded include any path alignFamily moved into a child of its own
      this.mobject.alignFamily(this.targetCopy);
      this.shapes = new WeakMap();
      const from = this.mobject.family(), to = this.targetCopy.family();
      for (const m of [...from, ...to]) {
        const p = m as Partial<Pick<VMobject, 'subpaths' | 'closed'>>;
        if (p.subpaths && p.closed) this.shapes.set(m, { subpaths: p.subpaths.map((a) => a.slice()), closed: p.closed.slice() });
      }
      for (let i = 0; i < from.length; i++) from[i]!.alignData(to[i]!);
    }
    super.doBegin();
  }

  /**
   * Alignment pads paths with point-sized subpaths and extra curves so both ends
   * interpolate. Landing exactly on an end gives each path that end's own
   * structure back: the same geometry, with no zero-length subpaths left over
   * (a stroked one draws a dot with round caps).
   */
  protected override doFinish(alpha?: number): void {
    const a = alpha ?? this.rateFunc(1);
    super.doFinish(a);
    const shapes = this.shapes;
    if (!shapes || (a !== 1 && a !== 0)) return;
    const unrestored: FamilyRow[] = [];
    for (const row of this.families) {
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
      // curve tighter), so land the row again on the restored target.
      this.interpolateSubmobject(sub!, start!, target!, 1);
    }
    this.mobject.invalidateBox();
  }

  /** @internal */ override allMobjects(): Mobject[] { return [this.mobject, this.starting, this.targetCopy]; }

  protected override interpolateSubmobject(sub: Mobject, start: Mobject, target: Mobject, alpha: number): void {
    sub.interpolate(start, target, alpha);
  }

  /** @internal */
  override cleanUpFromScene(scene: Scene): void {
    super.cleanUpFromScene(scene);
    if (this.replace) scene.replace(this.mobject, this.target);
  }
}

/** A Transform whose target is the result of recorded .animate calls. */
function fromAnimateBuilder(builder: AnimateBuilderBase, opts: TransformOptions = {}): Transform {
  const t = new Transform(builder.mobject, builder.buildTarget(), opts);
  t.ownsTarget = true; // the built target is this animation's alone; its structure may differ (setText), so it still aligns
  return t;
}

export interface FadeOptions extends TransformOptions { shift?: Vec | null; scale?: number }

export class FadeIn extends Transform {
  /** @internal */ shiftVec: Vec | null;
  /** @internal */ scaleFrom: number;
  /** @internal */ mobjectStart!: Mobject;

  constructor(mobject: Mobject, { shift = null, scale = 1, ...opts }: FadeOptions = {}) {
    super(mobject, mobject, opts);
    this.shiftVec = shift; this.scaleFrom = scale;
  }
  protected override doBegin(): void {
    // Start state: invisible, displaced; end state: the mobject as it is.
    this.target = this.mobject.copy(); this.ownsTarget = true; this.sameStructure = true;
    const start = this.mobject.copy();
    for (const m of start.family()) m.style.opacity = 0;
    if (this.shiftVec) start.shift(V.mul(this.shiftVec, -1));
    if (this.scaleFrom !== 1) start.scale(this.scaleFrom);
    this.mobjectStart = start;
    super.doBegin();
  }
  protected override createStartingMobject(): Mobject { return this.mobjectStart; }
}

export class FadeOut extends Transform {
  /** @internal */ shiftVec: Vec | null;
  /** @internal */ scaleTo: number;

  constructor(mobject: Mobject, { shift = null, scale = 1, ...opts }: FadeOptions = {}) {
    super(mobject, mobject, { remover: true, ...opts });
    this.shiftVec = shift; this.scaleTo = scale;
  }
  protected override doBegin(): void {
    const end = this.mobject.copy();
    for (const m of end.family()) m.style.opacity = 0;
    if (this.shiftVec) end.shift(this.shiftVec);
    if (this.scaleTo !== 1) end.scale(this.scaleTo);
    this.target = end; this.ownsTarget = true; this.sameStructure = true;
    super.doBegin();
  }
  protected override doFinish(alpha?: number): void {
    // Removed: restore so the mobject can be shown again later, where it was, at its size
    // and opacity (manim's FadeOut also interpolates back to 0 once removed). Kept on
    // screen (remover: false): land, and give back only the opacity, as before.
    if (this.remover) { super.doFinish(0); return; }
    super.doFinish(alpha);
    for (const [m, start] of this.families) m!.style.opacity = start!.style.opacity;
  }
}

export interface GrowFromEdgeOptions extends AnimOptions {
  /** Nonzero by default to keep the starting path nondegenerate; in [0, 1]. */
  initialScale?: number;
}

/** Fade in while expanding along one axis from a fixed cardinal edge. */
export class GrowFromEdge extends FadeIn {
  readonly edge: Vec;
  /** @internal */ readonly axis: 0 | 1;
  readonly initialScale: number;

  constructor(mobject: Mobject, edge: Readonly<Vec> = [0, -1], { initialScale = 0.001, ...opts }: GrowFromEdgeOptions = {}) {
    if (!Array.isArray(edge) || edge.length !== 2 || !Number.isFinite(edge[0]) || !Number.isFinite(edge[1]) ||
      Math.abs(edge[0]) + Math.abs(edge[1]) !== 1 || (edge[0] !== 0 && edge[1] !== 0))
      throw new TypeError('new GrowFromEdge(): the edge must be one unit step along an axis: [0, 1], [0, -1], [-1, 0] or [1, 0]');
    if (!Number.isFinite(initialScale) || initialScale < 0 || initialScale > 1)
      throw new RangeError('new GrowFromEdge(): initialScale must be a number from 0 to 1');
    super(mobject, opts);
    this.edge = [edge[0], edge[1]]; this.axis = edge[0] === 0 ? 1 : 0; this.initialScale = initialScale;
  }

  protected override createStartingMobject(): Mobject {
    return super.createStartingMobject().stretch(this.initialScale, this.axis, { aboutEdge: this.edge });
  }
}

/**
 * Draw a path in: the stroke traces along the path, then the fill fades in.
 * Fill-only shapes (glyphs, filled dots) have no stroke to trace, so they get
 * a temporary outline in the fill color, kept until the fill is complete and
 * removed at finish (manim's DrawBorderThenFill). Without it they stay invisible until the fill
 * pops in over a few frames.
 */
export class Create extends Animation {
  /** @internal */ borderWidth: number;
  /** The border was left to the default, so it follows the size of the text it outlines. */
  private autoBorder: boolean;

  constructor(mobject: Mobject, { borderWidth, ...opts }: AnimOptions & { borderWidth?: number } = {}) {
    super(mobject, { lagRatio: 0.2, ...opts });
    this.borderWidth = borderWidth ?? Create.BORDER;
    this.autoBorder = borderWidth == null;
  }
  /** The default border, sized for text at the default font size (0.4). @internal */
  static BORDER = 0.012;
  /** Per-row border widths, fixed at begin(): a glyph's border scales with its text's current size. */
  private borders = new Map<Mobject, number>();
  protected override doBegin(): void {
    this.borders.clear();
    super.doBegin();
  }
  private border(sub: Mobject): number {
    if (!this.autoBorder) return this.borderWidth;
    let w = this.borders.get(sub);
    if (w == null) {
      const size = (sub.parent as { textSize?: () => number } | null)?.textSize?.();
      // abs: a mirrored text reads back a negative size
      w = size != null && Number.isFinite(size) && size !== 0 ? this.borderWidth * Math.abs(size) / 0.4 : this.borderWidth;
      this.borders.set(sub, w);
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
      s.strokeWidth = this.border(sub);
      // Full strength until the end: fading it while the fill fades in leaves both near 50%
      // mid-crossover, a visible dip the motion verifier flags as a pop
      s.strokeOpacity = s0.fillOpacity;
    }
  }
  protected override doFinish(alpha?: number): void {
    super.doFinish(alpha);
    for (const [sub, start] of this.families as Array<[Mobject, Mobject]>) {
      delete sub.style.drawFraction;
      // Restore the temporary border to what the shape had
      sub.style.stroke = start.style.stroke;
      sub.style.strokeWidth = start.style.strokeWidth;
      sub.style.strokeOpacity = start.style.strokeOpacity;
    }
  }
}

/** Run several animations together; lagRatio staggers their start times. */
export class AnimationGroup extends AnimationTiming {
  /** @internal */ animations: ScheduledAnimation[];
  /** @internal */ timings!: Array<[start: number, end: number]>;
  /** @internal */ maxEnd!: number;

  constructor(animations: ScheduledAnimation[], { lagRatio = 0, rateFunc = linear, ...opts }: AnimOptions = {}) {
    super({ lagRatio, rateFunc, ...opts });
    this.animations = animations;
    this.layOut();
    this.ownRunTime = opts.runTime != null;
    if (!this.ownRunTime) this.runTime = this.maxEnd;
  }
  /** A run time was given (to the constructor or play()): re-staggering keeps it. */
  private ownRunTime!: boolean;
  /** Timings: each starts lagRatio * (previous run time) after the previous. */
  private layOut(): void {
    const animations = this.animations, lagRatio = this.lagRatio;
    let start = 0, end = 0;
    this.timings = animations.map((a, i) => {
      if (i > 0) start += lagRatio * animations[i - 1]!.runTime;
      end = Math.max(end, start + a.runTime);
      return [start, start + a.runTime];
    });
    this.maxEnd = end;
  }
  /**
   * Take `members` as its members, for a group that knows them only once its play begins (an action
   * decided then, what is made at its turn): laid out from their run times, as the constructor lays
   * them out, or at `slots`, each member's start and end in the group's time. A run time given to
   * the group, or to play(), is kept.
   */
  protected adopt(members: ScheduledAnimation[], slots?: Array<[start: number, end: number]>): void {
    this.animations = members;
    if (slots) {
      this.timings = slots;
      this.maxEnd = Math.max(0, ...slots.map(([, end]) => end));
    } else this.layOut();
    if (!this.ownRunTime) this.runTime = this.maxEnd;
  }
  /** A lagRatio given to play() re-staggers the members, as one given to the constructor does. @internal */
  override setOptions(opts: PlayOptions = {}): this {
    super.setOptions(opts);
    if (opts.runTime != null) this.ownRunTime = true;
    if (opts.lagRatio != null) {
      this.layOut();
      if (!this.ownRunTime) this.runTime = this.maxEnd;
    }
    return this;
  }
  /** The scene the play runs on, set by play() (see bindSuccessions): members record their evidence to it as they begin. */
  scene: Scene | null = null;
  /** @internal What every member waits for before it can begin: a play waits for all of it. */
  override ready(): Promise<unknown> | null {
    const waits = this.animations.map((a) => a.ready()).filter((r): r is Promise<unknown> => r !== null);
    return waits.length ? Promise.all(waits) : null;
  }
  /** @internal Settle the members, then lay out their times again: a member may know its run time only now. */
  override settle(): void {
    for (const a of this.animations) a.settle();
    this.layOut();
    if (!this.ownRunTime) this.runTime = this.maxEnd;
  }
  /** Members begin in order; when one throws, those already begun land (see landBegun), so each can begin again. */
  protected override doBegin(): void {
    const begun: ScheduledAnimation[] = [];
    try {
      for (const a of this.animations) {
        // Checked before its begin(), which a replaced begin would skip.
        assertLifecycle(a, 'animation.begin()');
        a.begin();
        begun.push(a);
        recordEvidence(a, this.scene);
      }
    } catch (e) { landBegun(begun, this.scene); throw e; }
  }
  /** Each member lands where the group's own timeline puts it at rateFunc(1) (a there-and-back group ends at the start). */
  protected override doFinish(alpha: number = this.rateFunc(1)): void {
    this.animations.forEach((a, i) => a.finish(a.rateFunc(this.memberTime(alpha, i))));
  }
  /** @internal */
  override cleanUpFromScene(scene: Scene): void { for (const a of this.animations) a.cleanUpFromScene(scene); }
  /** @internal After a failure, each member that has begun lands on its own, last first; nothing else begins. */
  protected override doLand(scene: Scene | null): void { landBegun(this.animations, scene); }
  /** @internal Whether a member still waits for something made at its turn to begin (see AnimationTiming.waiting). */
  override waiting(): boolean { return this.animations.some((a) => a.waiting()); }
  /** Member i's own time fraction at group alpha. */
  private memberTime(alpha: number, i: number): number {
    const [s, e] = this.timings[i]!, t = alpha * this.maxEnd;
    // A member with no run time happens all at once when the group reaches its start
    if (e - s <= 0) return t >= s ? 1 : 0;
    return clip((t - s) / (e - s), 0, 1);
  }
  /** Receives raw time fraction (scene applies this.rateFunc first). */
  protected override doInterpolate(alpha: number): void {
    this.animations.forEach((a, i) => a.interpolate(a.rateFunc(this.memberTime(alpha, i))));
  }
  /** A group has no mobject; nested groups contribute their leaf members. */
  get mobjects(): Mobject[] {
    return this.animations.flatMap((a) => a.targets()).filter(Boolean);
  }
  override targets(): Mobject[] { return this.mobjects; }
}

export class LaggedStart extends AnimationGroup {
  constructor(animations: ScheduledAnimation[], opts: AnimOptions = {}) { super(animations, { lagRatio: 0.2, ...opts }); }
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
export function prepareAnimation(x: unknown, api = 'this.play()'): ScheduledAnimation {
  if (isAnimateBuilder(x)) return fromAnimateBuilder(x);
  if (x instanceof AnimationTiming) return x as ScheduledAnimation;
  throw new TypeError(`${api}: it takes animations and mobject.animate builders; pass an Animation, an action, or m.animate`);
}

export interface MoveAlongPathOptions extends AnimOptions { fromCurrent?: boolean }

/**
 * Move a mobject's center along a path. If the mobject isn't at the path's
 * start (a token at a box's center riding an edge that starts at the box's
 * border), the offset is blended out over the move instead of snapping on the
 * first frame: position(α) = path(α) + (1 − α)·(start − path(0)).
 * Pass { fromCurrent: false } for manim's snap-to-path behavior.
 */
export class MoveAlongPath extends Animation {
  path: VMobject;
  readonly fromCurrent: boolean;
  /** @internal Set by begin(). */
  offset!: Vec;

  constructor(mobject: Mobject, path: VMobject, { fromCurrent = true, ...opts }: MoveAlongPathOptions = {}) {
    super(mobject, opts); this.path = path; this.fromCurrent = fromCurrent;
  }
  protected override doBegin(): void {
    const c = this.mobject.center(), p0 = this.path.pointFromProportion(0);
    this.offset = this.fromCurrent ? [c[0] - p0[0], c[1] - p0[1]] : [0, 0];
    super.doBegin();
  }
  protected override doInterpolate(alpha: number): void {
    const p = this.path.pointFromProportion(alpha);
    const k = 1 - alpha;
    // Pure in alpha: every frame is the starting copy translated, never the previous
    // frame moved again. Accumulated Float32 rounding would otherwise make a seeked
    // frame differ from the full run by an ulp, which a later alignment can amplify.
    const c = this.starting.center();
    const dx = p[0] + k * this.offset[0] - c[0], dy = p[1] + k * this.offset[1] - c[1];
    const fams = this.families;
    for (let i = 0; i < fams.length; i++) {
      const [sub, start] = fams[i] as [Mobject, Mobject];
      const mine = sub.pointArrays(), from = start.pointArrays();
      for (let j = 0; j < mine.length; j++) {
        const m = mine[j]!, x = from[j]!;
        for (let q = 0; q < m.length; q += 2) { m[q] = x[q]! + dx; m[q + 1] = x[q + 1]! + dy; }
      }
      sub.touchPoints(); sub._bbox = null;
    }
    this.mobject.invalidateBox();
  }
}

/** Travel along a fixed route while fading in and out; remove the token by default. */
export class PulseAlongPath extends MoveAlongPath {
  /** @internal */ readonly sourcePath: VMobject;

  constructor(mobject: Mobject, path: VMobject, opts: MoveAlongPathOptions = {}) {
    super(mobject, path, { rateFunc: linear, remover: true, ...opts });
    this.sourcePath = path;
  }

  protected override doBegin(): void {
    // The path, like the starting geometry, is fixed when the play begins.
    this.path = this.sourcePath.copy();
    super.doBegin();
  }

  protected override doInterpolate(alpha: number): void {
    super.doInterpolate(alpha);
    const opacity = Math.sin(Math.PI * alpha);
    for (const [sub, start] of this.families) sub!.style.opacity = start!.style.opacity * opacity;
  }

  /** @internal */
  override cleanUpFromScene(scene: Scene): void {
    super.cleanUpFromScene(scene);
    // A removed token can be used again without inheriting its invisible end.
    if (this.remover) for (const [sub, start] of this.families) sub!.style.opacity = start!.style.opacity;
  }
}

// ---- emphasis ----

export interface CircumscribeOptions extends AnimOptions {
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
  readonly fadeOut: boolean;
  /** The outline's opacity when the play began: what drawing in reaches. Set by begin(). @internal */
  baseOpacity!: number;

  constructor(target: Mobject | Box, { color, shape = 'rect', buff = 0.15, strokeWidth = 0.04, cornerRadius = 0, keep = false, fadeOut = true, ...opts }: CircumscribeOptions = {}) {
    const stroke = color ?? NEUTRAL_COLORS.emphasis;
    const fit = (): VMobject => shape === 'circle'
      ? circleAround(target, buff, { stroke, strokeWidth })
      : new SurroundingRectangle(target, { buff, cornerRadius, stroke, strokeWidth });
    const outline = fit();
    if (color === undefined) followScene(outline, { stroke: 'emphasis' });
    super(outline, { rateFunc: linear, ...opts, remover: !keep });
    this.target = target; this.shape = shape; this.buff = buff; this.cornerRadius = cornerRadius;
    this.keep = keep; this.fadeOut = fadeOut;
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
    this.baseOpacity = o.style.opacity;
    super.doBegin();
  }

  /** Style only, from alpha alone: the points were fixed at begin(). */
  protected override doInterpolate(alpha: number): void {
    const s = this.outline.style;
    const drawn = smooth(alpha / CIRCUMSCRIBE_DRAWN);
    const gone = this.keep ? 0 : smooth((alpha - CIRCUMSCRIBE_DRAWN) / (1 - CIRCUMSCRIBE_DRAWN));
    s.drawFraction = this.fadeOut ? drawn : drawn * (1 - gone);
    // Nothing drawn shows nothing: an empty dash with round caps would still be a dot
    s.opacity = s.drawFraction > 0 ? this.baseOpacity * (this.fadeOut ? 1 - gone : 1) : 0;
  }

  protected override doFinish(): void {
    super.doFinish();
    const s = this.outline.style;
    if (!this.keep) {
      // Leaving the scene: restore it so the outline can be shown again
      delete s.drawFraction; s.opacity = this.baseOpacity;
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
 * function that lands on 1), the mobject equals the saved state exactly, in
 * points, style and structure, as restore() would leave it.
 */
export class Restore extends Transform {
  /** The saved state this run returns to. Set by begin(). */
  state!: Mobject;

  constructor(mobject: Mobject, opts: Omit<TransformOptions, 'replace'> = {}) { super(mobject, mobject, opts); }

  protected override doBegin(): void {
    const saved = this.mobject.saved;
    if (!saved) throw new Error(`new Restore(): ${mobjectName(this.mobject)} has no saved state; call m.saveState() first`);
    this.state = saved;
    // A fresh copy is this animation's alone; it needs no alignment if nothing structural changed since the save
    this.target = saved.copy(); this.ownsTarget = true; this.sameStructure = this.mobject.sameShapeAs(saved, true);
    super.doBegin();
  }

  protected override doFinish(): void {
    super.doFinish();
    // Alignment may have subdivided curves or added null children on the way: land
    // on the saved data itself. Same picture, exact data.
    if (this.rateFunc(1) === 1) adoptState(this.mobject, this.state);
  }
}

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
  /** The copy takeCopy() made for the next begin(), or null. */
  private taken: Mobject | null;

  constructor(source: Mobject, target: Mobject, opts: Omit<TransformOptions, 'replace'> = {}) {
    super(new Group(), target, { ...opts, replace: true });
    this.source = source;
    this.taken = null;
  }

  /** Copy the source now, for the next begin(); a second call before it keeps the first copy. @internal */
  takeCopy(): void {
    if (this.taken) return;
    this.taken = this.source.copy();
    const from = this.source.family();
    this.taken.family().forEach((m, i) => { if (from[i]) copiedFrom.set(m, from[i]); });
  }

  protected override doBegin(): void {
    this.takeCopy();
    this.mobject = this.taken!; this.taken = null;
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
    if (a instanceof TransformFromCopy) a.takeCopy();
    else if (a instanceof Succession) takeCopies(a.animations.slice(0, 1));
    else if (a instanceof AnimationGroup) takeCopies(a.animations);
  }
}

/**
 * Where a Succession is in its play, as one value: each change is made in one place (see Succession).
 *
 * - `idle`: not in a play: before its first, or once its last member has finished (or it landed).
 * - `running`: its members follow the play's time; `active` runs, and those before it have finished.
 * - `held`: the running member holds it. It waits to begin, or for something it made at its turn to
 *   begin; or, `closing`, it has finished and its own members still finish in turn before it is
 *   cleaned up. The play's time carries on meanwhile, and the Succession catches up in the turn the
 *   scene takes after that member (see Scene.afterHeld).
 *
 * In a play it keeps `play`, which names that play (a turn taken for an earlier one does nothing),
 * `reached`, the time its last frame drew (a frame before it would run finished members again),
 * `to`, where the play has taken it, and `finishing`, whether its play has finished it, so every
 * member still to come begins and finishes in turn.
 */
type SuccessionState =
  | { phase: 'idle' }
  | { phase: 'running'; play: object; reached: number; to: number; finishing: boolean }
  | { phase: 'held'; play: object; reached: number; to: number; finishing: boolean; closing: boolean };

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
 * rate functions, and a group rate function must not run time backwards.
 *
 * A member's turn is taken in turn order with everything else begun or made at
 * its turn in the same frame (see Scene.whenReady). A member that waits to begin
 * (an action's beat whose picture reads a diagram's layout, or one begun after
 * something else that waits) holds the Succession: the members after it begin
 * only once it has begun, at the time the play has reached, however short it is.
 */
export class Succession extends AnimationGroup {
  /** @internal Index of the member running now; earlier ones have finished. Set by begin(). */
  active: number;

  /** Members join `scene` (set by play(), see bindSuccessions) as they begin, as each would in a play of its own. */
  constructor(animations: Playable[], opts: AnimOptions = {}) {
    super(animations.map((x) => isAnimateBuilder(x) ? new BuiltTransform(x) : prepareAnimation(x, 'new Succession()')), { rateFunc: linear, ...opts, lagRatio: 1 });
    if (opts.rateFunc) assertForward('new Succession()', opts.rateFunc);
    this.active = -1;
  }

  /** Members run one after another: a lagRatio passed to play() is ignored (runTime and rateFunc apply). @internal */
  override setOptions({ lagRatio: _, ...opts }: PlayOptions = {}): this {
    if (opts.rateFunc) assertForward('this.play()', opts.rateFunc);
    return super.setOptions(opts);
  }

  /** Its members run one after another, so its lagRatio is 1 and stays 1. */
  protected override refuseLagRatio(value: number): void {
    if (value !== 1) throw new RangeError(`animation.lagRatio: a Succession runs its members one after another, so its lagRatio is 1, not ${value}; stagger them in a LaggedStart or an AnimationGroup instead`);
  }

  /** Where it is in its play (see SuccessionState). */
  #state: SuccessionState = { phase: 'idle' };

  protected override doBegin(): void {
    this.active = -1;
    this.#state = { phase: 'running', play: {}, reached: 0, to: 0, finishing: false };
    this.#beginNext();
  }

  /** Its state in a play: refused outside one, which only a hook called directly could reach. */
  #playing(): Exclude<SuccessionState, { phase: 'idle' }> {
    const s = this.#state;
    if (s.phase === 'idle') throw new Error(`animation.interpolate(): ${animationName(this)} is not in a play; begin() it first`);
    return s;
  }

  /** Begin the next member at its turn: through the scene, in turn order with what else begins in this frame. */
  #beginNext(): void {
    const scene = this.scene, { play } = this.#playing();
    const next = this.animations[++this.active];
    if (!next) return;
    if (!scene) {
      // Checked before its begin(), which a replaced begin would skip, as a group checks its members.
      assertLifecycle(next, 'animation.begin()');
      next.begin();
      return;
    }
    // A turn taken for an earlier play (one that has landed since) begins nothing.
    scene.whenReady([next], { call: 'new Succession()', subject: 'its member' }, () => { if (this.#in(play)) scene.beginAnimations([next]); });
  }

  /** Whether it is still in the play `play` began. */
  #in(play: object): boolean {
    const s = this.#state;
    return s.phase !== 'idle' && s.play === play;
  }

  protected override doInterpolate(alpha: number): void {
    const s = this.#playing(), t = alpha * this.maxEnd;
    if (t < s.reached - 1e-9)
      throw new Error(`new Succession(): its time ran backwards, from ${s.reached} s to ${t} s, and a finished member cannot run again; give it, and any group around it, a rate function that never decreases`);
    this.#state = { ...s, reached: t, to: t };
    if (s.phase === 'running') this.#catchUp();
  }

  /** Every member still to come begins and finishes in turn, then the last one finishes. */
  protected override doFinish(): void {
    const s = this.#playing();
    this.#state = { ...s, finishing: true };
    if (s.phase === 'running') this.#catchUp();
  }

  /**
   * Take the members to where the play has taken it: each whose turn has come finishes and is
   * cleaned up, as the end of a play would, and the next begins; then the running one draws its
   * frame (finishing, every member ends instead, and so does it). A member that waits to begin, or,
   * landing, for its own members to finish, holds it here: it carries on in a turn the scene takes
   * once that member has, so whatever the members do happens in their order.
   */
  #catchUp(closing = false): void {
    const scene = this.scene;
    for (;;) {
      const a = this.animations[this.active];
      if (a && (closing ? a.phase === 'landing' : a.phase !== 'begun' || a.waiting())) return this.#hold(closing);
      if (a && closing) {
        closing = false;
        if (scene) a.cleanUpFromScene(scene);
        this.#beginNext();
        continue;
      }
      const { to, finishing } = this.#playing();
      // A frame exactly on a boundary shows the earlier member's end, as its play's last frame does
      const due = this.active < this.animations.length &&
        (finishing || (this.active + 1 < this.animations.length && to > this.timings[this.active + 1]![0]));
      if (!due) break;
      if (a) { a.finish(); closing = true; } else this.#beginNext();
    }
    const { to, finishing } = this.#playing();
    if (finishing) {
      this.#state = { phase: 'idle' };
      return this.ended();
    }
    const a = this.animations[this.active];
    if (!a) return;
    const [start, end] = this.timings[this.active]!;
    a.interpolate(a.rateFunc(clip((to - start) / (end - start || 1), 0, 1)));
  }

  /** Held by the running member: carry on in a turn the scene takes after what it waits for (see Scene.afterHeld). */
  #hold(closing: boolean): void {
    const scene = this.scene;
    if (!scene) throw new Error(`animation.begin(): ${animationName(this.animations[this.active]!)} waits to begin, or for its own members, in a Succession with no scene, and only a play can wait; play the Succession with this.play()`);
    const s = this.#playing();
    this.#state = { ...s, phase: 'held', closing };
    scene.afterHeld('new Succession()', () => {
      const now = this.#state;
      // Landed meanwhile, or played again: this turn was taken for another play.
      if (now.phase !== 'held' || now.play !== s.play) return;
      this.#state = { phase: 'running', play: now.play, reached: now.reached, to: now.to, finishing: now.finishing };
      this.#catchUp(now.closing);
    });
  }

  /** Called once its last member has finished and been cleaned up, as its play finished it. Nothing, by default. */
  protected ended(): void {}

  /** @internal Whether a member holds it (see #catchUp). */
  override waiting(): boolean { return this.#state.phase === 'held'; }

  /**
   * Called once a play that failed after it began has landed it: its running member landed, if it
   * had begun, and no member after it began. Nothing, by default.
   */
  protected abandoned(): void {}

  /** @internal After a failure: the running member lands, if it has begun; no member after it begins (see abandoned). */
  protected override doLand(scene: Scene | null): void {
    this.#state = { phase: 'idle' };
    super.doLand(scene);
    this.abandoned();
  }

  /** @internal Members were cleaned up as each finished. */
  override cleanUpFromScene(_scene: Scene): void {}

  /** Members join the scene as they begin; these are the ones that have. */
  override get mobjects(): Mobject[] {
    const cur = this.animations[this.active], s = this.#state;
    const closing = s.phase === 'held' && s.closing;
    const upTo = cur && !closing && cur.phase !== 'begun' ? this.active : this.active + 1;
    return this.animations.slice(0, upTo).flatMap((a) => a instanceof AnimationGroup ? a.mobjects : [a.mobject]).filter(Boolean);
  }
}

/**
 * Refuse a rate function that runs time backwards anywhere (thereAndBack, wiggle): a Succession's
 * finished members do not run again. Sampled at 240 points, finer than a second at most fps.
 */
function assertForward(api: string, rateFunc: RateFunc): void {
  let last = rateFunc(0);
  for (let i = 1; i <= 240; i++) {
    const v = rateFunc(i / 240);
    if (v < last - 1e-9) throw new RangeError(`${api}: a Succession's rate function must never decrease, and this one falls from ${last.toFixed(3)} to ${v.toFixed(3)} at ${(i / 240).toFixed(3)}; give one such as linear or smooth, and run a there-and-back motion as its own play`);
    last = v;
  }
}

/**
 * A `.animate` builder as a Transform whose target is built when it begins.
 * In a Succession that is after the members before it have run, so
 * `box.animate.shift(UP)` shifts from wherever they left the box.
 */
class BuiltTransform extends Transform {
  builder: AnimateBuilderBase;
  constructor(builder: AnimateBuilderBase) { super(builder.mobject, builder.mobject); this.builder = builder; }
  protected override doBegin(): void {
    this.target = this.builder.buildTarget(); this.ownsTarget = true;
    super.doBegin();
  }
}

/** Who made what began at its turn, as messages name it: the call it belongs to, and what it is. */
export interface MadeBy {
  /** The call, as a message begins: `s.card()`, `machine.send("UP")`, `new Succession()`. */
  call: string;
  /** What made it, as a message names it after the call: `a beat`, `the transition`. */
  subject: string;
}

/**
 * @internal An animation whose members are made when its turn comes in a play, from the pictures on
 * screen then: an action's beat, or a machine's transition. Until then it stands for the mobjects it
 * declares it writes. As it begins it makes its members; once what they read is ready (the play
 * waits for that before its next frame, see Scene.whenReady) they are settled, laid out in its run
 * time, and begun through the scene, which checks them against everything else the play drives.
 * Until they have begun it waits (see waiting): a Succession that holds it begins nothing after it,
 * so one shorter than a frame still plays, held and then landed. When one of them throws as it
 * begins, those begun before it land, and it has made nothing. `by` names it, as messages do.
 */
export abstract class MadeAtTurn extends AnimationGroup {
  readonly by: MadeBy;
  readonly #declared: readonly Mobject[];
  /** Its members: not made before it begins, waiting for what they read (with the alpha a frame gave it meanwhile), or begun. */
  #turn: { made: 'not yet' } | { made: 'waiting'; at: number | null } | { made: 'begun' } = { made: 'not yet' };

  constructor(by: MadeBy, runTime: number, declared: readonly Mobject[] = []) {
    super([], { runTime, rateFunc: linear });
    this.by = by;
    this.#declared = declared;
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
    const scene = this.scene, { call, subject } = this.by;
    if (!scene) throw new Error(`${call}: ${subject} has no scene to play on; play it with this.play() on the scene it belongs to`);
    this.adopt([], []);
    this.#turn = { made: 'not yet' };
    const made = this.make();
    const turn: { made: 'waiting'; at: number | null } = { made: 'waiting', at: null };
    this.#turn = turn;
    scene.whenReady(made, { call, subject: `what ${subject} made` }, () => {
      // Landed meanwhile, after a failure: what it made never begins.
      if (this.#turn !== turn) return;
      for (const a of made) a.settle();
      // Its members before they begin, so the scene checks them, not what it declared, against the play.
      this.adopt(made, this.slots(made));
      this.#turn = { made: 'begun' };
      try { scene.beginAnimations(made, this.by); }
      catch (e) {
        // Those begun before the one that threw have landed: it made nothing that plays.
        this.adopt([], []);
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
    if (this.#turn.made === 'waiting') throw new Error(`${this.by.call}: ${this.by.subject} was finished while what it made still waited for what it reads; play it with this.play(), or in a Succession or group that plays, which wait for it`);
    super.doFinish(alpha);
  }
  /** @internal Whether what it made has yet to begin, or a member of it waits in turn. */
  override waiting(): boolean {
    return this.#turn.made === 'waiting' || super.waiting();
  }
  /** @internal What it made is cleaned up, then `after` runs. */
  override cleanUpFromScene(scene: Scene): void {
    super.cleanUpFromScene(scene);
    this.after();
  }
  /** @internal After a failure: what it made lands, then `after` runs, if it has begun; it never begins if it has not. */
  protected override doLand(scene: Scene | null): void {
    const began = this.#turn.made === 'begun';
    this.#turn = { made: 'not yet' };
    super.doLand(scene);
    if (began) this.after();
  }
  /** Before its members are made, what it declares; then theirs. */
  override targets(): Mobject[] {
    return this.#turn.made === 'begun' ? super.targets() : [...this.#declared];
  }
  /** @internal Its members are made when its turn comes; its run time was planned. */
  override settle(): void {}
}

/**
 * Bind nested schedules to their scene, validating scene-bound state changes before
 * beginning: a Succession's members join it as they begin, and every group records
 * its members' evidence to it.
 */
export function bindSuccessions(anims: readonly ScheduledAnimation[], scene: Scene): void {
  for (const a of anims) {
    // A scene-bound animation (one that changes its scene's state, such as a machine's change of state) names its scene as `host`.
    const host = (a as { host?: unknown }).host;
    if (host && host !== scene) throw new Error(`this.play(): ${animationName(a)} belongs to another scene; play it on the scene it was made for`);
    if (!(a instanceof AnimationGroup)) continue;
    a.scene = scene;
    bindSuccessions(a.animations, scene);
  }
}

// ---- matching transforms ----
// Value imports for this block only, here so the block stays one piece (imports
// are hoisted; neither module imports this one).
import { VMobject as VMobjectClass } from './vmobject.ts';
import { Text } from './text.ts';
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
export class TransformMatching extends Animation {
  readonly target: Mobject;
  key: MatchKey;
  readonly fadeMismatches: boolean;
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
  // What interpolate() writes, fixed at begin(); readable for tests and tools
  /** @internal */ moves!: MoveRow[];
  /** @internal */ fadesOut!: FadeRow[];
  /** @internal */ fadesIn!: FadeRow[];
  /** @internal */ frames!: FrameRow[];
  /** The source family after begin() attached the copies: whose boxes go stale each frame. @internal */
  touched!: Mobject[];

  constructor(mobject: Mobject, target: Mobject, { key, fadeMismatches = true, ordered = false, replace = true, staged = false, ...opts }: TransformMatchingOptions) {
    super(mobject, opts);
    this.target = target; this.key = key; this.fadeMismatches = fadeMismatches; this.ordered = ordered;
    this.replace = replace; this.staged = staged;
  }

  /** @internal */ override paints(): Mobject[] { return [this.mobject, this.target]; }

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
    const m = this.fadeMismatches ? 0 : Math.min(removed.length, added.length);
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
    this.fadesOut = this.removed.map((s) => {
      const c = ownCenter(s), { k, bx, by } = carry.get(frameOfS(s)) ?? IDENTITY;
      return { sub: s, pts: s.pointArrays().map((a) => a.slice()), opacity: s.style.opacity, tx: k * c[0] + bx, ty: k * c[1] + by };
    });
    this.moves = linked.map(([s, t]) => {
      const end = bare(t);
      s.alignData(end);
      return { sub: s, start: bare(s), end };
    });
    this.frames = [];
    for (const [ft, fs] of toSource) {
      if (fs instanceof VMobjectClass || ft instanceof VMobjectClass) continue; // a path's points are a part's
      const targetFrame = ft.matchingFrameFor(fs);
      const from = fs.pointArrays(), to = targetFrame.pointArrays();
      if (fs.pointKind() !== targetFrame.pointKind()) {
        // A metadata-only source may explicitly normalize another frame kind.
        // Native geometry never treats an unrelated equal-length array as a box.
        if (!fs.boundingPointArrays().length && from.length)
          this.frames.push({ node: fs, from: [], to: [], start: bare(fs), end: bare(targetFrame) });
        continue;
      }
      if (from.length === to.length && from.every((a, i) => a.length === to[i]!.length)) {
        this.frames.push({ node: fs, from: from.map((a) => a.slice()), to: to.map((a) => a.slice()) });
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
    this.fadesIn = this.added.map((t) => {
      const sub = bare(t), home = toSource.get(frameOfT(t))!, c = ownCenter(t), { k, bx, by } = carry.get(home) ?? IDENTITY;
      home.add(sub);
      return { sub, pts: t.pointArrays().map((a) => a.slice()), opacity: t.style.opacity, tx: (c[0] - bx) / k, ty: (c[1] - by) / k };
    });
    this.touched = src.family();
    this.interpolate(0);
  }

  protected override doInterpolate(alpha: number): void {
    const n = this.moves.length + this.fadesOut.length + this.fadesIn.length;
    let i = 0;
    for (const { sub, start, end } of this.moves) sub.interpolate(start, end, this.subAlpha(alpha, i++, n));
    // Staged: what leaves is gone by halfway, and what comes starts there.
    const out = this.staged ? (a: number) => Math.min(1, 2 * a) : (a: number) => a,
      into = this.staged ? (a: number) => Math.max(0, 2 * a - 1) : (a: number) => a;
    for (const r of this.fadesOut) fade(r, 1 - out(this.subAlpha(alpha, i++, n)), alpha, true);
    for (const r of this.fadesIn) fade(r, into(this.subAlpha(alpha, i++, n)), alpha, false);
    for (const { node, from, to, start, end } of this.frames) {
      if (start && end) { node.interpolateData(start, end, alpha); continue; }
      const mine = node.pointArrays();
      for (let j = 0; j < mine.length; j++) {
        const m = mine[j]!, x = from[j]!, y = to[j]!;
        if (alpha >= 1) m.set(y);
        else if (alpha <= 0) m.set(x);
        else for (let q = 0; q < m.length; q++) m[q] = x[q]! + (y[q]! - x[q]!) * alpha;
      }
      node.touchPoints();
    }
    for (const m of this.touched) m._bbox = null;
    this.mobject.invalidateBox();
  }

  /** @internal */
  override cleanUpFromScene(scene: Scene): void {
    super.cleanUpFromScene(scene);
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
    type ClusterText = Mobject & {clusterMatching?: boolean; clusterKey?: (cluster: number) => string | undefined};
    if (texts.length && texts.every(m => (m as ClusterText).clusterMatching))
      this.key = (part, root) => {
        const cluster = (part as Mobject & {cluster?: number}).cluster;
        return cluster == null ? plain(part, root) : (part.parent as ClusterText | null)?.clusterKey?.(cluster) ?? plain(part, root);
      };
    try { super.doBegin(); } finally { this.key = plain; }
    fadeInsideLines(this, true);
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
 * Parts not in a Text line are untouched. Runs after begin() and re-poses frame 0.
 */
function fadeInsideLines(t: TransformMatching, ride: boolean): void {
  const edges = new Map(t.frames.map((f) => [f.node, f]));
  // A Text's advance box is a point array (four corners since the reader pass; two before):
  // clamp to its x extent whatever its length, or the growing glyphs start outside the line
  const inside = (r: FadeRow, box: Float32Array | undefined) => {
    if (!box || box.length < 4) return;
    let x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < box.length; i += 2) { x0 = Math.min(x0, box[i]!); x1 = Math.max(x1, box[i]!); }
    r.tx = Math.min(Math.max(r.tx, x0), x1);
    if (ride) { const b = pointsBox(r.pts); if (b) r.ride = center(b); }
  };
  for (const r of t.fadesIn) inside(r, edges.get(r.sub.parent!)?.from[0]);
  for (const r of t.fadesOut) inside(r, edges.get(frameOf(r.sub, t.mobject))?.to[0]);
  t.interpolate(0);
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
function bare<M extends Mobject>(m: M): M { return m.copyAlone(); }

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
  /** The hunks given to the constructor, or null to compute them. @internal */
  given: readonly Hunk[] | null;
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
    this.given = hunks ?? null;
    this.keys = keys;
  }

  protected override doBegin(): void {
    const a = this.before.lines.map((t) => t.text), b = this.after.lines.map((t) => t.text);
    this.hunks = this.given ? this.given.map((h) => ({ ...h, ops: [...h.ops], lines: [...h.lines] })) : diffLines(a, b);
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
