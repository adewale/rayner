// View: the picture as a function of the program's state.
//
//   const readout = view(this, (s) => new Text(`len ${s.len}  head ${s.head}`), { place: 'left' });
//   this.state.len++;
//   await this.play(readout.sync({ match: 'text' }));  // rebuilt from the state as it is now, morphed into place
//
// manim's always_redraw idea in the engine's endpoint-based form. A View is a
// Group with one child, the current picture. sync() is an animation: when the
// play begins it calls build() for the new picture and morphs the current one
// into it with a matching transform; when it lands, the View swaps its child.
// No updater is ever registered, so a play with a sync in it is still a pure
// function of alpha and seeking can skip its frames. See docs/VIEWS.md.

import { Mobject, Group, paintDefaults, mobjectName } from '../src/mobject.ts';
import type { Box, HasText } from '../src/mobject.ts';
import { center, pointsBox } from '../src/box.ts';
import { Animation, Transform, TransformMatching, TransformMatchingShapes, TransformMatchingText, matchByKey } from '../src/animation.ts';
import { Follow } from './state.ts';
import type { AnimOpts, MatchKey, MatchSummary } from '../src/animation.ts';
import { cloneJson } from '../src/json.ts';
import type { RateFunc } from '../src/rate.ts';
import { Text } from '../src/text.ts';
import type { Scene, SceneState, Evidence } from '../src/scene.ts';
import type { Vec } from '../src/vec.ts';

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

/** How sync() morphs: by glyph, by shape, by position in the family, by the keys the picture's parts carry, or by your own key. */
export type ViewMatch = 'text' | 'shapes' | 'index' | 'key' | MatchKey;

export interface SyncOpts {
  runTime?: number;
  rateFunc?: RateFunc;
  lagRatio?: number;
  /**
   * Default 'key': parts pair by the keys the picture gives them. A key sync whose pictures carry
   * no keys below their roots is refused; key the parts, or say 'text', 'shapes' or 'index'.
   */
  match?: ViewMatch;
  /** Parts that go fade out over the first half and parts that come fade in over the second, so the two never overlap. Default true, for every match; 'index' has no parts that go or come. */
  staged?: boolean;
}

/** What fitting a freshly built picture gives (see View.measure): its unplaced size, and the scale it was given. */
interface ViewFit { size: [number, number]; scale: number }

/**
 * A picture rebuilt from state. `current` is the picture on screen; the View
 * itself is what scenes hold, add, group and lay out, and it keeps its identity
 * (and its parent) through every sync: only its child is swapped. `S` and `Sh` are its scene's
 * model and shown types, which its draw reads; a bare `View` is a view of any scene.
 */
export class View<M extends Mobject = Mobject, S extends object = any, Sh extends object = any> extends Group {
  /** @internal Makes the picture from the scene's state as it is when called. Called at construction and at each sync's begin(). */
  build: () => M;
  /** The picture as a function of the model and what is shown: what the fidelity checks and machine exploration call. */
  draw: (state: S, shown: Sh) => M;
  /** The scene whose `shown` a placed or rebuilt picture reads. */
  private host: Scene<S, Sh>;
  place: ViewPlace | false;
  /** @internal Unplaced build size [w, h] of the picture on screen, the scale basis: recorded when the View takes a picture (see commit). */
  builtSize: [number, number];
  /** @internal The scale the last sync applied: kept while the measured one only differs from it in the last bits. */
  scaleK: number;

  /**
   * Every View is a picture of a scene's state with a draw that check can call again. A draw can
   * still read variables outside the state; the checks catch that when a redraw disagrees.
   */
  constructor(scene: Scene<S, Sh>, draw: (state: S, shown: Sh) => M, { place = 'center' }: ViewOpts = {}) {
    super();
    this.host = scene;
    // Every picture a view draws takes its scene's colours (see Mobject.defaultColors).
    this.build = () => paintedFor(scene, draw(scene.state, scene.shown)); this.draw = draw; this.place = place; this.scaleK = 1;
    const first = fresh(this.build(), null);
    this.builtSize = layoutSize(first);
    this.add(first);
  }

