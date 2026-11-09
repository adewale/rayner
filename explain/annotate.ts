import type {TextShaping} from '../src/text-context.ts';
// Annotations that sit on the picture instead of in a panel: a dimension line, a pin, a callout
// with a leader line, and a drawing tool that rides the tip of a stroke as it is drawn. They are
// native mobjects, so they seek, trace and check like everything else.
import { Group, Line, Circle, Rectangle, Polygon, Text, Create, VMobject, keyed } from '../src/index.ts';
import type { Mobject, Vec, Box } from '../src/index.ts';
import { center, overlaps, pointsBox } from '../src/box.ts';
import { paintsFill } from '../src/mobject.ts';
import { isHex, parseColor } from '../src/color.ts';
import { selfDescribed } from './look.ts';

const paperFor = (text: Text, fill: string): Rectangle => new Rectangle({
  width: text.width() + 0.12, height: text.height() + 0.08, fill, stroke: 'none',
}).moveTo(text.center());

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const unit = (v: Vec): Vec => {
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
};

export interface AnnotationLook {
  shaping?: TextShaping;
  /** Line and text colour. */
  color: string;
  /** Text size in scene units; 0.24 is about 19 px on a 1280 px stage. */
  size?: number;
  /** Opaque paper behind an annotation, when it sits over other artwork. */
  background?: string;
  /** The annotation's key; its parts are keyed under it (`key:text` and so on). Unkeyed without it. */
  key?: string;
}
/** `m` keyed `key:part` when the annotation has a key. */
const part = <T extends Mobject>(m: T, key: string | undefined, name: string): T => {
  if (key !== undefined) keyed(m, `${key}:${name}`);
  return m;
};
/** `g` keyed `key` when given. */
const whole = <T extends Mobject>(g: T, key: string | undefined): T => {
  if (key !== undefined) keyed(g, key);
  return g;
};

/**
 * A dimension line between `a` and `b`, set off to one side by `offset` (positive: to the left
 * of a→b), with ticks at both ends and `label` at its middle, outside the line. Its parts:
 * `key:extension:start` and `key:extension:end`, `key:line`, `key:arrow:start` and `key:arrow:end`,
 * `key:backing` (with a background) and `key:text`.
 */
export function dimension(a: Vec, b: Vec, label: string, { color, background, size = 0.24, shaping, offset = 0.3, key }: AnnotationLook & { offset?: number }): Group {
  const d = unit(sub(b, a)),
    n: Vec = [-d[1], d[0]];
  const o: Vec = [n[0] * offset, n[1] * offset];
  const p: Vec = [a[0] + o[0], a[1] + o[1]],
    q: Vec = [b[0] + o[0], b[1] + o[1]];
  const tick = 0.09,
    w = 0.02;
  const g = new Group(
    part(new Line(a, [p[0] + n[0] * tick * Math.sign(offset || 1), p[1] + n[1] * tick * Math.sign(offset || 1)], { stroke: color, strokeWidth: w * 0.7, strokeOpacity: 0.7 }), key, 'extension:start'),
    part(new Line(b, [q[0] + n[0] * tick * Math.sign(offset || 1), q[1] + n[1] * tick * Math.sign(offset || 1)], { stroke: color, strokeWidth: w * 0.7, strokeOpacity: 0.7 }), key, 'extension:end'),
    part(new Line(p, q, { stroke: color, strokeWidth: w }), key, 'line'),
    part(new Polygon([p, [p[0] + d[0] * 0.14 + n[0] * 0.05, p[1] + d[1] * 0.14 + n[1] * 0.05], [p[0] + d[0] * 0.14 - n[0] * 0.05, p[1] + d[1] * 0.14 - n[1] * 0.05]], { fill: color, stroke: 'none' }), key, 'arrow:start'),
    part(new Polygon([q, [q[0] - d[0] * 0.14 + n[0] * 0.05, q[1] - d[1] * 0.14 + n[1] * 0.05], [q[0] - d[0] * 0.14 - n[0] * 0.05, q[1] - d[1] * 0.14 - n[1] * 0.05]], { fill: color, stroke: 'none' }), key, 'arrow:end'),
  );
  const t = part(new Text(label, { fontSize: size, color, shaping }), key, 'text');
  const mid: Vec = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2],
    side = Math.sign(offset || 1),
    gap = 0.08 + (Math.abs(n[0]) * t.width() + Math.abs(n[1]) * t.height()) / 2;
  t.moveTo([mid[0] + n[0] * side * gap, mid[1] + n[1] * side * gap]);
  if (background) g.add(part(paperFor(t, background), key, 'backing'));
  g.add(t);
  return selfDescribed(whole(g, key), () => ({ what: `A dimension line marked “${label}”`, parts: [] }));
}

