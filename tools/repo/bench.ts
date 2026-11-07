#!/usr/bin/env node
// Browser timing diagnostics on built explainer pages, BASE against HEAD.
//
//   npm run bench                              the working tree against origin/main
//   npm run bench -- --base <rev>              against another revision (HEAD: the uncommitted change alone)
//   npm run bench -- --reps 9 --cpu 1 --explainers mr-cache,exgit
//
// Both revisions' pages are built by their own `explain build` (BASE from a temporary git
// worktree), served side by side, and opened in turn, interleaved, in fresh browser contexts.
// Each opening loads a page, presses Next once, then jumps to the last step through the
// steps list, a step it has not seen. Absolute numbers on a shared machine move with whatever
// else runs, so there is no stored baseline: each metric's HEAD median is compared with BASE's
// from the same run (tools/repo/lib/bench-stats.ts), and a metric that looks slower is measured
// again; only a regression seen both times fails. Layout shift while stepping must be zero; content a
// reader opens with a disclosure on the way to the last step may push what is below it.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile, lstat, readlink, mkdir, writeFile } from 'node:fs/promises';
import { EXPLAINERS } from '../../scenes/explainers/catalog.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Browser } from 'playwright-core';
import { measure } from './lib/bench-measure.ts';
import type { Sample } from './lib/bench-measure.ts';
import { MIN_PAIRS, compare, order, verdict, worstShift } from './lib/bench-stats.ts';
import type { Comparison, Rule } from './lib/bench-stats.ts';
import { sha256 } from '../lib/hash.ts';
import { PHONE_VIEWPORT } from '../lib/review-sizes.ts';

const { values: flags } = parseArgs({
  options: {
    base: { type: 'string', default: 'origin/main' },
    reps: { type: 'string', default: '7' },
    cpu: { type: 'string', default: '4' },
    'read-ms': { type: 'string', default: '1000' },
    force: { type: 'boolean', default: false },
    // A short scene and a long one, native charts and captured diagrams; docs/REFERENCE.md says why these.
    explainers: { type: 'string', default: 'mr-cache,seasons,oauth-pkce,exgit' },
  },
});
const reps = Number(flags.reps),
  cpu = Number(flags.cpu),
  ids = flags.explainers.split(','),
  readMs = Number(flags['read-ms']);
if (!Number.isSafeInteger(reps) || reps < 1) throw new Error('--reps must be a positive safe integer');
if (!Number.isFinite(cpu) || cpu < 1) throw new Error('--cpu must be finite and at least 1');
// Playwright waits through Node timers, which reset an overflowing delay to 1 ms.
if (!Number.isFinite(readMs) || readMs < 0 || readMs > 2_147_483_647) throw new Error('--read-ms must be finite and between 0 and 2147483647');
if (new Set(ids).size !== ids.length || ids.some((id) => !EXPLAINERS.some((e) => e.id === id))) throw new Error('--explainers must name distinct catalog entries');
const [{ launch }, { ROOT }, { serve }] = await Promise.all([import('../lib/browser.ts'), import('../lib/explain-project.ts'), import('../lib/explain-serve.ts')]);
// A phone: the narrow stage opens each step on a close-up, so its layout work is measured too.
const VIEWPORT = PHONE_VIEWPORT;

const METRICS: { key: Exclude<keyof Sample, 'shift' | 'trace'>; label: string; rule: Rule }[] = [
  { key: 'ready', label: 'load → ready', rule: { rel: 0.1, floor: 100 } },
  { key: 'motion', label: 'Next → first stage write', rule: { rel: 0.25, floor: 40 } },
  // Mostly the step's authored motion, the same on both sides, so the relative part is small.
  { key: 'rest', label: 'Next → resting', rule: { rel: 0.03, floor: 100 } },
  { key: 'gap', label: 'Next: longest gap', rule: { rel: 0.5, floor: 50 } },
  { key: 'jump', label: 'jump to last step', rule: { rel: 0.2, floor: 60 } },
  { key: 'blocking', label: 'blocking (Next+jump)', rule: { rel: 0.25, floor: 60 } },
];


const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const short = (rev: string) => git('rev-parse', '--short', rev);
const baseSha = git('rev-parse', '--verify', `${flags.base}^{commit}`),
  headSha = git('rev-parse', 'HEAD'),
  dirty = git('status', '--porcelain') !== '';
