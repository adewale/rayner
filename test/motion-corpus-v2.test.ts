import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FROZEN_REVISION, FROZEN_RUN } from '../tools/repo/motion-corpus-v2-current.ts';
import assert from 'node:assert/strict';
import { CORPUS } from './fixtures/motion-corpus/corpus.ts';
import { PROSPECTIVE_V2_VISUAL, INDEPENDENT_VISUAL_TARGETS } from './fixtures/motion-corpus/prospective-v2-visual.ts';
import { PROSPECTIVE_V2 } from './fixtures/motion-corpus/prospective-v2.ts';
import { assessV2, CHAPTER_KEEPERS, matchesFinding, matchesPrevention, reportV2 } from '../tools/repo/motion-corpus-v2.ts';
import type { V2Input, VisualReview } from '../tools/repo/motion-corpus-v2.ts';
import type { EntryResult, Found } from '../tools/repo/motion-corpus-lib.ts';
import type { FindingTarget } from './fixtures/motion-corpus/prospective-v2.ts';

const worker = (id: string, findings: Found[] = []): EntryResult => ({id, caught: true, status: 'complete', ms: 0, findings, fresh: findings});
const input = (): V2Input => ({run: 'independent-test-capture', results: CORPUS.map(entry => worker(entry.id)),
  baselines: [...new Set(CORPUS.map(entry => entry.chapter))].map(chapter => worker(`base-${chapter}`))});
function row(input: V2Input, id: string, findings: Found[]) {
  input.results[input.results.findIndex(result => result.id === id)] = worker(id, findings);
}
const codeCase = PROSPECTIVE_V2.find(entry => entry.id === 'sign-in-code-tiny-words')!;
const codeTarget = codeCase.targets[0]!.finding!;
const small: Found = {scenario: '{"flow":"direct"}', line: 'ignored printed explanation', observation: {
  type: 'finding', transition: 'step "approve", event "collect"', kind: 'small words', path: 'code', subjects: ['c_5Rm2'], detail: 'code text is too small in flight'}};
function review(id: string, versions: string[]): VisualReview {
  return {id, run: 'independent-test-capture', reviewer: 'independent visual observer', verdict: 'confirmed', evidence: ['frames/collect-001.png'],
    note: 'The named code is visibly too small during its collect flight.', confirmedTargets: versions};
}

test('prospective inventory declares all 59 claims and retains the original 12 exact targets without changing them', () => {
  assert.equal(PROSPECTIVE_V2.length, 59);
  assert.deepEqual(PROSPECTIVE_V2.map(entry => entry.id), CORPUS.map(entry => entry.id));
  const originals = CORPUS.filter(entry => entry.expectedFinding || entry.expectedRefusal);
  assert.equal(originals.length, 12);
  for (const entry of originals) {
    const target = PROSPECTIVE_V2.find(row => row.id === entry.id)!.targets.find(target => target.version === `${entry.id}@historical`)!;
    if (entry.expectedFinding) assert.deepEqual(target.finding, {type: 'finding', ...entry.expectedFinding});
    if (entry.expectedRefusal) assert.deepEqual(target.prevention, {type: 'refusal', ...entry.expectedRefusal});
  }
  assert.equal(PROSPECTIVE_V2.flatMap(entry => entry.targets).length, 19);
  assert.equal(PROSPECTIVE_V2_VISUAL.flatMap(entry => entry.targets).length, 25);
  assert.equal(Object.keys(INDEPENDENT_VISUAL_TARGETS).length, 6);
  for (const entry of PROSPECTIVE_V2) assert.deepEqual(PROSPECTIVE_V2_VISUAL.find(row => row.id === entry.id)!.targets.slice(0, entry.targets.length), entry.targets);
  for (const entry of PROSPECTIVE_V2) {
    assert.ok(entry.claim.actor && entry.claim.subject && entry.claim.phase && entry.source);
    if (!entry.targets.length) assert.ok(entry.unresolved);
  }
});

test('source-bound diagnosis rejects a wrong actor, event, code, reason, scenario and textual lookalike', () => {
  assert.equal(matchesFinding(small, codeTarget), true);
  assert.equal(small.observation?.type, 'finding');
  if (small.observation?.type !== 'finding') throw new Error('expected structured finding');
  for (const change of [{path: 'poll'}, {transition: 'step "approve", event "ask"'}, {subjects: ['other code']}, {kind: 'jump'}])
    assert.equal(matchesFinding({...small, observation: {...small.observation, ...change}}, codeTarget), false);
  assert.equal(matchesFinding({...small, scenario: '{"flow":"device"}'}, codeTarget), false);
  assert.equal(matchesFinding({...small, observation: undefined}, codeTarget), false);
});

