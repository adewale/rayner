// Rebuild vendor/glyph.js (loadFont + run) from a checkout of the glyph repo.
// The bundle stays JavaScript; vendor/glyph.d.ts types it by hand.
//   node tools/repo/vendor-glyph.ts ../glyph
import { build } from 'esbuild';
import { resolve } from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const repo = resolve(process.argv[2] ?? '');
if (!process.argv[2]) { console.error('usage: node tools/repo/vendor-glyph.ts <path to glyph repo>'); process.exit(2); }
// The revision vendor/glyph.pin.json records, and vendor/glyph-math.js is built from.
const REVISION = '6398654dfda7d5a91763e3ef07369b9a9d8e3b2b';
const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commit !== REVISION) throw new Error(`Use glyph commit ${REVISION}, not ${commit}; to move to another, update the pin and glyph-math together`);
// The bundle inlines two tables glyph generates rather than commits. Generate and check them in the
// glyph checkout first (node scripts/fetch.js --runtime, then --check --runtime).
for (const table of ['woff2/src/brotli-data.js', 'shape/src/ccc-data.js'])
  if (!existsSync(`${repo}/${table}`)) throw new Error(`${table} is missing: run node scripts/fetch.js --runtime in ${repo}`);
await build({
  stdin: { contents: `export { loadFont } from '${repo}/index.js';\nexport { run } from '${repo}/render/src/compose.js';`, resolveDir: repo },
  bundle: true, format: 'esm', platform: 'neutral', outfile: new URL('../../vendor/glyph.js', import.meta.url).pathname, logLevel: 'warning',
});
console.log('vendor/glyph.js rebuilt');
console.log('sha256:', createHash('sha256').update(await readFile(new URL('../../vendor/glyph.js', import.meta.url))).digest('hex'));
console.log(`Built from glyph ${REVISION}. Record the bytes and sha256 in vendor/glyph.pin.json deliberately.`);
