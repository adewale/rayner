// Keyed motion: the motion defects a reader sees in a part, found from the scene rather than from
// pixels, by following each keyed part (keyed()) from frame to frame within one transition: one
// play() of a run, or one machine event as a reader presses it.
//
// MotionSink (verify.ts) follows the renderer's leaves, so a part redrawn as new mobjects, which is
// what a view's rebuild and a choreography's leave-then-enter do, is a different thing to it from
// one frame to the next, and `rayner check` never ran it on a reader's press. A key is the part's
// address across those redraws, so this follows parts by key and finds defects that filming
// every transition found in the Poppy series (issue #101, items 12 and 14), and no check saw
// (docs/MOTION-CORPUS.md measures how many of the filmed defects each catches):
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
//   covers        a token, readable and drawn over it, hides a share of a readable label's visible
//                 glyph boxes for a run of frames before it reaches its landing: a filled shape by
//                 what its fill provably paints (not its box), travelling words by where their
//                 letters meet the label's. A ticket over a lane's name; with the label's own words,
//                 two copies of one thing at once.
//   occluded words an opaque foreground fill obscures two glyph boxes (one for a one-glyph
//                 label), even when it is not a travelling token. Respects actual curve bounds,
//                 fill rules, camera, descendant clips and co-located foreground text handoffs.
//   small words   a token carries words smaller than a phone reads on the whole picture and than
//                 every label at rest: a label scaled down to travel. Judged only when the sink is
//                 given a label's reading size (the explain layer's), as `rayner check` gives it.
//   duplicate words travelling words overlap another visible copy of the same words for a run
//                 of frames; copies registered letter on letter are one word, a seamless handoff.
//   long transition one play keeps the picture changing for more than five seconds (a caption hold
//                 after it does not count): shorten or split it.
//
// Each threshold (KEYED_MOTION_LIMITS) is in stage units of the default 16-wide frame (screen space:
// a camera move is motion of every part) and in seconds, so a scene at another fps is judged alike.
// `rayner check` runs it on every play of every scenario and on every transition, authored or the
// views' own morph, from every state a reader can reach.

import { VMobject } from './vmobject.ts';
import type { Box, Mobject } from './mobject.ts';
import { matchingAncestors, mergeLeaves, mobjectId, paintsFill, paintsStroke, pointsVersion } from './mobject.ts';
import type { Scene, Sink } from './scene.ts';
import { playsBegun } from './scene.ts';
import { FRAME } from './units.ts';
import { intersect } from './box.ts';
import { paintReach } from './svg.ts';

export type KeyedMotionKind = 'jump' | 'flicker' | 'early words' | 'covers' | 'occluded words' | 'small words' | 'duplicate words' | 'long transition';
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
  /** The measured value: units moved (jump, or a size change as a fraction), seconds hidden (flicker), the alpha the words reached (early words), seconds covered (covers, occluded words), or the words' size in units (small words). */
  value: number;
  detail: string;
  /** One line on how to fix it. */
  fix: string;
  /** Structured attribution when the diagnostic observes another part's obscured glyphs. */
  victim?: string;
  text?: string;
  masks?: readonly string[];
}

/** The thresholds, each one what a reader perceives, in stage units (16 wide) and seconds. */
export const KEYED_MOTION_LIMITS = {
  /** A single authored transition may move for at most five seconds; trailing caption holds do not count. */
  duration: 5,
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
  same: 0.2,
  /** A token (a part passing through) travels at least this far (units) on one trip: its landing excuses a blink, and early words wait for it... */
  travel: 0.5,
  /** Early words: the token has at least this far (units) still to go when the words become readable... */
  toGo: 0.5,
  /** ...and the words are within this many units of where it lands: what its arrival makes, not words elsewhere on the stage. */
  near: 2,
  /** Covers: a token, readable and drawn over them, hides at least this share of a readable label's box... */
  cover: 0.3,
  /** ...for at least this many seconds in a row (three frames at 30 fps), before it reaches its landing... */
  covering: 0.1,
  /** ...which it has reached when it has under this many units left to travel (its landing is its resting picture's, judged at rest). */
  landed: 0.05,
  /** A foreground fill at least this opaque hides the letters under it, for every word check alike. */
  opaque: 0.95,
  /** Temporary occlusion: an opaque foreground fill hides this share of two glyph boxes. */
  glyphCover: 0.9,
  /** Small words: a token's words are smaller than this share of the smallest readable label at rest in the transition's first and last frames... */
  smaller: 0.85,
} as const;

/**
 * What the sink needs from the explain layer to judge words by size: a label's reading size in
 * stage units (the explain layer's readingLabelSize), and the smallest size that reads on a phone
 * showing the whole picture (in units of the 16-wide frame). Without them, small words is not judged.
 */
