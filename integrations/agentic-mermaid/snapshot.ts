import type { Style } from '../../src/mobject.ts';
import type { Scene } from '../../src/scene.ts';

export interface DiagramSpec {
  source: string;
  style?: string;
  /** Lay out labels using the scene's requested faces, without horizontal stretching. */
  lettering?: 'natural';
}
export interface Palette {
  paper: string;
  ink: string;
  accent: string;
  muted: string;
}
export interface SnapshotTextRun {
  text: string;
  x: number;
  y: number;
  size: number;
  anchor?: string;
  baseline?: string;
  width?: number;
  natural?: true;
  font?: 'sans' | 'mono';
  weight?: 'bold';
  italic?: true;
  matrix: number[];
}
export interface SnapshotShape {
  subpaths: number[][];
  closed: boolean[];
  style: Style;
  text?: string;
  fontSize?: number;
  textRun?: SnapshotTextRun;
}
export interface SnapshotPart {
  id: string;
  role: string;
  kind: string;
  shapes: SnapshotShape[];
  owner?: string;
  /** Upstream marker-only connector artwork that follows its semantic owner's paint. */
  markerCarrier?: true;
  from?: string;
  to?: string;
  route?: [number, number][];
  channels?: unknown;
}
/** Agentic Mermaid's SVG pixels per scene unit: imported geometry and text divide by this. */
export const SVG_PX_PER_UNIT = 100;
/** The renderer every snapshot was captured with; receipts and indexes name it from here. */
export const RENDERER = 'agentic-mermaid@0.5.1';
/** The one remedy for a missing, stale or damaged snapshot. */
const RECAPTURE = 'Run `rayner snapshots <scene> --refresh`.';
export interface DiagramSnapshot {
  version: 1;
  renderer: typeof RENDERER;
  spec: DiagramSpec;
  family: string;
  width: number;
  height: number;
  palette: Palette;
  parts: SnapshotPart[];
  findings: Findings;
  /** An XY chart's series as written: the renderer's channels hold them normalised. */
  chart?: ChartData;
  /** The actual host metrics and final-paint evidence used by a natural capture. */
  textMeasurement?: { id: string; version: string };
  layoutCertification?: unknown;
}
export interface ChartData {
  categories?: string[];
  series: { kind: string; values: number[] }[];
}
/** Agentic Mermaid's verifier result. */
export interface Findings {
  ok: boolean;
  warnings: Finding[];
  /** Natural captures retain source findings; their geometry uses a separate host profile. */
  scope?: 'source';
  /** Source-order endpoints, also used to resolve legacy global warning indices. */
  layout?: { edges?: { from: string; to: string }[] };
}
export type SnapshotStore = Record<string, DiagramSnapshot>;
export type MutationOp = Readonly<Record<string, unknown>>;
export interface DiagramResolver {
  diagram(spec: DiagramSpec): Promise<DiagramSnapshot>;
  morph?(before: DiagramSpec, after: DiagramSpec, ops: readonly MutationOp[]): Promise<void>;
}
const resolvers = new WeakMap<Scene, DiagramResolver>();
export function diagramKey(spec: DiagramSpec): string {
  if (spec.lettering !== undefined && spec.lettering !== 'natural')
    throw new Error("Diagram lettering must be 'natural' when provided");
  return JSON.stringify([
    spec.source.replace(/\r\n/g, '\n').trim(),
    // An empty style renders as the default (capture passes no style), so it is the default's key.
    spec.style || 'default',
    ...(spec.lettering ? [spec.lettering] : []),
  ]);
}
export function useDiagrams(scene: Scene, resolver: DiagramResolver): void {
  resolvers.set(scene, resolver);
}
/**
 * The scene's diagram snapshots: `await diagramsOf(scene).diagram(spec)` is the laid-out diagram
 * for `spec`, so `new Diagram(scene, spec, snapshot, { box })` can be measured before anything is
 * drawn (`s.show` does both and builds the diagram in).
 */
