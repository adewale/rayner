// Choreograph: an authored transition between two pictures of a view, part by part, by key.
// A machine's transition receives the view's current picture and its target (the picture of the
// state the event reaches, placed where the view lands). choreograph(current, target) names the
// keyed parts of both, and each call animates some of them in the author's order: morph a part
// into its target, bring a new one in (faded, drawn, or grown from a copy of another part), or
// take a gone one out. rest() lands every keyed part no call has handled, so a transition that
// forgets a part still ends on the target picture. See docs/MACHINES.md.

import { Animation, AnimationGroup, Create, FadeIn, FadeOut, MoveAlongPath, Transform } from '../src/animation.ts';
import type { AnimOpts, TransformOpts } from '../src/animation.ts';
import { Follow } from './state.ts';
import type { FollowSpec } from './state.ts';
import type { Mobject } from '../src/mobject.ts';
import type { VMobject } from '../src/vmobject.ts';
import { linear } from '../src/rate.ts';

/**
 * An animation for a part that is already in the picture but unseen: it shows the part as it was
 * made (its saved state) when its turn comes, then runs the animation that brings it in. A part
 * must be in the picture before the play reaches it, or play() would take it for a new mobject
 * and add it to the stage a second time.
 */
class Joining extends Animation {
  inner: Animation;
  constructor(part: Mobject, inner: Animation) {
    super(part, { runTime: inner.runTime, rateFunc: (t) => t });
    this.inner = inner;
  }
  protected override doBegin(): void { this.mobject.restore(); this.inner.begin(); }
  protected override doInterpolate(alpha: number): void { this.inner.interpolate(this.inner.rateFunc(alpha)); }
  protected override doFinish(): void { this.inner.finish(); }
  override cleanUpFromScene(scene: Parameters<Animation['cleanUpFromScene']>[0]): void { this.inner.cleanUpFromScene(scene); }
  override targets(): Mobject[] { return this.inner.targets(); }
}

/** The keyed parts of a picture that are not inside another keyed part (the picture's own key aside). */
function keyedParts(picture: Mobject): Map<string, Mobject> {
  const out = new Map<string, Mobject>();
  const walk = (m: Mobject) => {
    for (const c of m.children) {
      if (c.key !== undefined) { if (out.has(c.key)) throw new Error(`t.choreograph(): two parts of one picture are keyed ${JSON.stringify(c.key)}; give each part its own key`); out.set(c.key, c); }
      else walk(c);
    }
  };
  walk(picture);
  return out;
}

export interface Choreography {
  /** The current part with this key (throws when there is none). */
  from(key: string): Mobject;
  /** The target part with this key (throws when there is none). */
  to(key: string): Mobject;
  /** Whether the current or target picture has a part with this key. */
  has(key: string, side?: 'from' | 'to'): boolean;
  /** The keys of the parts on one side, in order. */
  keys(side: 'from' | 'to'): string[];
  /** Morph the current part into its target. */
  morph(key: string, opts?: TransformOpts): Animation;
  /** Bring in a part only the target has: faded in, drawn (`create`), or grown from a copy of the current part `from`. */
  enter(key: string, how?: { from?: string; create?: boolean }, opts?: AnimOpts): Animation;
  /** Take out a part only the current picture has. */
  leave(key: string, opts?: AnimOpts): Animation;
  /** Put an unseen copy of `like` into the current picture as the part `key`, for the author to animate into view; it must end as the target part, or, when the target has no such part, leave. */
  insert(key: string, like: Mobject): Mobject;
  /** Mark a current part as the author's to animate (with follow, say); it must end as the target part. */
  own(key: string): Mobject;
  /**
   * Parts following one number through the transition: each frame samples the value between
   * `from` and `to` at the eased alpha, draws the pictures at that value and writes them into the
   * targets, so they always agree and a seek renders what a full play renders. A target named by
   * key is owned (as `own`); a mobject target is one the author already holds, such as an
   * inserted part. `draw` returns a fresh mobject per target, in order (or the one, for one).
   */
  follow(spec: FollowSpec, opts: AnimOpts & { targets: readonly (string | Mobject)[] }): Animation;
  /**
   * A token passing along `path`, a part the target does not have (a message on its arrow, an
   * event walking a link): `appear` brings `token` into view at the path's start, `move` carries it
   * along the path at an even speed, and `leave` takes it out of the picture. Each phase is an
   * animation for the author to place, so other motion can run beside it; all three must play.
   */
  travel(key: string, token: Mobject, path: VMobject, times?: { appear?: number; move?: number; leave?: number }): { appear: Animation; move: Animation; leave: Animation };
  /** Every keyed part not yet handled: morphed when both pictures have it, faded in or out when one does. */
  rest(opts?: AnimOpts): AnimationGroup;
}

