import {ambientTextContext} from './text-context.ts';
import type {TextShaping} from './text-context.ts';
// Coordinate systems: NumberLine and Axes, and the graphs they map data into
// (function plots, line graphs, bars, dots, guide lines, shaded areas).
//
// A chart here is drawn from the program's own numbers inside the scene: a
// plot samples the scene's model function, bars take the scene's computed
// values. Everything is ordinary VMobjects and Groups, so Create draws a chart
// in and Transform morphs one set of bars into the next.
//
//   const axes = new Axes({ xRange: [0, 10, 1], yRange: [0, 5, 1], axisStyle: { includeNumbers: true } });
//   const curve = axes.plot((x) => Math.sqrt(x));
//   const bars = axes.bar(balances, { labels });
//
// Mapping is computed from the axes' current points (their line endpoints),
// not from constructor values, so it stays right after shift, scale or rotate.
// Graphs are built at the axes' position when called: move the axes first.

import { Group } from './mobject.ts';
import type { Style } from './mobject.ts';
import { VMobject } from './vmobject.ts';
import { Dot, Line, Polygon, Rectangle } from './shapes.ts';
import type { DotOpts } from './shapes.ts';
import { Text } from './text.ts';
import { BLUE, GREY, WHITE } from './color.ts';
import * as V from './vec.ts';
import type { Vec } from './vec.ts';

/** `[min, max, step]`; step defaults to 1. */
export type AxisRange = readonly [min: number, max: number, step?: number];

export interface NumberLineOpts extends Style {
  shaping?: TextShaping;
  range: AxisRange;
  /** Scene units from min to max. */
  length?: number;
  includeTicks?: boolean;
  /** Tick half-length: ticks reach this far to each side of the line. */
  tickSize?: number;
  includeNumbers?: boolean;
  /** Values to label (default: every tick). */
  numbersToInclude?: readonly number[];
  /** Values not to label (Axes leaves out a crossing label the other axis would run through). */
  numbersToExclude?: readonly number[];
  labelFontSize?: number;
  /** Default: the line's stroke color. */
  labelColor?: string;
  /** Decimal places in labels (default: as many as `step` has). */
  decimals?: number;
  /** Which side of the line labels sit on (default: clockwise of the line's direction, so below a horizontal line). */
  labelDirection?: Readonly<Vec>;
  /** Gap between a tick's end and its label. */
  labelBuff?: number;
  /** A filled tip past `max`; the line itself still ends exactly at max. */
  includeTip?: boolean;
  tipLength?: number;
  tipWidth?: number;
  /** Radians, counterclockwise. Labels stay upright. */
  rotation?: number;
}

/**
 * A number line: a Line from `min` to `max`, centered on the origin, with tick
 * Lines and optional Text labels. Children, read through indices so copies
 * stay correct (copy() clones children; a stored reference would still point
 * at the original's): [line, tip?, ticks, numbers], where `ticks` and
 * `numbers` are Groups (empty when off). Line first, then tip, then ticks:
 * that is the order Create draws them in.
 */
export class NumberLine extends Group {
  min: number;
  max: number;
  step: number;
  /** Child index of the tip, or -1. */
  tipIdx: number;

  constructor({
    range, length = 8, includeTicks = true, tickSize = 0.1, includeNumbers = false, numbersToInclude, numbersToExclude = [], labelFontSize = 0.24,
    labelColor, decimals, labelDirection, labelBuff = 0.12, includeTip = false, tipLength = 0.22, tipWidth = 0.18, rotation = 0, shaping, ...style
  }: NumberLineOpts) {
    super();
    const [min, max, step = 1] = range;
    if (!(max > min) || !(step > 0)) throw new RangeError(`NumberLine: range [${min}, ${max}, ${step}] needs max > min and step > 0`);
    this.min = min; this.max = max; this.step = step;
    const lineStyle: Style = { stroke: WHITE, strokeWidth: 0.03, ...style, fill: 'none' };
    const stroke = lineStyle.stroke!;
    // Built along +x about the origin, then turned as one piece
    const line = new Line([-length / 2, 0], [length / 2, 0], lineStyle);
    this.add(line);
    this.tipIdx = -1;
    if (includeTip) {
      const e = length / 2;
      // Clockwise on screen, like Arrow's tip
      this.add(new Polygon([[e + tipLength, 0], [e, -tipWidth / 2], [e, tipWidth / 2]], { fill: stroke, stroke: 'none' }));
      this.tipIdx = 1;
    }
    const ticks = new Group();
    if (includeTicks) {
      for (const x of this.tickValues()) {
        const px = -length / 2 + (x - min) / (max - min) * length;
        ticks.add(new Line([px, -tickSize], [px, tickSize], lineStyle));
      }
    }
    this.add(ticks);
    if (rotation) this.rotate(rotation, { aboutPoint: [0, 0] });
    // Labels last, after the turn, so they stay upright
    const numbers = new Group();
    if (includeNumbers) {
      const dir = V.normalize(snap(labelDirection ?? V.rotate(V.DOWN, rotation)));
      const places = decimals ?? decimalsOf(step);
      for (const x of numbersToInclude ?? this.tickValues()) {
        if (numbersToExclude.some((e) => Math.abs(e - x) < 1e-9 * this.step)) continue;
        const t = new Text(x.toFixed(places).replace(/^-(0\.?0*)$/, '$1'), { fontSize: labelFontSize, color: labelColor ?? stroke, shaping });
        // The label's edge facing the line sits just past the tick's end
        t.moveTo(V.add(this.n2p(x), V.mul(dir, (includeTicks ? tickSize : 0) + labelBuff)), V.mul(dir, -1));
        numbers.add(t);
      }
    }
    this.add(numbers);
  }

