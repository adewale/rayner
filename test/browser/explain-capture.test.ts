import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capture } from '../../integrations/agentic-mermaid/build/capture.ts';
import { renderMermaidSVG } from 'agentic-mermaid';
import { snapshotBuilder } from '../../integrations/agentic-mermaid/build/index.ts';
import { Resvg } from '@resvg/resvg-js';
import { outlineText } from '../../integrations/agentic-mermaid/text.ts';
import { lostLabelWarnings } from '../../tools/lib/explain-warnings.ts';
import { Scene, NullSink, VMobject, toSvgString } from '../../src/index.ts';
import { PALETTES } from '../../explain/palettes.ts';
import { findingsOf } from '../../integrations/agentic-mermaid/snapshot.ts';
import { Diagram } from '../../explain/diagrams.ts';
import { dimOpacity } from '../../explain/look.ts';

test('actual class marker carriers follow their explicit relationships through reveal, marking and dimming', {
  skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for real capture',
}, async () => {
  const spec = { source: 'classDiagram\nclass Scene\nclass Mobject\nclass Animation\nclass Sink\nclass Subclass\nScene *-- Mobject : owns\nScene o-- Animation : plays\nScene --> Sink : emits\nScene <|-- Subclass : inherits' };
  const raw = capture(spec);
  const carriers = raw.parts.map((p) => p.node).filter((n) => n.kind === 'connector' && n.relationship.kind === 'marker-carrier');
  assert.equal(carriers.length, 4, 'the four declared relationships each carry an actual arrowhead');
  const builder = await snapshotBuilder();
  try {
    const snapshot = await builder.diagram(spec);
    const markerShapes = snapshot.parts.filter((p) => p.markerCarrier).flatMap((p) => p.shapes);
    assert.ok(markerShapes.some((s) => s.subpaths.length && s.style.fill !== 'none' &&
      (s.style.fillOpacity ?? 1) > 0 && (s.style.opacity ?? 1) > 0), 'the source includes a painted filled marker');
    assert.ok(markerShapes.some((s) => s.subpaths.length && s.style.stroke !== 'none' &&
      (s.style.strokeWidth ?? 0) > 0 && (s.style.strokeOpacity ?? 1) > 0 && (s.style.opacity ?? 1) > 0),
      'the source includes a painted stroked marker');
    const diagram = new Diagram(new Scene(new NullSink(), { skipUntil: Infinity }), spec, snapshot);
    await diagram.build('frame');
    for (const carrier of carriers) {
      const part = snapshot.parts.find((p) => p.id === carrier.id)!;
      assert.equal(part.owner, carrier.owner!.id, 'ownership comes from the actual upstream source mark');
      assert.ok(!diagram.visible.has(carrier.id), 'an arrowhead cannot appear before its relationship');
      assert.equal(diagram.get(carrier.id).parent, diagram.get(part.owner!));
      const paint = part.shapes.filter((s) => s.subpaths.length && s.style.stroke !== 'none' &&
        (s.style.strokeOpacity ?? 1) > 0 && (s.style.opacity ?? 1) > 0);
      assert.ok(paint.length > 0, 'the owned carrier contains real painted arrowhead geometry');
      await diagram.reveal([part.owner!], { runTime: 0 });
      assert.ok(diagram.visible.has(carrier.id), 'revealing a relationship reveals its arrowhead');
    }
    await diagram.reveal('rest', { runTime: 0 });
    assert.equal(diagram.describe().what, 'Class diagram: 5 classes, 4 relationships');
    const labels = [...diagram.parts.values()].filter((p) => p.info.role === 'label')
      .flatMap((p) => p.mob.family().filter((m) => !m.children.length));
    assert.ok(labels.length > 0, 'the class diagram contains actual relationship labels');
    const labelPaint = labels.map((m) => structuredClone(m.style));
    const basePaint = new Map(carriers.map((c) => [c.id, diagram.get(c.id).family().map((m) => structuredClone(m.style))]));
    const before = new Map(carriers.map((c) => [c.id, diagram.get(c.id).family().map((m) => m.style.opacity ?? 1)]));
    await diagram.dim([], { runTime: 0 });
    for (const carrier of carriers)
      assert.deepEqual(diagram.get(carrier.id).family().map((m) => m.style.opacity ?? 1),
        before.get(carrier.id)!.map((o) => o * dimOpacity(snapshot.palette)), 'the owner dims its arrowhead with the relationship');
    await diagram.dim(null, { runTime: 0 });
    await diagram.mark(carriers.map((c) => c.owner!.id), { color: '#ff0000', runTime: 0 });
    for (const carrier of carriers) {
      const shapes = snapshot.parts.find((p) => p.id === carrier.id)!.shapes;
      const route = diagram.parts.get(carrier.id)!.route;
      const leaves = diagram.get(carrier.id).family().filter((m) => !m.children.length && m !== route);
      assert.equal(leaves.length, shapes.length, 'each captured marker shape remains an actual leaf');
      shapes.forEach((s, i) => {
        if (s.subpaths.length && s.style.stroke !== 'none' && (s.style.strokeWidth ?? 0) > 0 &&
            (s.style.strokeOpacity ?? 1) > 0 && (s.style.opacity ?? 1) > 0)
          assert.equal(leaves[i]!.style.stroke, '#ff0000', 'every painted arrowhead stroke follows the mark');
        if (s.subpaths.length && s.style.fill !== 'none' && (s.style.fillOpacity ?? 1) > 0 && (s.style.opacity ?? 1) > 0) {
          const hollow = carrier.kind === 'connector' && ['Animation', 'Subclass'].includes(carrier.endpoints.to!);
          assert.equal(leaves[i]!.style.fill, hollow ? s.style.fill : '#ff0000',
            hollow ? 'aggregation and inheritance stay hollow' : 'composition stays filled and takes the mark');
        }
      });
    }
    assert.deepEqual(labels.map((m) => m.style), labelPaint, 'owned relationship labels keep their original paint');
    await diagram.unmark(undefined, { runTime: 0 });
    for (const carrier of carriers)
      assert.deepEqual(diagram.get(carrier.id).family().map((m) => m.style), basePaint.get(carrier.id),
        'clearing dimming and marking restores each arrowhead exactly');
  } finally { await builder.close(); }
});