/**
 * A pin stuck in at `at`: a round head above it on a short needle, and an optional label beside the
 * head, on its `side` (right by default). Its parts: `key:needle`, `key:head` and `key:label`.
 */
export function pin(at: Vec, { color, size = 0.24, shaping, label, side = 'right', key }: AnnotationLook & { label?: string; side?: 'left' | 'right' }): Group {
  const head: Vec = [at[0], at[1] + 0.32];
  const g = new Group(
    part(new Line(at, [head[0], head[1] - 0.07], { stroke: color, strokeWidth: 0.025 }), key, 'needle'),
    part(new Circle({ radius: 0.075, fill: color, fillOpacity: 1, stroke: 'none' }).moveTo(head), key, 'head'),
  );
  const out = side === 'left' ? -1 : 1;
  if (label) g.add(part(new Text(label, { fontSize: size, color, anchor: side === 'left' ? 'end' : 'start', shaping }).moveTo([head[0] + out * 0.14, head[1]], [-out, 0]), key, 'label'));
  return selfDescribed(whole(g, key), () => ({ what: label ? `A pin marked “${label}”` : 'A pin', parts: [] }));
}

export type Side = 'above' | 'below' | 'left' | 'right';
const boxOf = (target: Vec | Box | Mobject): Box => {
  if (Array.isArray(target)) return (target.length === 2 ? [target[0], target[1], target[0], target[1]] : target) as Box;
  const b = (target as Mobject).box();
  if (!b) throw new Error('callout(): the target has no extent; give a point, a box or a mobject that is drawn');
  return b;
};

/**
 * Text beside a target (a point, a box or a mobject) with a leader line from the text to the
 * target's nearest edge, ending in a dot. `gap` is how far the text stands off the target. Its
 * parts: `key:line`, `key:dot`, `key:backing` (with a background) and `key:text`.
 */
export function callout(
  target: Vec | Box | Mobject,
  text: string,
  { color, background, size = 0.24, shaping, side = 'right', gap = 0.55, key }: AnnotationLook & { side?: Side; gap?: number },
): Group {
  const b = boxOf(target),
    [cx, cy] = center(b);
  const t = part(new Text(text, { fontSize: size, color, shaping }), key, 'text');
  const edge: Vec = side === 'right' ? [b[2], cy] : side === 'left' ? [b[0], cy] : side === 'above' ? [cx, b[3]] : [cx, b[1]];
  const dir: Vec = side === 'right' ? [1, 0] : side === 'left' ? [-1, 0] : side === 'above' ? [0, 1] : [0, -1];
  const textAt: Vec = [
    edge[0] + dir[0] * (gap + t.width() / 2),
    edge[1] + dir[1] * (gap + t.height() / 2),
  ];
  t.moveTo(textAt);
  const from: Vec = [edge[0] + dir[0] * (gap - 0.08), edge[1] + dir[1] * (gap - 0.08)];
  return whole(
    new Group(
      part(new Line(from, edge, { stroke: color, strokeWidth: 0.02 }), key, 'line'),
      part(new Circle({ radius: 0.04, fill: color, fillOpacity: 1, stroke: 'none' }).moveTo(edge), key, 'dot'),
      ...(background ? [part(paperFor(t, background), key, 'backing')] : []),
      t,
    ),
    key,
  );
}

export type ToolKind = 'pen' | 'pencil';
/** A drawing tool whose tip is at the origin: a pen nib, or a coloured pencil. */
export function tool(kind: ToolKind, { ink, body }: { ink: string; body: string }): Group {
  const angle = (55 * Math.PI) / 180,
    d: Vec = [Math.cos(angle), Math.sin(angle)],
    n: Vec = [-d[1], d[0]];
  const at = (along: number, across: number): Vec => [d[0] * along + n[0] * across, d[1] * along + n[1] * across];
  if (kind === 'pen')
    return new Group(
      new Polygon([at(0, 0), at(0.16, 0.05), at(0.16, -0.05)], { fill: ink, stroke: 'none' }),
      new Polygon([at(0.16, 0.05), at(0.75, 0.06), at(0.75, -0.06), at(0.16, -0.05)], { fill: body, stroke: ink, strokeWidth: 0.012 }),
    );
  return new Group(
    new Polygon([at(0, 0), at(0.07, 0.025), at(0.07, -0.025)], { fill: ink, stroke: 'none' }),
    new Polygon([at(0.07, 0.025), at(0.2, 0.06), at(0.2, -0.06), at(0.07, -0.025)], { fill: '#e8d2b0', stroke: 'none' }),
    new Polygon([at(0.2, 0.06), at(0.85, 0.06), at(0.85, -0.06), at(0.2, -0.06)], { fill: body, stroke: 'none' }),
  );
}

