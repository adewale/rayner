// The keyed motion check's recall on real motion defects: the corpus (test/fixtures/motion-corpus/
// corpus.ts) brings back, one at a time, fixes that filming the Poppy series made after every check
// had passed (issue #101, item 14), as edits to the current Poppy scenes. Each variant is built in a
// copy of the Poppy folders under out/ and checked in a process of its own (tools/repo/motion-corpus.ts),
// playing the transitions of the entry's own events from every reachable state, with every play of
// the run. docs/MOTION-CORPUS.md holds the recall table and how it was measured.
//
// By default a sample runs (see SAMPLE); FULL=1 (npm run test:full, CI's
// check job) runs every entry and holds the check to the recall measured: an entry caught then must
// still be caught. Recall may rise; when it does, add the entry to CAUGHT.
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

/** Retain measured rejections, including six exact authored-motion diagnoses.
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
  'sign-in-poll-over-card',
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
];
/**
 * The default run: covers, small words, flicker, attributed occlusion and authored context.
 */
const SAMPLE: readonly string[] = ['coverage-list-over-labels', 'sign-in-code-tiny-words', 'conversations-block-crossfades', 'sign-in-poll-over-card', 'sign-in-ask-people-slide', 'conversations-table-block-blinks'];

test('the credited poll mutation removes actual letter pixels and its fixed route preserves them', {
  skip: !process.env.FULL && 'set FULL=1: independently rasterizes the credited poll and fixed route',
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rayner-motion-proof-'));
  try {
    await promisify(execFile)(process.execPath, [join(ROOT, 'tools/repo/motion-occlusion-proof.ts'), '--out', directory]);
    const proof = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
    assert.equal(proof.entry, 'sign-in-poll-over-card');
    assert.equal(proof.fixed.length, 3);
    assert.equal(proof.mutation.length, 3);
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
  for (const id of [...CAUGHT, ...SAMPLE]) assert.ok(CORPUS.some((e) => e.id === id), `${id} is a corpus entry`);
});

test('a sample of the corpus: geometry, occlusion and authored context are caught', async () => {
  const entries = CORPUS.filter((e) => SAMPLE.includes(e.id));
  assert.equal(entries.length, SAMPLE.length);
  // The catalog's gate keeps the scenes as they are free of findings, so no baseline is run here.
  const { results } = await runCorpus(entries, { bases: false, jobs: 2 });
  assert.equal(results.length, SAMPLE.length);
  for (const r of results) {
    assert.equal(r.error, undefined, `${r.id}: ${r.error}`);
    assert.ok(r.caught, `${r.id} is no longer caught`);
  }
});

test('the whole corpus: every defect caught when recall was measured is still caught', { skip: !process.env.FULL && 'set FULL=1 (npm run test:full): it replays all 59 reconstructed mutations' }, async () => {
  const { results } = await runCorpus(CORPUS, { bases: false, jobs: 2 });
  for (const r of results) assert.equal(r.error, undefined, `${r.id}: ${r.error}`);
  const caught = results.filter((r) => r.caught).map((r) => r.id);
  assert.deepEqual(CAUGHT.filter((id) => !caught.includes(id)), [], 'entries no longer caught');
  const { caught: n, of } = recall(CORPUS, results);
  assert.ok(n >= CAUGHT.length, `recall fell: ${n} of ${of}, was ${CAUGHT.length}`);
});
