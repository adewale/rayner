// Animations are pure functions of alpha over two fixed endpoints.
// begin() settles the endpoints (and aligns their structure); every frame
// is then `mobject = blend(start, end, rateFunc(t / runTime))`.

import { smooth, thereAndBack, linear, clip } from './rate.ts';
import type { RateFunc } from './rate.ts';
import type { Mobject, PathFunc, AnimateBuilderBase } from './mobject.ts';
import { Group, adoptState } from './mobject.ts';
import type { VMobject } from './vmobject.ts';
import type { Scene } from './scene.ts';
import * as V from './vec.ts';
import type { Vec } from './vec.ts';
import type { Box } from './mobject.ts';
import { Circle, SurroundingRectangle, boxOf } from './shapes.ts';
import { YELLOW } from './color.ts';

export interface AnimOpts {
  runTime?: number;
  rateFunc?: RateFunc;
  /** 0: children move together; 1: one after another. */
  lagRatio?: number;
  /** Remove the mobject from the scene when the animation ends. */
  remover?: boolean;
}

/** What play() accepts besides animations: a trailing options object. */
export type PlayOpts = Pick<AnimOpts, 'runTime' | 'rateFunc' | 'lagRatio'>;

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

export class Animation {
  mobject: Mobject;
  runTime: number;
  rateFunc: RateFunc;
  lagRatio: number;
  remover: boolean;
  // Set by begin()
  starting!: Mobject;
  families!: FamilyRow[];
  /** Each row's place in the lagRatio stagger, and how many places there are: see lagSlots(). */
  slots!: { index: Int32Array; count: number };

  constructor(mobject: Mobject, { runTime = 1, rateFunc = smooth, lagRatio = 0, remover = false }: AnimOpts = {}) {
    this.mobject = mobject;
    this.runTime = runTime;
    this.rateFunc = rateFunc;
    this.lagRatio = lagRatio;
    this.remover = remover;
  }

  setOptions({ runTime, rateFunc, lagRatio }: PlayOpts = {}): this {
    if (runTime != null) this.runTime = runTime;
    if (rateFunc != null) this.rateFunc = rateFunc;
    if (lagRatio != null) this.lagRatio = lagRatio;
    return this;
  }

  /** Called when play starts. Copies live here, never in the constructor. */
  begin(): void {
    this.starting = this.createStartingMobject();
    this.families = this.zipFamilies();
    this.slots = lagSlots(this.families);
    this.interpolate(0);
  }

  createStartingMobject(): Mobject { return this.mobject.copy(); }

  /** The mobjects whose families are zipped as arguments to interpolateSubmobject. */
  allMobjects(): Mobject[] { return [this.mobject, this.starting]; }

  zipFamilies(): FamilyRow[] {
    const fams = this.allMobjects().map((m) => m.family());
    // Aligned families: every one is as long as the first
    return fams[0]!.map((_, i) => fams.map((f) => f[i]!));
  }

  /**
   * Lands on rateFunc(1): for a there-and-back rate function that is the start.
   * A group passes the alpha its own timeline lands each member on instead.
   */
  finish(alpha: number = this.rateFunc(1)): void { this.interpolate(alpha); }

  cleanUpFromScene(scene: Scene): void { if (this.remover) scene.remove(this.mobject); }

  /** alpha already passed through rateFunc by the scene. */
  interpolate(alpha: number): void {
    const n = this.families.length, { index, count } = this.slots;
    for (let i = 0; i < n; i++) {
      const slot = index[i]!;
      this.interpolateSubmobject(...this.families[i]!, slot < 0 ? alpha : this.subAlpha(alpha, slot, count));
    }
    this.mobject.invalidateBox();
  }

  /** Stagger alpha across submobjects by lagRatio (manim's get_sub_alpha). */
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
  interpolateSubmobject(..._row: [...FamilyRow, number]): void {}
}

/** A path's structure: its subpaths and their closed flags. */
interface PathShape { subpaths: Float32Array[]; closed: boolean[] }

