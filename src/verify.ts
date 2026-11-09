// Motion verifier: finds visual discontinuities ("jumps") between consecutive
// frames, from the scene itself rather than from pixels.
//
// MotionSink samples every drawn leaf each frame: box center, size, and
// effective alpha. analyzeMotion() then looks for events a viewer perceives as
// a jump rather than motion:
//
//   teleport   position changes far more in one frame than in the frames on
//              either side (a spike, not a fast smooth move)
//   resize     same, for size
//   pop        alpha changes by >= 0.5 in a single frame
//   cut-in     a leaf appears already mostly opaque (no fade, no draw-in)
//   cut-out    a leaf vanishes while mostly opaque
//   flicker    a leaf vanishes and comes back within a few frames
//   handoff    one leaf is replaced by another in the same frame (a
//              ReplacementTransform) but the replacement is somewhere else
//
// A cut-out and cut-in in the same frame with matching boxes is a seamless
// handoff and is not reported, nor is a cut-in over a leaf that stays, in about
// the same place and no more opaque, when it was copied from that leaf
// (TransformFromCopy) or every part of it looks like a part of that leaf (same
// shape and paints: a copy, or a piece of one, laid over its source). Every
// event carries the step it happened in.

import { VMobject } from './vmobject.ts';
import { copiedFrom } from './animation.ts';
import type { Box, HasText, Mobject } from './mobject.ts';
import { mobjectName, paintsFill, paintsStroke } from './mobject.ts';
import type { EndedStep, Scene, Sink, Step } from './scene.ts';
import { FRAME } from './units.ts';
import { pad } from './box.ts';

/**
 * One drawn leaf in one frame: box center, size and effective alpha. On every
 * leaf of a frame in which some leaf appears, also `look` (each part's shape,
 * as VMobject.shapeKey(), and which of fill and stroke show; the parts of a
 * merged run like a Text are its glyphs) and, for a leaf of a
 * TransformFromCopy's copy, `from`: the id of the source leaf it copies.
 */
interface LeafSample { cx: number; cy: number; w: number; h: number; a: number; box: Box; look?: string[]; from?: number }

/**
 * @internal Every frame's leaf samples, in columns: a run of seasons samples about 300,000 leaves,
 * which as one object each held over 100 MB. Frame f's samples are the indices from `start[f]` to
 * `start[f + 1]`; each sample is a leaf id, its screen box and its alpha, and the samples of a frame
 * in which some leaf appears also carry a look (and a copied leaf its source) in `looks` and `from`.
 */
export class MotionSamples {
  /** Frames sampled. */
  length = 0;
  readonly t: number[] = [];
  readonly step: (string | null)[] = [];
  /** Samples stored. */
  size = 0;
  start = new Int32Array(1024);
  id = new Int32Array(4096);
  box = new Float64Array(4 * 4096);
  alpha = new Float64Array(4096);
  readonly looks = new Map<number, string[]>();
  readonly from = new Map<number, number>();
  /** Each part's look once: a leaf keeps its look from frame to frame, and a path's look is long. */
  readonly parts = new Map<string, string>();
  /** Open a frame; its samples follow with add(). */
  frame(t: number, step: string | null): void {
    if (this.length + 2 > this.start.length) this.start = grow(this.start, this.start.length * 2);
    this.t.push(t);
    this.step.push(step);
    this.start[this.length] = this.size;
    this.length++;
    this.start[this.length] = this.size;
  }
  /** Add a sample to the frame opened last; returns its index. */
  add(id: number, b: Box, a: number): number {
    const i = this.size;
    if (i === this.id.length) {
      // Half again each time: what stays unused is at most a third of what is held.
      const n = Math.ceil(1.5 * i);
      this.id = grow(this.id, n);
      this.box = grow(this.box, 4 * n);
      this.alpha = grow(this.alpha, n);
    }
    this.id[i] = id;
    this.size++;
    this.start[this.length] = this.size;
    this.put(i, b, a);
    return i;
  }
  /** Replace sample `i`'s box and alpha. */
  put(i: number, b: Box, a: number): void {
    this.box.set(b, 4 * i);
    this.alpha[i] = a;
  }
  /** Give sample `i` a look, sharing each part's string with every sample that has it. */
  look(i: number, look: readonly string[]): void {
    this.looks.set(i, look.map((part) => {
      const known = this.parts.get(part);
      if (known !== undefined) return known;
      this.parts.set(part, part);
      return part;
    }));
  }
  /** Sample `i` as an object: its box, center, size and alpha computed as they were sampled. */
  sample(i: number): LeafSample {
    const k = 4 * i, b: Box = [this.box[k]!, this.box[k + 1]!, this.box[k + 2]!, this.box[k + 3]!];
    const s: LeafSample = { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, w: b[2] - b[0], h: b[3] - b[1], a: this.alpha[i]!, box: b };
    const look = this.looks.get(i), from = this.from.get(i);
    if (look) s.look = look;
    if (from !== undefined) s.from = from;
    return s;
  }
  /** Frame f's samples, by leaf id. */
  leaves(f: number): Map<number, LeafSample> {
    const leaves = new Map<number, LeafSample>();
    for (let i = this.start[f]!, end = this.start[f + 1]!; i < end; i++) leaves.set(this.id[i]!, this.sample(i));
    return leaves;
  }
}
function grow<T extends Int32Array | Float64Array>(array: T, length: number): T {
  const larger = new (array.constructor as new (n: number) => T)(length);
  larger.set(array);
  return larger;
}

