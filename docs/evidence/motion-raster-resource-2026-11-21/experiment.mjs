// Run from the repository root: node docs/evidence/motion-raster-resource-2026-11-21/experiment.mjs equality|sync|async [rounds]
// Inputs are preserved in the audit workspace; their decoded SVG hashes are pinned in inputs.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
const resvg = createRequire(resolve('package.json'))('@resvg/resvg-js');
const selected = JSON.parse(fs.readFileSync(new URL('./inputs.json', import.meta.url)));
const sha = value => createHash('sha256').update(value).digest('hex');
const opts = {font: {loadSystemFonts: false}}, mode = process.argv[2], rounds = Number(process.argv[3] ?? 1);
if (!['equality', 'sync', 'async'].includes(mode)) throw new Error('Choose equality, sync or async');
const inputs = selected.map(({file, svgSha256}) => {
  const svg = zlib.gunzipSync(fs.readFileSync(file)).toString();
  if (sha(svg) !== svgSha256) throw new Error('Changed input: ' + file);
  return {file, svg, svgSha256};
});
const start = performance.now(), samples = [], baseline = process.memoryUsage(), equality = [];
let count = 0, bytes = 0, checksum = 0, stopped;
if (mode === 'equality') {
  for (const {file, svg, svgSha256} of inputs) {
    const a = new resvg.Resvg(svg, opts).render(), b = await resvg.renderAsync(svg, opts);
    const ap = a.pixels, bp = b.pixels, png = a.asPng();
    if (a.width !== b.width || a.height !== b.height || !ap.equals(bp) || !png.equals(b.asPng())) throw new Error('Mismatch ' + file);
    equality.push({file, svgSha256, width: a.width, height: a.height, pixelsSha256: sha(ap), pngSha256: sha(png)});
    count++;
  }
} else {
  outer: for (let round = 0; round < rounds; round++) for (const {svg} of inputs) {
    const rendered = mode === 'sync' ? new resvg.Resvg(svg, opts).render() : await resvg.renderAsync(svg, opts);
    const pixels = rendered.pixels;
    bytes += pixels.length; checksum = (checksum + pixels[0] + pixels[pixels.length - 1]) >>> 0; count++;
    if (count % 20 === 0) {
      const sample = {count, ...process.memoryUsage()}; samples.push(sample);
      if (sample.rss > 1.5 * 1024 ** 3) {stopped = 'rss safety ceiling'; break outer;}
    }
  }
}
process.stdout.write(JSON.stringify({mode, count, inputs: inputs.length, ...(stopped ? {stopped} : {}), baseline,
  final: process.memoryUsage(), maxRssKiB: process.resourceUsage().maxRSS, samples, bytes, checksum,
  ms: performance.now() - start, ...(equality.length ? {equality} : {})}) + '\n');
