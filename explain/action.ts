// Stage and diagram actions (`s.card`, `d.walk`, …): each is an animation and a thenable at once.
// Awaited, it plays itself on its scene, one play per beat; handed to play(), a Succession or a
// group, it plays there instead, its beats one after another as a Succession's members. Both paths
// run the same beats, with the same side effects at the same moments between them.

import type { Scene, Succession } from '../src/index.ts';
import { Beats } from '../src/animation.ts';
import type { BeatPlan } from '../src/animation.ts';

/** The actions each scene has made that have not begun to play: each must, by the end of its step. */
const unplayed = new WeakMap<Scene<any, any>, Set<{ readonly name: string }>>();

/**
 * Track `action` until it plays. The first action on a scene makes the scene's step ends check:
 * an action still unplayed when its step ends (or the scene does) throws, naming it, since a lazy
 * action that is neither awaited nor played does nothing.
 */
function track(scene: Scene<any, any>, action: { readonly name: string }): void {
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
export interface Action<T = void> extends Succession, PromiseLike<T> {
  /** The call that made it, as messages name it: `s.card()`, `d.walk()`. */
  readonly name: string;
  /** What awaiting it gives. Set when the action is made (`s.show`'s diagram: once the play that holds it begins). */
  readonly value: T;
  then<R1 = T, R2 = never>(
    onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2>;
}

/**
 * An action: the engine's animation of beats (see Beats), which its scene's step end holds to
 * playing, and which awaiting plays alone.
 */
class Played<T> extends Beats<T> implements Action<T> {
  readonly #scene: Scene<any, any>;
  constructor(scene: Scene<any, any>, name: string, make: () => BeatPlan<T>, opts?: { ready?: Promise<unknown>; late?: boolean }) {
    super(scene, name, make, opts);
    this.#scene = scene;
    track(scene, this);
  }

  get value(): T {
    const plan = this.decided();
    if (!plan) throw new Error(`${this.name}: what it gives is known once the play that holds it begins; read its value after that, or await it`);
    return plan.value;
  }

  /** It has begun to play: its step's end no longer waits for it. */
  protected override playing(): void {
    unplayed.get(this.#scene)?.delete(this);
  }

  then<R1 = T, R2 = never>(
    onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.alone().then(onfulfilled, onrejected);
  }
}

/**
 * @internal An action on `scene`, which messages name `name`, decided by `make` when it is called,
 * or with `late` once `ready` has settled and the play that holds it begins (a play waits for
 * `ready`): it plays awaited, in play(), or inside a Succession, a group or a machine's transition.
 */
export function action<T>(scene: Scene<any, any>, name: string, make: () => BeatPlan<T>, opts?: { ready?: Promise<unknown>; late?: boolean }): Action<T> {
  return new Played(scene, name, make, opts);
}
