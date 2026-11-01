// Run against the exact catalog output, after demos:check. Timing is a 4x-CPU
// Chromium surrogate on localhost, never a claim about a physical phone.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpus} from 'node:os';
import {join} from 'node:path';
import {launch} from './lib/browser.ts';
import {serve} from './lib/explain-serve.ts';
import {measure} from './lib/bench-measure.ts';
import {median} from './lib/bench-stats.ts';
import {buildInputs} from './lib/build-inputs.ts';
import {pageSize, PAGE_BUDGET} from './lib/page-budget.ts';

const root = 'out/explainers', cpu = 4, repetitions = 3, readyLimitMs = 8000;
const current = await buildInputs(process.cwd());
const server = await serve(root, 0, 'mr-cache.html');
const browser = await launch();
try {
  const rows = [];
  // Requested lettering exercises a separate startup path and is currently the largest page.
  for (const id of ['mr-cache', 'token-bucket', 'tailwind-gamut', 'font-metrics']) {
    const inputs = JSON.parse(await readFile(join(root, id, 'inputs.json'), 'utf8'));
    assert.equal(inputs.buildHash, current.hash, `${id}: run demos:check after changing build inputs`);
    const html = await readFile(join(root, id + '.html'), 'utf8');
    const receipt = JSON.parse(await readFile(join(root, id + '.html.receipt.json'), 'utf8'));
    assert.equal(createHash('sha256').update(html).digest('hex'), receipt.artifactHash);
    const samples = [];
    for (let i = 0; i < repetitions; i++) samples.push(await measure(browser, `${server.url}/${id}.html`, {cpu, readMs: 50}));
    const medianReadyMs = median(samples.map(s => s.ready));
    rows.push({id, artifactHash: receipt.artifactHash, ...pageSize(html), medianReadyMs, samples});
  }
  const report = {version: 1, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), browser: browser.version(), cpuModel: cpus()[0]?.model, viewport: {width: 390, height: 844}, cpuSlowdown: cpu, repetitions, readyLimitMs, pageBudget: PAGE_BUDGET, network: 'localhost; no network throttling', limitation: 'Synthetic CPU slowdown; not physical iPhone or low-end-device performance.', rows};
  await mkdir('out/validation', {recursive: true});
  await writeFile('out/validation/page-budgets.json', JSON.stringify(report, null, 2) + '\n');
  for (const row of rows) assert.ok(row.medianReadyMs <= readyLimitMs, `${row.id}: median startup ${row.medianReadyMs.toFixed(0)}ms exceeds ${readyLimitMs}ms at ${cpu}x CPU slowdown`);
  console.log(JSON.stringify(rows.map(({id, bytes, gzipBytes, medianReadyMs}) => ({id, bytes, gzipBytes, medianReadyMs})), null, 2));
} finally { await browser.close(); server.close(); }