export type MotionKind = 'teleport' | 'resize' | 'pop' | 'cut-in' | 'cut-out' | 'flicker' | 'handoff';
export interface MotionEvent { kind: MotionKind; frame: number; t: number; step: string | null; what: string; magnitude: number; detail: string }

/** analyzeMotion()'s thresholds: what a viewer perceives as a jump rather than motion. */
const LIMITS = {
  minJump: 0.2,      // scene units (frame is 16 wide, so ~1.25% of width, ~16px at 1280)
  spikeRatio: 3,     // displacement must exceed this multiple of both neighbors' displacement
  minResize: 0.25,   // relative size change in one frame
  popAlpha: 0.5,     // alpha change in one frame
  cutAlpha: 0.5,     // appearing/vanishing above this alpha is a cut
  flickerFrames: 3,
  handoffIoU: 0.6,
} as const;

function alphaOf(m: Mobject): number {
  const s = m.style;
  const f = s.fill !== 'none' ? s.fillOpacity : 0;
  const k = s.stroke !== 'none' ? s.strokeOpacity : 0;
  // A path being drawn in is a reveal, not a pop
  return (s.opacity ?? 1) * Math.max(f, k) * (s.drawFraction ?? 1);
}

/** Which paints show: f(ill), s(troke). */
function paintsOf(m: Mobject): string {
  const s = m.style;
  return (paintsFill(s) ? 'f' : '') + (paintsStroke(s) ? 's' : '');
}
/** Each shown part's shape and paints, position and size aside: equal for a copy and its source. */
function lookOf(m: Mobject, unit: boolean): string[] {
  return (unit ? m.children.filter((c) => alphaOf(c) > 0.02) : [m]).map((x) => (x instanceof VMobject ? x.shapeKey() : '') + '/' + paintsOf(x));
}
/** Every part of `a` matches a part of `b` (each used once). */
function partsOf(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (!a || !b || a.length > b.length) return false;
  const left = [...b];
  return a.every((k) => { const i = left.indexOf(k); if (i >= 0) left.splice(i, 1); return i >= 0; });
}

// Text-like mobjects carry their string as `text`; read it structurally
const textOf = (m: Mobject): string | undefined => (m as HasText).text;

// A leaf is named as an error names a mobject (mobjectName: its key, else its text, else its kind),
// inside the nearest ancestor with a key or a text when it has neither; never by its internal id.
function describeLeaf(m: Mobject): string {
  if (m.key !== undefined || textOf(m) != null) return mobjectName(m);
  let p = m.parent;
  while (p && p.key === undefined && textOf(p) == null) p = p.parent;
  return p ? `${mobjectName(m)} in ${mobjectName(p)}` : mobjectName(m);
}

