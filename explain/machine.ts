// Machines: a model driven by events, as a schedule. Each event is a SetState to the state
// the model computes, then a staged keyed sync of each view drawn from that state, or an authored
// transition that ends on those pictures. A machine is therefore an ordinary Succession: it seeks, traces
// and records like any other play, and the same `next` and views a reader would drive
// can be explored state by state by `rayner check`. See docs/MACHINES.md.

import { Animation, AnimationGroup, MadeAtTurn, Succession, matchByKey } from '../src/animation.ts';
import { SetState } from './state.ts';
import { canonicalJson } from '../src/json.ts';
import { identifierRule, isIdentifier } from './settings.ts';
import { Group } from '../src/mobject.ts';
import { linear } from '../src/rate.ts';
import type { Scene } from '../src/scene.ts';
import { turnAction, ViewSync } from './view.ts';
import type { View, ViewMatch } from './view.ts';
import type { Action } from './action.ts';
import type { Mobject } from '../src/mobject.ts';
import { choreograph } from './choreograph.ts';
import type { Choreography } from './choreograph.ts';
import type { SceneState } from '../src/scene.ts';
import type { ScheduledAnimation } from '../src/animation.ts';

export interface MachineSpec<S extends object, E extends string> {
  /** Where the machine starts: what `reachable()` explores from. The scene need not be in it yet. */
  start: S;
  /** Every event the machine accepts, in order: what a reader's buttons would be. */
  events: readonly E[];
  /** How the player's button names an event, where the event's own name would not read well (default: the event). */
  labels?: Partial<Record<E, string>>;
  /**
   * The model's step: pure, from the model module, and it returns a new state, or a refusal when
   * the state refuses the event: `refuse(reason)`, the reason in the reader's words, or `undefined`
   * for a refusal with no reason (a reader's button for it is disabled and says why, and
   * exploration does not follow it). One function says what an event does and, where it is
   * refused, why, so the buttons, their reasons and the model cannot disagree.
   */
  next: (state: S, event: E) => S | Refusal | undefined;
  /**
   * Where the explainer's story stops though the model would go on: the reason, in the reader's
   * words, when `event` from `state` is beyond the story (the client sends ten requests), else
   * undefined. Exploration does not follow it, and the player says the story ends there, not that
   * the model refuses. A bound only bounds: `rayner check` fails one on an event the model refuses
   * anyway, which is a refusal.
   */
  bound?: (state: S, event: E) => string | undefined;
  /**
   * Where the story ends: the reason, in the reader's words, when `state` is a finished one (the
   * tower is on C), else undefined. From a finished state every event the model would take is
   * beyond the story, with this reason, and every event it refuses stays a refusal with its own;
   * so a live step that ends finished starts the reader's events from `start`. It is `bound` for
   * the common case, without restating the model's refusals.
   */
  end?: (state: S) => string | undefined;
  /**
   * Authored motion for an event, built when its turn comes from the states before and after it
   * and the pictures it must end on, and played over the machine's `runTime`. When it ends, the
   * views take the pictures of `after`; `rayner check` plays every reachable transition and fails
   * one that does not end on them, or breaks an invariant on the way.
   */
  transition?: Partial<Record<E, (t: Transition<S, E>) => Animation | AnimationGroup>>;
  /** Pictures of the scene's state, made with view(scene, draw), synced after each event. */
  views: readonly View<Mobject, S>[];
  /**
   * How the views morph when an event has no authored transition (default
   * `matchByKey({ text: 'whole' })`: keyed parts keep their identity, and a keyed Text whose words
   * change is replaced, not morphed glyph by glyph). The morph is staged: parts that go fade out
   * over the first half, parts that come fade in over the second, and parts both pictures have
   * morph throughout, so a word and the word replacing it never overlap.
   */
  match?: ViewMatch;
  /** Each event's morph or transition, in seconds (default 0.6), or a function of the event and the states either side. */
  runTime?: number | ((t: { event: E; before: S; after: S }) => number);
  /** The most states `rayner check` explores (default 256); a larger machine is sampled breadth first up to it. */
  limit?: number;
}

