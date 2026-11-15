// Keyed motion: the motion defects a reader sees in a part, found from the scene rather than from
// pixels, by following each keyed part (keyed()) from frame to frame within one transition: one
// play() of a run, or one machine event as a reader presses it.
//
// MotionSink (verify.ts) follows the renderer's leaves, so a part redrawn as new mobjects, which is
// what a view's rebuild and a choreography's leave-then-enter do, is a different thing to it from
// one frame to the next, and `rayner check` never ran it on a reader's press. A key is the part's
// address across those redraws, so this follows parts by key and finds three defects that filming
// every transition found in the Poppy series (issue #101, items 12 and 14), and no check saw:
//
//   jump          a part on screen in consecutive frames moves (or changes size) much more over one
//                 frame step, or two, than in the steps either side: a snap, not travel. Measured on
//                 the leaves on screen in both frames, so a leaf fading in beside the rest moves
//                 nothing; a part whose words change, or that is redrawn in about the same place,
//                 is not judged there.
//   flicker       a readable part fades well down (or goes) and comes back within the transition,
//                 with the same words, colours and place on both sides of the gap: a blink. Words
//                 that change are a change; a part hidden while a token travels that comes back once
//                 it lands is the event's result waiting for its cause (the kit's `fresh`).
//   early words   words new or changed since the transition began become readable near where a
//                 token lands while it is still travelling: a result shown before its cause lands.
//                 A token passes through (on screen in neither the first frame nor the last, as
//                 c.travel, flight and pass make one) and travels at least a unit keeping its size.
//
// Each threshold (KEYED_MOTION_LIMITS) is in stage units of the default 16-wide frame (screen space:
// a camera move is motion of every part) and in seconds, so a scene at another fps is judged alike.
// `rayner check` runs it on every play of every scenario and on every transition, authored or the
// views' own morph, from every state a reader can reach.

import { VMobject } from './vmobject.ts';
import type { Box, Mobject } from './mobject.ts';
import { mergeLeaves, mobjectId, paintsFill, paintsStroke } from './mobject.ts';
import type { Scene, Sink } from './scene.ts';
import { playsBegun } from './scene.ts';
import { FRAME } from './units.ts';

export type KeyedMotionKind = 'jump' | 'flicker' | 'early words';
/** One defect: in which transition, which part, when (seconds from the transition's first frame), and how much. */
export interface KeyedMotionFinding {
  kind: KeyedMotionKind;
  /** The transition: a play (and event) of a step in a run, `step "fill", play 2, event 3`, or what the caller named it. */
  segment: string;
  /** The part's key; `path` is it with the keys of the keyed parts around it. */
  key: string;
  path: string;
  /** Seconds since the transition's first sampled frame, to the millisecond. */
  t: number;
  /** The measured value: units moved (jump, or a size change as a fraction), seconds hidden (flicker), or the alpha the words reached (early words). */
  value: number;
  detail: string;
  /** One line on how to fix it. */
  fix: string;
}

/** The thresholds, each one what a reader perceives, in stage units (16 wide) and seconds. */
export const KEYED_MOTION_LIMITS = {
  /** A part redrawn as new mobjects whose boxes overlap by this much (intersection over union) is handed off in place, not moved. */
  handoff: 0.5,
  /** A part counts as on screen at this alpha; fainter motion is not a visible jump. */
  shown: 0.2,
  /** A jump moves at least this many units in one frame step at 30 fps (scaled with the step: 7.5 units a second). */
  jump: 0.25,
  /** ...and this many times more than in the frame step before it and the one after it: a spike, not fast travel. */
  spike: 3,
  /** Over two frame steps (a move shorter than a frame step that straddles two frames), this many times the steps either side. */
  spike2: 10,
  /** A size jump: this fraction of the part's size in one frame step, on a part at least `minSize` units across. */
  resize: 0.25,
  minSize: 0.1,
  /** Flicker: a part at least this opaque (readable)... */
  readable: 0.5,
  /** ...that falls under this share of its alpha... */
  dip: 0.4,
  /** ...and comes back to this share of it... */
  back: 0.9,
  /** ...in the same place (centre within `same` units, size within `same` units) with the same words and colours. */
  same: 0.08,
  /** A token (a part passing through) travels at least this far (units) on one trip: its landing excuses a blink, and early words wait for it... */
  travel: 0.5,
  /** Early words: the token has at least this far (units) still to go when the words become readable... */
  toGo: 0.5,
  /** ...and the words are within this many units of where it lands: what its arrival makes, not words elsewhere on the stage. */
  near: 2,
} as const;

