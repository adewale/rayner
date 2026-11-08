// Stage and diagram actions (`s.card`, `d.walk`, …): each is an animation and a thenable at once.
// Awaited, it plays itself on its scene, one play per beat; handed to play(), a Succession or a
// group, it plays there instead, its beats one after another as a Succession's members. Both paths
// run the same beats, with the same side effects at the same moments between them.

import { AnimationGroup, Succession, linear } from '../src/index.ts';
import type { Scene, ScheduledAnimation, Mobject } from '../src/index.ts';

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
 * @internal An animation whose members are made when its turn comes in a play: an action's beat,
 * or a machine's transition, made from the pictures on screen then. Until then it stands for the
 * mobjects it declares it writes. As it begins it makes its members; once what they read is ready
 * (the play waits for that before its next frame, see Scene.whenReady) they are settled, laid out
 * in its run time, and begun through the scene, which checks them against everything else the
 * play drives. `by` names what made them, as messages do.
 */
export abstract class MadeAtTurn extends AnimationGroup {
  readonly by: string;
  readonly #declared: readonly Mobject[];
  /** Its members: not made before it begins, waiting for what they read (with the alpha a frame gave it meanwhile), or begun. */
  #turn: { made: 'not yet' } | { made: 'waiting'; at: number | null } | { made: 'begun' } = { made: 'not yet' };

  constructor(by: string, runTime: number, declared: readonly Mobject[] = []) {
    super([], { runTime, rateFunc: linear });
    this.by = by;
    this.#declared = declared;
  }
  /** Its members, made as its turn comes. */
  protected abstract make(): ScheduledAnimation[];
  /** Each member's start and end in its own time, once settled; it may refuse members that do not fit. All of it by default. */
  protected slots(made: readonly ScheduledAnimation[]): Array<[number, number]> {
    return made.map(() => [0, 1]);
  }
  protected override doBegin(): void {
    const scene = this.scene;
    if (!scene) throw new Error(`${this.by}: play it on the scene it belongs to`);
    this.animations = [];
    const made = this.make();
    this.#turn = { made: 'waiting', at: null };
    scene.whenReady(made, this.by, () => {
      for (const a of made) a.settle();
      this.timings = this.slots(made);
      this.maxEnd = Math.max(0, ...this.timings.map(([, end]) => end));
      this.animations = made;
      const turn = this.#turn;
      this.#turn = { made: 'begun' };
      scene.beginAnimations(made, this.by);
      // Begun after the play waited: it takes the frame it was given while it waited.
      if (turn.made === 'waiting' && turn.at !== null) super.doInterpolate(turn.at);
    });
  }
  protected override doInterpolate(alpha: number): void {
    const turn = this.#turn;
    if (turn.made === 'waiting') this.#turn = { made: 'waiting', at: alpha };
    else super.doInterpolate(alpha);
  }
  protected override doFinish(alpha?: number): void {
    if (this.#turn.made === 'waiting') throw new Error(`${this.by}: its turn came as its play ended, where nothing can wait for what it reads; give it a run time`);
    super.doFinish(alpha);
  }
  /** Before its members are made, what it declares; then theirs. */
  override targets(): Mobject[] {
    return this.#turn.made === 'begun' ? super.targets() : [...this.#declared];
  }
  /** @internal Its members are made when its turn comes; its run time was planned. */
  override settle(): void {}
}

/**
 * A beat as a member of its action's Succession: made when its turn comes, then begun through the
 * scene as a play begins its animations; `after` runs once they are cleaned up, as it does after a play.
 */
class BeatPlay extends MadeAtTurn {
  readonly beat: Beat;
  constructor(beat: Beat, action: string) {
    super(action, beat.runTime);
    this.beat = beat;
  }
  protected override make(): ScheduledAnimation[] {
    return this.beat.play();
  }
  /** Each animation from the beat's start, for its own run time, which must be the beat's planned one. */
  protected override slots(made: readonly ScheduledAnimation[]): Array<[number, number]> {
    checkTime(this.by, this.beat, made);
    return made.map((a) => [0, a.runTime]);
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
    const refuse = (where: string) => {
      if (!left.size) return;
      const names = [...left].map((a) => a.name);
      left.clear();
      throw new Error(
        `${names.join(', ')}: ${names.length > 1 ? 'they were' : 'it was'} made ${where} but never played; ` +
          'await an action, or hand it to play(), or to a Succession or group that plays, before its step ends',
      );
    };
    // Made before any step: refused as the first step begins. Made in a step: refused as it ends.
    if (!scene.currentStep) {
      const off = scene.onStep(() => {
        off();
        refuse('before the first step');
      });
    }
    scene.onStepEnd((step) => refuse(`in step "${step.name}"`));
  }
  waiting.add(action);
}

/** What deciding an action gave: its plan, or the error deciding it (or reading what it reads) threw; null until a late action is decided. */
type Decision<T> = { plan: Plan<T> } | { error: unknown } | null;

/**
 * Where an action is in its life, as one value: each change is made in one place below.
 *
 * - `reading`: made, not played, and what it reads is not ready (`ready` has not settled).
 * - `ready`: made, not played, and what it reads is ready; a late action is decided as it begins.
 * - `awaited`: awaited, and playing itself beat by beat; `run` is what awaiting it gives.
 * - `composed`: begun by a play, or by the Succession or group that holds it.
 * - `ended`: its last beat has played and its `end` has run, after it was awaited or composed.
 *
 * Before it plays it may be `reading`, then `ready`; it plays once, awaited or composed, then ends.
 * A refused begin (what it reads not ready, or deciding it failed) leaves it as it was.
 */
type ActionState<T> =
  | { phase: 'reading'; decision: Decision<T> }
  | { phase: 'ready'; decision: Decision<T> }
  | { phase: 'awaited'; decision: Decision<T>; run: Promise<T> }
  | { phase: 'composed'; plan: Plan<T> }
  | { phase: 'ended'; plan: Plan<T>; run: Promise<T> | null };

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
  /** What decides it: what it gives and its beats. */
  readonly #make: () => Plan<T>;
  /** Settles once what it reads is ready, recording a failure as its decision; null when it reads nothing. */
  readonly #waiting: Promise<void> | null;
  #state: ActionState<T>;

