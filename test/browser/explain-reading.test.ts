import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Text, Rectangle, VMobject, NullSink, Transform, TransformMatchingShapes, loadFonts, toSvgString } from '../../src/index.ts';
import { stage } from '../../explain/index.ts';
import { stepLayouts, closeUps, viewBox, stageScale } from '../../app/embed-closeup.ts';
import type { Box } from '../../src/index.ts';
import { fc, params } from '../lib/pbt.ts';
import { Diagram, labelOf, readingLabelSize } from '../../explain/diagrams.ts';
import type { DiagramSnapshot } from '../../explain/index.ts';
import importedSnapshot from '../../scenes/explainers/font-metrics/scene.snapshots/4ee0d75a90dc9b78.json' with { type: 'json' };
import { outlineText } from '../../integrations/agentic-mermaid/text.ts';
await loadFonts();

function importedLabel(snapshot = importedSnapshot as DiagramSnapshot) {
  const diagram = new Diagram(new Scene(new NullSink()), snapshot.spec, snapshot);
  const label = diagram.get('B').family().find((m) => labelOf(m)?.text === 'Paper')!;
  label.parent!.remove(label);
  return label;
}

test('native and imported font metrics preserve rotation and uniform scale, and detect squash and shear', async () => {
  const { labelPx } = await import('../../tools/lib/explain-check.ts');
  const cases = [
    { matrix: [0, 1, -1, 0], scale: 1 },
    { matrix: [0, 2, -2, 0], scale: 2 },
    { matrix: [0.01, 0, 0, 1], scale: 0.01 },
    { matrix: [1, 0, 0, 0.25], scale: 0.25 },
    { matrix: [1, 0, 3, 1], scale: (Math.sqrt(13) - 3) / 2 },
    { matrix: [-2, 0, 0, 2], scale: 2 },
    { matrix: [0, 0, 0, 1], scale: 0 },
  ];
  for (const make of [() => new Text('Paper', { fontSize: 0.8 }), importedLabel])
    for (const { matrix, scale } of cases) {
      const label = make(), original = readingLabelSize(label)!;
      const [a, b, c, d] = matrix as [number, number, number, number];
      label.applyAffine(a, b, c, d, 0, 0, { aboutPoint: [0, 0] });
      assert.ok(Math.abs(readingLabelSize(label)! - original * scale) < 2e-6, JSON.stringify(matrix));
      assert.ok(Math.abs(labelPx(label, {})! - original * scale * 80) < 2e-4,
        'the production legibility checker uses the same transformed font floor');
    }
});

test('imported source matrices and forced widths determine font size without altering SVG bytes or bounds', () => {
  const svg = (m: Group) => { const scene = new Scene(new NullSink()); scene.add(m); return toSvgString(scene); };
  for (const natural of [true, false]) {
    const snapshot = structuredClone(importedSnapshot) as DiagramSnapshot;
    const shape = snapshot.parts.find((p) => p.id === 'B')!.shapes.find((s) => s.text === 'Paper')!;
    const run = shape.textRun!;
    // A rotated, nonuniform captured transform; the legacy fontSize only
    // records its geometric mean. A forced width supplies another squash.
    run.matrix = [0, 2, -0.5, 0, 15, 20];
    if (!natural) {
      delete run.natural;
      run.width = new Text(run.text, { fontSize: run.size }).advance() / 4;
    }
    const raw = new Group(...outlineText(run, shape.style));
    const label = importedLabel(snapshot);
    const fit = label.width() / raw.width();
    // Original em: 13 / 100. Matrix singular values: 2 and 0.5;
    // forced quarter width changes them to 0.5 and 0.5.
    assert.ok(Math.abs(readingLabelSize(label)! - 0.13 * 0.5 * fit) < 2e-6);
    const control = new Group(...label.children.map((m) => m.copy()));
    control.mergeLeaves = label.mergeLeaves;
    assert.deepEqual(label.box(), control.box(), 'the actual imported label starts with its original ink bounds');
    assert.equal(svg(label as Group), svg(control), 'the added font basis emits no SVG');
    for (const m of [label, control]) m.rotate(Math.PI / 3).applyAffine(1, 0.4, 2, 1, -3, 2);
    assert.deepEqual(label.box(), control.box(), 'rotation and shear preserve the original layout bounds');
    assert.equal(svg(label as Group), svg(control), 'rotation and shear preserve the original SVG bytes');
    const text = new Text('Paper', { fontSize: 0.8 }).rotate(Math.PI / 3);
    const before = svg(text);
    readingLabelSize(text);
    assert.equal(svg(text), before, 'reading the native metric leaves its SVG bytes unchanged');
  }
});

