import type {TextShaping} from './text-context.ts';
// Shapes: VMobjects built from cubic Béziers (Rectangle, Circle, Arc, Line, ...),
// and small groups with named parts (Arrow, CurvedArrow, Labeled).
import { VMobject } from './vmobject.ts';
import { Group } from './mobject.ts';
import type { Mobject, Style } from './mobject.ts';
import * as V from './vec.ts';
import type { Vec } from './vec.ts';
import type { Box } from './mobject.ts';
import { RED, WHITE, YELLOW } from './color.ts';
import { Text } from './text.ts';

export class Polygon extends VMobject {
  constructor(points: ReadonlyArray<Readonly<Vec>>, style: Style = {}) {
    super(style);
    this.setPolygon(points);
  }
}

export interface RectangleOpts extends Style { width?: number; height?: number; cornerRadius?: number }

export class Rectangle extends VMobject {
  constructor({ width = 4, height = 2, cornerRadius = 0, ...style }: RectangleOpts = {}) {
    super(style);
    const w = width / 2, h = height / 2, r = Math.min(cornerRadius, w, h);
    // Drawn from the top-left corner, clockwise on screen, so Create sweeps
    // along the top edge first
    if (r <= 0) {
      this.setPolygon([[-w, h], [w, h], [w, -h], [-w, -h]]);
      return;
    }
    // Rounded: 4 straight edges + 4 quarter-arcs, each arc one cubic
    const k = 0.5523 * r;
    this.startNewPath([-w + r, h]);
    this.addLineTo([w - r, h]);
    this.addCubic([w - r + k, h], [w, h - r + k], [w, h - r]);
    this.addLineTo([w, -h + r]);
    this.addCubic([w, -h + r - k], [w - r + k, -h], [w - r, -h]);
    this.addLineTo([-w + r, -h]);
    this.addCubic([-w + r - k, -h], [-w, -h + r - k], [-w, -h + r]);
    this.addLineTo([-w, h - r]);
    this.addCubic([-w, h - r + k], [-w + r - k, h], [-w + r, h]);
    this.closed[0] = true;
  }
}

export interface SquareOpts extends Style { side?: number; cornerRadius?: number }

export class Square extends Rectangle {
  constructor({ side = 2, ...rest }: SquareOpts = {}) { super({ width: side, height: side, ...rest }); }
}

export interface CircleOpts extends Style { radius?: number }

export class Circle extends VMobject {
  constructor({ radius = 1, ...style }: CircleOpts = {}) {
    super(style);
    const r = radius, k = 0.5523 * r;
    // From 3 o'clock, clockwise on screen (Create sweeps down first)
    this.startNewPath([r, 0]);
    this.addCubic([r, -k], [k, -r], [0, -r]);
    this.addCubic([-k, -r], [-r, -k], [-r, 0]);
    this.addCubic([-r, k], [-k, r], [0, r]);
    this.addCubic([k, r], [r, k], [r, 0]);
    this.closed[0] = true;
  }
}

export interface DotOpts extends Style { radius?: number; color?: string }

export class Dot extends Circle {
  constructor({ radius = 0.08, color = '#ffffff', ...rest }: DotOpts = {}) {
    super({ radius, fill: color, stroke: 'none', ...rest });
  }
}

export class Line extends VMobject {
  constructor(start: Readonly<Vec> = [-1, 0], end: Readonly<Vec> = [1, 0], style: Style = {}) {
    super(style);
    this.startNewPath(start);
    this.addLineTo(end);
  }
  start(): Vec { const a = this.subpaths[0]!; return [a[0]!, a[1]!]; }
  end(): Vec { const a = this.subpaths[0]!; return [a[a.length - 2]!, a[a.length - 1]!]; }
  putStartAndEndOn(start: Readonly<Vec>, end: Readonly<Vec>): this {
    this.subpaths = []; this.closed = [];
    this.startNewPath(start); this.addLineTo(end);
    return this;
  }
}

/**
 * A shape with a label: a box and its name, a state and its circle, an edge
 * and its caption. `shape` and `label` read through child indices, so they
 * stay correct on copies (copy() clones children; a plain property pointing
 * at a child would still point at the original's).
 *
 * The type parameters say what the parts are (`Labeled<Rectangle, Text>`).
 */
export class Labeled<S extends Mobject = Mobject, L extends Mobject = Mobject> extends Group {
  shapeIdx: number;
  labelIdx: number;

  /** center: put the label on the shape's center */
  constructor(shape: S | null, label: L | null, { center = true }: { center?: boolean } = {}) {
    super(...[shape, label].filter((m): m is S | L => Boolean(m)));
    this.shapeIdx = shape ? 0 : -1;
    this.labelIdx = label ? this.children.length - 1 : -1;
    if (shape && label && center) label.moveTo(shape);
  }
  /** The shape, or the label when there is no shape: what arrows attach to. */
  get shape(): S | L { return (this.children[this.shapeIdx] ?? this.label) as S | L; }
  get label(): L | null { return (this.children[this.labelIdx] ?? null) as L | null; }
}

