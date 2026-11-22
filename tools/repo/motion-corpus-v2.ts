// Separate prospective evaluation. Does not replay scenes or change historical recall.
// node tools/repo/motion-corpus-v2.ts --input out/motion-corpus.json --out out/prospective-v2
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import { PROSPECTIVE_V2_VISUAL } from '../../test/fixtures/motion-corpus/prospective-v2-visual.ts';
import type { FindingTarget, ProspectiveCase, RefusalTarget, Target } from '../../test/fixtures/motion-corpus/prospective-v2.ts';
import { againstBaseline, entryEvidence } from './motion-corpus-lib.ts';
import type { EntryResult, Found } from './motion-corpus-lib.ts';
import { workerResult } from './motion-corpus.ts';

export type VisualVerdict = 'confirmed' | 'editorial' | 'not-visually-reproduced' | 'blocked' | 'inconclusive' | 'secondary-only';
/** Independent visual review, never inferred from a rejection or its absence.
 * confirmedTargets explicitly identifies observations supported by the cited images;
 * a case-level confirmation alone cannot confirm a newly substituted victim. */
export interface VisualReview {
  id: string; run: string; reviewer: string; verdict: VisualVerdict; evidence: string[];
  note: string; confirmedTargets: string[];
}
/** These chapter owners measure native reader output or pixels, independently of
 * diagnostic matching. Receipt producer must run the named positive/inverse checks.
 * Supplying source paths alone, or a quiet detector, establishes nothing. */
export const CHAPTER_KEEPERS = [
  {id: 'sessions-too-long', owner: 'scenes/explainers/poppy-sessions/oracle/fidelity.ts',
    fixed: 'pacing', inverse: 'durations: Long exact historical slowdown', scope: '2.850 s ticket checks and 3.900 s key transfers on the actual reader clock'},
  {id: 'sign-in-collect-too-long', owner: 'scenes/explainers/poppy-sign-in/fidelity.ts',
    fixed: 'collectionPacing', inverse: 'collectionSlowdown', scope: 'both flows; actual collect response <=4.5 s and rejection of exact 4.8 s inverse'},
  {id: 'sign-in-tokens-over-labels', owner: 'tools/repo/motion-held-token-proof.ts',
    fixed: 'normal held-token routes', inverse: 'enlarged historical held-token routes', scope: 'both directions on held-device history; six named words; enlarged inverse remains clear by construction'},
] as const;
export interface ChapterReceipt {
  id: string; owner: string; run: string; evidence: string[];
  fixed: {name: string; passed: boolean}; inverse: {name: string; passed: boolean};
}
export interface V2Input {
  results: EntryResult[]; baselines: EntryResult[];
  /** Binds reviews/keepers and worker receipts to one capture, not a code snapshot pin. */
  run: string;
  sourceRevision?: string;
  sourcePolicy?: string;
  reviews?: VisualReview[];
  chapterReceipts?: ChapterReceipt[];
}
const testPattern = (pattern: RegExp, value: string) => {pattern.lastIndex = 0; return pattern.test(value);};