export function diagramsOf(scene: Scene): DiagramResolver {
  const resolver = resolvers.get(scene);
  if (!resolver)
    throw new Error('No diagram snapshots are bound to this scene: run it through the rayner CLI, or bind them with bindSnapshots().');
  return resolver;
}
/** Snapshots already validated: a store is checked once, not on every resolve. */
const valid = new WeakSet<DiagramSnapshot>();
function validateSnapshot(value: DiagramSnapshot): void {
  if (valid.has(value)) return;
  const invalid = () => {
    throw new Error(`Invalid diagram snapshot. ${RECAPTURE}`);
  };
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  // Points are stored as float32: a coordinate must stay finite there too.
  const point = (n: unknown): n is number => finite(n) && Number.isFinite(Math.fround(n));
  const color = (v: unknown) =>
    typeof v === 'string' &&
    (v === 'none' || /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v));
  if (
    !value ||
    value.version !== 1 ||
    value.renderer !== RENDERER ||
    typeof value.family !== 'string' ||
    !finite(value.width) ||
    !finite(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    !value.spec ||
    typeof value.spec.source !== 'string' ||
    (value.spec.lettering !== undefined && value.spec.lettering !== 'natural') ||
    (value.spec.lettering === 'natural' &&
      (!value.textMeasurement || typeof value.textMeasurement.id !== 'string' ||
        !/^rayner:shaped:[a-f0-9]{64}$/.test(value.textMeasurement.id) || value.textMeasurement.version !== '1.0.0')) ||
    !value.palette ||
    ![value.palette.paper, value.palette.ink, value.palette.accent, value.palette.muted].every(color) ||
    !Array.isArray(value.parts)
  )
    invalid();
  const { findings, chart } = value;
  const text = (v: unknown) => typeof v === 'string';
  if (
    !findings ||
    typeof findings.ok !== 'boolean' ||
    (findings.scope !== undefined && findings.scope !== 'source') ||
    (value.spec.lettering === 'natural' && findings.scope !== 'source') ||
    !Array.isArray(findings.warnings) ||
    !findings.warnings.every((w) => w && text(w.code) && (w.edge == null || text(w.edge))) ||
    (findings.layout?.edges != null &&
      (!Array.isArray(findings.layout.edges) || !findings.layout.edges.every((e) => e && text(e.from) && text(e.to))))
  )
    invalid();
  if (
    chart != null &&
    (!Array.isArray(chart.series) ||
      !chart.series.every((s) => s && text(s.kind) && Array.isArray(s.values) && s.values.every(finite)) ||
      (chart.categories != null && (!Array.isArray(chart.categories) || !chart.categories.every(text))))
  )
    invalid();
  const ids = new Map(value.parts.map((p) => [p?.id, p]));
  if (ids.size !== value.parts.length) invalid();
  for (const part of value.parts) {
    if (!part || typeof part.id !== 'string' || !Array.isArray(part.shapes)) invalid();
    if (
      part.route != null &&
      (!Array.isArray(part.route) || !part.route.every((p) => Array.isArray(p) && p.length === 2 && p.every(point)))
    )
      invalid();
    for (const key of ['owner', 'from', 'to', 'role', 'kind'] as const)
      if (part[key] != null && typeof part[key] !== 'string') invalid();
    // An owner names a part: '' would read as "no owner" in some places and as an id in others.
    if (part.owner === '') invalid();
    if (part.markerCarrier !== undefined && part.markerCarrier !== true) invalid();
    if (part.markerCarrier) {
      const owner = part.owner && ids.get(part.owner);
      if (part.kind !== 'connector' || !part.from || !part.to || !owner || owner.kind !== 'connector' ||
          owner.markerCarrier || part.from !== owner.from || part.to !== owner.to) invalid();
    }
    const ancestors = new Set([part.id]);
    let owner = part.owner;
    while (owner) {
      if (ancestors.has(owner) || !ids.has(owner)) invalid();
      ancestors.add(owner);
      owner = ids.get(owner)!.owner;
    }
    for (const shape of part.shapes) {
      if (
        !shape ||
        !Array.isArray(shape.subpaths) ||
        !Array.isArray(shape.closed) ||
        shape.subpaths.length !== shape.closed.length ||
        !shape.closed.every((b) => typeof b === 'boolean') ||
        !shape.style ||
        !color(shape.style.fill) ||
        !color(shape.style.stroke)
      )
        invalid();
      // Labels feed descriptions and legibility checks as well as the drawing.
      if (shape.text != null && (typeof shape.text !== 'string' || shape.fontSize == null)) invalid();
      if (shape.fontSize != null && (!point(shape.fontSize) || shape.fontSize <= 0)) invalid();
      for (const path of shape.subpaths)
        if (!Array.isArray(path) || path.length < 2 || path.length % 6 !== 2 || !path.every(point))
          invalid();
      for (const key of ['fillOpacity', 'strokeOpacity', 'opacity', 'strokeWidth'] as const)
        if (!finite(shape.style[key]) || shape.style[key]! < 0) invalid();
      for (const n of Object.values(shape.style)) if (typeof n === 'number' && !finite(n)) invalid();
      const dash = shape.style.dashArray;
      if (
        dash != null &&
        (typeof dash !== 'string' ||
          !dash
            .split(/[ ,]+/)
            .filter((v) => v !== '')
            .every((v) => finite(Number(v)) && Number(v) >= 0))
      )
        invalid();
      if (shape.textRun) {
        const r = shape.textRun;
        if (
          typeof r.text !== 'string' ||
          ![r.x, r.y, r.size].every(point) ||
          r.size <= 0 ||
          !Array.isArray(r.matrix) ||
          r.matrix.length !== 6 ||
          !r.matrix.every(point) ||
          (r.width != null && (!point(r.width) || r.width < 0)) ||
          (r.natural !== undefined && r.natural !== true) ||
          (r.font !== undefined && r.font !== 'sans' && r.font !== 'mono') ||
          (r.weight !== undefined && r.weight !== 'bold') ||
          (r.italic !== undefined && r.italic !== true) ||
          (r.natural === true && value.spec.lettering !== 'natural') ||
          (value.spec.lettering === 'natural' && r.natural !== true) ||
          (r.natural === true && (!point(r.width) || r.width! < 0 || !['sans', 'mono'].includes(r.font!))) ||
          (r.baseline != null &&
            !['auto', 'alphabetic', 'middle', 'central', 'text-before-edge', 'text-after-edge'].includes(
              r.baseline,
            ))
        )
          invalid();
      }
    }
  }
  valid.add(value);
}
export function snapshotResolver(store: SnapshotStore): DiagramResolver {
  return {
    async diagram(spec) {
      const value = store[diagramKey(spec)];
      if (!value)
        throw new Error(
          `Missing diagram snapshot for "${spec.source.trim().split('\n')[0]}" (${spec.style ?? 'default'}). ${RECAPTURE}`,
        );
      validateSnapshot(value);
      if (diagramKey(value.spec) !== diagramKey(spec))
        throw new Error(`Snapshot source does not match its key. ${RECAPTURE}`);
      return value;
    },
  };
}

