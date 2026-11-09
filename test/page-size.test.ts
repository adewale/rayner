// What a built page carries: diagram code only where a scenario shows a diagram, and minified CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { collectProject, engineAlias, ROOT } from '../tools/lib/explain-project.ts';
import { buildExplainer, minifyCss } from '../tools/lib/explain-build.ts';
import { NO_DIAGRAM_CODE, withoutDiagramCode } from '../tools/lib/explain-diagram-code.ts';
import { Circle, Line, Rectangle, VMobject } from '../src/index.ts';
import { pathD } from '../src/vmobject.ts';

/** A string only explain/diagrams.ts's Diagram class holds. */
const DIAGRAM_ONLY = 'is not a link of this diagram';

test('a page carries diagram code only when some scenario shows a diagram', async () => {
  const out = await mkdtemp(join(tmpdir(), 'rayner-page-size-'));
  try {
    // The imported-reading fixture makes its diagram from a snapshot it imports itself, so the store
    // stays empty: the page needs diagram code all the same, as the diagrams it made say.
    for (const [scene, diagrams] of [['scenes/tutorial/lru-mru/scene.ts', false], ['scenes/explainers/agentic-mermaid/scene.ts', true], ['test/fixtures/imported-reading/scene.ts', true]] as const) {
      const project = await collectProject(join(ROOT, scene), { write: false });
      assert.equal(project.diagrams, diagrams, scene);
      const { html } = await buildExplainer(project, join(out, 'page.html'));
      assert.equal(html.includes(DIAGRAM_ONLY), diagrams, `${scene} ${diagrams ? 'needs' : 'must not carry'} the Diagram class`);
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('a page built without diagram code says so if its scene reaches a diagram, and keeps the label helpers, which are a module of their own', async () => {
  const result = await build({
    stdin: {
      contents: `export { Diagram } from ${JSON.stringify(join(ROOT, 'explain/index.ts'))};
export { labelOf, readingLabelSize } from ${JSON.stringify(join(ROOT, 'explain/labels.ts'))};`,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    metafile: true,
    plugins: [withoutDiagramCode(), engineAlias()],
    logLevel: 'silent',
  });
  const code = result.outputFiles[0]!.text;
  assert.ok(!code.includes(DIAGRAM_ONLY));
  const carried = Object.entries(Object.values(result.metafile!.outputs)[0]!.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([path]) => path);
  assert.ok(!carried.some((path) => path.endsWith('explain/diagram-text.ts')), 'no Mermaid replay');
  const page = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  assert.throws(() => new page.Diagram(), { message: NO_DIAGRAM_CODE });
  assert.equal(typeof page.labelOf, 'function');
  assert.equal(page.labelOf({}), undefined);
});

test('the page style is minified CSS that keeps every rule', async () => {
  const css = await readFile(join(ROOT, 'app/embed.css'), 'utf8');
  const small = await minifyCss(css);
  assert.ok(small.length < 0.8 * css.length, `${small.length} of ${css.length} bytes`);
  assert.ok(!/\n\s*\n|;\}/.test(small));
  // Every selector and custom property survives.
  for (const token of new Set(css.match(/--[\w-]+(?=:)/g))) assert.ok(small.includes(token + ':'), token);
  const out = await mkdtemp(join(tmpdir(), 'rayner-page-css-'));
  try {
    const { html, receipt } = await buildExplainer(await collectProject(join(ROOT, 'scenes/tutorial/lru-mru/scene.ts'), { write: false }), join(out, 'page.html'));
    const style = html.match(/<style>([\s\S]*?)<\/style>/)![1]!;
    assert.equal(style, await minifyCss(style), 'the page ships its style minified');
    assert.ok(style.startsWith(small.slice(0, 200)));
    const { createHash } = await import('node:crypto');
    assert.ok((receipt.headers as Record<string, string>)['Content-Security-Policy']!.includes(`'sha256-${createHash('sha256').update(style).digest('base64')}'`), 'the policy pins the minified style');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('the SVG writer writes a straight segment as L and a curve as C', () => {
  assert.equal(pathD(new Line([0, 0], [2, 1])), 'M0 0L2000 -1000');
  assert.match(pathD(new Rectangle({ width: 2, height: 1 })), /^M[-\d]+ [-\d]+(L[-\d]+ [-\d]+){4}Z$/);
  assert.match(pathD(new Circle()), /^M[-\d]+ [-\d]+(C[-\d]+ [-\d]+ [-\d]+ [-\d]+ [-\d]+ [-\d]+)+Z$/);
  // Controls within a thousandth of the chord's thirds are a line; two thousandths off is a curve.
  const cubic = (dy: number) => {
    return pathD(new VMobject().startNewPath([0, 0]).addCubic([1, dy], [2, 0], [3, 0]));
  };
  assert.equal(cubic(0), 'M0 0L3000 0');
  assert.equal(cubic(0.001), 'M0 0L3000 0');
  assert.equal(cubic(0.002), 'M0 0C1000 -2 2000 0 3000 0');
});

test('a page whose lettering decodes no face of its own ships SFNT faces and no Brotli decoder', async () => {
  const out = await mkdtemp(join(tmpdir(), 'rayner-page-fonts-'));
  try {
    // feature-tour asks for maths alone: outlines, and no face for the page to decode.
    const project = await collectProject(join(ROOT, 'scenes/explainers/feature-tour/scene.ts'), { write: false });
    assert.ok(project.outlineLettering);
    const { html } = await buildExplainer(project, join(out, 'page.html'));
    assert.ok(!html.includes('large-window brotli'), 'no Brotli decoder');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