export interface KeyedMotionOptions { labelSize?: (m: Mobject) => number | undefined; legible?: number }

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
/** One drawn leaf: the renderer's id for it, its box on screen, its alpha, the fill and stroke that show, and its words and their reading size on screen if it is a run of text. */
interface Leaf { id: number; box: Box; a: number; paint: string; text?: string; em?: number; fillAlpha?: number; clip?: Box; glyphs?: Box[]; glyphSlots?: string[]; path?: string; hulls?: Box[]; fillPath?: Float64Array[]; fillRule?: 'nonzero' | 'evenodd' }
interface Frame { t: number; parts: Map<string, PartSample>; leaves: Leaf[] }

type FillGeometry = { hulls: Box[]; fillPath: Float64Array[] };
const fillCache = new WeakMap<Mobject, {version: number | undefined; arrays: Float32Array[]; projection: number[]; geometry: FillGeometry}>();
/** Snapshot only candidate masks. Static points and projection share immutable prepared curves. */
function fillGeometry(m: Mobject, k: number, cx: number, cy: number): FillGeometry {
  const arrays = m.pointArrays(), version = pointsVersion(m), projection = [k, cx, cy], old = fillCache.get(m);
  if (old && old.version === version && old.arrays.length === arrays.length && old.arrays.every((a, i) => a === arrays[i]) &&
    old.projection.every((v, i) => v === projection[i])) return old.geometry;
  const screen = (b: Box): Box => [(b[0] - cx) * k, (b[1] - cy) * k, (b[2] - cx) * k, (b[3] - cy) * k];
  const hulls: Box[] = [], fillPath: Float64Array[] = [];
  let ring: number[] = [];
  const boundary = (p: number[], depth = 0): void => {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = p as [number, number, number, number, number, number, number, number];
    const chord = Math.hypot(x3 - x0, y3 - y0);
    const bend = chord > 1e-9 ? Math.max(Math.abs((x1 - x0) * (y3 - y0) - (y1 - y0) * (x3 - x0)),
      Math.abs((x2 - x0) * (y3 - y0) - (y2 - y0) * (x3 - x0))) / chord : Math.max(Math.hypot(x1 - x0, y1 - y0), Math.hypot(x2 - x0, y2 - y0));
    if (bend * k > 0.01 && depth < 5) {
      const a = [(x0 + x1) / 2, (y0 + y1) / 2], b = [(x1 + x2) / 2, (y1 + y2) / 2], c = [(x2 + x3) / 2, (y2 + y3) / 2];
      const d = [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2], e = [(b[0]! + c[0]!) / 2, (b[1]! + c[1]!) / 2];
      const f = [(d[0]! + e[0]!) / 2, (d[1]! + e[1]!) / 2];
      boundary([x0, y0, ...a, ...d, ...f], depth + 1); boundary([...f, ...e, ...c, x3, y3], depth + 1);
    } else {
      hulls.push(screen([Math.min(x0, x1, x2, x3), Math.min(y0, y1, y2, y3), Math.max(x0, x1, x2, x3), Math.max(y0, y1, y2, y3)]));
      ring.push((x0 - cx) * k, (y0 - cy) * k);
    }
  };
  for (const arr of arrays) {
    ring = [];
    for (let i = 0; i + 7 < arr.length; i += 6) boundary(Array.from(arr.subarray(i, i + 8)));
    if (arr.length >= 2) ring.push((arr.at(-2)! - cx) * k, (arr.at(-1)! - cy) * k);
    fillPath.push(new Float64Array(ring));
    if (arr.length >= 2) hulls.push(screen([
      Math.min(arr[0]!, arr.at(-2)!), Math.min(arr[1]!, arr.at(-1)!), Math.max(arr[0]!, arr.at(-2)!), Math.max(arr[1]!, arr.at(-1)!),
    ]));
  }
  const geometry = {hulls, fillPath};
  fillCache.set(m, {version, arrays: arrays.slice(), projection, geometry});
  return geometry;
}