/** Only existing structured observations can satisfy v2; printed prose is diagnostic context. */
export function matchesFinding(found: Found, target: FindingTarget): boolean {
  const o = found.observation;
  return o?.type === 'finding' && found.scenario === target.scenario && o.kind === target.kind &&
    o.path === target.path && testPattern(target.transition, o.transition) &&
    target.subjects.every(subject => o.subjects.includes(subject)) &&
    (target.requirement === undefined || o.requirement === target.requirement) &&
    (target.victim === undefined || o.victim === target.victim) &&
    (target.masks === undefined || target.masks.every(mask => o.masks?.includes(mask)));
}
export function matchesPrevention(found: Found, target: RefusalTarget): boolean {
  const o = found.observation;
  return o?.type === 'refusal' && o.kind === target.kind && o.name === target.name &&
    (target.event === undefined || o.event === target.event) && testPattern(target.message, o.message);
}
function unique<T extends {id: string}>(rows: readonly T[], label: string): Map<string, T> {
  const map = new Map(rows.map(row => [row.id, row]));
  if (map.size !== rows.length) throw new Error(`v2 ${label}: duplicate identity`);
  return map;
}
function exactly(actual: Iterable<string>, expected: readonly string[], label: string) {
  const values = [...actual];
  if (values.length !== expected.length || values.some(id => !expected.includes(id)))
    throw new Error(`v2 ${label}: missing or unexpected inventory (expected ${expected.length}, received ${values.length})`);
}
function checked(row: EntryResult): EntryResult {
  // Retain the existing worker schema/failure contract; never trust caught/fresh.
  return workerResult(row.id, JSON.stringify(row), 0, null);
}
function serializeTarget(target: Target) {
  const finding = target.finding && {...target.finding, transition: target.finding.transition.source};
  const prevention = target.prevention && {...target.prevention, message: target.prevention.message.source};
  return {...target, ...(finding ? {finding} : {}), ...(prevention ? {prevention} : {})};
}