/**
 * What an authored transition is built from: the event, the states either side, and for each of
 * the machine's views, by the view itself, the picture it must end on (`target`) and a
 * choreography from its current picture to that one (`choreograph`). End each view on its target
 * and taking the pictures of the state moves nothing.
 */
export interface Transition<S, E> {
  event: E;
  before: S;
  after: S;
  /** `view`'s picture of `after`, placed where the view will land. Throws for a view the machine does not have. */
  target(view: View): Mobject;
  /** `choreograph(view.current, target(view))`: the view's parts, from what it shows now to its target. */
  choreograph(view: View): Choreography;
}

/** What one event does from a state: the next state, a refusal by the model (with its reason, if given), or the story's bound. */
export type Outcome<S> = { next: S } | { refused: string | null } | { beyond: string };

/** Marks a refusal however many copies of the library are loaded (a model module and a scene may reach different ones). */
const REFUSAL = Symbol.for('rayner.refusal');

/**
 * What a model's `next` returns where the state refuses an event, with the reason in the reader's
 * words: `refuse('the ring is empty, so there is nothing to pop')`. Made by `refuse`.
 */
export class Refusal {
  /** Why the model refuses the event, in the reader's words: what the player says of its button. */
  readonly reason: string;
  constructor(reason: string) {
    if (!reason.trim()) throw new RangeError('refuse(): the reason must be words; return undefined from next for a refusal with no reason');
    this.reason = reason;
    Object.defineProperty(this, REFUSAL, { value: true });
    Object.freeze(this);
  }
}

/**
 * A model's refusal of an event, with its reason in the reader's words: return it from `next`
 * where the state refuses the event. The player says the reason on the event's disabled button,
 * and `outcome` gives it as `{ refused: reason }`.
 */
export function refuse(reason: string): Refusal { return new Refusal(reason); }

/** Whether a value `next` returned is a refusal: `refuse(reason)`, from this copy of the library or another. */
export function isRefusal(value: unknown): value is Refusal {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[REFUSAL] === true;
}

/**
 * A machine's spec as it keeps it: its defaults filled in, frozen, its lists and records its own
 * frozen copies, and its `start` a fresh copy at every read, so nothing changes the model after the
 * machine's identity and exploration are computed from it.
 */
type MachineModel<S extends object, E extends string> = Readonly<Required<Pick<MachineSpec<S, E>, 'match' | 'runTime' | 'limit'>> & MachineSpec<S, E>>;

/** A model driven by events on one scene, typed by the scene's model type `S`. */
export class Machine<S extends object, E extends string> {
  private readonly scene: Scene<S, any>;
  /** The spec the machine was made with, its defaults filled in. Frozen; its `start` is a fresh copy at every read. */
  readonly spec: MachineModel<S, E>;
  /** What the scene showed (`scene.shown`, as JSON) when the machine last played; exploration redraws under it. */
  private shownWhenPlayed: string | null = null;
  /** The step this machine last played in; exploration checks it on that step's stage. */
  private playedInStep: string | null = null;

  constructor(scene: Scene<S, any>, spec: MachineSpec<S, E>) {
    // The spec's shape is its type's to check; what a type cannot say is checked here.
    if (!spec.events.length) throw new RangeError('new Machine(): it needs at least one event');
    for (const event of spec.events)
      if (!isIdentifier('event', event)) throw new RangeError(`new Machine(): ${JSON.stringify(event)} is not an event name; an event is ${identifierRule('event')}`);
    if (new Set(spec.events).size !== spec.events.length) throw new Error('new Machine(): an event is listed twice; list each event once');
    for (const [event, label] of Object.entries<string | undefined>(spec.labels ?? {}))
      if (!label?.trim()) throw new RangeError(`new Machine(): the label of ${JSON.stringify(event)} must be words`);
    // Exploration redraws any reachable state after the run, which needs each picture to be a function
    // of the scene's state alone. Every View is (view(scene, draw)), so there is nothing to refuse.
    this.scene = scene;
    this.spec = settle(spec);
    machinesOf(scene).push(this as unknown as Machine<object, string>);
  }

