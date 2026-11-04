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
import type { Scene, Sink, Step } from './scene.ts';
import { FRAME } from './svg.ts';

/** Thresholds for analyzeMotion(); see DEFAULTS. */
export interface MotionOptions {
  minJump?: number;
  spikeRatio?: number;
  minResize?: number;
  popAlpha?: number;
  cutAlpha?: number;
  flickerFrames?: number;
  handoffIoU?: number;
}

/**
 * One drawn leaf in one frame: box center, size and effective alpha. On every
 * leaf of a frame in which some leaf appears, also `look` (each part's shape,
 * as VMobject.shapeKey(), and which of fill and stroke show; the parts of a
 * merged run like a Text are its glyphs) and, for a leaf of a
 * TransformFromCopy's copy, `from`: the id of the source leaf it copies.
 */
export interface LeafSample { cx: number; cy: number; w: number; h: number; a: number; box: Box; look?: string[]; from?: number }
export interface MotionFrame { t: number; step: string | null; leaves: Map<number, LeafSample> }

export type MotionKind = 'teleport' | 'resize' | 'pop' | 'cut-in' | 'cut-out' | 'flicker' | 'handoff';
export interface MotionEvent { kind: MotionKind; frame: number; t: number; step: string | null; what: string; magnitude: number; detail: string }

const DEFAULTS: Required<MotionOptions> = {
  minJump: 0.2,      // scene units (frame is 16 wide, so ~1.25% of width, ~16px at 1280)
  spikeRatio: 3,     // displacement must exceed this multiple of both neighbors' displacement
  minResize: 0.25,   // relative size change in one frame
  popAlpha: 0.5,     // alpha change in one frame
  cutAlpha: 0.5,     // appearing/vanishing above this alpha is a cut
  flickerFrames: 3,
  handoffIoU: 0.6,
};

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
  return (s.fill !== 'none' && s.fillOpacity > 0 ? 'f' : '') + (s.stroke !== 'none' && s.strokeOpacity > 0 && s.strokeWidth > 0 ? 's' : '');
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

function describeLeaf(m: Mobject): string {
  let p = m;
  while (p && textOf(p) == null && p.parent) { p = p.parent; }
  const text = textOf(p);
  const label = text != null ? `"${text.length > 28 ? text.slice(0, 27) + '…' : text}"` : '';
  return `${m.constructor.name}#${m.id}${label ? ' in ' + (p.constructor.name) + ' ' + label : ''}`;
}

export class MotionSink implements Sink {
  frames: MotionFrame[];
  labels: Map<number, string>;
  constructor() { this.frames = []; this.labels = new Map(); }
  async frame(scene: Scene): Promise<void> {
    const f = new Map<number, LeafSample>();
    const sampled: Array<[LeafSample, Mobject, boolean]> = [];
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
            const s: LeafSample = { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, w: b[2] - b[0], h: b[3] - b[1], a, box: b };
            f.set(m.id, s);
            sampled.push([s, m, unit]);
            if (!this.labels.has(m.id)) this.labels.set(m.id, describeLeaf(m));
          }
        }
      }
      if (!unit) for (const c of m.children) walk(c);
    };
    for (const top of scene.mobjects) walk(top);
    // Looks are for telling a copy over its source from a new shape, so only frames where a leaf appears need them
    const last = this.frames.at(-1)?.leaves;
    if (last && sampled.some(([, m]) => !last.has(m.id))) {
      for (const [s, m, unit] of sampled) {
        s.look = lookOf(m, unit);
        const src = copiedFrom.get(m);
        if (src) s.from = src.id;
      }
    }
    this.frames.push({ t: scene.time, step: scene.currentStep?.path ?? null, leaves: f });
  }
}

// Boxes are padded so thin shapes (a horizontal line has zero height) still overlap
const PAD = 0.05;
const iou = (a0: Box, b0: Box): number => {
  const a: Box = [a0[0] - PAD, a0[1] - PAD, a0[2] + PAD, a0[3] + PAD], b: Box = [b0[0] - PAD, b0[1] - PAD, b0[2] + PAD, b0[3] + PAD];
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy, area = (r: Box) => Math.max(1e-9, (r[2] - r[0]) * (r[3] - r[1]));
  return inter / (area(a) + area(b) - inter);
};