test('imported label copies and animation retain their basis without changing glyphs or layout bounds', () => {
  const original = importedLabel(), size = readingLabelSize(original)!;
  const copy = original.copy();
  copy.stretch(0.01, 0);
  assert.equal(readingLabelSize(original), size, 'a copy cannot mutate its source basis');
  assert.ok(Math.abs(readingLabelSize(copy)! - size * 0.01) < 2e-6);
  const geometry = new Group(...original.children.map((m) => m.copy()));
  const matrix = [1, 0.4, 2, 1, -3, 2] as const;
  original.applyAffine(...matrix, { aboutPoint: [0, 0] });
  geometry.applyAffine(...matrix, { aboutPoint: [0, 0] });
  assert.deepEqual(original.box(), geometry.box(), 'basis points add no layout extent, including after shear');
  const paths = (m: Group) => m.family().filter((p): p is VMobject => p instanceof VMobject)
    .map((p) => p.subpaths.map((a) => [...a]));
  assert.deepEqual(paths(original as Group), paths(geometry), 'metric bookkeeping leaves emitted glyph geometry intact');
  const moving = importedLabel(), start = readingLabelSize(moving)!;
  const target = moving.copy().stretch(0.25, 0);
  const animation = new Transform(moving, target);
  animation.begin();
  animation.interpolate(0.5);
  assert.ok(Math.abs(readingLabelSize(moving)! - start * 0.625) < 2e-6, 'the basis follows the glyphs during interpolation');
  animation.finish();
  assert.ok(Math.abs(readingLabelSize(moving)! - start * 0.25) < 2e-6);
  moving.copy().rotate(Math.PI / 2);
  assert.ok(Math.abs(readingLabelSize(moving)! - start * 0.25) < 2e-6);
});

test('imported font metadata stays out of every ancestor bound during different-word and native morphs', () => {
  for (const word of ['iiiiiiii', 'W', 'native']) {
    const source = importedLabel();
    const ancestor = new Group(new Group(source));
    let target;
    if (word === 'native') target = new Text('Paper', { fontSize: 0.8 }).rotate(Math.PI / 3).moveTo(source.center());
    else {
      const snapshot = structuredClone(importedSnapshot) as DiagramSnapshot;
      const shape = snapshot.parts.find((p) => p.id === 'B')!.shapes.find((s) => s.text === 'Paper')!;
      shape.textRun!.text = shape.text = word;
      delete shape.textRun!.width;
      const diagram = new Diagram(new Scene(new NullSink()), snapshot.spec, snapshot);
      target = diagram.get('B').family().find((m) => labelOf(m)?.text === word)!;
      target.parent!.remove(target);
    }
    const animation = new Transform(source, target, { pathFunc: (from, to, alpha) =>
      [from[0] + (to[0] - from[0]) * alpha, from[1] + (to[1] - from[1]) * alpha + Math.sin(Math.PI * alpha)] });
    animation.begin();
    for (const alpha of [0, 0.1, 0.3, 0.5, 0.8, 1]) {
      animation.interpolate(alpha);
      const ink = new Group(...source.children.map((m) => m.copy()));
      assert.deepEqual(source.box(), ink.box(), `${word}/${alpha}: no metric-only layout extent`);
      assert.deepEqual(ancestor.box(), ink.box(), `${word}/${alpha}: ancestors also ignore metric-only extent`);
    }
    animation.finish();
    assert.deepEqual(ancestor.box(), new Group(...source.children.map((m) => m.copy())).box());
    assert.ok(Math.abs(readingLabelSize(source)! - readingLabelSize(target)!) < 2e-6,
      `${word}: the endpoint retains the target font size`);
    if (word === 'native') assert.ok(Math.abs(readingLabelSize(source)! - 0.8) < 2e-6);
  }
});