/** A leaf's alpha as MotionSink reads it: opacity times the paint that shows, times how far it is drawn. */
function alphaOf(m: Mobject): number {
  const s = m.style;
  const f = s.fill !== 'none' ? s.fillOpacity ?? 1 : 0;
  const k = s.stroke !== 'none' ? s.strokeOpacity ?? 1 : 0;
  return (s.opacity ?? 1) * Math.max(f, k) * (s.drawFraction ?? 1);
}
/** Intrinsic alpha of a resolved solid hex paint; unsupported CSS paints cannot prove coverage. */
function paintAlpha(fill: string | undefined): number {
  if (!fill || !/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(fill)) return 0;
  return fill.length === 5 ? parseInt(fill[4]!, 16) / 15 : fill.length === 9 ? parseInt(fill.slice(7), 16) / 255 : 1;
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
  readonly #options: KeyedMotionOptions;
  #dt = 1 / 30;
  /** Plays begun in the step running, for naming a play by its place in its step, and the machine events sent in the play running. */
  #step: { path: string | null; plays: number; last: number; events: number } = { path: null, plays: 0, last: -1, events: 0 };
  /** How much of the scene's evidence has been read for events. */
  #read = 0;
  /**
   * `segmentOf` names the transition a frame belongs to. By default each play() of a run is one
   * transition, named by its step and its place there (`step "burst", play 2`), and so is each
   * machine event a play sends (`step "fill", play 2, event 3`), since a sendSequence() sends several in one
   * play; a wait's frames belong to the play before them. `options` lets it judge words by size.
   */
  constructor(segmentOf?: (scene: Scene) => string | null, options: KeyedMotionOptions = {}) {
    this.#options = options;
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
    this.#current.push(sampleFrame(scene, this.#options.labelSize));
    this.frames++;
  }
  /** Analyse the transition still open. */
  finish(): KeyedMotionFinding[] {
    this.#close();
    return this.findings;
  }
  #close(): void {
    if (this.#segment !== null && this.#current.length > 1) this.findings.push(...analyzeKeyedMotion(this.#current, this.#segment, this.#dt, this.#options.legible));
    // The next transition starts from the picture this one left: its first frame.
    this.#current = this.#current.slice(-1);
  }
}

