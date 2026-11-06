// Rebuild vendor/glyph.js (loadFont + run) from a checkout of the glyph repo.
// The bundle stays JavaScript; vendor/glyph.d.ts types it by hand.
//   node tools/repo/vendor-glyph.ts ../glyph
import { build } from 'esbuild';
import { resolve } from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const repo = resolve(process.argv[2] ?? '');
if (!process.argv[2]) { console.error('usage: node tools/repo/vendor-glyph.ts <path to glyph repo>'); process.exit(2); }
await build({
  stdin: { contents: `export { loadFont } from '${repo}/index.js';\nexport { run } from '${repo}/render/src/compose.js';`, resolveDir: repo },
  bundle: true, format: 'esm', platform: 'neutral', outfile: new URL('../../vendor/glyph.js', import.meta.url).pathname, logLevel: 'warning',
});
console.log('vendor/glyph.js rebuilt');
console.log('sha256:', createHash('sha256').update(await readFile(new URL('../../vendor/glyph.js', import.meta.url))).digest('hex'));
console.log('Review the source revision and update vendor/glyph.pin.json deliberately.');