export class MotionSink implements Sink {
  /** @internal Each frame's leaf samples, keyed by the renderer's id; analyzeMotion reads them. */
  frames: MotionSamples;
  /** @internal Each sampled leaf's name, keyed by the renderer's id; analyzeMotion reports with them. */
  labels: Map<number, string>;
  /** @internal The leaves sampled in the last frame, each by its sample's index. */
  last: Map<number, number> | null;
  constructor() { this.frames = new MotionSamples(); this.labels = new Map(); this.last = null; }
  async frame(scene: Scene): Promise<void> {
    const F = this.frames, seen = new Map<number, number>();
    const sampled: Array<[number, Mobject, boolean]> = [];
    F.frame(scene.time, scene.currentStep?.path ?? null);
    // Camera: sample in screen space, in scene units of the default 16-wide frame
    // (exactly world space when the camera is home), so thresholds mean what a
    // reader sees; a camera jump moves every leaf at once.
    const [fx0, fy0, fx1, fy1] = scene.frame.box()!, k = FRAME.w / (fx1 - fx0), cx = (fx0 + fx1) / 2, cy = (fy0 + fy1) / 2;
    const screen = (b: Box): Box => [(b[0] - cx) * k, (b[1] - cy) * k, (b[2] - cx) * k, (b[3] - cy) * k];
    const walk = (m: Mobject): void => {
      // A merged run (Text) is one visual thing whose glyphs are rebuilt when
      // its string changes, so it is tracked as a unit, not per glyph.
      const unit = !!m.mergeLeaves && m.children.length > 0;
      const drawn = unit || (m instanceof VMobject && m.hasPoints());
      if (drawn) {
        const a = unit ? Math.max(...m.children.map(alphaOf)) : alphaOf(m);
        if (a > 0.02) {
          const w = m.box(), b = w && screen(w);
          if (b) {
            // One sample per leaf and frame: a leaf reached twice keeps its first place and its last sample.
            const at = seen.get(m.id);
            if (at !== undefined) F.put(at, b, a);
            else {
              seen.set(m.id, F.add(m.id, b, a));
              sampled.push([seen.get(m.id)!, m, unit]);
            }
            if (!this.labels.has(m.id)) this.labels.set(m.id, describeLeaf(m));
          }
        }
      }
      if (!unit) for (const c of m.children) walk(c);
    };
    for (const top of scene.mobjects) walk(top);
    // Looks are for telling a copy over its source from a new shape, so only frames where a leaf appears need them
    const last = this.last;
    if (last && sampled.some(([, m]) => !last.has(m.id))) {
      for (const [i, m, unit] of sampled) {
        F.look(i, lookOf(m, unit));
        const src = copiedFrom.get(m);
        if (src) F.from.set(i, src.id);
      }
    }
    this.last = seen;
  }
}

// Boxes are padded so thin shapes (a horizontal line has zero height) still overlap
const PAD = 0.05;
const iou = (a0: Box, b0: Box): number => {
  const a = pad(a0, PAD), b = pad(b0, PAD);
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy, area = (r: Box) => Math.max(1e-9, (r[2] - r[0]) * (r[3] - r[1]));
  return inter / (area(a) + area(b) - inter);
};

export function analyzeMotion(sink: MotionSink): MotionEvent[] {
  const F = sink.frames;
  // The frames around the one analysed, as objects: two before it, and those a flicker looks ahead to.
  const window = new Map<number, Map<number, LeafSample>>();
  const leaves = (f: number): Map<number, LeafSample> | undefined => {
    if (f < 0 || f >= F.length) return undefined;
    let found = window.get(f);
    if (!found) window.set(f, (found = F.leaves(f)));
    return found;
  };
  const events: MotionEvent[] = [];
  const ev = (kind: MotionKind, f: number, id: number, magnitude: number, detail = '') =>
    events.push({ kind, frame: f, t: +F.t[f]!.toFixed(3), step: F.step[f] ?? null, what: sink.labels.get(id) ?? 'a leaf', magnitude: +magnitude.toFixed(3), detail });

  const disp = (f: number, id: number): number => {
    const a = leaves(f - 1)?.get(id), b = leaves(f)?.get(id);
    return a && b ? Math.hypot(b.cx - a.cx, b.cy - a.cy) : 0;
  };
  const dsize = (f: number, id: number): number => {
    const a = leaves(f - 1)?.get(id), b = leaves(f)?.get(id);
    if (!a || !b) return 0;
    const rel = (x: number, y: number) => (Math.max(x, y) < 0.05 ? 0 : Math.abs(y - x) / Math.max(x, y));
    return Math.max(rel(a.w, b.w), rel(a.h, b.h));
  };
  const dalpha = (f: number, id: number): number => {
    const a = leaves(f - 1)?.get(id), b = leaves(f)?.get(id);
    return a && b ? Math.abs(b.a - a.a) : 0;
  };

  for (let f = 1; f < F.length; f++) {
    window.delete(f - 3);
    const prev = leaves(f - 1)!, cur = leaves(f)!;
    const cutIns: Array<[number, LeafSample]> = [], cutOuts: Array<[number, LeafSample]> = [];
    for (const [id, s] of cur) {
      const p = prev.get(id);
      if (!p) {
        if (s.a >= LIMITS.cutAlpha) cutIns.push([id, s]);
        continue;
      }
      const d = disp(f, id);
      if (d > LIMITS.minJump && d > LIMITS.spikeRatio * Math.max(disp(f - 1, id), disp(f + 1, id))) ev('teleport', f, id, d, `moved ${d.toFixed(2)} in one frame`);
      const z = dsize(f, id);
      if (z > LIMITS.minResize && z > LIMITS.spikeRatio * Math.max(dsize(f - 1, id), dsize(f + 1, id))) ev('resize', f, id, z, `size changed ${(100 * z).toFixed(0)}% in one frame`);
      const da = dalpha(f, id);
      if (da >= LIMITS.popAlpha) ev('pop', f, id, da, `alpha ${p.a.toFixed(2)} → ${s.a.toFixed(2)}`);
    }
    for (const [id, p] of prev) if (!cur.has(id) && p.a >= LIMITS.cutAlpha) cutOuts.push([id, p]);

    // Pair same-frame replacements: a matching box is a seamless handoff
    const usedIn = new Set<number>();
    for (const [oid, op] of cutOuts) {
      let best: [number, LeafSample] | null = null, bestScore = 0;
      for (const [iid, ip] of cutIns) {
        if (usedIn.has(iid)) continue;
        const score = iou(op.box, ip.box);
        if (score > bestScore) { best = [iid, ip]; bestScore = score; }
      }
      if (best && bestScore >= LIMITS.handoffIoU) { usedIn.add(best[0]); continue; }
      if (best && bestScore > 0) {
        usedIn.add(best[0]);
        const d = Math.hypot(best[1].cx - op.cx, best[1].cy - op.cy);
        ev('handoff', f, best[0], d, `replaced ${sink.labels.get(oid)} with box overlap ${(100 * bestScore).toFixed(0)}%`);
        continue;
      }
      // Gone: flicker if it comes back soon, else a hard cut
      let back = 0;
      for (let k = f + 1; k < Math.min(F.length, f + 1 + LIMITS.flickerFrames); k++) if (leaves(k)!.has(oid)) { back = k; break; }
      if (back) ev('flicker', f, oid, back - f, `hidden for ${back - f} frame(s)`);
      else ev('cut-out', f, oid, op.a, `vanished at alpha ${op.a.toFixed(2)}`);
    }
    // A leaf appearing over one that was and still is drawn there, no more opaque,
    // changes nothing a viewer sees when it is a copy of that leaf (TransformFromCopy)
    // or its parts look like that leaf's. A filled shape inside an outline is a cut-in.
    const overStaying = (s: LeafSample): boolean => {
      for (const [id, q] of cur) if (prev.has(id) && q.a + 0.02 >= s.a && iou(q.box, s.box) >= LIMITS.handoffIoU && (s.from === id || partsOf(s.look, q.look))) return true;
      return false;
    };
    for (const [iid, ip] of cutIns) if (!usedIn.has(iid)) {
      // A leaf already present in the first rendered frames of the scene is just the opening state
      if (f > 1 && !overStaying(ip)) ev('cut-in', f, iid, ip.a, `appeared at alpha ${ip.a.toFixed(2)}`);
    }
  }
  return events;
}


