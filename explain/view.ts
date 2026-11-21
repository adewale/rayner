// View: the picture as a function of the program's state.
//
//   const readout = view(this, (s) => new Text(`len ${s.len}  head ${s.head}`), { place: 'left' });
//   this.state.len++;
//   await readout.sync({ match: 'text' });  // rebuilt from the state as it is now, morphed into place
//
// manim's always_redraw idea in the engine's endpoint-based form. A View is a
// Group with one child, the current picture. sync() is an action: when its
// turn comes it calls build() for the new picture and morphs the current one
// into it with a matching transform; when it finishes, the View swaps its child.
// No updater is ever registered, so a play with a sync in it is still a pure
// function of alpha and seeking can skip its frames. See docs/VIEWS.md.

import { Mobject, Group, adoptState, paintDefaults, mobjectName } from '../src/mobject.ts';
import type { Box, HasText } from '../src/mobject.ts';
import { center, pointsBox } from '../src/box.ts';
import { Animation as BaseAnimation, Enclosing, Transform, knownTransform } from '../src/animation.ts';
import type { Animation } from '../src/animation.ts';
import { linear } from '../src/rate.ts';
import { Follow, stateTarget } from './state.ts';
import type { Match, MatchSummary, PlayOptions, ScheduledAnimation } from '../src/animation.ts';
import { cloneJson } from '../src/json.ts';
import { Text } from '../src/text.ts';
import type { Scene, SceneInputs, SceneState, Evidence } from '../src/scene.ts';
import type { Vec } from '../src/vec.ts';
import { action } from './action.ts';
import type { Action } from './action.ts';
import { drawContext, type DrawContext } from './draw-context.ts';

/** Where a rebuilt picture goes: its layout box's left edge, center or right edge, at the vertical middle, on the old one's. */
export type ViewPlace = 'left' | 'center' | 'right';

export interface ViewOptions {
  /** A detached drawing context, supplied to every draw and used for default paint. */
  drawing?: DrawContext;
  /**
   * The point a rebuilt picture keeps (default 'center'): a left-placed
   * readout whose text grows stays put at its left edge, as a Text's `anchor`
   * does for setText(). false: no placing or scaling, the draw puts the picture
   * where it belongs (moving the View then lasts only until the next sync).
   */
  place?: ViewPlace | false;
}

/** How sync() runs: a play's options, and how it morphs. */
export interface SyncOptions extends PlayOptions {
  /** Replace the complete picture by fading out then in, without shrinking unmatched parts. */
  how?: 'morph' | 'fade';
  /**
   * How the old picture's parts pair with the new one's, as a Transform's `match` pairs them
   * (see Match): by glyph, by shape, by position in the family, by the keys the picture's parts
   * carry, or by your own key. Default 'key': parts pair by the keys the picture gives them,
   * with changed keyed words replaced whole. A 'key' sync whose pictures carry no keys below their roots is refused; key the parts, or say
   * 'text', 'shapes' or 'index'.
   */
  match?: Match;
  /** Parts that go fade out over the first half and parts that come fade in over the second, so the two never overlap. Default true, for every match; 'index' has no parts that go or come. */
  staged?: boolean;
}

/**
 * How tween() runs: its run time and rate function. A tween samples one state at every frame and
 * redraws the whole picture from it, so it has no parts to stagger and takes no lagRatio; a play's
 * lagRatio has nothing to reach in it either.
 */
export interface TweenOptions extends Pick<PlayOptions, 'runTime' | 'rateFunc'> {
  lagRatio?: never;
}

/** One sampled scene model, redrawn by every listed view at the same eased time. */
export interface TweenStateOptions<S extends object = any, Sh extends object = any> extends TweenOptions {
  /** Views of this scene's model. Each is redrawn from the same sampled state; list each once. */
  views: readonly View<Mobject, S, Sh>[];
}

/** The anchor and uniform scale at which a View takes a freshly drawn picture. */
interface ViewPlacement { at: Vec | null; scale: number }

/** @internal A view's input binding; a symbol keeps it out of animation-builder method inference. */
export const viewInput = Symbol('viewInput');