test('an attributed occlusion requires its predeclared victim and foreground rather than an incidental warning', () => {
  const target: FindingTarget = {type: 'finding', scenario: '{}', transition: /^event "send"$/, kind: 'covers', path: 'ticket',
    subjects: ['station name'], victim: 'station:name', masks: ['ticket']};
  const good: Found = {scenario: '{}', line: 'ticket crosses station name', observation: {type: 'finding', transition: 'event "send"',
    kind: 'covers', path: 'ticket', detail: 'station name covered', subjects: ['station name'], victim: 'station:name', masks: ['ticket']}};
  assert.ok(matchesFinding(good, target));
  assert.equal(good.observation?.type, 'finding');
  if (good.observation?.type !== 'finding') throw new Error('expected finding');
  for (const change of [{victim: 'shelf:name'}, {victim: undefined}, {masks: ['unrelated token']}, {subjects: ['shelf name']}])
    assert.equal(matchesFinding({...good, observation: {...good.observation, ...change}}, target), false);
});

test('typed prevention rejects the wrong event, error type and authored reason', () => {
  const target = PROSPECTIVE_V2.find(entry => entry.id === 'sign-in-ask-squeezed')!.targets[0]!.prevention!;
  const refusal: Found = {scenario: 'during guarded execution', line: 'duration guard', observation: {type: 'refusal',
    kind: 'duration guard', name: 'RangeError', event: 'ask', message: 'machine.send("ask"): authored transition lasts 3.000 s but the event allows 2.200 s; increase budget'}};
  assert.ok(matchesPrevention(refusal, target));
  if (refusal.observation?.type !== 'refusal') throw new Error('expected refusal');
  for (const change of [{event: 'collect'}, {name: 'Error'}, {message: 'machine.send("ask"): renderer crashed'},
    {message: 'machine.send("ask"): authored transition lasts 3.000 s but the event allows 2.600 s; increase budget'}])
    assert.equal(matchesPrevention({...refusal, observation: {...refusal.observation, ...change}}, target), false);
});

test('unreviewed matching warnings and cases missing a target are unassessed; old rejection comparison stays separate', () => {
  const data = input();
  row(data, codeCase.id, [small]);
  const unbound = PROSPECTIVE_V2_VISUAL.find(entry => !entry.targets.length)!;
  row(data, unbound.id, [small]);
  const report = assessV2(data);
  assert.equal(report.prospective.targetMatchedDiagnoses, 0);
  assert.equal(report.prospective.assessedFindingTargets, 0);
  assert.equal(report.rows.find(row => row.id === codeCase.id)!.targets[0]!.findingMatch, true);
  assert.equal(report.rows.find(row => row.id === unbound.id)!.diagnosisAssessment, 'unassessed-no-target');
  assert.equal(report.historical59Comparison.currentRawRejected, 2);
  assert.deepEqual(report.historical59Comparison.frozenReference, {credited: 39, rawRejected: 40, cases: 59});
  assert.match(reportV2(report), /not accuracy/);
});

test('confirmed declared observation produces one diagnosis; a wrong event becomes a target miss', () => {
  const data = input();
  data.reviews = [review(codeCase.id, [codeCase.targets[0]!.version])];
  row(data, codeCase.id, [small]);
  let report = assessV2(data);
  assert.equal(report.prospective.targetMatchedDiagnoses, 1);
  assert.equal(report.prospective.assessedFindingTargets, 1);
  assert.equal(report.prospective.targetMisses, 0);
  if (small.observation?.type !== 'finding') throw new Error('expected finding');
  row(data, codeCase.id, [{...small, observation: {...small.observation, transition: 'step "ask", event "ask"'}}]);
  report = assessV2(data);
  assert.equal(report.prospective.targetMatchedDiagnoses, 0);
  assert.equal(report.prospective.targetMisses, 1);
  assert.equal(report.historical59Comparison.currentRawRejected, 1);
});