export interface ArrowOpts { tipLength?: number; tipWidth?: number; stroke?: string; strokeWidth?: number; buff?: number }

/**
 * A line with a filled triangular tip. Children: [line, tip], read through
 * indices so a copy's `line` is the copy's own: copy() clones children, and a
 * stored reference would still point at the original's.
 */
export class Arrow extends Group {
  opts: { tipLength: number; tipWidth: number };

  constructor(start: Readonly<Vec>, end: Readonly<Vec>, { tipLength = 0.3, tipWidth = 0.22, stroke = '#ffffff', strokeWidth = 0.04, buff = 0 }: ArrowOpts = {}) {
    super();
    this.opts = { tipLength, tipWidth };
    this.add(new Line(start, end, { stroke, strokeWidth }), new Polygon([[0, 0], [0, 0], [0, 0]], { fill: stroke, stroke: 'none' }));
    this.putStartAndEndOn(start, end, buff);
  }
  get line(): Line { return this.children[0] as Line; }
  get tip(): Polygon { return this.children[1] as Polygon; }
  putStartAndEndOn(start: Readonly<Vec>, end: Readonly<Vec>, buff = 0): this {
    const dir = V.normalize(V.sub(end, start));
    const s = V.add(start, V.mul(dir, buff));
    const e = V.sub(end, V.mul(dir, buff));
    const { tipLength, tipWidth } = this.opts;
    const base = V.sub(e, V.mul(dir, tipLength));
    const perp: Vec = [dir[1], -dir[0]]; // right of the direction: the tip is drawn clockwise on screen
    this.line.putStartAndEndOn(s, base);
    this.tip.setPolygon([e, V.add(base, V.mul(perp, tipWidth / 2)), V.sub(base, V.mul(perp, tipWidth / 2))]);
    this.invalidateBox();
    return this;
  }
}



export interface ArcOpts extends Style { center?: Vec; radius?: number; startAngle?: number; angle?: number }

/** Circular arc as cubics, ≤ 90° per segment. Angles in radians, counterclockwise (y up). */
export class Arc extends VMobject {
  constructor({ center = [0, 0], radius = 1, startAngle = 0, angle = Math.PI / 2, ...style }: ArcOpts = {}) {
    super(style);
    const n = Math.max(1, Math.ceil(Math.abs(angle) / (Math.PI / 2)));
    const step = angle / n;
    const k = (4 / 3) * Math.tan(step / 4);
    const pt = (a: number): Vec => [center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)];
    this.startNewPath(pt(startAngle));
    for (let i = 0; i < n; i++) {
      const a0 = startAngle + i * step, a1 = a0 + step;
      const p0 = pt(a0), p3 = pt(a1);
      const t0 = [-Math.sin(a0), Math.cos(a0)] as const, t1 = [-Math.sin(a1), Math.cos(a1)] as const;
      this.addCubic(
        [p0[0] + k * radius * t0[0], p0[1] + k * radius * t0[1]],
        [p3[0] - k * radius * t1[0], p3[1] - k * radius * t1[1]],
        p3,
      );
    }
  }
}

/**
 * Arc from `start` to `end` turning through `angle` radians about its center:
 * positive is counterclockwise (as in manim), which bulges to the right of start → end.
 */
export class ArcBetweenPoints extends Arc {
  constructor(start: Readonly<Vec>, end: Readonly<Vec>, { angle = Math.PI / 4, ...style }: Style & { angle?: number } = {}) {
    const chord = V.sub(end, start), d = V.norm(chord);
    const radius = d / (2 * Math.sin(Math.abs(angle) / 2));
    const mid = V.lerp(start, end, 0.5);
    const perp = V.normalize([-chord[1], chord[0]]);
    const h = radius * Math.cos(Math.abs(angle) / 2) * Math.sign(angle);
    const center = V.add(mid, V.mul(perp, h));
    const startAngle = V.angleOf(V.sub(start, center));
    super({ center, radius, startAngle, angle, ...style });
  }
}

export interface CurvedArrowOpts { angle?: number; tipLength?: number; tipWidth?: number; stroke?: string; strokeWidth?: number }

