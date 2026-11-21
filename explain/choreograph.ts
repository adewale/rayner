// Choreograph: an authored transition between two pictures of a view, part by part, by key.
// A machine's transition receives the view's current picture and its target (the picture of the
// state the event reaches, placed where the view finishes). choreograph(current, target) names the
// keyed parts of both, and each call animates some of them in the author's order: morph a part
// into its target, bring a new one in (faded, drawn, or grown from a copy of another part), or
// take a gone one out. rest() moves every keyed part no call has handled to its target, so a transition that
// forgets a part still ends on the target picture. See docs/MACHINES.md.

import { Animation, AnimationGroup, Create, Enclosing, FadeIn, FadeOut, MoveAlongPath, Succession, Transform } from '../src/animation.ts';
import { Text } from '../src/text.ts';
import type { AnimationOptions, TransformOptions } from '../src/animation.ts';
import { Follow } from './state.ts';
import type { FollowSpec } from './state.ts';
import type { Mobject } from '../src/mobject.ts';
import type { VMobject } from '../src/vmobject.ts';
import { linear } from '../src/rate.ts';
import { keyed } from '../src/index.ts';

/**
 * An animation for a part that is already in the picture but unseen: it shows the part as it was
 * made (its saved state) when its turn comes, then runs the animation that brings it in, and is a
 * remover when that one is. A part must be in the picture before the play reaches it, or play()
 * would take it for a new mobject and add it to the stage a second time.
 */
class Joining extends Enclosing {
  readonly #inner: Animation;
  readonly #before?: () => void;
  readonly #after?: () => void;
  constructor(part: Mobject, inner: Animation, { remover }: AnimationOptions, before?: () => void, after?: () => void) {
    super(part, { runTime: inner.runTime, rateFunc: linear, remover });
    this.#inner = inner;
    this.#before = before;
    this.#after = after;
  }
  protected override enclose(): Animation {
    this.#before?.();
    this.mobject.restore();
    return this.#inner;
  }
  protected override doFinish(end = this.rateFunc(1)): void {
    super.doFinish(end);
    if (end === 1) this.#after?.();
  }
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
  morph(key: string, opts?: TransformOptions): Animation;
  /** Bring in a part only the target has: faded in, drawn (`create`), or grown from a copy of the current part `from`. */
  enter(key: string, how?: { from?: string; create?: boolean }, opts?: AnimationOptions): Animation;
  /** Take out a part only the current picture has. */
  leave(key: string, opts?: AnimationOptions): Animation;
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
  follow(spec: FollowSpec, opts: AnimationOptions & { targets: readonly (string | Mobject)[] }): Animation;
  /**
   * A token passing along `path`, a part the target does not have (a message on its arrow, an
   * event walking a link): `appear` brings `token` into view at the path's start, `move` carries it
   * along the path at an even speed, and `leave` takes it out of the picture. Each part is an
   * animation for the author to place, so other motion can run beside it; all three must play.
   */
  travel(key: string, token: Mobject, path: VMobject, times?: { appear?: number; move?: number; leave?: number }): { appear: Animation; move: Animation; leave: Animation };
  /** Every keyed part not yet handled: morphed when both pictures have it, faded in or out when one does. */
  rest(opts?: AnimationOptions & {text?: 'whole' | 'glyphs'}): AnimationGroup;
}

/**
 * Choreograph a transition from the `current` picture to `target`. Parts are found by key; a part
 * a call brings in is added to the current picture, and a part a call takes out leaves it, so when
 * every part has finished the current picture shows the target's parts.
 */
