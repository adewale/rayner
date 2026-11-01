import { readerShellProblems, cropTest } from './explain-reader-shell.ts';
import type { ReaderShell } from './explain-reader-shell.ts';
// Served-story evidence: Node declares the expected objects; native SVG geometry
// establishes which of their actual painted paths the reader can see.
import assert from 'node:assert/strict';
import type { Page } from 'playwright-core';
import { renderElements, VMobject } from '../../src/index.ts';
import type { SceneClass, Mobject, ElementRecord } from '../../src/index.ts';
import { emphasisOf } from '../../explain/look.ts';
import { labelOf, readingLabelSize } from '../../explain/diagrams.ts';
import { isHeading } from '../../explain/stage.ts';
import { stepWords } from '../../explain/trace.ts';
import type { Project } from './explain-project.ts';
import { join } from 'node:path';
import { rasterize } from './explain-raster.ts';
import type { NarrowOpeningReview, NarrowOpeningObligation } from './explain-review-plan.ts';

export interface StoryClaim {
  step: string;
  settings?: Record<string, string>;
  opening?: boolean;
  targets: readonly (({ key: string } | { text: string }) & { paint?: 'stroke' })[];
}
interface Target {
  name: string;
  indices: number[];
  opening: boolean;
  camera?: boolean;
  partial?: number[];
  required?: boolean;
}
export interface StoryFrame {
  records: ElementRecord[];
  targets: Target[];
  camera: number[];
  labels: { text: string; size: number; indices: number[] }[];
}

interface StoryPaint {
  id: number;
  signature: string;
  bounds: Rect | null;
  record: ElementRecord;
}
const paintBoundsCache = new WeakMap<ElementRecord, Rect | null>();
/** Bounds of emitted integer path coordinates, not a Text's advance rectangle. */
function paintBounds(record: ElementRecord): Rect | null {
  if (paintBoundsCache.has(record)) return paintBoundsCache.get(record)!;
  const coords = record.attrs.d?.match(/-?\d+/g)?.map(Number) ?? [];
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (let i = 0; i + 1 < coords.length; i += 2) {
    left = Math.min(left, coords[i]!);
    right = Math.max(right, coords[i]!);
    top = Math.min(top, coords[i + 1]!);
    bottom = Math.max(bottom, coords[i + 1]!);
  }
  const half =
    record.attrs.stroke !== 'none' && Number(record.attrs['stroke-opacity'] ?? 1) > 0
      ? Number(record.attrs['stroke-width'] ?? 0) / 2
      : 0;
  // An acute miter can reach half-width times the SVG miter limit; a
  // diagonal square cap can reach sqrt(2) times half-width on either axis.
  const limit = Number(record.attrs['stroke-miterlimit'] ?? 4);
  const miter = record.attrs['stroke-linejoin'] === 'miter' ? (Number.isFinite(limit) && limit >= 1 ? limit : 4) : 1;
  const extent = half * Math.max(miter, record.attrs['stroke-linecap'] === 'square' ? Math.SQRT2 : 1);
  const tx = record.tx ?? 0,
    ty = record.ty ?? 0;
  let bounds: Rect = [left + tx - extent, top + ty - extent, right + tx + extent, bottom + ty + extent];
  if (record.clipBox) {
    const [x0, y0, x1, y1] = record.clipBox;
    bounds = [
      Math.max(bounds[0], x0 * 1000),
      Math.max(bounds[1], -y1 * 1000),
      Math.min(bounds[2], x1 * 1000),
      Math.min(bounds[3], -y0 * 1000),
    ];
  }
  const result = bounds[2] > bounds[0] && bounds[3] > bounds[1] ? bounds : null;
  paintBoundsCache.set(record, result);
  return result;
}

const intersect = (a: Rect, b: Rect): Rect =>
  [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const nonempty = (r: Rect) => r[2] > r[0] && r[3] > r[1];

/** Bounds identify possible changes, not ink: holes, caps and later opaque
 * layers can make a permutation invisible. Probe only the affected patch with
 * the same native renderer used for PNG output, at at most 1280 × 720 pixels.
 * Changes below that spatial/8-bit resolution supply no automatic evidence;
 * authors must name an explicit subject if no other artwork establishes one. */
async function changedComposite(
  current: readonly StoryPaint[], reference: readonly StoryPaint[], candidates: Set<number>, camera: Rect,
): Promise<Set<number>> {
  const boxes = [...candidates].flatMap(i => current[i]!.bounds ? [current[i]!.bounds!] : []);
  if (!boxes.length) return new Set();
  const bounds = intersect([Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])),
    Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))], camera);
  if (!nonempty(bounds)) return new Set();
  const scale = Math.min(1280 / (camera[2] - camera[0]), 720 / (camera[3] - camera[1]));
  const width = Math.max(1, Math.ceil((bounds[2] - bounds[0]) * scale));
  const height = Math.max(1, Math.ceil((bounds[3] - bounds[1]) * scale));
  const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const svg = (paints: readonly StoryPaint[]) => {
    const paths: string[] = [], clips = new Map<string, string>();
    for (const { record: r, bounds: b } of paints) {
      if (!b || !nonempty(intersect(b, bounds))) continue;
      if (r.clipBox) {
        const id = r.attrs['clip-path']!.slice(5, -1), [x0, y0, x1, y1] = r.clipBox;
        clips.set(id, `<clipPath id="${escape(id)}" clipPathUnits="userSpaceOnUse"><rect x="${Math.round(x0 * 1000)}" y="${Math.round(-y1 * 1000)}" width="${Math.round((x1 - x0) * 1000)}" height="${Math.round((y1 - y0) * 1000)}"/></clipPath>`);
      }
      paths.push(`<path${Object.entries(r.attrs).map(([k, v]) => ` ${k}="${escape(v)}"`).join('')}${r.transform ? ` transform="${escape(r.transform)}"` : ''}/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${bounds[0]} ${bounds[1]} ${bounds[2] - bounds[0]} ${bounds[3] - bounds[1]}"><defs>${[...clips.values()].join('')}</defs>${paths.join('')}</svg>`;
  };
  const [actual, restored] = await Promise.all([rasterize(svg(current)), rasterize(svg(reference))]);
  const a = actual.pixels, b = restored.pixels, differences: number[] = [];
  for (let p = 0; p < a.length; p += 4)
    if (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2] || a[p + 3] !== b[p + 3]) differences.push(p);
  const changed = new Set<number>(), occurrences = new Map<string, number[]>();
  for (const index of differences.length ? candidates : []) {
    const signature = current[index]!.signature, indices = occurrences.get(signature) ?? [];
    indices.push(index); occurrences.set(signature, indices);
  }
  for (const indices of occurrences.values()) {
    const mask = (await rasterize(svg([current[indices[0]!]!]))).pixels;
    if (differences.some(p => mask[p + 3]! > 0)) for (const index of indices) changed.add(index);
  }
  return changed;
}