export function assessV2(input: V2Input, manifest: readonly ProspectiveCase[] = PROSPECTIVE_V2_VISUAL) {
  if (!input.run?.trim()) throw new Error('v2 requires a named capture run');
  const entries = unique(manifest, 'manifest');
  exactly(entries.keys(), CORPUS.map(e => e.id), 'manifest');
  const results = unique(input.results, 'workers');
  exactly(results.keys(), [...entries.keys()], 'workers');
  const chapters = [...new Set(CORPUS.map(entry => entry.chapter))];
  const baselines = unique(input.baselines, 'baselines');
  exactly(baselines.keys(), chapters.map(chapter => `base-${chapter}`), 'baselines');
  const targets = manifest.flatMap(entry => entry.targets.map(target => target.version));
  if (new Set(targets).size !== targets.length) throw new Error('v2 duplicate target version');
  const reviews = unique(input.reviews ?? [], 'reviews');
  for (const review of reviews.values()) {
    const entry = entries.get(review.id);
    if (!entry || review.run !== input.run || !review.reviewer.trim() || !review.note.trim() || !review.evidence.length || review.evidence.some(e => !e.trim()) ||
      !['confirmed', 'editorial', 'not-visually-reproduced', 'blocked', 'inconclusive', 'secondary-only'].includes(review.verdict) ||
      new Set(review.confirmedTargets).size !== review.confirmedTargets.length ||
      review.confirmedTargets.some(version => !entry.targets.some(target => target.version === version)) ||
      (['not-visually-reproduced', 'blocked', 'inconclusive'].includes(review.verdict) && review.confirmedTargets.length)) throw new Error(`v2 invalid independent review for ${review.id}`);
  }
  const chapterReceipts = unique(input.chapterReceipts ?? [], 'chapter receipts');
  for (const receipt of chapterReceipts.values()) {
    const keeper = CHAPTER_KEEPERS.find(keeper => keeper.id === receipt.id);
    if (!keeper || receipt.run !== input.run || receipt.owner !== keeper.owner || receipt.fixed.name !== keeper.fixed || receipt.inverse.name !== keeper.inverse ||
      typeof receipt.fixed.passed !== 'boolean' || typeof receipt.inverse.passed !== 'boolean' || !receipt.evidence.length || receipt.evidence.some(e => !e.trim())) throw new Error(`v2 invalid chapter receipt for ${receipt.id}`);
  }
  const bases = new Map([...baselines].map(([id, row]) => [id, checked(row)]));
  const rows = manifest.map(entry => {
    const original = CORPUS.find(original => original.id === entry.id)!;
    const base = bases.get(`base-${original.chapter}`)!;
    const worker = checked(results.get(entry.id)!);
    const baselineOK = base.status === 'complete' && !base.error;
    const result = baselineOK ? againstBaseline(worker, base) : {...worker, error: base.error ?? 'baseline replay incomplete', fresh: []};
    const usable = baselineOK && !result.error && (result.status === 'complete' || result.status === 'refused');
    const review = reviews.get(entry.id);
    const assessed = entry.targets.map(target => {
      const findingMatch = usable && !!target.finding && result.fresh.some(found => matchesFinding(found, target.finding!));
      const preventionMatch = usable && !!target.prevention && result.fresh.some(found => matchesPrevention(found, target.prevention!));
      const independentlyConfirmed = !!review?.confirmedTargets.includes(target.version);
      const outcome = !usable ? 'blocked-worker' : preventionMatch ? 'relevant-typed-prevention' :
        !independentlyConfirmed ? 'unassessed' : findingMatch ? 'target-matched-diagnosis' :
        result.status === 'refused' ? 'blocked-replay' : 'target-miss';
      return {...serializeTarget(target), findingMatch, preventionMatch, independentlyConfirmed, outcome,
        matchedFindings: usable && target.finding ? result.fresh.filter(found => matchesFinding(found, target.finding!)) : [],
        matchedPreventions: usable && target.prevention ? result.fresh.filter(found => matchesPrevention(found, target.prevention!)) : []};
    });
    const chapter = chapterReceipts.get(entry.id);
    const chapterPrevention = chapter?.fixed.passed === true && chapter.inverse.passed === true;
    const raw = usable ? entryEvidence(original, result.fresh) : undefined;
    return {id: entry.id, claim: entry.claim, source: entry.source, usable,
      workerStatus: result.status, ...(result.error ? {error: result.error, partialObservations: worker.findings} : {}),
      visualVerdict: review?.verdict ?? 'inconclusive', review: review ?? null,
      diagnosisAssessment: !entry.targets.some(target => target.finding) ? 'unassessed-no-target' :
        assessed.some(target => target.outcome === 'target-matched-diagnosis') ? 'target-matched-diagnosis' :
        assessed.some(target => target.outcome === 'target-miss') ? 'target-miss' : 'unassessed',
      targets: assessed, chapterPrevention, chapterReceipt: chapter ?? null,
      warningCount: usable ? result.fresh.filter(found => found.observation?.type === 'finding').length : 0,
      rawRejected: raw?.rejected ?? false, legacyCredited: raw?.caught ?? false,
      unresolved: entry.unresolved ?? null};
  });
  const observations = rows.flatMap(row => row.targets);
  const complete = rows.every(row => row.usable);
  return {schema: 'motion-prospective-v2', run: input.run, complete,
    sourceRevision: input.sourceRevision ?? 'unspecified',
    sourcePolicy: input.sourcePolicy ?? 'No final-source assessment is established by this input.',
    policy: 'Specific target matches, typed prevention, independent chapter prevention and visual verdicts are separate evidence. Missing targets/reviews are unassessed. This is not accuracy.',
    prospective: {
      registeredCases: manifest.length, registeredObservations: observations.length,
      initialRegisteredObservations: observations.filter(target => !target.version.includes('@visual-')).length,
      independentVisualAdditions: observations.filter(target => target.version.includes('@visual-')).length,
      registeredFindingTargets: observations.filter(target => target.finding).length,
      registeredPreventionTargets: observations.filter(target => target.prevention).length,
      independentlyConfirmedFindingTargets: observations.filter(target => target.finding && target.independentlyConfirmed).length,
      assessedFindingTargets: observations.filter(target => ['target-matched-diagnosis', 'target-miss'].includes(target.outcome)).length,
      targetMatchedDiagnoses: observations.filter(target => target.outcome === 'target-matched-diagnosis').length,
      diagnosesWithinSecondaryCases: rows.filter(row => row.visualVerdict === 'secondary-only').flatMap(row => row.targets).filter(target => target.outcome === 'target-matched-diagnosis').length,
      diagnosesWithinEditorialCases: rows.filter(row => row.visualVerdict === 'editorial').flatMap(row => row.targets).filter(target => target.outcome === 'target-matched-diagnosis').length,
      targetMisses: observations.filter(target => target.outcome === 'target-miss').length,
      relevantTypedPreventions: observations.filter(target => target.outcome === 'relevant-typed-prevention').length,
      independentlyVerifiedChapterPreventions: rows.filter(row => row.chapterPrevention).length,
      casesWithoutFindingTarget: rows.filter(row => row.diagnosisAssessment === 'unassessed-no-target').length,
      unassessedObservations: observations.filter(target => ['unassessed', 'blocked-worker', 'blocked-replay'].includes(target.outcome)).length,
    },
    historical59Comparison: {
      frozenReference: {credited: 39, rawRejected: 40, cases: 59},
      currentCompleteWorkers: rows.filter(row => row.usable).length,
      currentRawRejected: complete ? rows.filter(row => row.rawRejected).length : null,
      currentLegacyCredited: complete ? rows.filter(row => row.legacyCredited).length : null,
      cases: 59,
    },
    visualVerdicts: Object.fromEntries(['confirmed', 'editorial', 'not-visually-reproduced', 'blocked', 'inconclusive', 'secondary-only'].map(verdict => [verdict, rows.filter(row => row.visualVerdict === verdict).length])),
    rows};
}

