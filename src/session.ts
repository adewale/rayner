// Sessions: a model driven by events, as a schedule. Each event is a SetState whose next
// state the model computes from the state when it plays, then a keyed sync of each view
// drawn from that state. A session is therefore an ordinary Succession: it seeks, traces
// and records like any other play, and the same `next` and views a reader would drive
// can be explored state by state by `rayner check`. See docs/SESSIONS.md.

import { AnimationGroup, SetState, Succession } from './animation.ts';
import type { Scene } from './scene.ts';
import type { View, ViewMatch } from './view.ts';

export interface SessionSpec<S extends object, E extends string> {
  /** Where the session starts: what `reachable()` explores from. The scene need not be in it yet. */
  start: S;
  /** Every event the session accepts, in order: what a reader's buttons would be. */
  events: readonly E[];
  /** The model's step: pure, from the model module, and it returns a new state. */
  next: (state: S, event: E) => S;
  /** Pictures of the scene's state, synced after each event. */
  views: readonly View[];
  /** How the views morph (default 'keys': keyed parts keep their identity). */
  match?: ViewMatch;
  /** Each event's morph, in seconds (default 0.6). */
  runTime?: number;
  /** The most states `rayner check` explores (default 256); a larger machine is sampled breadth first up to it. */
  limit?: number;
}

/** A model driven by events on one scene. */
export class Session<S extends object, E extends string> {
  readonly scene: Scene<S>;
  readonly spec: Required<Pick<SessionSpec<S, E>, 'match' | 'runTime' | 'limit'>> & SessionSpec<S, E>;

  constructor(scene: Scene<any>, spec: SessionSpec<S, E>) {
    if (!spec.events.length) throw new TypeError('A session needs at least one event');
    if (new Set(spec.events).size !== spec.events.length) throw new TypeError('A session\'s events must be distinct');
    if (typeof spec.next !== 'function') throw new TypeError('A session needs next(state, event)');
    this.scene = scene;
    this.spec = { match: 'keys', runTime: 0.6, limit: 256, ...spec };
    sessionsOf(scene).push(this as unknown as Session<object, string>);
  }

  /**
   * One event, from the state the scene is in when it plays: the model's next state is
   * adopted and recorded as `{ kind: 'event', event }`, then every view morphs to it.
   */
  send(event: E): Succession {
    if (!this.spec.events.includes(event)) throw new RangeError(`This session accepts ${this.spec.events.join(', ')}, not ${String(event)}`);
    const { next, views, match, runTime } = this.spec;
    return new Succession([
      new SetState<S>(this.scene, (state) => next(state, event), { event }),
      new AnimationGroup(views.map((v) => v.sync({ match, runTime }))),
    ]);
  }

  /** Events in turn, each from where the last left the state: one schedule to play. */
  replay(events: readonly E[]): Succession { return new Succession(events.map((e) => this.send(e))); }

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
        const next = this.spec.next(state, event), key = JSON.stringify(next);
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

const registry = new WeakMap<object, Session<object, string>[]>();
/** The sessions a scene made, in order: what `rayner check` explores after a run. */
export function sessionsOf(scene: Scene<any>): Session<object, string>[] {
  let list = registry.get(scene);
  if (!list) registry.set(scene, (list = []));
  return list;
}