  /** The picture on screen. */
  get current(): M { return this.children[0] as M; }

  /** The strings the picture shows, in family order: what the fidelity check compares. */
  get texts(): string[] { return pictureText(this.current); }

  /**
   * An animation that rebuilds the picture when its play begins (so after
   * any state change before it, or the Succession members before it) and
   * morphs the current one into it. It always takes its run time; a picture
   * that comes out the same moves nothing and keeps the current child.
   */
  sync(opts: SyncOpts = {}): ViewSync<M> { return new ViewSync<M>(this, opts); }

  /**
   * The state moving through time, and the picture with it: at each frame the scene's state is
   * `stateAt(t)`, t running from 0 to 1 at the eased alpha, and the view draws it. So the picture is
   * the view's draw of the state at every frame, a seek renders what a full play renders, and the
   * play ends with the state at `stateAt(1)`. `stateAt` must be a function of t alone, return JSON,
   * and keep the family shape the view's draw gives (as a Follow's draw does).
   */
  tween(stateAt: (t: number) => S, opts: AnimOpts = {}): Animation {
    return new ViewTween<S, Sh>(this, (t) => {
      this.host.state = cloneJson(stateAt(t), 'view.tween()', 'stateAt(t)') as Scene<S, Sh>['state'];
      return this.placed(this.host.state);
    }, opts);
  }

  /**
   * @internal The picture of `state` (with what the scene shows now), placed where a sync or rebuild would
   * put it now, without taking it: what an authored transition morphs into, so it ends where the
   * View will land.
   */
  placed(state: S, shown: Sh = this.host.shown): M {
    return this.measure(fresh(paintedFor(this.host, this.draw(state, shown)), this.current)).picture;
  }

  /** Rebuild now, without animating: for a View not on screen yet (on screen it would jump). */
  rebuild(): this {
    const { picture, fit } = this.measure(fresh(this.build(), this.current));
    this.commit(fit);
    this.swap(picture);
    return this;
  }

  /**
   * @internal Where a freshly built picture goes, without changing the View: `next` scaled and moved
   * to where the current picture is (same anchor point, and the scale the View has been given
   * since the last build; uniform scale only, a rotation is not carried), and the fit the View
   * records once it takes the picture (see commit).
   */
  measure(next: M): { picture: M; fit: ViewFit } {
    const size = layoutSize(next);
    let scale = this.scaleK;
    if (this.place !== false) {
      const old = this.current, cur = layoutSize(old), was = this.builtSize;
      // Height decides (text keeps its height as it grows); width for a flat picture
      const measured = was[1] > 1e-9 && cur[1] > 1e-9 ? cur[1] / was[1] : was[0] > 1e-9 && cur[0] > 1e-9 ? cur[0] / was[0] : scale;
      // A shift moves Float32 points by an ulp: only a real change of scale counts
      if (Math.abs(measured - scale) > 1e-6 * scale) scale = measured;
      const at = anchorOf(old, this.place);
      if (at) {
        if (scale !== 1) next.scale(scale, { aboutPoint: anchorOf(next, this.place) ?? [0, 0] });
        const now = anchorOf(next, this.place);
        if (now) next.shift([at[0] - now[0], at[1] - now[1]]);
      }
    }
    return { picture: next, fit: { size, scale } };
  }

  /** @internal Record the fit of a measured picture the View takes: its built size, and the scale it was given. */
  commit(fit: ViewFit): void {
    this.builtSize = fit.size;
    this.scaleK = fit.scale;
  }

  /** @internal Make `next` the picture, in the old one's place among the children. */
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
  view: View<M, any, any>;
  match: ViewMatch;
  staged: boolean;
  /** @internal Set by begin(): the morph from the current picture to the built one, or null when nothing changed. */
  inner!: Animation | null;
  /** Set by begin(): the built, placed picture, swapped in at finish(). */
  private next!: M | null;
  /** Set by begin(): the built picture's fit, which the View records only once it takes the picture. */
  private fit!: ViewFit;