  /**
   * @internal What the scene showed when this machine last played (`scene.shown`), or null before it played.
   * A machine never changes what is shown; a guided tour may change it between events. Exploration
   * draws every reachable state under the last, and the live player explores under it too.
   */
  get playedUnder(): SceneState | null { return this.shownWhenPlayed === null ? null : JSON.parse(this.shownWhenPlayed) as SceneState; }

  /**
   * @internal The step (its path) this machine last played in, or null before it played. Exploration runs
   * the scene again to that step's resting picture and checks every reachable state there, on the
   * stage the reader saw the machine on, not on whatever the run ends with.
   */
  get lastPlayedIn(): string | null { return this.playedInStep; }

  /**
   * @internal What identifies this machine across runs of its scene, beside its place in
   * `machinesOf(scene)`: its events, its start and its views' keys, as canonical JSON. Two
   * machines with the same events in another order, or another start, are different machines.
   */
  get identity(): string {
    return canonicalJson({ events: this.spec.events, start: this.spec.start, views: this.spec.views.map((v) => v.key ?? null) });
  }

  /**
   * @internal What `event` does from `state`: the next state; or, refused by the model, its reason (what
   * `refuse` was given, or null for `undefined`); or beyond the story, the bound's reason, or `end`'s
   * where the state is finished and the model would take the event. The bound is asked first, so
   * `next` is never asked for a state the story does not reach.
   */
  outcome(state: S, event: E): Outcome<S> {
    if (!this.spec.events.includes(event)) throw new RangeError(`machine.send(): this machine takes ${this.spec.events.join(', ')}, not ${String(event)}`);
    const beyond = this.spec.bound?.(state, event);
    if (beyond !== undefined) return { beyond };
    const model = this.model(state, event);
    const ended = 'next' in model ? this.spec.end?.(state) : undefined;
    return ended === undefined ? model : { beyond: ended };
  }

  /** @internal What the model alone says of `event` from `state`, the story's bound aside: the next state, or a refusal and its reason. */
  model(state: S, event: E): { next: S } | { refused: string | null } {
    const next = this.spec.next(state, event);
    return next === undefined ? { refused: null } : isRefusal(next) ? { refused: next.reason } : { next };
  }

  /** @internal The state after `event` from `state`, or undefined when the model refuses it or it is beyond the story. */
  after(state: S, event: E): S | undefined {
    const o = this.outcome(state, event);
    return 'next' in o ? o.next : undefined;
  }

  /**
   * @internal The transition for `event` from `before` to `after`, with each view's target placed where it
   * will land now (when the transition is built: its turn in a play, or exploration).
   */
  transitionFor(event: E, before: S, after: S): Transition<S, E> {
    const { views } = this.spec, placed = new Map<View, Mobject>();
    const target = (view: View) => {
      if (!views.includes(view)) throw new RangeError(`machine.send(): the transition for ${String(event)} asked for a view this machine does not have; list it in views`);
      if (!placed.has(view)) placed.set(view, view.placed(after));
      return placed.get(view)!;
    };
    return { event, before, after, target, choreograph: (view) => choreograph(view.current, target(view)) };
  }

  /**
   * One event from `from` (default: the scene's state now), as an action (see Action): await it,
   * or hand it to play(), a Succession or a group. The model's next state is adopted and recorded
   * as `{ kind: 'event', event }`, then the views morph to it, or the event's authored transition
   * plays and the views land on it. It is built for `from`, so it refuses to play from any other
   * state, and a refused event is refused here, before anything plays.
   */
  send(event: E, from: S = this.scene.state): Action {
    const schedule = this.schedule(event, from);
    return turnAction(this.scene, 'machine.send()', schedule.runTime, () => schedule);
  }

