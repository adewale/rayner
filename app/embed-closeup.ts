/**
 * Close-ups for a narrow stage. A 16 × 9 stage on a 390 px phone draws a scene
 * unit at about 22 px, so a 0.25-unit label is under 6 px. Instead of asking every
 * scene to lay itself out for a phone, the player frames each step: it zooms onto
 * the part of the resting picture that changed in that step, far enough that the
 * labels there read at 12 px, as a map fits its view to the feature a search found.
 * When the change needs several close-ups, the reader steps through them with the
 * overview, and the ones that show what the step emphasised (a lit card row, a marked
 * link, a note) come first, since its caption most often speaks of that. The reader
 * can still pan, zoom, or go back to the whole picture.
 *
 * `stepLayouts` runs a scene once and records, for each step, where its picture
 * changed and every visible label's size (`layoutSink` records the same beside
 * another sink's run); `closeUps` turns one step's layout into the zooms for a
 * stage of a given size. `rayner check` uses both, so its phone number
 * is the size the player draws.
 *
 * A close-up is the reader's zoom, and it sits on top of the author's camera
 * (`scene.frame`, which `s.focus()` moves). So a layout is recorded as the camera
 * shows it: in the 16 × 9 units of the camera's view, centred on the origin, with
 * label sizes multiplied by the camera's zoom. At home those are stage units. A
 * close-up's zoom then multiplies the camera's, and Whole picture is the author's frame.
 */
import type { Box, Mobject, Scene, SceneClass, Sink } from '../src/index.ts';
import { center, intersect, overlaps, pad, unionBoxes } from '../src/box.ts';
import { paints, paintsStroke } from '../src/mobject.ts';
import { viewOf } from '../src/svg.ts';
import { FRAME, STAGE_BOX } from '../src/units.ts';
import { labelOf, readingLabelSize } from '../explain/diagrams.ts';
import { emphasisOf, newlyEmphasised, openingOf } from '../explain/look.ts';
import { isFurniture, isHeading } from '../explain/stage.ts';
import { IDENTITY, ZOOM_MAX, clampZoom } from './embed-zoom.ts';
import type { Zoom } from './embed-zoom.ts';

/** The smallest label size a close-up aims for, in CSS px: Android's floor for body text, a little over Apple's 11 pt. */
export const READ_PX = 12;
/** Stages narrower than this get close-ups; wider ones (a tablet, a laptop) keep the whole picture. */
export const NARROW_PX = 600;
/**
 * A narrow stage's height over its width, at most: taller than the picture's 16:9, so each
 * close-up shows the picture's full height or close to it, and a phone needs fewer views to
 * cover a change. The stage never gets shorter than 16:9, and on a standalone page never so
 * tall that Next leaves the screen (app/embed.css, .stage.narrow). `rayner check` estimates phone legibility at the minimum 16:9 geometry;
 * served-page review measures the actual stage.
 */
export const NARROW_ASPECT = 5 / 4;
/** Room left around the changed region, in stage units, so a mark's outline is not cut. */
const PAD = 0.2;

/** A label on the stage: where it is and its font size, in stage units. */
export interface LayoutLabel {
  box: Box;
  size: number;
}
/** What a step's resting picture holds, for framing it; boxes and sizes in the camera's view units. */
export interface StepLayout {
  /** Authored comparison, independent of incidental changed code or notes. */
  opening?: { box: Box; labels: LayoutLabel[] };
  /**
   * What changed or received fresh helper emphasis, in the camera's view units, as
   * separate parts in reading order (rows top to bottom, each left to right); empty
   * when nothing is drawn.
   */
  parts: Box[];
  /** Painted extents of those parts, including stroke and authored clips. */
  painted?: Box[];
  /** The part the step opens on: the one whose lettering changed most (new words, new values), else the first. */
  lead: number;
  labels: LayoutLabel[];
  /**
   * What the step newly emphasised with the stage's helpers (`emphasises` in
   * explain/look.ts): each lit card row's bar, code focus bar or diff line, marked,
   * travelled or focused diagram part, or note that was not there, or showed something
   * else, when the step began; one box each, in the camera's view units. Absent when the
   * step emphasised nothing new.
   */
  stress?: Box[];

}
/** Changed boxes closer than this, in stage units, read as one part. */
const GAP = 0.5;

