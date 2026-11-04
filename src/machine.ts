// Machines: a model driven by events, as a schedule. Each event is a SetState to the state
// the model computes, then a keyed sync of each view drawn from that state, or an authored
// transition that ends on those pictures. A machine is therefore an ordinary Succession: it seeks, traces
// and records like any other play, and the same `next` and views a reader would drive
// can be explored state by state by `rayner check`. See docs/MACHINES.md.

import { Animation, AnimationGroup, SetState, Succession } from './animation.ts';
import { Group } from './mobject.ts';
import { linear } from './rate.ts';
import type { Scene } from './scene.ts';
import type { View, ViewMatch } from './view.ts';
import type { Mobject } from './mobject.ts';
import { choreograph } from './choreograph.ts';
import type { Choreography } from './choreograph.ts';
import type { Evidence, SceneState } from './scene.ts';

export interface MachineSpec<S extends object, E extends string> {
  /** Where the machine starts: what `reachable()` explores from. The scene need not be in it yet. */
  start: S;
  /** Every event the machine accepts, in order: what a reader's buttons would be. */
  events: readonly E[];
  /**
   * The model's step: pure, from the model module, and it returns a new state, or `undefined`
   * when the state refuses the event (a reader's button for it is disabled, and exploration does
   * not follow it). One function says both, so the buttons and the model cannot disagree.
   */
  next: (state: S, event: E) => S | undefined;
  /** Why the model refuses `event` in `state`, in the reader's words: what the player says of a disabled button. */
  why?: (state: S, event: E) => string;
  /**
   * Where the explainer's story stops though the model would go on: the reason, in the reader's
   * words, when `event` from `state` is beyond the story (the client sends ten requests), else
   * undefined. Exploration does not follow it, and the player says the story ends there, not that
   * the model refuses. A bound only bounds: `rayner check` fails one on an event the model refuses
   * anyway, which is a refusal.
   */
  bound?: (state: S, event: E) => string | undefined;
  /**
   * Authored motion for an event, built when its turn comes from the states before and after it
   * and the pictures it must end on, and played over the machine's `runTime`. When it ends, the
   * views take the pictures of `after`; `rayner check` plays every reachable transition and fails
   * one that does not end on them, or breaks an invariant on the way.
   */
  transition?: Partial<Record<E, (t: Transition<S, E>) => Animation | AnimationGroup>>;
  /** Pictures of the scene's state, made with view(scene, draw), synced after each event. */
  views: readonly View[];
  /** How the views morph (default 'key': keyed parts keep their identity). */
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
 * and the landing moves nothing.
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

/** A model driven by events on one scene. */
export class Machine<S extends object, E extends string> {
  readonly scene: Scene<S>;
  readonly spec: Required<Pick<MachineSpec<S, E>, 'match' | 'runTime' | 'limit'>> & MachineSpec<S, E>;
  /** What the scene showed (`scene.shown`, as JSON) when the machine played; exploration redraws under it. */
  private shownWhenPlayed: string | null = null;
  /** The step this machine last played in; exploration checks it on that step's stage. */
  private playedInStep: string | null = null;

  constructor(scene: Scene<any>, spec: MachineSpec<S, E>) {
    if (!spec.events.length) throw new TypeError('A machine needs at least one event');
    if (new Set(spec.events).size !== spec.events.length) throw new TypeError('A machine\'s events must be distinct');
    if (typeof spec.next !== 'function') throw new TypeError('A machine needs next(state, event)');
    // Exploration redraws any reachable state after the run, which needs each picture to be a function
    // of the scene's state alone. Every View is (view(scene, draw)), so there is nothing to refuse.
    this.scene = scene;
    this.spec = { match: 'key', runTime: 0.6, limit: 256, ...spec };
    machinesOf(scene).push(this as unknown as Machine<object, string>);
  }

  /**
   * What the scene showed while this machine played (`scene.shown`), or null before it played. A
   * machine never changes what is shown, and plays under one: exploration draws every reachable
   * state under it, as the reader would have seen it.
   */
  get playedUnder(): SceneState | null { return this.shownWhenPlayed === null ? null : JSON.parse(this.shownWhenPlayed) as SceneState; }