  get line(): Line { return this.children[0] as Line; }
  get tip(): Polygon | null { return (this.children[this.tipIdx] ?? null) as Polygon | null; }
  get ticks(): Group { return this.children[this.tipIdx < 0 ? 1 : 2] as Group; }
  get numbers(): Group { return this.children[this.tipIdx < 0 ? 2 : 3] as Group; }

  /** min, min + step, ... up to max (computed by index, so no drift). */
  tickValues(): number[] {
    const n = Math.floor((this.max - this.min) / this.step + 1e-9);
    return Array.from({ length: n + 1 }, (_, i) => this.min + i * this.step);
  }

  /** The point for number `x`, from the line's current endpoints (extrapolates outside the range). */
  n2p(x: number): Vec {
    const s = this.line.start(), e = this.line.end();
    return V.lerp(s, e, (x - this.min) / (this.max - this.min));
  }

  /** The number at point `p`, projected onto the line. */
  p2n(p: Readonly<Vec>): number {
    const s = this.line.start(), d = V.sub(this.line.end(), s);
    return this.min + V.dot(V.sub(p, s), d) / V.dot(d, d) * (this.max - this.min);
  }

  /** Scene units per unit of number. */
  unitSize(): number { return V.norm(V.sub(this.line.end(), this.line.start())) / (this.max - this.min); }
}

/** NumberLine options an axis takes from Axes (range, length and rotation are the axes'). */
export type AxisStyle = Omit<NumberLineOpts, 'range' | 'length' | 'rotation'>;

export interface AxesOpts {
  shaping?: TextShaping;
  xRange?: AxisRange;
  yRange?: AxisRange;
  /** Scene units spanned by the x range. */
  width?: number;
  /** Scene units spanned by the y range. */
  height?: number;
  /** Both axes; xAxisStyle and yAxisStyle override it per axis. */
  axisStyle?: AxisStyle;
  xAxisStyle?: AxisStyle;
  yAxisStyle?: AxisStyle;
  tips?: boolean;
  xLabel?: string;
  yLabel?: string;
  /** Font size of xLabel and yLabel. */
  axisLabelFontSize?: number;
}

export interface PlotOpts extends Style {
  /** Default: the x axis range. */
  xRange?: readonly [min: number, max: number];
  /** Sample count, ends included. Sample order is draw order: Create traces left to right. */
  samples?: number;
  color?: string;
}

export interface BarOpts extends Style {
  /** Bar centers in x (default: i + 0.5, so bar i fills the unit [i, i + 1] less the gap). */
  x?: readonly number[];
  /** Bar width in x units (default 1 − gap). */
  width?: number;
  /** Empty x span between neighbors when width is not given. */
  gap?: number;
  /** One color, or a list cycled by index. */
  colors?: string | readonly string[];
  /** One Text per bar, under the chart's bottom edge (and under the x axis' numbers, if it has them). */
  labels?: readonly string[];
  labelFontSize?: number;
  labelColor?: string;
}

export interface GuideLineOpts extends Style {
  /** Where the line starts, in the other axis' units (default: that axis' min). */
  from?: number;
  /** Where it ends (default: that axis' max). */
  to?: number;
}