/** What two boxes share: a line has no height (or no width) and is still drawn; only boxes that miss each other give null. */
const meet = (a: Readonly<Box>, b: Readonly<Box>): Box | null => intersect(a, b, { lines: true });
const union = (a: Box | null, b: Box): Box => unionBoxes([a, b])!;

/** A drawn leaf of the resting picture: what it looks like (`key`), how opaque it is, and where. */
interface Leaf {
  key: string;
  opacity: number;
  box: Box;
  painted: Box;
  top: Mobject;
  /** Part of a label's lettering. */
  text: boolean;
  /** The nearest object, itself or above it, that shows what the step newly emphasised. */
  stress: Mobject | null;
  /** The object drawn, the same from step to step while it stays on stage. */
  m: Mobject;
  /** Its colours and its shape wherever it is and however large: equal when it was only moved or scaled. */
  form: string;
}
/** FNV-1a over the points rounded to a thousandth of a unit: equal shapes in the same place hash equal. */
function hashPoints(m: Mobject): string {
  let h = 0x811c9dc5;
  for (const a of m.pointArrays())
    for (let i = 0; i < a.length; i++) {
      h ^= Math.round(a[i]! * 1000) | 0;
      h = Math.imul(h, 0x01000193);
    }
  return (h >>> 0).toString(36);
}
/** FNV-1a over the points relative to their box, scaled to its longer side: equal for a shape moved or scaled. */
function hashShape(m: Mobject, box: Box): string {
  const side = Math.max(box[2] - box[0], box[3] - box[1]) || 1;
  let h = 0x811c9dc5;
  for (const a of m.pointArrays())
    for (let i = 0; i < a.length; i++) {
      // Points are flat (x, y) pairs.
      const origin = i % 2 === 0 ? box[0] : box[1];
      h ^= Math.round(((a[i]! - origin) / side) * 1000) | 0;
      h = Math.imul(h, 0x01000193);
    }
  return (h >>> 0).toString(36);
}

/**
 * A world box in the units of the camera's view `view`: 16 wide, centred on the origin.
 * The identity at home. `rayner check` maps its labels the same way (inView there).
 */
export function toView(box: Box, view: Box): Box {
  const z = viewZoom(view),
    [cx, cy] = center(view);
  return [(box[0] - cx) * z, (box[1] - cy) * z, (box[2] - cx) * z, (box[3] - cy) * z];
}
/**
 * The camera's zoom: stage units per world unit. The stage shows the view whole and
 * centred (an SVG viewBox meets its viewport), so a view out of 16:9 is letterboxed
 * and the tighter side sets the scale. 1 at home.
 */
export const viewZoom = (view: Box): number => Math.min(16 / (view[2] - view[0]), 9 / (view[3] - view[1]));

/** The drawn leaves of the resting picture; those under an object in `fresh` show the step's new emphasis. */
function leavesOf(scene: Scene, fresh: ReadonlySet<Mobject> = new Set()): Leaf[] {
  const out: Leaf[] = [];
  const walk = (m: Mobject, top: Mobject, opacity: number, clip: Box, inLabel: boolean, stressed: Mobject | null) => {
    const o = opacity * (m.style.opacity ?? 1);
    if (o < 0.05) return;
    const c = m.clipBox ? meet(clip, m.clipBox) : clip;
    if (!c) return;
    const text = inLabel || !!labelOf(m);
    const stress = fresh.has(m) ? m : stressed;
    if (!m.children.length) {
      const geometry = m.box(), style = m.style;
      // Keep geometry for label relevance and painted bounds for coverage.
      // A stroke near an unrelated label must not make that label set the zoom.
      const half = paintsStroke(style) ? style.strokeWidth / 2 : 0;
      const bounds: Box | null = geometry ? pad(geometry, half) : null;
      const seen = bounds && paints(style) && (m.style.drawFraction ?? 1) > 0.05 ? meet(bounds, c) : null;
      if (seen) {
        const s = m.style;
        const key = [
          s.fill,
          s.fillOpacity,
          s.stroke,
          s.strokeOpacity,
          s.strokeWidth,
          s.drawFraction ?? 1,
          hashPoints(m),
        ].join('|');
        const form = [s.fill, s.fillOpacity, s.stroke, s.strokeOpacity, s.drawFraction ?? 1, hashShape(m, geometry!)].join(
          '|',
        );
        out.push({ key, opacity: o, box: meet(geometry!, c) ?? seen, painted: seen, top, text, stress, m, form });
      }
    }
    for (const child of m.children) walk(child, top, o, c, text, stress);
  };
  const view = viewOf(scene);
  for (const top of scene.mobjects) if (!isFurniture(top)) walk(top, top, 1, view, false, null);
  return out;
}
/** Rows a unit tall, top first, then left to right: the order parts are read in. */
const readingOrder = (a: Box, b: Box) => Math.floor(-a[3]) - Math.floor(-b[3]) || a[0] - b[0];
/** What the step emphasised: one box for each object that shows it, around its drawn leaves. */
function emphasised(leaves: readonly Leaf[]): {box: Box; painted: Box}[] {
  const boxes = new Map<Mobject, {box: Box; painted: Box}>();
  for (const l of leaves) if (l.stress) {
    const prior = boxes.get(l.stress);
    boxes.set(l.stress, {box: union(prior?.box ?? null, l.box), painted: union(prior?.painted ?? null, l.painted)});
  }
  return [...boxes.values()];
}

