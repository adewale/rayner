// Runs the keyed motion check on the motion defect corpus (test/fixtures/motion-corpus/corpus.ts) and
// reports its recall: each entry's variant is built in a copy of the Poppy folders under out/ and
// checked in a process of its own, two at a time by default.
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
import { againstBaseline, entryEvidence, baseline, runEntry } from './motion-corpus-lib.ts';
import type { EntryResult } from './motion-corpus-lib.ts';
import { ROOT } from '../lib/roots.ts';

const SELF = fileURLToPath(import.meta.url);

/** Parse a completed worker, retaining readable partial observations for diagnosis only. */
export function workerResult(id: string, stdout: string, code: number | null, signal: string | null, stderr = ''): EntryResult {
  const failure = (error: string, partial?: EntryResult): EntryResult => ({id, caught: false, findings: partial?.findings ?? [], fresh: [], ms: partial?.ms ?? 0, status: 'error', error});
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); } catch { return failure(`worker ${id}: exit ${code}${signal ? ` (${signal})` : ''}: invalid JSON; ${stderr.slice(-2000)}`); }
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const found = (value: unknown) => {
    if (!object(value) || typeof value.scenario !== 'string' || typeof value.line !== 'string') return false;
    const o = value.observation;
    if (o === undefined) return true; // Historical textual diagnostics remain readable.
    if (!object(o)) return false;
    if (o.type === 'refusal') return ['duration guard', 'authored pacing guard'].includes(String(o.kind)) && typeof o.name === 'string' && typeof o.message === 'string' && (o.event === undefined || typeof o.event === 'string');
    return o.type === 'finding' && ['transition', 'kind', 'path', 'detail'].every(k => typeof o[k] === 'string') &&
      Array.isArray(o.subjects) && o.subjects.every(s => typeof s === 'string') &&
      (o.requirement === undefined || o.requirement === 'present' || o.requirement === 'absent') &&
      (o.victim === undefined || typeof o.victim === 'string') && (o.masks === undefined || (Array.isArray(o.masks) && o.masks.every(m => typeof m === 'string')));
  };
  if (!object(parsed) || parsed.id !== id || typeof parsed.caught !== 'boolean' || typeof parsed.ms !== 'number' || !Number.isFinite(parsed.ms) || parsed.ms < 0 ||
      !['complete', 'refused', 'error'].includes(String(parsed.status)) || !Array.isArray(parsed.findings) || !parsed.findings.every(found) ||
      !Array.isArray(parsed.fresh) || !parsed.fresh.every(found) || (parsed.attributed !== undefined && (!Array.isArray(parsed.attributed) || !parsed.attributed.every(found))) ||
      (parsed.error !== undefined && typeof parsed.error !== 'string')) return failure(`worker ${id}: invalid result schema or identity`);
  const result = parsed as unknown as EntryResult;
  if (code !== 0 || signal) return failure(`worker ${id}: exit ${code}${signal ? ` (${signal})` : ''}; ${stderr.slice(-2000)}`, result);
  if (result.status === 'error' && !result.error) return failure(`worker ${id}: failed without a reason`, result);
  if (result.status === 'refused' && !result.findings.some(f => f.observation?.type === 'refusal')) return failure(`worker ${id}: incomplete replay without a typed refusal`, result);
  const seen = new Set(result.findings.map(f => JSON.stringify(f)));
  if (result.fresh.some(f => !seen.has(JSON.stringify(f)))) return failure(`worker ${id}: fresh observations are absent from its findings`, result);
  return result;
}

/** One entry (or, for `base-<chapter>`, a chapter's baseline) run in a child process, so they run side by side, each on a fresh engine. */
export function runInChild(id: string, full = false): Promise<EntryResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--max-old-space-size=2048', SELF, '--entry', id, ...(full ? ['--full'] : [])], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20 * 60_000 });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; if (out.length > 64 * 1024 * 1024) child.kill(); });
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    child.on('error', error => resolve({id, caught: false, findings: [], fresh: [], ms: 0, status: 'error', error: `worker ${id}: ${error.message}`}));
    child.on('close', (code, signal) => resolve(workerResult(id, out, code, signal, err)));
  });
}

/**
 * Every entry of `entries`, `jobs` at a time, in the corpus's order, each against its chapter's
 * baseline, run first with every event: a finding the scene as it is already has is not the entry's.
 * With `bases: false` (the catalog's gate keeps each baseline free of findings) none is run.
 */
export async function runCorpus(entries: readonly CorpusEntry[], { jobs = 2, full = false, bases = true, progress }: { jobs?: number; full?: boolean; bases?: boolean; progress?: (r: EntryResult) => void } = {}) {
  if (!Number.isSafeInteger(jobs) || jobs < 1) throw new RangeError('jobs must be a positive integer');
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('corpus entries must have unique identities');
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
  if (baselines.length !== chapters.length || baselines.some((r, i) => r.id !== baseline(chapters[i]!).id)) throw new Error('incomplete baseline inventory');
  const byChapter = new Map(chapters.map((c, i) => [c, baselines[i]!] as const));
  const results = (await pool(entries.map((e) => e.id), full)).map((r, i) => {
    const entry = entries[i]!;
    if (r.id !== entry.id) throw new Error('incomplete variant inventory');
    return againstBaseline(r, byChapter.get(entry.chapter), entry.expectedFinding, entry.expectedRefusal);
  });
  for (const r of results) progress?.(r);
  return { results, baselines, comparison: bases ? 'baseline-subtracted' as const : 'variants-only' as const };
}

/** A score requires exactly one successful result per requested variant. Previously
 * measured cases use the historical any-finding metric; attributed cases must match. */
export function recall(entries: readonly CorpusEntry[], results: readonly EntryResult[]) {
  if (entries.length !== results.length || new Set(entries.map(e => e.id)).size !== entries.length || new Set(results.map(r => r.id)).size !== results.length)
    throw new Error('cannot score corpus: expected one result per unique entry');
  const byId = new Map(results.map(r => [r.id, r]));
  const byKind = new Map<string, { caught: number; of: number }>();
  let caught = 0;
  const evidence = {rejected: 0, attributedFindings: 0, declaredRefusals: 0, guardOnly: 0, unattributedWarnings: 0, exactTargets: 0, exactMatches: 0};
  for (const e of entries) {
    const r = byId.get(e.id);
    if (!r) throw new Error(`cannot score corpus: missing result for ${e.id}`);
    if (r.error || r.status === 'error') throw new Error(`cannot score corpus: ${e.id}: ${r.error ?? 'incomplete worker'}`);
    const k = byKind.get(e.kind) ?? { caught: 0, of: 0 };
    k.of++;
    const observed = entryEvidence(e, r.fresh);
    if (observed.rejected) evidence.rejected++;
    if (observed.attributed.length) evidence.attributedFindings++;
    if (observed.declared.length) evidence.declaredRefusals++;
    if (observed.guardOnly) evidence.guardOnly++;
    if (observed.warnings && !observed.attributed.length) evidence.unattributedWarnings++;
    if (observed.expected) { evidence.exactTargets++; if (observed.caught) evidence.exactMatches++; }
    if (observed.caught) {
      k.caught++;
      caught++;
    }
    byKind.set(e.kind, k);
  }
  return { caught, of: entries.length, byKind: Object.fromEntries(byKind), evidence };
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
  const { results, baselines, comparison } = await runCorpus(entries, { jobs: Number(values.jobs ?? 2), full: values.full, progress: (r) => {
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