  /**
   * The step (its path) this machine last played in, or null before it played. Exploration runs
   * the scene again to that step's resting picture and checks every reachable state there, on the
   * stage the reader saw the machine on, not on whatever the run ends with.
   */
  get lastPlayedIn(): string | null { return this.playedInStep; }

  /**
   * What `event` does from `state`: the next state; or, refused by the model, its reason (`why`,
   * or null); or beyond the story, the bound's reason. The bound is asked first, so `next` is never
   * asked for a state the story does not reach.
   */
  outcome(state: S, event: E): Outcome<S> {
    if (!this.spec.events.includes(event)) throw new RangeError(`This machine accepts ${this.spec.events.join(', ')}, not ${String(event)}`);
    const beyond = this.spec.bound?.(state, event);
    if (beyond !== undefined) return { beyond };
    const next = this.spec.next(state, event);
    return next === undefined ? { refused: this.spec.why?.(state, event) ?? null } : { next };
  }

  /** The state after `event` from `state`, or undefined when the model refuses it or it is beyond the story. */
  after(state: S, event: E): S | undefined {
    const o = this.outcome(state, event);
    return 'next' in o ? o.next : undefined;
  }

  /**
   * The transition for `event` from `before` to `after`, with each view's target placed where it
   * will land now (when the transition is built: its turn in a play, or exploration).
   */
  transitionFor(event: E, before: S, after: S): Transition<S, E> {
    const { views } = this.spec, placed = new Map<View, Mobject>();
    const target = (view: View) => {
      if (!views.includes(view)) throw new RangeError(`${String(event)}: the transition asked for a view this machine does not have`);
      if (!placed.has(view)) placed.set(view, view.placed(after as SceneState));
      return placed.get(view)!;
    };
    return { event, before, after, target, choreograph: (view) => choreograph(view.current, target(view)) };
  }

  /**
   * One event from `from` (default: the scene's state now): the model's next state is adopted and
   * recorded as `{ kind: 'event', event }`, then the views morph to it, or the event's authored
   * transition plays and the views land on it. The schedule is built for `from`, so it refuses to
   * play from any other state, and a refused event is refused here, before anything plays.
   */
  send(event: E, from: S = this.scene.state as S): Succession {
    const before = JSON.parse(JSON.stringify(from)) as S;
    const o = this.outcome(before, event);
    if ('beyond' in o) throw new RangeError(`${String(event)} is beyond the story in ${JSON.stringify(before)}: ${o.beyond}`);
    if ('refused' in o) throw new RangeError(`${String(event)} is refused in ${JSON.stringify(before)}${o.refused ? `: ${o.refused}` : ''}`);
    const after = o.next;
    const { views, match } = this.spec;
    const runTime = typeof this.spec.runTime === 'function' ? this.spec.runTime({ event, before, after }) : this.spec.runTime;
    const authored = this.spec.transition?.[event];
    const built = JSON.stringify(before);
    return new Succession([
      new SetState<S>(this.scene, (current) => {
        if (JSON.stringify(current) !== built) throw new Error(`${String(event)} was built for ${built} but plays from ${JSON.stringify(current)}`);
        const shown = JSON.stringify(this.scene.shown);
        if (this.shownWhenPlayed !== null && shown !== this.shownWhenPlayed)
          throw new Error(`${String(event)} plays under shown ${shown}, but this machine played under ${this.shownWhenPlayed}; a machine plays under one`);
        this.shownWhenPlayed = shown;
        this.playedInStep = this.scene.currentStep?.path ?? null;
        return after;
      }, { event }),
      authored
        // The transition's motion, then the views take the pictures of `after`: a sync that moves
        // nothing when the transition ended where the model says (rayner check holds it to that).
        ? new Succession([
          new WhenItsTurnComes(this.scene, () => authored(this.transitionFor(event, before, after)), views, runTime),
          new Landing(this.scene, views),
        ])
        : new AnimationGroup(views.map((v) => v.sync({ match, runTime }))),
    ]);
  }