/** Every readable label in the camera's view, in its units: a label's size grows with the camera's zoom. */
function labelsOf(scene: Scene, only?: ReadonlySet<Mobject>): LayoutLabel[] {
  const out: LayoutLabel[] = [];
  const view = viewOf(scene),
    zoom = viewZoom(view);
  const walk = (m: Mobject, opacity: number, clip: Box) => {
    const o = opacity * (m.style.opacity ?? 1);
    if (o < (only ? 0.05 : 0.25)) return;
    const c = m.clipBox ? meet(clip, m.clipBox) : clip;
    if (!c) return;
    const label = labelOf(m);
    if (label?.text.trim() && (m.style.drawFraction ?? 1) >= 0.95) {
      if (only && !only.has(m)) return;
      const b = m.box(),
        seen = b && meet(b, c);
      if (seen)
        out.push({
          box: toView(seen, view),
          size: readingLabelSize(m)! * zoom,
        });
      return; // a label's own parts are not labels
    }
    for (const child of m.children) walk(child, o, c);
  };
  for (const top of scene.mobjects) if (!isHeading(top)) walk(top, 1, view);
  return out;
}

/**
 * What changed since `before` (the previous step's resting picture): every leaf that
 * is new, moved, reshaped, recoloured or brighter. A leaf that is the same object with
 * the same colours and shape, only somewhere else or another size, is marked `moved`:
 * it changed, but it is not what the step brought. A leaf that only grew fainter was
 * dimmed, which points away from it; when a step only dims, what it left bright in
 * the drawings it dimmed is what changed. With no change at all, everything drawn.
 */
export function changed(leaves: readonly Leaf[], before: readonly Leaf[]): Change[] {
  const was = new Map<string, number>(),
    forms = new Map<Mobject, string>();
  for (const l of before) {
    was.set(l.key, Math.max(was.get(l.key) ?? 0, l.opacity));
    forms.set(l.m, l.form);
  }
  const out: Change[] = [],
    dimmed = new Set<Mobject>();
  for (const l of leaves) {
    const prior = was.get(l.key);
    if (prior == null || l.opacity > prior + 0.1)
      out.push({ box: l.box, painted: l.painted, text: l.text, ...(prior == null && forms.get(l.m) === l.form ? { moved: true } : {}) });
    else if (l.opacity < prior - 0.1) dimmed.add(l.top);
  }
  if (out.length) return out;
  const kept = leaves.filter((l) => dimmed.has(l.top) && (was.get(l.key) ?? 0) - l.opacity <= 0.1);
  // Kept or not, nothing here is new lettering: the step opens on the first part.
  return (kept.length ? kept : leaves).map((l) => ({ box: l.box, painted: l.painted, text: false }));
}
/** A changed leaf: where, whether it is lettering, and whether it was only moved or scaled. */
export interface Change {
  box: Box;
  painted?: Box;
  text: boolean;
  moved?: boolean;
}
/**
 * Changes merged into parts (any two within GAP join), in reading order: by rows of a
 * unit, top first, then left to right. The lead is the part with the most new lettering:
 * a caption usually reads out the new words or numbers, so the step opens there. Lettering
 * that was only moved counts after it (a block carried aside is not what the step is
 * about); with no changed lettering, it opens on the first part.
 */