/** Curved arrow: arc body + tip tangent to the arc's end. Children: [arc, tip], by index (see Arrow). */
export class CurvedArrow extends Group {
  constructor(start: Readonly<Vec>, end: Readonly<Vec>, { angle = Math.PI / 4, tipLength = 0.28, tipWidth = 0.2, stroke = '#ffffff', strokeWidth = 0.04 }: CurvedArrowOpts = {}) {
    super();
    const arc = new ArcBetweenPoints(start, end, { angle, stroke, strokeWidth });
    // Trim the arc so it ends at the tip's base, then place the tip along the end tangent
    const n = arc.numCurves(0);
    const pEnd = arc.pointOnCurve(0, n - 1, 1), pNear = arc.pointOnCurve(0, n - 1, 0.97);
    const dir = V.normalize(V.sub(pEnd, pNear));
    const base = V.sub(pEnd, V.mul(dir, tipLength));
    const perp: Vec = [dir[1], -dir[0]]; // right of the direction: the tip is drawn clockwise on screen
    const a = arc.subpaths[0]!;
    a[a.length - 2] = base[0]; a[a.length - 1] = base[1];
    arc.touchPoints();
    this.add(arc, new Polygon([pEnd, V.add(base, V.mul(perp, tipWidth / 2)), V.sub(base, V.mul(perp, tipWidth / 2))], { fill: stroke, stroke: 'none' }));
  }
  get arc(): ArcBetweenPoints { return this.children[0] as ArcBetweenPoints; }
  get tip(): Polygon { return this.children[1] as Polygon; }
}

// ---- shape matchers and braces ----
//
// Emphasis that stays on screen: an outline, an underline, a strike-through, a
// brace. Each is built once from its target's box, a snapshot as in manim: it
// does not follow the target if that moves later. A target is a mobject or a
// Box, so a span of code lines (or any region) can be marked without grouping
// the lines, which would take them from their parent.

/** A box for a matcher to fit: a mobject's as it is now, or a Box as given. Internal (Circumscribe uses it too). */
export function boxOf(target: Mobject | Box): Box {
  if (Array.isArray(target)) return [...target];
  const b = target.box();
  if (!b) throw new Error(`${target.constructor.name}#${target.id} has no points to fit a shape to`);
  return b;
}

export interface SurroundingRectangleOpts extends Style { buff?: number; cornerRadius?: number }

/**
 * A rectangle around a mobject's box (or a Box), `buff` out on every side.
 * Yellow stroke, no fill. Drawn like Rectangle, from the top-left corner
 * clockwise, so Create sweeps along the top first.
 */
