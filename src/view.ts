// View: the picture as a function of the program's state.
//
//   const readout = view(this, (s) => new Text(`len ${s.len}  head ${s.head}`), { place: 'left' });
//   this.state.len++;
//   await this.play(readout.sync());     // rebuilt from the state as it is now, morphed into place
//
// manim's always_redraw idea in the engine's endpoint-based form. A View is a
// Group with one child, the current picture. sync() is an animation: when the
// play begins it calls build() for the new picture and morphs the current one
// into it with a matching transform; when it lands, the View swaps its child.
// No updater is ever registered, so a play with a sync in it is still a pure
// function of alpha and seeking can skip its frames. See docs/VIEWS.md.

import { Mobject, Group } from './mobject.ts';
import type { Box, HasText } from './mobject.ts';
import { Animation, Transform, TransformMatching, TransformMatchingShapes, TransformMatchingText } from './animation.ts';
import type { MatchKey, MatchSummary } from './animation.ts';
import type { RateFunc } from './rate.ts';
import { Text } from './text.ts';
import { StateReadout } from './panels.ts';
import type { Scene, SceneState } from './scene.ts';
import type { Vec } from './vec.ts';

/** Where a rebuilt picture goes: its layout box's left edge, center or right edge, at the vertical middle, on the old one's. */
export type ViewPlace = 'left' | 'center' | 'right';

export interface ViewOpts {
  /**
   * The point a rebuilt picture keeps (default 'center'): a left-placed
   * readout whose text grows stays put at its left edge, as a Text's `anchor`
   * does for setText(). false: no placing or scaling, build() puts the picture
   * where it belongs (moving the View then lasts only until the next sync).
   */
  place?: ViewPlace | false;
}

/** How sync() morphs: by glyph, by shape, by position in the family, or by your own key. */
export type ViewMatch = 'text' | 'shapes' | 'index' | MatchKey;

export interface SyncOpts {
  runTime?: number;
  rateFunc?: RateFunc;
  lagRatio?: number;
  /** Default: 'text' when either picture contains a Text, else 'index'. */
  match?: ViewMatch;
}

/**
 * A picture rebuilt from state. `current` is the picture on screen; the View
 * itself is what scenes hold, add, group and lay out, and it keeps its identity
 * (and its parent) through every sync: only its child is swapped.
 */
export class View<M extends Mobject = Mobject> extends Group {
  /** Makes the picture from the state as it is when called. Called at construction and at each sync's begin(). */
  build: () => M;
  /** The same picture as a function of a state snapshot, when the View was made from a scene's state: what the fidelity check calls. */
  render: ((state: SceneState) => M) | null;
  place: ViewPlace | false;
  /** Unplaced build size [w, h] used as the scale basis; a returning sync restores the retained picture’s basis. */
  builtSize: [number, number];
  /** The scale the last sync applied: kept while the measured one only differs from it in the last bits. */
  scaleK: number;

  constructor(build: () => M, { place = 'center' }: ViewOpts = {}, render: ((state: SceneState) => M) | null = null) {
    super();
    this.build = build; this.render = render; this.place = place; this.scaleK = 1;
    const first = fresh(build(), null);
    this.builtSize = layoutSize(first);
    this.add(first);
  }

  /** The picture on screen. */
  get current(): M { return this.children[0] as M; }

  /** The strings the picture shows, in family order: what the fidelity check compares. */
  get shown(): string[] { return pictureText(this.current); }

  /**
   * An animation that rebuilds the picture when its play begins (so after
   * any state change before it, or the Succession members before it) and
   * morphs the current one into it. It always takes its run time; a picture
   * that comes out the same moves nothing and keeps the current child.
   */
  sync(opts: SyncOpts = {}): ViewSync<M> { return new ViewSync(this, opts); }

  /** Rebuild now, without animating: for a View not on screen yet (on screen it would jump). */
  rebuild(): this {
    const next = this.fit(fresh(this.build(), this.current));
    this.swap(next);
    return this;
  }

