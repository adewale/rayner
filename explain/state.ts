// Rayner's animations of state: SetState adopts a model state at its place in a schedule, and
// Follow writes the pictures of one sampled number into its targets (under view.tween and a
// transition's follow). Kept out of src/, the engine taken from Lantern.
import { Animation } from '../src/animation.ts';
import type { AnimOpts } from '../src/animation.ts';
import { Group, Mobject as MobjectClass } from '../src/mobject.ts';
import type { Mobject } from '../src/mobject.ts';
import { jsonObject } from '../src/json.ts';
import type { JsonObject } from '../src/json.ts';
import type { Scene, SceneState, Evidence } from '../src/scene.ts';

// A shared, non-drawing target makes simultaneous SetStates on one Scene
// visible to play()'s ordinary overlap check. Separate scenes do not conflict.
const stateTargets = new WeakMap<object, Group>();

export interface SetStateOpts {
  /** The event that set the state: recorded as `{ kind: 'event', event }` as this begins. */
  event?: string;
}

/**
 * Replace a scene's JSON state when this member begins, usually inside a Succession. `next`
 * is the state, or a function of the state when this begins (a copy, so it cannot change the
 * scene's): a model step, so each member of a replay starts where the one before left it.
 */
export class SetState<S extends object = SceneState> extends Animation {
  readonly host: Scene<S, any>;
  readonly event: string | undefined;
  private readonly snapshot: JsonObject | null;
  private readonly update: ((current: S) => S) | null;

  constructor(host: Scene<S, any>, next: NoInfer<S> | ((current: NoInfer<S>) => NoInfer<S>), { event }: SetStateOpts = {}) {
    if (event !== undefined && (typeof event !== 'string' || !event.trim())) throw new TypeError('SetState event must be a nonempty string');
    const update = typeof next === 'function' ? (next as (current: S) => S) : null;
    const snapshot = update ? null : jsonObject(next, 'SetState state');
    let target = stateTargets.get(host);
    if (!target) { target = new Group(); stateTargets.set(host, target); }
    super(target, { runTime: 0, remover: true });
    this.host = host;
    this.event = event;
    this.snapshot = snapshot;
    this.update = update;
  }

  override begin(): void {
    const next = this.update
      ? this.update(jsonObject(this.host.state, 'SetState current state') as S)
      : this.snapshot;
    this.host.state = jsonObject(next, 'SetState state') as Scene<S, any>['state'];
    super.begin();
  }

  /** `{ kind: 'event', event }` when an event set the state; nothing otherwise. */
  override evidence(): Evidence | null { return this.event === undefined ? null : { kind: 'event', event: this.event }; }
}

export interface FollowSpec {
  /** Where the value starts: a number, or a function read when the play begins (so a Succession member starts where the one before left it). */
  from: number | (() => number);
  /** Where the value ends. */
  to: number;
  /**
   * The picture at one value: a fresh mobject for each target, in `targets` order (or the one
   * mobject, for one target), each the same family shape as its target. Follow writes each
   * into its target with `become`, so it writes exactly its targets, and only from the value:
   * nothing can carry over from what the previous frame left.
   */
  draw: (value: number) => Mobject | readonly Mobject[];
}
export interface FollowOpts extends AnimOpts {
  /** The mobjects `draw` redraws: play() admits them and refuses a second writer of any of them. */
  targets: readonly Mobject[];
}

/**
 * Several drawings following one number: a bucket's level and the chart's climb
 * from the same elapsed time, a dot, a radius and a readout from the same angle.
 * Each frame samples the value between `from` and `to` at the eased alpha, draws
 * the picture at that value and writes it into the targets, so the drawings always
 * agree. Correct by construction: Follow writes nothing but its declared targets,
 * and only from the value, so a seek renders what a full run renders and play()'s
 * one-writer check covers everything it touches. No updater is registered. The value is exact at both ends; an easing that overshoots samples
 * outside them, as a Transform would. See docs/CHOREOGRAPHY.md.
 */
export class Follow extends Animation {
  readonly spec: FollowSpec;
  private readonly written: Mobject[];
  /** The value the play began from. Set by begin(). */
  start = 0;

  constructor(spec: FollowSpec, { targets, ...opts }: FollowOpts) {
    if (!Array.isArray(targets) || !targets.length || !targets.every((m) => m instanceof MobjectClass))
      throw new TypeError('Follow needs the mobjects draw() redraws: targets: [a, b, ...]');
    if (!Number.isFinite(spec.to)) throw new RangeError(`Follow: to must be a finite number, not ${String(spec.to)}`);
    if (typeof spec.from !== 'function' && !Number.isFinite(spec.from)) throw new RangeError(`Follow: from must be a finite number or a function, not ${String(spec.from)}`);
    if (typeof spec.draw !== 'function') throw new TypeError('Follow: draw must be a function of the value');
    if (new Set(targets).size !== targets.length) throw new TypeError('Follow: each target once');
    super(targets[0]!, opts);
    this.spec = spec;
    this.written = [...targets];
  }

  override targets(): Mobject[] { return this.written; }

  /** The interval it sampled and what it wrote: `{ kind: 'follow', from, to, targets }`, targets by key (or class). */
  override evidence(): Evidence {
    return { kind: 'follow', from: this.start, to: this.spec.to, targets: this.written.map((m) => m.key ?? m.constructor.name) };
  }

  override begin(): void {
    const from = typeof this.spec.from === 'function' ? this.spec.from() : this.spec.from;
    if (!Number.isFinite(from)) throw new RangeError(`Follow: from() must return a finite number, not ${String(from)}`);
    this.start = from;
    this.interpolate(0);
  }

  /** The value at an eased alpha: exact at 0 and 1. */
  valueAt(alpha: number): number {
    return alpha <= 0 ? this.start : alpha >= 1 ? this.spec.to : this.start + (this.spec.to - this.start) * alpha;
  }

  override interpolate(alpha: number): void {
    const drawn = this.spec.draw(this.valueAt(alpha));
    const pictures = drawn instanceof MobjectClass ? [drawn] : drawn;
    if (pictures.length !== this.written.length)
      throw new TypeError(`Follow: draw returned ${pictures.length} pictures for ${this.written.length} targets`);
    pictures.forEach((picture, i) => {
      const target = this.written[i]!;
      if (pictures.indexOf(picture) !== i || this.written.includes(picture))
        throw new TypeError('Follow: draw must return fresh mobjects, one per target, not a target itself');
      target.become(picture);
    });
    for (const m of this.written) m.invalidateBox();
  }

  override cleanUpFromScene(scene: Scene): void { if (this.remover) scene.remove(...this.written); }
}