export function reportV2(report: ReturnType<typeof assessV2>): string {
  const p = report.prospective, h = report.historical59Comparison;
  return `# Prospective motion assessment v2\n\nCapture: ${report.run}. Worker inventory complete: ${report.complete}.\n\nSource revision: ${report.sourceRevision}. ${report.sourcePolicy}\n\n` +
    `${report.policy}\n\n` +
    `Declared observations: ${p.registeredObservations} (${p.registeredFindingTargets} finding targets, ${p.registeredPreventionTargets} prevention targets). ` +
    `Independently confirmed finding targets: ${p.independentlyConfirmedFindingTargets}; assessed: ${p.assessedFindingTargets}; target-matched diagnoses: ${p.targetMatchedDiagnoses}; misses: ${p.targetMisses}. ` +
    `Concrete diagnosed observations within editorial cases: ${p.diagnosesWithinEditorialCases} (case judgment retained). Relevant typed preventions: ${p.relevantTypedPreventions}; independent chapter preventions: ${p.independentlyVerifiedChapterPreventions}. ` +
    `Unassessed observations: ${p.unassessedObservations}; cases without finding target: ${p.casesWithoutFindingTarget}.\n\n` +
    `Historical 59-case comparison (separate metric): frozen 39 credited / 40 raw; current ${h.currentLegacyCredited ?? 'incomplete'} credited / ${h.currentRawRejected ?? 'incomplete'} raw. No historical target was replaced.\n\n` +
    '| Case | Independent visual verdict | Diagnosis | Typed prevention | Chapter prevention |\n|---|---|---|---|---|\n' +
    report.rows.map(row => `| ${row.id} | ${row.visualVerdict} | ${row.diagnosisAssessment} | ${row.targets.filter(target => target.preventionMatch).map(target => target.version).join(', ') || 'none'} | ${row.chapterPrevention ? 'verified receipt' : 'unassessed'} |`).join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {input: {type: 'string'}, out: {type: 'string'}}});
  if (!values.input || !values.out) throw new Error('usage: --input <v2-input.json> --out <report path without extension>');
  const report = assessV2(JSON.parse(await readFile(values.input, 'utf8')));
  await mkdir(dirname(resolve(values.out)), {recursive: true});
  await writeFile(`${values.out}.json`, JSON.stringify(report, null, 2) + '\n');
  await writeFile(`${values.out}.md`, reportV2(report));
  console.log(`Wrote ${values.out}.json and ${values.out}.md`);
}
