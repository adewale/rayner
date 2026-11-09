// Synthetic diagram snapshots for the explainer property tests, shaped as
// integrations/agentic-mermaid/index.ts writes them (checked against the
// pinned snapshots in scenes/explainers): node words are outlined text runs
// inside the node's part; edge and relationship labels are parts their link
// owns; participants are `actor:X` with a `lifeline:X`, classes `class:X`, and
// links name their ends by the bare name; charts have axes and grid lines. Generated
// by fast-check, so failures shrink to the smallest diagram that shows them.
import { fc } from './pbt.ts';
import { Rectangle } from '../../src/index.ts';
import { RENDERER } from '../../explain/diagram-snapshot.ts';
import type { DiagramSnapshot, DiagramSpec, SnapshotPart, SnapshotShape, ChartData } from '../../explain/diagram-snapshot.ts';
import type { Style } from '../../src/index.ts';

const HEX = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join(''));
export const hexColor = HEX;

const unit = fc.double({ min: 0, max: 1, noNaN: true });
/** Dash patterns as the importer writes them: lengths in scene units, split by spaces or commas. */
const dash = fc
  .tuple(fc.array(fc.double({ min: 0.01, max: 0.2, noNaN: true }), { minLength: 1, maxLength: 3 }), fc.constantFrom(' ', ','))
  .map(([xs, sep]) => xs.join(sep));
const style = (fill: fc.Arbitrary<string>, stroke: fc.Arbitrary<string>, dashed = false): fc.Arbitrary<Style> =>
  fc
    .record({
      fill,
      stroke,
      strokeWidth: fc.double({ min: 0, max: 0.2, noNaN: true }),
      fillOpacity: unit,
      strokeOpacity: unit,
      opacity: unit,
      dashArray: dashed ? fc.option(dash, { nil: undefined }) : fc.constant(undefined),
    })
    .map(({ dashArray, ...s }) => (dashArray ? { ...s, dashArray } : s));

function rect(x: number, y: number, w: number, h: number, s: Style): SnapshotShape {
  const m = new Rectangle({ width: w, height: h }).moveTo([x, y]);
  return { subpaths: m.subpaths.map((a) => Array.from(a)), closed: [...m.closed], style: s };
}

/** How a label's words are set: the text run fields Agentic Mermaid's SVG uses. */
export interface TextPlan {
  text: string;
  style: Style;
  anchor: 'start' | 'middle' | 'end';
  baseline: 'alphabetic' | 'middle';
  /** Whether the run carries its measured width (the importer stretches the outlines to it). */
  width: boolean;
  /** Set on its side, as an XY chart's y-axis title is. */
  rotated: boolean;
}
export interface SnapshotPlan {
  family: string;
  width: number;
  height: number;
  nodes: { id: string; x: number; y: number; w: number; h: number; style: Style; label: TextPlan | null; value: number }[];
  links: { from: number; to: number; line: Style; head: Style | null; label: TextPlan | null }[];
  frame: Style | null;
  palette: { paper: string; ink: string; accent: string; muted: string };
}

const words = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ]{0,7}$/);
const textPlan: fc.Arbitrary<TextPlan> = fc.record({
  text: words,
  style: style(HEX, fc.constant('none')),
  anchor: fc.constantFrom('start' as const, 'middle' as const, 'end' as const),
  baseline: fc.constantFrom('alphabetic' as const, 'middle' as const),
  width: fc.boolean(),
  rotated: fc.boolean(),
});

/** Node ids: short names, including ones that look like the prefixes `get` resolves. */
const nodeId = fc.oneof(
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9_]{0,4}$/),
  fc.string({ unit: 'grapheme', minLength: 1, maxLength: 4 }),
  fc.constantFrom('node', 'class', 'state', 'actor', 'x y', '->', '#0'),
);

export const snapshotPlan: fc.Arbitrary<SnapshotPlan> = fc
  .record({
    family: fc.constantFrom('flowchart', 'state', 'class', 'mindmap', 'sequence', 'gitgraph', 'xychart', 'er'),
    width: fc.integer({ min: 50, max: 2000 }),
    height: fc.integer({ min: 50, max: 1200 }),
    ids: fc.uniqueArray(nodeId, { minLength: 0, maxLength: 6 }),
    geometry: fc.array(
      fc.record({
        x: fc.double({ min: -2, max: 20, noNaN: true }),
        y: fc.double({ min: -12, max: 2, noNaN: true }),
        w: fc.double({ min: 0.05, max: 3, noNaN: true }),
        h: fc.double({ min: 0.05, max: 2, noNaN: true }),
        style: style(HEX, HEX),
        label: fc.option(textPlan),
        value: fc.integer({ min: 0, max: 100 }),
      }),
      { minLength: 6, maxLength: 6 },
    ),
    links: fc.array(
      fc.record({
        from: fc.nat(),
        to: fc.nat(),
        line: style(fc.constant('none'), HEX, true),
        head: fc.option(style(HEX, fc.constant('none'))),
        label: fc.option(textPlan),
      }),
      { maxLength: 8 },
    ),
    frame: fc.option(style(HEX, HEX)),
    palette: fc.record({ paper: HEX, ink: HEX, accent: HEX, muted: HEX }),
  })
  .map(({ ids, geometry, links, ...rest }) => ({
    ...rest,
    nodes: ids.map((id, i) => ({ id, ...geometry[i]! })),
    // Charts have no links; the other families link their nodes.
    links: ids.length && rest.family !== 'xychart' ? links.map((l) => ({ ...l, from: l.from % ids.length, to: l.to % ids.length })) : [],
  }));