export interface TransformOpts extends AnimOpts {
  pathFunc?: PathFunc | null;
  replace?: boolean;
}

/** Blend `mobject` into `target`. With replace=true, the scene keeps `target` afterwards. */
export class Transform extends Animation {
  target: Mobject;
  pathFunc: PathFunc | null;
  replace: boolean;
  /** The target was built for this animation alone, so begin() may use it without copying. */
  ownsTarget: boolean;
  /** The target is a copy of the mobject: same structure, no alignment needed. */
  sameStructure: boolean;
  /** Set by begin(). */
  targetCopy!: Mobject;
  /** Path structure of the mobject and target families before alignment, restored on landing. */
  private shapes: WeakMap<Mobject, PathShape> | null = null;

  constructor(mobject: Mobject, target: Mobject, { pathFunc = null, replace = false, ...opts }: TransformOpts = {}) {
    super(mobject, opts);
    this.target = target;
    this.pathFunc = pathFunc;
    this.replace = replace;
    this.ownsTarget = false;
    this.sameStructure = false;
  }

  override begin(): void {
    // An animation that built its own target (FadeIn, Indicate, .animate) hands it
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
        const p = m as Partial<VMobject>;
        if (p.subpaths && p.closed) this.shapes.set(m, { subpaths: p.subpaths.map((a) => a.slice()), closed: p.closed.slice() });
      }
      for (let i = 0; i < from.length; i++) from[i]!.alignData(to[i]!);
    }
    super.begin();
  }

  /**
   * Alignment pads paths with point-sized subpaths and extra curves so both ends
   * interpolate. Landing exactly on an end gives each path that end's own
   * structure back: the same geometry, with no zero-length subpaths left over
   * (a stroked one draws a dot with round caps).
   */
  override finish(alpha?: number): void {
    const a = alpha ?? this.rateFunc(1);
    super.finish(a);
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

  override allMobjects(): Mobject[] { return [this.mobject, this.starting, this.targetCopy]; }

  override interpolateSubmobject(sub: Mobject, start: Mobject, target: Mobject, alpha: number): void {
    sub.interpolate(start, target, alpha, this.pathFunc);
  }

  override cleanUpFromScene(scene: Scene): void {
    super.cleanUpFromScene(scene);
    if (this.replace) scene.replace(this.mobject, this.target);
  }
}

/** A Transform whose target is the result of recorded .animate calls. */
function fromAnimateBuilder(builder: AnimateBuilderBase, opts: TransformOpts = {}): Transform {
  const t = new Transform(builder.mobject, builder.buildTarget(), opts);
  t.ownsTarget = true; // the built target is this animation's alone; its structure may differ (setText), so it still aligns
  return t;
}

export interface FadeOpts extends TransformOpts { shift?: Vec | null; scale?: number }

export class FadeIn extends Transform {
  shiftVec: Vec | null;
  scaleFrom: number;
  mobjectStart!: Mobject;

  constructor(mobject: Mobject, { shift = null, scale = 1, ...opts }: FadeOpts = {}) {
    super(mobject, mobject, opts);
    this.shiftVec = shift; this.scaleFrom = scale;
  }
  override begin(): void {
    // Start state: invisible, displaced; end state: the mobject as it is.
    this.target = this.mobject.copy(); this.ownsTarget = true; this.sameStructure = true;
    const start = this.mobject.copy();
    for (const m of start.family()) m.style.opacity = 0;
    if (this.shiftVec) start.shift(V.mul(this.shiftVec, -1));
    if (this.scaleFrom !== 1) start.scale(this.scaleFrom);
    this.mobjectStart = start;
    super.begin();
  }
  override createStartingMobject(): Mobject { return this.mobjectStart; }
}

export class FadeOut extends Transform {
  shiftVec: Vec | null;
  scaleTo: number;

