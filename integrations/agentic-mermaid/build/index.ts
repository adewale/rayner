import { parseRegisteredMermaid } from 'agentic-mermaid';
import type { SceneNode } from 'agentic-mermaid';
import type { TextMeasurementProfile } from 'agentic-mermaid';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SANS, MONO, FALLBACK } from '../../../src/font-data.ts';
import { loadFonts } from '../../../src/fonts.ts';
import type {TextShaping} from '../../../src/text-context.ts';
import { importedFont, importedText } from '../text.ts';
import type { AnyMutationOp } from 'agentic-mermaid/agent';
import { mutate, serializeMermaid, verifyMermaid, WARNING_SEVERITY } from 'agentic-mermaid/agent';
import { launch } from '../../../tools/lib/browser.ts';
import { capture } from './capture.ts';
import { readSvg } from './read-svg.ts';
import { diagramKey, RENDERER, SVG_PX_PER_UNIT as PX } from '../snapshot.ts';
import type {
  DiagramResolver,
  DiagramSnapshot,
  DiagramSpec,
  SnapshotStore,
  SnapshotPart,
  ChartData,
} from '../snapshot.ts';

// Both installed packages and checkouts ship these TypeScript inputs. Reading
// those sources keeps a checkout's capture identity portable to the compiled
// CLI, while changes to the metric/lowering algorithm invalidate old geometry.
// build-cli.ts bundles this build-only module into dist/tools/*.js; tsc does
// not emit a separate dist/integrations/.../build module.
const policyRoot = new URL(import.meta.url.endsWith('.js') ? '../../' : '../../../', import.meta.url);
const metricPolicy = createHash('sha256').update((await Promise.all([
  'src/text.ts', 'src/text-context.ts', 'src/fonts.ts', 'src/lettering.ts', 'src/lettering-outlines.ts', 'src/italic.ts', 'vendor/glyph.js',
  'integrations/agentic-mermaid/text.ts',
  'integrations/agentic-mermaid/build/index.ts',
  'integrations/agentic-mermaid/build/capture.ts',
  'integrations/agentic-mermaid/build/read-svg.ts',
].map(async (file) => file + '\n' + await readFile(new URL(file, policyRoot), 'utf8')))).join('\n')).digest('hex');

export function replayMorph(
  before: DiagramSpec,
  after: DiagramSpec,
  ops: readonly Readonly<Record<string, unknown>>[],
): void {
  const parsed = parseRegisteredMermaid(before.source),
    target = parseRegisteredMermaid(after.source);
  if (!parsed.ok || !target.ok) throw new Error('Cannot parse morph endpoints');
  let model = parsed.value;
  for (const op of ops) {
    const result = mutate(model, op as unknown as AnyMutationOp);
    if (!result.ok) throw new Error(`Morph edit failed: ${JSON.stringify(result.error)}`);
    model = result.value;
  }
  if (serializeMermaid(model) !== serializeMermaid(target.value))
    throw new Error('Morph ops do not produce the next diagram');
}

/** An XY chart's series and categories as written, for descriptions that state its values. */
function chartOf(spec: DiagramSpec): { chart?: ChartData } {
  const parsed = parseRegisteredMermaid(spec.source);
  if (!parsed.ok || parsed.value.body.kind !== 'xychart') return {};
  const { series, xAxis } = parsed.value.body as {
    series: { kind: string; values: number[] }[];
    xAxis?: { categories?: string[] };
  };
  return {
    chart: {
      ...(xAxis?.categories ? { categories: xAxis.categories } : {}),
      series: series.map(({ kind, values }) => ({ kind, values })),
    },
  };
}

export interface NaturalMeasurementOptions { shaping?: TextShaping; measurementHash?: string; styles?: readonly string[] }
export function naturalMeasurementIdentity({ measurementHash, styles = [] }: NaturalMeasurementOptions = {}) {
  // Include the capture policy as well as actual face bytes in the host identity.
  const metrics = createHash('sha256').update(JSON.stringify([
    'rayner-natural-labels-v1', metricPolicy, RENDERER,
    createHash('sha256').update(JSON.stringify([SANS, MONO, FALLBACK])).digest('hex'),
    measurementHash,
    styles,
  ])).digest('hex');
  return { id: 'rayner:shaped:' + metrics, version: '1.0.0' };
}