export function partsOf(changes: readonly Change[]): { parts: Box[]; lead: number; painted?: Box[] } {
  let parts = changes.map((c) => ({
    box: [...c.box] as Box,
    painted: [...(c.painted ?? c.box)] as Box,
    text: +(c.text && !c.moved),
    moved: +(c.text && !!c.moved),
  }));
  for (let merged = true; merged; ) {
    merged = false;
    const next: typeof parts = [];
    for (const p of parts) {
      const b = p.box;
      const near = next.findIndex(({ box: n }) => overlaps(pad(n, GAP), b));
      if (near < 0) next.push(p);
      else {
        next[near] = {
          box: union(next[near]!.box, b),
          painted: union(next[near]!.painted, p.painted),
          text: next[near]!.text + p.text,
          moved: next[near]!.moved + p.moved,
        };
        merged = true;
      }
    }
    parts = next;
  }
  parts.sort((a, b) => readingOrder(a.box, b.box));
  const lead = parts.reduce((best, p, i) => {
    const b = parts[best]!;
    return p.text > b.text || (p.text === b.text && p.moved > b.moved) ? i : best;
  }, 0);
  return { parts: parts.map((p) => p.box), lead: parts.length ? lead : 0,
    ...(changes.some(c => c.painted) ? {painted: parts.map(p => p.painted)} : {}) };
}
/** All the parts as one box, or null when there are none. */
export const focusOf = (layout: StepLayout): Box | null => unionBoxes(layout.parts);

/**
 * Each step's layout, by step name, from one run of the scene with every frame
 * skipped. A step ends on its resting picture (nothing may change once its caption
 * hold begins), so the scene at each step's end is the picture the player rests on,
 * seen through the camera where the step leaves it.
 */
export async function stepLayouts(Scene: SceneClass): Promise<Map<string, StepLayout>> {
  const { sink, layouts } = layoutSink();
  await new Scene(sink, { skipUntil: Infinity }).run();
  return layouts;
}
/** A sink that records at each step's end. */
export type LayoutSink = Sink & Required<Pick<Sink, 'stepEnd'>>;
/**
 * The sink `stepLayouts` runs a scene with, and the layouts it fills, one per step as each step
 * ends. The player puts it beside the trace's sink, so one run of a scenario gives both.
 */
export function layoutSink(): { sink: LayoutSink; layouts: Map<string, StepLayout> } {
  const layouts = new Map<string, StepLayout>();
  let before: Leaf[] = [],
    was = new Map<Mobject, string>();
  const sink: LayoutSink = {
    async frame() {},
    async stepEnd(scene, step) {
      // New emphasis: an object that shows emphasis now and did not when the step began, or showed another row, line or colour.
      const now = emphasisOf(scene),
        fresh = new Set(newlyEmphasised(now, was).keys());
      was = now;
      const leaves = leavesOf(scene, fresh),
        view = viewOf(scene);
      // Changes are found in the world (a camera move alone changes no leaf), then framed as the camera shows them.
      const changes = changed(leaves, before).map((c) => ({ ...c, box: toView(c.box, view), painted: toView(c.painted!, view) }));
      const intent = emphasised(leaves).map(c => ({box: toView(c.box, view), painted: toView(c.painted, view), text: false})),
        stress = intent.map(c => c.box);
      const subjects = new Set(openingOf(scene).flatMap((m) => m.family()));
      const subjectLeaves = leaves.filter((l) => subjects.has(l.m));
      for (const subject of openingOf(scene)) {
        const family = new Set(subject.family());
        if (!subjectLeaves.some((l) => family.has(l.m)))
          throw new Error(`opening(): ${step.name} names a subject with no painted ink`);
      }
      const box = subjectLeaves.reduce<Box | null>((b, l) => union(b, l.box), null);
      const labels = labelsOf(scene);
      const subjectLabels = labelsOf(scene, subjects);
      layouts.set(step.name, {
        // A fresh focus can name unchanged artwork. Keep its painted bounds
        // in the tour even when only a nearby label changed this step.
        ...partsOf([...changes, ...intent]),
        labels,
        ...(box ? { opening: { box: toView(box, view), labels: subjectLabels } } : {}),
        ...(stress.length ? { stress } : {}),
      });
      before = leaves;
    },
  };
  return { sink, layouts };
}

