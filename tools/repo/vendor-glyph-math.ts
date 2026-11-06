// Rebuild the OPTIONAL build-time TeX typesetter. The reader consumes outlines,
// not this bundle. Keep the ordinary glyph bundle and font data unchanged.
// node tools/repo/vendor-glyph-math.ts /path/to/glyph
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const repo = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: node tools/repo/vendor-glyph-math.ts <glyph checkout>');
const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commit !== '6398654dfda7d5a91763e3ef07369b9a9d8e3b2b') throw new Error('Use glyph commit 6398654dfda7d5a91763e3ef07369b9a9d8e3b2b');
// Reuse exactly the combining-class table already shipped by Rayner's glyph.
// That table carries HarfBuzz/Unicode data; do not manufacture or drop it.
const source = await readFile(new URL('../../vendor/glyph.js', import.meta.url), 'utf8');
const ccc = source.match(/var CCC_RANGES = Object.freeze\(\[[\s\S]*?\]\);/)?.[0];
if (!ccc) throw new Error('Cannot find the existing glyph combining-class table');
await build({
  absWorkingDir: repo,
  stdin: { contents: `export { typeset } from '../math/src/typeset.js';`, resolveDir: repo },
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: new URL('../../vendor/glyph-math.js', import.meta.url).pathname,
  logLevel: 'warning',
  plugins: [{ name: 'math-only', setup(b) {
    b.onResolve({ filter: /ccc-data\.js$/ }, () => ({ path: 'ccc', namespace: 'existing-glyph-table' }));
    b.onLoad({ filter: /.*/, namespace: 'existing-glyph-table' }, () => ({ contents: ccc.replace('var CCC_RANGES', 'export const CCC_RANGES'), loader: 'js' }));
    // placeMath is not exported. Its renderer-only affine helper is unreachable;
    // mark that import pure so the renderer and WOFF2 decoder are not bundled.
    b.onResolve({ filter: /render\/src\/compose\.js$/ }, () => ({ path: 'unused-placement', external: true, sideEffects: false }));
  } }],
});
