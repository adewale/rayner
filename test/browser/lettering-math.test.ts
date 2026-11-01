// Maths lettering (meta.lettering.math): the stored outlines against glyph's own results, TeX
// that fails closed, a changed formula without a refresh, morphs, and the page against Node.
// glyph's results (test/lettering/glyph-math.json) come from upstream glyph's unbundled source
// at the pinned commit: node tools/oracle/glyph-math.ts <glyph checkout> <latinmodern-math.otf>.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Scene, NullSink, MathTex, TransformMatchingShapes, TransformMatchingText, SnapshotSink, renderAt, renderElements } from '../../src/index.ts';
import type { Mobject, VMobject } from '../../src/index.ts';
import { bindLettering, snapshotProvider, unpackLettering } from '../../src/lettering-outlines.ts';
import type { LetteringSnapshot } from '../../src/lettering-outlines.ts';
import { loadFont } from '../../vendor/glyph.js';
import type { Font } from '../../vendor/glyph.js';
import { typeset } from '../../vendor/glyph-math.js';
import { collectProject, defaultVariant, ROOT } from '../../tools/lib/explain-project.ts';
import { buildExplainer } from '../../tools/lib/explain-build.ts';
import { checkProject } from '../../tools/lib/explain-check.ts';
import { serve } from '../../tools/lib/explain-serve.ts';
import { restingTime } from '../../explain/trace.ts';
import { launch } from '../../tools/lib/browser.ts';
import { EXPECTED, expectedOf, pathDigest } from '../../tools/oracle/glyph-math.ts';
import type { Expected } from '../../tools/oracle/glyph-math.ts';

const fixture = join(ROOT, 'test/lettering/math');
const expected: Expected = JSON.parse(await readFile(EXPECTED, 'utf8'));
const snapshot: LetteringSnapshot = unpackLettering(JSON.parse(await readFile(join(fixture, 'scene.lettering.json'), 'utf8')));
const mathRuns = Object.entries(snapshot.runs).filter(([key]) => JSON.parse(key)[0] === 'math');
const mathFont = process.env.RAYNER_MATH_FONT ?? '/usr/share/texmf/fonts/opentype/public/lm-math/latinmodern-math.otf';
// Capture accepts only the pinned file, so the font-gated tests skip any other
const noFont = (!existsSync(mathFont) || createHash('sha256').update(readFileSync(mathFont)).digest('hex') !== expected.font)
  && 'set RAYNER_MATH_FONT to Latin Modern Math 1.959';
const rect = (x: number, y: number, w: number, h: number) =>
  [{ tag: 'MoveTo', x, y }, { tag: 'LineTo', x: x + w, y }, { tag: 'LineTo', x: x + w, y: y + h }, { tag: 'LineTo', x, y: y + h }, { tag: 'Close' }];
// As written to the expected file: JSON keeps no -0
const asJson = (x: unknown): unknown => JSON.parse(JSON.stringify(x));
const fontOf = async (bytes: Uint8Array): Promise<Font> => {
  const r = await loadFont(bytes);
  assert.equal(r.tag, 'Ok');
  return (r as { value: Font }).value;
};
// The fixture scene's source, with one formula swapped, in a folder of its own
async function variant(from: string, to: string, withSnapshot: boolean): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lettering-math-'));
  const source = await readFile(join(fixture, 'scene.ts'), 'utf8');
  assert.ok(source.includes(from), from);
  await writeFile(join(dir, 'scene.ts'), source.replace(from, to));
  if (withSnapshot) await copyFile(join(fixture, 'scene.lettering.json'), join(dir, 'scene.lettering.json'));
  return dir;
}

test('every stored formula is glyph\'s own layout: fractions, scripts, radicals, large operators, matrices', () => {
  // Same font and same glyph commit as capture used, so a bumped pin cannot pass against old results
  assert.equal(snapshot.faces['latin-modern-math']!.hash, expected.font);
  assert.ok(snapshot.shaper.includes('glyph-math@' + expected.glyph.slice(0, 7)), snapshot.shaper);
  const sources = mathRuns.map(([key]) => JSON.parse(key)[1] as string).join(' ');
  for (const construct of ['\\frac', '^', '_', '\\sqrt', '\\sum', '\\int', 'pmatrix']) assert.ok(sources.includes(construct), construct);
  assert.ok(mathRuns.length >= 7);
  for (const [key, run] of mathRuns) {
    const [, tex, display] = JSON.parse(key) as [string, string, boolean];
    const e = expected.formulas.find((f) => f.tex === tex && f.display === display);
    assert.ok(e, `glyph's result for ${tex}`);
    assert.deepEqual([run.width, run.ascent, run.descent, run.s], [e.width, e.ascent, e.descent, e.s], tex);
    // Glyphs in font units scaled by s; rules (the fraction bars, the radical's vinculum) as rectangles
    assert.deepEqual(run.glyphs.filter((g) => g.gid >= 0).map((g) => [g.gid, g.x, g.dy, g.s, pathDigest(g.path)]),
      e.glyphs.map(([gid, x, y, k, path]) => [gid, x * e.s, y * e.s, k * e.s, path]), tex);
    assert.deepEqual(run.glyphs.filter((g) => g.gid < 0).map((g) => g.path), e.rules.map(([x, y, w, h]) => rect(x, y, w, h)), tex);
  }
});