test('nested imported font bases follow matching and morphed glyphs without target replacement', () => {
  for (const factor of [0.01, 2]) {
    const label = importedLabel(), originalSize = readingLabelSize(label)!;
    label.saveState();
    const source = new Group(label), target = source.copy().stretch(factor, 0);
    const animation = new TransformMatchingShapes(source, target, { replace: false, fadeMismatches: false });
    animation.begin();
    animation.finish();
    assert.ok(Math.abs(readingLabelSize(label)! - originalSize * Math.min(1, factor)) < 2e-6,
      'retaining the source must not retain an obsolete font basis');
    assert.deepEqual(source.box(), target.box(), 'matching glyphs retain their target geometry');
    label.restore();
    assert.ok(Math.abs(readingLabelSize(label)! - originalSize) < 2e-6, 'restore returns the independent saved font basis');
  }
});

test('matching between native and imported labels retains the target font scale in either direction', () => {
  for (const nested of [false, true])
    for (const nativeFirst of [false, true]) {
      const imported = importedLabel().stretch(0.01, 0);
      const native = new Text('Paper', { fontSize: 1.2 }).moveTo(imported.center());
      const sourceLabel = nativeFirst ? native : imported, targetLabel = nativeFirst ? imported : native;
      const expected = readingLabelSize(targetLabel)!;
      const source = nested ? new Group(sourceLabel) : sourceLabel;
      const target = nested ? new Group(targetLabel) : targetLabel;
      const animation = new TransformMatchingShapes(source, target, { replace: false, fadeMismatches: false });
      animation.begin();
      animation.finish();
      assert.ok(Math.abs(readingLabelSize(sourceLabel)! - expected) < 2e-6,
        `${nativeFirst ? 'native-to-imported' : 'imported-to-native'}/${nested}: exact target em`);
      if (sourceLabel instanceof Text) {
        assert.ok(Math.abs(sourceLabel.textSize() - expected * 10) < 2e-6,
          'native public textSize keeps its geometric-mean contract after a hundredfold width compression');
      }
    }
});

test('zero-em native matching keeps finite geometry and a closed readability floor in either direction', () => {
  for (const nativeFirst of [true, false]) {
    const native = new Text('Paper', { fontSize: 0 }), imported = importedLabel();
    const source = nativeFirst ? native : imported, target = nativeFirst ? imported : native;
    assert.equal(readingLabelSize(native), 0, 'the existing zero-size constructor yields no readable em');
    const animation = new TransformMatchingShapes(source, target, { replace: false, fadeMismatches: false });
    animation.begin();
    for (const alpha of [0, 0.5, 1]) {
      animation.interpolate(alpha);
      const arrays = source.family().flatMap((m) => m.pointArrays());
      assert.equal(arrays.length, 10, 'one metric frame and nine glyph contours');
      assert.ok(arrays.every((a) => a.every(Number.isFinite)), 'normalizing a zero em must not introduce NaN coordinates');
    }
    animation.finish();
    assert.equal(readingLabelSize(source), 0, 'degenerate native metrics fail closed');
  }
});