  /** What one event plays from `from` (see send): its state change, then the views' morph or the transition and the landing. */
  private schedule(event: E, from: S): Succession {
    const before = JSON.parse(JSON.stringify(from)) as S;
    const o = this.outcome(before, event);
    if ('beyond' in o) throw new RangeError(`machine.send(): ${String(event)} is beyond the story in ${JSON.stringify(before)}: ${o.beyond}`);
    if ('refused' in o) throw new RangeError(`machine.send(): ${String(event)} is refused in ${JSON.stringify(before)}${o.refused ? `: ${o.refused}` : ''}`);
    const after = o.next;
    const { views, match } = this.spec;
    const transition = this.transitionPlay(event, before, after);
    const built = canonicalJson(before);
    return new Succession([
      new SetState(this.scene, (current) => {
        if (canonicalJson(current) !== built) throw new Error(`machine.send(): ${String(event)} was built for ${JSON.stringify(before)} but plays from ${JSON.stringify(current)}; send it when the state it plays from is the state now`);
        this.shownWhenPlayed = JSON.stringify(this.scene.shown);
        this.playedInStep = this.scene.currentStep?.path ?? null;
        return after;
      }, { event }),
      transition
        // The transition's motion, then the views take the pictures of `after`: a sync that moves
        // nothing when the transition ended where the model says (rayner check holds it to that).
        ? new Succession([transition, new TakePictures(this.scene, views)])
        // No authored motion: each view's keyed morph, staged, so what goes is gone before what comes appears.
        : new AnimationGroup(views.map((v) => new ViewSync(v, { match, runTime: this.runTimeOf(event, before, after) }))),
    ]);
  }

  /** The run time of `event` from `before` to `after`: the spec's, or what its function gives. */
  private runTimeOf(event: E, before: S, after: S): number {
    return typeof this.spec.runTime === 'function' ? this.spec.runTime({ event, before, after }) : this.spec.runTime;
  }

  /**
   * @internal The authored transition for `event` from `before` to `after` as `send` plays it, without
   * the event's state change before it or the views taking the pictures after it: made from the pictures on screen
   * when its turn comes in a play, over the event's run time. Null when the event has no authored
   * transition. `rayner check` plays each one this way, in a play of the explored scene.
   */
  transitionPlay(event: E, before: S, after: S): ScheduledAnimation | null {
    const authored = this.spec.transition?.[event];
    if (!authored) return null;
    return new WhenItsTurnComes(String(event), () => authored(this.transitionFor(event, before, after)), this.spec.views, this.runTimeOf(event, before, after));
  }

  /** Events in turn, each from where the last left the state (default start: the scene's state now), as one action. */
  replay(events: readonly E[], from: S = this.scene.state): Action {
    let at = from;
    const schedule = new Succession(events.map((e) => {
      const step = this.schedule(e, at);
      at = this.after(at, e)!;
      return step;
    }));
    return turnAction(this.scene, 'machine.replay()', schedule.runTime, () => schedule);
  }

  /**
   * @internal Every state reachable from `from` (default: the start), breadth first, with the shortest
   * events that reach it (so a state that fails a check is reported by its shortest way there),
   * up to `limit` states. States are compared as JSON, whatever the order of their keys.
   */
  reachable(from: S = this.spec.start): { state: S; path: E[] }[] {
    const start = from;
    const seen = new Map<string, { state: S; path: E[] }>([[canonicalJson(start), { state: start, path: [] }]]);
    const queue = [...seen.values()];
    while (queue.length && seen.size < this.spec.limit) {
      const { state, path } = queue.shift()!;
      for (const event of this.spec.events) {
        const next = this.after(state, event);
        if (next === undefined) continue;
        const key = canonicalJson(next);
        if (seen.has(key)) continue;
        const entry = { state: next, path: [...path, event] };
        seen.set(key, entry);
        queue.push(entry);
        if (seen.size >= this.spec.limit) break;
      }
    }
    return [...seen.values()];
  }
}

/**
 * `spec` with its defaults, kept apart from the caller's object: a frozen copy whose events, views,
 * labels and transitions are frozen copies too, and whose `start` is copied at construction and again
 * at every read, so neither the caller nor a reader can change what the machine explores.
 */