/**
 * A picture rebuilt from state. `current` is the picture on screen; the View
 * itself is what scenes hold, add, group and lay out, and it keeps its identity
 * (and its parent) through every sync: only its child is swapped. `S` and `Sh` are its scene's
 * model and shown types, which its draw reads; a bare `View` is a view of any scene.
 */
export class View<M extends Mobject = Mobject, S extends object = any, Sh extends object = any> extends Group {
  /** @internal Draws the bound input: the scene's current model, or a staged step's local state. Called at construction and at each sync's begin(). */
  build: () => M;
  /** The picture as a function of the model and what is shown: what the fidelity checks and machine exploration call. */
  readonly draw: (state: S, shown: Sh) => M;
  /** The scene whose `shown` a placed or rebuilt picture reads. */
  private readonly host: SceneInputs<any, Sh>;
  /** A staged step's input, when this picture belongs to a local specimen instead of the model. */
  private readonly localState: S | undefined;
  /** The point a rebuilt picture keeps (see ViewOptions.place). */
  private readonly place: ViewPlace | false;
  /** The last adopted placement, including the anchor when a picture has temporarily lost all its points. */
  private adopted: ViewPlacement = { at: null, scale: 1 };
  /** Actual placed bounds when the picture was adopted, so only a later external change counts as scaling. */
  private placedBox: Box | null;

  /**
   * @internal `view(scene, draw)` makes a View. Every View is a picture of a scene's state with a
   * draw that check can call again. A draw can still read variables outside the state; the checks
   * catch that when a redraw disagrees.
   */
  constructor(scene: SceneInputs<any, Sh>, draw: (state: S, shown: Sh) => M, { place = 'center', drawing }: ViewOptions = {}, localState?: S) {
    super();
    this.host = scene;
    this.localState = localState;
    // Every picture a view draws takes its scene's colours (see Mobject.defaultColors).
    this.draw = drawing ? (st, sh) => {
      const picture = draw(st, sh);
      if (picture instanceof Mobject) paintDefaults(picture, drawing.look);
      return picture;
    } : draw;
    this.build = () => paintedFor(scene, this.draw(this[viewInput](scene.state), scene.shown));
    this.place = place;
    const first = fresh(this.build(), null);
    this.placedBox = place ? layoutBox(first) : null;
    this.add(first);
  }

  /** The picture on screen. */
  get current(): M { return this.children[0] as M; }

  /** The strings the picture shows, in family order: what the fidelity check compares. */
  get texts(): string[] { return pictureText(this.current); }

  /** @internal Whether this view reads this scene's model, rather than another host or a local specimen. */
  belongsTo(scene: Scene): boolean { return this.host === scene && this.localState === undefined; }

  /** @internal The input a fidelity check redraws: the local specimen, or the checked scene's model. */
  [viewInput](state: S): S { return this.localState ?? state; }

  /**
   * An action (see Action) that rebuilds the picture when its turn comes (so after any state
   * change before it, or the Succession members before it) and morphs the current one into it:
   * await it, or hand it to play(), a Succession or a group. It always takes its run time; a
   * picture that comes out the same moves nothing and keeps the current child.
   */
  sync(opts: SyncOptions = {}): Action {
    return turnAction(this.host, 'view.sync()', opts.runTime ?? 1, () => new ViewSync<M>(this, opts));
  }

  /**
   * An action that sets the scene's state to `stateAt(t)` at each frame and redraws the view.
   * The eased progress t is clamped to [0, 1], and the play keeps its last sample
   * (`stateAt(0)` with thereAndBack). For a seek to draw the same frame as a full play,
   * `stateAt` must depend only on t, return JSON, and preserve the family shape the view draws.
   */
  tween(stateAt: (t: number) => S, opts: TweenOptions = {}): Action {
    return sampledState<S, Sh>(this.host, stateAt, { ...opts, views: [this] }, 'view.tween()');
  }

  /**
   * @internal The picture of `state` (with what the scene shows now), placed where a sync or rebuild would
   * put it now, without taking it: what an authored transition morphs into, so it ends where the
   * View will finish.
   */
  placed(state: S, shown: Sh = this.host.shown): M {
    return this.measure(fresh(paintedFor(this.host, this.draw(state, shown)), this.current)).picture;
  }