test('actual branch warnings map both raw per-pair ids to their captured edge parts', {
  skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for real capture',
}, async () => {
  const builder = await snapshotBuilder();
  try {
    const snapshot = await builder.diagram({
      source: 'graph LR\nA{Cached} --> B[Reply]\nA --> C[Database]', style: 'blueprint',
    });
    const warnings = snapshot.findings.warnings.filter((w) => w.code === 'DECISION_BRANCH_UNLABELED');
    assert.deepEqual(warnings.map((w) => w.edge), ['A->B#0', 'A->C#0']);
    const mapped = findingsOf(snapshot).filter((w) => w.code === 'DECISION_BRANCH_UNLABELED');
    assert.deepEqual(mapped.map((w) => w.part), ['edge:A->B#0', 'edge:A->C#0']);
    assert.ok(mapped.every((w) => snapshot.parts.some((p) => p.id === w.part && p.kind === 'connector')));
  } finally { await builder.close(); }
});

test('capture delegates the real backend without changing its output', () => {
  const spec = { source: 'graph LR\nA[Client] --> B[Server]', style: 'hand-drawn' };
  const result = capture(spec);
  assert.equal(result.svg, renderMermaidSVG(spec.source, { style: spec.style }));
  assert.deepEqual(
    result.parts.map((p) => p.node.id),
    ['edge:A->B#0', 'node:A', 'node:B'],
  );
  assert.match(result.marked, /data-lantern-part="0"/);
});
test('the palettes copied from Agentic Mermaid match its styles', () => {
  for (const [style, palette] of Object.entries(PALETTES))
    assert.deepEqual(capture({ source: 'graph LR\nA --> B', style }).palette, palette, style);
});
test('pie capture preserves document contrast paint when per-mark text starts with another fill', () => {
  const spec = {
    source: '---\nconfig:\n  themeVariables:\n    pie1: "#3b6ea5"\n---\npie\n"Blue" : 8\n"Other" : 92',
    style: 'pen-and-ink',
  };
  const result = capture(spec);
  assert.equal(result.svg, renderMermaidSVG(spec.source, { style: spec.style }));
  const changed = result.parts.filter((p) => p.node.kind === 'text' && p.svg.includes('fill="#FFFFFF"'));
  assert.ok(changed.length > 0, 'the source exercises upstream document contrast normalization');
  for (const part of changed) {
    const index = result.parts.indexOf(part);
    const actual = result.marked.match(new RegExp(`<g data-lantern-part="${index}">([\\s\\S]*?)<\\/g>`))?.[1];
    assert.ok(actual && result.svg.includes(actual), 'the capture wrapper carries exact actual rendered bytes');
    assert.ok(!actual.includes('fill="#FFFFFF"'), 'document contrast really changes the white label');
    assert.equal(actual.replace(/\sfill="[^"]*"/g, ''), part.svg.replaceAll('var(--bg)', result.palette.paper).replace(/\sfill="[^"]*"/g, ''),
      'only fill differs: source, size, position and other paint remain exact');
  }
});
test(
  'SVG lowering preserves finite glyph geometry for em-relative baselines',
  { skip: !process.env.EXPLAIN_BROWSER ? 'set EXPLAIN_BROWSER=1 to run real Chromium capture' : false },
  async () => {
    const builder = await snapshotBuilder();
    try {
      const value = await builder.diagram({
        source: 'xychart-beta\n x-axis [One,Two]\n y-axis "Count" 0 --> 4\n bar [1,3]',
        style: 'blueprint',
      });
      const shapes = value.parts.flatMap((p) => p.shapes);
      assert.ok(shapes.some((s) => s.text === 'One'));
      assert.equal(shapes.find((s) => s.text === '4')?.textRun?.baseline, 'middle');
      for (const shape of shapes) {
        const paths = shape.textRun
          ? outlineText(shape.textRun, shape.style).flatMap((p) => p.subpaths)
          : shape.subpaths;
        assert.ok(paths.length > 0, `Empty imported mark ${shape.text ?? 'shape'}`);
        for (const path of paths)
          assert.ok(path.every(Number.isFinite), `Non-finite points in ${shape.text ?? 'shape'}`);
      }
      const late = await builder.diagram({ source: 'graph LR\nA --> B\nB[Database]', style: 'nord' });
      assert.ok(late.parts.find((p) => p.id === 'B')?.shapes.some((s) => s.text === 'Database'),
        'the current upstream preserves a label declared after the first reference');
      assert.deepEqual(lostLabelWarnings(late), []);
      const damaged = structuredClone(late);
      const label = damaged.parts.find((p) => p.id === 'B')!.shapes.find((s) => s.text === 'Database')!;
      label.text = 'B';
      assert.match(lostLabelWarnings(damaged)[0]!, /Node B rendered its bare id/,
        'the diagnostic still rejects the former upstream defect');
    } finally {
      await builder.close();
    }
  },
);