/**
 * Two NumberLines at right angles sharing one point, centered on the origin:
 * the x axis spans `width`, the y axis `height`. They cross at (0, 0) when
 * zero is in both ranges, else at the nearest range end (a chart of 1..12
 * along x has its y axis at x = 1). Children: [xAxis, yAxis, xLabel?,
 * yLabel?], by index (see NumberLine). Create draws the x axis and its ticks,
 * then the y axis and its ticks. Create staggers every family member, label
 * glyphs included: with number labels, give it { runTime: 2 } or
 * { lagRatio: 0.1 } (at 1 s each label pops in over a frame or two).
 */
export class Axes extends Group {
  readonly shaping: TextShaping | undefined;
  /** The x and y values where the axes cross. */
  crossX: number;
  crossY: number;
  xLabelIdx: number;
  yLabelIdx: number;

  constructor({
    xRange = [0, 10, 1], yRange = [0, 5, 1], width = 8, height = 4.5, axisStyle = {}, xAxisStyle = {}, yAxisStyle = {},
    tips = false, xLabel, yLabel, axisLabelFontSize = 0.28, shaping = ambientTextContext(),
  }: AxesOpts = {}) {
    super();
    this.shaping = shaping;
    const [x0, x1] = xRange, [y0, y1] = yRange;
    this.crossX = clamp(0, x0, x1);
    this.crossY = clamp(0, y0, y1);
    // A crossing label sits on the other axis when that axis runs past the crossing
    const x = new NumberLine({
      includeTip: tips, numbersToExclude: y0 < this.crossY ? [this.crossX] : [], ...axisStyle, shaping, ...xAxisStyle, range: xRange, length: width,
    });
    const y = new NumberLine({
      includeTip: tips, labelDirection: V.LEFT, numbersToExclude: x0 < this.crossX ? [this.crossY] : [], ...axisStyle, shaping, ...yAxisStyle,
      range: yRange, length: height, rotation: Math.PI / 2,
    });
    // Both lines are centered on the origin: slide each across so they meet
    // where the other one's crossing value is. The lines then span exactly
    // the width × height box about the origin.
    x.shift([0, y.n2p(this.crossY)[1]]);
    y.shift([x.n2p(this.crossX)[0] - y.n2p(this.crossY)[0], 0]);
    this.add(x, y);
    this.xLabelIdx = this.yLabelIdx = -1;
    const color = axisStyle.labelColor ?? axisStyle.stroke ?? WHITE;
    if (xLabel != null) {
      const end = x.tip ? x.tip.right() : x.n2p(x.max);
      this.add(new Text(xLabel, { fontSize: axisLabelFontSize, color, shaping }).moveTo(V.add(end, [0.15, 0]), V.LEFT));
      this.xLabelIdx = this.children.length - 1;
    }
    if (yLabel != null) {
      const end = y.tip ? y.tip.top() : y.n2p(y.max);
      this.add(new Text(yLabel, { fontSize: axisLabelFontSize, color, shaping }).moveTo(V.add(end, [0, 0.15]), V.DOWN));
      this.yLabelIdx = this.children.length - 1;
    }
  }

  get xAxis(): NumberLine { return this.children[0] as NumberLine; }
  get yAxis(): NumberLine { return this.children[1] as NumberLine; }
  get xLabel(): Text | null { return (this.children[this.xLabelIdx] ?? null) as Text | null; }
  get yLabel(): Text | null { return (this.children[this.yLabelIdx] ?? null) as Text | null; }

  /** The scene point for data coordinates (x, y). Extrapolates outside the ranges. */
  c2p(x: number, y: number): Vec {
    const yx = this.yAxis;
    // Along x from the x axis' own point, then up by the y axis' offset from the crossing
    return V.add(this.xAxis.n2p(x), V.sub(yx.n2p(y), yx.n2p(this.crossY)));
  }

  /** The data coordinates of scene point `p`: c2p's inverse (exact under rotation or shear too). */
  p2c(p: Readonly<Vec>): [x: number, y: number] {
    const o = this.c2p(0, 0), u = V.sub(this.c2p(1, 0), o), v = V.sub(this.c2p(0, 1), o), d = V.sub(p, o);
    const det = u[0] * v[1] - u[1] * v[0];
    return [(d[0] * v[1] - d[1] * v[0]) / det, (u[0] * d[1] - u[1] * d[0]) / det];
  }

  /** c2p(0, 0): the data origin, which lies off the drawn axes when zero is outside a range. */
  originPoint(): Vec { return this.c2p(0, 0); }