test('imported labels retain their compressed font dimension in reader layouts', async () => {
  const { collectProject } = await import('../../tools/lib/explain-project.ts');
  const p = await collectProject('test/fixtures/imported-reading', { write: false });
  assert.equal(p.variants.length, 2);
  for (const variant of p.variants) {
    const layout = (await stepLayouts(variant.Scene)).get('opening')!;
    assert.equal(layout.reading!.labels.length, 1);
    const expected = variant.values.width === 'thin' ? 0.008 : 0.8;
    assert.ok(Math.abs(layout.reading!.labels[0]!.size - expected) < 1e-5,
      `${variant.values.width}: use the smallest transformed font dimension`);
  }
});

test('the served review rejects a compressed imported word after accepting its readable control',
  { skip: process.env.EXPLAIN_BROWSER ? false : 'set EXPLAIN_BROWSER=1 for imported-label reader review' },
  async () => {
    const { collectProject } = await import('../../tools/lib/explain-project.ts');
    const { buildExplainer } = await import('../../tools/lib/explain-build.ts');
    const { serve } = await import('../../tools/lib/explain-serve.ts');
    const { launch } = await import('../../tools/lib/browser.ts');
    const { reviewStoryVariant } = await import('../../tools/lib/explain-story-review.ts');
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const project = await collectProject('test/fixtures/imported-reading', { write: false });
    assert.equal(project.variants.length, 2);
    const folder = await mkdtemp(join(tmpdir(), 'rayner-imported-reading-'));
    let browser: Awaited<ReturnType<typeof launch>> | undefined, server: Awaited<ReturnType<typeof serve>> | undefined;
    try {
      await buildExplainer(project, join(folder, 'index.html'));
      server = await serve(folder, 0, 'index.html');
      browser = await launch();
      const page = await browser.newPage();
      const claims = [{ step: 'opening', opening: true, targets: [{ key: 'paper' }] }];
      const normal = project.variants.find((v) => v.values.width === 'normal')!;
      const thin = project.variants.find((v) => v.values.width === 'thin')!;
      const url = `${server.url}/index.html`;
      const control = await reviewStoryVariant(page, url, normal, claims);
      assert.equal(control.length, 2, 'the normal word passes at both review widths');
      await assert.rejects(reviewStoryVariant(page, url, thin, claims), /readable|12px|font|label/i,
        'a word under one CSS pixel wide cannot pass the readable-label gate');
      await page.close();
    } finally {
      await browser?.close();
      server?.close();
      await rm(folder, { recursive: true, force: true });
    }
  });

test('declared label scale survives unrelated changes at generated phone sizes', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 120, max: 599 }),
      fc.integer({ min: 60, max: 1000 }),
      fc.double({ min: 0.05, max: 0.7, noNaN: true }),
      (width, height, size) => {
        const scale = Math.min(width / 16, height / 9),
          required = Math.max(1, 12 / (size * scale));
        fc.pre(required <= 6);
        // The two-unit subject fits even at the sixfold cap, including margin.
        const subject: Box = [3, -0.5, 5, 0.5];
        const layout = {
          parts: [[-6, -1, -4, 0] as Box],
          lead: 0,
          labels: [{ box: [-6, -1, -4, 0] as Box, size: 1 }],
          reading: { box: subject, labels: [{ box: subject, size }] },
        };
        const opening = closeUps(layout, width, height)[0]!,
          visible = viewBox(opening, width, height);
        assert.ok(size * scale * opening.k >= 12 - 1e-7);
        assert.ok(
          visible[0] <= subject[0] + 1e-6 &&
            visible[1] <= subject[1] + 1e-6 &&
            visible[2] >= subject[2] - 1e-6 &&
            visible[3] >= subject[3] - 1e-6,
        );
      },
    ),
    params(500),
  );
});

