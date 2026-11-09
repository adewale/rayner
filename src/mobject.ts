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
import type { MergedCache } from './svg.ts';

/** The children of a mobject with none: frozen, as every children list is, so a cast cannot push into it. */
const NO_CHILDREN: readonly Mobject[] = Object.freeze([]);
/**
 * Each mobject's children and parent, kept in this module rather than on the mobject, so no write to
 * a mobject (a cast, plain JavaScript, Object.assign) can change them: only add, insert, remove and
 * replaceChild, and the engine's own copies, which keep the two in step and refuse a cycle.
 */
const childrenOf = new WeakMap<Mobject, readonly Mobject[]>();
const parentOf = new WeakMap<Mobject, Mobject>();
const kids = (m: Mobject): readonly Mobject[] => childrenOf.get(m) ?? NO_CHILDREN;
const parentIn = (m: Mobject): Mobject | null => parentOf.get(m) ?? null;
const setParent = (m: Mobject, p: Mobject | null): void => { if (p) parentOf.set(m, p); else parentOf.delete(m); };

/** Prototypes already found to leave `children` and `parent` to Mobject (see refuseShadow). */
const plainPrototypes = new WeakSet<object>();

/**
 * Refuse a mobject whose `children` or `parent` is not Mobject's: defined on itself
 * (Object.defineProperty, a class field in plain JavaScript) or on a subclass's prototype (a getter
 * that overrides them). The property would hide the real ones from every reader of it, while
 * family() and box() read the real ones. Checked wherever family() walks; a prototype is checked
 * the first time one of its mobjects is walked, so one patched after that is not seen.
 */
function refuseShadow(m: Mobject): void {
  for (const name of ['children', 'parent'] as const)
    if (Object.hasOwn(m, name)) throw new TypeError(`m.${name}: ${mobjectName(m)} defines ${name} on itself, which hides its real ${name}; change ${name === 'children' ? 'them' : 'it'} with add, insert, remove or replaceChild`);
  const proto = Object.getPrototypeOf(m) as object;
  if (plainPrototypes.has(proto)) return;
  for (let p: object | null = proto; p && p !== Mobject.prototype; p = Object.getPrototypeOf(p) as object | null)
    for (const name of ['children', 'parent'] as const)
      if (Object.hasOwn(p, name)) throw new TypeError(`m.${name}: ${mobjectName(m)} overrides ${name} in its class, which hides its real ${name}; change ${name === 'children' ? 'them' : 'it'} with add, insert, remove or replaceChild`);
  plainPrototypes.add(proto);
}
let nextId = 1;

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

export interface AboutOpts {
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
export type ChainableKeys<M> = { [K in Exclude<keyof M, 'animate' | 'matchingFrameFor'>]: M[K] extends (...args: never[]) => M ? K : never }[Exclude<keyof M, 'animate' | 'matchingFrameFor'>];

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
  /**
   * @internal The object's number, for rendering and error messages. Not part of the published
   * types: an author names a part by its `key`.
   */
  id: number;
  /**
   * The part's identity: the same key in two pictures is the same part, so a transform, a
   * choreography, `scene.find`, emphasis and review all follow it from picture to picture.
   */
  key: string | undefined;
  /**
   * What the part is for, to whatever drew it, apart from which part it is: the stage's backdrop
   * (`'backdrop'`), its heading (`'heading'`) and the number, line and band around it (`'chrome'`), a
   * diagram's frame (`'frame'`). Many parts may share a role, so it is never an identity: `find`
   * and matching read `key`. Copies carry it, and `become` keeps the part's own.
   */
  role: string | undefined;
  style: StyleRecord;
  /** @internal */ updaters: Updater[];
  /** @internal The cached bounding box; invalidateBox() clears it up the parent chain. */
  _bbox: Box | null;
  // Assigned lazily (first touchPoints, first merged render, Text): `declare` keeps
  // them off instances until then, exactly as the untyped code did.
  /** @internal Points version: bumped by touchPoints(), keyed on by render caches. */
  declare _pv?: number;
  /** @internal Merged-record cache for mergeLeaves groups, owned by svg.ts. */
  declare _mrec?: MergedCache;
  /** @internal Render a group of same-styled leaves as one element (Text sets this). */
  declare mergeLeaves?: boolean;
  /** Fixed world-coordinate paint viewport, inherited by descendants; does not change geometry. */
  declare clipBox?: Box;
  /** @internal The state saveState() stored, for restore() and Restore. Copies do not carry it. */
  declare saved?: Mobject;
  /**
   * The style fields that still hold an engine default, and the scene colour each takes: a
   * `Text` built without a `color` has `{ fill: 'ink' }`, a `SurroundingRectangle` without a
   * `stroke` has `{ stroke: 'emphasis' }`. When the mobject first enters a scene (`scene.add`, a play
   * that targets it, or a parent already in one), each field still holding the neutral value
   * takes the scene's colour for its role (`scene.colors`), and the mark is dropped. Setting a
   * field drops its mark at once.
   */
  declare defaultColors?: Partial<Record<'fill' | 'stroke', ColorRole>>;
  /** @internal The scene colours this mobject took when it entered a scene: what a child added later, or a picture it becomes, takes. */
  declare _colors?: Readonly<SceneColors>;