test('the vendored typesetter gives upstream glyph\'s results for its 44-formula corpus and its error cases', { skip: noFont }, async () => {
  const font = await fontOf(await readFile(mathFont));
  assert.ok(expected.formulas.filter((f) => f.from.startsWith('glyph ')).length === 44);
  for (const f of expected.formulas) {
    const { tex, display, from: _, ...want } = f;
    assert.deepEqual(asJson(expectedOf(typeset, font, tex, display)), want, tex);
  }
  for (const e of expected.errors) assert.deepEqual(asJson(expectedOf(typeset, font, e.tex, false)), { error: e.error }, e.tex);
});

test('upstream glyph still gives the committed results', { skip: (!process.env.GLYPH_DIR && 'set GLYPH_DIR to a glyph checkout at the pinned commit') || noFont }, () => {
  execFileSync(process.execPath, [join(ROOT, 'tools/oracle/glyph-math.ts'), process.env.GLYPH_DIR!, mathFont, '--check'], { stdio: 'pipe' });
});

test('unsupported TeX fails closed with glyph\'s own error and source offset, and a page cannot draw it', async () => {
  // The page's subset of Latin Modern Math keeps the MATH table, enough to parse
  const subset = await fontOf(Uint8Array.from(Buffer.from(snapshot.faces['latin-modern-math']!.data, 'base64')));
  const tex = expected.errors.filter((e) => (e.error as { tag: string }).tag === 'Tex');
  for (const name of ['\\color', '\\phantom', '\\substack', '\\pmod', 'align', 'aligned', '\\foo'])
    assert.ok(tex.some((e) => JSON.stringify(e.error).includes(JSON.stringify(name).slice(1, -1))), name);
  for (const e of tex) {
    const r = typeset(subset, 'latin-modern-math', e.tex, { size: 1 });
    assert.equal(r.tag, 'Err', e.tex);
    assert.deepEqual((r as { error: unknown }).error, e.error, e.tex);
  }
  const provider = snapshotProvider(snapshot);
  for (const e of expected.errors) assert.throws(() => provider.math(e.tex, 1, false), /no run/, e.tex);
});