type Row = Mobject[];
/** Whether a family row's leaf draws a path a pen could trace. */
const traceable = (m: Mobject): m is VMobject => m instanceof VMobject && m.hasPoints();

/**
 * Draw a mobject stroke by stroke, one leaf after another, at an even speed, with a tool riding
 * the tip. Between strokes the pen lifts and travels to the next one at `travel` times its
 * drawing speed (1 by default: any faster and the motion check sees the tool jump). The tool fades in and out over the first and last quarter second.
 * `subject` is what is drawn; `pen` is the tool, which is removed when the play ends.
 */
export class Sketch extends Create {
  subject: Mobject;
  pen: Mobject | null;
  travel: number;
  private plan: { rows: number[]; from: number; to: number; start: Vec; end: Vec; single: boolean }[] = [];
  private hops: { from: number; to: number; a: Vec; b: Vec }[] = [];
  private total = 1;
  /** Where the tool's tip is now; a tool is built with its tip at the origin. */
  private tipAt: Vec = [0, 0];

  constructor(subject: Mobject, pen: Mobject | null, { travel = 1, ...opts }: { travel?: number; runTime?: number } = {}) {
    super(pen ? new Group(subject, pen) : subject, opts);
    this.subject = subject;
    this.pen = pen;
    this.travel = travel;
  }
  protected override doBegin(): void {
    super.doBegin();
    const subjectLeaves = new Set(this.subject.family());
    const strokes: { row: number; length: number; start: Vec; end: Vec }[] = [];
    this.families.forEach((row: Row, i: number) => {
      const m = row[0]!;
      if (subjectLeaves.has(m) && traceable(m))
        strokes.push({ row: i, length: m.arcLength(), start: m.pointFromProportion(0), end: m.pointFromProportion(1) });
    });
    const gap = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]) / this.travel;
    const raw = strokes.reduce((n, s, i) => n + s.length + (i ? gap(strokes[i - 1]!.end, s.start) : 0), 0);
    // A stroke shorter than three frames' travel at the eased play's fastest (1.875 times its
    // average speed, at 30 fps) would appear at once: a cut-in, not a drawing. Such strokes are
    // drawn together with their neighbours, as a quick hand writes a word in one sweep, until
    // the cluster is long enough; the tool glides across the cluster.
    const least = ((3 * 1.875) / Math.max(1, this.runTime * 30)) * raw;
    const clusters: { rows: number[]; length: number; start: Vec; end: Vec; single: boolean }[] = [];
    for (const s of strokes) {
      const open = clusters.at(-1);
      if (open && open.length < least) {
        open.rows.push(s.row);
        open.length += s.length + gap(open.end, s.start);
        open.end = s.end;
        open.single = false;
      } else clusters.push({ rows: [s.row], length: s.length, start: s.start, end: s.end, single: true });
    }
    // A short last cluster joins the one before it.
    const tail = clusters.at(-1);
    if (tail && clusters.length > 1 && tail.length < least) {
      const prev = clusters[clusters.length - 2]!;
      prev.rows.push(...tail.rows);
      prev.length += tail.length + gap(prev.end, tail.start);
      prev.end = tail.end;
      prev.single = false;
      clusters.pop();
    }
    let at = 0;
    this.plan = [];
    this.hops = [];
    clusters.forEach((c, i) => {
      if (i) {
        const prev = clusters[i - 1]!,
          hop = gap(prev.end, c.start);
        this.hops.push({ from: at, to: at + hop, a: prev.end, b: c.start });
        at += hop;
      }
      const length = Math.max(c.length, 1e-3);
      this.plan.push({ rows: c.rows, from: at, to: at + length, start: c.start, end: c.end, single: c.single });
      at += length;
    });
    this.total = Math.max(at, 1e-6);
    this.interpolate(0);
  }
  protected override doInterpolate(alpha: number): void {
    if (!this.plan) return super.doInterpolate(alpha);
    const distance = alpha * this.total;
    const rowAlpha = new Map<number, number>();
    for (const p of this.plan) for (const row of p.rows) rowAlpha.set(row, Math.min(1, Math.max(0, (distance - p.from) / (p.to - p.from))));
    const subjectLeaves = new Set(this.subject.family());
    this.families.forEach((row: Row, i: number) => {
      const m = row[0]!;
      if (this.pen && !subjectLeaves.has(m)) return;
      this.interpolateSubmobject(...(row as [Mobject, Mobject]), rowAlpha.get(i) ?? alpha);
    });
    this.mobject.invalidateBox();
    if (!this.pen) return;
    // Where the tip is: on the stroke being drawn, or on the hop between two strokes.
    let tip: Vec | null = null;
    for (const p of this.plan)
      if (distance >= p.from && distance <= p.to) {
        const u = (distance - p.from) / (p.to - p.from);
        tip = p.single
          ? (this.families[p.rows[0]!]![0] as VMobject).pointFromProportion(u)
          : [p.start[0] + (p.end[0] - p.start[0]) * u, p.start[1] + (p.end[1] - p.start[1]) * u];
      }
    if (!tip)
      for (const h of this.hops)
        if (distance > h.from && distance < h.to) {
          const u = (distance - h.from) / (h.to - h.from);
          tip = [h.a[0] + (h.b[0] - h.a[0]) * u, h.a[1] + (h.b[1] - h.a[1]) * u];
        }
    if (!tip) {
      const first = this.plan[0],
        lastPlan = this.plan.at(-1);
      if (!first || !lastPlan) return;
      tip = distance <= first.from ? first.start : lastPlan.end;
    }
    this.pen.shift([tip[0] - this.tipAt[0], tip[1] - this.tipAt[1]]);
    this.tipAt = tip;
    const ramp = Math.min(0.3, 0.25 / Math.max(0.01, this.runTime));
    const seen = Math.min(1, alpha / ramp, (1 - alpha) / ramp);
    for (const m of this.pen.family()) m.style.opacity = Math.max(0, seen);
  }
}

