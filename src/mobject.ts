// Mobject: a tree of typed point buffers plus a style record.
//
// Points are canonical world coordinates (manim's model): every geometric
// operation maps a function over the point arrays of the whole family. The
// style record is blended field by field during animations.

import * as V from './vec.ts';
import type { Vec } from './vec.ts';
import { blendPaint, NEUTRAL_COLORS } from './color.ts';
import type { ColorRole, SceneColors } from './color.ts';
import { perf } from './perf.ts';
import { center, pointsBox } from './box.ts';
import type { Box } from './box.ts';
import { FRAME } from './units.ts';

/**
 * A mobject's children and parent, read and written through these, set by Mobject: they are its
 * private fields, so nothing outside this module can shadow or write them, only add, insert,
 * remove and replaceChild, and the engine's own copies, which keep the two in step and refuse a cycle.
 */
let kids: (m: Mobject) => readonly Mobject[];
let setKids: (m: Mobject, children: readonly Mobject[]) => void;
let parentIn: (m: Mobject) => Mobject | null;
let setParent: (m: Mobject, p: Mobject | null) => void;
/** A mobject's key, written only through `keyed` and the engine's own copies. */
let setKey: (m: Mobject, key: string | undefined) => void;
/** @internal The state saveState() stored, for restore() and Restore, or undefined. Copies do not carry it. */
export let savedState: (m: Mobject) => Mobject | undefined;
/**
 * @internal A mobject's number, for rendering and the reviews that match the renderer's records to
 * their mobjects. Not part of the published types: an author names a part by its `key`.
 */
export let mobjectId: (m: Mobject) => number;
/** @internal The points' version, bumped by every write to them in place (see touchPoints), which render caches key on. */
export let pointsVersion: (m: Mobject) => number | undefined;
/** @internal Clear `m`'s own cached box, not its ancestors': for a frame that clears each member, then the root's chain. */
export let dropBox: (m: Mobject) => void;
/** @internal Whether `m` or any descendant has an updater, walked without building the family. */
export let hasUpdaters: (m: Mobject) => boolean;
/** @internal A copy of `m` alone, without its children: its own points and style. */
export let copyAlone: <M extends Mobject>(m: M) => M;
/**
 * @internal Hold `parts` as `m`'s children while they belong to another mobject: their parent stays
 * theirs, and `m` only groups them for measuring and pointing (a code span's glyphs, owned by its line).
 */
export let borrowChildren: (m: Mobject, parts: readonly Mobject[]) => void;
/**
 * @internal Put `replacements` where the child `old` of `parent` stands, in order, taking each from its
 * old parent; `old` leaves unless it is among them. Refuses an `old` that is not a child of `parent`,
 * and what `add` refuses. What Scene.replace does for a part inside a group on stage.
 */
export let replaceChild: (parent: Mobject, old: Mobject, ...replacements: Mobject[]) => void;
/** A composite's hook that names its own children again after a copy or a restore (see rebindReferences). */
let rebind: (m: Mobject, source: Mobject, copies: ReadonlyMap<Mobject, Mobject>) => void;
let nextId = 1;

/**
 * @internal Keys of the engine's own members of a mobject, which a matching transform, alignment and
 * the renderer call and the engine's mobjects (a Text, a diagram's label) override: `affine`, an
 * in-place affine map of the family; `matchingFrameFor`, the frame a matching transform blends a
 * source frame toward; `interpolateData`, the points blended between two states; `alignFamily` and
 * `alignData`, giving two families and two mobjects' own data the same shape before a morph;
 * `mergeLeaves`, drawing a group of same-styled leaves as one element; `defaultColors`, the style
 * fields that still hold an engine default. Symbols, so no member an author writes on a mobject
 * shares a name with one.
 */
export const affine = Symbol('affine');
/** @internal See affine. */
export const matchingFrameFor = Symbol('matchingFrameFor');
/** @internal See affine. */
export const interpolateData = Symbol('interpolateData');
/** @internal See affine. */
export const alignFamily = Symbol('alignFamily');
/** @internal See affine. */
export const alignData = Symbol('alignData');
/** @internal See affine. */
export const mergeLeaves = Symbol('mergeLeaves');
/** @internal See affine. */
export const defaultColors = Symbol('defaultColors');
/** The scene colours a mobject took when it entered a scene: what a child added later, or a picture it becomes, takes. */
const sceneColors = Symbol('sceneColors');

const COLOR_KEYS = new Set(['fill', 'stroke']);

/** Optional SVG paint semantics used by imported artwork. Lengths are scene units. */
export interface SvgPaint {
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  fillRule?: 'nonzero' | 'evenodd';
  dashArray?: string;
  dashOffset?: number;
  miterLimit?: number;
  paintOrder?: string;
}

/** Paint. Scene units: the frame is 16 × 9, origin at the center, y up. */
export interface Style extends SvgPaint {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  opacity?: number;
  /** 0..1 of the path drawn (Create, Write). */
  drawFraction?: number;
}

/** A mobject's resolved style: every field set except the transient drawFraction. */
export type StyleRecord = Required<Omit<Style, keyof SvgPaint | 'drawFraction'>> & Pick<Style, keyof SvgPaint | 'drawFraction'>;

/**
 * Whether a style's fill shows: a paint other than none, at an opacity above zero and at
 * least `min`. An unset fill paints nothing; an unset opacity is 1. The style's own
 * `opacity` (and its parents') is the caller's to weigh.
 */
export function paintsFill(style: Style, { min = 0 }: { min?: number } = {}): boolean {
  const o = style.fillOpacity ?? 1;
  return !!style.fill && style.fill !== 'none' && o > 0 && o >= min;
}
/** Whether a style's stroke shows: as paintsFill, and with a width above zero (unset is 0). */
export function paintsStroke(style: Style, { min = 0 }: { min?: number } = {}): boolean {
  const o = style.strokeOpacity ?? 1;
  return !!style.stroke && style.stroke !== 'none' && (style.strokeWidth ?? 0) > 0 && o > 0 && o >= min;
}
/**
 * Whether a style paints anything: its fill or its stroke shows (paintsFill, paintsStroke).
 * `min` is the least paint opacity that counts: 0 asks whether anything is there at all,
 * a higher one whether it is there strongly enough to read.
 */