export function choreograph(current: Mobject, target: Mobject, registerTrip?: (key: string, move: Animation) => void): Choreography {
  const now = keyedParts(current), want = keyedParts(target);
  const done = new Set<string>(), left = new Set<string>(), passing = new Set<string>();
  const replacements = new Map<string, Mobject>();
  const originals = new Map(now), entrants = new Map<string, Mobject>(), tokens = new Set<Mobject>();
  /** Keep entrants at the current root: an arbitrary unkeyed wrapper may carry its own clip. */
  function rootChild(part: Mobject | undefined): Mobject | undefined {
    while (part?.parent && part.parent !== current) part = part.parent;
    return part?.parent === current ? part : undefined;
  }
  /** Place a run of new target layers before the next surviving layer, or after the final one. */
  function place(parts: Mobject[], anchor: Mobject | undefined, after: boolean): void {
    if (!parts.length) return;
    const moving = new Set(parts);
    const staying = current.children.filter(m => !moving.has(m));
    const boundary = anchor ?? staying.find(m => tokens.has(m));
    const index = boundary ? staying.indexOf(boundary) + (anchor && after ? 1 : 0) : staying.length;
    if (parts.some((m, i) => current.children[index + i] !== m)) current.insert(index, ...parts);
  }
  function admit(key: string, part: Mobject): void {
    if (!want.has(key)) { current.add(part); tokens.add(part); return; }
    entrants.set(key, part);
    // A replacement can be built before its old part leaves. Once its new copy is
    // admitted the old one is no longer an ordering anchor. Re-evaluate the runs of
    // entrants so construction order cannot strand paper above its words. No original
    // child moves, including unkeyed groups; several keys in one group share its slot.
    let pending: Mobject[] = [], last: Mobject | undefined;
    for (const name of want.keys()) {
      const entering = entrants.get(name);
      if (entering) { pending.push(entering); continue; }
      const anchor = rootChild(originals.get(name));
      if (anchor) {
        if (pending.length) { place(pending, anchor, false); pending = []; }
        last = anchor;
      }
    }
    place(pending, last, true);
  }
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
    keyed(part, key);
    part.saveState();
    part.setOpacity(0);
    admit(key, part);
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
      if (now.has(key)) {
        claim(key);
        const old = from(key), part = target.copy();
        part.saveState(); part.setOpacity(0); admit(key, part);
        replacements.set(key, part);
        return new Joining(part, new FadeIn(part, opts), opts, () => {
          if (current.family().includes(old)) throw new Error(`t.choreograph(): leave ${JSON.stringify(key)} must play before its replacement enters`);
        });
      }
      if (how.from !== undefined) {
        // Keep the target's family and keys intact. A temporary source copy travels/morphs,
        // then hands its identical final ink to the target instead of replacing opaque leaves.
        const part = make(key, target), proxy = like.copy();
        for (const [i, m] of proxy.family().entries()) if (i === 0 || m.key !== undefined) keyed(m, `${key}:source:${i}:${m.key ?? 'part'}`);
        proxy.saveState(); proxy.setOpacity(0);
        // The copy emerges from behind its source instead of covering the source's words.
        current.insert(0,proxy);
        return new Joining(proxy, new Transform(proxy, target, {match: 'shapes', ...opts}), opts, undefined, () => {
          current.remove(proxy); part.restore();
        });
      }
      const part = make(key, like);
      const inner = how.create ? new Create(part, opts) : new FadeIn(part, opts);
      return new Joining(part, inner, opts);
    },
    leave(key, opts = {}) {
      const part = from(key);
      const replacement = replacements.get(key);
      if (replacement) {
        replacements.delete(key);
        now.set(key, replacement);
        return new FadeOut(part, {...opts, remover: true});
      }
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
      const movement = new MoveAlongPath(part, path, { runTime: move, rateFunc: linear });
      registerTrip?.(key, movement);
      return {
        appear: new Transform(part, token.copy().moveTo(start), { runTime: appear }),
        move: movement,
        leave: self.leave(key, { runTime: leave }),
      };
    },
    rest({text = 'whole', ...opts} = {}) {
      const anims: (Animation | AnimationGroup)[] = [];
      for (const key of new Set([...now.keys(), ...want.keys()])) {
        if (done.has(key) && !left.has(key)) continue;
        if (left.has(key)) { if (want.has(key)) anims.push(self.enter(key, {}, opts)); continue; }
        if (now.has(key) && want.has(key)) {
          const a = from(key), b = to(key);
          if (text === 'whole' && a instanceof Text && b instanceof Text && a.text !== b.text) {
            const half = {...opts, runTime: (opts.runTime ?? 1) / 2};
            anims.push(new Succession([self.leave(key, half), self.enter(key, {}, half)]));
          } else anims.push(self.morph(key, opts));
        }
        else if (want.has(key)) anims.push(self.enter(key, {}, opts));
        else anims.push(self.leave(key, opts));
      }
      return new AnimationGroup(anims);
    },
  };
  return self;
}