  /** Rebuild now, without animating: for a View not on screen yet (on screen it would jump). */
  rebuild(): this {
    const { picture, fit } = this.measure(fresh(this.build(), this.current));
    this.swap(picture);
    this.commit(fit);
    return this;
  }

  /**
   * @internal Where a freshly built picture goes, without changing the View: `next` scaled and moved
   * to where the current picture is (same anchor point, and the scale the View has been given
   * since the last build; uniform scale only, a rotation is not carried), and the fit the View
   * records once it takes the picture (see commit).
   */
  measure(next: M, fit = this.placement()): { picture: M; fit: ViewPlacement } {
    if (this.place && fit.at) {
      let now = anchorOf(layoutBox(next), this.place);
      if (now && fit.scale !== 1) {
        next.scale(fit.scale, { aboutPoint: now });
        now = anchorOf(layoutBox(next), this.place);
      }
      if (now) next.shift([fit.at[0] - now[0], fit.at[1] - now[1]]);
    }
    return { picture: next, fit };
  }

  /** @internal Capture at a sync or tween's turn, before its first draw changes the picture. */
  placement(): ViewPlacement {
    if (!this.place) return this.adopted;
    const box = layoutBox(this.current);
    if (!box) return this.adopted;
    const change = this.placedBox ? scaleBetween(this.placedBox, box) : 1;
    const scale = this.adopted.scale;
    return { at: anchorOf(box, this.place), scale: Math.abs(change - 1) > 1e-6 ? scale * change : scale };
  }

  /** @internal Record the placement and the actual dimensions of the picture just adopted. */
  commit(fit: ViewPlacement): void {
    this.adopted = fit;
    if (this.place) this.placedBox = layoutBox(this.current);
  }

  /** @internal Make `next` the picture, in the old one's place among the children. */
  swap(next: M): void {
    const old = this.current;
    if (old === next) return;
    this.remove(...this.children);
    this.add(next);
  }
}

/**
 * An action of one beat, `runTime` long, whose animation `make` makes when the beat's turn comes:
 * what view.sync(), view.tween(), tweenState(), machine.send() and machine.sendSequence() return.
 */
export function turnAction(scene: Scene, name: string, runTime: number, make: () => ScheduledAnimation, targets?: readonly Mobject[]): Action {
  return action(scene, name, () => ({ value: undefined, beats: [{ runTime, targets, play: () => [make()] }] }));
}

/**
 * @internal The animation a sync() action plays. Everything is decided as it begins: build(),
 * placing, the matcher and its endpoints, the morph it runs inside it (see Enclosing). Each frame
 * is the morph's pure function of alpha, which this sync's own rate function eases; its finish
 * finishes the morph and swaps the built picture in, so the View holds exactly what build() made
 * (its `text` too).
 */
export class ViewSync<M extends Mobject = Mobject> extends Enclosing {
  view: View<M, any, any>;
  match: Match;
  staged: boolean;
  how: 'morph' | 'fade';
  /** @internal Set as it begins: the morph from the current picture to the built one, or null when points and paint agree. */
  inner!: Animation | null;
  /** The new picture, including data a morph cannot interpolate. */
  private next!: M;
  /** The unmoving picture's original data, retained if an easing curve leaves the endpoint again. */
  private beforeStill: M | null = null;
  private stillAtEnd = false;
  /** Set by begin(): the built picture's fit, which the View records only once it takes the picture. */
  private fit!: ViewPlacement;

  constructor(v: View<M, any, any>, { match = 'key', staged = true, how = 'morph', ...opts }: SyncOptions = {}) {
    super(v, opts);
    if (how !== 'morph' && how !== 'fade') throw new RangeError("view.sync(): how must be 'morph' or 'fade'");
    this.view = v; this.match = match; this.staged = staged; this.how = how;
  }