/** How the stage draws the author's 16 × 9 view at 1×: px per view unit and the offset of its top-left corner (the SVG letterboxes). */
export function stageScale(w: number, h: number) {
  const s = Math.min(w / FRAME.w, h / FRAME.h);
  return { s, ox: (w - FRAME.w * s) / 2, oy: (h - FRAME.h * s) / 2 };
}
/** The part of the author's view a zoom shows on a `w`×`h` stage, in its units (stage units when the camera is home). */
export function viewBox(z: Zoom, w: number, h: number): Box {
  const { s, ox, oy } = stageScale(w, h);
  const x = (px: number) => STAGE_BOX[0] + (px / z.k - z.x / z.k - ox) / s,
    y = (py: number) => STAGE_BOX[3] - (py / z.k - z.y / z.k - oy) / s;
  return [x(0), y(h), x(w), y(0)];
}
/** The labels a close-up reads at: those in or touching a changed part, else every label. */
export function labelsToRead(layout: StepLayout): LayoutLabel[] {
  const near = layout.parts.map((p) => pad(p, PAD));
  const inside = layout.labels.filter((l) => near.some((n) => overlaps(l.box, n)));
  return inside.length ? inside : layout.labels;
}
/**
 * The regions a tour of the step's changes visits with a `vw`×`vh` view, in reading
 * order: changed parts taken together while they fit in one view, each group centred;
 * a group too big for one view is covered by views in rows, top to bottom, each row left
 * to right, overlapping evenly, the way a comic reader's guided view crosses a big panel.
 * Views stay inside `bounds` where they fit it, so a close-up never cuts the heading.
 */
export function tourRegions(parts: readonly Box[], vw: number, vh: number, bounds: Readonly<Box> = STAGE_BOX): Box[] {
  const groups: Box[] = [];
  let group: Box | null = null;
  // Room around each part, but never so much that a part which fits a view no longer does.
  const room = (b: Box): Box => {
    const x = b[2] - b[0] <= vw ? Math.min(PAD, (vw - (b[2] - b[0])) / 2) : PAD,
      y = b[3] - b[1] <= vh ? Math.min(PAD, (vh - (b[3] - b[1])) / 2) : PAD;
    return meet(pad(b, x, y), bounds) ?? [...bounds];
  };
  for (const p of parts.map(room)) {
    const next = union(group, p);
    if (group && (next[2] - next[0] > vw || next[3] - next[1] > vh)) {
      groups.push(group);
      group = p;
    } else group = next;
  }
  if (group) groups.push(group);
  const views: Box[] = [];
  // Starts of views across a span: one centred view if it fits, else evenly overlapping ones from edge to edge.
  const starts = (lo: number, hi: number, size: number) => {
    // A span over by a rounding (a part padded to exactly a view's width) is one view, not n = 1 over 0.
    const n = Math.ceil((hi - lo) / size - 1e-9);
    if (n < 2) return [(lo + hi) / 2 - size / 2];
    return Array.from({ length: n }, (_, i) => lo + (i * (hi - lo - size)) / (n - 1));
  };
  // A view centred on a part near an edge would reach past the bounds: slide it back in.
  // A view that fits only to a rounding (zoomed exactly to fit under the heading) still slides.
  const inside = (lo: number, size: number, min: number, max: number) =>
    size <= max - min + 1e-9 ? Math.min(Math.max(lo, min), max - size) : lo;
  for (const g of groups)
    for (const bottom of starts(g[1], g[3], vh).reverse())
      for (const left of starts(g[0], g[2], vw)) {
        // A view as tall as the frame (a tall stage) can still be panned into the letterbox
        // under the drawing: lift it until it shows the frame's top, heading and all.
        const x = inside(left, vw, bounds[0], bounds[2]),
          y =
            vh >= STAGE_BOX[3] - STAGE_BOX[1] - 1e-9
              ? Math.max(bottom, STAGE_BOX[3] - vh)
              : inside(bottom, vh, bounds[1], bounds[3]);
        views.push([x, y, x + vw, y + vh]);
      }
  return views;
}

