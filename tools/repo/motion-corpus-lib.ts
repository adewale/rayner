// The motion defect corpus (test/fixtures/motion-corpus/corpus.ts): each entry brings back one motion
// defect that filming the Poppy series found and `rayner check` passed (issue #101, item 14), as a few
// text edits to the Poppy scenes. This builds each variant on the fly, in a copy of the Poppy folders
// under out/, and checks keyed motion and authored travel rules, so the corpus costs the repository a
// few kilobytes of edits rather than a copy of eight explainers per defect.
//
// The recall measurement (runEntry) edits a frozen copy of the Poppy folders
// (test/fixtures/motion-corpus/poppy/), so its numbers change only when the checks do: redesigning a
// current scene cannot move them. Tools about today's scenes (the current audit, the native proofs,
// the SignIn contracts) build from scenes/explainers/ with `from: 'current'`.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { keyedMotionLine } from '../../src/internal.ts';
import { loadFonts } from '../../explain/testing.ts';
import { exploreMachines, keyedMotionSink } from '../lib/explain-check.ts';
import { collectProject } from '../lib/explain-project.ts';
import { ROOT } from '../lib/roots.ts';
import type { CorpusEntry, Edit } from '../../test/fixtures/motion-corpus/corpus.ts';

/** The folders a variant copies: every Poppy chapter (they import each other's models) and the shared kit. */
export const POPPY_FOLDERS = ['lib', 'poppy', 'poppy-browser', 'poppy-conversations', 'poppy-coverage', 'poppy-discovery', 'poppy-refusals', 'poppy-sessions', 'poppy-sign-in'] as const;
/** Where a variant's Poppy folders come from: the corpus's frozen copy, or the scenes as they are now. */
export type VariantSource = 'frozen' | 'current';
/** The frozen copy the recall corpus edits, relative to the root (see its README). */
export const FROZEN_POPPY = 'test/fixtures/motion-corpus/poppy';
export const poppySource = (from: VariantSource) => from === 'frozen' ? FROZEN_POPPY : 'scenes/explainers';

/** One finding: the scenario's settings, and the line `rayner check` prints for it (`<transition>: <kind>: part “key” …`). */
export type Observation =
  | { type: 'finding'; transition: string; kind: string; path: string; subjects: string[]; detail: string; requirement?: 'present' | 'absent' | 'clear'; victim?: string; masks?: string[] }
  | { type: 'refusal'; kind: 'duration guard' | 'authored pacing guard'; name: string; message: string; event?: string };
export interface Found { scenario: string; line: string; observation?: Observation }

let fonts: ReturnType<typeof loadFonts> | undefined;
/**
 * Every keyed motion and authored travel finding in `file`, as `rayner check` would make them, without the
 * check's other gates and without its cap of eight: each play of each scenario's run, and every
 * transition a reader can press from every reachable state; with `events`, only those events'
 * transitions (a subset of the check's findings, so what it catches the check catches).
 */
export async function keyedMotionFindings(file: string, events?: readonly string[], observed: Found[] = []): Promise<Found[]> {
  await (fonts ??= loadFonts());
  const project = await collectProject(file, { write: false });
  const out = observed;
  for (const v of project.scenarios) {
    const scenario = JSON.stringify(v.values);
    const sink = keyedMotionSink();
    const playback = new v.Scene(sink);
    const keep = (line: string, finding?: Parameters<typeof keyedMotionLine>[0]) => out.push(found(scenario, line, finding));
    let ran;
    try { ran = await sink.rules.during(playback, () => playback.run()); }
    finally {
      for (const line of sink.rules.findings) keep(line);
      for (const f of sink.finish()) keep(`${f.segment}: ${keyedMotionLine(f)}`, f);
    }
    await exploreMachines(ran, v.Scene, undefined, { events, onMotion: keep });
  }
  return out;
}

/** `text` with each edit made; an edit whose `find` is not there exactly once does not apply to these scenes. */
export function applyEdits(text: string, edits: readonly Edit[], where: string): string {
  for (const e of edits) {
    const n = text.split(e.find).length - 1;
    if (n !== 1) throw new Error(`${where}: the corpus edit's text is found ${n} times, not once, so it does not apply to these scenes; the recall corpus edits the frozen copy (${FROZEN_POPPY}), which changes only for a deliberate migration:\n${e.find}`);
    text = text.replace(e.find, () => e.replace);
  }
  return text;
}

/** What a variant is built from: an entry, or a chapter with no edits (its baseline). */
export type Variant = Pick<CorpusEntry, 'id' | 'chapter' | 'edits' | 'events' | 'expectedRefusal'>;
/** The baseline of `chapter`: its frozen scene with no edits, which the full corpus run requires to be free of findings. */
export const baseline = (chapter: string): Variant => ({ id: `base-${chapter}`, chapter, edits: [] });

