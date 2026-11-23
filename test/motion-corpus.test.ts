// The keyed motion check's recall on real motion defects: the corpus (test/fixtures/motion-corpus/
// corpus.ts) brings back, one at a time, fixes that filming the Poppy series made after every check
// had passed (issue #101, item 14), as edits to the current Poppy scenes. Each variant is built in a
// copy of the Poppy folders under out/ and checked in a process of its own (tools/repo/motion-corpus.ts),
// playing the transitions of the entry's own events from every reachable state, with every play of
// the run. docs/MOTION-CORPUS.md holds the recall table and how it was measured.
//
// By default a sample runs (see SAMPLE); FULL=1 (npm run test:full, CI's
// check job) runs every entry. The historical CAUGHT list stays intact; each ID
// needs its own current finding or explicitly named native construction owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORPUS } from './fixtures/motion-corpus/corpus.ts';
import { applyEdits } from '../tools/repo/motion-corpus-lib.ts';
import { recall, runCorpus } from '../tools/repo/motion-corpus.ts';
import { ROOT } from '../tools/lib/roots.ts';
import { analyzeKeyedMotion } from '../src/keyed-motion.ts';
import { CURRENT_CONSTRUCTION_OBLIGATIONS } from './fixtures/motion-corpus/current-obligations.ts';

/** Retain 39 credited cases, including nine exact authored-motion diagnoses.
 * Sessions pacing is measured by its chapter owner; the current poll mutation covers
 * the newly restored domain rather than its frozen company-name target, so neither
 * earns the old generic point. See docs/MOTION-CORPUS.md.
 * The held-token keeper below owns the old enlarged-poll hazard now prevented by its dock. */
const CAUGHT: readonly string[] = [
  'poppy-ticket-over-lane-names',
  'refusals-ticket-over-station',
  'refusals-ticket-over-lane-name',
  'refusals-delegation-over-station',
  'sessions-ticket-from-under-stamp',
  'sessions-squeezed',
  'sign-in-ask-people-slide',
  'sign-in-ask-squeezed',
  'sign-in-code-tiny-words',
  'sign-in-tag-over-scopes',
  'browser-ticket-over-road-name',
  'browser-halves-together',
  'browser-forge-across-stage',
  'browser-message-across-stage',
  'browser-submit-meet-on-top',
  'browser-read-over-its-copy',
  'browser-attacker-over-shelf',
  'browser-read-tiny-words',
  'browser-forge-tiny-words',
  'conversations-turn-over-seat-name',
  'conversations-person-over-ledger',
  'conversations-block-crossfades',
  'coverage-strips-cross',
  'coverage-skill-card-twice',
  'coverage-reach-over-strips',
  'coverage-desk-blinks',
  'coverage-user-line-blinks',
  'coverage-list-over-labels',
  'discovery-arm-over-register',
  'discovery-fetch-squeezed',
  'poppy-last-object-lingers',
  'sessions-key-to-wax-after-check',
  'sessions-key-in-two-places',
  'browser-message-lingers',
  'browser-record-after-halves',
  'conversations-table-block-blinks',
  'refusals-lanes-gone-in-flight',
  'sign-in-pages-overlap',
  'sign-in-password-hand-and-flight',
];
/**
 * The default run: covers, small words, flicker, attributed occlusion and authored context.
 */
const SAMPLE = new Map([
  ['coverage-list-over-labels', 'covers'],
  ['sign-in-code-tiny-words', 'small words'],
  ['conversations-block-crossfades', 'flicker'],
  ['poppy-ticket-over-lane-names', 'covers'],
  ['conversations-table-block-blinks', 'motion contract'],
  ['sign-in-password-hand-and-flight', 'motion contract'],
]);