function settle<S extends object, E extends string>(spec: MachineSpec<S, E>): MachineModel<S, E> {
  const start = structuredClone(spec.start);
  const kept = { match: matchByKey({ text: 'whole' }), runTime: 0.6, limit: 256, ...spec };
  return Object.freeze(Object.defineProperties(kept, {
    start: { get: () => structuredClone(start), enumerable: true },
    events: { value: Object.freeze([...spec.events]), enumerable: true },
    views: { value: Object.freeze([...spec.views]), enumerable: true },
    ...(spec.labels ? { labels: { value: Object.freeze({ ...spec.labels }), enumerable: true } } : {}),
    ...(spec.transition ? { transition: { value: Object.freeze({ ...spec.transition }), enumerable: true } } : {}),
  }));
}

/**
 * The transition, made when its turn comes from the pictures on screen then: a transition in a
 * replay starts from the pictures the event before it landed on, which do not exist when the
 * replay is built. Before it begins it declares the views as what it writes. What it makes may
 * wait for what it reads (`s.show` of a diagram not laid out yet, `d.morph`): the play waits for
 * that before its next frame. It plays over `runTime`, with the made animation's own easing.
 */
class WhenItsTurnComes extends MadeAtTurn {
  readonly #make: () => Animation | AnimationGroup;
  constructor(event: string, make: () => Animation | AnimationGroup, declared: readonly Mobject[], runTime: number) {
    super(`machine.send(${JSON.stringify(event)})`, 'the transition', runTime, declared);
    this.#make = make;
  }
  protected override make(): ScheduledAnimation[] {
    return [this.#make()];
  }
}

/**
 * The views take the pictures of the state reached, with no motion: an authored transition already
 * brought what is on screen there (rayner check holds it to that). Each keyed part takes its drawn
 * counterpart's data in place (a morphed Text gets its new string) and the parts go back into the
 * drawn picture's stacking order, so every part keeps its identity for the next event. A picture
 * whose parts do not line up by key (one unkeyed, or a key two siblings share) is swapped for the
 * drawn one instead. It lasts one of the scene's frames.
 */
class TakePictures extends Animation {
  views: readonly View[];
  scene: Scene<any>;
  constructor(scene: Scene<any>, views: readonly View[]) {
    super(views[0] ?? new Group(), { runTime: 1 / scene.fps, rateFunc: linear });
    this.scene = scene; this.views = views;
  }
  protected override doBegin(): void {}
  protected override doInterpolate(): void {}
  protected override doFinish(): void {
    for (const v of this.views) {
      const drawn = v.placed(this.scene.state), current = v.current;
      const byKey = new Map(current.children.map((c) => [c.key, c] as const));
      // Parts line up when every key names one part on each side: a key two siblings share names neither.
      const lines = byKey.size === current.children.length && new Set(drawn.children.map((d) => d.key)).size === drawn.children.length &&
        drawn.children.length === current.children.length && drawn.children.every((d) => d.key !== undefined && byKey.get(d.key)?.sameShapeAs(d));
      if (!lines) { v.rebuild(); continue; }
      // Kept parts in the drawn order, then the whole picture takes the drawing: the parts keep
      // their identities, and the root takes its own fields too (a card's lit row, a code
      // panel's focus, what it says it emphasises), not just its children's.
      current.add(...drawn.children.map((d) => byKey.get(d.key)!));
      current.invalidateBox();
      if (current.sameShapeAs(drawn)) current.become(drawn);
      else { for (const d of drawn.children) byKey.get(d.key)!.become(d); current.invalidateBox(); }
    }
  }

  override targets(): Mobject[] { return [...this.views]; }
}

const registry = new WeakMap<object, Machine<object, string>[]>();
/** The machines a scene made, in order: what `rayner check` explores after a run. */
export function machinesOf(scene: Scene<any>): Machine<object, string>[] {
  let list = registry.get(scene);
  if (!list) registry.set(scene, (list = []));
  return list;
}