test('dimmed and rotated declared text retain their actual readable type size', async () => {
  for (const variant of ['dimmed', 'dimmed-group', 'rotated'] as const) {
    let actualSize = 0;
    class Subject extends Scene {
      override async construct() {
        const s = stage(this);
        await this.step('compare');
        const before = new Text('Before: 1', { fontSize: 0.3 }).moveTo([-2, 0]);
        if (variant === 'rotated') before.rotate(Math.PI / 2);
        if (variant === 'dimmed') before.setStyle({ opacity: 0.2 }, false);
        actualSize = before.textSize();
        const beforeSubject = variant === 'dimmed-group' ? new Group(before).setOpacity(0.49) : before;
        const after = new Text('After: 2', { fontSize: 0.8 }).moveTo([2, 0]);
        await s.enter(beforeSubject, after);
        s.reading(beforeSubject, after);
      }
    }
    const layout = (await stepLayouts(Subject)).get('compare')!;
    assert.equal(layout.reading!.labels.length, 2, `${variant}: visible declared text must participate in framing`);
    assert.ok(
      Math.abs(layout.reading!.labels[0]!.size - actualSize) < 1e-7,
      `${variant}: the declared font size must not come from a rotated bounding box`,
    );
    for (const width of [288, 358]) {
      const height = (width * 9) / 16,
        opening = closeUps(layout, width, height)[0]!,
        visible = viewBox(opening, width, height),
        want = layout.reading!.box;
      assert.ok(
        actualSize * stageScale(width, height).s * opening.k >= 12 - 1e-7,
        `${variant}/${width}: declared text below 12px`,
      );
      assert.ok(
        visible[0] <= want[0] + 1e-6 &&
          visible[1] <= want[1] + 1e-6 &&
          visible[2] >= want[2] - 1e-6 &&
          visible[3] >= want[3] - 1e-6,
      );
    }
  }
});

test('stretched native labels cannot use geometric-mean size to pass the readable opening floor', async () => {
  for (const angle of [0, Math.PI / 4, Math.PI / 2]) {
    class Compressed extends Scene {
      override async construct() {
        const s = stage(this);
        await this.step('compare');
        const subject = new Text('1', { fontSize: 0.6 }).stretch(4, 0).stretch(0.25, 1).rotate(angle).moveTo([-2, 0]);
        assert.ok(Math.abs(subject.textSize() - 0.6) < 1e-6, 'the public geometric-mean size contract remains intact');
        await s.enter(subject, new Text('After', { fontSize: 0.8 }).moveTo([2, 0]));
        s.reading(subject);
      }
    }
    const layout = (await stepLayouts(Compressed)).get('compare')!;
    assert.equal(layout.reading!.labels.length, 1);
    assert.ok(
      Math.abs(layout.reading!.labels[0]!.size - 0.15) < 1e-6,
      'a fourfold horizontal stretch must not hide a quarter-height font',
    );
    for (const width of [288, 358]) {
      const height = (width * 9) / 16,
        opening = closeUps(layout, width, height)[0]!;
      assert.ok(
        0.15 * stageScale(width, height).s * opening.k >= 12 - 1e-5,
        `${angle}/${width}: the compressed dimension is still under the readable floor`,
      );
    }
  }
});

test('unchanged declared labels stay readable when only unrelated larger text changes', async () => {
  class Unchanged extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('before');
      const subject = new Text('Compare me', { fontSize: 0.3 }).moveTo([4, 0]);
      const unrelated = new Text('OLD', { fontSize: 1 }).moveTo([-5, -1]);
      await s.enter(subject, unrelated);
      s.reading(subject);
      await this.step('after');
      unrelated.setText('NEWER');
      s.reading(subject);
      await this.wait(0.1);
    }
  }
  const layouts = await stepLayouts(Unchanged);
  for (const width of [288, 358])
    for (const step of ['before', 'after']) {
      const height = (width * 9) / 16,
        layout = layouts.get(step)!;
      assert.equal(layout.reading!.labels.length, 1);
      const opening = closeUps(layout, width, height)[0]!,
        visible = viewBox(opening, width, height),
        subject = layout.reading!.box;
      assert.ok(
        visible[0] <= subject[0] && visible[1] <= subject[1] && visible[2] >= subject[2] && visible[3] >= subject[3],
      );
      assert.ok(
        layout.reading!.labels[0]!.size * stageScale(width, height).s * opening.k >= 12 - 1e-7,
        `${step}/${width}: declared labels must remain readable after an unrelated edit`,
      );
    }
});

