// Native drawing helpers for state boxes and arrows. Geometry only: what to draw comes from model.ts.
import { Group, Rectangle, Text, Arrow, CurvedArrow, Line, ArcBetweenPoints, Circle } from '../../../src/index.ts';
import type { Vec, Mobject, Box } from '../../../src/index.ts';

export interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}
export const boxOfRect = (r: Rect): Box => [r.cx - r.w / 2, r.cy - r.h / 2, r.cx + r.w / 2, r.cy + r.h / 2];
export const centre = (r: Rect): Vec => [r.cx, r.cy];
export const inset = (r: Rect, by: number): Rect => ({ ...r, w: r.w - 2 * by, h: r.h - 2 * by });

/** Where the ray from the rectangle's centre towards `p` leaves the rectangle. */
export function attach(r: Rect, p: Vec, gap = 0): Vec {
  const dx = p[0] - r.cx,
    dy = p[1] - r.cy;
  const sx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx),
    sy = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
  const t = Math.min(sx, sy);
  const len = Math.hypot(dx, dy) || 1;
  return [r.cx + dx * t + (dx / len) * gap, r.cy + dy * t + (dy / len) * gap];
}

export interface Look {
  ink: string;
  soft: string;
  paper: string;
  emphasis: string;
}

export interface BoxOpts {
  color?: string;
  fill?: string;
  fillOpacity?: number;
  width?: number;
  radius?: number;
  dashed?: boolean;
}

/** A rounded rectangle outline. */
export function frame(r: Rect, { color = '#000', fill = 'none', fillOpacity = 1, width = 0.035, radius = 0.14, dashed = false }: BoxOpts = {}): Rectangle {
  const rect = new Rectangle({
    width: r.w,
    height: r.h,
    cornerRadius: radius,
    stroke: color,
    strokeWidth: width,
    fill,
    fillOpacity: fill === 'none' ? 0 : fillOpacity,
    ...(dashed ? { dashArray: '0.14 0.1' } : {}),
  });
  return rect.moveTo(centre(r)) as Rectangle;
}

/** A state: a rounded box with a one- or two-line label centred in it. */
export function stateBox(look: Look, lines: string | string[], r: Rect, { size = 0.26, color = look.ink, fill = look.paper }: { size?: number; color?: string; fill?: string } = {}): Group {
  const ls = Array.isArray(lines) ? lines : [lines];
  const box = frame(r, { color, fill, width: 0.035 });
  const gap = size * 1.15;
  const texts = ls.map((t, i) => new Text(t, { fontSize: size, color: look.ink }).moveTo([r.cx, r.cy + ((ls.length - 1) / 2 - i) * gap]));
  return new Group(box, ...texts);
}

/** The orange "you are here" mark: an outline and a tint over a state, sized to it. */
export function here(look: Look, r: Rect): Rectangle {
  return frame(inset(r, -0.07), { color: look.emphasis, fill: look.emphasis, fillOpacity: 0.2, width: 0.07, radius: 0.18 });
}

export interface ArrowSpec {
  /** Start and end points (already on the box edges). */
  a: Vec;
  b: Vec;
  /** Radians the path turns through; 0 is straight. Positive bulges to the right of a -> b. */
  bend?: number;
  color: string;
  width?: number;
  dashed?: boolean;
  tip?: number;
}

const arrowPieces = ({ a, b, bend = 0, color, width = 0.035, tip = 0.2 }: ArrowSpec): Mobject =>
  bend === 0
    ? new Arrow(a, b, { stroke: color, strokeWidth: width, tipLength: tip, tipWidth: tip * 0.8 })
    : new CurvedArrow(a, b, { angle: bend, stroke: color, strokeWidth: width, tipLength: tip, tipWidth: tip * 0.8 });

/** A polyline with an arrowhead at the end. */
export function polyArrow(points: Vec[], color: string, width = 0.035, tip = 0.2): Group {
  const g = new Group();
  for (let i = 0; i < points.length - 2; i++) g.add(new Line(points[i]!, points[i + 1]!, { stroke: color, strokeWidth: width }));
  g.add(new Arrow(points.at(-2)!, points.at(-1)!, { stroke: color, strokeWidth: width, tipLength: tip, tipWidth: tip * 0.8 }));
  return g;
}

export function arrow(spec: ArrowSpec): Mobject {
  return arrowPieces(spec);
}

/** The points of an arrow's path, for a mark that travels it. */
export function pathOf({ a, b, bend = 0 }: ArrowSpec, steps = 16): Vec[] {
  if (!bend) return [a, b];
  const arc = new ArcBetweenPoints(a, b, { angle: bend });
  return Array.from({ length: steps + 1 }, (_, i) => arc.pointFromProportion(i / steps) as Vec);
}

export const label = (look: Look, text: string, at: Vec, { size = 0.2, color = look.soft, anchor = 'middle' as 'start' | 'middle' | 'end', weight = 'normal' as 'normal' | 'bold' } = {}): Text =>
  new Text(text, { fontSize: size, color, anchor, weight }).moveTo(at, anchor === 'start' ? [-1, 0] : anchor === 'end' ? [1, 0] : [0, 0]) as Text;

/** A circled digit, the same shape as the heading's step number. */
export function chip(look: Look, n: number | string, at: Vec, color = look.emphasis, r = 0.2): Group {
  const c = new Circle({ radius: r, stroke: color, strokeWidth: 0.04, fill: look.paper });
  const t = new Text(String(n), { fontSize: r * 1.15, color, weight: 'bold' });
  return new Group(c, t).moveTo(at) as Group;
}