  protected override enclose(): Animation | null {
    const v = this.view, old = v.current;
    const { picture: next, fit } = v.measure(fresh(v.build(), old));
    this.fit = fit;
    this.inner = null; this.next = next; this.beforeStill = null; this.stillAtEnd = false;
    if (samePicture(old, next)) return null;
    if (this.how === 'fade') return this.inner = new PictureFade(v, old, next);
    const match = this.match;
    if (match === 'key' && !keyed(old) && !keyed(next)) throw new Error(`view.sync(): ${v.key !== undefined ? `the view ${JSON.stringify(v.key)}'s` : 'the'} pictures carry no keys below their roots, so key matching pairs nothing; give the draw's parts keys (a card's or panel's \`key\` option, or \`keyed(part, '…')\`), or pass { match: 'text' }, 'shapes' or 'index'`);
    // replace: false everywhere: the View, not the scene, takes the new picture (see finish). The
    // morph's own time is linear: this sync's rate function eases it.
    const staged = this.staged, rateFunc = linear;
    const transformMatch: Match = match === 'key' ? { by: 'key', text: 'whole' } : match;
    const inner = match === 'index' ? knownTransform(old, next, { same: old.sameShapeAs(next, true) }, { rateFunc })
      : new Transform(old, next, { match: transformMatch, replace: false, staged, rateFunc });
    inner.lagRatio = this.lagRatio;
    this.inner = inner;
    return inner;
  }

  // Equal points and paint need no morph. The new draw can still carry a different
  // key, clip or meaning. Retain the child and adopt the whole picture at the endpoint.
  private sampleStill(alpha: number): void {
    const atEnd = alpha === 1;
    if (this.inner || this.stillAtEnd === atEnd) return;
    const current = this.view.current;
    this.beforeStill ??= current.copy();
    adoptState(current, atEnd ? this.next : this.beforeStill);
    this.stillAtEnd = atEnd;
  }

  protected override doInterpolate(alpha: number): void {
    super.doInterpolate(alpha);
    this.sampleStill(alpha);
  }

  protected override doFinish(end: number = this.rateFunc(1)): void {
    // The morph ends where this sync's last frame drew it, and ends finished, as one the scene began would.
    super.doFinish(end);
    this.sampleStill(end);
    this.beforeStill = null;
    // Finished on the new picture: hand over to it (a matching transform leaves faded
    // parts inside the old one, a Transform leaves it aligned). A rate function that
    // comes back leaves the old picture: the View did not sync.
    if (end === 1) {
      if (this.inner) this.view.swap(this.next);
      this.view.commit(this.fit);
    }
  }

  /** What the matching transform paired, once begun; null for 'index' or when nothing changed. */
  summary(): MatchSummary | null { return this.inner instanceof Transform ? this.inner.summary() : null; }

  /** The morph's evidence (`match` counts), with the View's key as `view` when it has one; none for 'index' or no change. */
  override evidence(): Evidence | null {
    const e = this.inner?.evidence() ?? null;
    return e && this.view.key !== undefined ? { ...e, view: this.view.key } : e;
  }
}

/** Fade each drawable family member by the same envelope, preserving its original dimming. */
class PictureFade extends BaseAnimation {
  private readonly opacity: [Mobject, number][][];
  private readonly view: View;
  private readonly next: Mobject;
  constructor(view: View, old: Mobject, next: Mobject) {
    super(view, { rateFunc: linear });
    this.view = view; this.next = next;
    this.opacity = [old, next].map(root => root.family().map(member => [member, member.style.opacity ?? 1]));
  }
  protected override doBegin(): void { this.view.add(this.next); this.doInterpolate(0); }
  protected override doInterpolate(t: number): void {
    for (const [i, family] of this.opacity.entries()) for (const [member, alpha] of family)
      member.setStyle({ opacity: alpha * Math.max(0, i ? 2 * t - 1 : 1 - 2 * t) }, false);
  }
  protected override doFinish(end = 1): void {
    this.doInterpolate(end);
    if (end !== 1) {
      this.view.remove(this.next);
      for (const family of this.opacity) for (const [member, alpha] of family) member.setStyle({opacity: alpha}, false);
    }
  }
}

/**
 * A sampled model and its dependent views: one Follow draws every view over t from 0 to 1,
 * writing the pictures on screen when it begins. A preceding sync can swap in a new picture;
 * the tween takes that one. The shared model target also reserves the nonvisual write.
 */
class StateTween<S extends object, Sh extends object> extends Enclosing {
  private readonly views: readonly View<Mobject, S, Sh>[];
  private readonly host: SceneInputs<S, Sh>;
  private readonly draw: (t: number) => readonly Mobject[];
  /** Fixed before the first sample, so a frame never derives its placement from a preceding frame. */
  private placements!: ViewPlacement[];
  /** Set as it begins: the Follow that writes the picture on screen then, which it runs inside it (see Enclosing). */
  private follow: Follow | null = null;