  /**
   * The graph of `fn` over `xRange`: one cubic per pair of neighboring
   * samples, through c2p(x, fn(x)) at every sample. Handles come from
   * monotone cubic (PCHIP, Fritsch–Carlson) slopes: the curve is smooth
   * where fn is, and it never overshoots between samples, so a clamped
   * value (Math.min(CAP, ...)) stays flat at the clamp instead of bulging
   * past it as Catmull-Rom would. Handles sit at 1/3 and 2/3 of each x
   * interval, so the path is a true function of x. Non-finite values
   * (1/x at 0) break the curve into separate subpaths.
   */
  plot(fn: (x: number) => number, { xRange, samples = 64, color = BLUE, ...style }: PlotOpts = {}): VMobject {
    const [a, b] = xRange ?? [this.xAxis.min, this.xAxis.max];
    const n = Math.max(2, Math.round(samples));
    const xs = Array.from({ length: n }, (_, i) => i === n - 1 ? b : a + (b - a) * i / (n - 1));
    const m = new VMobject({ stroke: color, strokeWidth: 0.05, ...style, fill: 'none' });
    let run: Array<[number, number]> = [];
    const flush = () => { if (run.length > 1) this.addSmoothRun(m, run); run = []; };
    for (const x of xs) {
      const y = fn(x);
      if (Number.isFinite(y)) run.push([x, y]); else flush();
    }
    flush();
    return m;
  }

  /** A polyline through data points, in the order given: straight segments, no smoothing. */
  lineGraph(points: ReadonlyArray<readonly [x: number, y: number]>, { color = BLUE, ...style }: Style & { color?: string } = {}): VMobject {
    const m = new VMobject({ stroke: color, strokeWidth: 0.05, ...style, fill: 'none' });
    points.forEach(([x, y], i) => { if (i === 0) m.startNewPath(this.c2p(x, y)); else m.addLineTo(this.c2p(x, y)); });
    return m;
  }

  /**
   * One Rectangle per value, standing on y = 0: a negative value hangs below
   * it. Children: the bars in order, then the labels if any. Every bar has the
   * same four corners in the same order (value-left, value-right, base-right,
   * base-left), so Transform between two bar sets of the same length moves
   * each top edge straight to its new height, through zero when the sign flips.
   */
  bar(values: readonly number[], {
    x, gap = 0.4, width = 1 - gap, colors = BLUE, labels, labelFontSize = 0.22, labelColor, fillOpacity = 0.85, ...style
  }: BarOpts = {}): Group {
    const palette = typeof colors === 'string' ? [colors] : colors;
    const g = new Group();
    values.forEach((v, i) => {
      const cx = x?.[i] ?? i + 0.5, l = cx - width / 2, r = cx + width / 2;
      const rect = new Rectangle({ fill: palette[i % palette.length], fillOpacity, stroke: 'none', ...style });
      // Replace the default geometry; closed explicitly so a zero bar still has four curves
      rect.subpaths = []; rect.closed = [];
      const p0 = this.c2p(l, v);
      rect.startNewPath(p0).addLineTo(this.c2p(r, v)).addLineTo(this.c2p(r, 0)).addLineTo(this.c2p(l, 0)).addLineTo(p0);
      rect.closed[0] = true;
      g.add(rect);
    });
    if (labels) {
      const down = V.normalize(V.sub(this.c2p(0, 0), this.c2p(0, 1)));
      // Clear the x axis' numbers: how far their box reaches below the bottom edge
      const base = this.c2p(0, this.yAxis.min), nb = this.xAxis.numbers.box();
      const depth = nb ? Math.max(0, ...[[nb[0], nb[1]], [nb[2], nb[1]], [nb[0], nb[3]], [nb[2], nb[3]]].map((c) => V.dot(V.sub(c as Vec, base), down))) : 0;
      labels.forEach((s, i) => {
        const at = V.add(this.c2p(x?.[i] ?? i + 0.5, this.yAxis.min), V.mul(down, depth + 0.15));
        g.add(new Text(s, { fontSize: labelFontSize, color: labelColor ?? this.xAxis.line.style.stroke, shaping: this.shaping }).moveTo(at, V.mul(down, -1)));
      });
    }
    return g;
  }

  /** A Dot at data coordinates (x, y). */
  dot(x: number, y: number, opts: DotOpts = {}): Dot {
    return new Dot({ color: BLUE, ...opts }).moveTo(this.c2p(x, y));
  }

