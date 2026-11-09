// Real bold and italic on request (meta.lettering.styles): Text with weight 'bold' draws the
// face's Bold cut instead of a stroked Regular, ItalicText draws the Italic cut, and both are
// shaped at build time into the outline snapshot like any other requested lettering. A scene
// that asks for neither keeps the faux bold, byte for byte (test/lettering-outlines.test.ts).
import { sfntBase64 } from '../tools/lib/woff2.ts';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Scene, Text, ItalicText, MathTex, shaperFor } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import { bindLettering, runKey, snapshotProvider, unpackLettering } from '../src/lettering-outlines.ts';
import type { LetteringSnapshot } from '../src/lettering-outlines.ts';
import { collectProject, ROOT } from '../tools/lib/explain-project.ts';
import { buildExplainer } from '../tools/lib/explain-build.ts';
import { checkProject } from '../tools/lib/explain-check.ts';
import { licenceOf, validateLetteringSnapshot } from '../tools/lib/lettering-validation.ts';
import { letteringLicences, pageSnapshot, validateLettering } from '../tools/lib/lettering.ts';
import { htmlEscape } from '../explain/trace.ts';
import { textRun } from '../src/text.ts';

const fixture = join(ROOT, 'test/lettering/styles');
const folder = await mkdtemp(join(tmpdir(), 'rayner-lettering-styles-'));
after(() => rm(folder, { recursive: true, force: true }));
const stored = async (): Promise<LetteringSnapshot> => unpackLettering(JSON.parse(await readFile(join(fixture, 'scene.lettering.json'), 'utf8')));

/** The scene's only Text, built under `snapshot`. */
async function built(snapshot: LetteringSnapshot, make: () => Text): Promise<Text> {
  let made: Text | undefined;
  class One extends Scene {
    override async construct() { made = make(); this.add(made); }
  }
  await new (bindLettering(One, snapshot))(new NullSink()).run();
  return made!;
}
const outline = (t: Text) => t.children.map((g) => [...(g as unknown as { subpaths: Float32Array[] }).subpaths.flatMap((a) => [...a])].join(' ')).join('|');

test('bold Text draws the stored Bold cut, with no faux-bold stroke, and recolours without one', async () => {
  const s = await stored();
  const bold = await built(s, () => new Text('Bold', { weight: 'bold', fontSize: 0.6, color: '#112233' }));
  const run = s.runs[runKey('sans/bold', 'Bold')]!;
  assert.ok(run, 'the snapshot holds the bold run');
  assert.ok(Math.abs(bold[textRun].width - run.width * 0.6) < 1e-9, 'laid out on the Bold cut\'s advances');
  for (const g of bold.children) assert.equal(g.style.stroke, 'none', 'real bold has no stroke');
  bold.setFill('#445566');
  for (const g of bold.children) assert.equal(g.style.stroke, 'none', 'recolouring keeps it unstroked');
  // The faux bold of a scene that asked for nothing: the Regular outline, stroked
  await loadFonts();
  const faux = new Text('Bold', { weight: 'bold', fontSize: 0.6, color: '#112233' });
  assert.notEqual(faux.children[0]!.style.stroke, 'none');
  assert.ok(Math.abs(faux[textRun].width - shaperFor('sans')('Bold', 0.6).width) < 1e-9);
  assert.notEqual(outline(bold), outline(faux));
});

test('bold maths keeps its faux stroke: a formula is drawn from its own run, with no cut', async () => {
  const math: LetteringSnapshot = unpackLettering(JSON.parse(await readFile(join(ROOT, 'test/lettering/math/scene.lettering.json'), 'utf8')));
  const both = { ...math, request: { ...math.request, styles: ['bold'] as const } };
  const formula = await built(both, () => new MathTex('\\frac{1}{2}+x^2', { weight: 'bold', color: '#112233' }));
  assert.ok(formula.children.length > 0);
  for (const g of formula.children) assert.equal(g.style.stroke, '#112233', 'the Regular maths outline keeps the stroke that fakes bold');
});

test('ItalicText draws the Italic and Bold Italic cuts; Arabic in it stays upright', async () => {
  const s = await stored();
  const italic = await built(s, () => new ItalicText('Italic', { fontSize: 0.6 }));
  assert.ok(Math.abs(italic[textRun].width - s.runs[runKey('sans/italic', 'Italic')]!.width * 0.6) < 1e-9);
  const both = await built(s, () => new ItalicText('Bold italic', { fontSize: 0.6, weight: 'bold' }));
  assert.ok(Math.abs(both[textRun].width - s.runs[runKey('sans/bold-italic', 'Bold italic')]!.width * 0.6) < 1e-9);
  for (const g of both.children) assert.equal(g.style.stroke, 'none');
  // Noto Naskh Arabic has no italic: the italic run uses the regular cut's glyphs,
  // and the bold run the Bold cut's, which are other outlines
  const upright = s.runs[runKey('sans/italic', 'مرحبا')]!, heavy = s.runs[runKey('sans/bold', 'مرحبا')]!;
  assert.ok(upright && heavy);
  assert.notDeepEqual(upright.glyphs.map((g) => g.path), heavy.glyphs.map((g) => g.path));
});