export const paints = (style: Style, opts: { min?: number } = {}): boolean => paintsFill(style, opts) || paintsStroke(style, opts);

const DEFAULT_STYLE: StyleRecord = {
  fill: 'none',
  fillOpacity: 1,
  stroke: NEUTRAL_COLORS.ink,
  strokeWidth: 0.04,
  strokeOpacity: 1,
  opacity: 1,
};

export type { Box } from './box.ts';

/** Called every frame with the mobject it was added to and the frame's dt. */
export type Updater<M extends Mobject = Mobject> = (m: M, dt: number) => void;

/** A function of points about a center: applyPointsFunction's argument. */
export type PointsFunction = (p: Vec) => Vec;

export interface AboutOptions {
  aboutPoint?: Vec | null;
  aboutEdge?: Vec;
}

/** The part of an `.animate` builder that play() reads. */
export interface AnimateBuilderBase<M extends Mobject = Mobject> {
  readonly _isAnimateBuilder: true;
  readonly mobject: M;
  buildTarget(): M;
}

/** The methods of M that return the mobject itself: the ones `.animate` can chain. */
export type ChainableKeys<M> = { [K in Exclude<keyof M, 'animate' | symbol>]: M[K] extends (...args: never[]) => M ? K : never }[Exclude<keyof M, 'animate' | symbol>];

/**
 * `mob.animate`: the mobject's chainable methods, recorded instead of run, each
 * returning the builder so calls chain.
 */
export type AnimateBuilder<M extends Mobject> = AnimateBuilderBase<M> & {
  [K in ChainableKeys<M>]: M[K] extends (...args: infer A) => unknown ? (...args: A) => AnimateBuilder<M> : never;
};

/** Text-like mobjects carry their string; the verifier and the text renderer read it structurally. */
export interface HasText { text?: string }

