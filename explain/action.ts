// Stage and diagram actions (`s.card`, `d.walk`, …): each is an animation and a thenable at once.
// Awaited, it plays itself on its scene, one play per beat; handed to play(), a Succession or a
// group, it plays there instead, its beats one after another as a Succession's members. Both paths
// run the same beats, with the same side effects at the same moments between them.

import { Succession } from '../src/index.ts';
import type { Scene, ScheduledAnimation } from '../src/index.ts';
import { MadeAtTurn } from '../src/animation.ts';

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
function checkTime(call: string, beat: Beat, made: readonly ScheduledAnimation[]): void {
  if (!made.length) return;
  const took = Math.max(...made.map((a) => a.runTime));
  if (Math.abs(took - beat.runTime) > 1e-9)
    throw new Error(`${call}: one of its plays takes ${took} s, where ${beat.runTime} s was planned`);
}

/**
 * A beat as a member of its action's Succession: made when its turn comes, then begun through the
 * scene as a play begins its animations; `after` runs once they are cleaned up, as it does after a
 * play, and after a failure once they have landed, if they had begun.
 */
class BeatPlay extends MadeAtTurn {
  readonly beat: Beat;
  constructor(beat: Beat, action: string) {
    super({ call: action, subject: 'a beat' }, beat.runTime);
    this.beat = beat;
  }
  protected override make(): ScheduledAnimation[] {
    return this.beat.play();
  }
  /** Each animation from the beat's start, for its own run time, which must be the beat's planned one. */
  protected override slots(made: readonly ScheduledAnimation[]): Array<[number, number]> {
    checkTime(this.by.call, this.beat, made);
    return made.map((a) => [0, a.runTime]);
  }
  protected override after(): void {
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
 * - `ended`: its last beat has played and its `end` has run, after it was awaited (`run`) or
 *   composed (`run` is null).
 * - `abandoned`: its play failed after it began: the beat that had begun landed, no later beat was
 *   made, and its `end` did not run. Awaited, `run` rejects with the failure; composed, the play
 *   that held it threw it (see Action.abandoned).
 *
 * Before it plays it may be `reading`, then `ready`; it plays once, awaited or composed, then ends
 * or is abandoned. A begin that fails leaves it as it was, unplayed, whatever failed: what it reads
 * not ready, deciding it, its `start`, or its first beat's making or beginning. It can then play
 * again, and its step's end names it if it never does. What a `start` that ran did stays done. An
 * awaited action whose read, deciding or `start` fails stays `awaited`, its `run` rejecting with that.
 */
type ActionState<T> =
  | { phase: 'reading'; decision: Decision<T> }
  | { phase: 'ready'; decision: Decision<T> }
  | { phase: 'awaited'; decision: Decision<T>; run: Promise<T> }
  | { phase: 'composed'; plan: Plan<T> }
  | { phase: 'ended'; plan: Plan<T>; run: Promise<T> | null }
  | { phase: 'abandoned'; plan: Plan<T>; run: Promise<T> | null };

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
    switch (s.phase) {
      case 'reading': case 'ready': return null;
      case 'awaited': case 'composed': return s.phase;
      case 'ended': case 'abandoned': return s.run ? 'awaited' : 'composed';
    }
  }

  /**
   * Its plan, deciding a late action now (once what it reads is ready), its beats laid out as this
   * Succession's members; throws what deciding it threw. Called from `ready`, before it begins, or `awaited`.
   */
  #decide(): Plan<T> {
    const s = this.#state;
    if (s.phase === 'composed' || s.phase === 'ended' || s.phase === 'abandoned') return s.plan;
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
    // Laid out as a Succession lays out its members; a run time given to play() is kept.
    this.adopt(plan.beats.map((b) => new BeatPlay(b, this.name)));
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

  /** Composed: begun by a play, or by the Succession or group that holds it. A begin that fails leaves it unplayed. */
  protected override doBegin(): void {
    const s = this.#state;
    const how = this.#played();
    if (how) throw this.#playedAlready(how, 'composed');
    if (s.phase === 'reading') throw new Error(`${this.name}: begun before what it reads was ready; hand it to play(), or to a Succession or group that plays, which waits for it`);
    const plan = this.#decide();
    plan.start?.();
    super.doBegin();
    // Composed only once it has begun: a start or a first beat that throws leaves it unplayed.
    this.#state = { phase: 'composed', plan };
    unplayed.get(this.host)?.delete(this as Action<unknown>);
  }

  /** Its last beat has finished and gone: its `end` runs. */
  protected override ended(): void {
    const s = this.#state;
    if (s.phase !== 'composed') return;
    this.#state = { phase: 'ended', plan: s.plan, run: null };
    s.plan.end?.();
  }

  /**
   * Its play failed after it began: abandoned. The beat that has begun has landed, and run its
   * `after` if its animations began; no later beat is made, and its `end` does not run. It has
   * played, so it cannot play again.
   */
  protected override abandoned(): void {
    const s = this.#state;
    if (s.phase === 'composed') this.#state = { phase: 'abandoned', plan: s.plan, run: null };
  }

  /** Awaited: play each beat in a play of its own, then give the value. Once awaited, awaiting it again gives the same. */
  #awaited(): Promise<T> {
    const s = this.#state;
    if (s.phase === 'awaited' || ((s.phase === 'ended' || s.phase === 'abandoned') && s.run)) return s.run!;
    if (s.phase !== 'reading' && s.phase !== 'ready') return Promise.reject(this.#playedAlready(this.#played()!, 'awaited'));
    // It starts after this state is set (an await, of what it reads or of nothing), so it ends after it too.
    let run!: Promise<T>;
    run = (async () => {
      await this.#waiting;
      const plan = this.#decide();
      plan.start?.();
      try {
        for (const beat of plan.beats) {
          const made = beat.play();
          checkTime(this.name, beat, made);
          if (made.length) await this.host.play(...made);
          beat.after?.();
        }
      } catch (error) {
        this.#state = { phase: 'abandoned', plan, run };
        throw error;
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