test(
  'every authored style keeps its non-text artwork against the real SVG renderer',
  { skip: !process.env.EXPLAIN_BROWSER ? 'set EXPLAIN_BROWSER=1 for real style fidelity checks' : false },
  async () => {
    const builder = await snapshotBuilder();
    try {
      for (const style of Object.keys(PALETTES)) {
        const snapshot = await builder.diagram({
          source: 'graph LR\nA[Client] -->|request| B[Server]',
          style,
        });
        const scene = new Scene(new NullSink());
        for (const part of snapshot.parts)
          for (const shape of part.shapes) {
            if (shape.textRun || shape.text != null) continue;
            const path = new VMobject(shape.style);
            path.subpaths = shape.subpaths.map((a) => new Float32Array(a));
            path.closed = shape.closed;
            scene.add(path);
          }
        const original = renderMermaidSVG(snapshot.spec.source, { style }).replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, '');
        const imported = toSvgString(scene)
          .replace(
            /width="1280" height="720" viewBox="[^"]+"/,
            `width="${snapshot.width}" height="${snapshot.height}" viewBox="0 0 ${snapshot.width * 10} ${snapshot.height * 10}"`,
          )
          .replace(/<rect x="-8000"[^>]+\/>/, '');
        const reference = new Resvg(original, {
          fitTo: { mode: 'width', value: 640 },
          font: { loadSystemFonts: false },
        }).render();
        const actual = new Resvg(imported, {
          fitTo: { mode: 'width', value: 640 },
          font: { loadSystemFonts: false },
        }).render();
        assert.equal(actual.width, reference.width);
        assert.equal(actual.height, reference.height);
        const actualPixels = actual.pixels,
          referencePixels = reference.pixels;
        let error = 0;
        for (let i = 0; i < actualPixels.length; i++)
          error += Math.abs(actualPixels[i]! - referencePixels[i]!);
        const mean = error / actualPixels.length;
        assert.ok(
          mean < 1,
          `${style}: non-text mean channel error ${mean.toFixed(4)} exceeds 1/255 (path quantization allowance)`,
        );
      }
    } finally {
      await builder.close();
    }
  },
);