const worktree = await mkdtemp(join(tmpdir(), 'rayner-bench-'));
const servers: { url: string; close(): void }[] = [];
let browser: Browser | undefined;
try {
  git('worktree', 'add', '--detach', '--quiet', worktree, baseSha);
  // BASE gets its own locked dependencies, including dependency-changing revisions.
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: worktree, stdio: ['ignore', 'ignore', 'inherit'] });
  const urls = { base: '', head: '' };
  const digest = sha256;
  const artifacts: Record<string, Record<string, string>> = { base: {}, head: {} };
  const locks: Record<string, string> = {};
  const packages: Record<string, string> = {};
  const dependencyTrees: Record<string, string> = {};
  await mkdir(join(ROOT, 'out/bench'), { recursive: true });
  for (const [side, source] of [['base', worktree], ['head', ROOT]] as const) {
    const out = join(ROOT, 'out/bench', side);
    dependencyTrees[side] = digest(execFileSync('npm', ['ls', '--all', '--json'], { cwd: source, encoding: 'utf8' }));
    locks[side] = digest(await readFile(join(source, 'package-lock.json')));
    packages[side] = digest(await readFile(join(source, 'package.json')));
    for (const id of ids) {
      execFileSync(process.execPath, ['tools/explain.ts', 'build', `scenes/explainers/${id}`, '--out', join(out, id + '.html')], { cwd: source, stdio: ['ignore', 'ignore', 'inherit'] });
      artifacts[side]![id] = digest(Buffer.concat([await readFile(join(out, id + '.html')), await readFile(join(out, id + '.html.headers.json'))]));
    }
    const server = await serve(out, 0, '');
    servers.push(server);
    urls[side] = server.url;
  }
  const identical = ids.filter((id) => artifacts.base![id] === artifacts.head![id]);
  const measured = flags.force ? ids : ids.filter((id) => !identical.includes(id));
  const untrackedPaths = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const untrackedHashes = Object.fromEntries(await Promise.all(untrackedPaths.map(async (path) => { const file = join(ROOT, path); return [path, digest((await lstat(file)).isSymbolicLink() ? await readlink(file) : await readFile(file))]; })));
  const provenance = { version: 2, base: baseSha, head: headSha, dirty, node: process.version, dependencyTrees, npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(), locks, packages, artifacts, reps, cpu, readMs, viewport: VIEWPORT, rules: METRICS, identical, forced: flags.force, headDiffHash: digest(git('diff', '--binary', 'HEAD')), untrackedHashes };
  if (!measured.length) {
    await writeFile(join(ROOT, 'out/bench/samples.json'), JSON.stringify({ ...provenance, outcome: 'identical artifacts; no browser timing claim', first: {}, again: {} }, null, 2) + '\n');
    console.log('Identical built pages and headers: skipped browser timings. Use --force for calibration.');
  } else {
  browser = await launch();
  console.log(
    `BASE ${flags.base} (${short(baseSha)}) against HEAD ${short(headSha)}${dirty ? ' with uncommitted changes' : ''}: ` +
      `${ids.join(', ')}; ${reps} interleaved pairs each; CPU ×${cpu}; ${VIEWPORT.width}×${VIEWPORT.height}; Chromium ${browser.version()}`,
  );
  /** `reps` interleaved pairs of openings of each explainer, BASE and HEAD in alternating order. */
  async function round(which: string[]) {
    const out = new Map(which.map((id) => [id, { base: [] as Sample[], head: [] as Sample[] }]));
    for (let rep = 0; rep < reps; rep++)
      for (const id of which) for (const side of order(rep)) out.get(id)![side].push(await measure(browser!, `${urls[side]}/${id}.html`, { cpu, readMs }));
    return out;
  }
  // One unrecorded opening of each side first: the browser's first pages are slower whichever they are.
  for (const id of measured) for (const side of ['base', 'head'] as const) await measure(browser, `${urls[side]}/${id}.html`, { cpu, readMs });
  const comparisons = (s: { base: Sample[]; head: Sample[] }) =>
    new Map(METRICS.map((m) => [m.key, compare(s.base.map((x) => x[m.key]), s.head.map((x) => x[m.key]), m.rule)]));
  const first = await round(measured);
  const results = new Map([...first].map(([id, s]) => [id, comparisons(s)]));
  const flagged = [...results].filter(([, c]) => [...c.values()].some((x) => x.regressed)).map(([id]) => id);
  const again = new Map<string, Map<string, Comparison>>(),
    second = flagged.length ? await round(flagged) : new Map<string, { base: Sample[]; head: Sample[] }>();
  if (flagged.length) console.log(`Slower on the first round: ${flagged.join(', ')}; measured ${flagged.length > 1 ? 'them' : 'it'} again.`);
  for (const [id, s] of second) again.set(id, comparisons(s));
  // Every sample, for a closer look than the medians below.
  const report = { ...provenance, browser: browser.version(), outcome: 'pending evaluation', first: Object.fromEntries(first), again: Object.fromEntries(second) };
  await writeFile(join(ROOT, 'out/bench/samples.json'), JSON.stringify(report, null, 1) + '\n');
  const pad = (s: string | number, n: number) => String(s).padEnd(n),
    num = (v: number) => String(Math.round(v)).padStart(7);
  console.log(`\n${pad('explainer', 12)}${pad('metric', 22)}   base ms   head ms   change          HEAD slower  verdict`);
  const failures: string[] = [];
  for (const [id, c] of results) {
    for (const m of METRICS) {
      const x = c.get(m.key)!,
        y = again.get(id)?.get(m.key),
        v = verdict(x, y);
      const change = `${x.delta >= 0 ? '+' : ''}${Math.round(x.delta)} (${x.delta >= 0 ? '+' : ''}${x.base ? Math.round((100 * x.delta) / x.base) : 0}%)`;
      console.log(
        `${pad(id, 12)}${pad(m.label, 22)}${num(x.base)}   ${num(x.head)}   ${pad(change, 16)}${pad(`${Math.round(x.slower * reps)}/${reps}`, 13)}` +
          `${v}${y ? ` (again: ${y.delta >= 0 ? '+' : ''}${Math.round(y.delta)} ms, ${Math.round(y.slower * reps)}/${reps})` : ''}`,
      );
      if (v === 'regression') failures.push(`${id} ${m.label}: ${Math.round(x.base)} → ${Math.round(x.head)} ms, again ${Math.round(y!.base)} → ${Math.round(y!.head)} ms`);
    }
    const shifts = first.get(id)!,
      worst = (side: 'base' | 'head') => worstShift(shifts[side].map((s) => s.shift), second.get(id)?.[side].map((s) => s.shift) ?? []);
    console.log(`${pad(id, 12)}${pad('layout shift', 22)}${worst('base').toFixed(3).padStart(7)}   ${worst('head').toFixed(3).padStart(7)}   (the worst opening; HEAD's must be 0)`);
    if (worst('head') > 0) failures.push(`${id}: stepping shifted the layout (score ${worst('head').toFixed(3)})`);
  }
  if (reps < MIN_PAIRS) console.log(`\nFewer than ${MIN_PAIRS} pairs: timings are shown, not judged; layout shift still is.`);
  if (failures.length) {
    console.log(`\nFAILED benchmark checks (layout shift, or a timing flag reproduced in two rounds):\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else if (reps < MIN_PAIRS) {
    console.log('INCONCLUSIVE: fewer than ' + MIN_PAIRS + ' pairs; no timing pass established.');
    process.exitCode = 2;
  } else console.log(`\nNo reproduced regression in the measured scenarios${flagged.length ? ' (some first-round flags did not reproduce)' : ''}; thresholds are a calibration heuristic.`);
  report.outcome = failures.length ? 'failed' : reps < MIN_PAIRS ? 'inconclusive' : 'no reproduced timing flag';
  await writeFile(join(ROOT, 'out/bench/samples.json'), JSON.stringify(report, null, 1) + '\n');
  }
} finally {
  const cleanup = await Promise.allSettled([
    Promise.resolve().then(() => browser?.close()),
    ...servers.map((s) => Promise.resolve().then(() => s.close())),
  ]);
  for (const result of cleanup) if (result.status === 'rejected') { console.error('Benchmark cleanup failed:', result.reason); process.exitCode = 1; }
  try {
    git('worktree', 'remove', '--force', worktree);
  } catch {
    await rm(worktree, { recursive: true, force: true });
    git('worktree', 'prune');
  }
}