  constructor(host: SceneInputs<S, Sh>, views: readonly View<Mobject, S, Sh>[], stateAt: (t: number) => S, opts: TweenOptions, call: string) {
    super(views[0]!.current, opts);
    this.host = host;
    this.views = views;
    this.draw = (t) => {
      host.state = cloneJson(stateAt(t), call, 'stateAt(t)') as SceneInputs<S, Sh>['state'];
      return views.map((v, i) => v.measure(fresh(paintedFor(host, v.draw(host.state, host.shown)), v.current), this.placements[i]!).picture);
    };
  }

  // Record what Follow actually adopted so a later sync or tween can see an external change of scale.
  private commitFits(): void { this.placements.forEach((fit, i) => this.views[i]!.commit(fit)); }
  protected override doBegin(): void { super.doBegin(); this.commitFits(); }
  protected override doInterpolate(alpha: number): void { super.doInterpolate(alpha); this.commitFits(); }
  protected override doFinish(alpha: number = this.rateFunc(1)): void { super.doFinish(alpha); this.commitFits(); }

  /** The picture on screen now: what this writes once it begins. */
  override targets(): Mobject[] { return [stateTarget(this.host), ...(this.follow?.targets() ?? this.views.map((v) => v.current))]; }

  /** The Follow's own time is linear: this tween's rate function eases it. */
  protected override enclose(): Follow {
    const targets = this.views.map((v) => v.current), members = targets.flatMap((m) => m.family());
    if (new Set(members).size !== members.length) throw new Error('tweenState(): views overlap; list independent views, not a view and one inside it');
    this.placements = this.views.map(v => v.placement());
    this.mobject = targets[0]!;
    return (this.follow = new Follow({ from: 0, to: 1, draw: this.draw }, { targets, rateFunc: linear }));
  }