test('an authored opening keeps its complete comparison and shows either all or none of the stage heading', async () => {
  let chrome: Box | undefined;
  class WithHeading extends Scene {
    override async construct() {
      const s = stage(this, { headingSize: 0.6 });
      await this.step('comparison', { title: 'What explains this result?', line: 'Compare the three items.' });
      const subject = new Group(
        ...[-5.15, 0, 5.15].flatMap((x, i) => [
          new Rectangle({ width: 3.8, height: 1.15, fill: '#ffffff', stroke: '#111111' }).moveTo([x, 1]),
          new Text(String(i), { fontSize: 0.62 }).moveTo([x, 1]),
        ]),
        new Text('The selected result', { fontSize: 0.7 }).moveTo([0, -1.4]),
      );
      await s.enter(subject);
      s.reading(subject);
    }
  }
  // Read the visible native heading independently of the framing layout.
  await new WithHeading(
    {
      async frame() {},
      async stepEnd(scene) {
        const boxes = scene
          .familyMembers()
          .filter((m) => (m.key === '__heading' || m.key === '__chrome') && (m.style.opacity ?? 1) > 0.05)
          .map((m) => m.box())
          .filter((b): b is Box => !!b);
        assert.ok(boxes.length >= 2);
        chrome = [
          Math.min(...boxes.map((b) => b[0])),
          Math.min(...boxes.map((b) => b[1])),
          Math.max(...boxes.map((b) => b[2])),
          Math.max(...boxes.map((b) => b[3])),
        ];
      },
    },
    { skipUntil: Infinity },
  ).run();
  assert.ok(chrome);
  const layout = (await stepLayouts(WithHeading)).get('comparison')!;
  for (const width of [288, 358]) {
    const height = (width * 9) / 16,
      opening = closeUps(layout, width, height)[0]!,
      visible = viewBox(opening, width, height);
    const contains = (b: Box) =>
      visible[0] <= b[0] + 1e-6 && visible[1] <= b[1] + 1e-6 && visible[2] >= b[2] - 1e-6 && visible[3] >= b[3] - 1e-6;
    assert.ok(contains(layout.reading!.box), 'the comparison must still be complete');
    assert.ok(layout.reading!.labels.every((l) => l.size * stageScale(width, height).s * opening.k >= 12 - 1e-7));
    assert.ok(
      visible[3] <= chrome[1] + 1e-6 || contains(chrome),
      `${width}: a close-up must not clip part of the heading or leave only its subtitle`,
    );
  }
});

class Comparison extends Scene {
  override async construct() {
    const s = stage(this);
    await this.step('compare', { caption: 'Compare the old value with the new value.' });
    const left = new Text('Before: 1', { fontSize: 0.7 }).moveTo([-2, 1]);
    const right = new Text('After: 2', { fontSize: 0.7 }).moveTo([2, -1]);
    const detail = new Text('Implementation details', { fontSize: 0.22 }).moveTo([4, -3]);
    await s.enter(left, right, detail);
    s.reading(left, right);
    await this.step('next', { caption: 'A new step has its own subjects.' });
  }
}
test('an authored comparison opens together at readable size, retaining separate detail views', async () => {
  const layouts = await stepLayouts(Comparison),
    layout = layouts.get('compare')!;
  assert.ok(layout.reading);
  assert.equal(layout.reading.labels.length, 2, 'the nearby implementation label cannot set comparison scale');
  for (const width of [288, 358]) {
    const height = (width * 9) / 16,
      views = closeUps(layout, width, height),
      box = viewBox(views[0]!, width, height),
      want = layout.reading.box;
    assert.ok(
      box[0] <= want[0] && box[1] <= want[1] && box[2] >= want[2] && box[3] >= want[3],
      'both complete subjects are in the opening',
    );
    assert.ok(
      Math.min(...layout.reading.labels.map((l) => l.size)) * stageScale(width, height).s * views[0]!.k >= 12 - 1e-7,
    );
    assert.ok(views.length > 1, 'the small implementation detail remains reachable');
  }
  assert.equal(layouts.get('next')!.reading, undefined, 'previous subjects do not leak into the next caption');
});
test('reading intent cannot bless an absent or unpainted subject', async () => {
  for (const fill of ['none', '#ffffff']) {
    class Missing extends Scene {
      override async construct() {
        const s = stage(this);
        await this.step('bad');
        const object = new Group(new Rectangle({ width: 2, height: 1, fill, stroke: 'none' }));
        if (fill === 'none') this.add(object);
        s.reading(object);
      }
    }
    await assert.rejects(stepLayouts(Missing), /reading\(\): bad names a subject with no painted ink/);
  }
});