test('failed workers, malformed workers and failed baselines preserve no diagnosis or complete comparison', () => {
  for (const failure of ['worker', 'schema', 'baseline'] as const) {
    const data = input();
    row(data, codeCase.id, [small]);
    data.reviews = [review(codeCase.id, [codeCase.targets[0]!.version])];
    if (failure === 'baseline') data.baselines.find(row => row.id === 'base-poppy-sign-in')!.error = 'baseline failed';
    else if (failure === 'worker') data.results.find(row => row.id === codeCase.id)!.error = 'worker failed after partial output';
    else data.results.find(row => row.id === codeCase.id)!.ms = -1;
    const report = assessV2(data);
    assert.equal(report.complete, false);
    assert.equal(report.prospective.targetMatchedDiagnoses, 0);
    assert.equal(report.prospective.targetMisses, 0);
    assert.equal(report.historical59Comparison.currentRawRejected, null);
    assert.equal(report.rows.find(row => row.id === codeCase.id)!.warningCount, 0);
  }
});

test('missing, duplicate and unexpected worker or baseline inventory rejects evaluation', () => {
  for (const damage of ['missing', 'duplicate', 'unexpected', 'missing baseline', 'duplicate baseline'] as const) {
    const data = input();
    if (damage === 'missing') data.results.pop();
    if (damage === 'duplicate') data.results.push(data.results[0]!);
    if (damage === 'unexpected') data.results[0] = worker('invented mutation');
    if (damage === 'missing baseline') data.baselines.pop();
    if (damage === 'duplicate baseline') data.baselines.push(data.baselines[0]!);
    assert.throws(() => assessV2(data), /inventory|duplicate identity/);
  }
});

test('baseline findings cannot earn fresh target credit even when worker fresh and caught claim success', () => {
  const data = input();
  row(data, codeCase.id, [small]);
  data.baselines[data.baselines.findIndex(row => row.id === 'base-poppy-sign-in')] = worker('base-poppy-sign-in', [small]);
  data.reviews = [review(codeCase.id, [codeCase.targets[0]!.version])];
  const report = assessV2(data);
  assert.equal(report.prospective.targetMatchedDiagnoses, 0);
  assert.equal(report.historical59Comparison.currentRawRejected, 0);
});

test('a changed domain victim is a new observation and cannot gain historical company-name credit', () => {
  const entry = PROSPECTIVE_V2.find(entry => entry.id === 'sign-in-poll-over-card')!;
  assert.equal(entry.targets.length, 2);
  const original = entry.targets.find(target => target.version.endsWith('@historical'))!;
  const domain = entry.targets.find(target => target.replacesObservation)!;
  const found: Found = {scenario: '{"flow":"device"}', line: 'poll covers domain', observation: {type: 'finding',
    transition: 'step "ask", play 1, event 2', kind: 'occluded words', path: 'card', subjects: ['example.com', 'poll'], detail: 'domain hidden'}};
  assert.ok(matchesFinding(found, domain.finding!));
  assert.equal(matchesFinding(found, original.finding!), false);
  const data = input();
  row(data, entry.id, [found]);
  data.reviews = [review(entry.id, [domain.version])];
  const report = assessV2(data);
  assert.equal(report.prospective.targetMatchedDiagnoses, 1);
  assert.equal(report.historical59Comparison.currentLegacyCredited, 0);
  assert.equal(report.historical59Comparison.currentRawRejected, 1);
});

test('chapter prevention needs this run and both named independent controls, and never earns diagnosis', () => {
  const data = input(), keeper = CHAPTER_KEEPERS[0];
  const receipt = {id: keeper.id, owner: keeper.owner, run: data.run, evidence: ['keepers/sessions.log'],
    fixed: {name: keeper.fixed, passed: true}, inverse: {name: keeper.inverse, passed: false}};
  data.chapterReceipts = [receipt];
  assert.equal(assessV2(data).prospective.independentlyVerifiedChapterPreventions, 0);
  receipt.inverse.passed = true;
  const report = assessV2(data);
  assert.equal(report.prospective.independentlyVerifiedChapterPreventions, 1);
  assert.equal(report.prospective.targetMatchedDiagnoses, 0);
  receipt.run = 'stale capture';
  assert.throws(() => assessV2(data), /invalid chapter receipt/);
});