  /**
   * Scale and move a freshly built picture to where the current one is: same
   * anchor point, and the scale the View has been given since the last build
   * (uniform scale only; a rotation is not carried). Records its built size.
   */
  fit(next: M): M {
    const size = layoutSize(next);
    if (this.place !== false) {
      const old = this.current, cur = layoutSize(old), was = this.builtSize;
      // Height decides (text keeps its height as it grows); width for a flat picture
      const measured = was[1] > 1e-9 && cur[1] > 1e-9 ? cur[1] / was[1] : was[0] > 1e-9 && cur[0] > 1e-9 ? cur[0] / was[0] : this.scaleK;
      // A shift moves Float32 points by an ulp: only a real change of scale counts
      if (Math.abs(measured - this.scaleK) > 1e-6 * this.scaleK) this.scaleK = measured;
      const at = anchorOf(old, this.place);
      if (at) {
        if (this.scaleK !== 1) next.scale(this.scaleK, { aboutPoint: anchorOf(next, this.place) ?? [0, 0] });
        const now = anchorOf(next, this.place);
        if (now) next.shift([at[0] - now[0], at[1] - now[1]]);
      }
    }
    this.builtSize = size;
    return next;
  }

  /** Make `next` the picture, in the old one's place among the children. */
  swap(next: M): void {
    const old = this.current;
    if (old === next) return;
    if (old) old.parent = null;
    this.children = [next];
    next.parent = this;
    this.invalidateBox();
  }
}

/**
 * The animation sync() returns. Everything is decided in begin(): build(),
 * placing, the matcher and its endpoints. Each frame is the inner
 * transform's pure function of alpha; finish() lands it and swaps the built
 * picture in, so the View holds exactly what build() made (its `text` too).
 */
export class ViewSync<M extends Mobject = Mobject> extends Animation {
  view: View<M>;
  match: ViewMatch | undefined;
  /** Set by begin(): the morph from the current picture to the built one, or null when nothing changed. */
  inner!: Animation | null;
  /** Set by begin(): the built, placed picture, swapped in at finish(). */
  next!: M | null;
  private previousSize!: [number, number];
  private previousScale!: number;

  constructor(v: View<M>, { match, ...opts }: SyncOpts = {}) {
    super(v, opts);
    this.view = v; this.match = match;
  }

  override begin(): void {
    const v = this.view, old = v.current;
    this.previousSize = v.builtSize;
    this.previousScale = v.scaleK;
    const next = v.fit(fresh(v.build(), old));
    if (samePicture(old, next)) { this.inner = null; this.next = null; return; }
    const match = this.match ?? (hasText(old) || hasText(next) ? 'text' : 'index');
    // replace: false everywhere: the View, not the scene, takes the new picture (see finish)
    const inner: Animation = match === 'text' ? new TransformMatchingText(old, next, { replace: false })
      : match === 'shapes' ? new TransformMatchingShapes(old, next, { replace: false })
      : match === 'index' ? new Transform(old, next)
      : new TransformMatching(old, next, { key: match, replace: false });
    if (inner instanceof Transform) inner.sameStructure = old.sameShapeAs(next, true);
    inner.lagRatio = this.lagRatio;
    inner.begin();
    this.inner = inner; this.next = next;
  }

  /** alpha already passed through this sync's rateFunc by the scene. */
  override interpolate(alpha: number): void { this.inner?.interpolate(alpha); }

  override finish(): void {
    if (!this.inner) return;
    const end = this.rateFunc(1);
    this.inner.interpolate(end);
    // Landed on the new picture: hand over to it (a matching transform leaves faded
    // parts inside the old one, a Transform leaves it aligned). A rate function that
    // comes back leaves the old picture: the View did not sync.
    if (end === 1) this.view.swap(this.next!);
    else {
      // The fitted target was discarded; keep the scale basis of the retained child.
      this.view.builtSize = this.previousSize;
      this.view.scaleK = this.previousScale;
    }
  }

  /** What the matching transform paired, once begun; null for 'index' or when nothing changed. */
  summary(): MatchSummary | null { return this.inner instanceof TransformMatching ? this.inner.summary() : null; }
}

/** A View of `build()`; build reads whatever state it closes over each time it is called. */
export function view<M extends Mobject>(build: () => M, opts?: ViewOpts): View<M>;
/**
 * A View of the scene's state: `render(scene.state)` at each sync. Keeps
 * `render`, so the picture can be checked against a trace (see viewMismatch).
 */
export function view<S extends object, M extends Mobject>(scene: Scene<S>, render: (state: S) => M, opts?: ViewOpts): View<M>;
export function view<S extends object, M extends Mobject>(a: (() => M) | Scene<S>, b?: ((state: S) => M) | ViewOpts, c?: ViewOpts): View<M> {
  if (typeof a === 'function') return new View(a, b as ViewOpts | undefined);
  const render = b as (state: S) => M;
  // Fidelity replay supplies a snapshot of this same scene's state.
  return new View(() => render(a.state), c, state => render(state as S));
}