export function analyzeMotion(sink: MotionSink, opts: MotionOptions = {}): MotionEvent[] {
  const o = { ...DEFAULTS, ...opts };
  const F = sink.frames;
  const events: MotionEvent[] = [];
  const ev = (kind: MotionKind, f: number, id: number, magnitude: number, detail = '') =>
    events.push({ kind, frame: f, t: +F[f]!.t.toFixed(3), step: F[f]!.step, what: sink.labels.get(id) ?? `#${id}`, magnitude: +magnitude.toFixed(3), detail });

  const disp = (f: number, id: number): number => {
    const a = F[f - 1]?.leaves.get(id), b = F[f]?.leaves.get(id);
    return a && b ? Math.hypot(b.cx - a.cx, b.cy - a.cy) : 0;
  };
  const dsize = (f: number, id: number): number => {
    const a = F[f - 1]?.leaves.get(id), b = F[f]?.leaves.get(id);
    if (!a || !b) return 0;
    const rel = (x: number, y: number) => (Math.max(x, y) < 0.05 ? 0 : Math.abs(y - x) / Math.max(x, y));
    return Math.max(rel(a.w, b.w), rel(a.h, b.h));
  };
  const dalpha = (f: number, id: number): number => {
    const a = F[f - 1]?.leaves.get(id), b = F[f]?.leaves.get(id);
    return a && b ? Math.abs(b.a - a.a) : 0;
  };

  for (let f = 1; f < F.length; f++) {
    const prev = F[f - 1]!.leaves, cur = F[f]!.leaves;
    const cutIns: Array<[number, LeafSample]> = [], cutOuts: Array<[number, LeafSample]> = [];
    for (const [id, s] of cur) {
      const p = prev.get(id);
      if (!p) {
        if (s.a >= o.cutAlpha) cutIns.push([id, s]);
        continue;
      }
      const d = disp(f, id);
      if (d > o.minJump && d > o.spikeRatio * Math.max(disp(f - 1, id), disp(f + 1, id))) ev('teleport', f, id, d, `moved ${d.toFixed(2)} in one frame`);
      const z = dsize(f, id);
      if (z > o.minResize && z > o.spikeRatio * Math.max(dsize(f - 1, id), dsize(f + 1, id))) ev('resize', f, id, z, `size changed ${(100 * z).toFixed(0)}% in one frame`);
      const da = dalpha(f, id);
      if (da >= o.popAlpha) ev('pop', f, id, da, `alpha ${p.a.toFixed(2)} → ${s.a.toFixed(2)}`);
    }
    for (const [id, p] of prev) if (!cur.has(id) && p.a >= o.cutAlpha) cutOuts.push([id, p]);

    // Pair same-frame replacements: a matching box is a seamless handoff
    const usedIn = new Set<number>();
    for (const [oid, op] of cutOuts) {
      let best: [number, LeafSample] | null = null, bestScore = 0;
      for (const [iid, ip] of cutIns) {
        if (usedIn.has(iid)) continue;
        const score = iou(op.box, ip.box);
        if (score > bestScore) { best = [iid, ip]; bestScore = score; }
      }
      if (best && bestScore >= o.handoffIoU) { usedIn.add(best[0]); continue; }
      if (best && bestScore > 0) {
        usedIn.add(best[0]);
        const d = Math.hypot(best[1].cx - op.cx, best[1].cy - op.cy);
        ev('handoff', f, best[0], d, `replaced ${sink.labels.get(oid)} with box overlap ${(100 * bestScore).toFixed(0)}%`);
        continue;
      }
      // Gone: flicker if it comes back soon, else a hard cut
      let back = 0;
      for (let k = f + 1; k < Math.min(F.length, f + 1 + o.flickerFrames); k++) if (F[k]!.leaves.has(oid)) { back = k; break; }
      if (back) ev('flicker', f, oid, back - f, `hidden for ${back - f} frame(s)`);
      else ev('cut-out', f, oid, op.a, `vanished at alpha ${op.a.toFixed(2)}`);
    }
    // A leaf appearing over one that was and still is drawn there, no more opaque,
    // changes nothing a viewer sees when it is a copy of that leaf (TransformFromCopy)
    // or its parts look like that leaf's. A filled shape inside an outline is a cut-in.
    const overStaying = (s: LeafSample): boolean => {
      for (const [id, q] of cur) if (prev.has(id) && q.a + 0.02 >= s.a && iou(q.box, s.box) >= o.handoffIoU && (s.from === id || partsOf(s.look, q.look))) return true;
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
  failures: InvariantFailure[];
  checked: Map<string, number>;
  held: Map<string, number>;
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
  async stepEnd(scene: Scene, step: Step): Promise<void> { await this.inner?.stepEnd?.(scene, step); }
}