/** Redraws can replace ids without changing ink. Match occurrences before
 * using native paint to establish order/count changes and revealed subjects. */
async function changedPaint(previous: readonly StoryPaint[], current: readonly StoryPaint[], camera: Rect): Promise<Set<number>> {
  const positions = new Map<string, number[]>(), counts = new Map<string, number>();
  previous.forEach((paint, index) => {
    const indices = positions.get(paint.signature) ?? [];
    indices.push(index); positions.set(paint.signature, indices);
  });
  current.forEach(paint => counts.set(paint.signature, (counts.get(paint.signature) ?? 0) + 1));
  const byId = new Map(previous.map((paint, index) => [paint.id, index]));
  const used = new Set<number>();
  const matched = current.map(paint => {
    const index = byId.get(paint.id);
    if (index === undefined || used.has(index) || previous[index]!.signature !== paint.signature) return -1;
    used.add(index); return index;
  });
  const cursors = new Map<string, number>();
  current.forEach((paint, index) => {
    if (matched[index]! >= 0) return;
    const indices = positions.get(paint.signature) ?? [];
    let cursor = cursors.get(paint.signature) ?? 0;
    while (cursor < indices.length && used.has(indices[cursor]!)) cursor++;
    if (cursor < indices.length) { matched[index] = indices[cursor]!; used.add(indices[cursor]!); }
    cursors.set(paint.signature, cursor + 1);
  });
  // Equal-looking copies are interchangeable when their count is unchanged.
  // Exchanging their ids must not invent order changes around another layer.
  const occurrence = new Map<string, number>();
  current.forEach((paint, index) => {
    const indices = positions.get(paint.signature);
    if (!indices || indices.length !== counts.get(paint.signature)) return;
    const nth = occurrence.get(paint.signature) ?? 0;
    matched[index] = indices[nth]!; occurrence.set(paint.signature, nth + 1);
  });
  const changed = new Set<number>(), candidates = new Set<number>(), countChanges = new Set<string>();
  current.forEach((paint, index) => {
    const oldCount = positions.get(paint.signature)?.length ?? 0;
    if (!oldCount) changed.add(index);
    else if (oldCount !== counts.get(paint.signature)) {
      candidates.add(index); countChanges.add(paint.signature);
    }
  });
  // A vanished signature has no current occurrence to visit above, but its
  // removal can reveal a differently painted subject underneath it.
  for (const [signature, indices] of positions)
    if (indices.length !== (counts.get(signature) ?? 0)) countChanges.add(signature);
  const reordered = new Set<number>();
  let highest = -1;
  matched.forEach((previousIndex, index) => {
    if (previousIndex >= 0 && previousIndex < highest) reordered.add(index);
    highest = Math.max(highest, previousIndex);
  });
  let lowest = Infinity;
  for (let index = matched.length - 1; index >= 0; index--) {
    const previousIndex = matched[index]!;
    if (previousIndex < 0) continue;
    if (previousIndex > lowest) reordered.add(index);
    lowest = Math.min(lowest, previousIndex);
  }
  // Only inversion participants need spatial checks. Sort these by the left
  // edge so unrelated columns do not incur an all-records pairwise scan.
  const spatial = current.flatMap((paint, index) => paint.bounds && reordered.has(index)
    ? [{ index, bounds: paint.bounds }] : []).sort((a, b) => a.bounds[0] - b.bounds[0]);
  for (let i = 0; i < spatial.length; i++) {
    const a = spatial[i]!;
    for (let j = i + 1; j < spatial.length && spatial[j]!.bounds[0] < a.bounds[2]; j++) {
      const b = spatial[j]!;
      if (a.bounds[1] >= b.bounds[3] || b.bounds[1] >= a.bounds[3]) continue;
      if ((a.index - b.index) * (matched[a.index]! - matched[b.index]!) < 0 &&
          current[a.index]!.signature !== current[b.index]!.signature) {
        candidates.add(a.index); candidates.add(b.index);
      }
    }
  }
  if (candidates.size || countChanges.size) {
    // Restore only the synthetic changes. Current new/edited artwork stays the
    // same on both sides, so an incidental new label cannot prove a reordering.
    const reference = current.flatMap((paint, i) => matched[i]! >= 0 || !countChanges.has(paint.signature)
      ? [{ paint, previousIndex: matched[i]! }] : []);
    const ordered = reference.filter(p => p.previousIndex >= 0).sort((a, b) => a.previousIndex - b.previousIndex);
    let cursor = 0;
    for (let i = 0; i < reference.length; i++) if (reference[i]!.previousIndex >= 0) reference[i] = ordered[cursor++]!;
    for (const [previousIndex, paint] of previous.entries()) {
      if (used.has(previousIndex) || !countChanges.has(paint.signature)) continue;
      const before = reference.findIndex(p => p.previousIndex > previousIndex);
      reference.splice(before < 0 ? reference.length : before, 0, { paint, previousIndex });
      // Removing a layer changes the visible contribution of the artwork below
      // it too. Binding only an identical surviving copy misses that revelation.
      current.forEach((other, i) => {
        if (matched[i]! >= 0 && matched[i]! < previousIndex && paint.bounds && other.bounds &&
            nonempty(intersect(paint.bounds, other.bounds))) candidates.add(i);
      });
    }
    for (const i of await changedComposite(current, reference.map(p => p.paint), candidates, camera)) changed.add(i);
  }
  return changed;
}