export class SurroundingRectangle extends Rectangle {
  constructor(target: Mobject | Box, { buff = 0.15, cornerRadius = 0, ...style }: SurroundingRectangleOpts = {}) {
    const b = boxOf(target);
    super({ width: b[2] - b[0] + 2 * buff, height: b[3] - b[1] + 2 * buff, cornerRadius, stroke: YELLOW, fill: 'none', ...style });
    this.shift([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  }
}

export interface UnderlineOpts extends Style { buff?: number }

/** A line along the bottom of a mobject's box (or a Box), `buff` below it, drawn left to right. */
export class Underline extends Line {
  constructor(target: Mobject | Box, { buff = 0.1, ...style }: UnderlineOpts = {}) {
    const b = boxOf(target), y = b[1] - buff;
    super([b[0], y], [b[2], y], style);
  }
}

export interface CrossOpts extends Style { scale?: number }

/**
 * Both diagonals of a mobject's box (or a Box): "not this". Red, slightly
 * heavier than the default stroke, as in manim. One path of two subpaths,
 * upper-left to lower-right first; `scale` grows or shrinks it about the
 * box center.
 */
export class Cross extends VMobject {
  constructor(target: Mobject | Box, { scale = 1, ...style }: CrossOpts = {}) {
    super({ stroke: RED, strokeWidth: 0.06, fill: 'none', ...style });
    const b = boxOf(target);
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const w = (b[2] - b[0]) / 2 * scale, h = (b[3] - b[1]) / 2 * scale;
    this.startNewPath([cx - w, cy + h]); this.addLineTo([cx + w, cy - h]);
    this.startNewPath([cx + w, cy + h]); this.addLineTo([cx - w, cy - h]);
  }
}

export interface BraceOpts extends Style {
  /** Gap between the box edge and the brace's ends. */
  buff?: number;
  /** Higher is tighter: each curl is 2 · depth / sharpness long. */
  sharpness?: number;
  /** Distance from the brace's ends to its tip. */
  depth?: number;
}

/**
 * A curly brace along the edge of a mobject's box (or a Box) in `direction`,
 * tip pointing away. One stroked path of six cubics, drawn from one end to the
 * other through the tip: outer curl, straight run, inner curl into the tip,
 * then the mirror image back out. Stroked rather than filled so it takes the
 * same stroke weight and color as the outlines it sits beside, and so Create
 * traces it once, as a pen would (a filled brace's outline is traced around
 * both sides before the fill comes in); at the engine's stroke widths the taper
 * of a filled brace is too small to see anyway.
 *
 * Every direction is the same drawing: built pointing DOWN, as wide as the
 * box's extent across `direction`, then rotated onto it. `tip()` and
 * `direction()` are read from the points, so they stay right on copies and
 * after the brace moves or turns.
 */
export class Brace extends VMobject {
  constructor(target: Mobject | Box, direction: Readonly<Vec> = V.DOWN, { buff = 0.1, sharpness = 2, depth = 0.2, ...style }: BraceOpts = {}) {
    super({ fill: 'none', ...style });
    const b = boxOf(target);
    const d = V.normalize(direction);
    // The turn taking DOWN onto d; snapped so axis directions stay exact
    const angle = V.angleOf(d) + Math.PI / 2;
    const snap = (x: number): number => (Math.abs(x) < 1e-12 ? 0 : x);
    const cos = snap(Math.cos(angle)), sin = snap(Math.sin(angle));
    const along: Vec = [cos, sin];
    // The box's corners, from its center, measured along the brace and out from it
    const c: Vec = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const corners = ([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]] as Vec[]).map((p) => V.sub(p, c));
    const ts = corners.map((p) => V.dot(p, along));
    const lo = Math.min(...ts), hi = Math.max(...ts);
    const out = Math.max(...corners.map((p) => V.dot(p, d)));
    // Pointing DOWN about the origin: ends on y = 0, tip at (0, -depth).
    // Short braces shorten their curls so the straight runs never go negative.
    const w = (hi - lo) / 2, h = depth / 2, r = Math.min(2 * depth / sharpness, w / 2), k = 0.5523;
    this.startNewPath([-w, 0]);
    this.addCubic([-w, -h * k], [-w + r - r * k, -h], [-w + r, -h]);
    this.addLineTo([-r, -h]);
    this.addCubic([-r + r * k, -h], [0, -h - h * k], [0, -depth]);
    this.addCubic([0, -h - h * k], [r - r * k, -h], [r, -h]);
    this.addLineTo([w - r, -h]);
    this.addCubic([w - r + r * k, -h], [w, -h * k], [w, 0]);
    const at = V.add(V.add(c, V.mul(along, (lo + hi) / 2)), V.mul(d, out + buff));
    this.applyAffine(cos, sin, -sin, cos, at[0], at[1], { aboutPoint: V.ORIGIN });
  }

  /** The tip: the anchor farthest from the line through the brace's two ends. */
  tip(): Vec {
    const a = this.subpaths[0]!, n = a.length;
    const p0: Vec = [a[0]!, a[1]!], chord = V.normalize(V.sub([a[n - 2]!, a[n - 1]!], p0));
    const normal: Vec = [-chord[1], chord[0]];
    let best = p0, far = -1;
    for (let i = 0; i < n; i += 6) {
      const p: Vec = [a[i]!, a[i + 1]!];
      const dist = Math.abs(V.dot(V.sub(p, p0), normal));
      if (dist > far) { far = dist; best = p; }
    }
    return best;
  }

  /** Where the tip points: from the middle of the ends to the tip, snapped to an axis within ~0.01°. */
  direction(): Vec {
    const a = this.subpaths[0]!, n = a.length;
    const d = V.normalize(V.sub(this.tip(), V.lerp([a[0]!, a[1]!], [a[n - 2]!, a[n - 1]!], 0.5)));
    return [Math.abs(d[0]) < 1e-4 ? 0 : d[0], Math.abs(d[1]) < 1e-4 ? 0 : d[1]];
  }

  /** Put `mobject` beyond the tip, `buff` away and centered on it. */
  putAtTip(mobject: Mobject, buff = 0.15): this {
    mobject.nextTo(this.tip(), this.direction(), buff);
    return this;
  }
}

export interface BraceLabelOpts {
  shaping?: TextShaping; fontSize?: number; color?: string; buff?: number; labelBuff?: number }

/**
 * A brace and a text label beyond its tip: "this span is n bytes". Children:
 * [brace, label], read through indices (see Arrow). `color` paints both;
 * `buff` is the brace's gap to the box, `labelBuff` the label's to the tip.
 */
export class BraceLabel extends Group {
  constructor(target: Mobject | Box, text: string, direction: Readonly<Vec> = V.DOWN, { fontSize = 0.3, color = WHITE, buff = 0.1, labelBuff = 0.15, shaping }: BraceLabelOpts = {}) {
    super();
    const brace = new Brace(target, direction, { buff, stroke: color });
    const label = new Text(text, {fontSize, color, shaping});
    brace.putAtTip(label, labelBuff);
    this.add(brace, label);
  }
  get brace(): Brace { return this.children[0] as Brace; }
  get label(): Text { return this.children[1] as Text; }
}