  constructor(mobject: Mobject, { shift = null, scale = 1, ...opts }: FadeOpts = {}) {
    super(mobject, mobject, { remover: true, ...opts });
    this.shiftVec = shift; this.scaleTo = scale;
  }
  override begin(): void {
    const end = this.mobject.copy();
    for (const m of end.family()) m.style.opacity = 0;
    if (this.shiftVec) end.shift(this.shiftVec);
    if (this.scaleTo !== 1) end.scale(this.scaleTo);
    this.target = end; this.ownsTarget = true; this.sameStructure = true;
    super.begin();
  }
  override finish(alpha?: number): void {
    // Removed: restore so the mobject can be shown again later, where it was, at its size
    // and opacity (manim's FadeOut also interpolates back to 0 once removed). Kept on
    // screen (remover: false): land, and give back only the opacity, as before.
    if (this.remover) { super.finish(0); return; }
    super.finish(alpha);
    for (const [m, start] of this.families) m!.style.opacity = start!.style.opacity;
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
  borderWidth: number;
  /** The border was left to the default, so it follows the size of the text it outlines. */
  private autoBorder: boolean;

  constructor(mobject: Mobject, { borderWidth, ...opts }: AnimOpts & { borderWidth?: number } = {}) {
    super(mobject, { lagRatio: 0.2, ...opts });
    this.borderWidth = borderWidth ?? Create.BORDER;
    this.autoBorder = borderWidth == null;
  }
  /** The default border, sized for text at the default font size (0.4). */
  static BORDER = 0.012;
  /** Per-row border widths, fixed at begin(): a glyph's border scales with its text's current size. */
  private borders = new Map<Mobject, number>();
  override begin(): void {
    this.borders.clear();
    super.begin();
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
  override interpolateSubmobject(sub: Mobject, start: Mobject, alpha: number): void {
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
  override finish(alpha?: number): void {
    super.finish(alpha);
    for (const [sub, start] of this.families as Array<[Mobject, Mobject]>) {
      delete sub.style.drawFraction;
      // Restore the temporary border to what the shape had
      sub.style.stroke = start.style.stroke;
      sub.style.strokeWidth = start.style.strokeWidth;
      sub.style.strokeOpacity = start.style.strokeOpacity;
    }
  }
}

/** Write text: Create for paths, letter-by-letter fade for Text. */
export class Write extends Create {
  constructor(mobject: Mobject, opts: AnimOpts = {}) { super(mobject, { lagRatio: 0.3, ...opts }); }
}

export interface IndicateOpts extends TransformOpts { scaleFactor?: number; color?: string }

/** Scale up and recolor, there and back. */
export class Indicate extends Transform {
  scaleFactor: number;
  color: string;

  constructor(mobject: Mobject, { scaleFactor = 1.2, color = '#ffff00', ...opts }: IndicateOpts = {}) {
    super(mobject, mobject, { rateFunc: thereAndBack, ...opts });
    this.scaleFactor = scaleFactor; this.color = color;
  }
  override begin(): void {
    const t = this.mobject.copy().scale(this.scaleFactor);
    for (const m of t.family()) {
      if (m.style.stroke !== 'none') m.style.stroke = this.color;
      if (m.style.fill !== 'none') m.style.fill = this.color;
    }
    this.target = t; this.ownsTarget = true; this.sameStructure = true;
    super.begin();
  }
}

/** Run several animations together; lagRatio staggers their start times. */
export class AnimationGroup extends Animation {
  animations: Animation[];
  timings!: Array<[start: number, end: number]>;
  maxEnd!: number;

  constructor(animations: Animation[], { lagRatio = 0, rateFunc = linear, ...opts }: AnimOpts = {}) {
    // A group drives no mobject of its own, its members do: `mobject` stays null at
    // runtime, and every base method that would read it is overridden below.
    // Its rate function maps the group's own timeline, on top of each member's; it is
    // linear by default (as in manim), so a group of one plays exactly like its member.
    super(null as unknown as Mobject, { lagRatio, rateFunc, ...opts });
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
  /** A lagRatio given to play() re-staggers the members, as one given to the constructor does. */
  override setOptions(opts: PlayOpts = {}): this {
    super.setOptions(opts);
    if (opts.runTime != null) this.ownRunTime = true;
    if (opts.lagRatio != null) {
      this.layOut();
      if (!this.ownRunTime) this.runTime = this.maxEnd;
    }
    return this;
  }
  override begin(): void { for (const a of this.animations) a.begin(); }
  /** Each member lands where the group's own timeline puts it at rateFunc(1) (a there-and-back group ends at the start). */
  override finish(alpha: number = this.rateFunc(1)): void {
    this.animations.forEach((a, i) => a.finish(a.rateFunc(this.memberTime(alpha, i))));
  }
  override cleanUpFromScene(scene: Scene): void { for (const a of this.animations) a.cleanUpFromScene(scene); }
  /** Member i's own time fraction at group alpha. */
  private memberTime(alpha: number, i: number): number {
    const [s, e] = this.timings[i]!, t = alpha * this.maxEnd;
    // A member with no run time happens all at once when the group reaches its start
    if (e - s <= 0) return t >= s ? 1 : 0;
    return clip((t - s) / (e - s), 0, 1);
  }
  /** Receives raw time fraction (scene applies this.rateFunc first). */
  override interpolate(alpha: number): void {
    this.animations.forEach((a, i) => a.interpolate(a.rateFunc(this.memberTime(alpha, i))));
  }
  /** A group has no mobject; nested groups contribute their leaf members. */
  get mobjects(): Mobject[] {
    return this.animations.flatMap((a) => a instanceof AnimationGroup ? a.mobjects : [a.mobject]).filter(Boolean);
  }
}

export class LaggedStart extends AnimationGroup {
  constructor(animations: Animation[], opts: AnimOpts = {}) { super(animations, { lagRatio: 0.2, ...opts }); }
}

/** What play() accepts: an animation, or a `mobject.animate` builder. */
export type Playable = Animation | AnimateBuilderBase;

function isAnimateBuilder(x: unknown): x is AnimateBuilderBase {
  return !!x && !!(x as Partial<AnimateBuilderBase>)._isAnimateBuilder;
}

/** Normalize play() arguments: builders become Transforms. */
export function prepareAnimation(x: unknown): Animation {
  if (isAnimateBuilder(x)) return fromAnimateBuilder(x);
  if (x instanceof Animation) return x;
  throw new Error('play() expects Animations or mobject.animate builders');
}

export interface MoveAlongPathOpts extends AnimOpts { fromCurrent?: boolean }

/**
 * Move a mobject's center along a path. If the mobject isn't at the path's
 * start (a token at a box's center riding an edge that starts at the box's
 * border), the offset is blended out over the move instead of snapping on the
 * first frame: position(α) = path(α) + (1 − α)·(start − path(0)).
 * Pass { fromCurrent: false } for manim's snap-to-path behavior.
 */
export class MoveAlongPath extends Animation {
  path: VMobject;
  fromCurrent: boolean;
  /** Set by begin(). */
  offset!: Vec;

  constructor(mobject: Mobject, path: VMobject, { fromCurrent = true, ...opts }: MoveAlongPathOpts = {}) {
    super(mobject, opts); this.path = path; this.fromCurrent = fromCurrent;
  }
  override begin(): void {
    const c = this.mobject.center(), p0 = this.path.pointFromProportion(0);
    this.offset = this.fromCurrent ? [c[0] - p0[0], c[1] - p0[1]] : [0, 0];
    super.begin();
  }
  override interpolate(alpha: number): void {
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

/** Fade in, hold, fade out around a mobject: a one-shot "look here". */
export class Flash extends Animation {
  constructor(mobject: Mobject, opts: AnimOpts = {}) { super(mobject, { rateFunc: linear, ...opts }); }
  override interpolateSubmobject(sub: Mobject, start: Mobject, alpha: number): void {
    sub.style.opacity = start.style.opacity * Math.sin(Math.PI * alpha);
  }
}

// ---- emphasis ----

export interface CircumscribeOpts extends AnimOpts {
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
  target: Mobject | Box;
  shape: 'rect' | 'circle';
  buff: number;
  cornerRadius: number;
  keep: boolean;
  fadeOut: boolean;
  /** The outline's opacity when the play began: what drawing in reaches. Set by begin(). */
  baseOpacity!: number;

  constructor(target: Mobject | Box, { color = YELLOW, shape = 'rect', buff = 0.15, strokeWidth = 0.04, cornerRadius = 0, keep = false, fadeOut = true, ...opts }: CircumscribeOpts = {}) {
    const fit = (): VMobject => shape === 'circle'
      ? circleAround(target, buff, { stroke: color, strokeWidth })
      : new SurroundingRectangle(target, { buff, cornerRadius, stroke: color, strokeWidth });
    super(fit(), { rateFunc: linear, ...opts, remover: !keep });
    this.target = target; this.shape = shape; this.buff = buff; this.cornerRadius = cornerRadius;
    this.keep = keep; this.fadeOut = fadeOut;
  }

  /** The outline this animation draws: on screen from begin(), and afterwards if `keep`. */
  get outline(): VMobject { return this.mobject as VMobject; }

  override begin(): void {
    // Refit to where the target is now; the points are this play's fixed endpoint
    const o = this.outline;
    const fresh = this.shape === 'circle'
      ? circleAround(this.target, this.buff)
      : new SurroundingRectangle(this.target, { buff: this.buff, cornerRadius: this.cornerRadius });
    o.subpaths = fresh.subpaths; o.closed = fresh.closed;
    o.touchPoints(); o.invalidateBox();
    this.baseOpacity = o.style.opacity;
    super.begin();
  }

  /** Style only, from alpha alone: the points were fixed at begin(). */
  override interpolate(alpha: number): void {
    const s = this.outline.style;
    const drawn = smooth(alpha / CIRCUMSCRIBE_DRAWN);
    const gone = this.keep ? 0 : smooth((alpha - CIRCUMSCRIBE_DRAWN) / (1 - CIRCUMSCRIBE_DRAWN));
    s.drawFraction = this.fadeOut ? drawn : drawn * (1 - gone);
    // Nothing drawn shows nothing: an empty dash with round caps would still be a dot
    s.opacity = s.drawFraction > 0 ? this.baseOpacity * (this.fadeOut ? 1 - gone : 1) : 0;
  }

  override finish(): void {
    super.finish();
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
  const b = boxOf(target);
  const radius = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + buff;
  return new Circle({ radius, fill: 'none', ...style }).shift([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
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

  constructor(mobject: Mobject, opts: Omit<TransformOpts, 'replace'> = {}) { super(mobject, mobject, opts); }

  override begin(): void {
    const saved = this.mobject.saved;
    if (!saved) throw new Error(`Restore: ${this.mobject.constructor.name}#${this.mobject.id} has no saved state; call saveState() first`);
    this.state = saved;
    // A fresh copy is this animation's alone; it needs no alignment if nothing structural changed since the save
    this.target = saved.copy(); this.ownsTarget = true; this.sameStructure = this.mobject.sameShapeAs(saved, true);
    super.begin();
  }

  override finish(): void {
    super.finish();
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
 * nothing: `play(new TransformFromCopy(a, b), new Indicate(a))` and
 * `play(new Create(a), new TransformFromCopy(a, b))` are fine.
 */
export class TransformFromCopy extends Transform {
  source: Mobject;
  /** The copy takeCopy() made for the next begin(), or null. */
  private taken: Mobject | null;

  constructor(source: Mobject, target: Mobject, opts: Omit<TransformOpts, 'replace'> = {}) {
    super(new Group(), target, { ...opts, replace: true });
    this.source = source;
    this.taken = null;
  }

  /** Copy the source now, for the next begin(); a second call before it keeps the first copy. */
  takeCopy(): void {
    if (this.taken) return;
    this.taken = this.source.copy();
    const from = this.source.family();
    this.taken.family().forEach((m, i) => { if (from[i]) copiedFrom.set(m, from[i]); });
  }

  override begin(): void {
    this.takeCopy();
    this.mobject = this.taken!; this.taken = null;
    super.begin();
  }
}

/** Each part of a TransformFromCopy's copy, to the part of the source it copies: the motion verifier's provenance. */
export const copiedFrom = new WeakMap<Mobject, Mobject>();

/**
 * Make every TransformFromCopy's copy in `anims` (nested in groups too, and a
 * Succession's first member, which begins with the play) before any of them
 * begins: another animation's begin() may change the source (Create hides it).
 */
export function takeCopies(anims: readonly Animation[]): void {
  for (const a of anims) {
    if (a instanceof TransformFromCopy) a.takeCopy();
    else if (a instanceof Succession) takeCopies(a.animations.slice(0, 1));
    else if (a instanceof AnimationGroup) takeCopies(a.animations);
  }
}

/**
 * Run animations one after another: each begins when the previous ends, as
 * consecutive play() calls would, so members may drive the same mobject:
 *
 *   await this.play(new Succession([new Indicate(box), box.animate.shift(RIGHT), new FadeOut(box)]));
 *
 * Each member begins at its turn (its endpoints are fixed from the state the
 * previous one left) and is finished and cleaned up at its end, through the
 * scene, exactly as a play would. Run time is the sum of the members' (frame
 * counts match consecutive plays when each is a whole number of frames). Time
 * through a Succession is linear by default; members ease with their own
 * rate functions, and a group rate function must not run time backwards.
 */
export class Succession extends AnimationGroup {
  /** The scene the members join as they begin; set by play() (see bindSuccessions). */
  scene: Scene | null;
  /** Index of the member running now; earlier ones have finished. Set by begin(). */
  active: number;

  constructor(animations: Playable[], opts: AnimOpts = {}) {
    super(animations.map((x) => isAnimateBuilder(x) ? new BuiltTransform(x) : prepareAnimation(x)), { rateFunc: linear, ...opts, lagRatio: 1 });
    this.scene = null;
    this.active = -1;
  }

  /** Members run one after another: a lagRatio passed to play() is ignored (runTime and rateFunc apply). */
  override setOptions({ lagRatio: _, ...opts }: PlayOpts = {}): this { return super.setOptions(opts); }

  override begin(): void {
    this.active = -1;
    this.advance();
  }

  /** Finish the running member and begin the next, as the end of one play and the start of the next would. */
  advance(): void {
    const scene = this.scene;
    const cur = this.animations[this.active];
    if (cur) { cur.finish(); if (scene) cur.cleanUpFromScene(scene); }
    const next = this.animations[++this.active];
    if (next) { if (scene) scene.beginAnimations([next]); else next.begin(); }
  }

  override interpolate(alpha: number): void {
    const t = alpha * this.maxEnd;
    // A frame exactly on a boundary shows the earlier member's end, as its play's last frame does
    while (this.active + 1 < this.animations.length && t > this.timings[this.active + 1]![0]) this.advance();
    const a = this.animations[this.active];
    if (!a) return;
    const [s, e] = this.timings[this.active]!;
    a.interpolate(a.rateFunc(clip((t - s) / (e - s || 1), 0, 1)));
  }

  /** Every member still to come begins and finishes in turn, then the last one finishes. */
  override finish(): void {
    while (this.active < this.animations.length) this.advance();
  }

  /** Members were cleaned up as each finished. */
  override cleanUpFromScene(_scene: Scene): void {}

  /** Members join the scene as they begin; these are the ones that have. */
  override get mobjects(): Mobject[] {
    return this.animations.slice(0, this.active + 1).flatMap((a) => a instanceof AnimationGroup ? a.mobjects : [a.mobject]).filter(Boolean);
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
  override begin(): void {
    this.target = this.builder.buildTarget(); this.ownsTarget = true;
    super.begin();
  }
}

/** Give every Succession in `anims` (nested in groups too) the scene its members will join. */
export function bindSuccessions(anims: readonly Animation[], scene: Scene): void {
  for (const a of anims) {
    if (!(a instanceof AnimationGroup)) continue;
    if (a instanceof Succession) a.scene = scene;
    bindSuccessions(a.animations, scene);
  }
}

// ---- matching transforms ----
// Value imports for this block only, here so the block stays one piece (imports
// are hoisted; neither module imports this one).
import { VMobject as VMobjectClass } from './vmobject.ts';
import { Text } from './text.ts';
import type { Evidence } from './scene.ts';

/** What a part matches by: equal strings pair up; undefined never matches. */
export type MatchKey = (part: Mobject) => string | undefined;

export interface MatchingOpts extends TransformOpts {
  /** Unmatched parts fade (default). false: morph them into each other by index, fading only the leftovers. */
  fadeMismatches?: boolean;
  /**
   * Pair runs of consecutive equal keys first, longest first, in family order
   * (reading order for Text and Code). For text, where order is meaning; shapes
   * in a diagram have no order and pair by distance alone.
   */
  ordered?: boolean;
}

export interface TransformMatchingOpts extends MatchingOpts { key: MatchKey }

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
  target: Mobject;
  key: MatchKey;
  fadeMismatches: boolean;
  ordered: boolean;
  pathFunc: PathFunc | null;
  replace: boolean;
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
  moves!: MoveRow[];
  fadesOut!: FadeRow[];
  fadesIn!: FadeRow[];
  frames!: FrameRow[];
  /** The source family after begin() attached the copies: whose boxes go stale each frame. */
  touched!: Mobject[];
  /** The scene begin() records the pairing to (Scene.record); set by play(), see bindRecorders. */
  scene: Scene | null;

  constructor(mobject: Mobject, target: Mobject, { key, fadeMismatches = true, ordered = false, pathFunc = null, replace = true, ...opts }: TransformMatchingOpts) {
    super(mobject, opts);
    this.target = target; this.key = key; this.fadeMismatches = fadeMismatches; this.ordered = ordered;
    this.pathFunc = pathFunc; this.replace = replace;
    this.scene = null;
  }

  /** How many parts were matched, morphed, faded out and faded in. */
  summary(): MatchSummary {
    return { matched: this.pairs.length, morphed: this.morphed.length, removed: this.removed.length, added: this.added.length };
  }

  /** What begin() records to the scene: the counts, as `match` evidence. */
  evidence(): Evidence { return { kind: 'match', ...this.summary() }; }

  override begin(): void {
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
    const pairOf = matchParts(sParts, tParts, this.key, this.ordered, (runs) => {
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
    if (this.scene) { const { kind, ...data } = this.evidence(); this.scene.record(kind, data); }
  }

  override interpolate(alpha: number): void {
    const n = this.moves.length + this.fadesOut.length + this.fadesIn.length;
    let i = 0;
    for (const { sub, start, end } of this.moves) sub.interpolate(start, end, this.subAlpha(alpha, i++, n), this.pathFunc);
    for (const r of this.fadesOut) fade(r, 1 - this.subAlpha(alpha, i++, n), alpha, true);
    for (const r of this.fadesIn) fade(r, this.subAlpha(alpha, i++, n), alpha, false);
    for (const { node, from, to, start, end } of this.frames) {
      if (start && end) { node.interpolateData(start, end, alpha, this.pathFunc); continue; }
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

  override cleanUpFromScene(scene: Scene): void {
    super.cleanUpFromScene(scene);
    if (this.replace) scene.replace(this.mobject, this.target);
  }
}

/** Parts that look the same regardless of position and size pair up: VMobject.shapeKey(). */
export class TransformMatchingShapes extends TransformMatching {
  constructor(mobject: Mobject, target: Mobject, opts: MatchingOpts = {}) { super(mobject, target, { ...opts, key: shapeKeyOf }); }
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
  constructor(mobject: Mobject, target: Mobject, opts: MatchingOpts = {}) { super(mobject, target, { ordered: true, ...opts, key: textKeyOf }); }

  override begin(): void {
    super.begin();
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
    if (ride) { const b = pointsBox(r.pts); if (b) r.ride = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  };
  for (const r of t.fadesIn) inside(r, edges.get(r.sub.parent!)?.from[0]);
  for (const r of t.fadesOut) inside(r, edges.get(frameOf(r.sub, t.mobject))?.to[0]);
  t.interpolate(0);
}

const IDENTITY: Carry = { k: 1, bx: 0, by: 0 };

const shapeKeyOf: MatchKey = (p) => (p instanceof VMobjectClass ? p.shapeKey() : undefined);

// A glyph's cluster is the UTF-16 index in its Text's source string where its character starts
const textKeyOf: MatchKey = (p) => {
  const t = p.parent, cluster = (p as { cluster?: number }).cluster;
  if (t instanceof Text && cluster != null) {
    const cp = t.text.codePointAt(cluster);
    return `${t.font} ${t.weight} ${cp === undefined ? '' : String.fromCodePoint(cp)}`;
  }
  const k = shapeKeyOf(p);
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
function bare<M extends Mobject>(m: M): M {
  const kids = m.children;
  m.children = [];
  try { return m.copy(); } finally { m.children = kids; }
}

/** Box of a mobject's own points (not its children's), or null. */
function ownBox(m: Mobject): Box | null { return pointsBox(m.boundingPointArrays()); }
/** Box of point arrays, or null. */
function pointsBox(arrays: readonly Float32Array[]): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const a of arrays) {
    for (let i = 0; i < a.length; i += 2) {
      const x = a[i]!, y = a[i + 1]!;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return minX === Infinity ? null : [minX, minY, maxX, maxY];
}
function ownCenter(m: Mobject): Vec { const b = ownBox(m); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0]; }
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
function matchParts(src: Mobject[], tgt: Mobject[], key: MatchKey, ordered: boolean, scopes: (runs: Int32Array) => [Int32Array, Int32Array]): Int32Array {
  // Keys as small integers, -1 for "never matches"
  const ids = new Map<string, number>();
  const idOf = (p: Mobject) => { const k = key(p); if (k === undefined) return -1; let i = ids.get(k); if (i === undefined) ids.set(k, (i = ids.size)); return i; };
  const ks = src.map(idOf), kt = tgt.map(idOf);
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

export interface TransformDiffOpts extends Omit<MatchingOpts, 'ordered'> {
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
  before: Code;
  after: Code;
  /** The hunks given to the constructor, or null to compute them. */
  given: readonly Hunk[] | null;
  // Set by begin()
  /** The hunks animated: the ones given, or diffLines of the two texts. */
  hunks!: Hunk[];
  plan!: LinePlan;
  /** Each paired glyph's key; every other part has none, so it fades. */
  keys: Map<Mobject, string>;

  constructor(before: Code, after: Code, { hunks, ...opts }: TransformDiffOpts = {}) {
    const keys = new Map<Mobject, string>();
    super(before, after, { ...opts, ordered: false, key: (p) => keys.get(p) });
    this.before = before; this.after = after;
    this.given = hunks ?? null;
    this.keys = keys;
  }

  override begin(): void {
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
    super.begin();
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
export function bindRecorders(anims: readonly Animation[], scene: Scene): void {
  for (const a of anims) {
    if (a instanceof TransformMatching) a.scene = scene;
    else if (a instanceof AnimationGroup) bindRecorders(a.animations, scene);
  }
}

// A span's children are its line's glyphs, which carry their source index
const clusterOf = (g: Mobject): number => (g as { cluster?: number }).cluster ?? -1;

// A removed and an added line pair when their shared tokens are at least this
// share of both lines' non-space characters (difflib's ratio): a rewritten
// line morphs, an unrelated one fades out while the other grows in.
const PAIR_RATIO = 0.5;

/** Read hunks against the two texts: which lines stay, pair, go, come. Throws where they disagree. */
function planLines(hunks: readonly Hunk[], a: readonly string[], b: readonly string[]): LinePlan {
  const plan: LinePlan = { same: [], changed: [], removed: [], added: [] };
  const fail = (msg: string): never => { throw new Error(`TransformDiff: ${msg}; the hunks do not describe these two texts`); };
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
