// Stage and diagram actions (`s.card`, `d.walk`, …): each is an animation and a thenable at once.
// Awaited, it plays itself on its scene, one play per beat; handed to play(), a Succession or a
// group, it plays there instead, its beats one after another as a Succession's members. Both paths
// run the same beats, with the same side effects at the same moments between them.

import { AnimationGroup, Succession, linear } from '../src/index.ts';
import type { Scene, ScheduledAnimation, PlayOpts } from '../src/index.ts';

/**
 * One play of an action: its run time, fixed when the action is made, and what it does when its
 * turn comes. `play` makes the beat's side effects and its animations at that moment (none plays
 * nothing); `after` runs once they have finished and left the scene.
 */
export interface Beat {
  runTime: number;
  play: () => ScheduledAnimation[];
  after?: () => void;
}

/** What an action does: what it gives, its beats in order, and what happens before the first and after the last. */
export interface Plan<T> {
  value: T;
  beats: readonly Beat[];
  start?: () => void;
  end?: () => void;
}

/** A beat's animations must take the run time it was planned with: a play of each, or a Succession member's slot. */
function checkTime(action: string, beat: Beat, made: readonly ScheduledAnimation[]): void {
  if (!made.length) return;
  const took = Math.max(...made.map((a) => a.runTime));
  if (Math.abs(took - beat.runTime) > 1e-9)
    throw new Error(`${action}: one of its plays takes ${took} s, where ${beat.runTime} s was planned`);
}

/**
 * A beat as a member of its action's Succession: made when its turn comes, then begun through the
 * scene as a play begins its animations; `after` runs once they are cleaned up, as it does after a play.
 */
class BeatPlay extends AnimationGroup {
  readonly beat: Beat;
  readonly action: string;
  constructor(beat: Beat, action: string) {
    super([], { runTime: beat.runTime, rateFunc: linear });
    this.beat = beat;
    this.action = action;
  }
  override begin(): void {
    if (!this.scene) throw new Error(`${this.action}: play it on the scene it belongs to`);
    const made = this.beat.play();
    checkTime(this.action, this.beat, made);
    this.animations = made;
    this.timings = made.map((a) => [0, a.runTime]);
    this.maxEnd = Math.max(0, ...made.map((a) => a.runTime));
    this.scene.beginAnimations(made);
  }
  override cleanUpFromScene(scene: Scene): void {
    super.cleanUpFromScene(scene);
    this.beat.after?.();
  }
}

/** The actions each scene has made that have not begun to play: each must, by the end of its step. */
const unplayed = new WeakMap<Scene<any, any>, Set<Action<unknown>>>();

/**
 * Track `action` until it plays. The first action on a scene makes the scene's step ends check:
 * an action still unplayed when its step ends (or the scene does) throws, naming it, since a lazy
 * action that is neither awaited nor played does nothing.
 */
function track(scene: Scene<any, any>, action: Action<unknown>): void {
  let waiting = unplayed.get(scene);
  if (!waiting) {
    const left = (waiting = new Set());
    unplayed.set(scene, left);
    const endStep = scene.endCurrentStep.bind(scene);
    scene.endCurrentStep = async () => {
      if (left.size && !scene.stopped) {
        const names = [...left].map((a) => a.name);
        left.clear();
        const step = scene.currentStep ? ` in step "${scene.currentStep.name}"` : ' before the first step';
        throw new Error(
          `${names.join(', ')}: ${names.length > 1 ? 'they were' : 'it was'} made${step} but never played; ` +
            'await an action, or hand it to play(), or to a Succession or group that plays, before its step ends',
        );
      }
      await endStep();
    };
  }
  waiting.add(action);
}

/**
 * What a stage or diagram action returns: an animation that is also a promise of what the action
 * gives (`T`: the card, the diagram, or nothing).
 *
 * - `await` it, and it plays itself on its scene: one play per beat, each rounded to whole frames.
 * - Hand it to `play()`, a `Succession` or a group, and it plays there instead, its beats one after
 *   another in that play: `this.play(s.focus(box), d.walk(hops))`.
 *
 * Either way it is decided when it is called (what it builds, fades, reveals or moves to, as a
 * Transform's target is), and its side effects (keeping a card, recording a walk) happen when it
 * plays, at the same moments between its animations. It plays once: a second play throws, and so
 * does an action still unplayed when its step ends. `value` is what awaiting it gives, there when
 * the action is made, except `s.show`'s diagram, which is there once it begins.
 */
