// Temporary transition members retain their target's paint ancestry. Existing source members
// keep their relative order; only admissions move, into the slots named by target siblings.
import { copyAlone, type Mobject } from './mobject.ts';

/** Apply the complete target viewport to an entering member, including its mapped owner. */
export function targetClip(part: Mobject, target: Mobject, root: Mobject): void {
  for (let p = target; p; p = p.parent!) {
    const b = p.clipBox;
    if (b) {
      const a = part.clipBox;
      if (!a) part.clipBox = [...b];
      else {
        const x = Math.max(a[0], b[0]), y = Math.max(a[1], b[1]);
        part.clipBox = [x, y, Math.max(x, Math.min(a[2], b[2])), Math.max(y, Math.min(a[3], b[3]))];
      }
    }
    if (p === root) break;
  }
}

/** Order admitted direct children by target paint order, around retained source anchors. */
export function placeTargetSlots(home: Mobject, target: Mobject, pairs: ReadonlyMap<Mobject, Mobject>, admitted: ReadonlySet<Mobject>, tail?: ReadonlySet<Mobject>): void {
  const childOf = (part: Mobject): Mobject | undefined => {
    while (part.parent && part.parent !== home) part = part.parent;
    return part.parent === home ? part : undefined;
  };
  const order: Mobject[] = [], seen = new Set<Mobject>();
  for (const member of target.family()) {
    const paired = pairs.get(member), child = paired && childOf(paired);
    if (child && !seen.has(child)) { seen.add(child); order.push(child); }
  }
  const place = (pending: Mobject[], anchor?: Mobject, after = false): void => {
    if (!pending.length) return;
    const moving = new Set(pending), staying = home.children.filter(m => !moving.has(m));
    const boundary = anchor ?? staying.find(m => tail?.has(m));
    const index = boundary ? staying.indexOf(boundary) + (anchor && after ? 1 : 0) : staying.length;
    home.insert(index, ...pending);
  };
  let pending: Mobject[] = [], last: Mobject | undefined;
  for (const child of order) {
    if (admitted.has(child)) pending.push(child);
    else { place(pending, child); pending = []; last = child; }
  }
  place(pending, last, true);
}

/** Hierarchy for keyed choreography. Surviving descendants identify unkeyed wrappers only when
 * that correspondence is unambiguous; otherwise an entrance gets its own target container. */
export class TargetSlots {
  readonly #pairs: Map<Mobject, Mobject>;
  readonly #admitted = new Set<Mobject>();
  readonly #source: Mobject;
  readonly #target: Mobject;
  readonly #tail: ReadonlySet<Mobject>;
  constructor(source: Mobject, target: Mobject, retained: ReadonlyMap<Mobject, Mobject>, tail: ReadonlySet<Mobject>) {
    this.#source = source; this.#target = target; this.#tail = tail;
    this.#pairs = new Map([[target, source], ...retained]);
    const ancestry = (part: Mobject, root: Mobject) => {
      const path: Mobject[] = [];
      for (let p = part.parent; p && p !== root; p = p.parent) path.unshift(p);
      return path;
    };
    const candidates = new Map<Mobject, Set<Mobject>>();
    for (const [t, s] of retained) {
      const a = ancestry(t, target), b = ancestry(s, source);
      if (a.length !== b.length) continue;
      a.forEach((p, i) => {
        if (p.key !== undefined || b[i]!.key !== undefined) return;
        const matches = candidates.get(p) ?? new Set<Mobject>();
        matches.add(b[i]!); candidates.set(p, matches);
      });
    }
    for (const [t, matches] of candidates) if (matches.size === 1) {
      const s = [...matches][0]!;
      if ([...candidates].every(([other, choices]) => other === t || !choices.has(s))) this.#pairs.set(t, s);
    }
  }
  #home(target: Mobject): Mobject {
    const old = this.#pairs.get(target);
    if (old) return old;
    const home = this.#home(target.parent!), shell = copyAlone(target);
    home.add(shell); this.#pairs.set(target, shell); this.#admitted.add(shell);
    return shell;
  }
  add(target: Mobject, part: Mobject): void {
    const home = this.#home(target.parent!);
    targetClip(part, target, this.#target);
    home.add(part); this.#pairs.set(target, part); this.#admitted.add(part);
    // Revisit prior entrants too: replacing an anchor must not strand its earlier siblings.
    for (const [t, s] of this.#pairs) if (s === this.#source || s.children.length)
      placeTargetSlots(s, t, this.#pairs, this.#admitted, s === this.#source ? this.#tail : undefined);
  }
}
