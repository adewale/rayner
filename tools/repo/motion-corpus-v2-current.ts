// Adapt the frozen Nov 22 capture only after provenance and explicit independent
// reviewer confirmations bind the exact source, review bytes and target versions.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import { PROSPECTIVE_V2_VISUAL } from '../../test/fixtures/motion-corpus/prospective-v2-visual.ts';
import { assessV2, reportV2 } from './motion-corpus-v2.ts';
import type { ChapterReceipt, V2Input, VisualReview, VisualVerdict } from './motion-corpus-v2.ts';

export const FROZEN_REVISION = '5bff60e0aa5660c2b944fb59fbfe0b59e703db93';
export const FROZEN_RUN = `current-audit-2026-11-22/frozen-${FROZEN_REVISION}`;
const sha256 = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
interface RecordedReview {
  id: string; disposition: string; clauseCovered?: string; claimCoverage?: string;
  observation?: string; rationale?: string; witnesses?: string[]; extraWitnesses?: string[];
  wholeSceneWitness?: string;
}
interface Confirmation {
  id: string; targets: string[]; note: string;
}
interface ConfirmationReceipt {
  schema: number; revision: string; run: string; reviewer: string; reviewFile: string;
  reviewSha256: string; provenanceSha256: string; confirmations: Confirmation[];
}
function verdict(disposition: string): VisualVerdict {
  if (disposition === 'confirmed intended clause') return 'confirmed';
  if (disposition.includes('secondary-only')) return 'secondary-only';
  if (disposition.includes('editorial')) return 'editorial';
  if (disposition.includes('blocked')) return 'blocked';
  if (disposition === 'unreproduced') return 'not-visually-reproduced';
  return 'inconclusive';
}
function inventory(rows: readonly {id: string}[], ids: readonly string[], label: string) {
  if (rows.length !== ids.length || new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => !ids.includes(row.id)))
    throw new Error(`${label}: missing, duplicate or unexpected independent review identity`);
}
const owners = [
  {reviewer: 'current_audit_first', file: 'review-first.json', key: 'cases', revisionKey: 'revision', ids: CORPUS.slice(0, 30).map(entry => entry.id)},
  {reviewer: 'current_audit_second', file: 'review-second.json', key: 'entries', revisionKey: 'frozenRevision', ids: CORPUS.slice(30).map(entry => entry.id)},
] as const;

/** Validate independent evidence before reading any measurement observations.
 * The SHA binds external review evidence, not a snapshot of Rayner source code.
 * A broad disposition never implies confirmation of a particular target. */