export async function snapshotBuilder(
  store: SnapshotStore = {},
  options: NaturalMeasurementOptions = {},
): Promise<DiagramResolver & { close(): Promise<void> }> {
  await loadFonts();
  const styles = options.styles ?? [];
  const textMeasurement: TextMeasurementProfile = {
    ...naturalMeasurementIdentity(options),
    measure(input) {
      const bold = input.fontWeight >= 600, italic = input.fontStyle === 'italic';
      for (const [required, wanted] of [['bold', bold], ['italic', italic]] as const)
        if (wanted && !styles.includes(required))
          throw new Error(`Natural diagram lettering needs meta.lettering.styles to include '${required}'`);
      return importedText({ text: input.text, size: input.fontSize,
        font: importedFont(input.fontFamily, input.monospace),
        ...(bold ? { weight: 'bold' } : {}), ...(italic ? { italic: true } : {}),
      }, undefined, options.shaping).advance();
    },
  };
  const browser = await launch();
  const page = await browser.newPage();
  await page.route('**/*', (r) => r.abort());
  const pending = new Map<string, Promise<DiagramSnapshot>>();
  let serial: Promise<unknown> = Promise.resolve();
  return {
    async close() {
      await browser.close();
    },
    async diagram(spec: DiagramSpec): Promise<DiagramSnapshot> {
      const key = diagramKey(spec);
      if (store[key]) {
        if (spec.lettering === 'natural' && store[key].textMeasurement?.id !== textMeasurement.id)
          throw new Error('Stale natural diagram font metrics; run rayner snapshots to rebuild it');
        return store[key];
      }
      if (pending.has(key)) return pending.get(key)!;
      const task = serial.then(async () => {
        const verified = verifyMermaid(spec.source);
        // Preserve source, data, range, configuration and content diagnostics.
        // Only evidence about the verifier's different geometry is excluded;
        // the actual host-profile render below supplies its own final evidence.
        const referenceGeometry = new Set([
          'EDGE_MISANCHORED', 'OFF_CANVAS', 'GROUP_BREACH', 'RENDER_FAILED', 'INTERNAL_ERROR',
          'NODE_OVERLAP', 'CONTENT_OCCLUDED', 'LAYOUT_LIMIT_EXCEEDED', 'ROUTE_SELF_CROSS',
          'ROUTE_HITCH', 'ROUTE_UNEXPLAINED_BEND', 'ROUTE_LABEL_ON_SHARED_TRUNK',
          'ROUTE_SELF_LOOP_OCCUPANCY', 'ROUTE_CONTAINER_MISANCHOR', 'ROUTE_SHAPE_MISANCHOR',
          'ROUTE_STALE_AFTER_NODE_MOVE',
        ]);
        const sourceWarnings = verified.warnings.filter((w) => !referenceGeometry.has(w.code));
        const findings = spec.lettering === 'natural' ? {
          ok: !sourceWarnings.some((w) => WARNING_SEVERITY[w.code] === 'error'),
          warnings: sourceWarnings,
          scope: 'source' as const,
          layout: { edges: verified.layout.edges.map(({ from, to }) => ({ from, to })) },
        } : verified;
        if (!findings.ok) throw new Error(`Diagram verification failed: ${JSON.stringify(findings)}`);
        const r = capture(spec, spec.lettering === 'natural' ? textMeasurement : undefined);
        const lowered = await readSvg(page, r.marked, spec.lettering === 'natural', options.shaping);
        const parts: SnapshotPart[] = r.parts.map(({ node }, i) => {
          const connector = (n: SceneNode): Extract<SceneNode, { kind: 'connector' }> | undefined =>
            n.kind === 'connector'
              ? n
              : n.kind === 'group'
                ? n.children.map((c) => connector(c.node)).find(Boolean)
                : undefined;
          const edge = connector(node);
          const geometry = edge?.route.geometry;
          const route: [number, number][] | undefined = geometry
            ? geometry.kind === 'line'
              ? [
                  [geometry.x1 / PX, -geometry.y1 / PX],
                  [geometry.x2 / PX, -geometry.y2 / PX],
                ]
              : geometry.points.map((p) => [p.x / PX, -p.y / PX])
            : undefined;
          // Graph wrappers use node:<id>, but the author's Mermaid ids are the public API.
          const id = node.id.startsWith('node:') ? node.id.slice(5) : node.id;
          return {
            id,
            role: node.role,
            kind: node.kind,
            shapes: lowered.get(i) ?? [],
            ...(edge?.endpoints.from ? { from: edge.endpoints.from } : {}),
            ...(edge?.endpoints.to ? { to: edge.endpoints.to } : {}),
            ...(route ? { route } : {}),
            ...(node.channels ? { channels: node.channels } : {}),
          };
        });
        const ids = new Set(parts.map((p) => p.id));
        if (ids.size !== parts.length) throw new Error('Duplicate semantic mark ids in snapshot');
        const normalized = (id: string) => id.startsWith('node:') ? id.slice(5) : id;
        const captured = new Map(r.parts.map(({ node }) => [normalized(node.id), node]));
        for (const { node } of r.parts) {
          if (node.kind !== 'connector' || node.relationship.kind !== 'marker-carrier') continue;
          const owner = node.owner && normalized(node.owner.id);
          const semantic = owner && captured.get(owner);
          if (!owner || owner === normalized(node.id) || !semantic || semantic.kind !== 'connector' ||
              semantic.relationship.kind === 'marker-carrier' || semantic.role !== node.owner!.role ||
              !node.endpoints.from || !node.endpoints.to ||
              node.endpoints.from !== semantic.endpoints.from || node.endpoints.to !== semantic.endpoints.to)
            throw new Error(`Marker carrier ${node.id} has no unambiguous semantic connector owner`);
          Object.assign(parts.find((p) => p.id === normalized(node.id))!, { owner, markerCarrier: true });
        }
        for (const p of parts) {
          const owner = p.id.startsWith('edge-label:')
            ? p.id.replace('edge-label:', 'edge:')
            : p.id.startsWith('rel-label:')
              ? p.id.replace('rel-label:', 'rel:')
              : p.id.startsWith('task-label:')
                ? p.id.replace('task-label:', 'task:')
                : undefined;
          if (owner && ids.has(owner)) p.owner = owner;
        }
        if (lowered.has(-1))
          parts.unshift({ id: '__frame', role: 'frame', kind: 'shape', shapes: lowered.get(-1)! });
        const value: DiagramSnapshot = {
          version: 1,
          renderer: RENDERER,
          spec,
          family: /^\s*stateDiagram/m.test(spec.source) ? 'state' : r.doc.family,
          width: r.doc.width,
          height: r.doc.height,
          palette: r.palette,
          parts,
          findings,
          ...(spec.lettering === 'natural' ? {
            textMeasurement: { id: textMeasurement.id, version: textMeasurement.version },
            layoutCertification: r.receipt.layoutCertification,
          } : {}),
          ...chartOf(spec),
        };
        store[key] = value;
        return value;
      });
      serial = task.catch(() => {});
      pending.set(key, task);
      return task;
    },
  };
}
