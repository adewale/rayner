import {createRequire, registerHooks, stripTypeScriptTypes} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root = process.cwd();
if (process.env.RAYNER_ROUTE_HELPER_BEFORE) {
  const target = pathToFileURL(resolve(root, 'scenes/explainers/lib/route-ink/fidelity.ts')).href;
  const source = stripTypeScriptTypes(readFileSync(resolve(root, process.env.RAYNER_ROUTE_HELPER_BEFORE), 'utf8'));
  registerHooks({load(url, context, nextLoad) {
    if (url === target) return {format: 'module', source, shortCircuit: true};
    return nextLoad(url, context);
  }});
}

const require = createRequire(import.meta.url), native = require('@resvg/resvg-js');
const NativeResvg = native.Resvg, nativeAsync = native.renderAsync;
const sequence = createHash('sha256');
const began = performance.now();
let syncConstructors = 0, syncRenders = 0, asyncStarted = 0, asyncCompleted = 0, inFlight = 0, peakInFlight = 0;
function record(svg) { sequence.update(createHash('sha256').update(svg).digest()); }
function receipt(complete) {
  writeFileSync(`${process.env.RAYNER_NATIVE_RECEIPT}.${process.pid}.json`, JSON.stringify({
    complete, pid: process.pid, node: process.version, beforeHelper: !!process.env.RAYNER_ROUTE_HELPER_BEFORE,
    syncConstructors, syncRenders, asyncStarted, asyncCompleted, inFlight, peakInFlight,
    maxRssKiB: process.resourceUsage().maxRSS, currentRssBytes: process.memoryUsage().rss,
    elapsedMs: performance.now() - began, renderInputSequenceSha256: sequence.copy().digest('hex'),
  }, null, 2) + '\n');
}
native.Resvg = class extends NativeResvg {
  constructor(svg, options) { super(svg, options); syncConstructors++; record(svg); }
  render() { syncRenders++; if (syncRenders % 100 === 0) receipt(false); return super.render(); }
};
native.renderAsync = async function(svg, options, signal) {
  asyncStarted++; record(svg); inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
  try { const image = await nativeAsync(svg, options, signal); asyncCompleted++; return image; }
  finally { inFlight--; if (asyncStarted % 100 === 0) receipt(false); }
};
process.on('exit', () => receipt(true));
