// Adapt the independently recorded Nov 22 visual review and a completed worker
// receipt into the separate v2 report. Confirmations below were recorded before
// opening detector output. This file never selects a target from a warning.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { assessV2, reportV2 } from './motion-corpus-v2.ts';
import type { ChapterReceipt, V2Input, VisualReview, VisualVerdict } from './motion-corpus-v2.ts';

// Independent reviewers explicitly confirmed these exact clauses. Other targets
// remain unassessed even when the case has an overall confirmed disposition.
const confirmed: Readonly<Record<string, string[]>> = {
  'poppy-ticket-over-lane-names': ['poppy-ticket-over-lane-names@visual-2026-11-22.1'],
  'poppy-key-over-station-name': ['poppy-key-over-station-name@visual-2026-11-22.1'],
  'poppy-last-object-lingers': ['poppy-last-object-lingers@historical'],
  'refusals-ticket-over-lane-name': ['refusals-ticket-over-lane-name@visual-2026-11-22.1'],
  'refusals-lanes-gone-in-flight': ['refusals-lanes-gone-in-flight@historical'],
  'refusals-delegation-over-station': ['refusals-delegation-over-station@visual-2026-11-22.1'],
  'refusals-key-over-lane-name': ['refusals-key-over-lane-name@visual-2026-11-22.1'],
  'sessions-key-to-wax-after-check': ['sessions-key-to-wax-after-check@historical'],
  'sessions-key-in-two-places': ['sessions-key-in-two-places@historical'],
  'sign-in-ask-people-slide': ['sign-in-ask-people-slide@historical'],
  'sign-in-pages-overlap': ['sign-in-pages-overlap@historical'],
  'sign-in-password-hand-and-flight': ['sign-in-password-hand-and-flight@historical'],
  'sign-in-poll-over-card': ['sign-in-poll-over-card@domain-2026-11-22.1'],
  'sign-in-code-tiny-words': ['sign-in-code-tiny-words@source-2026-11-22.1'],
  'browser-forge-across-stage': ['browser-forge-across-stage@visual-2026-11-22.1'],
  'browser-message-lingers': ['browser-message-lingers@historical'],
  'browser-record-after-halves': ['browser-record-after-halves@historical'],
  'browser-read-tiny-words': ['browser-read-tiny-words@source-2026-11-22.1'],
  'browser-forge-tiny-words': ['browser-forge-tiny-words@source-2026-11-22.1'],
  'conversations-table-block-blinks': ['conversations-table-block-blinks@historical'],
};
interface RecordedReview {
  id: string; disposition: string; clauseCovered?: string; claimCoverage?: string;
  observation?: string; rationale?: string; witnesses?: string[]; extraWitnesses?: string[];
  wholeSceneWitness?: string;
}
function verdict(disposition: string): VisualVerdict {
  if (disposition === 'confirmed intended clause') return 'confirmed';
  if (disposition.includes('secondary-only')) return 'secondary-only';
  if (disposition.includes('editorial')) return 'editorial';
  if (disposition.includes('blocked')) return 'blocked';
  if (disposition === 'unreproduced') return 'not-visually-reproduced';
  return 'inconclusive'; // Secondary-only evidence does not confirm an old clause.
}
const {values} = parseArgs({options: {audit: {type: 'string'}, keepers: {type: 'string'}, run: {type: 'string'}}});
const directory = values.audit ?? 'out/current-audit-2026-11-22';
const run = values.run ?? 'current-audit-2026-11-22/frozen-5bff60e0aa5660c2b944fb59fbfe0b59e703db93';
if ((await readFile(join(directory, 'measurement/corpus.exit'), 'utf8')).trim() !== '0') throw new Error('measurement is not complete and successful');
const [measurement, first, second] = await Promise.all([
  readFile(join(directory, 'measurement/corpus.json'), 'utf8').then(JSON.parse),
  readFile(join(directory, 'review-first.json'), 'utf8').then(JSON.parse),
  readFile(join(directory, 'review-second.json'), 'utf8').then(JSON.parse),
]);
const reviews: VisualReview[] = [];
for (const [reviewer, file, entries] of [
  [first.reviewer, 'review-first.json', first.cases],
  [second.reviewer, 'review-second.json', second.entries],
] as [string, string, RecordedReview[]][]) {
  for (const row of entries) {
    const disposition = verdict(row.disposition);
    reviews.push({id: row.id, run, reviewer, verdict: disposition,
      evidence: [join(directory, file), ...(row.witnesses ?? []), ...(row.extraWitnesses ?? []).map(path => join(directory, path)),
        ...(row.wholeSceneWitness ? [join(directory, row.wholeSceneWitness)] : [])],
      note: [row.disposition, row.clauseCovered ?? row.claimCoverage, row.observation ?? row.rationale].filter(Boolean).join(': '),
      confirmedTargets: disposition === 'confirmed' || disposition === 'editorial' || disposition === 'secondary-only' ? confirmed[row.id] ?? [] : []});
  }
}
const chapterReceipts: ChapterReceipt[] = values.keepers ? JSON.parse(await readFile(values.keepers, 'utf8')) : [];
const input: V2Input = {run, sourceRevision: '5bff60e0aa5660c2b944fb59fbfe0b59e703db93',
  sourcePolicy: 'Frozen renderer/scenes assessment only. Subsequent matcher, word, chapter-context or timing policy changes require fresh measurements; this is not an assessment of final source.', results: measurement.results, baselines: measurement.baselines, reviews, chapterReceipts};
const report = assessV2(input);
await mkdir(join(directory, 'prospective-v2'), {recursive: true});
await writeFile(join(directory, 'prospective-v2/input.json'), JSON.stringify(input, null, 2) + '\n');
await writeFile(join(directory, 'prospective-v2/report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(join(directory, 'prospective-v2/report.md'), reportV2(report));
console.log(JSON.stringify({prospective: report.prospective, historical59Comparison: report.historical59Comparison, visualVerdicts: report.visualVerdicts}, null, 2));