/** A text shape as the importer writes it: no outline points, the words and their SVG text run. */
function textShape(t: TextPlan, x: number, y: number, size: number): SnapshotShape {
  const [X, Y] = [x * 100, -y * 100];
  const run = {
    text: t.text,
    x: t.rotated ? 0 : X,
    y: t.rotated ? 0 : Y,
    size,
    anchor: t.anchor,
    ...(t.baseline === 'middle' ? { baseline: 'middle' } : {}),
    ...(t.width ? { width: size * 0.55 * t.text.length } : {}),
    matrix: t.rotated ? [0, -1, 1, 0, X, Y] : [1, 0, 0, 1, 0, 0],
  };
  return { subpaths: [], closed: [], style: t.style, text: t.text, fontSize: size / 100, textRun: run };
}

/** What the generator knows about a snapshot it built, for oracles that must not restate the code under test. */
export interface Planned {
  /** Parts that frame the family (frame, participants and lifelines, axes, grid, branches). */
  scaffold: Set<string>;
  /** Bare names that name a part with another id: a participant's or a class's name. */
  names: Map<string, string>;
}
const planned = new WeakMap<DiagramSnapshot, Planned>();
/** The generator's record of a snapshot it built. */
export const planOf = (s: DiagramSnapshot): Planned => planned.get(s) ?? { scaffold: new Set(), names: new Map() };