  /** Events in turn, each from where the last left the state (default start: the scene's state now). */
  replay(events: readonly E[], from: S = this.scene.state as S): Succession {
    let at = from;
    return new Succession(events.map((e) => {
      const step = this.send(e, at);
      at = this.after(at, e)!;
      return step;
    }));
  }

  /**
   * Every state reachable from the start, breadth first, with the shortest events that reach
   * it (so a state that fails a check is reported by its shortest way there), up to `limit`
   * states. States are compared as JSON, as traces compare them.
   */
  reachable(): { state: S; path: E[] }[] {
    const start = this.spec.start;
    const seen = new Map<string, { state: S; path: E[] }>([[JSON.stringify(start), { state: start, path: [] }]]);
    const queue = [...seen.values()];
    while (queue.length && seen.size < this.spec.limit) {
      const { state, path } = queue.shift()!;
      for (const event of this.spec.events) {
        const next = this.after(state, event);
        if (next === undefined) continue;
        const key = JSON.stringify(next);
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
 * An animation made when it begins, from the pictures on screen then: a transition in a replay
 * starts from the pictures the event before it landed on, which do not exist when the replay is
 * built. Before it begins it declares the views as what it writes; it plays over `runTime`, with
 * the made animation's own easing.
 */
class WhenItsTurnComes extends Animation {
  make: () => Animation | AnimationGroup;
  declared: Mobject[];
  made: Animation | AnimationGroup | null;
  scene: Scene<any>;
  constructor(scene: Scene<any>, make: () => Animation | AnimationGroup, declared: readonly Mobject[], runTime: number) {
    super(declared[0] ?? new Group(), { runTime, rateFunc: linear });
    this.scene = scene; this.make = make; this.declared = [...declared]; this.made = null;
  }
  // Begun through the scene, as play() begins anything: a Succession in it then cleans up each
  // member as it finishes (a part faded out leaves the picture), and its evidence is recorded.
  override begin(): void { this.made = this.make(); this.scene.beginAnimations([this.made]); }
  override interpolate(alpha: number): void { if (this.made) this.made.interpolate(this.made.rateFunc(alpha)); }
  override finish(): void { this.made?.finish(); }
  override cleanUpFromScene(scene: Parameters<Animation['cleanUpFromScene']>[0]): void { this.made?.cleanUpFromScene(scene); }
  override targets(): Mobject[] { return this.made ? this.made.targets() : this.declared; }
  override evidence(): Evidence | null { return this.made?.evidence() ?? null; }
}

/** How long the views take to land after an authored transition: one frame's worth. */
const LAND = 1 / 30;

/**
 * The views take the pictures of the state reached, with no motion: an authored transition already
 * brought what is on screen there (rayner check holds it to that). Each keyed part takes its drawn
 * counterpart's data in place (a morphed Text gets its new string) and the parts go back into the
 * drawn picture's stacking order, so every part keeps its identity for the next event. A picture
 * whose parts do not line up by key is swapped for the drawn one instead.
 */
class Landing extends Animation {
  views: readonly View[];
  scene: Scene<any>;
  constructor(scene: Scene<any>, views: readonly View[]) {
    super(views[0] ?? new Group(), { runTime: LAND, rateFunc: linear });
    this.scene = scene; this.views = views;
  }
  override begin(): void {}
  override interpolate(): void {}
  override finish(): void {
    for (const v of this.views) {
      const drawn = v.placed(this.scene.state), current = v.current;
      const byKey = new Map(current.children.map((c) => [c.key, c] as const));
      const lines = drawn.children.length === current.children.length && drawn.children.every((d) => d.key !== undefined && byKey.get(d.key)?.sameShapeAs(d));
      if (!lines) { v.rebuild(); continue; }
      const order = drawn.children.map((d) => byKey.get(d.key)!.become(d));
      current.children = order;
      current.invalidateBox();
    }
  }

  override cleanUpFromScene(): void {}
  override targets(): Mobject[] { return [...this.views]; }
}

const registry = new WeakMap<object, Machine<object, string>[]>();
/** The machines a scene made, in order: what `rayner check` explores after a run. */
export function machinesOf(scene: Scene<any>): Machine<object, string>[] {
  let list = registry.get(scene);
  if (!list) registry.set(scene, (list = []));
  return list;
}