export async function storyFrames(
  Source: SceneClass,
  claims: readonly StoryClaim[] = [],
): Promise<Map<string, StoryFrame>> {
  const frames = new Map<string, StoryFrame>();
  let previous = new Map<Mobject, string>();
  // Keep ordered occurrences: redraws may change ids without changing the picture,
  // but a reordered layer or another copy can change what the reader sees.
  let previousPaint: StoryPaint[] = [];
  await new Source(
    {
      async frame() {},
      async stepEnd(scene, step) {
        const records = renderElements(scene, { relative: false });
        const members = [...new Set(scene.familyMembers())];
        const byId = new Map(members.map((m) => [m.id, m]));
        const realInk = (r: ElementRecord) => {
          if (!r.attrs.d || Number(r.attrs.opacity ?? 1) <= 0.01) return false;
          if (
            r.attrs.stroke !== 'none' &&
            Number(r.attrs['stroke-width'] ?? 0) > 0 &&
            Number(r.attrs['stroke-opacity'] ?? 1) > 0
          )
            return true;
          if (r.attrs.fill === 'none' || Number(r.attrs['fill-opacity'] ?? 1) === 0) return false;
          const m = byId.get(r.id),
            b = m?.box();
          if (!b || b[2] <= b[0] || b[3] <= b[1]) return false;
          // SVG closes open paths for fill. A straight carrier with its stroke
          // disabled has zero filled area; a curved open fill may still paint.
          if (m instanceof VMobject && !m.closed.some(Boolean)) {
            const points = m.subpaths.flatMap((p) =>
              Array.from({ length: p.length / 2 }, (_, i) => [p[2 * i]!, p[2 * i + 1]!]),
            );
            const a = points[0],
              z = points.find((p) => a && (p[0] !== a[0] || p[1] !== a[1]));
            if (
              !a ||
              !z ||
              points.every((p) => (p[0]! - a[0]!) * (z[1]! - a[1]!) - (p[1]! - a[1]!) * (z[0]! - a[0]!) === 0)
            )
              return false;
          }
          return true;
        };
        const now = emphasisOf(scene),
          targets: Target[] = [];
        const add = (
          name: string,
          objects: Mobject[],
          opening: boolean,
          context = false,
          stroke = false,
          clipShapes = false,
        ) => {
          assert.ok(objects.length, `${step.name}: story target ${name} is missing`);
          // A surviving half-word cannot stand in for the complete named label.
          // renderElements legitimately drops invisible/clipped leaves, so inspect
          // the logical glyphs before accepting only the surviving records.
          for (const object of objects)
            for (const label of object.family().filter((m) => labelOf(m)?.text.trim()))
              for (const glyph of label.family().filter((m): m is VMobject => m instanceof VMobject && m.hasPoints())) {
                assert.ok(
                  glyph.style.opacity > 0.01 &&
                    (glyph.style.drawFraction ?? 1) >= 0.95 &&
                    ((glyph.style.fill !== 'none' && glyph.style.fillOpacity > 0) ||
                      (glyph.style.stroke !== 'none' && glyph.style.strokeWidth > 0 && glyph.style.strokeOpacity > 0)),
                  `${step.name}: ${name} has missing glyph ink`,
                );
                const b = glyph.box()!;
                for (let a: Mobject | null = glyph; a; a = a.parent)
                  if (a.clipBox && !context)
                    assert.ok(
                      b[0] >= a.clipBox[0] - 0.001 &&
                        b[1] >= a.clipBox[1] - 0.001 &&
                        b[2] <= a.clipBox[2] + 0.001 &&
                        b[3] <= a.clipBox[3] + 0.001,
                      `${step.name}: ${name} has clipped glyph ink`,
                    );
              }
          const ids = new Set(objects.flatMap((m) => m.family().map((f) => f.id)));
          const geometry = new Set(records.filter((r) => ids.has(r.id)).map((r) => r.attrs.d));
          // Marks/trails can replace a carrier with a separately painted copy.
          // Bind that actual ink too, rather than crediting the invisible carrier.
          const indices = records.flatMap((r, i) =>
            (ids.has(r.id) || geometry.has(r.attrs.d)) && realInk(r) ? [i] : [],
          );
          assert.ok(indices.length, `${step.name}: story target ${name} has no painted paths`);
          if (stroke)
            assert.ok(
              indices.some((i) => {
                const a = records[i]!.attrs;
                return (
                  a.stroke !== 'none' && Number(a['stroke-width'] ?? 0) > 0 && Number(a['stroke-opacity'] ?? 1) > 0
                );
              }),
              `${step.name}: ${name} needs painted stroke ink, not only its label`,
            );
          const partial = clipShapes
            ? indices.filter((i) => {
                for (let a = byId.get(records[i]!.id); a; a = a.parent ?? undefined) if (labelOf(a)) return false;
                return true;
              })
            : undefined;
          targets.push({
            name,
            indices,
            opening,
            ...(context ? { camera: true } : {}),
            ...(clipShapes ? { partial, required: true } : {}),
          });
        };
        for (const [m, what] of now)
          if (previous.get(m) !== what) {
            assert.ok(members.includes(m), `${step.name}: newly emphasised ${m.key ?? what} is absent from the stage`);
            add(`emphasis: ${m.key ?? what}`, [m], false, false, false, true);
          }
        previous = now;
        const paint = records.map((r) => ({
          id: r.id,
          signature: JSON.stringify([r.attrs, r.transform]),
          record: r,
          bounds: realInk(r) ? paintBounds(r) : null,
        }));
        const added = new Set<Mobject>();
        // Declared intent takes priority over unrelated context that a rebuild
        // happens to replace or move. With no primary subject, inspect new art.
        const hasPrimary = targets.length > 0 || claims.some((c) => c.step === step.name);
        const [x0, y0, x1, y1] = scene.frame.box()!;
        const changed = hasPrimary ? new Set<number>() : await changedPaint(previousPaint, paint,
          [x0 * 1000, -y1 * 1000, x1 * 1000, -y0 * 1000]);
        for (const [index, r] of (hasPrimary ? [] : records).entries()) {
          if (!changed.has(index) || Number(r.attrs.opacity ?? 1) < 0.95) continue;
          const m = byId.get(r.id);
          if (!m) continue;
          let fixed = false,
            subject = m;
          for (let a: Mobject | null = m; a; a = a.parent) {
            if (a.key === '__paper' || a.key === '__frame' || isHeading(a)) fixed = true;
            if (labelOf(a)) subject = a;
          }
          if (fixed || added.has(subject)) continue;
          // Invisible route helpers are not narrative artwork.
          if (!realInk(r)) continue;
          add(`changed: ${labelOf(subject)?.text ?? subject.key ?? 'drawing'}`, [subject], false, true);
          added.add(subject);
        }
        previousPaint = paint;
        for (const claim of claims.filter((c) => c.step === step.name))
          for (const target of claim.targets) {
            const name = 'key' in target ? target.key : target.text;
            add(
              name,
              members.filter((m) => ('key' in target ? m.key === target.key : labelOf(m)?.text === target.text)),
              !!claim.opening,
              false,
              target.paint === 'stroke',
            );
          }
        assert.ok(targets.length, `${step.name}: unchanged artwork needs a declared story subject`);
        const labels = members.flatMap((m) => {
          const label = labelOf(m);
          if (!label?.text.trim() || isHeading(m)) return [];
          const ids = new Set(m.family().map((child) => child.id));
          const indices = records.flatMap((r, index) => (ids.has(r.id) && realInk(r) ? [index] : []));
          return indices.length
            ? [{ text: label.text, size: readingLabelSize(m)!, indices }]
            : [];
        });
        frames.set(step.name, { records, targets, camera: [...scene.frame.box()!], labels });
      },
    },
    { skipUntil: Infinity },
  ).run();
  for (const c of claims) assert.ok(frames.has(c.step), `story claim names missing step ${c.step}`);
  return frames;
}