export interface StateViewOpts extends ViewOpts {
  fontSize?: number;
  at?: Vec;
  gap?: number;
  /** How a value is written (default: strings as they are, anything else as JSON). */
  format?: (value: unknown) => string;
}

/**
 * A StateReadout of `keys` from the scene's state, as a View: `key: value`
 * rows rebuilt at each sync, placed by their left edge (so the keys stay put).
 */
export function stateView<S extends object>(scene: Scene<S>, keys: readonly (keyof S & string)[], { fontSize = 0.3, at = [0, 0], gap = 0.5, format = formatValue, place = 'left' }: StateViewOpts = {}): View<StateReadout> {
  return view(scene, (s) => new StateReadout(keys.map((k) => [k, format(s[k])] as const), {fontSize, at, gap, shaping: scene.textShaping}), {place});
}

const formatValue = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v) ?? String(v));

/** The strings of every Text in a picture, in family order (a Code's lines, a readout's keys and values). */
export function pictureText(m: Mobject): string[] {
  const out: string[] = [];
  const walk = (x: Mobject): void => {
    if (x instanceof Text) { out.push(x.text); return; } // its children are glyphs
    for (const c of x.children) walk(c);
  };
  walk(m);
  return out;
}

/**
 * The fidelity check for the picture side: null when the View shows what its
 * render() makes of `state` (a trace step's `after`), else what differs.
 * Compares the text the pictures show, not their geometry.
 */
export function viewMismatch(v: View, state: SceneState, render: ((state: SceneState) => Mobject) | null = v.render): string | null {
  if (!render) throw new Error('viewMismatch: this View was not made from a scene\'s state (view(scene, render)); pass the render function');
  const shown = v.shown, want = pictureText(render(state));
  return JSON.stringify(shown) === JSON.stringify(want) ? null : `the view shows ${JSON.stringify(shown)}, the state ${JSON.stringify(state)} renders ${JSON.stringify(want)}`;
}

// ---- internals ---------------------------------------------------------

/** build() must make a new picture each time: the old one is what morphs into it. */
function fresh<M extends Mobject>(m: M, old: Mobject | null): M {
  if (!(m instanceof Mobject)) throw new TypeError('view(): build() must return a mobject');
  if (m === old || m.parent) throw new Error(`view(): build() returned ${m.constructor.name}#${m.id}, which is ${m === old ? 'the picture on screen' : 'inside another mobject'}; build a new one each time`);
  return m;
}

function hasText(m: Mobject): boolean { return m.family().some((x) => x instanceof Text); }

/**
 * Layout box: a Text's advance box (not its ink, so the box does not change
 * with which letters it holds, as setText() keeps its anchor), any other
 * mobject's own points.
 */
function layoutBox(m: Mobject): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (x: Mobject): void => {
    for (const a of x.boundingPointArrays()) {
      for (let i = 0; i < a.length; i += 2) {
        const px = a[i]!, py = a[i + 1]!;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    if (!(x instanceof Text)) for (const c of x.children) walk(c);
  };
  walk(m);
  return minX === Infinity ? null : [minX, minY, maxX, maxY];
}

function layoutSize(m: Mobject): [number, number] {
  const b = layoutBox(m);
  return b ? [b[2] - b[0], b[3] - b[1]] : [0, 0];
}

function anchorOf(m: Mobject, place: ViewPlace): Vec | null {
  const b = layoutBox(m);
  if (!b) return null;
  return [place === 'left' ? b[0] : place === 'right' ? b[2] : (b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

/** Same family shape, points within 1e-5 (invisible: the frame is 16 wide), equal styles and strings. */
function samePicture(a: Mobject, b: Mobject): boolean {
  if (!a.sameShapeAs(b, true)) return false;
  const fa = a.family(), fb = b.family();
  for (let i = 0; i < fa.length; i++) {
    const x = fa[i]!, y = fb[i]!;
    if ((x as HasText).text !== (y as HasText).text) return false;
    const pa = x.pointArrays(), pb = y.pointArrays();
    for (let j = 0; j < pa.length; j++) {
      const p = pa[j]!, q = pb[j]!;
      for (let k = 0; k < p.length; k++) if (Math.abs(p[k]! - q[k]!) > 1e-5) return false;
    }
    const sa = x.style as Record<string, unknown>, sb = y.style as Record<string, unknown>;
    const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
    for (const k of keys) if (sa[k] !== sb[k]) return false;
  }
  return true;
}
