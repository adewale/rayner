// glyph's own maths results, from upstream source, for test/browser/lettering-math.test.ts.
//   node tools/oracle/glyph-math.ts <glyph checkout> <latinmodern-math.otf> [--check]
// The checkout must be the pinned commit, with `node scripts/fetch.js --runtime` run in it
// (that generates the two data modules glyph does not commit). This imports glyph's
// unbundled math/src/typeset.js and sfnt/src/font.js, not Rayner's vendor/glyph-math.js, so the
// file it writes is a check on the vendored bundle and on the stored outlines.
// Formulas: glyph's own 44-formula corpus (verify/math-corpus.js, each in its own style) and
// every formula the maths fixture stores. Errors: glyph's own error cases
// (math/test/tex.test.js) and the constructs its README lists as not done.
// --check compares with the committed file instead of writing it.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const GLYPH_COMMIT = '6398654dfda7d5a91763e3ef07369b9a9d8e3b2b';
export const LMM_SHA256 = '6075562b771f8b82f0c179e363389684f2dd09de30038269e2628e504bd7be0f';
/** glyph's math/test/tex.test.js, "errors are typed values with source offsets", and its README's "Not done". */
export const UNSUPPORTED = [
  'x+\\foo', 'x^a^b', 'x_a_b', "x^2'", '{x', 'x}', '\\frac{a}', '\\left( x', 'x\\right)', '\\left\\foo x\\right)',
  '\\begin{align}x\\end{align}', '\\begin{matrix}x\\end{pmatrix}', 'x\\limits', '\\not x', 'a & b', '$x$',
  '\\phantom{x}', '\\color{red}{x}', '\\substack{i<n}', 'a\\pmod{n}', '\\begin{aligned}x\\end{aligned}', '\\mathcal{a}',
];
/** A path's identity, short enough to keep the expected results small. */
export const pathDigest = (path: unknown): string => createHash('sha256').update(JSON.stringify(path)).digest('hex').slice(0, 16);
export interface Expected {
  glyph: string;
  font: string;
  formulas: { tex: string; display: boolean; from: string; width: number; ascent: number; descent: number; s: number;
    glyphs: [gid: number, x: number, y: number, k: number, path: string][]; rules: [x: number, y: number, w: number, h: number][] }[];
  errors: { tex: string; error: unknown }[];
}
type Typeset<F> = (font: F, key: string, tex: string, o: { size: number; display: boolean }) =>
  { tag: 'Ok'; value: { width: number; ascent: number; descent: number; s: number; glyphs: { gid: number; x: number; y: number; k: number; path: unknown }[]; rules: { x: number; y: number; w: number; h: number }[] } } | { tag: 'Err'; error: unknown };

/** One typeset result in the expected file's shape. */
export function expectedOf<F>(typeset: Typeset<F>, font: F, tex: string, display: boolean) {
  const r = typeset(font, 'latin-modern-math', tex, { size: 1, display });
  if (r.tag !== 'Ok') return { error: r.error };
  const { width, ascent, descent, s } = r.value;
  return { width, ascent, descent, s,
    glyphs: r.value.glyphs.map((g) => [g.gid, g.x, g.y, g.k, pathDigest(g.path)] as [number, number, number, number, string]),
    rules: r.value.rules.map((q) => [q.x, q.y, q.w, q.h] as [number, number, number, number]) };
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const EXPECTED = join(ROOT, 'test/lettering/glyph-math.json');

async function main(): Promise<void> {
  const [repoArg, fontArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!repoArg || !fontArg) throw new Error('usage: node tools/oracle/glyph-math.ts <glyph checkout> <latinmodern-math.otf> [--check]');
  const repo = resolve(repoArg);
  const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (commit !== GLYPH_COMMIT) throw new Error(`Use glyph commit ${GLYPH_COMMIT}, not ${commit}`);
  const bytes = await readFile(fontArg);
  if (createHash('sha256').update(bytes).digest('hex') !== LMM_SHA256) throw new Error('Latin Modern Math checksum mismatch');
  const at = (p: string) => import(pathToFileURL(join(repo, p)).href);
  const { loadFont } = await at('sfnt/src/font.js');
  const { typeset } = await at('math/src/typeset.js') as { typeset: Typeset<unknown> };
  const { CORPUS } = await at('verify/math-corpus.js') as { CORPUS: { id: string; display: boolean; tex: string }[] };
  const loaded = await loadFont(new Uint8Array(bytes));
  if (loaded.tag !== 'Ok') throw new Error('glyph cannot load the font: ' + JSON.stringify(loaded.error));
  const font = loaded.value;
  const fixture = JSON.parse(await readFile(join(ROOT, 'test/lettering/math/scene.lettering.json'), 'utf8')) as { runs: Record<string, unknown> };
  const wanted = new Map<string, { tex: string; display: boolean; from: string }>();
  for (const c of CORPUS) wanted.set(JSON.stringify([c.tex, c.display]), { tex: c.tex, display: c.display, from: `glyph verify/math-corpus.js ${c.id}` });
  for (const key of Object.keys(fixture.runs)) {
    const [family, tex, display] = JSON.parse(key) as [string, string, boolean];
    if (family !== 'math') continue;
    const k = JSON.stringify([tex, display]);
    if (!wanted.has(k)) wanted.set(k, { tex, display, from: 'test/lettering/math' });
  }
  const formulas: Expected['formulas'] = [];
  for (const w of wanted.values()) {
    const r = expectedOf(typeset, font, w.tex, w.display);
    if ('error' in r) throw new Error(`glyph cannot typeset ${w.tex}: ${JSON.stringify(r.error)}`);
    formulas.push({ ...w, ...r });
  }
  const errors = UNSUPPORTED.map((tex) => {
    const r = expectedOf(typeset, font, tex, false);
    if (!('error' in r)) throw new Error(`glyph typesets ${tex}; it is not an unsupported case`);
    return { tex, error: r.error };
  });
  const out = JSON.stringify({ glyph: GLYPH_COMMIT, font: LMM_SHA256, formulas, errors } satisfies Expected) + '\n';
  if (process.argv.includes('--check')) {
    if (await readFile(EXPECTED, 'utf8') !== out) throw new Error('test/lettering/glyph-math.json differs from upstream glyph; rerun without --check');
    console.log('glyph-math.json matches upstream glyph');
  } else {
    await writeFile(EXPECTED, out);
    console.log(`wrote ${formulas.length} formulas and ${errors.length} errors to test/lettering/glyph-math.json`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