  /**
   * @internal `make` decides the action when it is called, or with `late` once `ready` has settled
   * and the play that holds it begins (a play waits for `ready`, a group's members' included, and
   * so does a play for what is made at its turn there): its run time is known from then, so it
   * plays awaited, in play(), or inside a Succession, a group or a machine's transition.
   */
  constructor(scene: Scene<any, any>, name: string, make: () => Plan<T>, { ready, late = false }: { ready?: Promise<unknown>; late?: boolean } = {}) {
    let decision: Decision<T> = null;
    if (!late)
      try {
        decision = { plan: make() };
      } catch (error) {
        decision = { error };
      }
    super(decision && 'plan' in decision ? decision.plan.beats.map((b) => new BeatPlay(b, name)) : []);
    this.name = name;
    this.host = scene;
    this.#make = make;
    this.#state = { phase: ready ? 'reading' : 'ready', decision };
    this.#waiting = ready
      ? ready.then(
          () => {
            if (this.#state.phase === 'reading') this.#state = { phase: 'ready', decision: this.#state.decision };
          },
          (error: unknown) => {
            const s = this.#state;
            if (s.phase === 'reading') this.#state = { phase: 'ready', decision: s.decision && 'error' in s.decision ? s.decision : { error } };
            else if (s.phase === 'awaited' && !(s.decision && 'error' in s.decision)) this.#state = { ...s, decision: { error } };
          },
        )
      : null;
    track(scene, this as Action<unknown>);
  }

  /** What awaiting it gives. Set when the action is made (`s.show`'s diagram: once the play that holds it begins). */
  get value(): T {
    const s = this.#state;
    const decision: Decision<T> = 'plan' in s ? { plan: s.plan } : s.decision;
    if (decision && 'error' in decision) throw decision.error;
    if (!decision) throw new Error(`${this.name}: what it gives is known once the play that holds it begins; read its value after that, or await it`);
    return decision.plan.value;
  }

  /** The refusal of a second play, after it played `how`, for a play `now`. */
  #playedAlready(how: 'awaited' | 'composed', now: 'awaited' | 'composed'): Error {
    return new Error(
      `${this.name}: it has already played${how === 'composed' ? ' in a play' : ''}; an action plays once, so call it again to play it again` +
        (how === 'composed' && now === 'awaited' ? ', and read what it gave from its value' : ''),
    );
  }