/**
 * Builds a variant: the Poppy folders, from the frozen copy or the current scenes, copied to
 * out/motion-corpus-<id>/ (three levels below the root, as scenes/explainers/<id>/ is, so the scenes'
 * relative imports resolve) with its edits made. Returns the path of the edited chapter's scene.
 */
export async function buildVariant(entry: Variant, root = ROOT, { from = 'current' }: { from?: VariantSource } = {}): Promise<string> {
  const dir = join(root, 'out', `motion-corpus-${entry.id}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const f of POPPY_FOLDERS) await cp(join(root, poppySource(from), f), join(dir, f), { recursive: true });
  const byFile = new Map<string, Edit[]>();
  for (const e of entry.edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
  for (const [file, edits] of byFile) {
    const path = join(dir, file);
    await writeFile(path, applyEdits(await readFile(path, 'utf8'), edits, `${entry.id}, ${file}`));
  }
  return join(dir, entry.chapter, 'scene.ts');
}

/** Normalize older textual receipts at ingestion; new results carry these fields as JSON. */
export function observationOf(f: Found): Observation | undefined {
  if (f.observation) return f.observation;
  const contract = /^(.*): motion contract: during "([^"]+)", (.*)$/.exec(f.line);
  if (contract) {
    const detail = contract[3]!.replace(/ at \+[\d.]+ s$/, '');
    const requirement = /must be (present|absent)(?: |$)/.exec(detail)?.[1] as 'present' | 'absent' | undefined;
    const clearance = /^text subject "([^"]+)" must remain clear$/.exec(detail);
    return {type: 'finding', transition: contract[1]!, kind: 'motion contract', path: contract[2]!, detail,
      subjects: [...detail.matchAll(/"([^"]*)"/g)].map(m => m[1]!), ...(requirement ? {requirement} : {}),
      ...(clearance ? {requirement: 'clear', victim: clearance[1]!, masks: [contract[2]!]} : {})};
  }
  const m = /^(.*?): ([a-z ]+): part “(.*?)”(?: \((.*?)\))? at [\d.]+ s (.*)$/.exec(f.line);
  if (!m) return undefined;
  const detail = m[5]!.split('; fix: ')[0]!;
  return {type: 'finding', transition: m[1]!, kind: m[2]!, path: m[4] ?? m[3]!, detail,
    subjects: [...detail.matchAll(/“([^”]*)”/g)].map(m => m[1]!)};
}
function found(scenario: string, line: string, finding?: Parameters<typeof keyedMotionLine>[0]): Found {
  const observation = observationOf({scenario, line});
  if (observation?.type === 'finding' && finding) {
    if (finding.victim) observation.victim = finding.victim;
    if (finding.masks) observation.masks = [...finding.masks];
    if (finding.text && !observation.subjects.includes(finding.text)) observation.subjects.push(finding.text);
  }
  return {scenario, line, ...(observation ? {observation} : {})};
}

/** Identity keeps both the covered subject and foreground, while omitting timing/measurements. */
export function findingId(f: Found): string {
  const item = observationOf(f);
  if (!item) return JSON.stringify([f.scenario, f.line]);
  if (item.type === 'refusal') return JSON.stringify([f.scenario, item]);
  return JSON.stringify([f.scenario, item.transition, item.kind, item.path, item.subjects, item.victim, item.masks,
    ...(item.kind === 'motion contract' ? [item.detail] : [])]);
}

const matches = (pattern: RegExp, text: string) => { pattern.lastIndex = 0; return pattern.test(text); };
/** Fresh evidence for entries with a filmed, attributed observation. */
export function attributedFindings(fresh: readonly Found[], expected: NonNullable<CorpusEntry['expectedFinding']>): Found[] {
  return fresh.filter(f => {
    const item = observationOf(f);
    return item?.type === 'finding' && f.scenario === expected.scenario && item.kind === expected.kind && item.path === expected.path &&
      matches(expected.transition, item.transition) && expected.subjects.every(name => item.subjects.includes(name)) &&
      (expected.requirement === undefined || item.requirement === expected.requirement);
  });
}
export function expectedRefusals(fresh: readonly Found[], expected: NonNullable<CorpusEntry['expectedRefusal']>): Found[] {
  return fresh.filter(f => {
    const item = observationOf(f);
    return item?.type === 'refusal' && item.kind === expected.kind && item.name === expected.name && matches(expected.message, item.message);
  });
}
/** The legacy rejection count is separate from the cases with a predeclared exact target. */
export function entryEvidence(entry: Pick<CorpusEntry, 'expectedFinding' | 'expectedRefusal'>, fresh: readonly Found[]) {
  const warnings = fresh.filter(f => observationOf(f)?.type === 'finding');
  const refusals = fresh.filter(f => observationOf(f)?.type === 'refusal');
  const attributed = entry.expectedFinding ? attributedFindings(warnings, entry.expectedFinding) : [];
  const declared = entry.expectedRefusal ? expectedRefusals(refusals, entry.expectedRefusal) : [];
  const rejected = warnings.length + refusals.length > 0;
  const expected = !!(entry.expectedFinding || entry.expectedRefusal);
  return {rejected, expected, caught: expected ? attributed.length + declared.length > 0 : rejected,
    attributed, declared, warnings: warnings.length > 0, guardOnly: refusals.length > 0 && warnings.length === 0};
}

/**
 * What the check makes of one variant: every finding in it, and of those the ones its chapter's
 * baseline does not have (`fresh`). Entries with an expected observation count only
 * matches in `attributed`; the historical metric counts any fresh finding.
 */
export interface EntryResult {
  id: string;
  /** Derived display field; scoring always recomputes from observations and expectations. */
  caught: boolean;
  findings: Found[]; fresh: Found[]; attributed?: Found[]; ms: number; error?: string;
  /** New worker results distinguish an exhausted run from a typed early refusal. */
  status?: 'complete' | 'refused' | 'error';
}

/** Only a declared error type and exact authored reason establish this refusal. */
export function authoredRefusal(entry: Variant, error: unknown): Found | undefined {
  const expected = entry.expectedRefusal;
  if (!expected || !(error instanceof Error) || error.name !== expected.name) return;
  expected.message.lastIndex = 0;
  if (!expected.message.test(error.message)) return;
  return {scenario: 'during authored replay', line: `${expected.kind}: ${error.message}`, observation: {type: 'refusal', kind: expected.kind, name: error.name, message: error.message}};
}

/** Reader exploration adds step context using Error.cause. Inspect that typed chain;
 * a wrapper's message alone never establishes a production duration refusal. */
export function guardRefusal(entry: Variant, error: unknown): Found | undefined {
  const seen = new Set<Error>();
  for (let current = error; current instanceof Error && !seen.has(current); current = current.cause) {
    seen.add(current);
    let found = authoredRefusal(entry, current);
    if (!found && current instanceof RangeError && /^machine\.send\(".*"\): authored transition lasts [\d.]+ s but the event allows [\d.]+ s;/.test(current.message))
      found = {scenario: 'during guarded execution', line: `duration guard: ${current.message}`, observation: {type: 'refusal', kind: 'duration guard', name: current.name, message: current.message, event: /^machine\.send\("(.*)"\)/.exec(current.message)?.[1]}};
    if (found) return current === error ? found : {...found, scenario: 'during guarded execution'};
  }
}
/** `full`: every event's transitions, as `rayner check`; otherwise only the entry's `events`. Built from the frozen copy. */
export async function runEntry(entry: Variant, { full = false, root = ROOT }: { full?: boolean; root?: string } = {}): Promise<EntryResult> {
  const t = Date.now(), observations: Found[] = [];
  try {
    const file = await buildVariant(entry, root, { from: 'frozen' });
    const findings = await keyedMotionFindings(file, full ? undefined : entry.events, observations);
    return { id: entry.id, status: 'complete', caught: findings.length > 0, findings, fresh: findings, ms: Date.now() - t };
  } catch (e) {
    const refusal = guardRefusal(entry, e);
    if (refusal) {
      const findings = [...observations, refusal];
      return {id: entry.id, status: 'refused', caught: true, findings, fresh: findings, ms: Date.now() - t};
    }
    return { id: entry.id, status: 'error', caught: false, findings: observations, fresh: [], ms: Date.now() - t, error: String((e as Error)?.stack ?? e) };
  } finally {
    await rm(join(root, 'out', `motion-corpus-${entry.id}`), { recursive: true, force: true });
  }
}

/** `result` with the findings its chapter's baseline (run with every event) also has taken out of `fresh`. */
export function againstBaseline(result: EntryResult, base: EntryResult | undefined, expected?: CorpusEntry['expectedFinding'], refusal?: CorpusEntry['expectedRefusal']): EntryResult {
  // A failed baseline (including a duration guard that ended its replay early)
  // cannot establish which findings are new. Keep the observations for diagnosis.
  if (base?.error || base?.status === 'refused' || base?.findings.some(f => observationOf(f)?.type === 'refusal' || /^(?:duration guard|authored pacing guard): /.test(f.line))) {
    const why = base.error ?? 'a duration guard stopped its replay';
    return { ...result, fresh: [], caught: false, error: [result.error, `${base.id}: ${why}`].filter(Boolean).join('\n') };
  }
  if (result.error) return { ...result, fresh: [], caught: false };
  const known = new Set(base?.findings.map(findingId));
  const fresh = base ? result.findings.filter(f => !known.has(findingId(f))) : result.findings;
  const evidence = entryEvidence({expectedFinding: expected, expectedRefusal: refusal}, fresh);
  return { ...result, fresh, ...(evidence.expected ? {attributed: [...evidence.attributed, ...evidence.declared]} : {}), caught: evidence.caught };
}