/** One keyed part in one frame. Its words and look are read from its leaves when asked, since few parts are ever asked. */
class PartSample {
  /** How many mobjects drew under this address this frame: more than one is ambiguous for jumps. */
  n = 1;
  #text: string | undefined;
  #look: string | undefined;
  readonly key: string;
  /** The frame's leaves; this part's are from `from` up to `to` (a part's leaves are consecutive in drawing order). */
  readonly leaves: readonly Leaf[];
  readonly from: number;
  readonly to: number;
  /** Its alpha: its most opaque leaf's. */
  readonly a: number;
  /** Words of its own (a number drawn as glyphs), which its leaves do not carry. */
  readonly own: string | undefined;
  constructor(key: string, leaves: readonly Leaf[], from: number, to: number, a: number, own: string | undefined) {
    this.key = key;
    this.leaves = leaves;
    this.from = from;
    this.to = to;
    this.a = a;
    this.own = own;
  }
  /** Its box on screen: the union of its leaves drawn at half its alpha or more, so a faint leaf does not stretch it. */
  get box(): Box { return unionOf(this.leaves, this.from, this.to, this.a / 2); }
  /** The words it shows, '' when none. */
  get text(): string {
    if (this.#text === undefined) {
      const words: string[] = [];
      if (this.own === undefined) for (let i = this.from; i < this.to; i++) if (this.leaves[i]!.text !== undefined) words.push(this.leaves[i]!.text!);
      this.#text = this.own ?? words.join(' ');
    }
    return this.#text;
  }
  /** Its words, and the paints of each of its leaves: equal on both sides of a blink. */
  get look(): string {
    if (this.#look === undefined) {
      const paints: string[] = [];
      for (let i = this.from; i < this.to; i++) paints.push(this.leaves[i]!.paint);
      this.#look = `${this.text}|${paints.join(',')}`;
    }
    return this.#look;
  }
}
/** One drawn leaf: the renderer's id for it, its box on screen, its alpha, the fill and stroke that show, and its words if it is a run of text. */
interface Leaf { id: number; box: Box; a: number; paint: string; text?: string }
interface Frame { t: number; parts: Map<string, PartSample>; leaves: Leaf[] }

/** A leaf's alpha as MotionSink reads it: opacity times the paint that shows, times how far it is drawn. */
function alphaOf(m: Mobject): number {
  const s = m.style;
  const f = s.fill !== 'none' ? s.fillOpacity : 0;
  const k = s.stroke !== 'none' ? s.strokeOpacity : 0;
  return (s.opacity ?? 1) * Math.max(f, k) * (s.drawFraction ?? 1);
}
const textOf = (m: Mobject): string | undefined => {
  const t = (m as { text?: unknown }).text;
  return typeof t === 'string' ? t : undefined;
};

/**
 * Samples every keyed part of every frame it is handed: its box on screen, its alpha (the most
 * opaque of its drawn leaves), its words and its look. Frames are grouped into transitions by
 * `segmentOf` (default: the step running); each finished transition is analysed as it ends, and
 * `finish()` analyses the last. What it finds is in `findings`.
 */