/**
 * One path per stroke, so a tool can follow each: a renderer restarts a stroke's dash pattern at
 * every subpath, so a path of several subpaths is drawn in all of them at once. Stroked paths
 * split into their subpaths; filled ones split only into clusters that do not overlap, so a
 * letter keeps its counter. Returns `m`, or a group in its place when `m` itself splits.
 */
export function oneStrokeEach(m: Mobject): Mobject {
  const split = (v: VMobject): Mobject | null => {
    if (v.subpaths.length < 2) return null;
    const filled = paintsFill(v.style);
    const clusters: number[][] = [];
    const boxes = v.subpaths.map((a) => pointsBox([a]));
    for (let i = 0; i < boxes.length; i++) {
      const join = filled ? clusters.find((c) => c.some((j) => !!boxes[i] && !!boxes[j] && overlaps(boxes[i]!, boxes[j]!))) : undefined;
      if (join) join.push(i);
      else clusters.push([i]);
    }
    if (clusters.length < 2) return null;
    return new Group(
      ...clusters.map((c) => {
        const piece = new VMobject({ ...v.style });
        piece.subpaths = c.map((i) => new Float32Array(v.subpaths[i]!));
        piece.closed = c.map((i) => v.closed[i]!);
        return piece;
      }),
    );
  };
  if (m instanceof VMobject) return split(m) ?? m;
  for (const child of [...m.children]) {
    const next = oneStrokeEach(child);
    if (next !== child) m.replaceChild(child, next);
  }
  return m;
}

/** One entry of a legend: a swatch and the words for what it means. */
export interface LegendItem {
  /** What the swatch means, in the reader's words. */
  label: string;
  /** A filled square of this colour; `'none'` with a `stroke` for an empty square outlined in it. */
  fill?: string;
  /** A short line of this colour; with `fill`, the square's outline. */
  stroke?: string;
  /** Draw the line or outline dashed. */
  dashed?: boolean;
  /** The colour's name in words, when the nearest plain name (`colorName`) is not the one the captions use. */
  name?: string;
}

/**
 * The nearest plain English name of a colour, from its hue, saturation and lightness: grey, black or
 * white for a colour with little saturation, brown for a dark orange or yellow, else red, orange,
 * yellow, green, teal, blue, purple or pink. A legend says its swatches with these words, so a
 * caption's "purple fill" finds the swatch that keys it.
 */
