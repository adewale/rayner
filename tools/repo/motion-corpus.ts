// Runs the keyed motion check on the motion defect corpus (test/fixtures/motion-corpus/corpus.ts) and
// reports its recall: each entry's variant is built in a copy of the Poppy folders under out/ and
// checked in a process of its own, four at a time.
//
//   node tools/repo/motion-corpus.ts                 every entry; writes out/motion-corpus.json
//   node tools/repo/motion-corpus.ts --only a,b      the entries named
//   node tools/repo/motion-corpus.ts --jobs 2        two processes at a time
//   node tools/repo/motion-corpus.ts --full          every event's transitions, as rayner check plays them,
//                                                    not only each entry's own events (several times slower)
//   node tools/repo/motion-corpus.ts --entry a       one entry, its result as JSON on stdout (what the others run)
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import type { CorpusEntry } from '../../test/fixtures/motion-corpus/corpus.ts';
import { againstBaseline, attributedFindings, baseline, runEntry } from './motion-corpus-lib.ts';
import type { EntryResult } from './motion-corpus-lib.ts';
import { ROOT } from '../lib/roots.ts';

const SELF = fileURLToPath(import.meta.url);

/** One entry (or, for `base-<chapter>`, a chapter's baseline) run in a child process, so they run side by side, each on a fresh engine. */
export function runInChild(id: string, full = false): Promise<EntryResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SELF, '--entry', id, ...(full ? ['--full'] : [])], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      try { resolve(JSON.parse(out) as EntryResult); } catch { resolve({ id, caught: false, findings: [], fresh: [], ms: 0, error: `exit ${code}: ${err.slice(-2000)}` }); }
    });
  });
}

/**
 * Every entry of `entries`, `jobs` at a time, in the corpus's order, each against its chapter's
 * baseline, run first with every event: a finding the scene as it is already has is not the entry's.
 * With `bases: false` (the catalog's gate keeps each baseline free of findings) none is run.
 */
export async function runCorpus(entries: readonly CorpusEntry[], { jobs = 4, full = false, bases = true, progress }: { jobs?: number; full?: boolean; bases?: boolean; progress?: (r: EntryResult) => void } = {}) {
  if (!Number.isSafeInteger(jobs) || jobs < 1) throw new RangeError('jobs must be a positive integer');
  const pool = async (ids: readonly string[], fullRun: boolean) => {
    const out = new Array<EntryResult>(ids.length);
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const i = next++;
        out[i] = await runInChild(ids[i]!, fullRun);
      }
    };
    await Promise.all(Array.from({ length: Math.min(jobs, ids.length) }, worker));
    return out;
  };
  const chapters = bases ? [...new Set(entries.map((e) => e.chapter))] : [];
  const baselines = await pool(chapters.map((c) => baseline(c).id), true);
  const byChapter = new Map(chapters.map((c, i) => [c, baselines[i]!] as const));
  const results = (await pool(entries.map((e) => e.id), full)).map((r, i) => {
    const entry = entries[i]!;
    return againstBaseline(r, byChapter.get(entry.chapter), entry.expectedFinding);
  });
  for (const r of results) progress?.(r);
  return { results, baselines, comparison: bases ? 'baseline-subtracted' as const : 'variants-only' as const };
}

/** A score requires exactly one successful result per requested variant. Previously
 * measured cases use the historical any-finding metric; attributed cases must match. */
export function recall(entries: readonly CorpusEntry[], results: readonly EntryResult[]) {
  if (entries.length !== results.length || new Set(entries.map(e => e.id)).size !== entries.length)
    throw new Error('cannot score corpus: expected one result per unique entry');
  const byId = new Map(results.map(r => [r.id, r]));
  const byKind = new Map<string, { caught: number; of: number }>();
  let caught = 0;
  for (const e of entries) {
    const r = byId.get(e.id);
    if (!r) throw new Error(`cannot score corpus: missing result for ${e.id}`);
    if (r.error) throw new Error(`cannot score corpus: ${e.id}: ${r.error}`);
    const k = byKind.get(e.kind) ?? { caught: 0, of: 0 };
    k.of++;
    if (e.expectedFinding ? attributedFindings(r.fresh, e.expectedFinding).length > 0 : r.caught) {
      k.caught++;
      caught++;
    }
    byKind.set(e.kind, k);
  }
  return { caught, of: entries.length, byKind: Object.fromEntries(byKind) };
}

if (process.argv[1] === SELF) {
  const { values } = parseArgs({ options: { entry: { type: 'string' }, only: { type: 'string' }, jobs: { type: 'string' }, out: { type: 'string' }, full: { type: 'boolean' } } });
  if (values.entry) {
    const entry = values.entry.startsWith('base-') ? baseline(values.entry.slice(5)) : CORPUS.find((e) => e.id === values.entry);
    if (!entry) throw new RangeError(`no corpus entry ${JSON.stringify(values.entry)}`);
    // Exit once the result is written: a large one, written to a pipe, is cut short by an exit before it drains.
    const result = JSON.stringify(await runEntry(entry, { full: values.full }));
    process.stdout.write(result, () => process.exit(0));
  } else await main(values);
}

async function main(values: { only?: string; jobs?: string; out?: string; full?: boolean }) {
  const only = values.only?.split(',');
  const entries = only ? CORPUS.filter((e) => only.includes(e.id)) : CORPUS;
  if (only && entries.length !== only.length) throw new RangeError(`no corpus entries ${only.filter((id) => !CORPUS.some((e) => e.id === id)).join(', ')}`);
  const { results, baselines, comparison } = await runCorpus(entries, { jobs: Number(values.jobs ?? 4), full: values.full, progress: (r) => {
    const e = CORPUS.find((x) => x.id === r.id)!;
    console.error(`${r.error ? 'ERROR ' : r.caught ? 'caught' : 'missed'}  ${e.kind.padEnd(22)} ${r.id} (${(r.ms / 1000).toFixed(1)} s, ${r.fresh.length} of ${r.findings.length} findings its own)${r.error ? `\n${r.error.split('\n').slice(0, 3).join('\n')}` : ''}`);
  } });
  for (const b of baselines) if (b.error || b.findings.length) console.error(`baseline ${b.id}: ${b.error ?? `${b.findings.length} findings in the scene as it is`}`);
  const summary = results.some(r => r.error) ? null : recall(entries, results);
  const out = values.out ?? join(ROOT, 'out', 'motion-corpus.json');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ summary, comparison, baselines, results }, null, 1));
  if (summary) console.log(JSON.stringify(summary, null, 1));
  else {
    console.error('Incomplete corpus run. The report contains the errors and observations for each entry.');
    process.exitCode = 1;
  }
  console.log(`Each entry's findings: ${out}`);
}