  constructor(v: View<M, any, any>, { match = 'key', staged = true, ...opts }: SyncOpts = {}) {
    super(v, opts);
    this.view = v; this.match = match; this.staged = staged;
  }

  override begin(): void {
    const v = this.view, old = v.current;
    const { picture: next, fit } = v.measure(fresh(v.build(), old));
    this.fit = fit;
    if (samePicture(old, next)) { v.commit(fit); this.inner = null; this.next = null; return; }
    const match = this.match;
    if (match === 'key' && !keyed(old) && !keyed(next)) throw new Error(`view.sync(): ${v.key !== undefined ? `the view ${JSON.stringify(v.key)}'s` : 'the'} pictures carry no keys below their roots, so key matching pairs nothing; give the draw's parts keys (a card's or panel's \`key\` option, or \`part.key = '…'\`), or pass { match: 'text' }, 'shapes' or 'index'`);
    // replace: false everywhere: the View, not the scene, takes the new picture (see finish)
    const staged = this.staged;
    const inner: Animation = match === 'text' ? new TransformMatchingText(old, next, { replace: false, staged })
      : match === 'shapes' ? new TransformMatchingShapes(old, next, { replace: false, staged })
      : match === 'index' ? new Transform(old, next)
      : new TransformMatching(old, next, { key: match === 'key' ? matchByKey() : match, replace: false, staged });
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
    if (end === 1) {
      this.view.commit(this.fit);
      this.view.swap(this.next!);
    }
  }

  /** What the matching transform paired, once begun; null for 'index' or when nothing changed. */
  summary(): MatchSummary | null { return this.inner instanceof TransformMatching ? this.inner.summary() : null; }

  /** The morph's evidence (`match` counts), with the View's key as `view` when it has one; none for 'index' or no change. */
  override evidence(): Evidence | null {
    const e = this.inner?.evidence() ?? null;
    return e && this.view.key !== undefined ? { ...e, view: this.view.key } : e;
  }
}

/**
 * The animation tween() returns: a Follow of the view's draw over t from 0 to 1, writing into the
 * picture on screen when it begins, not when it was made. In `new Succession([view.sync(), view.tween(f)])`
 * the sync swaps in a new picture first, and the tween draws into that one.
 */
class ViewTween<S extends object, Sh extends object> extends Animation {
  private readonly view: View<Mobject, S, Sh>;
  private readonly draw: (t: number) => Mobject;
  /** Set by begin(): the Follow that writes the picture on screen then. */
  private follow: Follow | null = null;

  constructor(view: View<Mobject, S, Sh>, draw: (t: number) => Mobject, opts: AnimOpts) {
    super(view.current, opts);
    this.view = view;
    this.draw = draw;
  }

  /** The picture on screen now: what this writes once it begins. */
  override targets(): Mobject[] { return [this.follow ? this.mobject : this.view.current]; }

  override begin(): void {
    this.mobject = this.view.current;
    this.follow = new Follow({ from: 0, to: 1, draw: this.draw }, { targets: [this.mobject] });
    this.follow.begin();
  }

  /** alpha already passed through this tween's rateFunc by the scene. */
  override interpolate(alpha: number): void { this.begun().interpolate(alpha); }

  override finish(alpha: number = this.rateFunc(1)): void { this.begun().interpolate(alpha); }

  override evidence(): Evidence | null { return this.follow?.evidence() ?? null; }

  /** @internal */
  override cleanUpFromScene(scene: Scene): void { if (this.remover) scene.remove(this.mobject); }