type Rect = [number, number, number, number];
/** Whether actual viewport rectangles cover a target; supports targets spanning several views. */
export function covered(target: Rect, views: readonly Rect[]): boolean {
  let left = [target];
  for (const v of views)
    left = left.flatMap((r): Rect[] => {
      const x = Math.max(r[0], v[0]),
        y = Math.max(r[1], v[1]),
        right = Math.min(r[2], v[2]),
        bottom = Math.min(r[3], v[3]);
      if (right <= x || bottom <= y) return [r];
      return [
        [r[0], r[1], x, r[3]],
        [right, r[1], r[2], r[3]],
        [x, r[1], right, y],
        [x, bottom, right, r[3]],
      ].filter((b) => b[2]! > b[0]! && b[3]! > b[1]!) as Rect[];
    });
  return left.length === 0;
}

/** Inspect actual DOM paths, rather than projecting an expected box over potentially absent artwork. */
export async function inspectStoryFrame(page: Page, frame: StoryFrame) {
  return page.locator('.stage svg:not(.leaving)').evaluate((node, expected) => {
    const svg = node as SVGSVGElement,
      stage = svg.parentElement!.getBoundingClientRect();
    const elements = [...svg.children].filter((e) => e.tagName.toLowerCase() !== 'defs') as SVGGraphicsElement[];
    if (elements.length !== expected.records.length)
      throw new Error(`painted record count: ${elements.length}, expected ${expected.records.length}`);
    for (const [i, r] of expected.records.entries()) {
      const e = elements[i]!;
      if (
        e.tagName.toLowerCase() !== r.tag ||
        Object.entries(r.attrs).some(([k, v]) => e.getAttribute(k) !== v) ||
        (e.getAttribute('transform') ?? null) !== r.transform
      )
        throw new Error(`painted record ${i} differs from the resting scene`);
    }
    const rect = (r: DOMRect): [number, number, number, number] => [r.left, r.top, r.right, r.bottom];
    const camera = expected.camera;
    const author: [number, number, number, number] = [
      camera[0]! * 1000,
      -camera[3]! * 1000,
      camera[2]! * 1000,
      -camera[1]! * 1000,
    ];
    const points = (b: number[], matrix: DOMMatrix) => [
      new DOMPoint(b[0], b[1]).matrixTransform(matrix),
      new DOMPoint(b[2], b[3]).matrixTransform(matrix),
    ];
    // Match the existing PKCE screen-space contract: one CSS pixel for
    // antialias/stroke-edge rounding. Rectangle union itself remains exact.
    const viewportPoints = points(
      [stage.left - 1, stage.top - 1, stage.right + 1, stage.bottom + 1],
      svg.getScreenCTM()!.inverse(),
    );
    const viewport: [number, number, number, number] = [
      viewportPoints[0]!.x,
      viewportPoints[0]!.y,
      viewportPoints[1]!.x,
      viewportPoints[1]!.y,
    ];
    const ink = [...new Set(expected.targets.flatMap((t) => t.indices))].map((index) => {
      const e = elements[index]!,
        b = e.getBBox(),
        matrix = svg.getScreenCTM()!.inverse().multiply(e.getScreenCTM()!);
      const paint = getComputedStyle(e),
        half = paint.stroke !== 'none' && Number(paint.strokeOpacity) > 0 ? parseFloat(paint.strokeWidth) / 2 : 0;
      let box = [b.x - half, b.y - half, b.x + b.width + half, b.y + b.height + half];
      const p = points(box, matrix);
      box = [p[0]!.x, p[0]!.y, p[1]!.x, p[1]!.y];
      const alphaZero = (p: string) =>
        p === 'none' ||
        p === 'transparent' ||
        /\/\s*0(?:\.0+)?\s*\)$/.test(p) ||
        /^(?:rgba|hsla)\([^,]*,[^,]*,[^,]*,\s*0(?:\.0+)?\s*\)$/.test(p);
      let visible =
        (!alphaZero(paint.fill) && Number(paint.fillOpacity) > 0) ||
        (!alphaZero(paint.stroke) && Number(paint.strokeOpacity) > 0 && parseFloat(paint.strokeWidth) > 0);
      let opacity = 1;
      for (let a: Element | null = e; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        opacity *= Number(s.opacity);
        if (s.display === 'none' || s.visibility !== 'visible') visible = false;
        if (s.clipPath !== 'none') {
          const declared = /^url\(#([^)]*)\)$/.exec(e.getAttribute('clip-path') ?? '')?.[1];
          const effective = /^url\(["']?([^"')]+)["']?\)$/.exec(s.clipPath)?.[1]?.split('#').at(-1);
          if (a !== e || !declared || effective !== declared) visible = false;
        }
      }
      visible &&= opacity > 0.01;
      // A target clipped by its own viewport must not earn coverage for the missing ink.
      const clip = e.getAttribute('clip-path');
      let complete = true,
        shown = [...box];
      if (clip) {
        const id = /^url\(#([^)]*)\)$/.exec(clip)?.[1];
        const definition = id ? svg.querySelector(`[id="${id}"]`) : null;
        const r = definition?.firstElementChild as SVGGraphicsElement | null;
        if (!definition || !r) throw new Error(`unresolved target clip ${clip}`);
        // The renderer emits one rectangular user-space clip. Other shapes,
        // units or transforms cannot be credited using an axis-aligned rect.
        const clipStyle = getComputedStyle(r);
        const rectangular =
          definition.tagName.toLowerCase() === 'clippath' &&
          definition.children.length === 1 &&
          r.tagName.toLowerCase() === 'rect' &&
          definition.getAttribute('clipPathUnits') === 'userSpaceOnUse' &&
          [definition, r].every((n) => !n.hasAttribute('transform') && getComputedStyle(n).transform === 'none') &&
          Number(r.getAttribute('rx') ?? 0) === 0 &&
          Number(r.getAttribute('ry') ?? 0) === 0 &&
          [clipStyle.rx, clipStyle.ry].every(radius => radius === 'auto' || /^0(?:\.0+)?(?:px|%)?$/.test(radius));
        if (!rectangular) visible = false;
        // Native geometry also observes CSS x/y/width/height overrides.
        const bounds = r.getBBox();
        const c = [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height];
        complete = box[0]! >= c[0]! - 1 && box[1]! >= c[1]! - 1 && box[2]! <= c[2]! + 1 && box[3]! <= c[3]! + 1;
        shown = [
          Math.max(box[0]!, c[0]!),
          Math.max(box[1]!, c[1]!),
          Math.min(box[2]!, c[2]!),
          Math.min(box[3]!, c[3]!),
        ];
      }
      // One SVG unit is 0.001 scene units: accommodate path formatting at its
      // declared precision, not a percentage of an arbitrarily cropped target.
      const epsilon = Math.min(1, (box[2]! - box[0]!) / 4, (box[3]! - box[1]!) / 4);
      return {
        index,
        visible,
        complete,
        shown: shown as [number, number, number, number],
        box: [box[0]! + epsilon, box[1]! + epsilon, box[2]! - epsilon, box[3]! - epsilon] as [
          number,
          number,
          number,
          number,
        ],
        author,
        // Record the browser's effective transform, including CSS transforms on
        // an individual path. Authored font size alone cannot prove readability.
        scale: (() => {
          const m = e.getScreenCTM()!;
          const x = m.a * m.a + m.b * m.b,
            y = m.c * m.c + m.d * m.d;
          const largest = Math.sqrt((x + y + Math.hypot(x - y, 2 * (m.a * m.c + m.b * m.d))) / 2);
          return largest ? (Math.abs(m.a * m.d - m.b * m.c) / largest) * 1000 : 0;
        })(),
      };
    });
    return { viewport, ink, stage: rect(stage), viewBox: svg.getAttribute('viewBox') };
  }, frame);
}

/** Build-time obligations come from authored main/detail metadata and the
 * independent caption claims, before the served reader produces any receipt. */
export async function narrowOpeningPlan(
  variant: Pick<Project['variants'][number], 'Scene' | 'trace' | 'values'>,
  claims: readonly StoryClaim[],
  frames?: Map<string, StoryFrame>,
): Promise<NarrowOpeningObligation[]> {
  const applicable = claims.filter((c) =>
    Object.entries(c.settings ?? {}).every(([key, value]) => variant.values[key] === value),
  );
  const source = frames ?? (await storyFrames(variant.Scene, applicable));
  const hasMain = variant.trace.steps.some((step) => step.meta.detail !== true);
  return variant.trace.steps.map((step) => {
    if (step.meta.detail === true && hasMain) return { step: step.step, reviewed: false, reason: 'detail-step' };
    const targets = [
      ...new Set(
        applicable
          .filter((c) => c.step === step.step && c.opening)
          .flatMap((c) => c.targets.map((t) => ('key' in t ? t.key : t.text))),
      ),
    ];
    if (!targets.length) return { step: step.step, reviewed: false, reason: 'no-opening-claim' };
    const frame = source.get(step.step)!;
    const wanted = new Set(targets);
    const indices = new Set(frame.targets.filter((t) => t.opening && wanted.has(t.name)).flatMap((t) => t.indices));
    const labels = frame.labels
      .filter((label) => label.indices.some((index) => indices.has(index)))
      .map((label) => label.text);
    return { step: step.step, reviewed: true, targets, labels };
  });
}

type StoryView = Awaited<ReturnType<typeof inspectStoryFrame>>;
function verifyStoryTargets(
  frame: StoryFrame,
  views: StoryView[],
  step: string,
  width: number,
  targets = frame.targets,
) {
  const opening = views[0]!;
  const verified = new Set<string>();
  for (const target of targets) {
    let seen = 0;
    for (const index of target.indices) {
      const bounded = target.camera || target.partial?.includes(index);
      const original = opening.ink.find((p) => p.index === index)!;
      // The obligation comes from the authored frame, never from a possibly
      // damaged live clip. Each stop contributes only its actual shown ink.
      const authoredClip = frame.records[index]!.clipBox;
      const expectedClip: Rect = authoredClip
        ? [authoredClip[0] * 1000, -authoredClip[3] * 1000, authoredClip[2] * 1000, -authoredClip[1] * 1000]
        : (original.author as Rect);
      const box: Rect = bounded
        ? [
            Math.max(original.box[0], expectedClip[0], original.author[0]),
            Math.max(original.box[1], expectedClip[1], original.author[1]),
            Math.min(original.box[2], expectedClip[2], original.author[2]),
            Math.min(original.box[3], expectedClip[3], original.author[3]),
          ]
        : original.box;
      if (bounded && (box[2] <= box[0] || box[3] <= box[1])) continue; // context outside an authored viewport is not newly shown ink
      const eligible = (target.opening ? [opening] : views).filter((v) => {
        const ink = v.ink.find((p) => p.index === index);
        return ink?.visible && (bounded || ink.complete);
      });
      assert.ok(eligible.length, `${step}: ${target.name} has hidden or clipped ink`);
      const ink = eligible[0]!.ink.find((p) => p.index === index)!;
      assert.ok(ink.box[2] > ink.box[0] && ink.box[3] > ink.box[1], `${step}: ${target.name} has empty ink`);
      const coverage = eligible.map((v) => {
        if (!bounded) return v.viewport;
        const shown = v.ink.find((p) => p.index === index)!.shown;
        return [
          Math.max(v.viewport[0], shown[0]),
          Math.max(v.viewport[1], shown[1]),
          Math.min(v.viewport[2], shown[2]),
          Math.min(v.viewport[3], shown[3]),
        ] as Rect;
      });
      assert.ok(
        covered(box, coverage),
        `${step} at ${width}px: ${target.name} is missing from ${target.opening ? 'the opening' : 'the close-up tour'}: ${JSON.stringify({ box, views: coverage })}`,
      );
      verified.add(target.name);
      seen++;
    }
    if (target.required) assert.ok(seen, `${step}: ${target.name} is outside the authored picture`);
  }
  return verified;
}

/** Named subjects must contribute pixels and their labels must retain their
 * glyph cores in the actual opening. Small native-browser rasters preserve
 * clips, paint order and effective styles without per-glyph screenshots. */
async function verifyNarrowPaint(page: Page, subjects: { name: string; indices: number[]; label?: boolean }[], step: string) {
  const missing = await page.locator('.stage svg:not(.leaving)').evaluate(async (node, subjects) => {
    const svg = node as SVGSVGElement, clone = svg.cloneNode(true) as SVGSVGElement;
    const painted = [...svg.children].filter(element => element.tagName.toLowerCase() !== 'defs');
    // The authored Style model has no mask/filter contract. Letting such an
    // effect shrink both the actual picture and its expected glyph-core mask
    // could make a partly erased word prove its own completeness. Shapes have
    // the same unsupported-effect policy, even though their interiors can be
    // covered by legitimate artwork such as endpoint nodes and label plates.
    const effects = new Map<Element, boolean>();
    for (const subject of [...subjects.filter(subject => subject.label), ...subjects.filter(subject => !subject.label)])
      for (const index of subject.indices) {
        const path = painted[index]!, paint = getComputedStyle(path);
        // Authored paths use solid colors. A transparent paint-server region
        // must not erase the same glyph cores that the receipt is meant to prove.
        if (['fill', 'stroke'].some(property => {
          const value = paint.getPropertyValue(property);
          return value !== 'none' && !CSS.supports('color', value);
        })) throw new Error(`${subject.name}: unsupported paint server on a required opening subject`);
        // CSS can replace a path's d without changing its declared attribute.
        // Normalize the declaration with the browser's CSS parser before
        // comparing, so harmless SVG spacing/command serialization is allowed.
        if (path.tagName.toLowerCase() === 'path') {
          const declaration = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          declaration.style.setProperty('d', `path("${path.getAttribute('d') ?? ''}")`);
          if (paint.getPropertyValue('d') !== declaration.style.getPropertyValue('d'))
            throw new Error(`${subject.name}: CSS overrides declared subject path`);
        }
        for (let element: Element | null = path; element; element = element.parentElement) {
          if (!effects.has(element)) {
            const style = getComputedStyle(element);
            effects.set(element, style.maskImage !== 'none' || style.filter !== 'none' || style.backdropFilter !== 'none');
          }
          if (effects.get(element)) throw new Error(`${subject.name}: unsupported mask/filter on a required opening subject`);
        }
      }
    const original = [svg, ...svg.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
    // Image SVGs have no access to the reader stylesheet. Capture the effective
    // paint, including CSSOM overrides, before drawing the detached clone.
    const properties = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width',
      'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
      'opacity', 'visibility', 'display', 'clip-path', 'clip-rule', 'filter', 'mask', 'paint-order',
      'vector-effect', 'transform', 'transform-origin', 'transform-box', 'mix-blend-mode'];
    for (const [index, source] of original.entries()) {
      const target = copies[index] as SVGElement, computed = getComputedStyle(source);
      target.removeAttribute('style');
      for (const property of properties) {
        const value = computed.getPropertyValue(property).replace(/url\(["']?[^"')]*#([^"')]+)["']?\)/g, 'url(#$1)');
        if (value) target.style.setProperty(property, value);
      }
      // Clip rectangles may have CSS geometry overrides as well as paint.
      if (source.tagName.toLowerCase() === 'rect')
        for (const property of ['x', 'y', 'width', 'height', 'rx', 'ry']) {
          const value = computed.getPropertyValue(property);
          if (value) target.style.setProperty(property, value);
        }
    }
    const bounds = svg.parentElement!.getBoundingClientRect(), width = Math.ceil(bounds.width), height = Math.ceil(bounds.height);
    clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d')!;
    const raster = async () => {
      const image = new Image();
      image.src = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      await image.decode(); context.clearRect(0, 0, width, height); context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, width, height).data;
    };
    const baseline = await raster();
    const elements = [...clone.children].filter(e => e.tagName.toLowerCase() !== 'defs') as SVGElement[];
    const checked = new Map<string, { delta: Uint8Array; removed: Uint8ClampedArray; contributes: boolean; coreCoverage?: number; unpaintedCore?: number }>();
    const missing: string[] = [];
    for (const subject of subjects) {
      const indices = [...new Set(subject.indices)].sort((a, b) => a - b), key = indices.join(',');
      let evidence = checked.get(key);
      if (!evidence) {
        const old = indices.map(index => elements[index]!.style.display);
        indices.forEach(index => elements[index]!.style.display = 'none');
        const removed = await raster(), delta = new Uint8Array(width * height);
        for (let pixel = 0; pixel < delta.length; pixel++)
          delta[pixel] = Math.max(
            Math.abs(baseline[pixel * 4]! - removed[pixel * 4]!),
            Math.abs(baseline[pixel * 4 + 1]! - removed[pixel * 4 + 1]!),
            Math.abs(baseline[pixel * 4 + 2]! - removed[pixel * 4 + 2]!),
            Math.abs(baseline[pixel * 4 + 3]! - removed[pixel * 4 + 3]!),
          );
        indices.forEach((index, i) => elements[index]!.style.display = old[i]!);
        evidence = {delta, removed, contributes: delta.some(value => value > 0)};
        checked.set(key, evidence);
      }
      if (subject.label && evidence.coreCoverage === undefined) {
        // Paint the actual label last over the same backdrop as a full-strength
        // reference. A thin opaque crossing can leave antialias traces, so a
        // nonzero difference alone does not establish meaningful glyph ink.
        indices.forEach(index => clone.append(elements[index]!));
        const last = await raster();
        elements.forEach(element => clone.append(element));
        const paintedColor = (value: string) => value !== 'none' && value !== 'transparent' &&
          !/\/\s*0(?:\.0+)?\s*\)$/.test(value) && !/^(?:rgba|hsla)\([^,]*,[^,]*,[^,]*,\s*0(?:\.0+)?\s*\)$/.test(value);
        const selected = new Set(indices), old = elements.map(element => ({display: element.style.display,
          opacity: element.style.opacity, fill: element.style.fill, stroke: element.style.stroke,
          fillOpacity: element.style.fillOpacity, strokeOpacity: element.style.strokeOpacity}));
        elements.forEach((element, index) => {
          if (!selected.has(index)) element.style.display = 'none';
          else {
            // Normalize explicit dimming only for the geometric core mask. The
            // baseline/removal difference still uses the actual dimmed paint.
            element.style.opacity = '1';
            // A disabled fill or stroke is not part of the authored glyph core.
            if (Number(element.style.fillOpacity) > 0) element.style.fillOpacity = '1';
            if (Number(element.style.strokeOpacity) > 0) element.style.strokeOpacity = '1';
            // Keep stroke geometry and paint order active. Removing a halo
            // changes WebKit's edge rasterization. Black ink over a white
            // backing stroke separates glyph coverage without that switch.
            const filled = paintedColor(element.style.fill) && Number(element.style.fillOpacity) > 0;
            if (filled) element.style.fill = '#000000';
            if (paintedColor(element.style.stroke) && Number(element.style.strokeOpacity) > 0)
              element.style.stroke = filled && element.style.getPropertyValue('paint-order').startsWith('stroke') ? '#ffffff' : '#000000';
          }
        });
        const mask = await raster();
        elements.forEach((element, index) => Object.assign(element.style, old[index]!));
        const coverage = new Uint8Array(evidence.delta.length);
        let peak = 0;
        for (let pixel = 0; pixel < coverage.length; pixel++) {
          // Black coverage counts; a white halo and transparent pixels do not.
          coverage[pixel] = Math.round(mask[pixel * 4 + 3]! * (255 - mask[pixel * 4]!) / 255);
          peak = Math.max(peak, coverage[pixel]!);
        }
        let core = 0, shown = 0, unpainted = 0;
        for (let pixel = 0; pixel < evidence.delta.length; pixel++)
          if (coverage[pixel]! > 0 && coverage[pixel]! >= peak / 2) {
            const full = Math.max(
              Math.abs(last[pixel * 4]! - evidence.removed[pixel * 4]!),
              Math.abs(last[pixel * 4 + 1]! - evidence.removed[pixel * 4 + 1]!),
              Math.abs(last[pixel * 4 + 2]! - evidence.removed[pixel * 4 + 2]!),
              Math.abs(last[pixel * 4 + 3]! - evidence.removed[pixel * 4 + 3]!),
            );
            core++; if (full <= 0) unpainted++;
            if (full > 0 && evidence.delta[pixel]! >= full / 2) shown++;
          }
        evidence.coreCoverage = core ? shown / core : 0;
        evidence.unpaintedCore = unpainted;
      }
      // Ignore antialias edges and at most 1% of core pixels for rounding;
      // the rest must retain half their unobscured contribution. This rejects
      // an opaque crossing or missing word without per-glyph renders.
      if (!evidence.contributes || (subject.label && evidence.coreCoverage! < .99)) missing.push(`${subject.name} (contributes: ${evidence.contributes}, glyph core: ${evidence.coreCoverage ?? 'shape'}, unpainted core: ${evidence.unpaintedCore ?? 'shape'})`);
    }
    return missing;
  }, subjects);
  assert.deepEqual(missing, [], `${step} at 320px: subjects have missing or obscured paint: ${missing.join(', ')}`);
}