export class Action<T = void> extends Succession implements PromiseLike<T> {
  /** The call that made it, as messages name it: `s.card()`, `d.walk()`. */
  readonly name: string;
  /** @internal The scene it plays on: a play on another scene refuses it. */
  readonly host: Scene<any, any>;
  #make: () => Plan<T>;
  #plan: Plan<T> | null;
  #failed: boolean;
  #error: unknown;
  #waiting: Promise<void> | null;
  #settled: boolean;
  #played: 'awaited' | 'composed' | null;
  #result: Promise<T> | null;
  #stretched: boolean;
  #ended: boolean;

  /**
   * @internal `make` decides the action when it is called, or with `late` when it begins (after
   * `ready`, which a play waits for): then its run time is known only once it has begun, so it
   * plays in play() or awaited, never inside a Succession or group built before.
   */
  constructor(scene: Scene<any, any>, name: string, make: () => Plan<T>, { ready, late = false }: { ready?: Promise<unknown>; late?: boolean } = {}) {
    let plan: Plan<T> | null = null, failed = false, error: unknown = null;
    if (!late)
      try {
        plan = make();
      } catch (e) {
        failed = true;
        error = e;
      }
    super(plan ? plan.beats.map((b) => new BeatPlay(b, name)) : []);
    this.name = name;
    this.host = scene;
    this.#make = make;
    this.#plan = plan;
    this.#failed = failed;
    this.#error = error;
    this.#settled = !ready;
    this.#waiting = ready
      ? ready.then(
          () => { this.#settled = true; },
          (e: unknown) => {
            this.#settled = true;
            if (!this.#failed) [this.#failed, this.#error] = [true, e];
          },
        )
      : null;
    this.#played = null;
    this.#result = null;
    this.#stretched = false;
    this.#ended = false;
    if (late) {
      let runTime = 0;
      Object.defineProperty(this, 'runTime', {
        get: () => {
          if (!this.#plan && !this.#failed)
            throw new Error(`${name}: how long it takes is known once it begins, so play it in play() or await it, not inside a Succession or group`);
          return runTime;
        },
        set: (v: number) => { runTime = v; },
        configurable: true,
        enumerable: true,
      });
    }
    track(scene, this as Action<unknown>);
  }

  /** What awaiting it gives. Set when the action is made (`s.show`'s diagram: once it begins). */
  get value(): T {
    if (this.#failed) throw this.#error;
    if (!this.#plan) throw new Error(`${this.name}: what it gives is known once it begins; read its value after a play has begun it, or await it`);
    return this.#plan.value;
  }

  /** It plays once, awaited or composed: mark which, or refuse a second play. */
  #start(how: 'awaited' | 'composed'): void {
    if (this.#played)
      throw new Error(
        `${this.name}: it has already played${this.#played === 'composed' ? ' in a play' : ''}; an action plays once, so call it again to play it again` +
          (this.#played === 'composed' && how === 'awaited' ? ', and read what it gave from its value' : ''),
      );
    this.#played = how;
    unplayed.get(this.host)?.delete(this as Action<unknown>);
  }

  /** The plan, made now for a late action, and its beats laid out as this Succession's members. */
  #planned(): Plan<T> {
    if (this.#failed) throw this.#error;
    if (this.#plan) return this.#plan;
    const plan = this.#make();
    this.#plan = plan;
    this.animations = plan.beats.map((b) => new BeatPlay(b, this.name));
    let start = 0;
    this.timings = this.animations.map((a) => {
      const slot: [number, number] = [start, start + a.runTime];
      start += a.runTime;
      return slot;
    });
    this.maxEnd = start;
    if (!this.#stretched) this.runTime = this.maxEnd;
    return plan;
  }

  /** @internal */ override ready(): Promise<unknown> | null {
    return this.#settled ? null : this.#waiting;
  }

  /** @internal */ override setOptions(opts: PlayOpts = {}): this {
    if (opts.runTime != null) this.#stretched = true;
    return super.setOptions(opts);
  }

  /** Composed: begun by a play, or by the Succession or group that holds it. */
  override begin(): void {
    this.#start('composed');
    if (!this.#settled) throw new Error(`${this.name}: begun before what it reads was ready; play() waits for that, so hand it to play()`);
    this.#planned().start?.();
    super.begin();
  }

  override finish(): void {
    super.finish();
    if (this.#ended) return;
    this.#ended = true;
    this.#plan?.end?.();
  }

  /** Awaited: play each beat in a play of its own, then give the value. */
  async #run(): Promise<T> {
    this.#start('awaited');
    if (this.#waiting) await this.#waiting;
    const plan = this.#planned();
    plan.start?.();
    for (const beat of plan.beats) {
      const made = beat.play();
      checkTime(this.name, beat, made);
      if (made.length) await this.host.play(...made);
      beat.after?.();
    }
    this.#ended = true;
    plan.end?.();
    return plan.value;
  }

  then<R1 = T, R2 = never>(
    onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    this.#result ??= this.#run();
    return this.#result.then(onfulfilled, onrejected);
  }
}
