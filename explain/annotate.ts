import type {TextShaping} from '../src/text-context.ts';
// Annotations that sit on the picture instead of in a panel: a dimension line, a pin, a callout
// with a leader line, and a drawing tool that rides the tip of a stroke as it is drawn. They are
// native mobjects, so they seek, trace and check like everything else.
import { Group, Line, Circle, Rectangle, Polygon, Text, Create, VMobject } from '../src/index.ts';
import type { Box as BoxT } from '../src/index.ts';
import type { Mobject, Vec, Box } from '../src/index.ts';

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
}

/**
 * A dimension line between `a` and `b`, set off to one side by `offset` (positive: to the left
 * of a→b), with ticks at both ends and `label` at its middle, outside the line.
 */
export function dimension(a: Vec, b: Vec, label: string, { color, background, size = 0.24, shaping, offset = 0.3 }: AnnotationLook & { offset?: number }): Group {
  const d = unit(sub(b, a)),
    n: Vec = [-d[1], d[0]];
  const o: Vec = [n[0] * offset, n[1] * offset];
  const p: Vec = [a[0] + o[0], a[1] + o[1]],
    q: Vec = [b[0] + o[0], b[1] + o[1]];
  const tick = 0.09,
    w = 0.02;
  const g = new Group(
    new Line(a, [p[0] + n[0] * tick * Math.sign(offset || 1), p[1] + n[1] * tick * Math.sign(offset || 1)], { stroke: color, strokeWidth: w * 0.7, strokeOpacity: 0.7 }),
    new Line(b, [q[0] + n[0] * tick * Math.sign(offset || 1), q[1] + n[1] * tick * Math.sign(offset || 1)], { stroke: color, strokeWidth: w * 0.7, strokeOpacity: 0.7 }),
    new Line(p, q, { stroke: color, strokeWidth: w }),
    new Polygon([p, [p[0] + d[0] * 0.14 + n[0] * 0.05, p[1] + d[1] * 0.14 + n[1] * 0.05], [p[0] + d[0] * 0.14 - n[0] * 0.05, p[1] + d[1] * 0.14 - n[1] * 0.05]], { fill: color, stroke: 'none' }),
    new Polygon([q, [q[0] - d[0] * 0.14 + n[0] * 0.05, q[1] - d[1] * 0.14 + n[1] * 0.05], [q[0] - d[0] * 0.14 - n[0] * 0.05, q[1] - d[1] * 0.14 - n[1] * 0.05]], { fill: color, stroke: 'none' }),
  );
  const t = new Text(label, { fontSize: size, color, shaping });
  const mid: Vec = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2],
    side = Math.sign(offset || 1),
    gap = 0.08 + (Math.abs(n[0]) * t.width() + Math.abs(n[1]) * t.height()) / 2;
  t.moveTo([mid[0] + n[0] * side * gap, mid[1] + n[1] * side * gap]);
  if (background) g.add(paperFor(t, background));
  g.add(t);
  return g;
}

/** A pin stuck in at `at`: a round head above it on a short needle, and an optional label beside the head. */
export function pin(at: Vec, { color, size = 0.24, shaping, label }: AnnotationLook & { label?: string }): Group {
  const head: Vec = [at[0], at[1] + 0.32];
  const g = new Group(
    new Line(at, [head[0], head[1] - 0.07], { stroke: color, strokeWidth: 0.025 }),
    new Circle({ radius: 0.075, fill: color, fillOpacity: 1, stroke: 'none' }).moveTo(head),
  );
  if (label) g.add(new Text(label, { fontSize: size, color, anchor: 'start', shaping }).moveTo([head[0] + 0.14, head[1]], [-1, 0]));
  return g;
}

export type Side = 'above' | 'below' | 'left' | 'right';
const boxOf = (target: Vec | Box | Mobject): Box => {
  if (Array.isArray(target)) return (target.length === 2 ? [target[0], target[1], target[0], target[1]] : target) as Box;
  const b = (target as Mobject).box();
  if (!b) throw new Error('callout(): the target has no extent');
  return b;
};

/**
 * Text beside a target (a point, a box or a mobject) with a leader line from the text to the
 * target's nearest edge, ending in a dot. `gap` is how far the text stands off the target.
 */
export function callout(
  target: Vec | Box | Mobject,
  text: string,
  { color, background, size = 0.24, shaping, side = 'right', gap = 0.55 }: AnnotationLook & { side?: Side; gap?: number },
): Group {
  const b = boxOf(target),
    cx = (b[0] + b[2]) / 2,
    cy = (b[1] + b[3]) / 2;
  const t = new Text(text, { fontSize: size, color, shaping });
  const edge: Vec = side === 'right' ? [b[2], cy] : side === 'left' ? [b[0], cy] : side === 'above' ? [cx, b[3]] : [cx, b[1]];
  const dir: Vec = side === 'right' ? [1, 0] : side === 'left' ? [-1, 0] : side === 'above' ? [0, 1] : [0, -1];
  const textAt: Vec = [
    edge[0] + dir[0] * (gap + t.width() / 2),
    edge[1] + dir[1] * (gap + t.height() / 2),
  ];
  t.moveTo(textAt);
  const from: Vec = [edge[0] + dir[0] * (gap - 0.08), edge[1] + dir[1] * (gap - 0.08)];
  return new Group(
    new Line(from, edge, { stroke: color, strokeWidth: 0.02 }),
    new Circle({ radius: 0.04, fill: color, fillOpacity: 1, stroke: 'none' }).moveTo(edge),
    ...(background ? [paperFor(t, background)] : []),
    t,
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
export class Draw extends Create {
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
  override begin(): void {
    super.begin();
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
  override interpolate(alpha: number): void {
    if (!this.plan) return super.interpolate(alpha);
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

const subBox = (a: Float32Array): BoxT => {
  const b: BoxT = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < a.length; i += 2) {
    b[0] = Math.min(b[0], a[i]!);
    b[1] = Math.min(b[1], a[i + 1]!);
    b[2] = Math.max(b[2], a[i]!);
    b[3] = Math.max(b[3], a[i + 1]!);
  }
  return b;
};
const overlaps = (a: BoxT, b: BoxT) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
/**
 * One path per stroke, so a tool can follow each: a renderer restarts a stroke's dash pattern at
 * every subpath, so a path of several subpaths is drawn in all of them at once. Stroked paths
 * split into their subpaths; filled ones split only into clusters that do not overlap, so a
 * letter keeps its counter. Returns `m`, or a group in its place when `m` itself splits.
 */
export function oneStrokeEach(m: Mobject): Mobject {
  const split = (v: VMobject): Mobject | null => {
    if (v.subpaths.length < 2) return null;
    const filled = v.style.fill !== 'none' && (v.style.fillOpacity ?? 1) > 0;
    const clusters: number[][] = [];
    const boxes = v.subpaths.map(subBox);
    for (let i = 0; i < boxes.length; i++) {
      const join = filled ? clusters.find((c) => c.some((j) => overlaps(boxes[i]!, boxes[j]!))) : undefined;
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
    if (next !== child) {
      const at = m.children.indexOf(child);
      m.children.splice(at, 1, next);
      next.parent = m;
      child.parent = null;
      m.invalidateBox();
    }
  }
  return m;
}