async function reviewNarrowOpening(
  page: Page,
  url: string,
  variant: Project['variants'][number],
  step: string,
  frame: StoryFrame,
): Promise<NarrowOpeningReview> {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${url}?${new URLSearchParams({ ...variant.values, step })}`);
  await page.waitForSelector('[data-ready=true]');
  await page.waitForFunction(
    (name) =>
      (window as unknown as { raynerReviewStep?: string }).raynerReviewStep === name &&
      document.querySelector('[aria-current=step]')?.getAttribute('data-step') === name &&
      !document.querySelector('#content.loading'),
    step,
  );
  await page.locator('.leaving').waitFor({ state: 'detached' });
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  assert.equal(await page.evaluate(() => innerWidth), 320);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    `${step} at 320px: page overflows`,
  );
  const opening = await inspectStoryFrame(page, frame),
    targets = frame.targets.filter((target) => target.opening);
  const verified = verifyStoryTargets(frame, [opening], step, 320, targets);
  const indices = new Set(targets.flatMap((target) => target.indices));
  const labels = frame.labels.filter((label) => label.indices.some((index) => indices.has(index)));
  let minimumLabelPx: number | null = null;
  for (const label of labels) {
    const pixels =
      label.size *
      Math.min(
        ...label.indices
          .filter((index) => indices.has(index))
          .map((index) => opening.ink.find((ink) => ink.index === index)!.scale),
      );
    assert.ok(pixels >= 12 - 1e-6, `${step} at 320px: ${label.text} reads at ${pixels}px, below 12px`);
    minimumLabelPx = minimumLabelPx === null ? pixels : Math.min(minimumLabelPx, pixels);
  }
  assert.ok(verified.size, `${step} at 320px: no opening subject is painted`);
  await verifyNarrowPaint(page, [
    ...targets.map(target => ({name: target.name, indices: target.indices})),
    ...labels.map(label => ({name: `label ${label.text}`, indices: label.indices.filter(index => indices.has(index)), label: true})),
  ], step);
  return {
    reviewed: true,
    width: 320,
    height: 568,
    targets: [...verified],
    labels: labels.map((label) => label.text),
    minimumLabelPx,
  };
}

/** Visit every step at a real viewport width, with a fresh reader opening per width. */
const initialized = new WeakSet<Page>();
export async function reviewStoryVariant(
  page: Page,
  url: string,
  variant: Project['variants'][number],
  claims: readonly StoryClaim[] = [],
  directory?: string,
  shell?: ReaderShell,
) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (!initialized.has(page)) {
    await page.addInitScript(() => {
      const w = window as unknown as { raynerReviewStep: string | null };
      w.raynerReviewStep = null;
      document.addEventListener('rayner:step', (e) => {
        w.raynerReviewStep = (e as CustomEvent).detail.step;
      });
    });
    initialized.add(page);
  }
  const applicable = claims.filter((c) => Object.entries(c.settings ?? {}).every(([k, v]) => variant.values[k] === v));
  const frames = await storyFrames(variant.Scene, applicable),
    results = [];
  const narrow = new Map<string, NarrowOpeningReview>();
  const obligations = await narrowOpeningPlan(variant, applicable, frames);
  for (const obligation of obligations) {
    if (!obligation.reviewed) narrow.set(obligation.step, { reviewed: false, reason: obligation.reason });
    else
      narrow.set(
        obligation.step,
        await reviewNarrowOpening(page, url, variant, obligation.step, frames.get(obligation.step)!),
      );
  }
  assert.equal(narrow.size, variant.trace.steps.length, 'every step has a narrow-opening review or explicit exclusion');
  assert.equal(frames.size, variant.trace.steps.length, 'every traced step has a resting frame');
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1180, height: 980 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [index, step] of variant.trace.steps.entries()) {
      const query = new URLSearchParams({ ...variant.values, step: step.step });
      // Start each width as a fresh reader. Then use the real step buttons:
      // Next view preserves automatic following, and each step must reset its
      // tour to the opening. This also exercises retained/restored DOM frames.
      if (index === 0) await page.goto(`${url}?${query}`);
      else
        await page.locator('button[data-step]').evaluateAll((buttons, name) => {
          const button = buttons.find((b) => b.getAttribute('data-step') === name) as HTMLButtonElement | undefined;
          if (!button) throw new Error(`missing step button ${name}`);
          button.click();
        }, step.step);
      await page.waitForSelector('[data-ready=true]');
      await page.waitForFunction(
        (name) =>
          (window as unknown as { raynerReviewStep?: string }).raynerReviewStep === name &&
          document.querySelector('[aria-current=step]')?.getAttribute('data-step') === name &&
          !document.querySelector('#content.loading'),
        step.step,
      );
      await page.locator('.leaving').waitFor({ state: 'detached' });
      await page.evaluate(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      );
      if (index === 0 && shell) {
        assert.deepEqual(await page.evaluate(readerShellProblems, shell), [], 'reader shell');
        if (viewport.width === 1180 && shell.crop) assert.deepEqual(await page.evaluate(cropTest, shell.crop), [], 'standalone tile');
      }
      assert.equal(await page.evaluate(() => innerWidth), viewport.width, 'review must use the declared viewport');
      assert.equal(await page.locator('.caption').innerText(), stepWords(step).caption);
      assert.ok(await page.locator('.stage path').count(), `${step.step}: no artwork`);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `${step.step}: page overflows`,
      );
      const frame = frames.get(step.step)!;
      const opening = await inspectStoryFrame(page, frame),
        views = [opening];
      if (directory)
        await page.locator('.stage').screenshot({
          path: join(directory, `${encodeURIComponent(step.step)}.${viewport.width}.png`),
          animations: 'disabled',
        });
      const next = page.locator('.view-controls > button').first();
      const visited = new Set([opening.viewBox]);
      if ((await next.isVisible()) && (await next.isEnabled()))
        for (let n = 0; n < frame.records.length + 1; n++) {
          await next.click();
          await page.evaluate(
            () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
          );
          const view = await inspectStoryFrame(page, frame),
            key = view.viewBox;
          if (visited.has(key)) break;
          visited.add(key);
          views.push(view);
          assert.ok(n < frame.records.length, `${step.step}: close-up tour did not terminate`);
        }
      const verified = verifyStoryTargets(frame, views, step.step, viewport.width);
      assert.ok(verified.size, `${step.step}: no story subject is painted in a reader view`);
      results.push({
        step: step.step,
        width: viewport.width,
        views: views.length,
        targets: [...verified],
        ...(viewport.width === 390 ? { openingAt320: narrow.get(step.step)! } : {}),
      });
    }
  }
  assert.deepEqual(
    results.map(({ step, width }) => ({ step, width })),
    [390, 1180].flatMap((width) => variant.trace.steps.map((step) => ({ step: step.step, width }))),
    'every traced step must be reviewed exactly once at each width',
  );
  return results;
}