test('editorial, unreproduced, blocked and inconclusive visual results never silently become diagnostic successes', () => {
  for (const verdict of ['editorial', 'not-visually-reproduced', 'blocked', 'inconclusive'] as const) {
    const data = input();
    row(data, codeCase.id, [small]);
    data.reviews = [{...review(codeCase.id, []), verdict}];
    const report = assessV2(data);
    assert.equal(report.prospective.targetMatchedDiagnoses, 0);
    assert.equal(report.prospective.assessedFindingTargets, 0);
    assert.equal(report.rows.find(row => row.id === codeCase.id)!.visualVerdict, verdict);
  }
});

test('a relevant typed refusal is prevention and leaves a different declared visual observation unassessed', () => {
  const data = input(), id = 'sign-in-ask-squeezed';
  const found: Found = {scenario: 'during guarded execution', line: 'duration guard', observation: {type: 'refusal',
    kind: 'duration guard', name: 'RangeError', event: 'ask', message: 'machine.send("ask"): authored transition lasts 3.000 s but the event allows 2.200 s; increase budget'}};
  row(data, id, [found]);
  data.results.find(row => row.id === id)!.status = 'refused';
  const report = assessV2(data);
  assert.equal(report.prospective.relevantTypedPreventions, 1);
  assert.equal(report.prospective.targetMatchedDiagnoses, 0);
  assert.equal(report.rows.find(row => row.id === id)!.diagnosisAssessment, 'unassessed-no-target');
  assert.equal(report.historical59Comparison.currentRawRejected, 1);
});

test('explicitly confirmed concrete obstruction can be diagnosed inside an editorial case without reclassifying that case', () => {
  const data = input();
  row(data, codeCase.id, [small]);
  data.reviews = [{...review(codeCase.id, [codeCase.targets[0]!.version]), verdict: 'editorial',
    note: 'Concrete smaller code is confirmed; whether the narrative pace is desirable remains editorial.'}];
  const report = assessV2(data);
  assert.equal(report.prospective.targetMatchedDiagnoses, 1);
  assert.equal(report.prospective.diagnosesWithinEditorialCases, 1);
  assert.equal(report.rows.find(row => row.id === codeCase.id)!.visualVerdict, 'editorial');
});

const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
async function boundFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'rayner-v2-binding-'));
  const provenance = JSON.stringify({revision: FROZEN_REVISION});
  await writeFile(join(directory, 'provenance.json'), provenance);
  for (const [file, owner, key, revisionKey, entries] of [
    ['review-first.json', 'current_audit_first', 'cases', 'revision', CORPUS.slice(0, 30)],
    ['review-second.json', 'current_audit_second', 'entries', 'frozenRevision', CORPUS.slice(30)],
  ] as const) {
    const review = JSON.stringify({reviewer: owner, [revisionKey]: FROZEN_REVISION,
      [key]: entries.map(entry => ({id: entry.id, disposition: 'confirmed intended clause',
        observation: entry.id === codeCase.id ? 'Synthetic named code observation for adapter test.' : 'Synthetic case; no diagnostic target ratified.',
        witnesses: [`synthetic/${entry.id}.png`]}))});
    await writeFile(join(directory, file), review);
    await writeFile(join(directory, file.replace('.json', '-v2-confirmations.json')), JSON.stringify({schema: 1,
      revision: FROZEN_REVISION, run: FROZEN_RUN, reviewer: owner, reviewFile: file,
      reviewSha256: digest(review), provenanceSha256: digest(provenance),
      confirmations: entries.map(entry => ({id: entry.id, targets: entry.id === codeCase.id ? [codeCase.targets[0]!.version] : [],
        note: 'Explicit synthetic adapter-test ratification, not actual audit evidence.'}))}));
  }
  const data = input(); row(data, codeCase.id, [small]);
  const measurement = JSON.stringify({comparison: 'baseline-subtracted', results: data.results, baselines: data.baselines});
  await mkdir(join(directory, 'measurement'));
  await writeFile(join(directory, 'measurement/corpus.json'), measurement);
  await writeFile(join(directory, 'measurement/corpus.exit'), '0\n');
  await writeFile(join(directory, 'measurement/provenance.json'), JSON.stringify({schema: 1, revision: FROZEN_REVISION,
    run: FROZEN_RUN, measurementFile: 'corpus.json', measurementSha256: digest(measurement), comparison: 'baseline-subtracted',
    expectedCases: 59, expectedBaselines: 8, sourcePolicy: 'Synthetic adapter test only.'}));
  return directory;
}
const adapterPath = fileURLToPath(new URL('../tools/repo/motion-corpus-v2-current.ts', import.meta.url));
const runAdapter = (directory: string) => spawnSync(process.execPath, [adapterPath, '--audit', directory], {encoding: 'utf8', timeout: 15_000});
async function changeJSON(directory: string, file: string, change: (row: any) => void) {
  const path = join(directory, file), row = JSON.parse(await readFile(path, 'utf8'));
  change(row); await writeFile(path, JSON.stringify(row));
}