  constructor(style: Style = {}) {
    this.id = nextId++;
    this.key = undefined;
    this.role = undefined;
    this.style = { ...DEFAULT_STYLE, ...style };
    this.updaters = [];
    this._bbox = null;
  }

  /**
   * The children, in drawing order (last on top). Read-only: change them with `add`, `insert`,
   * `remove` and `replaceChild`, which keep each child's `parent` and the cached box in step and
   * refuse a cycle. The list is frozen and held outside the mobject, so no write to the mobject
   * changes it; a `children` defined on the mobject itself is refused where family() walks.
   */
  get children(): readonly Mobject[] { return kids(this); }
  /** The mobject this one is a child of, or null. Read-only: set by adding this one to another. */
  get parent(): Mobject | null { return parentIn(this); }

  // ---- data --------------------------------------------------------------

  /** The Float32Arrays (stride 2) a transform maps over. Subclasses override. @internal */
  pointArrays(): Float32Array[] { return []; }
  /** Geometry contributing to layout bounds. Transform-only metadata can opt
   * out here while still following affine maps and animation in pointArrays().
   * @internal
   */
  boundingPointArrays(): Float32Array[] { return this.pointArrays(); }
  /** @internal Frame-only adapter for matching transforms. A target with different
   * metric units can supply a compatible frame without changing drawn parts. */
  matchingFrameFor(_source: Mobject): Mobject { return this; }
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
    refuseShadow(this);
    out.push(this);
    for (const c of kids(this)) c.family(out);
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
  add(...mobs: Mobject[]): this { return this.put('m.add()', null, mobs); }

  /**
   * Make each of `mobs` a child of this one, in order, so the first stands at `index` among the
   * children it does not already hold (`0` draws them first, under the rest), taking each from its
   * old parent. Refuses what `add` refuses, and an index that is not a whole number from 0 to the
   * number of children.
   */
  insert(index: number, ...mobs: Mobject[]): this { return this.put('m.insert()', index, mobs); }

  /** Take `mobs` as children at `index` among the children that stay (the end when null), as add and insert do. */
  private put(api: string, index: number | null, mobs: readonly Mobject[]): this {
    this.refuseCycle(api, mobs);
    const moving = new Set(mobs);
    const staying = kids(this).filter((c) => !moving.has(c));
    index ??= staying.length;
    if (!Number.isInteger(index) || index < 0 || index > staying.length)
      throw new RangeError(`${api}: the index is ${String(index)}; give a whole number from 0 to ${staying.length}, the children it keeps`);
    for (const m of mobs) { const was = parentIn(m); if (was && was !== this) was.remove(m); }
    childrenOf.set(this, Object.freeze([...staying.slice(0, index), ...moving, ...staying.slice(index)]));
    for (const m of moving) {
      setParent(m, this);
      if (this._colors) paintDefaults(m, this._colors);
    }
    this.invalidateBox();
    return this;
  }