test('capture fails the build on unsupported TeX and names the error', { skip: noFont }, async () => {
  for (const [tex, error] of [
    ['\\\\begin{align}x\\\\end{align}', /UnknownEnvironment.*align/],
    ['\\\\color{red}{x}', /UnknownCommand.*color/],
    ['\\\\mathcal{a}', /MissingGlyph/],
  ] as const) {
    const dir = await variant('"\\\\frac{1}{2}+x^2"', `"${tex}"`, false);
    try { await assert.rejects(collectProject(dir, { captureLettering: true, write: false }), error); }
    finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('a formula changed without refreshing the snapshot fails before anything is drawn', async () => {
  const dir = await variant('"\\\\frac{1}{2}+x^2"', '"\\\\frac{1}{3}+x^2"', true);
  try {
    await assert.rejects(collectProject(dir, { write: false }), /stale lettering snapshot/);
    assert.throws(() => snapshotProvider(snapshot).math('\\frac{1}{3}+x^2', 1, false), /no run/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a display formula is typeset once, in display style', async () => {
  const display = mathRuns.map(([key]) => JSON.parse(key) as [string, string, boolean]).filter(([, , d]) => d);
  assert.ok(display.length >= 4);
  for (const [, tex] of display) assert.ok(!snapshot.runs[JSON.stringify(['math', tex, false])], `no inline run for ${tex}`);
  const built: { width: number; middle: number }[] = [];
  class Display extends Scene {
    override async construct() {
      for (const [, tex] of display) {
        const m = new MathTex(tex, { display: true }), f = m.frameBox;
        built.push({ width: m.run.width, middle: (f[1]! + f[3]!) / 2 });
      }
    }
  }
  await new (bindLettering(Display, snapshot))(new NullSink()).run();
  assert.deepEqual(built.map((b) => b.width), display.map(([, tex]) => snapshot.runs[JSON.stringify(['math', tex, true])]!.width * 0.4));
  // Display runs have their own metrics, but share Text's absolute origin
  // contract. The old assertion copied the constructor's ascent offset.
  for (const b of built) assert.ok(Math.abs(b.middle) < 1e-6, JSON.stringify(b));
});

test('morphs: TransformMatchingShapes and TransformMatchingText both pair a formula\'s glyphs by shape', async () => {
  const results: Record<string, unknown> = {};
  class Morphs extends Scene {
    override async construct() {
      const half = new MathTex('\\frac{1}{2}+x^2'), swapped = new MathTex('x^2+\\frac{1}{2}'), grown = new MathTex('x^2+\\frac{1}{2}+y^2');
      for (const [name, Kind, from, to] of [['shapes', TransformMatchingShapes, half, swapped], ['text', TransformMatchingText, swapped.copy(), grown]] as const) {
        const index = new Map<Mobject, number>([...from.children.map((g, i) => [g, i] as const), ...to.children.map((g, i) => [g, i] as const)]);
        const key = new Map<Mobject, string>([...from.children, ...to.children].map((g) => [g, (g as VMobject).shapeKey()]));
        this.add(from);
        const t = new Kind(from, to);
        t.begin();
        results[name] = { ...t.summary(), sameShapes: t.pairs.every(([a, b]) => key.get(a) === key.get(b)), pairs: t.pairs.map(([a, b]) => [index.get(a), index.get(b)]) };
        this.remove(from);
      }
    }
  }
  await new (bindLettering(Morphs, snapshot))(new NullSink()).run();
  // Glyphs are listed in reading order with the rules last: 1 2 + x 2 bar becomes x 2 + 1 2 bar. A shape key
  // ignores size, so the two 2s pair by distance: the denominator becomes x's exponent, and the exponent the denominator
  assert.deepEqual(results.shapes, { matched: 6, morphed: 0, removed: 0, added: 0, sameShapes: true, pairs: [[0, 3], [1, 1], [2, 2], [3, 0], [4, 4], [5, 5]] });
  // x 2 + 1 2 bar keeps every glyph and grows + y 2 at the end: the bar moves from 5th to 8th in the list
  assert.deepEqual(results.text, { matched: 6, morphed: 0, removed: 0, added: 3, sameShapes: true, pairs: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 8]] });
});

const noPython = (() => {
  try { execFileSync(process.env.RAYNER_LETTERING_PYTHON ?? 'python3', ['-c', 'import fontTools, brotli'], { stdio: 'pipe' }); return false; }
  catch { return 'set RAYNER_LETTERING_PYTHON to a Python with fonttools and brotli'; }
})();
test('the REFERENCE Maths example captures, checks and builds', { skip: noFont || noPython }, async () => {
  const doc = await readFile(join(ROOT, 'docs/REFERENCE.md'), 'utf8');
  const example = doc.slice(doc.indexOf('### Maths')).match(/```ts\n([\s\S]*?)```/)![1]!;
  assert.match(example, /lettering: \{ math: true \}/);
  const dir = await mkdtemp(join(tmpdir(), 'lettering-math-reference-'));
  try {
    await writeFile(join(dir, 'roots.ts'), example);
    const project = await collectProject(join(dir, 'roots.ts'), { captureLettering: true, write: false });
    const report = await checkProject(project, dir);
    assert.ok((report.lettering as { runs: number }).runs === 1);
    const { html } = await buildExplainer(project, join(dir, 'roots.html'));
    assert.ok(html.includes('GUST Font License'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the page draws the same maths paths as Node at every step', { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for the maths page in Chromium' }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lettering-math-browser-'));
  const project = await collectProject(fixture, { write: false });
  await buildExplainer(project, join(folder, 'math.html'));
  const server = await serve(folder, 0, 'math.html');
  const browser = await launch();
  try {
    const v = defaultVariant(project, {});
    assert.equal(v.trace.steps.length, 4);
    for (const step of v.trace.steps) {
      // The step's resting picture as the build draws it in Node, as the player's DomSink writes it
      const scene = await renderAt(v.Scene, restingTime(step, v.trace.fps), new SnapshotSink());
      const want = renderElements(scene, { relative: false }).filter((r) => r.tag === 'path').map((r) => String(r.attrs.d)).sort();
      const page = await browser.newPage();
      try {
        const errors: string[] = [];
        page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(`${server.url}/math.html?step=${step.step}`);
        await page.waitForSelector('[data-ready=true]');
        const live = () => page.locator('.stage').evaluate((s) => [...s.querySelectorAll('path')].map((p) => p.getAttribute('d')!).sort());
        await page.waitForFunction((n) => document.querySelectorAll('.stage path').length === n, want.length, { timeout: 10_000 });
        assert.ok(want.length >= 2, `${step.step}: paper and maths`);
        assert.deepEqual(await live(), want, `${step.step}: the live stage draws what Node drew`);
        assert.deepEqual(errors, [], step.step);
      } finally { await page.close(); }
    }
  } finally {
    await browser.close();
    server.close();
    await rm(folder, { recursive: true, force: true });
  }
});