/**
 * Where reading what the step emphasised starts, part by part: for each emphasised box and
 * each part it lies in, the top-left corner of the box within the part. A box that only
 * touches a part's edge does not lie in it (a line, with no height or width, lies in a part
 * it crosses). Every point of a part is in some close-up, so each start is too.
 */
export function stressStarts(layout: StepLayout): [number, number][] {
  const within = (s: Box, p: Box) => {
    const w = Math.min(s[2], p[2]) - Math.max(s[0], p[0]),
      h = Math.min(s[3], p[3]) - Math.max(s[1], p[1]);
    return w >= 0 && h >= 0 && (w > 0 || s[2] === s[0]) && (h > 0 || s[3] === s[1]);
  };
  return (layout.stress ?? []).flatMap((s) =>
    layout.parts.filter((p) => within(s, p)).map((p): [number, number] => [Math.max(s[0], p[0]), Math.min(s[3], p[3])]),
  );
}
/**
 * The close-ups of a step on a `w`×`h` stage, in the order the overview visits them. The
 * first is where the step opens, on its lead part. Next come the close-ups that show the
 * start of something the step emphasised (`stress`: a lit card row, a marked link, a note),
 * since a caption most often speaks of what its step marked, and last the rest of its
 * changes; each group in reading order from the opening one, wrapping round. On a stage at
 * least NARROW_PX wide, or with nothing to read, there is one: the whole picture. Otherwise
 * detail close-ups use the least scale that draws every label near the step's
 * changes at READ_PX (up to `max`). An authored comparison can open at its own
 * readable scale when its complete subjects fit; smaller details retain their stops. When every such label already reads at
 * READ_PX, there is one: the whole picture. Any label under it is enlarged, however
 * little it needs: a label at 11 px is still under the floor `rayner check` measures.
 * A narrow ReaderSink leaves the stage heading out, so the whole authored frame is
 * available to the picture; no close-up reserves space for the undrawn heading.
 */