  /** Take each of `mobs` that is a child of this one out of it; any other is left where it is. */
  remove(...mobs: Mobject[]): this {
    const gone = new Set(mobs.filter((m) => parentIn(m) === this));
    if (!gone.size) return this;
    childrenOf.set(this, Object.freeze(kids(this).filter((c) => !gone.has(c))));
    for (const m of gone) setParent(m, null);
    this.invalidateBox();
    return this;
  }

  /**
   * Put `replacements` where the child `old` stands, in order, taking each from its old parent; `old`
   * leaves unless it is among them. Refuses an `old` that is not a child of this one, and what `add`
   * refuses.
   */
  replaceChild(old: Mobject, ...replacements: Mobject[]): this {
    if (parentIn(old) !== this) throw new Error(`m.replaceChild(): ${mobjectName(old)} is not a child of ${mobjectName(this)}; replace one of its children`);
    this.refuseCycle('m.replaceChild()', replacements);
    const at = kids(this).filter((c) => c === old || !replacements.includes(c)).indexOf(old);
    if (!replacements.includes(old)) this.remove(old);
    return this.put('m.replaceChild()', at, replacements);
  }

  /** Refuse to take this mobject or one of its ancestors as a child: the family would be a cycle. */
  private refuseCycle(api: string, mobs: readonly Mobject[]): void {
    for (const m of mobs) {
      for (let p: Mobject | null = this; p; p = parentIn(p))
        if (p === m) throw new Error(`${api}: ${mobjectName(m)} ${m === this ? 'is the mobject it is added to' : 'contains the mobject it is added to'}, so the family would be a cycle; add it to a mobject outside it`);
    }
  }

  /**
   * @internal Hold `parts` as children that belong to another mobject: their parent stays theirs, and
   * this one only groups them for measuring and pointing (a code span's glyphs, owned by its line).
   */
  protected borrow(parts: readonly Mobject[]): void { childrenOf.set(this, Object.freeze([...parts])); this.invalidateBox(); }

  /** @internal A copy of this mobject alone, without its children: its own points and style. */
  copyAlone(): this {
    const own = kids(this);
    childrenOf.delete(this);
    try { return this.copy(); } finally { childrenOf.set(this, own); }
  }

  copy(): this {
    perf.count('copy()');
    const c = Object.create(Object.getPrototypeOf(this)) as this;
    Object.assign(c, this);
    c.id = nextId++;
    setParent(c, null);
    c.style = { ...this.style };
    if (this.defaultColors) c.defaultColors = { ...this.defaultColors };
    if (this.clipBox) c.clipBox = [...this.clipBox];
    c.updaters = [];
    c._bbox = null;
    if (this.saved) delete c.saved; // a copy is a new mobject: it has no saved state of its own
    c.copyData(this);
    childrenOf.set(c, Object.freeze(kids(this).map((ch) => { const cc = ch.copy(); setParent(cc, c); return cc; })));
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
    while (m) { m._bbox = null; m = m.parent; }
  }

