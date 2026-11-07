// The geometric part of Lantern's layout verifier, adapted for Rayner's semantic
// diagram labels, painted VMobject connectors, clipped camera and label plates.
import { Arc, Line, Rectangle, VMobject } from '../../src/index.ts';
import { ArcBetweenPoints } from '../../src/extras.ts';
import { renderElements } from '../../src/output.ts';
import type { Box, Mobject, Scene, Vec } from '../../src/index.ts';
import { contains, intersect, nonempty, pad, pointsBox } from '../../src/box.ts';
import { isDiagramConnector, labelOf } from '../../explain/diagrams.ts';
import { isHeading } from '../../explain/stage.ts';

function visible(m: Mobject): boolean {
  for (let a: Mobject | null = m; a; a = a.parent) if (a.style.opacity < 0.95) return false;
  return true;
}
// Unknown CSS paints may be visible, but cannot prove an opaque paper mask.
function paintAlpha(paint: string): number | undefined {
  const p = paint.trim().toLowerCase();
  if (p === 'none' || p === 'transparent') return 0;
  if (/^#[\da-f]{3}$|^#[\da-f]{6}$/.test(p)) return 1;
  if (/^#[\da-f]{4}$/.test(p)) return parseInt(p[4]!, 16) / 15;
  if (/^#[\da-f]{8}$/.test(p)) return parseInt(p.slice(7), 16) / 255;
  const color = /^(?:rgba?|hsla?)\((.*)\)$/.exec(p);
  if (!color) return undefined;
  const parts = color[1]!.split(',');
  const alpha = /\/\s*([\d.]+)(%)?\s*$/.exec(color[1]!) ??
    (parts.length === 4 ? /^\s*([\d.]+)(%)?\s*$/.exec(parts[3]!) : null);
  return alpha ? Math.min(1, Number(alpha[1]) / (alpha[2] ? 100 : 1)) : undefined;
}
function opaque(m: Mobject): boolean {
  for (let a: Mobject | null = m; a; a = a.parent) if (a.style.opacity !== 1) return false;
  return m.style.fillOpacity === 1 && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(m.style.fill);
}
function textAncestor(m: Mobject | null): boolean {
  for (let a: Mobject | null = m; a; a = a.parent) if (labelOf(a)) return true;
  return false;
}
/** Flatten for geometric inspection, not for drawing. Straight cubics need only their ends. */
function points(path: Float32Array): Vec[] {
  const result: Vec[] = [];
  for (let i = 0; i + 7 < path.length; i += 6) {
    const a: Vec = [path[i]!, path[i + 1]!], d: Vec = [path[i + 6]!, path[i + 7]!];
    if (!result.length) result.push(a);
    const cross = (x: number, y: number) => Math.abs((x - a[0]) * (d[1] - a[1]) - (y - a[1]) * (d[0] - a[0]));
    const monotone = (axis: number) => Math.min(a[axis]!, d[axis]!) <= path[i + 2 + axis]! && path[i + 2 + axis]! <= Math.max(a[axis]!, d[axis]!) && Math.min(a[axis]!, d[axis]!) <= path[i + 4 + axis]! && path[i + 4 + axis]! <= Math.max(a[axis]!, d[axis]!);
    const steps = cross(path[i + 2]!, path[i + 3]!) < 1e-8 && cross(path[i + 4]!, path[i + 5]!) < 1e-8 && monotone(0) && monotone(1) ? 1 : 32;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      result.push([u ** 3 * a[0] + 3 * u * u * t * path[i + 2]! + 3 * u * t * t * path[i + 4]! + t ** 3 * d[0], u ** 3 * a[1] + 3 * u * u * t * path[i + 3]! + 3 * u * t * t * path[i + 5]! + t ** 3 * d[1]]);
    }
  }
  return result;
}
/** A cubic's convex hull bounds its ink; subdivide uncertain intersections. */
function curveCrosses(c: Vec[], box: Box, depth = 0): boolean {
  const hull = pointsBox(c)!;
  if (hull[2] <= box[0] || hull[0] >= box[2] || hull[3] <= box[1] || hull[1] >= box[3]) return false;
  const inside = (p: Vec) => p[0] > box[0] && p[0] < box[2] && p[1] > box[1] && p[1] < box[3];
  if (c.every(inside)) return true;
  if (inside(c[0]!) || inside(c[3]!)) return true;
  // Float32 inputs have far less precision than 32 dyadic subdivisions. At
  // this resolution retain a potential boundary hit rather than lose ink.
  if (depth === 32) return true;
  const mid = (a: Vec, b: Vec): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a = mid(c[0]!, c[1]!), b = mid(c[1]!, c[2]!), d = mid(c[2]!, c[3]!);
  const e = mid(a, b), f = mid(b, d), m = mid(e, f);
  return curveCrosses([c[0]!, a, e, m], box, depth + 1) || curveCrosses([m, f, d, c[3]!], box, depth + 1);
}

/** Stroke at a connector attachment may meet the boundary, but not ride along it. */
function attachment(c: Vec[], box: Box, halfStroke: number, allowStart: boolean, allowEnd: boolean): boolean {
  const epsilon = halfStroke + 4 * 2 ** -23 * Math.max(1, ...box.map(Math.abs));
  const normals = (p: Vec): Vec[] => {
    if (p[0] < box[0] - epsilon || p[0] > box[2] + epsilon || p[1] < box[1] - epsilon || p[1] > box[3] + epsilon) return [];
    const result: Vec[] = [];
    if (Math.abs(p[0] - box[0]) <= epsilon) result.push([-1, 0]);
    if (Math.abs(p[0] - box[2]) <= epsilon) result.push([1, 0]);
    if (Math.abs(p[1] - box[1]) <= epsilon) result.push([0, -1]);
    if (Math.abs(p[1] - box[3]) <= epsilon) result.push([0, 1]);
    return result;
  };
  const first = normals(c[0]!), last = normals(c[3]!);
  if (first.length && last.length) return false;
  return (allowStart && first.some(([x, y]) => x * (c[1]![0] - c[0]![0]) + y * (c[1]![1] - c[0]![1]) > 0)) ||
    (allowEnd && last.some(([x, y]) => x * (c[3]![0] - c[2]![0]) + y * (c[3]![1] - c[2]![1]) < 0));
}

/** A Rectangle's inscribed polygon safely covers a label only when every corner lies inside it. */
function covers(rect: Rectangle, box: Box): boolean {
  if (rect.subpaths.length !== 1 || !rect.closed[0]) return false;
  const bounds = rect.box();
  if (!bounds || !nonempty(bounds) || box[0] < bounds[0] || box[1] < bounds[1] || box[2] > bounds[2] || box[3] > bounds[3]) return false;
  const polygon = points(rect.subpaths[0]!);
  if (polygon.length < 4) return false;
  const corners: Vec[] = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
  for (const p of corners) {
    let sign = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (Math.abs(cross) < 1e-12) continue;
      const next = Math.sign(cross);
      if (sign && next !== sign) return false;
      sign = next;
    }
  }
  return true;
}

/** Visible route ink crossing a resting label. Invisible route helpers and glyph outlines are not routes. */
export function restingRouteProblems(scene: Scene): string[] {
  const records = renderElements(scene, { relative: false });
  const order = new Map(records.map((r, i) => [r.id, i]));
  const record = new Map(records.map((r) => [r.id, r]));
  const members = [...new Set(scene.familyMembers())];
  const view = scene.frame.box()!;
  const rank = (m: Mobject) => Math.min(...m.family().map((f) => order.get(f.id) ?? Infinity));
  /** `b` cut to the camera's view and every clip around `m`; null when nothing of it is left. */
  const clipped = (m: Mobject, b: Box): Box | null => {
    let box = intersect(b, view);
    for (let a: Mobject | null = m; a && box; a = a.parent) if (a.clipBox) box = intersect(box, a.clipBox);
    return box;
  };
  const labels = members.flatMap((m) => {
    const info = labelOf(m);
    if (!info?.text.trim() || !visible(m) || isHeading(m) || textAncestor(m.parent)) return [];
    // Advance boxes include font leading and spaces. A ruler beneath a glyph
    // is not a crossing merely because it touches that invisible layout space.
    const boxes = m.family().filter((f) => f instanceof VMobject && f.hasPoints() && visible(f) &&
      ((f.style.fillOpacity * (paintAlpha(f.style.fill) ?? 1) >= 0.95) || (f.style.strokeWidth > 0 && f.style.strokeOpacity * (paintAlpha(f.style.stroke) ?? 1) >= 0.95)))
      .flatMap((f) => { const b = f.box(), c = b && clipped(f, b); return c ? [c] : []; });
    const at = rank(m);
    return boxes.length && Number.isFinite(at) ? [{ m, text: info.text, boxes, rank: at }] : [];
  });
  const plates = members.filter((m): m is Rectangle => m instanceof Rectangle && opaque(m) && (m.style.drawFraction ?? 1) >= 1 && Number.isFinite(rank(m)));
  const problems = new Set<string>();
  const routes = members.filter((m): m is VMobject => m instanceof VMobject &&
    (m instanceof Line || m instanceof Arc || m instanceof ArcBetweenPoints || isDiagramConnector(m)) && !textAncestor(m) && visible(m) && record.has(m.id) &&
    m.style.strokeWidth > 0 && m.style.strokeOpacity * (paintAlpha(m.style.stroke) ?? 1) >= 0.95 && (m.style.drawFraction ?? 1) >= 1);
  const endpoints = routes.flatMap((m) => m.subpaths.flatMap((p, j): Vec[] => m.closed[j] || p.length < 8 ? [] : [[p[0]!, p[1]!], [p.at(-2)!, p.at(-1)!]]));
  const unjoined = (p: Vec) => endpoints.filter((q) => Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1])) <= 4 * 2 ** -23 * Math.max(1, ...p.map(Math.abs), ...q.map(Math.abs))).length === 1;
  for (const m of routes) {
    let fixed = false;
    for (let a: Mobject | null = m; a; a = a.parent) if (a.role === 'paper' || isHeading(a)) fixed = true;
    if (fixed) continue;
    const routeRank = order.get(m.id)!;
    const clip = clipped(m, view);
    if (!clip) continue;
    for (let j = 0; j < m.subpaths.length; j++) {
      if (m.closed[j]) continue;
      const path = m.subpaths[j]!;
      for (const label of labels) for (const ink of label.boxes) {
        const box = intersect(ink, clip);
        if (!box) continue;
        if (plates.some((p) => {
          const visiblePlate = clipped(p, p.box()!);
          return rank(p) > routeRank && rank(p) < label.rank && !!visiblePlate && contains(visiblePlate, box) && covers(p, box);
        })) continue;
        const half = m.style.strokeWidth / 2;
        const footprint = pad(box, half);
        for (let k = 0; k + 7 < path.length; k += 6) {
          const curve: Vec[] = [];
          for (let q = 0; q < 8; q += 2) curve.push([path[k + q]!, path[k + q + 1]!]);
          if (curveCrosses(curve, footprint) && (curveCrosses(curve, box) || !attachment(curve, box, half, k === 0 && unjoined(curve[0]!), k + 8 === path.length && unjoined(curve[3]!)))) { problems.add(`A connector crosses "${label.text}"`); break; }
        }
      }
    }
  }
  return [...problems];
}