test('actual adapter accepts bound explicit ratification and never upgrades a broad confirmation of another clause', async () => {
  const directory = await boundFixture();
  try {
    let child = runAdapter(directory);
    assert.equal(child.status, 0, child.stderr);
    let report = JSON.parse(await readFile(join(directory, 'prospective-v2/report.json'), 'utf8'));
    assert.equal(report.prospective.targetMatchedDiagnoses, 1);
    assert.equal(report.sourceRevision, FROZEN_REVISION);
    await rm(join(directory, 'prospective-v2'), {recursive: true});
    await changeJSON(directory, 'review-first.json', review => {
      review.cases.find((row: {id: string}) => row.id === codeCase.id).observation = 'A completely different clause is visible; the code-size clause is unconfirmed.';
    });
    // Re-ratify the new review bytes explicitly with NO target, retaining its
    // same coarse confirmed disposition. That must produce no diagnosis.
    const bytes = await readFile(join(directory, 'review-first.json'), 'utf8');
    await changeJSON(directory, 'review-first-v2-confirmations.json', receipt => {
      receipt.reviewSha256 = digest(bytes);
      receipt.confirmations.find((row: {id: string}) => row.id === codeCase.id).targets = [];
    });
    child = runAdapter(directory);
    assert.equal(child.status, 0, child.stderr);
    report = JSON.parse(await readFile(join(directory, 'prospective-v2/report.json'), 'utf8'));
    assert.equal(report.prospective.targetMatchedDiagnoses, 0);
    assert.equal(report.rows.find((row: {id: string}) => row.id === codeCase.id).targets[0].findingMatch, true);
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('actual adapter rejects stale review bytes, wrong reviewer/source/run, and unbound measurement bytes', async () => {
  for (const damage of ['capture-source', 'stale-clause', 'wrong-reviewer', 'wrong-run', 'measurement-source', 'measurement-bytes'] as const) {
    const directory = await boundFixture();
    try {
      if (damage === 'capture-source') await changeJSON(directory, 'provenance.json', row => {row.revision = '0'.repeat(40);});
      if (damage === 'stale-clause') await changeJSON(directory, 'review-first.json', row => {row.cases[0].observation = 'Another clause, unchanged coarse disposition.';});
      if (damage === 'wrong-reviewer') await changeJSON(directory, 'review-first-v2-confirmations.json', row => {row.reviewer = 'another reviewer';});
      if (damage === 'wrong-run') await changeJSON(directory, 'review-first-v2-confirmations.json', row => {row.run = 'different-run';});
      if (damage === 'measurement-source') await changeJSON(directory, 'measurement/provenance.json', row => {row.revision = '0'.repeat(40);});
      if (damage === 'measurement-bytes') await writeFile(join(directory, 'measurement/corpus.json'), '{}');
      const child = runAdapter(directory);
      assert.equal(child.status, 1, `${damage}: ${child.stderr}`);
      assert.match(child.stderr, /provenance|binding|source receipt/);
      await assert.rejects(readFile(join(directory, 'prospective-v2/report.json')), /ENOENT/);
    } finally {await rm(directory, {recursive: true, force: true});}
  }
});

test('a blocked visual case can ratify a typed prevention cause without earning visual diagnosis', () => {
  const data = input(), id = 'discovery-fetch-squeezed';
  const version = PROSPECTIVE_V2.find(entry => entry.id === id)!.targets[0]!.version;
  data.reviews = [{...review(id, [version]), verdict: 'blocked', note: 'Typed event-budget prevention only; no compressed fades were painted.'}];
  const report = assessV2(data);
  assert.equal(report.prospective.targetMatchedDiagnoses, 0);
  assert.equal(report.rows.find(row => row.id === id)!.visualVerdict, 'blocked');
});