/**
 * Choreograph a transition from the `current` picture to `target`. Parts are found by key; a part
 * a call brings in is added to the current picture, and a part a call takes out leaves it, so when
 * every part has landed the current picture shows the target's parts.
 */
export function choreograph(current: Mobject, target: Mobject): Choreography {
  const now = keyedParts(current), want = keyedParts(target);
  const done = new Set<string>(), left = new Set<string>(), passing = new Set<string>();
  // A part that has left may enter again, once: replacing a part in place with a new one.
  const claim = (key: string, entering = false) => {
    if (done.has(key) && !(entering && left.has(key))) throw new Error(`t.choreograph(): ${JSON.stringify(key)} is already animated; name each part in one call`);
    if (entering) left.delete(key);
    done.add(key);
  };
  const from = (key: string) => {
    const m = now.get(key);
    if (!m) throw new RangeError(`t.choreograph(): the current picture has no part keyed ${JSON.stringify(key)}`);
    return m;
  };
  const to = (key: string) => {
    const m = want.get(key);
    if (!m) throw new RangeError(`t.choreograph(): the target picture has no part keyed ${JSON.stringify(key)}`);
    return m;
  };
  /** A copy of `like` as the part `key`, in the picture from now on but unseen; its saved state is how it was made. */
  const make = (key: string, like: Mobject) => {
    claim(key, true);
    if (now.has(key)) throw new Error(`t.choreograph(): ${JSON.stringify(key)} is already in the current picture; morph it`);
    const part = like.copy();
    part.key = key;
    part.saveState();
    part.setOpacity(0);
    current.add(part);
    now.set(key, part);
    return part;
  };
  // The author's first move brings it into view. A part the target does not have is passing
  // through, and must leave before the transition ends.
  const insert = (key: string, like: Mobject) => {
    const part = make(key, like);
    if (!want.has(key)) passing.add(key);
    return part;
  };
  const self: Choreography = {
    from,
    to,
    has: (key, side) => (side === 'from' ? now.has(key) : side === 'to' ? want.has(key) : now.has(key) || want.has(key)),
    keys: (side) => [...(side === 'from' ? now : want).keys()],
    morph(key, opts) {
      const a = from(key), b = to(key);
      claim(key);
      return new Transform(a, b, opts);
    },
    enter(key, how = {}, opts = {}) {
      const target = to(key);
      const like = how.from !== undefined ? from(how.from) : target;
      const part = make(key, like);
      const inner = how.from !== undefined ? new Transform(part, target, opts) : how.create ? new Create(part, opts) : new FadeIn(part, opts);
      return new Joining(part, inner);
    },
    leave(key, opts = {}) {
      const part = from(key);
      // A part the author put in that the target does not have may pass through: in, then out.
      if (passing.has(key)) passing.delete(key);
      else claim(key);
      now.delete(key);
      left.add(key);
      return new FadeOut(part, { ...opts, remover: true });
    },
    insert,
    own(key) {
      const part = from(key);
      claim(key);
      return part;
    },
    follow(spec, { targets, ...opts }) {
      return new Follow(spec, { ...opts, targets: targets.map((t) => (typeof t === 'string' ? self.own(t) : t)) });
    },
    travel(key, token, path, { appear = 0.15, move = 0.7, leave = 0.2 } = {}) {
      if (want.has(key)) throw new Error(`t.choreograph(): ${JSON.stringify(key)} is in the target picture, and a travelling token only passes through; travel a key the target does not have`);
      const start = path.pointFromProportion(0);
      const part = insert(key, token.copy().moveTo(start));
      return {
        appear: new Transform(part, token.copy().moveTo(start), { runTime: appear }),
        move: new MoveAlongPath(part, path, { runTime: move, rateFunc: linear }),
        leave: self.leave(key, { runTime: leave }),
      };
    },
    rest(opts = {}) {
      const anims: Animation[] = [];
      for (const key of new Set([...now.keys(), ...want.keys()])) {
        if (done.has(key) && !left.has(key)) continue;
        if (left.has(key)) { if (want.has(key)) anims.push(self.enter(key, {}, opts)); continue; }
        if (now.has(key) && want.has(key)) anims.push(self.morph(key, opts));
        else if (want.has(key)) anims.push(self.enter(key, {}, opts));
        else anims.push(self.leave(key, opts));
      }
      return new AnimationGroup(anims);
    },
  };
  return self;
}