// ---- invariants --------------------------------------------------------

/** One frame on which a registered invariant did not hold. */
export interface InvariantFailure {
  invariant: string;
  /** The step running, or null before the first. */
  step: string | null;
  frame: number;
  t: number;
  message: string;
}

/**
 * Checks a scene's invariants (Scene.addInvariant) on every frame it is handed, then
 * hands the frame on to `inner` if given, so it rides along with any other sink. A check
 * that throws fails with what it threw. `failures` lists every failing frame, `checked`
 * how many frames each invariant ran on, and `held` how many it returned `true` on. A
 * invariant that ran but never held found nothing to check: `vacuous()` names those.
 */
export class InvariantSink implements Sink {
  readonly inner: Sink | null;
  readonly failures: InvariantFailure[];
  readonly checked: Map<string, number>;
  readonly held: Map<string, number>;
  constructor(inner: Sink | null = null) { this.inner = inner; this.failures = []; this.checked = new Map(); this.held = new Map(); }

  /** The invariants that ran on some frame and held on none: invariants that tested nothing. */
  vacuous(): string[] { return [...this.checked.keys()].filter((name) => !this.held.get(name)); }

  /** Run every invariant against the scene as it is now. */
  check(scene: Scene): void {
    for (const [invariant, test] of scene.invariants) {
      this.checked.set(invariant, (this.checked.get(invariant) ?? 0) + 1);
      let result: unknown;
      try { result = test(scene); } catch (e) { result = `threw ${e instanceof Error ? e.message : String(e)}`; }
      if (typeof result === 'string')
        this.failures.push({ invariant, step: scene.currentStep?.name ?? null, frame: scene.frameCount, t: scene.time, message: result });
      else if (result === true) this.held.set(invariant, (this.held.get(invariant) ?? 0) + 1);
    }
  }

  async frame(scene: Scene, dt: number): Promise<void> {
    this.check(scene);
    await this.inner?.frame(scene, dt);
  }
  async stepBegin(scene: Scene, step: Step): Promise<void> { await this.inner?.stepBegin?.(scene, step); }
  async stepEnd(scene: Scene, step: EndedStep): Promise<void> { await this.inner?.stepEnd?.(scene, step); }
}