  /** A vertical guide at `x`, across the y range unless `from`/`to` say otherwise. */
  verticalLine(x: number, { from = this.yAxis.min, to = this.yAxis.max, ...style }: GuideLineOpts = {}): Line {
    return new Line(this.c2p(x, from), this.c2p(x, to), { stroke: GREY, strokeWidth: 0.025, ...style });
  }

  /** A horizontal guide at `y` (a capacity, a threshold), across the x range unless `from`/`to` say otherwise. */
  horizontalLine(y: number, { from = this.xAxis.min, to = this.xAxis.max, ...style }: GuideLineOpts = {}): Line {
    return new Line(this.c2p(from, y), this.c2p(to, y), { stroke: GREY, strokeWidth: 0.025, ...style });
  }

  /**
   * The region between `fn` and y = 0 over [a, b], as one closed path: the
   * plot's curve from a to b, then down to the axis and back. `fn` must be
   * finite on [a, b].
   */
  areaUnder(fn: (x: number) => number, [a, b]: readonly [number, number], { samples = 64, color = BLUE, fillOpacity = 0.3, ...style }: Omit<PlotOpts, 'xRange'> = {}): VMobject {
    const n = Math.max(2, Math.round(samples));
    const run = Array.from({ length: n }, (_, i): [number, number] => {
      const x = i === n - 1 ? b : a + (b - a) * i / (n - 1), y = fn(x);
      if (!Number.isFinite(y)) throw new RangeError(`areaUnder: fn(${x}) is ${y}`);
      return [x, y];
    });
    const m = new VMobject({ fill: color, fillOpacity, stroke: 'none', ...style });
    this.addSmoothRun(m, run);
    m.addLineTo(this.c2p(b, 0)).addLineTo(this.c2p(a, 0)).closePath();
    return m;
  }

  /** Append one subpath through `run` (data points, increasing x) with monotone cubic handles. */
  private addSmoothRun(m: VMobject, run: ReadonlyArray<readonly [number, number]>): void {
    const slopes = monotoneSlopes(run);
    m.startNewPath(this.c2p(run[0]![0], run[0]![1]));
    for (let i = 0; i + 1 < run.length; i++) {
      const [x0, y0] = run[i]!, [x1, y1] = run[i + 1]!, h = (x1 - x0) / 3;
      // Bézier control points are affine-invariant: build in data space, map each through c2p
      m.addCubic(this.c2p(x0 + h, y0 + slopes[i]! * h), this.c2p(x1 - h, y1 - slopes[i + 1]! * h), this.c2p(x1, y1));
    }
  }
}

/**
 * Slopes for a monotone piecewise cubic through `pts` (increasing x): the
 * weighted harmonic mean of neighboring secants inside, zero at a local
 * extremum of the samples, and the shape-preserving three-point formula at
 * the ends (scipy's PchipInterpolator).
 */
function monotoneSlopes(pts: ReadonlyArray<readonly [number, number]>): number[] {
  const n = pts.length, m = new Array<number>(n).fill(0);
  const h: number[] = [], d: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    h.push(pts[i + 1]![0] - pts[i]![0]);
    d.push((pts[i + 1]![1] - pts[i]![1]) / h[i]!);
  }
  if (n === 2) { m[0] = m[1] = d[0]!; return m; }
  for (let i = 1; i + 1 < n; i++) {
    const d0 = d[i - 1]!, d1 = d[i]!, h0 = h[i - 1]!, h1 = h[i]!;
    if (d0 * d1 > 0) m[i] = 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  }
  m[0] = endSlope(h[0]!, h[1]!, d[0]!, d[1]!);
  m[n - 1] = endSlope(h[n - 2]!, h[n - 3]!, d[n - 2]!, d[n - 3]!);
  return m;
}

function endSlope(h0: number, h1: number, d0: number, d1: number): number {
  const s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
  if (Math.sign(s) !== Math.sign(d0)) return 0;
  if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) return 3 * d0;
  return s;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Decimal places in `step` as written (0.25 -> 2), at most 6. */
function decimalsOf(step: number): number {
  for (let k = 0; k < 6; k++) if (Math.abs(step * 10 ** k - Math.round(step * 10 ** k)) < 1e-9) return k;
  return 6;
}

/** Zero out rounding dust (cos(π/2)) so a rotated DOWN is exactly a side. */
const snap = (v: Readonly<Vec>): Vec => [Math.abs(v[0]) < 1e-12 ? 0 : v[0], Math.abs(v[1]) < 1e-12 ? 0 : v[1]];