test('ItalicText fails the build unless the scene asked for italic', async () => {
  const s = await stored();
  await loadFonts();
  assert.throws(() => new ItalicText('x'), /new ItalicText\(\): it needs meta\.lettering\.styles to include 'italic'/);
  const boldOnly = { ...s, request: { ...s.request, styles: ['bold'] as const } };
  await assert.rejects(built(boldOnly, () => new ItalicText('Italic')), /new ItalicText\(\): it needs/);
});

test('a bold count replays its intermediate values in the Bold cut', async () => {
  const s = await stored();
  const replay = snapshotProvider(s);
  await replay.prepare!();
  await loadFonts();
  const fallback = () => { throw new Error('a bold value fell back to the regular face'); };
  const mid = replay.shape('sans', '4.7', 1, fallback, 'bold');
  assert.ok(mid.width > shaperFor('sans')('4.7', 1).width, 'bold digits are wider than regular ones');
  assert.throws(() => replay.shape('sans', 'An unseen bold caption', 1, fallback, 'bold'), /no run/);
});

test('the styles fixture passes check, and its page carries only the cuts it decodes', async () => {
  const project = await collectProject(fixture, { write: false });
  const report = await checkProject(project, folder);
  const weight = report.lettering as { bytes: number; pageBytes: number; faceBytes: Record<string, number> };
  assert.ok(weight.pageBytes > 0 && weight.pageBytes < weight.bytes);
  const { html } = await buildExplainer(project, join(folder, 'styles.html'));
  const s = project.outlineLettering!;
  // The bold counter shapes in the Bold cut at runtime, so the page needs that subset, and so
  // does the bold "const x = 1;", a numeric template; nothing shapes in the italic cut there,
  // so its outlines are in the runs and its subset stays out.
  // The page carries its subsets as SFNT (tools/lib/woff2.ts), not as the committed WOFF2.
  assert.ok(html.includes(sfntBase64(s.faces['inter/bold']!.data).slice(0, 200)));
  assert.ok(!html.includes(s.faces['inter/bold']!.data.slice(0, 200)));
  assert.ok(!html.includes(sfntBase64(s.faces['inter/italic']!.data).slice(0, 200)));
  assert.deepEqual(Object.keys((await pageSnapshot(s)).faces), ['inter/bold', 'jetbrains-mono/bold', 'noto-naskh-arabic/bold']);
  // Each distinct licence once: Inter, JetBrains Mono and Noto are three notices for six faces
  assert.equal(letteringLicences(s).length, 3);
  for (const notice of letteringLicences(s))
    assert.equal(html.split(htmlEscape(notice)).length - 1, 1, 'each notice is in the licence block once');
});

test('requests name real styles only', () => {
  assert.throws(() => validateLettering({ styles: [] }), /non-empty/);
  assert.throws(() => validateLettering({ styles: ['oblique' as 'bold'] }), /meta\.lettering: "oblique" is not a style/);
  assert.throws(() => validateLettering({ styles: ['bold', 'bold'] }), /twice/);
  validateLettering({ styles: ['bold', 'italic'], faces: { sans: 'eb-garamond', mono: 'jetbrains-mono' } });
});

test('only OFL and Apache-2.0 faces pass, at capture and in every build from a snapshot', async () => {
  const ofl = await readFile(join(ROOT, 'vendor/licenses/Inter-OFL.txt'), 'utf8');
  assert.equal(licenceOf(ofl), 'OFL-1.1');
  assert.equal(licenceOf('Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/'), 'Apache-2.0');
  assert.equal(licenceOf('Copyright Example Foundry. All rights reserved.'), undefined);
  assert.equal(licenceOf(await readFile(join(ROOT, 'vendor/licenses/LatinModernMath-GUST.txt'), 'utf8')), undefined);
  // A snapshot whose face says otherwise fails
  const dir = await mkdtemp(join(folder, 'licence-'));
  await copyFile(join(fixture, 'scene.ts'), join(dir, 'scene.ts'));
  const s = await stored();
  s.faces['inter/bold']!.license = 'Copyright Example Foundry. All rights reserved.';
  assert.throws(() => validateLetteringSnapshot(s), /inter\/bold is not under the OFL or Apache-2.0/);
  await writeFile(join(dir, 'scene.lettering.json'), JSON.stringify(s, null, 2) + '\n');
  await assert.rejects(collectProject(dir, { write: false }), /not under the OFL or Apache-2.0/);
});