test('the current poll mutation removes actual domain pixels and its fixed route preserves them', {
  skip: !process.env.FULL && 'set FULL=1: independently rasterizes the current domain victim and fixed route',
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rayner-motion-proof-'));
  try {
    await promisify(execFile)(process.execPath, [join(ROOT, 'tools/repo/motion-occlusion-proof.ts'), '--out', directory]);
    const proof = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
    assert.equal(proof.entry, 'sign-in-poll-over-card');
    assert.equal(proof.label, 'example.com');
    assert.equal(proof.historicalTarget, 'Example Company');
    assert.equal(proof.historicalTargetCredit, false);
    assert.equal(proof.fixed.length, 3);
    assert.equal(proof.mutation.length, 3);
    assert.equal(proof.currentObservation,'current-partial-domain-contact@2026-11-23.1');
    assert.equal(proof.severeReplay.observations.length,3);
    assert.equal(proof.severeReplay.clearInverse.length,3);
    assert.ok(proof.severeReplay.genericReplay.positive.length>0);
    assert.equal(proof.severeReplay.genericReplay.inverse.length,0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Keeper for sign-in-tokens-over-labels: route prevention removes its old rejection.
// Generic independently painted covers controls remain in motion-occlusion-adversarial.test.ts.
test('the held-token dock preserves each printed word with normal and enlarged historical polls', {
  skip: !process.env.FULL && 'set FULL=1: independently rasterizes both held-token routes',
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rayner-held-proof-'));
  try {
    await promisify(execFile)(process.execPath, [join(ROOT, 'tools/repo/motion-held-token-proof.ts'), '--out', directory]);
    const proof = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
    assert.equal(proof.entry, 'sign-in-tokens-over-labels');
    assert.equal(proof.observations.length, 2);
    assert.deepEqual(proof.observations.map((r: {mutated: boolean})=>r.mutated), [false, true]);
    for (const row of proof.observations) assert.equal(row.restoredLetterPixels, 0);
  } finally { await rm(directory, {recursive:true, force:true}); }
});

// Keeper for the original poppy-last-object-lingers mechanical assertion. Current
// whole-word rest no longer reproduces its incidental size jump. These are actual
// old frame measurements, not an expected image keyed to current source bytes.
// The unchanged-result mutation stays in CORPUS; its new semantic finding is a separate assertion.
test('the recorded exhibit size jump remains rejected after current rest stops reproducing it', async () => {
  const capture = JSON.parse(await readFile(join(ROOT, 'test/fixtures/motion-corpus/historical-exhibit-jump.json'), 'utf8'));
  const frames = capture.frames.map((frame: {t: number; part: unknown; leaves: unknown[]}) => ({
    t: frame.t, parts: new Map(frame.part ? [[capture.observation.path, frame.part]] : []), leaves: frame.leaves,
  })) as Parameters<typeof analyzeKeyedMotion>[0];
  const findings = analyzeKeyedMotion(frames, capture.segment, capture.dt);
  const jump = findings.find(f => f.kind === 'jump' && f.path === capture.observation.path);
  assert.ok(jump, 'the historical visible exhibit jump still fails');
  assert.equal(jump.value, capture.observation.value);
  // Invisible geometry must not earn the same finding.
  const invisible = frames.map(f => ({...f, parts: new Map([...f.parts].map(([path, p]) => [path, {...p, a: 0}]))}));
  assert.ok(!analyzeKeyedMotion(invisible as unknown as typeof frames, capture.segment, capture.dt).some(f => f.kind === 'jump'));
});

test('every corpus entry still applies to the current Poppy scenes, and names its events', async () => {
  const files = new Map<string, string>();
  for (const e of CORPUS) {
    for (const edit of e.edits) {
      if (!files.has(edit.file)) files.set(edit.file, await readFile(join(ROOT, 'scenes/explainers', edit.file), 'utf8'));
    }
    const byFile = new Map<string, typeof e.edits[number][]>();
    for (const edit of e.edits) byFile.set(edit.file, [...(byFile.get(edit.file) ?? []), edit]);
    // Each edit's text is in the scene exactly once, and changes it.
    for (const [file, edits] of byFile) assert.notEqual(applyEdits(files.get(file)!, edits, `${e.id}, ${file}`), files.get(file), e.id);
  }
  assert.equal(new Set(CORPUS.map((e) => e.id)).size, CORPUS.length, 'corpus ids are unique');
  for (const id of [...CAUGHT, ...SAMPLE.keys()]) assert.ok(CORPUS.some((e) => e.id === id), `${id} is a corpus entry`);
});

test('a sample of the corpus: geometry, occlusion and authored context are caught', async () => {
  const entries = CORPUS.filter((e) => SAMPLE.has(e.id));
  assert.equal(entries.length, SAMPLE.size);
  // The catalog's gate keeps the scenes as they are free of findings, so no baseline is run here.
  const { results } = await runCorpus(entries, { bases: false, jobs: 2 });
  assert.equal(results.length, SAMPLE.size);
  for (const r of results) {
    assert.equal(r.error, undefined, `${r.id}: ${r.error}`);
    assert.ok(r.caught, `${r.id} is no longer caught`);
    const kind = SAMPLE.get(r.id)!;
    assert.ok(r.fresh.some((finding) => finding.line.includes(kind === 'motion contract' ? ': motion contract:' : `: ${kind}: part “`)), `${r.id} should produce a ${kind} finding`);
    if(r.id==='poppy-ticket-over-lane-names')assert.ok(r.fresh.some(f=>f.observation?.type==='finding'&&f.observation.kind==='covers'&&
      f.observation.path==='ticket:flight'&&f.observation.victim==='lane:api:name'&&f.observation.masks?.includes('ticket:flight')&&f.observation.subjects.includes('API')),
      'the replacement default positive requires the actual API victim and travelling ticket');
  }
});

test('the whole corpus: each historical ID retains its diagnosis or its explicit current construction obligation', { skip: !process.env.FULL && 'set FULL=1 (npm run test:full): it replays all 59 reconstructed mutations' }, async () => {
  const { results } = await runCorpus(CORPUS, { bases: false, jobs: 2 });
  for (const r of results) assert.equal(r.error, undefined, `${r.id}: ${r.error}`);
  const caught = results.filter((r) => r.caught).map((r) => r.id);
  assert.deepEqual(Object.keys(CURRENT_CONSTRUCTION_OBLIGATIONS),['sign-in-ask-people-slide'],'one independently reviewed current construction owner; the original 39 IDs and targets remain historical');
  for(const id of CAUGHT){
    if(Object.hasOwn(CURRENT_CONSTRUCTION_OBLIGATIONS,id))assert.equal(results.find(r=>r.id===id)!.caught,false,`${id}: a native no-op earns no detection point`);
    else assert.ok(caught.includes(id),`${id}: its own historical finding is still required`);
  }
  // The summary remains a measurement, without using another case's gain to pay
  // for a lost per-ID obligation or calling native prevention a diagnosis.
  assert.equal(recall(CORPUS,results).of,CORPUS.length);
});