export class KeyedMotionSink implements Sink {
  readonly findings: KeyedMotionFinding[] = [];
  /** Frames sampled in all. */
  frames = 0;
  #segment: string | null = null;
  #current: Frame[] = [];
  readonly #segmentOf: (scene: Scene) => string | null;
  #dt = 1 / 30;
  /** Plays begun in the step running, for naming a play by its place in its step, and the machine events sent in the play running. */
  #step: { path: string | null; plays: number; last: number; events: number } = { path: null, plays: 0, last: -1, events: 0 };
  /** How much of the scene's evidence has been read for events. */
  #read = 0;
  /**
   * `segmentOf` names the transition a frame belongs to. By default each play() of a run is one
   * transition, named by its step and its place there (`step "burst", play 2`), and so is each
   * machine event a play sends (`step "fill", play 2, event 3`), since a replay sends several in one
   * play; a wait's frames belong to the play before them.
   */
  constructor(segmentOf?: (scene: Scene) => string | null) {
    this.#segmentOf = segmentOf ?? ((scene) => {
      const path = scene.currentStep?.path ?? null, n = playsBegun(scene);
      if (path !== this.#step.path) this.#step = { path, plays: 0, last: -1, events: 0 };
      if (n !== this.#step.last) this.#step = { path, plays: this.#step.plays + 1, last: n, events: 0 };
      // An event is recorded as its state change begins (SetState), at the start of its transition.
      for (const ev = scene.evidence; this.#read < ev.length; this.#read++) if (ev[this.#read]!.kind === 'event') this.#step.events++;
      return path === null ? null : `step "${path}", play ${this.#step.plays}${this.#step.events ? `, event ${this.#step.events}` : ''}`;
    });
  }
  async frame(scene: Scene, _dt = 0): Promise<void> {
    const segment = this.#segmentOf(scene);
    if (segment !== this.#segment) {
      this.#close();
      this.#segment = segment;
    }
    this.#dt = 1 / scene.fps;
    this.#current.push(sampleFrame(scene));
    this.frames++;
  }
  /** Analyse the transition still open. */
  finish(): KeyedMotionFinding[] {
    this.#close();
    return this.findings;
  }
  #close(): void {
    if (this.#segment !== null && this.#current.length > 1) this.findings.push(...analyzeKeyedMotion(this.#current, this.#segment, this.#dt));
    // The next transition starts from the picture this one left: its first frame.
    this.#current = this.#current.slice(-1);
  }
}

/** One frame's keyed parts, by address (the keys of the keyed parts around a part, then its own), and its drawn leaves. */
function sampleFrame(scene: Scene): Frame {
  const [fx0, fy0, fx1, fy1] = scene.frame.box()!, k = FRAME.w / (fx1 - fx0), cx = (fx0 + fx1) / 2, cy = (fy0 + fy1) / 2;
  const parts = new Map<string, PartSample>(), leaves: Leaf[] = [];
  const seen = new Set<Mobject>();
  /** Walks `m`, adding its drawn leaves; returns the alpha of its most opaque one. */
  const walk = (m: Mobject, path: string): number => {
    if (seen.has(m)) return 0;
    seen.add(m);
    const from = leaves.length;
    const here = m.key !== undefined ? (path ? `${path}/${m.key}` : m.key) : path;
    // A merged run (Text) is one visual thing whose glyphs are rebuilt when its words change, so it is one leaf, as MotionSink takes it.
    const unit = !!m[mergeLeaves] && m.children.length > 0;
    const text = textOf(m);
    let alpha = 0;
    if (unit || (m instanceof VMobject && m.hasPoints())) {
      const a = unit ? Math.max(...m.children.map(alphaOf)) : alphaOf(m);
      const b = a > 0.02 ? m.box() : null;
      if (b) {
        const st = unit ? m.children[0]!.style : m.style;
        const leaf: Leaf = { id: mobjectId(m), box: [(b[0] - cx) * k, (b[1] - cy) * k, (b[2] - cx) * k, (b[3] - cy) * k], a, paint: `${paintsFill(st) ? st.fill : ''}/${paintsStroke(st) ? st.stroke : ''}` };
        if (text !== undefined) leaf.text = text;
        leaves.push(leaf);
        alpha = a;
      }
    }
    if (!unit) for (const c of m.children) alpha = Math.max(alpha, walk(c, here));
    const to = leaves.length;
    if (m.key !== undefined && to > from) {
      const had = parts.get(here);
      const sample = new PartSample(m.key, leaves, from, to, alpha, text !== undefined && !unit ? text : undefined);
      // Two mobjects under one address: one going as another comes. Kept as one, the more opaque, marked ambiguous.
      if (!had) parts.set(here, sample);
      else {
        sample.n = had.n + 1;
        if (alpha > had.a) parts.set(here, sample);
        else had.n++;
      }
    }
    return alpha;
  };
  for (const top of scene.mobjects) walk(top, '');
  return { t: scene.time, parts, leaves };
}

/** The union of the boxes of `leaves[from..to)` whose alpha is at least `min` (all of them when none is). */
function unionOf(leaves: readonly Leaf[], from: number, to: number, min: number): Box {
  let out: Box | null = null;
  for (let pass = 0; pass < 2 && !out; pass++)
    for (let i = from; i < to; i++) {
      const l = leaves[i]!;
      if (pass === 0 && l.a < min) continue;
      out = out ? [Math.min(out[0], l.box[0]), Math.min(out[1], l.box[1]), Math.max(out[2], l.box[2]), Math.max(out[3], l.box[3])] : [...l.box];
    }
  return out!;
}

/**
 * How part `p` moved from frame `a` to frame `b`, judged by the leaves on screen in both (by the
 * renderer's id), so a leaf fading in or out beside the rest does not move it: the boxes those leaves
 * fill in each frame. When none is in both, the part was redrawn as new mobjects (a view taking its
 * picture, a sync's finish swapping in its target). That is a handoff, which moves nothing, when each
 * new leaf lies where some leaf was already drawn in frame `a` (a sync draws what comes with mobjects
 * of its own until it finishes), or when its boxes overlap by `handoff` or more; otherwise its two boxes.
 */
function commonBoxes(a: Frame, b: Frame, pa: PartSample, pb: PartSample, min: number): [Box, Box] {
  const before = new Map<number, Box>();
  for (let i = pa.from; i < pa.to; i++) if (a.leaves[i]!.a >= min) before.set(a.leaves[i]!.id, a.leaves[i]!.box);
  let x: Box | null = null, y: Box | null = null;
  const grow = (u: Box | null, v: Box): Box => (u ? [Math.min(u[0], v[0]), Math.min(u[1], v[1]), Math.max(u[2], v[2]), Math.max(u[3], v[3])] : [...v]);
  for (let i = pb.from; i < pb.to; i++) {
    const l = b.leaves[i]!, was = before.get(l.id);
    if (l.a < min || !was) continue;
    x = grow(x, was);
    y = grow(y, l.box);
  }
  if (x && y) return [x, y];
  const near = (u: Box, v: Box) => Math.abs(u[0] - v[0]) <= 0.05 && Math.abs(u[1] - v[1]) <= 0.05 && Math.abs(u[2] - v[2]) <= 0.05 && Math.abs(u[3] - v[3]) <= 0.05;
  let drawn = true;
  for (let i = pb.from; i < pb.to && drawn; i++) {
    const l = b.leaves[i]!;
    if (l.a >= min) drawn = a.leaves.some((m) => m.a >= min && near(m.box, l.box));
  }
  return drawn || iou(pa.box, pb.box) >= KEYED_MOTION_LIMITS.handoff ? [pb.box, pb.box] : [pa.box, pb.box];
}

const centre = (b: Box) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] as const;
const moved = (a: Box, b: Box) => {
  const [ax, ay] = centre(a), [bx, by] = centre(b);
  return Math.hypot(bx - ax, by - ay);
};
const samePlace = (a: Box, b: Box, tol: number) =>
  moved(a, b) <= tol && Math.abs(a[2] - a[0] - (b[2] - b[0])) <= tol && Math.abs(a[3] - a[1] - (b[3] - b[1])) <= tol;
const ms = (t: number) => Math.round(t * 1000) / 1000;
const fmt = (n: number, d = 2) => n.toFixed(d);
/** The distance between two boxes: 0 when they touch or overlap. */
const gap = (a: Box, b: Box) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
/** How much two boxes overlap: their intersection over their union, each padded so a line's zero height still counts. */
function iou(a0: Box, b0: Box): number {
  const pad = 0.05, a: Box = [a0[0] - pad, a0[1] - pad, a0[2] + pad, a0[3] + pad], b: Box = [b0[0] - pad, b0[1] - pad, b0[2] + pad, b0[3] + pad];
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = (r: Box) => (r[2] - r[0]) * (r[3] - r[1]), inter = ix * iy;
  return inter / (area(a) + area(b) - inter);
}
/** A key's short form for messages: the part's own key, with the address when keys repeat inside it. */
const named = (path: string) => path.split('/').at(-1)!;

/**
 * The defects in one transition's frames (see the module's comment for each rule and
 * KEYED_MOTION_LIMITS for each threshold). `dt` is the frame step in seconds.
 */
export function analyzeKeyedMotion(frames: readonly Frame[], segment: string, dt: number): KeyedMotionFinding[] {
  const L = KEYED_MOTION_LIMITS, out: KeyedMotionFinding[] = [];
  if (frames.length < 2) return out;
  const t0 = frames[0]!.t;
  const paths = new Set<string>();
  for (const f of frames) for (const p of f.parts.keys()) paths.add(p);
  const jumpMin = L.jump * dt * 30;
  const at = (i: number, p: string) => {
    const s = frames[i]?.parts.get(p);
    return s && s.a >= L.shown ? s : undefined;
  };
  /** Part `p`'s boxes in frames i - 1 and i, by the leaves on screen in both; undefined unless it is on screen in both. */
  // Each part's move and size change from frame i - 1 to frame i (null unless on screen in both), worked
  // out once per part: a part drawn alike in both frames (most of them, most of the time) costs nothing more.
  const rel = (x: number, y: number) => (Math.max(x, y) < L.minSize ? 0 : Math.abs(y - x) / Math.max(x, y));
  const series = new Map<string, { d: (number | null)[]; z: (number | null)[] }>();
  const seriesOf = (p: string) => {
    let found = series.get(p);
    if (found) return found;
    const d: (number | null)[] = [null], z: (number | null)[] = [null];
    for (let i = 1; i < frames.length; i++) {
      const pa = at(i - 1, p), pb = at(i, p);
      if (!pa || !pb) { d.push(null); z.push(null); continue; }
      const fa = frames[i - 1]!, fb = frames[i]!;
      let still = pa.to - pa.from === pb.to - pb.from;
      for (let k = 0; still && k < pa.to - pa.from; k++) {
        const x = fa.leaves[pa.from + k]!, y = fb.leaves[pb.from + k]!;
        still = x.id === y.id && x.box[0] === y.box[0] && x.box[1] === y.box[1] && x.box[2] === y.box[2] && x.box[3] === y.box[3];
      }
      if (still) { d.push(0); z.push(0); continue; }
      const [a, b] = commonBoxes(fa, fb, pa, pb, L.shown);
      d.push(moved(a, b));
      z.push(Math.max(rel(a[2] - a[0], b[2] - b[0]), rel(a[3] - a[1], b[3] - b[1])));
    }
    series.set(p, (found = { d, z }));
    return found;
  };
  const step = (i: number, p: string): number | null => seriesOf(p).d[i] ?? null;
  const sizeStep = (i: number, p: string): number | null => seriesOf(p).z[i] ?? null;
  // Tokens' trips: each time a part passes through (on screen in neither the transition's first frame
  // nor its last, as c.travel, the kit's flight and pass make one), the frames it sets off and lands
  // in, how far it travels and how far it still has to go at each frame. A part that moves and stays
  // is the picture settling, not a cause arriving. One key may make several trips in one play (a
  // machine's replay sends the same token once per event), so each time on screen is a trip of its own.
  type Trip = { p: string; from: number; to: number; length: number; left: number[]; lands: Box };
  const trips: Trip[] = [];
  for (const p of paths)
    for (let i = 0; i < frames.length; i++) {
      if (!at(i, p)) continue;
      let end = i;
      while (end + 1 < frames.length && at(end + 1, p)) end++;
      const passing = i > 0 && end < frames.length - 1;
      let length = 0, first = -1, last = -1;
      const left: number[] = new Array(frames.length).fill(NaN), along: number[] = [];
      for (let j = i; j <= end; j++) {
        // Travel is the part carried whole and readable: a frame in which it also changes size (a bar
        // growing, a part morphing into another shape) is not counted, since its centre moves without the part going anywhere.
        const d = j > i && at(j, p)!.a >= L.readable && at(j - 1, p)!.a >= L.readable && (sizeStep(j, p) ?? 1) < 0.02 ? step(j, p) ?? 0 : 0;
        if (d > 1e-4) {
          if (first < 0) first = j;
          last = j;
        }
        length += d;
        along[j] = length;
      }
      if (passing && length >= L.travel && last >= first) {
        for (let j = i; j <= end; j++) left[j] = length - along[j]!;
        trips.push({ p, from: first, to: last, length, left, lands: at(last, p)!.box });
      }
      i = end;
    }
  // A token is named by its outermost travelling part, not by the words riding on it.
  const travel = trips.filter((tr) => !trips.some((o) => tr.p.startsWith(`${o.p}/`) && o.from <= tr.to && tr.from <= o.to));

  for (const p of paths) {
    const key = named(p);
    // 1. Jump: a spike in a part's motion or size over one frame step, or two (a move squeezed under a
    // frame step can straddle two frames), between frames it is on screen in, not where it enters or leaves.
    const steady = (i: number) => !!at(i, p) && at(i, p)!.n === 1;
    const sides = (from: number, to: number) => (from < 2 || !!at(from - 2, p)) && (to + 1 >= frames.length || !!at(to + 1, p));
    const { d: moves, z: grows } = seriesOf(p);
    const changes = (j: number) => !!moves[j] || !!grows[j];
    jump: for (let i = 1; i < frames.length; i++)
      for (const span of [1, 2]) {
        const last = i + span - 1;
        if (last >= frames.length || !(changes(i) || (span === 2 && changes(last)))) continue;
        let ok = sides(i, last);
        // Words that change (a counter ticking) redraw the part: its box changes with them, which is no jump.
        for (let j = i - 1; j <= last && ok; j++) ok = steady(j) && at(j, p)!.text === at(i - 1, p)!.text;
        if (!ok) continue;
        const sum = (f: (j: number, p: string) => number | null) => { let x = 0; for (let j = i; j <= last; j++) x += f(j, p) ?? 0; return x; };
        const beside = (f: (j: number, p: string) => number | null) => Math.max(f(i - 1, p) ?? 0, f(last + 1, p) ?? 0);
        const frame = span === 1 ? `one ${fmt(dt, 3)} s frame` : `two ${fmt(dt, 3)} s frames`;
        const d = sum(step), around = beside(step);
        if (d > span * jumpMin && d > (span === 1 ? L.spike : L.spike2) * around) {
          out.push({ kind: 'jump', segment, key, path: p, t: ms(frames[i]!.t - t0), value: +fmt(d, 3),
            detail: `moved ${fmt(d)} units in ${frame}${around > 0 ? `, ${fmt(d / around, 1)}× the frames beside it` : ' and not at all in the frames beside it'}`,
            fix: 'carry it the whole way (morph it, or c.travel / the kit\'s flight), over a run time long enough not to squeeze it into a frame' });
          break jump;
        }
        const z = sum(sizeStep);
        if (z > span * L.resize && z > (span === 1 ? L.spike : L.spike2) * beside(sizeStep)) {
          out.push({ kind: 'jump', segment, key, path: p, t: ms(frames[i]!.t - t0), value: +fmt(z, 3),
            detail: `changed size by ${(100 * z).toFixed(0)}% in ${frame}`,
            fix: 'grow or shrink it over the transition (morph it), not in a frame' });
          break jump;
        }
      }
    // 2. Flicker: readable, then under `dip` of that alpha (or gone), then back to `back` of it, with the same look and place.
    let most = 0, least = Infinity;
    for (const f of frames) {
      const a = f.parts.get(p)?.a ?? 0;
      most = Math.max(most, a);
      least = Math.min(least, a);
    }
    // A part that never fades below `dip` of its most opaque cannot blink.
    for (let i = most >= L.readable && least < L.dip * most ? 0 : frames.length; i < frames.length; ) {
      const s = frames[i]!.parts.get(p);
      if (!s || s.a < L.readable) { i++; continue; }
      // The last readable frame before it dips: what a reader saw just before the gap.
      let ref = s, j = i + 1;
      for (; j < frames.length; j++) {
        const q = frames[j]!.parts.get(p);
        if (!q || q.a < L.dip * ref.a) break;
        if (q.a >= L.readable) ref = q;
      }
      if (j >= frames.length) break;
      const gone = j;
      let k = gone + 1;
      while (k < frames.length && !((frames[k]!.parts.get(p)?.a ?? 0) >= L.back * ref.a)) k++;
      if (k >= frames.length) break;
      const back = frames[k]!.parts.get(p)!;
      // Hidden while something travels, and back once it has landed: the part is the event's result
      // (the kit's `fresh`), shown again only when its cause arrives. That is deliberate, not a blink.
      const awaited = travel.some((tr) => tr.p !== p && tr.to >= gone && tr.to <= k);
      if (!awaited && back.look === ref.look && samePlace(back.box, ref.box, L.same)) {
        const hidden = frames[k]!.t - frames[gone]!.t;
        out.push({ kind: 'flicker', segment, key, path: p, t: ms(frames[gone]!.t - t0), value: +fmt(hidden, 3),
          detail: `went from alpha ${fmt(ref.a)} to ${fmt(frames[gone]!.parts.get(p)?.a ?? 0)} and came back ${fmt(hidden)} s later, unchanged and in the same place${ref.text ? ` (“${ref.text.length > 40 ? ref.text.slice(0, 39) + '…' : ref.text}”)` : ''}`,
          fix: 'leave it alone: a part that ends as it began should stay (only words that change are replaced; drop it from beats\' fresh unless the event makes it new)' });
        break;
      }
      i = k;
    }
  }

  // 3. Early words: words that become readable (newly, or changed) near where a token lands, while it is
  // still on its way. Words that come back as they were when the transition began are not new.
  if (travel.length) {
    const first = frames[0]!.parts;
    const riding = (p: string, q: string) => p === q || p.startsWith(`${q}/`) || q.startsWith(`${p}/`);
    for (const p of paths) {
      if (travel.some((tr) => riding(p, tr.p))) continue;
      const start = first.get(p);
      for (let i = 1; i < frames.length; i++) {
        const s = frames[i]!.parts.get(p), before = frames[i - 1]!.parts.get(p);
        if (!s?.text || s.a < L.readable || (before && before.a >= L.readable && before.text === s.text)) continue;
        if (start && start.a >= L.readable && start.text === s.text) continue;
        const tr = travel.find((o) => i >= o.from && i < o.to && o.left[i]! >= L.toGo && gap(s.box, o.lands) <= L.near);
        if (!tr) continue;
        out.push({ kind: 'early words', segment, key: named(p), path: p, t: ms(frames[i]!.t - t0), value: +fmt(s.a, 3),
          detail: `“${s.text.length > 40 ? s.text.slice(0, 39) + '…' : s.text}” is readable (alpha ${fmt(s.a)}) while “${named(tr.p)}” still has ${fmt(tr.left[i]!)} of its ${fmt(tr.length)} units to travel`,
          fix: `bring the words in after “${named(tr.p)}” lands (in beats, list the part as fresh, or put its entrance after the flight)` });
        break;
      }
    }
  }
  // A part inside one that has the same defect at the same moment moves, blinks or arrives with it: name the outer one.
  return out.filter((f) => !out.some((g) => g !== f && g.kind === f.kind && f.path.startsWith(`${g.path}/`) && Math.abs(g.t - f.t) <= 2 * dt + 1e-9));
}

/** A finding as one line: its kind, the part, the time, what was measured, and the fix. */
export function keyedMotionLine(f: KeyedMotionFinding): string {
  return `${f.kind}: part “${f.key}”${f.path !== f.key ? ` (${f.path})` : ''} at ${fmt(f.t, 3)} s ${f.detail}; fix: ${f.fix}`;
}