export class Mobject {
  #children: readonly Mobject[] = [];
  #parent: Mobject | null = null;
  #key: string | undefined = undefined;
  /** The state saveState() stored (see savedState). */
  #saved: Mobject | undefined = undefined;
  /** Its number (see mobjectId). */
  readonly #id: number = nextId++;
  /** Called every frame with the mobject and the frame's dt. */
  #updaters: Updater[] = [];
  /** The cached box; invalidateBox() clears it up the parent chain. */
  #bbox: Box | null = null;
  /** The points' version (see pointsVersion). */
  #pv: number | undefined = undefined;
  static {
    kids = (m) => m.#children;
    setKids = (m, children) => { m.#children = children; };
    parentIn = (m) => m.#parent;
    setParent = (m, p) => { m.#parent = p; };
    setKey = (m, key) => { m.#key = key; };
    savedState = (m) => m.#saved;
    mobjectId = (m) => m.#id;
    pointsVersion = (m) => m.#pv;
    dropBox = (m) => { m.#bbox = null; };
    hasUpdaters = (m) => m.#hasUpdaters();
    copyAlone = (m) => {
      const own = m.#children;
      m.#children = [];
      try { return m.copy(); } finally { m.#children = own; }
    };
    borrowChildren = (m, parts) => { m.#children = [...parts]; m.invalidateBox(); };
    replaceChild = (parent, old, ...replacements) => {
      if (old.#parent !== parent) throw new Error(`this.replace(): ${mobjectName(old)} is not a child of ${mobjectName(parent)}; replace one of its children`);
      parent.#refuseCycle('this.replace()', replacements);
      const at = parent.#children.filter((c) => c === old || !replacements.includes(c)).indexOf(old);
      if (!replacements.includes(old)) parent.remove(old);
      parent.#put('this.replace()', at, replacements);
    };
    rebind = (m, source, copies) => m.rebindReferences(source, copies);
  }
  /**
   * What the part is for, to whatever drew it, apart from which part it is: the stage's backdrop
   * (`'backdrop'`), its heading (`'heading'`) and the number, line and band around it (`'chrome'`), a
   * diagram's frame (`'frame'`). Many parts may share a role, so it is never an identity: `find`
   * and matching read `key`. Copies carry it, and `become` keeps the part's own.
   */
  role: string | undefined;
  style: StyleRecord;
  // Assigned lazily (Text, a diagram's label, the first scene it enters): `declare` keeps them off
  // instances until then.
  /** @internal Render a group of same-styled leaves as one element (Text sets this). */
  declare [mergeLeaves]?: boolean;
  /** Fixed world-coordinate paint viewport, inherited by descendants; does not change geometry. */
  declare clipBox?: Box;
  /**
   * @internal The style fields that still hold an engine default, and the scene colour each takes: a
   * `Text` built without a `color` has `{ fill: 'ink' }`, a `SurroundingRectangle` without a
   * `stroke` has `{ stroke: 'emphasis' }`. When the mobject first enters a scene (`scene.add`, a play
   * that targets it, or a parent already in one), each field still holding the neutral value
   * takes the scene's colour for its role (`scene.colors`), and the mark is dropped. Setting a
   * field drops its mark at once.
   */
  declare [defaultColors]?: Partial<Record<'fill' | 'stroke', ColorRole>>;
  /** @internal The scene colours this mobject took when it entered a scene. */
  declare [sceneColors]?: Readonly<SceneColors>;

  constructor(style: Style = {}) {
    this.role = undefined;
    this.style = { ...DEFAULT_STYLE, ...style };
  }

  /**
   * The children, in drawing order (last on top). Read-only: change them with `add`, `insert` and
   * `remove`, which keep each child's `parent` and the cached box in step and refuse a cycle. The
   * list is private to the mobject, so no other write to the mobject changes it.
   */
  get children(): readonly Mobject[] { return this.#children; }
  /** The mobject this one is a child of, or null. Read-only: set by adding this one to another. */
  get parent(): Mobject | null { return this.#parent; }
  /**
   * The part's identity: the same key in two pictures is the same part, so a transform, a
   * choreography, `scene.find`, emphasis and review all follow it from picture to picture.
   * Read-only: set it with `keyed(m, key)`. Copies carry it.
   */
  get key(): string | undefined { return this.#key; }

  // ---- data --------------------------------------------------------------

  /**
   * The mobject's own points: Float32Arrays of x, y pairs, which every transform and morph maps
   * over and `copy()` must copy (see copyData). None for a container; a path's subpaths. A custom
   * mobject with points of its own that is not a path overrides it, with `pointKind()`.
   */
  pointArrays(): Float32Array[] { return []; }
  /**
   * The points that count toward its box: all of `pointArrays()` unless some are not geometry
   * (a Text's advance box is not ink), which then follow maps and morphs without moving the box.
   */
  boundingPointArrays(): Float32Array[] { return this.pointArrays(); }
  /** @internal Frame-only adapter for matching transforms. A target with different
   * metric units can supply a compatible frame without changing drawn parts. */
  [matchingFrameFor](_source: Mobject): Mobject { return this; }
  /**
   * What this mobject's point arrays are: 'path' (curves) or 'box' (a Text's
   * advance box). Arrays only blend with arrays of the same kind; equal
   * lengths alone (an 8-float one-curve path, an 8-float box) are no match.
   */
  pointKind(): string { return 'none'; }

  hasPoints(): boolean { return this.pointArrays().some((a) => a.length > 0); }

  /** This mobject and every descendant, depth first. Pass `out` to append. */
  family(out: Mobject[] = []): Mobject[] {
    perf.count('family()');
    out.push(this);
    for (const c of this.#children) c.family(out);
    return out;
  }

  /**
   * The first mobject in this family, depth first and this one included, whose `key` is
   * `key`; undefined when none has it. Keys are the address a picture gives its parts:
   * matching (matchByKey), descriptions, invariants and reviews all read the same one.
   */
  find(key: string): Mobject | undefined {
    if (this.key === key) return this;
    for (const c of kids(this)) {
      const found = c.find(key);
      if (found) return found;
    }
    return undefined;
  }

  /** Every mobject in this family, depth first, whose key is `match` or passes it. */
  findAll(match: string | ((key: string) => boolean)): Mobject[] {
    const test = typeof match === 'string' ? (k: string) => k === match : match;
    return this.family().filter((m) => m.key !== undefined && test(m.key));
  }

  /**
   * Make each of `mobs` a child of this one, last on top, taking it from its old parent (one already
   * a child here moves last). Refuses this mobject itself and any of its ancestors, which would make
   * the family a cycle.
   */
  add(...mobs: Mobject[]): this { return this.#put('m.add()', null, mobs); }

  /**
   * Make each of `mobs` a child of this one, in order, so the first stands at `index` among the
   * children it does not already hold (`0` draws them first, under the rest), taking each from its
   * old parent. Refuses what `add` refuses, and an index that is not a whole number from 0 to the
   * number of children.
   */
  insert(index: number, ...mobs: Mobject[]): this { return this.#put('m.insert()', index, mobs); }

  /** Take `mobs` as children at `index` among the children that stay (the end when null), as add and insert do. */
  #put(api: string, index: number | null, mobs: readonly Mobject[]): this {
    this.#refuseCycle(api, mobs);
    const moving = new Set(mobs);
    const staying = kids(this).filter((c) => !moving.has(c));
    index ??= staying.length;
    if (!Number.isInteger(index) || index < 0 || index > staying.length)
      throw new RangeError(`${api}: the index is ${String(index)}; give a whole number from 0 to ${staying.length}, the children it keeps`);
    for (const m of mobs) { const was = parentIn(m); if (was && was !== this) was.remove(m); }
    setKids(this, [...staying.slice(0, index), ...moving, ...staying.slice(index)]);
    for (const m of moving) {
      setParent(m, this);
      if (this[sceneColors]) paintDefaults(m, this[sceneColors]);
    }
    this.invalidateBox();
    return this;
  }

  /** Take each of `mobs` that is a child of this one out of it; any other is left where it is. */
  remove(...mobs: Mobject[]): this {
    const gone = new Set(mobs.filter((m) => parentIn(m) === this));
    if (!gone.size) return this;
    setKids(this, kids(this).filter((c) => !gone.has(c)));
    for (const m of gone) setParent(m, null);
    this.invalidateBox();
    return this;
  }

  /** Refuse to take this mobject or one of its ancestors as a child: the family would be a cycle. */
  #refuseCycle(api: string, mobs: readonly Mobject[]): void {
    for (const m of mobs) {
      for (let p: Mobject | null = this; p; p = parentIn(p))
        if (p === m) throw new Error(`${api}: ${mobjectName(m)} ${m === this ? 'is the mobject it is added to' : 'contains the mobject it is added to'}, so the family would be a cycle; add it to a mobject outside it`);
    }
  }

  /**
   * A copy of the mobject and its family, made without running a subclass's constructor (which may
   * take any arguments): Mobject's constructor gives it its own number and private fields, then it
   * takes this one's own fields. An array, map, set or typed array a field holds is copied, so the
   * copy never shares one with the original (what they hold is shared); `copyData` copies anything
   * else mutable, and `rebindReferences` names the copy's own children. A subclass keeps its state in
   * such fields (a TypeScript `private` one included), never in an ES private (`#`) member, which only
   * the subclass's constructor installs: copying a mobject whose class declares one is refused with a
   * TypeError naming the class and the member (see refuseHashMembers).
   */
  copy(): this {
    perf.count('copy()');
    refuseHashMembers(this.constructor);
    const c = Reflect.construct(Mobject, [], this.constructor) as this;
    Object.assign(c, this);
    const fields = c as unknown as Record<string, unknown>;
    for (const k of Object.keys(fields)) fields[k] = ownContainer(fields[k]);
    c.#key = this.#key;
    c.style = { ...this.style };
    if (this[defaultColors]) c[defaultColors] = { ...this[defaultColors] };
    if (this.clipBox) c.clipBox = [...this.clipBox];
    c.copyData(this);
    setKids(c, kids(this).map((ch) => { const cc = ch.copy(); setParent(cc, c); return cc; }));
    if (this.rebindReferences !== Mobject.prototype.rebindReferences) {
      const originals = this.family(), clones = c.family();
      c.rebindReferences(this, new Map(originals.map((m, i) => [m, clones[i]!])));
    }
    return c;
  }

  /** Rebind a composite's named child references after copying or restoring its tree.
   * References outside the copied tree (for example its Scene) remain shared. */
  protected rebindReferences(_source: Mobject, _copies: ReadonlyMap<Mobject, Mobject>): void {}

  /** Deep-copy point data from `src`. Subclasses override. */
  protected copyData(_src: Mobject): void {}

  // ---- bounding box ------------------------------------------------------

  /**
   * Clear the cached box (see box()) of this mobject and its ancestors. The engine's own methods
   * that change points or children (transforms, add and remove, become, an animation's frame) clear
   * it themselves; code that changes points another way calls this after: an animation's own
   * doInterpolate, or a custom mobject that assigns new point arrays (a path's `subpaths`).
   */
  invalidateBox(): void {
    let m: Mobject | null = this;
    while (m) { m.#bbox = null; m = m.parent; }
  }

  /**
   * [minX, minY, maxX, maxY] over the family, or null if empty.
   * Reserved name: assigning `mob.box = ...` would shadow this and break every
   * layout call, so Mobject throws on that assignment (see the setter below).
   */
  box(): Box | null {
    perf.count('box()');
    if (this.#bbox) return this.#bbox;
    perf.count('box() miss');
    return (this.#bbox = pointsBox(this.family().flatMap((m) => m.boundingPointArrays())));
  }

  /** Point on the box in `direction`: ORIGIN = center, UR = upper right. */
  boxPoint(direction: Readonly<Vec> = [0, 0]): Vec {
    const b = this.box();
    if (!b) return [0, 0];
    const [cx, cy] = center(b);
    const hw = (b[2] - b[0]) / 2, hh = (b[3] - b[1]) / 2;
    return [cx + direction[0] * hw, cy + direction[1] * hh];
  }

  center(): Vec { return this.boxPoint([0, 0]); }
  width(): number { const b = this.box(); return b ? b[2] - b[0] : 0; }
  height(): number { const b = this.box(); return b ? b[3] - b[1] : 0; }
  top(): Vec { return this.boxPoint([0, 1]); }
  bottom(): Vec { return this.boxPoint([0, -1]); }
  left(): Vec { return this.boxPoint([-1, 0]); }
  right(): Vec { return this.boxPoint([1, 0]); }

  // ---- transforms --------------------------------------------------------

  /** Map `fn([x,y]) -> [x,y]` over every point, about `aboutPoint` (default: box center). */
  applyPointsFunction(fn: PointsFunction, { aboutPoint = null, aboutEdge = [0, 0] }: AboutOptions = {}): this {
    perf.count('applyPointsFunction()');
    const about = aboutPoint ?? this.boxPoint(aboutEdge);
    for (const m of this.family()) {
      for (const a of m.pointArrays()) {
        for (let i = 0; i < a.length; i += 2) {
          const p = fn([a[i]! - about[0], a[i + 1]! - about[1]]);
          a[i] = p[0] + about[0];
          a[i + 1] = p[1] + about[1];
        }
      }
      m.touchPoints();
    }
    this.invalidateBox();
    for (const m of this.family()) m.#bbox = null;
    return this;
  }

  /**
   * End an in-place write to its point arrays: it bumps the points' version, which render caches key
   * on (an array replaced is caught by its identity instead). The engine's own methods call it; code
   * that writes `pointArrays()` in place (a custom animation's frame) calls it after.
   */
  touchPoints(): void {
    this.#pv = (this.#pv ?? 0) + 1;
  }

  /**
   * @internal In-place affine map p -> [a c; b d](p - about) + about + [e f], with no allocation per
   * point (applyPointsFunction allocates two arrays per point): what shift, scale, rotate and
   * stretch do, and what diagram capture's SVG transforms do.
   */
  [affine](a: number, b: number, c: number, d: number, e: number, f: number, { aboutPoint = null, aboutEdge = [0, 0] }: AboutOptions = {}): this {
    perf.count('applyAffine()');
    const translation = a === 1 && b === 0 && c === 0 && d === 1;
    const about: Readonly<Vec> = translation ? [0, 0] : (aboutPoint ?? this.boxPoint(aboutEdge));
    const ox = about[0], oy = about[1];
    const family = this.family();
    for (const m of family) {
      for (const arr of m.pointArrays()) {
        if (translation) {
          for (let i = 0; i < arr.length; i += 2) { arr[i]! += e; arr[i + 1]! += f; }
        } else {
          for (let i = 0; i < arr.length; i += 2) {
            const x = arr[i]! - ox, y = arr[i + 1]! - oy;
            arr[i] = a * x + c * y + ox + e;
            arr[i + 1] = b * x + d * y + oy + f;
          }
        }
      }
      m.touchPoints();
    }
    // Ancestors' boxes depend on siblings too: drop them
    let p = this.parent;
    while (p) { p.#bbox = null; p = p.parent; }
    // Boxes are recomputed rather than shifted: points are float32, so a shifted
    // float64 box would drift from a recomputed one in the last bits.
    for (const m of family) m.#bbox = null;
    return this;
  }

  shift(v: Readonly<Vec>): this {
    return this[affine](1, 0, 0, 1, v[0], v[1]);
  }

  scale(k: number, opts: AboutOptions = {}): this {
    return this[affine](k, 0, 0, k, 0, 0, opts);
  }

  rotate(angle: number, opts: AboutOptions = {}): this {
    const c = Math.cos(angle), s = Math.sin(angle);
    return this[affine](c, s, -s, c, 0, 0, opts);
  }

  moveTo(target: Readonly<Vec> | Mobject, alignedEdge: Readonly<Vec> = [0, 0]): this {
    const dest = target instanceof Mobject ? target.boxPoint(alignedEdge) : target;
    return this.shift(V.sub(dest, this.boxPoint(alignedEdge)));
  }

  /** Place beside `target` in `direction` with a gap of `buff`. */
  nextTo(target: Readonly<Vec> | Mobject, direction: Readonly<Vec> = [1, 0], buff = 0.25, alignedEdge: Readonly<Vec> = [0, 0]): this {
    const anchor = target instanceof Mobject ? target.boxPoint(direction) : target;
    const mine = this.boxPoint(V.mul(direction, -1));
    // Keep the perpendicular alignment from alignedEdge
    const perp: Vec = [direction[0] === 0 ? alignedEdge[0] : 0, direction[1] === 0 ? alignedEdge[1] : 0];
    const tp = target instanceof Mobject ? target.boxPoint(perp) : anchor;
    const mp = this.boxPoint(perp);
    const shift = V.add(V.sub(anchor, mine), V.mul(direction, buff));
    if (direction[0] === 0) shift[0] = tp[0] - mp[0];
    if (direction[1] === 0) shift[1] = tp[1] - mp[1];
    return this.shift(shift);
  }

  /** Line up with `target`'s edge in `direction` (LEFT: same left edge), leaving the other axis alone. */
  alignTo(target: Readonly<Vec> | Mobject, direction: Readonly<Vec>): this {
    const tp = target instanceof Mobject ? target.boxPoint(direction) : target, mp = this.boxPoint(direction);
    return this.shift([direction[0] ? tp[0] - mp[0] : 0, direction[1] ? tp[1] - mp[1] : 0]);
  }

  toEdge(direction: Readonly<Vec>, buff = 0.5, frame: { w: number; h: number } = FRAME): this {
    const edge: Vec = [direction[0] * frame.w / 2, direction[1] * frame.h / 2];
    const mine = this.boxPoint(direction);
    const s = V.sub(edge, mine);
    if (direction[0] === 0) s[0] = 0; else s[0] -= direction[0] * buff;
    if (direction[1] === 0) s[1] = 0; else s[1] -= direction[1] * buff;
    return this.shift(s);
  }

  /**
   * Lay the children out in a row (RIGHT) or column (DOWN), `buff` apart,
   * aligned on `alignedEdge` across the row (e.g. UP for top-aligned), keeping
   * the group's center where it was.
   */
  arrange(direction: Readonly<Vec> = [1, 0], buff = 0.25, alignedEdge: Readonly<Vec> = [0, 0]): this {
    const c = this.center(), kids = this.children;
    for (let i = 1; i < kids.length; i++) kids[i]!.nextTo(kids[i - 1]!, direction, buff, alignedEdge);
    return this.moveTo(c);
  }

  setWidth(w: number, stretch = false): this {
    const cur = this.width() || 1;
    return stretch ? this.stretch(w / cur, 0) : this.scale(w / cur);
  }

  setHeight(h: number, stretch = false): this {
    const cur = this.height() || 1;
    return stretch ? this.stretch(h / cur, 1) : this.scale(h / cur);
  }

  stretch(k: number, axis: 0 | 1, opts: AboutOptions = {}): this {
    return axis === 0 ? this[affine](k, 0, 0, 1, 0, 0, opts) : this[affine](1, 0, 0, k, 0, 0, opts);
  }

  // ---- style -------------------------------------------------------------

  setStyle(style: Style, recurse = true): this {
    const targets = recurse ? this.family() : [this];
    for (const m of targets) {
      Object.assign(m.style, style);
      const marks = m[defaultColors];
      if (marks) for (const k of COLOR_KEYS) if (k in style) delete marks[k as 'fill' | 'stroke'];
    }
    return this;
  }
  setFill(fill: string, fillOpacity?: number): this {
    return this.setStyle(fillOpacity == null ? { fill } : { fill, fillOpacity });
  }
  setStroke(stroke: string, strokeWidth?: number, strokeOpacity?: number): this {
    const s: Style = { stroke };
    if (strokeWidth != null) s.strokeWidth = strokeWidth;
    if (strokeOpacity != null) s.strokeOpacity = strokeOpacity;
    return this.setStyle(s);
  }
  setColor(c: string): this { return this.setStyle({ fill: c, stroke: c }); }
  setOpacity(o: number): this { return this.setStyle({ opacity: o }); }

  // ---- interpolation -----------------------------------------------------

  /**
   * Blend this mobject's data between `a` and `b` (same structure) at `alpha`.
   * `a` and `b` are the family members at this one's index, which alignment
   * may have paired with another class (a Rectangle morphing into a Text).
   */
  interpolate(a: Mobject, b: Mobject, alpha: number): this {
    this[interpolateData](a, b, alpha);
    // Field by field over whatever the style holds: numbers lerp, colors blend
    const mine = this.style as Record<string, string | number | undefined>;
    const sa = a.style as Record<string, string | number | undefined>, sb = b.style as Record<string, string | number | undefined>;
    // Optional paint can enter or leave a Transform. Read fixed endpoints, not
    // the previous frame's keys (which also matters for there-and-back easing).
    for (const k in sa) if (!(k in sb)) {
      if (alpha < 0.5) mine[k] = sa[k]; else delete mine[k];
    }
    for (const k in sb) {
      const va = sa[k], vb = sb[k];
      // Exact at the ends: a + (b - a) * 1 is not always b in floating point.
      const value = va === vb ? va : alpha <= 0 ? va : alpha >= 1 ? vb : COLOR_KEYS.has(k) ? blendPaint(va as string, vb as string, alpha) : typeof va === 'number' && typeof vb === 'number' ? va + (vb - va) * alpha : alpha < 0.5 ? va : vb;
      if (value === undefined) delete mine[k]; else mine[k] = value;
    }
    this.#bbox = null;
    return this;
  }

  /**
   * @internal Blend point arrays, index by index. An array with no counterpart in `b`
   * (a path morphing into a group, which has no points of its own, or into a
   * Text, whose own array is its advance box) collapses toward b's center,
   * as in manim: the shape shrinks away while b's children grow out of the
   * null copies alignment gave this side.
   */
  [interpolateData](a: Mobject, b: Mobject, alpha: number): void {
    const mine = this.pointArrays(), pa = a.pointArrays(), pb = b.pointArrays();
    let center: Vec | null = null;
    for (let i = 0; i < mine.length; i++) {
      // Alignment gave `a` the same arrays as this one; `b` may lack one
      const m = mine[i]!, x = pa[i]!, y = pb[i];
      if (!y || y.length !== m.length || a.pointKind() !== b.pointKind()) {
        center ??= b.box() ? b.center() : a.box() ? a.center() : [0, 0];
        for (let j = 0; j < m.length; j += 2) { m[j] = x[j]! + (center[0] - x[j]!) * alpha; m[j + 1] = x[j + 1]! + (center[1] - x[j + 1]!) * alpha; }
        continue;
      }
      if (alpha === 1) {
        // Exact at the ends. Only at the ends: a rate function may overshoot
        // (easeOutBack) or undershoot, and the points must follow it past them.
        m.set(y);
      } else if (alpha === 0) {
        m.set(x);
      } else {
        for (let j = 0; j < m.length; j++) m[j] = x[j]! + (y[j]! - x[j]!) * alpha;
      }
    }
    this.touchPoints();
  }

  /** @internal Give this family and `other`'s the same shape, child for child, before a transform interpolates them. */
  [alignFamily](other: Mobject): void {
    // A container opposite a path that draws: the path moves into a first child of its own,
    // so the container's children morph into it (manim's null_point_align). Left where it
    // was, it would sit opposite something that draws nothing and end up not drawn at all.
    if (this.pointKind() !== 'path' && other.pointKind() === 'path' && other.hasPoints()) other.#pushIntoChildren();
    const n = Math.max(kids(this).length, kids(other).length);
    for (const [m, o] of [[this, other], [other, this]] as const) {
      while (kids(m).length < n) {
        // A null child: a point-collapsed copy of the counterpart, so it
        // grows out of / shrinks into something sensible.
        const src = kids(o)[kids(m).length] ?? m;
        const nul = src.#nullCopy(m.center());
        setKids(m, [...kids(m), nul]); setParent(nul, m);
      }
    }
    for (let i = 0; i < n; i++) kids(this)[i]![alignFamily](kids(other)[i]!);
  }

  /** Move this path's own curves into a new first child, leaving it a container (manim's push_self_into_submobjects). */
  #pushIntoChildren(): void {
    const self = copyAlone(this);
    // Only paths are pushed (see alignFamily), and a path's points are its subpaths
    const path = this as unknown as { subpaths: Float32Array[]; closed: boolean[] };
    path.subpaths = []; path.closed = [];
    this.touchPoints();
    setParent(self, this);
    setKids(this, [self, ...kids(this)]);
    this.invalidateBox();
  }

  /** @internal Align own point data with `other`. Subclasses override. */
  [alignData](_other: Mobject): void {}

  /** A copy with all points collapsed onto `point`, and invisible. */
  #nullCopy(point: Readonly<Vec>): this {
    const c = this.copy();
    for (const m of c.family()) {
      for (const a of m.pointArrays()) for (let i = 0; i < a.length; i += 2) { a[i] = point[0]; a[i + 1] = point[1]; }
      m.style.opacity = 0;
      m.touchPoints();
    }
    return c;
  }

  // ---- saved state -------------------------------------------------------

  /** Store a deep copy of this mobject's current state, for restore() or `new Restore(this)`. */
  saveState(): this {
    this.#saved = this.copy();
    return this;
  }

  /**
   * Return to the state saveState() stored, in place: points, style and every
   * other field of each family member (a Text's string, a number's value).
   * Expected: the same structure as when saved, which keeps every child
   * mobject (and references to it) and only rewrites its data. If the family
   * shape changed since (children added or removed, or a child of another
   * class), the children are replaced wholesale with copies of the saved ones.
   * Either way `this` keeps its identity, parent and updaters, and the saved
   * state stays, so restore() can run again.
   */
  restore(): this {
    if (!this.#saved) throw new Error(`m.restore(): ${mobjectName(this)} has no saved state; call m.saveState() first`);
    adoptState(this, this.#saved);
    return this;
  }

  /**
   * Take `other`'s points, style and fields in place, keeping this mobject's identity, key,
   * parent and updaters (manim's `become`): with the same family shape each member takes its
   * counterpart's data, so children keep their identities too. With a different shape the
   * children are replaced, which is refused when any of them carries a key. `other` is not
   * changed. A sampled animation can write each frame's drawing into its targets this way.
   */
  become(other: Mobject): this {
    if (this.sameShapeAs(other)) {
      adoptState(this, other, KEEP_ON_BECOME);
      return this;
    }
    // A different shape can only replace this mobject's children, which loses their identities.
    // That is safe only when none of them is addressed by key (a Text's glyphs, a rebuilt
    // readout); otherwise a keyed part would silently vanish, so it is refused.
    const keyed = this.family().slice(1).find((m) => m.key !== undefined);
    if (keyed)
      throw new TypeError(`m.become(): ${mobjectName(this)} and ${mobjectName(other)} have different family shapes, and the part keyed ${JSON.stringify(keyed.key)} would be lost; morph between them with a Transform instead`);
    const fresh = other.copy();
    adoptState(this, fresh, KEEP_ON_BECOME);
    takeChildren(this, fresh);
    if (this[sceneColors]) paintDefaults(this, this[sceneColors]);
    this.invalidateBox();
    return this;
  }

  /**
   * Same family shape as `other`: as many members, each of the same class
   * with as many children. With `points`, also the same point counts, so
   * interpolate() between the two needs no alignment.
   */
  sameShapeAs(other: Mobject, points = false): boolean {
    const fa = this.family(), fb = other.family();
    if (fa.length !== fb.length) return false;
    for (let i = 0; i < fa.length; i++) {
      const a = fa[i]!, b = fb[i]!;
      if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b) || a.children.length !== b.children.length) return false;
      if (points) {
        const pa = a.pointArrays(), pb = b.pointArrays();
        if (pa.length !== pb.length || pa.some((x, j) => x.length !== pb[j]!.length)) return false;
      }
    }
    return true;
  }

  // ---- updaters ----------------------------------------------------------

  addUpdater(fn: Updater<this>): this {
    // Stored with the mobject it runs on, so update() always passes `this`
    this.#updaters.push(fn as Updater);
    return this;
  }
  clearUpdaters(): this { this.#updaters = []; return this; }
  /** Whether this mobject or any descendant has an updater, walked without building the family. */
  #hasUpdaters(): boolean {
    if (this.#updaters.length) return true;
    for (const c of this.#children) if (c.#hasUpdaters()) return true;
    return false;
  }
  update(dt: number): this {
    // Most of the stage has no updater: then nothing to run, and no family to build each frame.
    if (!this.#hasUpdaters()) return this;
    for (const m of this.family()) for (const u of m.#updaters) u(m, dt);
    return this;
  }

  // ---- animate builder ---------------------------------------------------

  /**
   * A builder that records method calls (shift, setFill, moveTo, ...) and plays
   * as a Transform to the result of applying them to a copy:
   * `this.play(box.animate.shift(RIGHT))`.
   */
  get animate(): AnimateBuilder<this> {
    const calls: Array<[name: string, args: unknown[]]> = [];
    const mob = this;
    const builder = animateBuilderBase(mob, () => {
      const t = mob.copy();
      // Recorded by name: each one was a function on this mobject when recorded
      for (const [name, args] of calls) (t as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!(...args);
      return t;
    });
    const proxy: AnimateBuilder<this> = new Proxy(builder, {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target];
        if (typeof mob[prop as keyof typeof mob] === 'function') {
          return (...args: unknown[]) => { calls.push([prop as string, args]); return proxy; };
        }
        return undefined;
      },
    }) as AnimateBuilder<this>;
    return proxy;
  }
}

// Guard the method names scenes most often clobber with ad-hoc properties.
for (const name of ['box', 'center', 'width', 'height', 'left', 'right', 'top', 'bottom'] as const) {
  const method = Mobject.prototype[name];
  Object.defineProperty(Mobject.prototype, name, {
    get() { return method; },
    set() { throw new TypeError(`m.${name}: it is a method of every mobject, so it cannot hold a value; store your reference under another name, such as .rect or .label`); },
  });
}

// What a mobject keeps through restore() beyond its private fields (its number, updaters, saved
// state, family and box, which are never copied over) and the scene colours it took: nothing. Every
// other field, an author's included, whatever its name, takes the saved value.
const KEEP_ON_RESTORE = new Set<string>();
// become() also keeps each member's key, the address matching, find() and invariants use, and its role.
const KEEP_ON_BECOME = new Set(['key', 'role']);

/** Give `m` the children of `from`, a copy made for it, in place of its own, which leave it. */
function takeChildren(m: Mobject, from: Mobject): void {
  for (const c of kids(m)) setParent(c, null);
  setKids(m, kids(from));
  setKids(from, []);
  for (const c of kids(m)) setParent(c, m);
}

/**
 * For each mobject class copied so far, the first ES private (`#`) instance member it or a class
 * between it and Mobject declares, or null: read once per class from its source, so a copy pays one
 * map lookup. Any engine path that copies (a transform's target, a fade, saveState, become, `.animate`)
 * goes through copy(), which no subclass constructor runs, so such a member would be missing from the
 * copy and its first use would throw the language's own TypeError, far from the class at fault.
 */
const hashMembers = new WeakMap<object, string | null>();

/** Refuse to copy an instance of `C` when its class declares an ES private instance member (see hashMembers). */
function refuseHashMembers(C: Function): void {
  let member = hashMembers.get(C);
  if (member === undefined) {
    member = null;
    for (let k: Function | null = C; k && k !== Mobject && !member; k = Object.getPrototypeOf(k) as Function | null)
      member = declaredHashMember(Function.prototype.toString.call(k));
    hashMembers.set(C, member);
  }
  if (member) {
    const where = `class ${C.name || '(anonymous)'}`;
    throw new TypeError(`${where}: it declares the ES private member ${member}, which a copy of the mobject cannot carry (a transform, a fade and a saved state copy it without running its constructor); keep that state in an ordinary field, such as a TypeScript \`private ${member.slice(1)}\``);
  }
}

/**
 * The first ES private instance member a class's source both declares and reads or writes on an
 * object (`this.#count`, `other.#count`, `#count in o`), or null. A static one (`static #cache`) is
 * left out: it lives on the class, not on its instances.
 */
function declaredHashMember(source: string): string | null {
  const name = String.raw`#[A-Za-z_$][\w$]*`;
  const used = new Set([...source.matchAll(new RegExp(String.raw`\??\.\s*(${name})|(${name})\s+in\b`, 'g'))].map((m) => (m[1] ?? m[2])!));
  const declaredStatic = new Set([...source.matchAll(new RegExp(String.raw`\bstatic\s+(?:(?:async|get|set)\s+|\*\s*)*(${name})`, 'g'))].map((m) => m[1]!));
  // Declared in this class: a member name written without a receiver (`#count = 0;`, `#step() {`).
  const declared = new Set([...source.matchAll(new RegExp(String.raw`(?<![\w$.#'"\x60])(${name})[ \t]*[=;:(!?}\r\n]`, 'g'))].map((m) => m[1]!));
  for (const n of used) if (declared.has(n) && !declaredStatic.has(n)) return n;
  return null;
}

/** `v`, or its own copy when it is an array, a map, a set or a typed array (see Mobject.copy). */
function ownContainer(v: unknown): unknown {
  if (Array.isArray(v)) return v.slice();
  if (v instanceof Map) return new Map(v);
  if (v instanceof Set) return new Set(v);
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return (v as Float32Array).slice();
  return v;
}

/** An object's own enumerable fields, symbols included: what Object.assign (and so copy()) carries. */
const ownFields = (o: object): (string | symbol)[] =>
  [...Object.keys(o), ...Object.getOwnPropertySymbols(o).filter((k) => Object.prototype.propertyIsEnumerable.call(o, k))];

/** Rewrite `m`'s data from `state` in place (see restore()); `state` itself is never touched. */
export function adoptState(m: Mobject, state: Mobject, keep: ReadonlySet<string> = KEEP_ON_RESTORE): void {
  const fresh = state.copy();
  const same = m.sameShapeAs(fresh);
  const mf = m.family(), ff = fresh.family();
  const pairs: Array<[Mobject, Mobject]> = same ? mf.map((x, i) => [x, ff[i]!]) : [[m, fresh]];
  // A field that names a part (Code.lines, a View's current picture) must name this
  // mobject's own part afterwards, not the copy's: a class whose copy() rebinds such
  // fields (Code does) would otherwise leave them pointing at detached children.
  const own = new Map<Mobject, Mobject>(same ? ff.map((x, i) => [x, mf[i]!]) : [[fresh, m]]);
  const place = (v: unknown): unknown => {
    if (v instanceof Mobject) return own.get(v) ?? v;
    if (Array.isArray(v) && v.some((x) => x instanceof Mobject)) return v.map(place);
    return v;
  };
  for (const [to, from] of pairs) {
    const t = to as unknown as Record<string, unknown>, f = from as unknown as Record<string, unknown>;
    // Symbol-keyed fields (what a drawn part says it emphasises or shows) are data like any other, but
    // the scene colours it took, which it keeps.
    const adopt = (k: string | symbol) => typeof k === 'symbol' ? k !== sceneColors : !keep.has(k);
    for (const k of ownFields(t)) if (!(k in f) && adopt(k)) delete t[k as string];
    for (const k of ownFields(f)) if (adopt(k)) t[k as string] = place(f[k as string]);
    if (!keep.has('key')) setKey(to, from.key);
    dropBox(to);
    to.touchPoints();
  }
  if (!same) {
    // Changed shape: take the saved children wholesale (fresh copies, so the saved state stays intact)
    takeChildren(m, fresh);
  }
  for (const [to, from] of pairs) rebind(to, from, own);
  // What it took keeps the colours this mobject took from its scene.
  if (m[sceneColors]) paintDefaults(m, m[sceneColors]);
  m.invalidateBox();
}

/**
 * `m` with `key` set, returned: the part's address, which matching (matchByKey), `find`,
 * invariants and reviews read. The one way to key a part: `Mobject.key` is read-only. A key is a
 * non-empty string; an empty one, which no type can refuse, is refused with a RangeError.
 */
export function keyed<T extends Mobject>(m: T, key: string): T {
  if (key === '') throw new RangeError('keyed(): the key is ""; give the part a non-empty key, its address');
  setKey(m, key);
  return m;
}

/**
 * Mark every field in `m`'s family that holds the neutral default for its role, so it takes the
 * scene's colour for that role when it enters a scene (see `Mobject.defaultColors`). A constructor
 * calls this for the colours its caller left out.
 */
export function followScene(m: Mobject, roles: Partial<Record<'fill' | 'stroke', ColorRole>>): void {
  for (const x of m.family())
    for (const [field, role] of Object.entries(roles) as Array<['fill' | 'stroke', ColorRole]>)
      if (x.style[field] === NEUTRAL_COLORS[role]) (x[defaultColors] ??= {})[field] = role;
}

/**
 * Give `m`'s family `colors`: each field that still holds its neutral default takes the colour for
 * its role, and its mark is dropped; a field set since keeps what it was set to. Each member keeps
 * `colors` for children added to it and pictures it becomes.
 */
export function paintDefaults(m: Mobject, colors: Readonly<SceneColors>): void {
  for (const x of m.family()) {
    x[sceneColors] = colors;
    const marks = x[defaultColors];
    if (!marks) continue;
    for (const [field, role] of Object.entries(marks) as Array<['fill' | 'stroke', ColorRole]>)
      if (x.style[field] === NEUTRAL_COLORS[role]) x.style[field] = colors[role];
    delete x[defaultColors];
  }
}

/** The prototype of `.animate` builders: anything but Object.prototype (see animateBuilderBase). */
class AnimateBuilderTarget {}

/**
 * The object an `.animate` Proxy wraps. Not a plain object: play() takes a trailing
 * plain object as its options, so a builder with Object.prototype (which the Proxy
 * reports) was dropped when it came last. Every `.animate` getter builds on this.
 */
export function animateBuilderBase<M extends Mobject>(mobject: M, buildTarget: () => M): AnimateBuilderBase<M> {
  return Object.assign(Object.create(AnimateBuilderTarget.prototype) as object, { _isAnimateBuilder: true as const, mobject, buildTarget });
}

/** A mobject with no points of its own; a container. */
export class Group extends Mobject {
  constructor(...mobs: Mobject[]) { super(); this.add(...mobs); }
}

/**
 * How an error names a mobject: by its key, else by its text, else by its kind; never by its id,
 * which is the renderer's number and not part of the published types (docs/ENGINE.md, "Error messages").
 */
export function mobjectName(m: Mobject): string {
  const kind = m.constructor.name;
  if (m.key !== undefined) return `the ${kind} keyed ${JSON.stringify(m.key)}`;
  const text = (m as { text?: unknown }).text;
  if (typeof text === 'string' && text) return `the ${kind} ${JSON.stringify(text.length > 32 ? text.slice(0, 31) + '…' : text)}`;
  return withArticle(kind);
}

/**
 * @internal A class name with its indefinite article, chosen by how the name is read: a name read
 * letter by letter (one letter, or capitals such as `SVG`) by the sound of its first letter, `an F`,
 * `an SVGPath`, `a UI`; a word by its first letter, `an Arrow`, `a Circle`.
 */
export function withArticle(kind: string): string {
  const spelt = /^[A-Z](?![a-z])/.test(kind);
  return `${(spelt ? /^[AEFHILMNORSX]/ : /^[AEIOU]/).test(kind) ? 'an' : 'a'} ${kind}`;
}