  private begun(): Follow {
    if (!this.follow) throw new Error('view.tween(): it has not begun; play it with this.play()');
    return this.follow;
  }
}

/** `m`, its parts given `scene`'s colours where they still hold a default. */
function paintedFor<M extends Mobject>(scene: Scene<any, any>, m: M): M {
  // A stand-in for a scene (a test's `{ state, shown }`) has no colours: its parts take them when they enter one.
  if (scene.colors && m instanceof Mobject) paintDefaults(m, scene.colors);
  return m;
}

/**
 * A View of the scene's model: `draw(scene.state, scene.shown)` at each sync, its arguments typed
 * from the scene (`Scene<S, Sh>`). Keeps `draw`, so the picture can be checked against a trace
 * (see viewMismatch) and redrawn for any state a Machine reaches. Most draws read only the model.
 */
export function view<S extends object, Sh extends object, M extends Mobject>(scene: Scene<S, Sh>, draw: (state: S, shown: Sh) => M, opts?: ViewOpts): View<M, S, Sh> {
  return new View(scene, draw, opts);
}

/**
 * The members of a state type that hold every one of `K`, with those parts required: a union's
 * members without them are dropped, and optional parts become present. What `having` narrows to.
 */
export type Having<S, K extends PropertyKey> =
  S extends unknown ? ([K] extends [keyof S] ? S & { [P in K]-?: Exclude<S[P & keyof S], undefined> } : never) : never;

/**
 * `state` narrowed to the shape that holds `keys`, or a TypeError when it lacks one: for a draw of one
 * phase of a scene whose state changes shape by phase (a union of shapes), or of an optional part
 * of the state or of what is shown. `rayner check` draws every view from other steps' states too,
 * and counts a draw that throws on a state of another shape as one that reads its state.
 *
 *   const sweep = view(this, (st) => year(having(st, 'longitude')));
 */
export function having<S extends object, K extends string>(state: S, ...keys: readonly [K, ...K[]]): Having<S, K> {
  const missing = keys.filter((k) => (state as Record<string, unknown>)[k] === undefined);
  if (missing.length)
    throw new TypeError(`having(): this draw reads a state with ${missing.join(', ')}; this one has ${Object.keys(state).join(', ') || 'nothing'}`);
  return state as Having<S, K>;
}

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
 * draw() makes of `state` (a trace step's `after`) and `shown` (its `shown`),
 * else what differs. Compares the text the pictures show, not their geometry.
 */
export function viewMismatch(
  v: View, state: SceneState, { shown = {}, draw = v.draw }: { shown?: SceneState; draw?: (state: SceneState, shown: SceneState) => Mobject } = {},
): string | null {
  const texts = v.texts, want = pictureText(draw(state, shown));
  return JSON.stringify(texts) === JSON.stringify(want) ? null : `the view shows ${JSON.stringify(texts)}, the state ${JSON.stringify(state)} draws ${JSON.stringify(want)}`;
}

// ---- internals ---------------------------------------------------------

/** draw() must make a new picture each time: the old one is what morphs into it. */
function fresh<M extends Mobject>(m: M, old: Mobject | null): M {
  if (!(m instanceof Mobject)) throw new TypeError('view(): draw() must return a mobject');
  if (m === old || m.parent) throw new Error(`view(): draw() returned ${mobjectName(m)}, which is ${m === old ? 'the picture on screen' : 'inside another mobject'}; draw a new one each time`);
  return m;
}

/** Whether any part below `m` carries a key: what matchByKey pairs by (the root's own key is not read). */
function keyed(m: Mobject): boolean { return m.family().some((x) => x !== m && x.key !== undefined); }

/**
 * Layout box: a Text's advance box (not its ink, so the box does not change
 * with which letters it holds, as setText() keeps its anchor), any other
 * mobject's own points.
 */
function layoutBox(m: Mobject): Box | null {
  const arrays: Float32Array[] = [];
  const walk = (x: Mobject): void => {
    arrays.push(...x.boundingPointArrays());
    if (!(x instanceof Text)) for (const c of x.children) walk(c);
  };
  walk(m);
  return pointsBox(arrays);
}

function layoutSize(m: Mobject): [number, number] {
  const b = layoutBox(m);
  return b ? [b[2] - b[0], b[3] - b[1]] : [0, 0];
}

function anchorOf(m: Mobject, place: ViewPlace): Vec | null {
  const b = layoutBox(m);
  if (!b) return null;
  const [cx, cy] = center(b);
  return [place === 'left' ? b[0] : place === 'right' ? b[2] : cx, cy];
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