export async function boundCurrentReviews(directory: string): Promise<VisualReview[]> {
  const provenanceBytes = await readFile(join(directory, 'provenance.json'), 'utf8');
  const provenance = JSON.parse(provenanceBytes);
  if (provenance.revision !== FROZEN_REVISION) throw new Error('capture provenance is not the declared frozen source');
  const reviews: VisualReview[] = [];
  for (const owner of owners) {
    const [reviewBytes, confirmationBytes] = await Promise.all([
      readFile(join(directory, owner.file), 'utf8'),
      readFile(join(directory, owner.file.replace('.json', '-v2-confirmations.json')), 'utf8'),
    ]);
    const review = JSON.parse(reviewBytes);
    const receipt = JSON.parse(confirmationBytes) as ConfirmationReceipt;
    if (review.reviewer !== owner.reviewer || review[owner.revisionKey] !== FROZEN_REVISION ||
      receipt.schema !== 1 || receipt.reviewer !== owner.reviewer || receipt.revision !== FROZEN_REVISION || receipt.run !== FROZEN_RUN ||
      receipt.reviewFile !== owner.file || receipt.reviewSha256 !== sha256(reviewBytes) || receipt.provenanceSha256 !== sha256(provenanceBytes))
      throw new Error(`${owner.file}: independent confirmation provenance/review binding mismatch`);
    const entries = review[owner.key] as RecordedReview[];
    inventory(entries, owner.ids, owner.file);
    inventory(receipt.confirmations, owner.ids, `${owner.file} explicit confirmations`);
    const confirmations = new Map(receipt.confirmations.map(row => [row.id, row]));
    for (const row of entries) {
      const confirmation = confirmations.get(row.id)!;
      const disposition = verdict(row.disposition);
      const declared = PROSPECTIVE_V2_VISUAL.find(entry => entry.id === row.id)!.targets;
      if (!Array.isArray(confirmation.targets) || new Set(confirmation.targets).size !== confirmation.targets.length ||
        confirmation.targets.some(version => !declared.some(target => target.version === version)) ||
        typeof confirmation.note !== 'string' || !confirmation.note.trim() ||
        (confirmation.targets.some(version => declared.some(target => target.version === version && target.finding)) && !['confirmed', 'editorial', 'secondary-only'].includes(disposition)))
        throw new Error(`${row.id}: invalid explicit independent target confirmation`);
      reviews.push({id: row.id, run: receipt.run, reviewer: receipt.reviewer, verdict: disposition,
        evidence: [join(directory, owner.file), join(directory, owner.file.replace('.json', '-v2-confirmations.json')),
          ...(row.witnesses ?? []), ...(row.extraWitnesses ?? []).map(path => join(directory, path)),
          ...(row.wholeSceneWitness ? [join(directory, row.wholeSceneWitness)] : [])],
        note: [row.disposition, row.clauseCovered ?? row.claimCoverage, row.observation ?? row.rationale, confirmation.note].filter(Boolean).join(': '),
        confirmedTargets: confirmation.targets});
    }
  }
  return reviews;
}

export async function currentV2Input(directory: string, keepers?: string): Promise<V2Input> {
  const reviews = await boundCurrentReviews(directory);
  if ((await readFile(join(directory, 'measurement/corpus.exit'), 'utf8')).trim() !== '0') throw new Error('measurement is not complete and successful');
  const [measurementBytes, receiptBytes] = await Promise.all([
    readFile(join(directory, 'measurement/corpus.json'), 'utf8'),
    readFile(join(directory, 'measurement/provenance.json'), 'utf8'),
  ]);
  const receipt = JSON.parse(receiptBytes);
  if (receipt.schema !== 1 || receipt.revision !== FROZEN_REVISION || receipt.run !== FROZEN_RUN || receipt.measurementFile !== 'corpus.json' ||
    receipt.measurementSha256 !== sha256(measurementBytes) || receipt.comparison !== 'baseline-subtracted' || receipt.expectedCases !== 59 ||
    receipt.expectedBaselines !== 8 || typeof receipt.sourcePolicy !== 'string' || !receipt.sourcePolicy.trim())
    throw new Error('measurement source receipt does not bind the frozen run and exact measurement bytes');
  const measurement = JSON.parse(measurementBytes);
  if (measurement.comparison !== receipt.comparison) throw new Error('measurement comparison does not match its source receipt');
  const chapterReceipts: ChapterReceipt[] = keepers ? JSON.parse(await readFile(keepers, 'utf8')) : [];
  return {run: receipt.run, sourceRevision: receipt.revision,
    sourcePolicy: `${receipt.sourcePolicy} Frozen renderer/scenes assessment only. Subsequent matcher, word, chapter-context or timing policy changes require fresh measurements; this is not an assessment of final source.`,
    results: measurement.results, baselines: measurement.baselines, reviews, chapterReceipts};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {audit: {type: 'string'}, keepers: {type: 'string'}}});
  const directory = values.audit ?? 'out/current-audit-2026-11-22';
  const input = await currentV2Input(directory, values.keepers);
  const report = assessV2(input);
  await mkdir(join(directory, 'prospective-v2'), {recursive: true});
  await writeFile(join(directory, 'prospective-v2/input.json'), JSON.stringify(input, null, 2) + '\n');
  await writeFile(join(directory, 'prospective-v2/report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(directory, 'prospective-v2/report.md'), reportV2(report));
  console.log(JSON.stringify({prospective: report.prospective, historical59Comparison: report.historical59Comparison, visualVerdicts: report.visualVerdicts}, null, 2));
}
