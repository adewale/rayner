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
  /** Each event's morph, in seconds (default 0.6). */
  runTime?: number;
  /** The most states `rayner check` explores (default 256); a larger machine is sampled breadth first up to it. */
  limit?: number;
}

/**
 * What an authored transition is built from: the event, the states either side, the views, and
 * `targets`, each view's picture of `after` placed where the view will land. Morph into those
 * (or end exactly as they are) and the landing moves nothing.
 */
export interface Transition<S, E> { event: E; before: S; after: S; views: readonly View[]; targets: readonly Mobject[] }

/** A model driven by events on one scene. */
export class Machine<S extends object, E extends string> {
  readonly scene: Scene<S>;
  readonly spec: Required<Pick<MachineSpec<S, E>, 'match' | 'runTime' | 'limit'>> & MachineSpec<S, E>;

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

  /** The state after `event` from `state`, or undefined when the state refuses it. */
  after(state: S, event: E): S | undefined {
    if (!this.spec.events.includes(event)) throw new RangeError(`This machine accepts ${this.spec.events.join(', ')}, not ${String(event)}`);
    return this.spec.next(state, event);
  }

  /**
   * One event from `from` (default: the scene's state now): the model's next state is adopted and
   * recorded as `{ kind: 'event', event }`, then the views morph to it, or the event's authored
   * transition plays and the views land on it. The schedule is built for `from`, so it refuses to
   * play from any other state, and a refused event is refused here, before anything plays.
   */
  send(event: E, from: S = this.scene.state as S): Succession {
    const before = JSON.parse(JSON.stringify(from)) as S;
    const after = this.after(before, event);
    if (after === undefined) throw new RangeError(`${String(event)} is refused in ${JSON.stringify(before)}`);
    const { views, match, runTime } = this.spec;
    const authored = this.spec.transition?.[event];
    const built = JSON.stringify(before);
    return new Succession([
      new SetState<S>(this.scene, (current) => {
        if (JSON.stringify(current) !== built) throw new Error(`${String(event)} was built for ${built} but plays from ${JSON.stringify(current)}`);
        return after;
      }, { event }),
      authored
        // The transition's motion, then the views take the pictures of `after`: a sync that moves
        // nothing when the transition ended where the model says (rayner check holds it to that).
        ? new Succession([
          new WhenItsTurnComes(() => authored({ event, before, after, views, targets: views.map((v) => v.placed(after as SceneState)) }), views, runTime),
          new AnimationGroup(views.map((v) => v.sync({ match, runTime: LAND }))),
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
        const next = this.spec.next(state, event);
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
  constructor(make: () => Animation | AnimationGroup, declared: readonly Mobject[], runTime: number) {
    super(declared[0] ?? new Group(), { runTime, rateFunc: linear });
    this.make = make; this.declared = [...declared]; this.made = null;
  }
  override begin(): void { this.made = this.make(); this.made.begin(); }
  override interpolate(alpha: number): void { if (this.made) this.made.interpolate(this.made.rateFunc(alpha)); }
  override finish(): void { this.made?.finish(); }
  override cleanUpFromScene(scene: Parameters<Animation['cleanUpFromScene']>[0]): void { this.made?.cleanUpFromScene(scene); }
  override targets(): Mobject[] { return this.made ? this.made.targets() : this.declared; }
  override evidence(): Evidence | null { return this.made?.evidence() ?? null; }
}

/** How long the views take to land after an authored transition: one frame's worth, still when it ended right. */
const LAND = 1 / 30;

const registry = new WeakMap<object, Machine<object, string>[]>();
/** The machines a scene made, in order: what `rayner check` explores after a run. */
export function machinesOf(scene: Scene<any>): Machine<object, string>[] {
  let list = registry.get(scene);
  if (!list) registry.set(scene, (list = []));
  return list;
}