/** The snapshot a plan describes; part ids are unique (plans whose ids collide are dropped). */
export function buildSnapshot(plan: SnapshotPlan, source = 'graph'): DiagramSnapshot {
  const parts: SnapshotPart[] = [];
  const scaffold = new Set<string>(),
    names = new Map<string, string>();
  const f = plan.family;
  const ink = { fill: plan.palette.ink, stroke: 'none', strokeWidth: 0, fillOpacity: 1, strokeOpacity: 1, opacity: 1 };
  const lineStyle = { fill: 'none', stroke: plan.palette.muted, strokeWidth: 0.01, fillOpacity: 1, strokeOpacity: 1, opacity: 1 };
  const scaffolding = (part: SnapshotPart) => {
    parts.push(part);
    scaffold.add(part.id);
  };
  if (plan.frame)
    scaffolding({ id: '__frame', role: 'frame', kind: 'shape', shapes: [rect(plan.width / 200, -plan.height / 200, plan.width / 100, plan.height / 100, plan.frame)] });
  if (plan.nodes.length && f === 'gitgraph')
    scaffolding({ id: 'branch:main', role: 'group', kind: 'group', shapes: [rect(plan.width / 200, -0.5, plan.width / 100, 0.02, lineStyle)] });
  if (plan.nodes.length && f === 'xychart') {
    const top = Math.max(...plan.nodes.map((n) => n.value));
    scaffolding({ id: 'axis:x', role: 'axis', kind: 'shape', shapes: [rect(plan.width / 200, -plan.height / 100, plan.width / 100, 0.01, lineStyle)] });
    scaffolding({ id: 'axis:y', role: 'axis', kind: 'shape', shapes: [rect(0, -plan.height / 200, 0.01, plan.height / 100, lineStyle)] });
    for (const [i, v] of [0, top].entries()) {
      const y = -plan.height / 100 + (i * plan.height) / 200;
      if (!scaffold.has(`axis:y:label:${v}`))
        scaffolding({ id: `axis:y:label:${v}`, role: 'axis', kind: 'text', shapes: [textShape({ text: String(v), style: ink, anchor: 'end', baseline: 'middle', width: true, rotated: false }, -0.1, y, 11)] });
      scaffolding({ id: `grid:y:${i}`, role: 'grid', kind: 'shape', shapes: [rect(plan.width / 200, y, plan.width / 100, 0.005, lineStyle)] });
    }
  }
  const nodeIds = plan.nodes.map((n) =>
    f === 'sequence' ? `actor:${n.id}` : f === 'class' ? `class:${n.id}` : f === 'xychart' ? `bar:0:${n.id}` : n.id,
  );
  plan.nodes.forEach((n, i) => {
    const id = nodeIds[i]!;
    // A participant's or a class's bare name names it, as links name their ends; a bar has no such name.
    if (f === 'sequence' || f === 'class') names.set(n.id, id);
    const shapes = [rect(n.x, n.y, n.w, n.h, n.style)];
    // Bars carry no words: a description reads them from the chart's data.
    if (n.label && f !== 'xychart') shapes.push(textShape(n.label, n.x, n.y, (n.h * 100) / 3));
    const role = f === 'sequence' ? 'actor' : f === 'class' ? 'class-box' : f === 'xychart' ? 'bar' : 'node';
    const part: SnapshotPart = { id, role, kind: f === 'xychart' ? 'shape' : 'group', shapes };
    if (f === 'sequence') scaffolding(part);
    else parts.push(part);
    if (f === 'sequence')
      scaffolding({ id: `lifeline:${n.id}`, role: 'lifeline', kind: 'connector', shapes: [rect(n.x, n.y - 1, 0.01, 1.5, { ...lineStyle, dashArray: '0.06 0.04' })] });
  });
  const perPair = new Map<string, number>();
  for (const l of plan.links) {
    const a = plan.nodes[l.from]!,
      b = plan.nodes[l.to]!;
    const pair = `${a.id}->${b.id}`;
    const k = perPair.get(pair) ?? 0;
    perPair.set(pair, k + 1);
    // A git graph names a link by its pair alone, so it draws a pair once.
    if (f === 'gitgraph' && k > 0) continue;
    const route: [number, number][] =
      l.from === l.to
        ? [[a.x, a.y], [a.x + 1, a.y + 1], [a.x, a.y + 0.5]]
        : [[a.x, a.y], [b.x, b.y]];
    const [x0, y0] = route[0]!,
      [x1, y1] = route.at(-1)!;
    const shapes = [rect((x0 + x1) / 2, (y0 + y1) / 2, Math.max(0.02, Math.abs(x1 - x0)), 0.02, l.line)];
    if (l.head) shapes.push(rect(x1, y1, 0.1, 0.1, l.head));
    const [id, role] =
      f === 'sequence' ? [`message:${pair}#${k}`, 'message'] : f === 'class' ? [`rel:${pair}#${k}`, 'relationship'] : f === 'gitgraph' ? [pair, 'edge'] : [`edge:${pair}#${k}`, 'edge'];
    const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
    // A message's words are drawn in its own group; other families give the label a part the link owns.
    if (l.label && f === 'sequence') shapes.push(textShape(l.label, mx, my + 0.1, 11));
    parts.push({ id, role, kind: f === 'sequence' ? 'group' : 'connector', shapes, from: a.id, to: b.id, route });
    if (l.label && f !== 'sequence' && f !== 'gitgraph') {
      const [labelId, labelRole] = f === 'class' ? [`rel-label:${pair}#${k}`, 'label'] : [`edge-label:${pair}#${k}`, 'edge-label'];
      parts.push({
        id: labelId,
        owner: id,
        role: labelRole,
        kind: 'group',
        shapes: [rect(mx, my, 0.4, 0.15, { ...ink, fill: plan.palette.paper }), textShape(l.label, mx, my, 11)],
      });
    }
  }
  const chart: { chart?: ChartData } =
    f === 'xychart' && plan.nodes.length
      ? { chart: { categories: plan.nodes.map((n) => n.id), series: [{ kind: 'bar', values: plan.nodes.map((n) => n.value) }] } }
      : {};
  const s = { ...fixedSnapshot({ source, style: 'nord' }, parts, plan), ...chart };
  planned.set(s, { scaffold, names });
  return s;
}

/** A hand-built snapshot for example tests: these parts, on a canvas `width` × `height` pixels. */
export function fixedSnapshot(
  spec: DiagramSpec,
  parts: SnapshotPart[],
  { family = 'flowchart', width = 400, height = 200, palette }: { family?: string; width?: number; height?: number; palette: DiagramSnapshot['palette'] },
): DiagramSnapshot {
  return { version: 1, renderer: RENDERER, spec, family, width, height, palette, findings: { ok: true, warnings: [] }, parts };
}
/** A half-unit square at (x, 0), as an imported shape. */
export function square(x: number, style: Style): SnapshotShape {
  return rect(x, 0, 0.5, 0.5, { ...new Rectangle({ width: 0.5, height: 0.5 }).style, ...style });
}

export const uniqueIds = (s: DiagramSnapshot) => new Set(s.parts.map((p) => p.id)).size === s.parts.length;

/** Snapshots with unique part ids, ready for a Diagram. */
export const snapshot = (source = 'graph') => snapshotPlan.map((p) => buildSnapshot(p, source)).filter(uniqueIds);