  /** How it played, once it has: awaited or composed; null before. */
  #played(): 'awaited' | 'composed' | null {
    const s = this.#state;
    return s.phase === 'awaited' ? 'awaited' : s.phase === 'composed' ? 'composed' : s.phase === 'ended' ? (s.run ? 'awaited' : 'composed') : null;
  }

  /**
   * Its plan, deciding a late action now (once what it reads is ready), its beats laid out as this
   * Succession's members; throws what deciding it threw. Called from `ready`, before it begins, or `awaited`.
   */
  #decide(): Plan<T> {
    const s = this.#state;
    if (s.phase === 'composed' || s.phase === 'ended') return s.plan;
    if (s.decision) {
      if ('error' in s.decision) throw s.decision.error;
      return s.decision.plan;
    }
    let plan: Plan<T>;
    try {
      plan = this.#make();
    } catch (error) {
      this.#state = { ...s, decision: { error } };
      throw error;
    }
    this.#state = { ...s, decision: { plan } };
    this.animations = plan.beats.map((b) => new BeatPlay(b, this.name));
    // Laid out as a Succession lays out its members; a run time given to play() is kept.
    super.settle();
    return plan;
  }

  /** @internal */ override ready(): Promise<unknown> | null {
    return this.#state.phase === 'reading' ? this.#waiting : null;
  }

  /** @internal Decided now, if it was not when made: what it reads is ready, and the play that holds it is beginning. */
  override settle(): void {
    const s = this.#state;
    if (s.phase === 'reading') throw new Error(`${this.name}: played before what it reads was ready; hand it to play(), or to a Succession or group that plays, which waits for it`);
    if (s.phase === 'ready') this.#decide();
  }

  /** Composed: begun by a play, or by the Succession or group that holds it. A refused begin leaves it unplayed. */
  protected override doBegin(): void {
    const s = this.#state;
    const how = this.#played();
    if (how) throw this.#playedAlready(how, 'composed');
    if (s.phase === 'reading') throw new Error(`${this.name}: begun before what it reads was ready; hand it to play(), or to a Succession or group that plays, which waits for it`);
    const plan = this.#decide();
    this.#state = { phase: 'composed', plan };
    unplayed.get(this.host)?.delete(this as Action<unknown>);
    plan.start?.();
    super.doBegin();
  }

  protected override doFinish(): void {
    super.doFinish();
    const s = this.#state;
    if (s.phase !== 'composed') return;
    this.#state = { phase: 'ended', plan: s.plan, run: null };
    s.plan.end?.();
  }

  /** Awaited: play each beat in a play of its own, then give the value. Once awaited, awaiting it again gives the same. */
  #awaited(): Promise<T> {
    const s = this.#state;
    if (s.phase === 'awaited' || (s.phase === 'ended' && s.run)) return s.run!;
    if (s.phase !== 'reading' && s.phase !== 'ready') return Promise.reject(this.#playedAlready(this.#played()!, 'awaited'));
    // It starts after this state is set (an await, of what it reads or of nothing), so it ends after it too.
    let run!: Promise<T>;
    run = (async () => {
      await this.#waiting;
      const plan = this.#decide();
      plan.start?.();
      for (const beat of plan.beats) {
        const made = beat.play();
        checkTime(this.name, beat, made);
        if (made.length) await this.host.play(...made);
        beat.after?.();
      }
      this.#state = { phase: 'ended', plan, run };
      plan.end?.();
      return plan.value;
    })();
    this.#state = { phase: 'awaited', decision: s.decision, run };
    unplayed.get(this.host)?.delete(this as Action<unknown>);
    return run;
  }

  then<R1 = T, R2 = never>(
    onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.#awaited().then(onfulfilled, onrejected);
  }
}