export function closeUps(layout: StepLayout | undefined, w: number, h: number, max = ZOOM_MAX): Zoom[] {
  const whole = [clampZoom(IDENTITY, w, h, max)];
  if (!layout || (!layout.parts.length && !layout.opening) || !(w > 0) || !(h > 0) || w >= NARROW_PX) return whole;
  if (!layout.parts.length && layout.opening) layout = { ...layout, parts: [layout.opening.box], lead: 0 };
  // Declared subjects can stay unchanged while another part of the picture changes.
  // Their smaller labels still determine whether the opening needs enlargement.
  const read = [...labelsToRead(layout), ...(layout.opening?.labels ?? [])];
  if (!read.length) return whole;
  const { s, ox, oy } = stageScale(w, h);
  const smallest = Math.min(...read.map((l) => l.size));
  const reading = Math.min(max, Math.max(1, READ_PX / (smallest * s)));
  if (reading < 1 + 1e-9) return whole;
  const bounds = STAGE_BOX,
    painted = layout.painted ?? layout.parts,
    k = reading;
  const vw = w / (k * s),
    vh = h / (k * s);
  // Centre the full picture in any dimension where it fits; otherwise put the
  // region's top-left corner at the stage's top-left before clamping.
  const fitsTall = k * FRAME.h * s <= h + 1e-9,
    fitsWide = k * FRAME.w * s <= w + 1e-9;
  const zoomOn = ([left, , , top]: Box) =>
    clampZoom(
      {
        k,
        x: fitsWide ? (w - k * FRAME.w * s) / 2 - k * ox : -k * (ox + (left - STAGE_BOX[0]) * s),
        y: fitsTall ? (h - k * FRAME.h * s) / 2 - k * oy : -k * (oy + (STAGE_BOX[3] - top) * s),
      },
      w,
      h,
      max,
    );
  // Clamping at the frame's edge can move a region; what a close-up shows is the view it lands on.
  const views = tourRegions(painted, vw, vh, bounds).map((r) => {
    const zoom = zoomOn(r);
    return { zoom, box: viewBox(zoom, w, h) };
  });
  const inside = (x: number, y: number, r: Box) =>
    x >= r[0] - 1e-6 && x <= r[2] + 1e-6 && y >= r[1] - 1e-6 && y <= r[3] + 1e-6;
  // Open on the lead part: the first close-up that holds all of it when it fits a view, else,
  // of the close-ups that hold its top-left corner (where reading it starts), the one that
  // shows most of it: a close-up framing another part can reach the corner too.
  const lead = layout.parts[layout.lead] ?? layout.parts[0]!,
    holds = (r: Box) => inside(lead[0], lead[3], r),
    holdsAll = (r: Box) => holds(r) && inside(lead[2], lead[1], r);
  const fits = lead[2] - lead[0] <= vw && lead[3] - lead[1] <= vh;
  let open = fits ? views.findIndex((v) => holdsAll(v.box)) : -1;
  if (open < 0) {
    const shown = (r: Box) => {
      const i = meet(r, lead);
      return i ? (i[2] - i[0]) * (i[3] - i[1]) : 0;
    };
    for (const [i, v] of views.entries())
      if (holds(v.box) && (open < 0 || shown(v.box) > shown(views[open]!.box) + 1e-9)) open = i;
    open = Math.max(0, open);
  }
  // A grid covers every point but can split a label across all its seams, even when
  // the whole label fits a view. Keep the original opening and add a centred view
  // for each readable label that otherwise has no complete view.
  const extra: typeof views = [];
  for (const { box } of read) {
    if (
      box[2] - box[0] > vw ||
      box[3] - box[1] > vh ||
      box[0] < bounds[0] ||
      box[1] < bounds[1] ||
      box[2] > bounds[2] ||
      box[3] > bounds[3]
    )
      continue;
    const complete = (r: Box) => inside(box[0], box[1], r) && inside(box[2], box[3], r);
    if ([...views, ...extra].some((v) => complete(v.box))) continue;
    for (const region of tourRegions([box], vw, vh, bounds)) {
      const zoom = zoomOn(region),
        shown = viewBox(zoom, w, h);
      if (complete(shown)) extra.push({ zoom, box: shown });
    }
  }
  const starts = stressStarts(layout),
    first: Zoom[] = [],
    rest: Zoom[] = [];
  for (const v of [...views.slice(open + 1), ...views.slice(0, open), ...extra])
    (starts.some(([x, y]) => inside(x, y, v.box)) ? first : rest).push(v.zoom);
  const opening: Zoom[] = [];
  if (layout.opening) {
    const box = meet(pad(layout.opening.box, PAD), STAGE_BOX) ?? layout.opening.box,
      size = layout.opening.labels.length ? Math.min(...layout.opening.labels.map((l) => l.size)) : Infinity,
      minimum = Math.max(1, READ_PX / (size * s)),
      fit = Math.min(w / ((box[2] - box[0]) * s), h / ((box[3] - box[1]) * s));
    if (minimum <= Math.min(max, fit) + 1e-9) {
      const [cx, cy] = center(box),
        x = ox + (cx - STAGE_BOX[0]) * s,
        y = oy + (STAGE_BOX[3] - cy) * s,
        zoom = clampZoom({ k: minimum, x: w / 2 - minimum * x, y: h / 2 - minimum * y }, w, h, max),
        shown = viewBox(zoom, w, h);
      if (inside(box[0], box[1], shown) && inside(box[2], box[3], shown)) opening.push(zoom);
    }
  }

  const zooms: Zoom[] = [];
  // Clamping can land two views in one place; the tour visits it once.
  for (const z of [...opening, views[open]!.zoom, ...first, ...rest])
    if (!zooms.some((o) => Math.abs(o.k - z.k) < 1e-6 && Math.abs(o.x - z.x) < 1e-6 && Math.abs(o.y - z.y) < 1e-6))
      zooms.push(z);
  return zooms;
}
/** Where a step opens on a `w`×`h` stage: the first of its close-ups. */
export const closeUp = (layout: StepLayout | undefined, w: number, h: number, max = ZOOM_MAX): Zoom =>
  closeUps(layout, w, h, max)[0]!;