/** One frame's keyed parts, by address (the keys of the keyed parts around a part, then its own), and its drawn leaves. */
function sampleFrame(scene: Pick<Scene, 'mobjects' | 'frame' | 'time'>, labelSize?: (m: Mobject) => number | undefined): Frame {
  const [fx0, fy0, fx1, fy1] = scene.frame.box()!, k = FRAME.w / (fx1 - fx0), cx = (fx0 + fx1) / 2, cy = (fy0 + fy1) / 2;
  const parts = new Map<string, PartSample>(), leaves: Leaf[] = [];
  const fills = new Map<Leaf, Mobject>();
  const screen = (b: Box): Box => [(b[0] - cx) * k, (b[1] - cy) * k, (b[2] - cx) * k, (b[3] - cy) * k];
  // Keep a zero-area intersection: an empty viewport must never turn back into no viewport.
  const clipped = (a: Box, b: Box): Box => {
    const x = Math.max(a[0], b[0]), y = Math.max(a[1], b[1]);
    return [x, y, Math.max(x, Math.min(a[2], b[2])), Math.max(y, Math.min(a[3], b[3]))];
  };
  const seen = new Set<Mobject>();
  /** Walks `m`, adding its drawn leaves; returns the alpha of its most opaque one. */
  const walk = (m: Mobject, path: string, inherited: Box): number => {
    if (seen.has(m)) return 0;
    seen.add(m);
    const from = leaves.length;
    const clip = m.clipBox ? clipped(inherited, screen(m.clipBox)) : inherited;
    const owners = m[matchingAncestors] ?? [];
    const address = [...(path ? [path] : []), ...owners, ...(m.key === undefined ? [] : [m.key])];
    const here = address.join('/');
    // A merged run (Text) is one visual thing whose glyphs are rebuilt when its words change, so it is one leaf, as MotionSink takes it.
    const unit = !!m[mergeLeaves] && m.children.length > 0;
    const text = textOf(m);
    let alpha = 0;
    if (unit || (m instanceof VMobject && m.hasPoints())) {
      const a = unit ? Math.max(...m.children.map(alphaOf)) : alphaOf(m);
      const b = a > 0.02 ? m.box() : null;
      if (b) {
        const st = unit ? m.children[0]!.style : m.style;
        // Unknown CSS paints (gradients, variables, transparent named colours) do not prove
        // opacity. Resolved engine paints are hex; include alpha from #rgba and #rrggbbaa.
        const leaf: Leaf = { id: mobjectId(m), box: screen(b), a, paint: `${paintsFill(st) ? st.fill : ''}/${paintsStroke(st) ? st.stroke : ''}`, clip, path: here || undefined,
          fillAlpha: paintsFill(st) && (st.drawFraction ?? 1) >= 1 ? (st.opacity ?? 1) * (st.fillOpacity ?? 1) * paintAlpha(st.fill) : 0 };
        if (text === undefined && !unit && paintsFill(st)) { fills.set(leaf, m); leaf.fillRule = st.fillRule; }
        if (text !== undefined) {
          leaf.text = text;
          // Glyph ink boxes exclude the run's empty ascent/descent and spaces. Descendant
          // clips still apply when Text is represented as a single motion leaf.
          const glyphs: Box[] = [], glyphSlots: string[] = [];
          let ordinal = 0;
          const ink = (g: Mobject, parent: Box): void => {
            const viewport = g.clipBox ? clipped(parent, screen(g.clipBox)) : parent;
            const s = g.style;
            const index = ordinal++, cluster = (g as {cluster?: number}).cluster;
            const painted = Math.max(paintsFill(s) ? (s.fillOpacity ?? 1) * paintAlpha(s.fill) : 0,
              paintsStroke(s) ? (s.strokeOpacity ?? 1) * paintAlpha(s.stroke) : 0) * (s.opacity ?? 1);
            if (g instanceof VMobject && painted >= KEYED_MOTION_LIMITS.readable && (s.drawFraction ?? 1) >= 1) {
              const b = g.box();
              // Path boxes omit the stroke. Its reach is the renderer's: half its width, grown
              // by a square cap and, only for a miter join, by the miter limit.
              const margin = paintReach(g);
              const visible = b && screen([b[0] - margin, b[1] - margin, b[2] + margin, b[3] + margin]);
              // A clip through a glyph's empty counter is not visible ink. Certify only
              // whole glyph boxes; partial-glyph evidence needs actual outline clipping.
              if (visible && area(visible) > 0 && visible[0] >= viewport[0] && visible[1] >= viewport[1] && visible[2] <= viewport[2] && visible[3] <= viewport[3]) {
                glyphs.push(visible); glyphSlots.push(cluster === undefined ? `part:${index}` : `cluster:${cluster}`);
              }
            }
            for (const child of g.children) ink(child, viewport);
          };
          if (unit) for (const child of m.children) ink(child, clip);
          leaf.glyphs = glyphs;
          leaf.glyphSlots = glyphSlots;
          const em = labelSize?.(m);
          if (em !== undefined) leaf.em = em * k;
        }
        leaves.push(leaf);
        alpha = a;
      }
    }
    if (!unit) for (const c of m.children) alpha = Math.max(alpha, walk(c, here, clip));
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
  for (const top of scene.mobjects) walk(top, '', screen([fx0, fy0, fx1, fy1]));
  const labels = leaves.filter(l => l.glyphs?.length);
  for (const [leaf, source] of fills) if (labels.some(l => intersect(l.box, leaf.box)))
    Object.assign(leaf, fillGeometry(source, k, cx, cy));
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
const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
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
const crossesBox = (mask: Leaf, box: Box) => mask.hulls?.some(h => h[0] < box[2] && h[2] > box[0] && h[1] < box[3] && h[3] > box[1]);

/** Conservative fill proof. Every cubic lies in its control-point hull. If no hull
 * enters the box, the fill cannot change inside it; winding its centre against the
 * anchor chords is exact there. This handles curved concavities and both SVG hole
 * rules without claiming that a chord polygon's area is the curve's painted area. */
function fillsBox(mask: Leaf, box: Box): boolean {
  if (!mask.fillPath || !mask.hulls) return false;
  if (mask.clip && (mask.clip[0] > box[0] || mask.clip[1] > box[1] || mask.clip[2] < box[2] || mask.clip[3] < box[3])) return false;
  if (crossesBox(mask, box)) return false;
  const x = (box[0] + box[2]) / 2, y = (box[1] + box[3]) / 2;
  let winding = 0;
  for (const ring of mask.fillPath) for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length, x0 = ring[i]!, y0 = ring[i + 1]!, x1 = ring[j]!, y1 = ring[j + 1]!;
    const side = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
    if (y0 <= y && y1 > y && side > 0) winding++;
    if (y0 > y && y1 <= y && side < 0) winding--;
  }
  return mask.fillRule === 'evenodd' ? Math.abs(winding) % 2 === 1 : winding !== 0;
}

/** A lower bound on painted box area. Ambiguous boundary cells contribute nothing; winding
 * and the effective clip decide every counted cell, so holes cannot count twice or exceed 100%. */
function filledArea(mask: Leaf, box: Box, depth = 0): number {
  const b = mask.clip ? intersect(box, mask.clip) : box;
  if (!b || !mask.fillPath || !mask.hulls) return 0;
  if (fillsBox(mask, b)) return area(b);
  if (!crossesBox(mask, b) || depth >= 4) return 0;
  const x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2;
  return [[b[0], b[1], x, y], [x, b[1], b[2], y], [b[0], y, x, b[3]], [x, y, b[2], b[3]]]
    .reduce((sum, cell) => sum + filledArea(mask, cell as Box, depth + 1), 0);
}

/** Glyph occurrences admitted by real opacity and clips, with no possible opaque fill above
 * their box. Partial boundary intersections are unproved, not evidence of a visible duplicate. */
function visibleGlyphs(frame: Frame, index: number, omitted?: ReadonlySet<number>): Box[] {
  const label = frame.leaves[index]!;
  return (label.glyphs ?? []).filter(glyph => !frame.leaves.some((mask, r) => {
    if (r <= index || omitted?.has(r) || mask.text !== undefined || (mask.fillAlpha ?? 0) < KEYED_MOTION_LIMITS.opaque) return false;
    const clipped = mask.clip ? intersect(glyph, mask.clip) : glyph;
    return !!clipped && !!intersect(mask.box, clipped) && (fillsBox(mask, clipped) || !!crossesBox(mask, clipped));
  }));
}
const registeredGlyphs = (a: readonly Box[], b: readonly Box[]) => a.length > 0 && a.length === b.length && a.every((box, i) => samePlace(box, b[i]!, 0.025));

/** A key's short form for messages: the part's own key, with the address when keys repeat inside it. */
const named = (path: string) => path.split('/').at(-1)!;

/**
 * The defects in one transition's frames (see the module's comment for each rule and
 * KEYED_MOTION_LIMITS for each threshold). `dt` is the frame step in seconds; `legible`, the
 * smallest size of words that reads, in units, for small words.
 */
export function analyzeKeyedMotion(frames: readonly Frame[], segment: string, dt: number, legible?: number): KeyedMotionFinding[] {
  const L = KEYED_MOTION_LIMITS, out: KeyedMotionFinding[] = [];
  const reportedCovers: { mask: string; victim: string; text: string; first: number; last: number }[] = [];
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
  // machine's sendSequence() sends the same token once per event), so each time on screen is a trip of its own.
  type Trip = { p: string; start: number; end: number; from: number; to: number; length: number; left: number[]; lands: Box };
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
        trips.push({ p, start: i, end, from: first, to: last, length, left, lands: at(last, p)!.box });
      }
      i = end;
    }
  // A token is named by its outermost travelling part, not by the words riding on it.
  const travel = trips.filter((tr) => !trips.some((o) => tr.p.startsWith(`${o.p}/`) && o.from <= tr.to && tr.from <= o.to));
  // A travelling word must not be drawn over its stationary copy for several frames. Exact
  // coincident ink is a seamless handoff, not a second readable word.
  for (const tr of travel) {
    let since: number | null = null;
    for (let i = tr.start; i <= tr.end; i++) {
      const part = at(i, tr.p), leaves = frames[i]!.leaves;
      let duplicate = false;
      if (part) for (let a = part.from; a < part.to && !duplicate; a++) {
        const moving = leaves[a]!;
        if (!moving.text?.trim() || moving.a < L.readable) continue;
        const movingInk = visibleGlyphs(frames[i]!, a);
        if (!movingInk.length) continue;
        for (let b = 0; b < leaves.length; b++) {
          if (b >= part.from && b < part.to) continue;
          const other = leaves[b]!;
          if (other.a < L.readable || other.text !== moving.text) continue;
          const otherInk = visibleGlyphs(frames[i]!, b);
          if (!otherInk.length || registeredGlyphs(movingInk, otherInk)) continue;
          // Coincident copies, letter on letter, read as one word even when a plate between
          // them hides some of one copy's letters: register the copies, not only what shows.
          if (registeredGlyphs(moving.glyphs ?? [], other.glyphs ?? [])) continue;
          // The visible letters must meet too: uncut run boxes can overlap across
          // a plate that hides every letter in their common area.
          if (!movingInk.some(glyph => otherInk.some(other => intersect(glyph, other)))) continue;
          const overlap = intersect(moving.box, other.box);
          if (!overlap) continue;
          const overlapArea=area(overlap), share=overlapArea/Math.max(1e-9,Math.min(area(moving.box),area(other.box)));
          if(share<=L.cover)continue;
          duplicate = true; break;
        }
      }
      if (!duplicate) since = null;
      else {
        since ??= frames[i]!.t;
        if (frames[i]!.t - since >= L.covering - 1e-8) {
          out.push({kind: 'duplicate words', segment, key: named(tr.p), path: tr.p, t: ms(since - t0), value: ms(frames[i]!.t - since),
            detail: 'travelling text overlaps another visible copy of the same words', fix: 'hide the resting copy until the travelling copy has landed'});
          break;
        }
      }
    }
  }
  if (frames.at(-1)!.t - t0 > L.duration) {
    let lastChange = t0;
    for (let i = 1; i < frames.length; i++) {
      const before = frames[i - 1]!.parts, after = frames[i]!.parts;
      if (before.size !== after.size || [...after].some(([p, part]) => {
        const previous = before.get(p);
        return !previous || previous.a !== part.a || !samePlace(previous.box, part.box, 1e-6) || previous.look !== part.look;
      })) lastChange = frames[i]!.t;
    }
    const duration = lastChange - t0;
    if (duration > L.duration + 2 * dt) out.push({kind: 'long transition', segment, key: 'transition', path: 'transition', t: 0, value: ms(duration),
      detail: `keeps changing for ${fmt(duration)} s, over the ${L.duration} s ceiling`, fix: 'shorten or split the authored transition; leave caption reading time as a hold'});
  }

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
      // (Narrowing this to the parts of a block that change fails the kit's answer, whose code and
      // phrase go out and come back with a new meaning: docs/MOTION-CORPUS.md.)
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
  // 4. Covers: a token, readable, drawn over a readable label that is not its own words, hiding a
  // share of the label's box, for a run of frames before it reaches its landing. Its landing is where
  // its part rests, which the resting checks judge. A label with the token's own words is a copy of it.
  // 5. Small words: a token's words, readable, smaller than words a phone reads on the whole picture
  // and than every label at rest in the transition's first and last frames: a label scaled down to travel.
  if (travel.length) {
    const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
    const run = Math.max(2, Math.round(L.covering / dt - 1e-9));
    // The smallest readable words at rest: in the transition's first and last frames.
    let rest = Infinity;
    for (const f of [frames[0]!, frames.at(-1)!]) for (const l of f.leaves) if (l.em !== undefined && l.a >= L.readable && l.text) rest = Math.min(rest, l.em);
    /** The innermost keyed part that holds leaf `q` of frame `f`, for naming the label. */
    const owner = (f: Frame, q: number) => {
      let best: string | undefined, span = Infinity;
      for (const [path, s] of f.parts) if (s.from <= q && q < s.to && s.to - s.from < span) { best = path; span = s.to - s.from; }
      return best;
    };
    for (const tr of travel) {
      const own = new Set<string>();
      let small: { j: number; em: number; text: string } | undefined;
      // Label leaf id -> the frames in a row it has been covered, and the most of it covered; and the longest such run.
      const covered = new Map<number, { n: number; first: number; most: number; text: string; key: string; path: string }>();
      let longest: { n: number; first: number; most: number; text: string; key: string; path: string } | undefined;
      const close = (c: NonNullable<typeof longest>) => { if (c.n >= run && (!longest || c.n > longest.n)) longest = { ...c }; };
      for (let j = tr.start; j <= tr.end; j++) {
        const f = frames[j]!, T = f.parts.get(tr.p);
        const now = new Set<number>();
        if (T && T.a >= L.readable) {
          for (let q = T.from; q < T.to; q++) {
            const w = f.leaves[q]!;
            if (!w.text || w.a < L.readable) continue;
            own.add(w.text);
            if (legible !== undefined && w.em !== undefined && w.em < legible && w.em < L.smaller * rest && (!small || w.em < small.em)) small = { j, em: w.em, text: w.text };
          }
          for (let q = 0; q < T.from && tr.left[j]! > L.landed; q++) {
            const l = f.leaves[q]!;
            if (!l.text || l.a < L.readable) continue;
            const traveller = new Set(Array.from({length: T.to - T.from}, (_, i) => T.from + i));
            const glyphs = visibleGlyphs(f, q, traveller), whole = glyphs.reduce((sum, glyph) => sum + area(glyph), 0);
            if (whole <= 0) continue;
            let most = 0;
            // A filled shape covers what its fill proves it paints; an outline alone (a ring round a label,
            // a line) covers almost none of it. Travelling words cover where their visible glyphs
            // overlap the label's: two runs of letters over each other read as neither.
            for (let r = T.from; r < T.to; r++) {
              const t = f.leaves[r]!;
              if (!intersect(t.box, l.box)) continue;
              if (t.text !== undefined) {
                if (t.a < L.readable || !t.glyphs?.length) continue;
                const ink = visibleGlyphs(f, r);
                most = Math.max(most, glyphs.reduce((sum, glyph) =>
                  sum + Math.min(area(glyph), ink.reduce((over, letter) => over + area(intersect(glyph, letter) ?? [0, 0, 0, 0]), 0)), 0) / whole);
                continue;
              }
              if ((t.fillAlpha ?? 0) < L.readable) continue;
              most = Math.max(most, glyphs.reduce((sum, glyph) => sum + filledArea(t, glyph), 0) / whole);
            }
            if (most < L.cover) continue;
            now.add(l.id);
            const victim = l.path ?? owner(f, q) ?? l.text;
            const c = covered.get(l.id) ?? { n: 0, first: j, most: 0, text: l.text, key: named(victim), path: victim };
            c.n++;
            c.most = Math.max(c.most, most);
            covered.set(l.id, c);
          }
        }
        for (const [id, c] of [...covered]) if (!now.has(id)) { close(c); covered.delete(id); }
      }
      for (const c of covered.values()) close(c);
      if (longest) {
        const { n, first, most, text, key } = longest, twin = own.has(text), words = text.length > 40 ? text.slice(0, 39) + '…' : text;
        reportedCovers.push({ mask: tr.p, victim: longest.path, text, first, last: first + n - 1 });
        out.push({ kind: 'covers', segment, key: named(tr.p), path: tr.p, victim: longest.path, text, masks: [tr.p], t: ms(frames[first]!.t - t0), value: +fmt(n * dt, 3),
          detail: twin
            ? `travels over “${words}” (part “${key}”), the same words as its own, for ${fmt(n * dt)} s: two copies at once, one over the other`
            : `travels over “${words}” (part “${key}”), covering at least ${(100 * Math.min(1, most)).toFixed(0)}% of its visible glyph boxes, for ${fmt(n * dt)} s before it lands`,
          fix: twin
            ? 'take the resting copy away as the travelling one sets off (leave it as the flight appears), or start the flight beside it'
            : 'route it round the label (or under it, scaled down), or move the label off its way' });
      }
      if (small)
        out.push({ kind: 'small words', segment, key: named(tr.p), path: tr.p, t: ms(frames[small.j]!.t - t0), value: +fmt(small.em, 3),
          detail: `carries “${small.text.length > 40 ? small.text.slice(0, 39) + '…' : small.text}” ${fmt(small.em)} units high, under the ${fmt(legible!)} a phone reads on the whole picture and smaller than every label at rest (${fmt(rest)})`,
          fix: 'carry the words at a size that reads, or a token without words (the words arrive with the part where it lands)' });
    }
  }
  // Temporary occlusion is independent of a token's lifetime or route. Inspect glyph ink boxes
  // rather than a whole line's em box: hiding a short name inside a long label still matters.
  // Require nearly complete masking of two glyphs, an opaque fill drawn above them, and a clear
  // copy of these same words in this transition. Permanent background replacement is not a blink.
  type MaskSpan = { first: number; last: number; source: string; by: string };
  type HiddenRun = { first: number; last: number; glyphs: number; text: string; path: string; masks: MaskSpan[] };
  type Occurrence = {clear: boolean; active?: HiddenRun; runs: HiddenRun[]; last: Leaf; seen: number};
  const obscured = new Set<Occurrence>(), identities = new Map<number, Occurrence>();
  const closeHidden = (record: Occurrence) => {
    const run = record.active;
    if (run && frames[run.last]!.t - frames[run.first]!.t >= L.covering - 1e-8)
      record.runs.push({ ...run, masks: run.masks.map(mask => ({ ...mask })) });
    delete record.active;
  };
  for (let j = 0; j < frames.length; j++) {
    const f = frames[j]!;
    const now: {label: Leaf; covered: number; source: string; by: string}[] = [];
    for (let q = 0; q < f.leaves.length; q++) {
      const label = f.leaves[q]!;
      if (!label.text?.trim() || label.a < L.readable || !label.glyphs?.length) continue;
      const path = label.path;
      if (!path) continue;
      let most = 0;
      let by = 'unkeyed shape';
      let source = '';
      for (let r = q + 1; r < f.leaves.length; r++) {
        const mask = f.leaves[r]!;
        if (mask.text !== undefined || !mask.fillPath || (mask.fillAlpha ?? 0) < L.opaque || !intersect(mask.box, label.box)) continue;
        const maskPath = mask.path;
        // Deduplicate only this victim and this interval. One traveller's longest
        // covers finding must not silence another label it hides later.
        if (maskPath && reportedCovers.some(c => c.victim === path && c.text === label.text && j >= c.first && j <= c.last &&
          (maskPath === c.mask || maskPath.startsWith(`${c.mask}/`)))) continue;
        const covered: Box[] = [];
        for (const glyph of label.glyphs) {
          const inset = (1 - Math.sqrt(L.glyphCover)) / 2;
          const dx = (glyph[2] - glyph[0]) * inset, dy = (glyph[3] - glyph[1]) * inset;
          if (fillsBox(mask, [glyph[0] + dx, glyph[1] + dy, glyph[2] - dx, glyph[3] - dy])) covered.push(glyph);
        }
        // A handoff supplies these particular missing glyphs. A one-letter clipped
        // copy cannot stand in for the rest of a hidden word with the same text.
        const supplied = f.leaves.flatMap((other, index) => other !== label && other.text === label.text && other.a >= L.readable
          ? visibleGlyphs(f, index).map(box => ({box, slot: other.glyphSlots?.[other.glyphs!.indexOf(box)]})) : []);
        const missing = covered.filter(glyph => !supplied.some(other => other.slot === label.glyphSlots?.[label.glyphs!.indexOf(glyph)] && samePlace(glyph, other.box, 0.025))).length;
        if (missing >= Math.min(2, label.glyphs.length) && missing > most) {
          most = missing;
          by = maskPath ? named(maskPath) : 'unkeyed shape';
          // Draw-order position also identifies anonymous masks in independently rebuilt
          // seek frames; renderer ids would change on every such frame.
          source = maskPath ?? `\0${r}`;
        }
      }
      now.push({label, covered: most, source, by});
    }
    const used = new Set<Occurrence>();
    const compatible = (label: Leaf, record: Occurrence) => record.seen === j - 1 && record.last.path === label.path &&
      record.last.text === label.text && registeredGlyphs(record.last.glyphs ?? [], label.glyphs ?? []);
    for (const entry of now) {
      const {label} = entry;
      let record = identities.get(label.id);
      if (record && (used.has(record) || (record.last.id !== label.id && now.some(e => e.label.id === record!.last.id)))) record = undefined;
      if (!record) {
        const candidates = [...obscured].filter(r => !used.has(r) && compatible(label, r));
        // Retained physical identity wins. Rebuilt seek frames join only a unique
        // reciprocal glyph/position match; ambiguous twins end the old interval.
        if (candidates.length === 1 && now.filter(e => compatible(e.label, candidates[0]!)).length === 1) record = candidates[0];
      }
      record ??= {clear: false, runs: [], last: label, seen: j};
      identities.set(label.id, record); obscured.add(record); used.add(record);
      record.last = label; record.seen = j;
      if (!entry.covered) { record.clear = true; closeHidden(record); }
      else {
        record.active ??= { first: j, last: j, glyphs: entry.covered, text: label.text!, path: label.path!, masks: [] };
        record.active.last = j;
        record.active.glyphs = Math.min(record.active.glyphs, entry.covered);
        const mask = record.active.masks.at(-1);
        if (mask?.source === entry.source) mask.last = j;
        else record.active.masks.push({ first: j, last: j, source: entry.source, by: entry.by });
      }
    }
    for (const record of obscured) if (!used.has(record)) closeHidden(record);
  }
  for (const record of obscured.values()) {
    closeHidden(record);
    // A removed old page is a terminal wipe; a returning occurrence or a hidden
    // label still present in the final picture is a continuing reading surface.
    const longest = record.runs.filter(run => record.seen > run.last || run.last === frames.length - 1)
      .sort((a, b) => (b.last - b.first) - (a.last - a.first))[0];
    if (!record.clear || !longest) continue;
    const { first, last, glyphs, text, path, masks } = longest;
    const duration = frames[last]!.t - frames[first]!.t;
    // The threshold belongs to the victim's continuous loss of readability, even if
    // several short-lived masks take turns. Attribute each mask only to its sampled
    // interval rather than blaming the first mask for the complete obscuration.
    const attribution = masks.length === 1
      ? `“${masks[0]!.by}”, an opaque foreground shape, covers`
      : `opaque foreground shapes ${masks.map((mask, i) => {
        const end = masks[i + 1]?.first ?? mask.last;
        return `“${mask.by}” (${fmt(frames[mask.first]!.t - t0, 3)}–${fmt(frames[end]!.t - t0, 3)} s)`;
      }).join(', ')} cover`;
    out.push({ kind: 'occluded words', segment, key: named(path), path, victim: path, text, masks: masks.map(m => m.source), t: ms(frames[first]!.t - t0), value: ms(duration),
      detail: `“${text.length > 40 ? text.slice(0, 39) + '…' : text}” stays readable by opacity but ${attribution} at least ${100 * L.glyphCover}% of ${glyphs} glyph ${glyphs === 1 ? 'box' : 'boxes'} for ${fmt(duration)} s`,
      fix: 'draw the words above their paper, route the foreground shape round them, or take the old words away before covering them' });
  }
  // A part inside one that moves, blinks or arrives with it shares that defect.
  // Occlusion is already attributed to an individual text leaf: two nested
  // owners may hold different words hidden by entirely independent masks.
  return out.filter((f) => f.kind === 'occluded words' || !out.some((g) => g !== f && g.kind === f.kind && f.path.startsWith(`${g.path}/`) && Math.abs(g.t - f.t) <= 2 * dt + 1e-9));
}

/** A finding as one line: its kind, the part, the time, what was measured, and the fix. */
export function keyedMotionLine(f: KeyedMotionFinding): string {
  return `${f.kind}: part “${f.key}”${f.path !== f.key ? ` (${f.path})` : ''} at ${fmt(f.t, 3)} s ${f.detail}; fix: ${f.fix}`;
}
