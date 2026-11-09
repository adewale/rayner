// The only coupling to Agentic Mermaid's per-mark backend API. Pin until renderParts is public.
import {
  createMermaidRenderer,
  DefaultBackend,
  getBackend,
  getStyle,
  registerBackend,
  renderMermaidSVG,
} from 'agentic-mermaid';
import type { SceneDoc, SceneNode, StyleBackend, TextMeasurementProfile, RenderRequestReceipt } from 'agentic-mermaid';
import type { DiagramSpec } from '../../explain/index.ts';
import type { Palette } from '../../src/index.ts';

export function capture(spec: DiagramSpec, textMeasurement?: TextMeasurementProfile): {
  svg: string;
  marked: string;
  doc: SceneDoc;
  parts: { node: SceneNode; svg: string }[];
  palette: Palette;
  receipt: RenderRequestReceipt;
} {
  let real: StyleBackend = DefaultBackend;
  let captured: SceneDoc | undefined;
  let marking = false;
  let parts: { node: SceneNode; svg: string }[] = [];
  const backend: StyleBackend = {
    id: 'backend:lantern-capture',
    capabilities: DefaultBackend.capabilities.map((c) => ({ ...c, target: 'backend:lantern-capture' })),
    drawNode(node, ctx) {
      return real.drawNode(node, ctx);
    },
    render(doc, ctx) {
      captured = doc;
      parts = doc.parts
        .filter((n) => n.kind !== 'document')
        .map((node) => ({ node, svg: real.drawNode(node, ctx) }));
      const raw = real.render(doc, ctx);
      if (!marking) return raw;
      let marked = '',
        cursor = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        let fragment = part.svg;
        let at = raw.indexOf(fragment, cursor);
        // 0.5 applies document contrast safety after drawNode. A simple text
        // fragment may differ only in fill; locate it by all its other bytes
        // and preserve the actual rendered paint. Never relax geometry/text.
        if (at < 0 && part.node.kind === 'text' && /^<text\b[\s\S]*<\/text>$/.test(fragment)) {
          const withoutFill = (s: string) => s.replace(/\sfill="[^"]*"/g, '');
          const matches = [...raw.slice(cursor).matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/g)]
            .filter((m) => withoutFill(m[0]) === withoutFill(fragment));
          if (matches.length === 1) {
            fragment = matches[0]![0];
            at = cursor + matches[0]!.index!;
          }
        }
        if (at < 0) throw new Error(`Cannot locate rendered part ${part.node.id}`);
        marked += raw.slice(cursor, at) + `<g data-lantern-part="${i}">${fragment}</g>`;
        cursor = at + fragment.length;
      }
      return marked + raw.slice(cursor);
    },
  };
  const unregister = registerBackend(backend, { version: '1.0.0', compatibility: { core: '*', scene: '*' } });
  try {
    const renderer = createMermaidRenderer({
      ...(textMeasurement ? { textMeasurement } : {}),
      backendPolicy: {
        selectBackend(selection) {
          real = getBackend(selection.requestedId) ?? DefaultBackend;
          return backend.id;
        },
      },
    });
    const options = spec.style && spec.style !== 'default' ? { style: spec.style } : {};
    const { svg, receipt } = renderer.renderMermaidSVGWithReceipt(spec.source, options);
    const reference = textMeasurement
      ? createMermaidRenderer({ textMeasurement }).renderMermaidSVG(spec.source, options)
      : renderMermaidSVG(spec.source, options);
    if (svg !== reference)
      throw new Error('Capture changed Agentic Mermaid output');
    if (!captured) throw new Error('Capture backend was not called');
    // Wrap before final colour/text normalization, only after the equality assertion.
    marking = true;
    const marked = renderer.renderMermaidSVG(spec.source, options);
    const colors = spec.style && spec.style !== 'default' ? getStyle(spec.style)?.colors : undefined;
    return {
      svg,
      marked,
      doc: captured,
      receipt,
      parts,
      palette: {
        paper: colors?.bg ?? captured.colors.bg,
        ink: colors?.fg ?? captured.colors.fg,
        accent: colors?.accent ?? captured.colors.accent ?? captured.colors.fg,
        muted: colors?.muted ?? captured.colors.fg,
      },
    };
  } finally {
    unregister();
  }
}