/** A verifier warning, with the snapshot part it is about when it names an edge. */
export interface Finding {
  code: string;
  node?: string;
  edge?: string;
  part?: string;
  [key: string]: unknown;
}
/**
 * Current verifier names are stable per endpoint pair (or authored edge ids),
 * matching captured edge parts directly. The 0.4.1 producer and structural
 * fixtures without producer metadata used a global edge index instead.
 */
export function edgePartOf(snapshot: DiagramSnapshot, edgeName: string): string | undefined {
  const producer: unknown = snapshot.renderer;
  if (producer === RENDERER) {
    const id = `edge:${edgeName}`;
    return snapshot.parts.some((p) => p.id === id && p.from && p.to && !p.owner) ? id : undefined;
  }
  if (producer !== undefined && producer !== 'agentic-mermaid@0.4.1') return undefined;
  const named = /^(.*)#(\d+)$/s.exec(edgeName);
  if (!named) return undefined;
  const index = Number(named[2]);
  const order =
    snapshot.findings.layout?.edges ??
    snapshot.parts.filter((p) => p.from && p.to && !p.owner).map((p) => ({ from: p.from!, to: p.to! }));
  const edge = order[index];
  // The name carries the edge's endpoints: an index that points at a different edge is not this one.
  if (!edge || named[1] !== `${edge.from}->${edge.to}`) return undefined;
  const nth = order.slice(0, index).filter((e) => e.from === edge.from && e.to === edge.to).length;
  const part = `edge:${edge.from}->${edge.to}#${nth}`;
  return snapshot.parts.some((p) => p.id === part) ? part : undefined;
}
/** The snapshot's verifier warnings, each with the `part` its edge names (see `edgePartOf`). */
export function findingsOf(snapshot: DiagramSnapshot): Finding[] {
  // `part` is always derived here, never carried over.
  return snapshot.findings.warnings.map(({ part: _stale, ...warning }) => {
    const part = warning.edge != null ? edgePartOf(snapshot, warning.edge) : undefined;
    return part ? { ...warning, part } : warning;
  });
}