  override evidence(): Evidence | null { return this.follow?.evidence() ?? null; }
}

/**
 * Sample the scene's model once at each eased time, then redraw every listed view from that state.
 * `stateAt(t)` must depend only on t, return JSON, and preserve each view's family shape. The
 * action reserves the scene's state: a simultaneous model writer is refused before it begins.
 * Like view.tween(), this is seekable and single-use; a preceding sync's new picture is used.
 */
export function tweenState<S extends object, Sh extends object>(
  scene: SceneInputs<S, Sh>, stateAt: (t: number) => NoInfer<S>, options: TweenStateOptions<NoInfer<S>, NoInfer<Sh>>,
): Action {
  return sampledState(scene, stateAt, options, 'tweenState()');
}

function sampledState<S extends object, Sh extends object>(
  scene: SceneInputs<S, Sh>, stateAt: (t: number) => S, { views, runTime = 1, rateFunc }: TweenStateOptions<S, Sh>, call: string,
): Action {
  if (!views.length) throw new RangeError(`${call}: it needs the views to redraw, views: [a, b, ...]`);
  if (new Set(views).size !== views.length) throw new Error(`${call}: a view is listed twice; list each view once`);
  for (const v of views) if (!(v instanceof View) || !v.belongsTo(scene))
    throw new Error(`${call}: every view must read this scene's model; make it with view(scene, draw)`);
  const selected = [...views], opts = rateFunc ? { runTime, rateFunc } : { runTime };
  return turnAction(scene, call, runTime, () => new StateTween(scene, selected, stateAt, opts, call), [stateTarget(scene)]);
}

/** `m`, its parts given `scene`'s colours where they still hold a default. */
function paintedFor<M extends Mobject>(scene: Scene, m: M): M {
  // A stand-in for a scene (a test's `{ state, shown }`) has no colours: its parts take them when they enter one.
  if (scene.colors && m instanceof Mobject) paintDefaults(m, scene.colors);
  return m;
}

/** Whether `m` is a View, for a tool that finds the views on a stage (View is exported as a type only). */
export const isView = (m: Mobject): m is View => m instanceof View;

/**
 * A View of the scene's model: `draw(scene.state, scene.shown)` at each sync, its arguments typed
 * from the scene (`SceneInputs<S, Sh>`). Keeps `draw`, so the picture can be checked against a trace
 * (see viewMismatch) and redrawn for any state a Machine reaches. Most draws read only the model.
 */
export function view<S extends object, Sh extends object, M extends Mobject>(
  scene: SceneInputs<S, Sh>, draw: (state: S, shown: Sh, context: DrawContext) => M, opts: ViewOptions & { drawing: DrawContext },
): View<M, S, Sh>;
export function view<S extends object, Sh extends object, M extends Mobject>(
  scene: SceneInputs<S, Sh>, draw: (state: S, shown: Sh) => M, opts?: ViewOptions,
): View<M, S, Sh>;
export function view<S extends object, Sh extends object, M extends Mobject>(
  scene: SceneInputs<S, Sh>, draw: (state: S, shown: Sh, context: DrawContext) => M, opts?: ViewOptions,
): View<M, S, Sh> {
  if (!opts?.drawing) return new View(scene, draw as (st: S, sh: Sh) => M, opts);
  // A structurally supplied context can be a mutable object. Snapshot its drawing inputs once.
  const context = drawContext(opts.drawing);
  return new View(scene, (st: S, sh: Sh) => draw(st, sh, context), { ...opts, drawing: context });
}

/**
 * The members of a state type that hold every one of `K`, with those parts required: a union's
 * members without them are dropped, and optional parts become present. What `having` narrows to.
 */
export type Having<S, K extends PropertyKey> =
  S extends unknown ? ([K] extends [keyof S] ? S & { [P in K]-?: Exclude<S[P & keyof S], undefined> } : never) : never;

/**
 * `state` narrowed to the shape that holds `keys`, or a TypeError when it lacks one: for a draw of one
 * chapter of a scene whose state changes shape by chapter (a union of shapes), or of an optional part
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
 * Compare the View's text with what draw() produces from its state input and
 * the authored shown fields. Returns null on a match or describes the difference.
 */
export function viewMismatch<Sh extends object = SceneState>(
  v: View, state: SceneState, { shown = {}, draw = v.draw }: { shown?: Sh | SceneState; draw?: (state: SceneState, shown: Sh | SceneState) => Mobject } = {},
): string | null {
  const texts = v.texts, want = pictureText(draw(state, shown));
  return JSON.stringify(texts) === JSON.stringify(want) ? null : `the view shows ${JSON.stringify(texts)}, the state ${JSON.stringify(state)} draws ${JSON.stringify(want)}`;
}

// ---- internals ---------------------------------------------------------

/** draw() must make a new picture each time: the old one is what morphs into it. */
function fresh<M extends Mobject>(m: M, old: Mobject | null): M {
  if (m === old || m.parent) throw new Error(`view(): draw() returned ${mobjectName(m)}, which is ${m === old ? 'the picture on screen' : 'inside another mobject'}; draw a new one each time`);
  return m;
}

/** Whether any part below `m` carries a key: what matching by key pairs by (the root's own key is not read). */
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

/** Uniform scale since adoption. Height decides when text grows wider; a flat path uses its width. */
function scaleBetween(before: Box, after: Box): number {
  const w = before[2] - before[0], h = before[3] - before[1];
  const width = after[2] - after[0], height = after[3] - after[1];
  const byWidth = w && width ? width / w : null;
  const byHeight = h && height ? height / h : null;
  if (byWidth === null) return byHeight ?? 1;
  if (byHeight === null) return byWidth;

  // Translated Float32 coordinates can leave a thin bar only a few ulps tall. If both dimensions
  // agree to their rounding precision, use the better-resolved measurement of the uniform scale.
  const x = Math.max(Math.abs(after[0]), Math.abs(after[2])) + byWidth * Math.max(Math.abs(before[0]), Math.abs(before[2]));
  const y = Math.max(Math.abs(after[1]), Math.abs(after[3])) + byWidth * Math.max(Math.abs(before[1]), Math.abs(before[3]));
  if (x / w < y / h && Math.abs(height - byWidth * h) <= 2 ** -22 * y) return byWidth;
  return byHeight;
}

function anchorOf(b: Box | null, place: ViewPlace): Vec | null {
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