test('a declared drawing group cannot satisfy an independent claim after one comparison label is hidden', async () => {
  const { storyFrames } = await import('../../tools/lib/explain-story-review.ts');
  const claims = [{ step: 'compare', opening: true, targets: [{ text: 'Before: 1' }, { text: 'After: 2' }] }];
  class Both extends Scene {
    static hideAfter = false;
    override async construct() {
      const s = stage(this);
      await this.step('compare', { caption: 'Compare before and after.' });
      const before = new Text('Before: 1', { fontSize: 0.7 }).moveTo([-2, 1]);
      const after = new Text('After: 2', { fontSize: 0.7 }).moveTo([2, -1]);
      if ((this.constructor as typeof Both).hideAfter) after.setOpacity(0);
      const group = new Group(before, after);
      s.reading(group);
      await s.enter(group);
    }
  }
  const good = await storyFrames(Both, claims);
  assert.equal(good.get('compare')!.targets.filter((t) => t.opening).length, 2);
  class Hidden extends Both {
    static override hideAfter = true;
  }
  // reading() still has visible before ink; the separately named After obligation must reject.
  await assert.rejects(storyFrames(Hidden, claims), /After: 2.*(no painted paths|missing glyph ink)/);
});

test('a wordless subject opens whole while small implementation labels retain their readable tour', async () => {
  class Shape extends Scene {
    override async construct() {
      const s = stage(this);
      await this.step('shape', { caption: 'The rectangle is the subject.' });
      const rect = new Rectangle({ width: 12, height: 4, fill: '#d45d00', stroke: 'none' });
      await s.enter(rect, new Text('Details', { fontSize: 0.22 }).moveTo([4, -3]));
      s.reading(rect);
    }
  }
  const layout = (await stepLayouts(Shape)).get('shape')!;
  assert.equal(layout.reading!.labels.length, 0);
  for (const width of [288, 358]) {
    const views = closeUps(layout, width, (width * 9) / 16),
      box = viewBox(views[0]!, width, (width * 9) / 16),
      subject = layout.reading!.box;
    assert.ok(box[0] <= subject[0] && box[1] <= subject[1] && box[2] >= subject[2] && box[3] >= subject[3]);
    assert.ok(views.length > 1, 'the detail label still has readable close-ups');
  }
});

test('the legibility report measures each label at a tour stop that actually contains it', async () => {
  const { collectProject } = await import('../../tools/lib/explain-project.ts');
  const { checkProject } = await import('../../tools/lib/explain-check.ts');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = await mkdtemp(join(tmpdir(), 'rayner-reading-gate-'));
  try {
    const p = await collectProject('test/fixtures/reading-comparison', { write: false });
    const report = await checkProject(p, folder);
    const variants = report.variants as {
      legibility: { labelsUnder12PxAt390: number; labelsOutsideCloseUpsAt390: number };
    }[];
    assert.equal(variants.length, 1);
    assert.equal(variants[0]!.legibility.labelsUnder12PxAt390, 0);
    assert.equal(variants[0]!.legibility.labelsOutsideCloseUpsAt390, 0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