const capture = process.env.EXPLAIN_LETTERING === '1';
const fonts = process.env.RAYNER_LETTERING_FONTS ?? join(ROOT, 'out/lettering-fonts');
for (const [family, text, file, features] of [
  ['sans/bold', 'Bold', 'inter-ui-4.1.1/package/web/Inter-Bold.woff2', {}],
  ['sans/italic', 'Italic', 'inter-ui-4.1.1/package/web/Inter-Italic.woff2', {}],
  ['sans/bold-italic', 'Bold italic', 'inter-ui-4.1.1/package/web/Inter-BoldItalic.woff2', {}],
  ['mono/bold', 'const x = 1;', 'jetbrains-mono-1.0.6/package/fonts/webfonts/JetBrainsMono-Bold.woff2', { liga: false, clig: false, calt: false }],
  ['sans/bold', 'مرحبا', 'fontsource-noto-naskh-arabic-5.3.0/package/files/noto-naskh-arabic-arabic-700-normal.woff2', {}],
  ['sans/italic', 'مرحبا', 'fontsource-noto-naskh-arabic-5.3.0/package/files/noto-naskh-arabic-arabic-400-normal.woff2', {}],
] as const) test(`${family} ${text}: stored glyphs agree with HarfBuzz on that cut`, { skip: !capture && 'set EXPLAIN_LETTERING=1 for the build-time oracle' }, async () => {
  const s = await stored();
  const expected = JSON.parse(execFileSync(process.env.RAYNER_LETTERING_PYTHON ?? 'python3',
    [join(ROOT, 'test/lettering/oracle.py'), join(fonts, file), text, JSON.stringify(features)], { encoding: 'utf8' }));
  const actual = s.runs[runKey(family, text)]!.glyphs;
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) for (const k of ['gid', 'cluster', 'x', 'dx', 'dy', 'ax'] as const)
    assert.ok(Math.abs(actual[i]![k] - expected[i][k]) < 1e-12, `${i}.${k}: ${actual[i]![k]} vs ${expected[i][k]}`);
});

test('a face without the asked cut fails capture, naming it; a script without Bold cannot draw bold', { skip: !capture && 'set EXPLAIN_LETTERING=1 to capture' }, async () => {
  const scene = (lettering: string, body: string) => `import{Scene,Text}from'rayner';export default class L extends Scene{static meta={id:'cut',lettering:${lettering}};async construct(){await this.step('one');this.add(${body});await this.wait(1);}}`;
  const dir = await mkdtemp(join(folder, 'cut-'));
  await writeFile(join(dir, 'scene.ts'), scene(`{faces:{sans:'noto-sans-hebrew'},scripts:['Hebr'],styles:['italic']}`, `new (await import('rayner')).ItalicText('שלום')`));
  await assert.rejects(collectProject(dir, { captureLettering: true, write: false }), /noto-sans-hebrew has no italic cut/);
  await writeFile(join(dir, 'scene.ts'), scene(`{scripts:['Hebr'],styles:['bold','italic']}`, `new (await import('rayner')).ItalicText('שלום',{weight:'bold'})`));
  const hebrew = await collectProject(dir, { captureLettering: true, write: false });
  assert.ok(hebrew.outlineLettering!.faces['noto-sans-hebrew/bold'], 'Hebrew bold italic stands in with the Bold cut');
  // A cut carries only what it drew: bold Latin beside regular Arabic leaves the Arabic Bold cut out
  await writeFile(join(dir, 'scene.ts'), scene(`{scripts:['Arab'],styles:['bold']}`, `new Text('Total 12',{weight:'bold'}),new Text('مرحبا')`));
  const latin = await collectProject(dir, { captureLettering: true, write: false });
  assert.ok(latin.outlineLettering!.faces['inter/bold']);
  assert.equal(latin.outlineLettering!.faces['noto-naskh-arabic/bold'], undefined, 'the Arabic Bold cut drew nothing, so it is left out');
  // Noto Sans SC has no Bold cut in the registry, so bold Chinese has no face (LETTERING_CJK=1 fetches it)
  if (!existsSync(join(fonts, 'noto-sans-sc.ttf'))) return;
  await writeFile(join(dir, 'scene.ts'), scene(`{scripts:['Hani'],styles:['bold']}`, `new Text('中文',{weight:'bold'})`));
  await assert.rejects(collectProject(dir, { captureLettering: true, write: false }), /noto-sans-sc has no bold cut/);
});

test('capture of the styles fixture is deterministic', { skip: !capture && 'set EXPLAIN_LETTERING=1 to capture' }, async () => {
  const project = await collectProject(fixture, { captureLettering: true, write: false });
  assert.deepEqual(project.outlineLettering, await stored());
});