export function colorName(hex: string): string {
  const trimmed = hex.trim();
  if (!isHex(trimmed)) return 'coloured';
  const [r, g, b] = parseColor(trimmed)!.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.18 || d < 0.08) return l < 0.2 ? 'black' : l > 0.85 ? 'white' : 'grey';
  const hue = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  if (hue >= 20 && hue < 65 && l < 0.36) return 'brown';
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 40) return 'orange';
  if (hue < 65) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 195) return 'teal';
  if (hue < 255) return 'blue';
  if (hue < 290) return 'purple';
  return 'pink';
}

/** How a legend says one swatch: "purple fill", "dashed red line", "green fill with a dashed outline". */
export function swatchWords(item: LegendItem): string {
  const name = (c: string) => item.name ?? colorName(c);
  if (item.fill === 'none' && item.stroke) return `${item.dashed ? 'dashed ' : ''}${name(item.stroke)} outline`;
  if (item.fill && item.stroke) {
    const outline = `${item.dashed ? 'dashed ' : ''}${colorName(item.stroke)} outline`;
    return `${name(item.fill)} fill with ${/^[aeiou]/.test(outline) ? 'an' : 'a'} ${outline}`;
  }
  if (item.fill) return `${name(item.fill)} fill`;
  if (item.stroke) return `${item.dashed ? 'dashed ' : ''}${name(item.stroke)} line`;
  throw new RangeError(`legend(): the entry ${JSON.stringify(item.label)} needs a fill or a stroke for its swatch`);
}

export interface LegendLook {
  ink: string;
  shaping?: TextShaping;
  /** Text size; the swatch is about as tall as the text. */
  size?: number;
  /** Where the first entry starts: its swatch's left edge, on the entry's centre line. */
  at?: Vec;
  /** Entries stacked in a column (the default) or side by side in a row. */
  stack?: 'column' | 'row';
  /** Space between entries: from one entry's top to the next in a column, between entries in a row. */
  gap?: number;
  /** The legend's key: each entry is keyed `key:<label>`, its swatch `key:<label>:swatch` and its words `key:<label>:text`. */
  key?: string;
}

/**
 * Swatches with words, in order: each a filled square, a short line or both, then its label. It
 * describes itself as its swatch→meaning pairs ("Key: purple fill, cat’s bits; dashed blue line,
 * the browser"), so the words a caption uses for a colour or a dash are on the stage too.
 */
export function legend(items: readonly LegendItem[], { ink, shaping, size = 0.3, at = [0, 0], stack = 'column', gap, key }: LegendLook): Group {
  if (!items.length) throw new RangeError('legend(): a legend needs at least one entry');
  const labels = new Set<string>();
  for (const item of items) {
    if (!item.label.trim()) throw new RangeError('legend(): every entry needs words for what its swatch means');
    if (labels.has(item.label)) throw new Error(`legend(): two entries say ${JSON.stringify(item.label)}; each swatch needs its own meaning`);
    labels.add(item.label);
    swatchWords(item);
  }
  const side = size * 0.9,
    long = size * 1.8,
    step = gap ?? (stack === 'row' ? size * 1.2 : size * 1.6);
  const g = new Group();
  let x = at[0],
    y = at[1];
  for (const item of items) {
    const width = item.fill ? side : long,
      cy = y;
    const swatch = item.fill
      ? new Rectangle({
          width: side,
          height: side,
          fill: item.fill,
          fillOpacity: 1,
          stroke: item.stroke ?? 'none',
          strokeWidth: item.stroke ? 0.035 : 0,
          ...(item.dashed ? { dashArray: '0.06 0.04' } : {}),
        }).moveTo([x + side / 2, cy])
      : new Line([x, cy], [x + long, cy], { stroke: item.stroke!, strokeWidth: 0.05, ...(item.dashed ? { dashArray: '0.12 0.07' } : {}) });
    const text = new Text(item.label, { fontSize: size, color: ink, anchor: 'start', shaping }).moveTo([x + width + size * 0.45, cy], [-1, 0]);
    const entry = key === undefined ? undefined : `${key}:${item.label}`;
    g.add(whole(new Group(part(swatch, entry, 'swatch'), part(text, entry, 'text')), entry));
    if (stack === 'row') x = text.box()![2] + step;
    else y -= step;
  }
  return selfDescribed(whole(g, key), () => ({ what: `Key: ${items.map((item) => `${swatchWords(item)}, ${item.label}`).join('; ')}`, parts: [] }));
}