  /**
   * [minX, minY, maxX, maxY] over the family, or null if empty.
   * Reserved name: assigning `mob.box = ...` would shadow this and break every
   * layout call, so Mobject throws on that assignment (see the setter below).
   */
  box(): Box | null {
    perf.count('box()');
    if (this._bbox) return this._bbox;
    perf.count('box() miss');
    return (this._bbox = pointsBox(this.family().flatMap((m) => m.boundingPointArrays())));
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
  applyPointsFunction(fn: PointsFunction, { aboutPoint = null, aboutEdge = [0, 0] }: AboutOpts = {}): this {
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
    for (const m of this.family()) m._bbox = null;
    return this;
  }

  /** Hook for subclasses whose derived data depends on points (e.g. Text font size). */
  protected afterPointsChanged(): void {}

  /**
   * @internal Every in-place write to point arrays must end here. It bumps the points
   * version that render caches key on (array replacement is caught by array
   * identity instead).
   */
  touchPoints(): void {
    this._pv = (this._pv ?? 0) + 1;
    this.afterPointsChanged();
  }

  /**
   * In-place affine map p -> [a c; b d](p - about) + about + [e f], with no
   * allocation per point (applyPointsFunction allocates two arrays per point).
   */
  applyAffine(a: number, b: number, c: number, d: number, e: number, f: number, { aboutPoint = null, aboutEdge = [0, 0] }: AboutOpts = {}): this {
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
    while (p) { p._bbox = null; p = p.parent; }
    // Boxes are recomputed rather than shifted: points are float32, so a shifted
    // float64 box would drift from a recomputed one in the last bits.
    for (const m of family) m._bbox = null;
    return this;
  }

  shift(v: Readonly<Vec>): this {
    return this.applyAffine(1, 0, 0, 1, v[0], v[1]);
  }

  scale(k: number, opts: AboutOpts = {}): this {
    return this.applyAffine(k, 0, 0, k, 0, 0, opts);
  }

  rotate(angle: number, opts: AboutOpts = {}): this {
    const c = Math.cos(angle), s = Math.sin(angle);
    return this.applyAffine(c, s, -s, c, 0, 0, opts);
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

  /**
   * Lay the children out in a grid, row-major, `cols` per row. Cells are as wide
   * as the widest child and as tall as the tallest; children sit centered in them.
   */
  arrangeInGrid(cols: number, { buff = 0.25, buffX = buff, buffY = buff }: { buff?: number; buffX?: number; buffY?: number } = {}): this {
    const c = this.center(), kids = this.children;
    const cw = Math.max(...kids.map((k) => k.width())), ch = Math.max(...kids.map((k) => k.height()));
    kids.forEach((k, i) => k.moveTo([(i % cols) * (cw + buffX), -Math.floor(i / cols) * (ch + buffY)]));
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

  stretch(k: number, axis: 0 | 1, opts: AboutOpts = {}): this {
    return axis === 0 ? this.applyAffine(k, 0, 0, 1, 0, 0, opts) : this.applyAffine(1, 0, 0, k, 0, 0, opts);
  }

  // ---- style -------------------------------------------------------------

  setStyle(style: Style, recurse = true): this {
    const targets = recurse ? this.family() : [this];
    for (const m of targets) {
      Object.assign(m.style, style);
      if (m.defaultColors) for (const k of COLOR_KEYS) if (k in style) delete m.defaultColors[k as 'fill' | 'stroke'];
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
    this.interpolateData(a, b, alpha);
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
    this._bbox = null;
    return this;
  }

  /**
   * @internal Blend point arrays, index by index. An array with no counterpart in `b`
   * (a path morphing into a group, which has no points of its own, or into a
   * Text, whose own array is its advance box) collapses toward b's center,
   * as in manim: the shape shrinks away while b's children grow out of the
   * null copies alignment gave this side.
   */
  interpolateData(a: Mobject, b: Mobject, alpha: number): void {
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
  alignFamily(other: Mobject): void {
    // A container opposite a path that draws: the path moves into a first child of its own,
    // so the container's children morph into it (manim's null_point_align). Left where it
    // was, it would sit opposite something that draws nothing and end up not drawn at all.
    if (this.pointKind() !== 'path' && other.pointKind() === 'path' && other.hasPoints()) other.pushIntoChildren();
    const n = Math.max(kids(this).length, kids(other).length);
    for (const [m, o] of [[this, other], [other, this]] as const) {
      while (kids(m).length < n) {
        // A null child: a point-collapsed copy of the counterpart, so it
        // grows out of / shrinks into something sensible.
        const src = kids(o)[kids(m).length] ?? m;
        const nul = src.nullCopy(m.center());
        childrenOf.set(m, Object.freeze([...kids(m), nul])); setParent(nul, m);
      }
    }
    for (let i = 0; i < n; i++) kids(this)[i]!.alignFamily(kids(other)[i]!);
  }

  /** Move this path's own curves into a new first child, leaving it a container (manim's push_self_into_submobjects). */
  protected pushIntoChildren(): void {
    const self = this.copyAlone();
    // Only paths are pushed (see alignFamily), and a path's points are its subpaths
    const path = this as unknown as { subpaths: Float32Array[]; closed: boolean[] };
    path.subpaths = []; path.closed = [];
    this.touchPoints();
    setParent(self, this);
    childrenOf.set(this, Object.freeze([self, ...kids(this)]));
    this.invalidateBox();
  }

  /** @internal Align own point data with `other`. Subclasses override. */
  alignData(_other: Mobject): void {}

  /** A copy with all points collapsed onto `point`, and invisible. */
  protected nullCopy(point: Readonly<Vec>): this {
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
    this.saved = this.copy();
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
    if (!this.saved) throw new Error(`m.restore(): ${mobjectName(this)} has no saved state; call m.saveState() first`);
    adoptState(this, this.saved);
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
    if (this._colors) paintDefaults(this, this._colors);
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
    this.updaters.push(fn as Updater);
    return this;
  }
  clearUpdaters(): this { this.updaters = []; return this; }
  /** @internal Whether this mobject or any descendant has an updater, walked without building the family. */
  hasUpdaters(): boolean {
    if (this.updaters.length) return true;
    for (const c of this.children) if (c.hasUpdaters()) return true;
    return false;
  }
  update(dt: number): this {
    // Most of the stage has no updater: then nothing to run, and no family to build each frame.
    if (!this.hasUpdaters()) return this;
    for (const m of this.family()) for (const u of m.updaters) u(m, dt);
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

// Fields a mobject keeps through restore(): who it is and where it sits. Caches
// (underscore fields) stay too; touchPoints() and new arrays invalidate them.
const KEEP_ON_RESTORE = new Set(['id', 'updaters', 'saved']);
// become() also keeps each member's key, the address matching, find() and invariants use, and its role.
const KEEP_ON_BECOME = new Set([...KEEP_ON_RESTORE, 'key', 'role']);

/** Give `m` the children of `from`, a copy made for it, in place of its own, which leave it. */
function takeChildren(m: Mobject, from: Mobject): void {
  for (const c of kids(m)) setParent(c, null);
  childrenOf.set(m, kids(from));
  childrenOf.delete(from);
  for (const c of kids(m)) setParent(c, m);
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
    const adopt = (k: string | symbol) => typeof k === 'symbol' || (!keep.has(k) && k[0] !== '_');
    // Symbol-keyed fields (what a drawn part says it emphasises or shows) are data like any other.
    for (const k of ownFields(t)) if (!(k in f) && adopt(k)) delete t[k as string];
    for (const k of ownFields(f)) if (adopt(k)) t[k as string] = place(f[k as string]);
    to._bbox = null;
    to.touchPoints();
  }
  if (!same) {
    // Changed shape: take the saved children wholesale (fresh copies, so the saved state stays intact)
    takeChildren(m, fresh);
  }
  // A protected hook, reached from this helper of restore() and become() by element access.
  for (const [to, from] of pairs) to['rebindReferences'](from, own);
  // What it took keeps the colours this mobject took from its scene.
  if (m._colors) paintDefaults(m, m._colors);
  m.invalidateBox();
}

/**
 * Mark every field in `m`'s family that holds the neutral default for its role, so it takes the
 * scene's colour for that role when it enters a scene (see `Mobject.defaultColors`). A constructor
 * calls this for the colours its caller left out.
 */
export function followScene(m: Mobject, roles: Partial<Record<'fill' | 'stroke', ColorRole>>): void {
  for (const x of m.family())
    for (const [field, role] of Object.entries(roles) as Array<['fill' | 'stroke', ColorRole]>)
      if (x.style[field] === NEUTRAL_COLORS[role]) (x.defaultColors ??= {})[field] = role;
}

/**
 * Give `m`'s family `colors`: each field that still holds its neutral default takes the colour for
 * its role, and its mark is dropped; a field set since keeps what it was set to. Each member keeps
 * `colors` for children added to it and pictures it becomes.
 */
export function paintDefaults(m: Mobject, colors: Readonly<SceneColors>): void {
  for (const x of m.family()) {
    x._colors = colors;
    const marks = x.defaultColors;
    if (!marks) continue;
    for (const [field, role] of Object.entries(marks) as Array<['fill' | 'stroke', ColorRole]>)
      if (x.style[field] === NEUTRAL_COLORS[role]) x.style[field] = colors[role];
    delete x.defaultColors;
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
