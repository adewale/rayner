import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORPUS } from './fixtures/motion-corpus/corpus.ts';
import { routes } from '../tools/repo/motion-audit-routes.ts';
import type { Found } from '../tools/repo/motion-corpus-lib.ts';
import { SEMANTIC_V3, boundCaseReview, boundSemanticAssessment, digest, matchesSemantic, semanticDigest, type BoundArtifact, type SemanticRatification } from '../tools/repo/motion-semantic.ts';

test('separate semantic mappings retain the poll actor orientation and the forged slip exact SID victim', async () => {
  const frozen = JSON.parse(await readFile(new URL('../docs/evidence/motion-regressions-2026-11-22/calibration/frozen-observations.json', import.meta.url), 'utf8'));
  for (const target of SEMANTIC_V3.slice(2)) {
    const found = frozen.rows.find((r: {id: string}) => r.id === target.id).observations[0] as Found;
    assert.equal(matchesSemantic(found, target), true);
    assert.ok(found.observation?.type === 'finding');
    for (const change of [{path: target.victim}, {victim: 'page:session'}, {masks: ['unrelated']},
      {transition: 'step "unrelated", play 1, event 2'}, {subjects: ['Session']}, {kind: 'occluded words'}]) {
      assert.equal(matchesSemantic({...found, observation: {...found.observation, ...change}}, target), false, JSON.stringify(change));
    }
    assert.equal(matchesSemantic({...found, scenario: '{}'}, target), false);
  }
});

test('semantic ratification binds exact relations, source/run and native image bytes independently of measurement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-semantic-'));
  const store = async (path: string, value: unknown): Promise<BoundArtifact> => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    await writeFile(join(dir, path), bytes); return {path, sha256: digest(bytes)};
  };
  try {
    const target = SEMANTIC_V3[0]!, representation = target.representations[0]!;
    const found: Found = {scenario: target.scenario, line: 'native authored text-clearance observation', observation: {
      type: 'finding', ...representation, detail: 'named glyph core interrupted'}};
    const payload = await store('workers.json', {results: CORPUS.map(c => ({id: c.id, status: 'complete', caught: false, ms: 1,
      findings: c.id === target.id ? [found] : [], fresh: c.id === target.id ? [found] : []}))});
    const sourceRevision = 'a'.repeat(40), run = 'semantic-test-run', reviewer = 'independent-native-reviewer';
    const png = await store('native.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
    const observation = {version: target.version, targetSha256: semanticDigest(target), actor: target.actor, victim: target.victim,
      literal: target.literal, event: target.event, phase: target.phase, note: 'synthetic admission control, not actual visual evidence', nativeWitnesses: [png]};
    const review = await store('review.json', {sourceRevision, run, reviewer, observations: [observation]});
    const captureCases = CORPUS.map(c => ({id: c.id, route: routes[c.id], nativeAssets: [png.sha256]}));
    const capture = await store('capture.json', {sourceRevision, run, nativeAssets: [png.sha256], cases: captureCases});
    const measurement = await store('measurement.json', {sourceRevision, run, comparison: 'baseline-subtracted', measurementSha256: payload.sha256, payload});
    const receipt: SemanticRatification = {schema: 1, sourceRevision, run, reviewer, review, capture, measurement, observations: [observation]};
    const result = await boundSemanticAssessment(dir, receipt);
    assert.equal(result[0]!.status, 'semantic-target-match');
    assert.equal(result.filter(r => r.status === 'unassessed').length, 3, 'a case verdict cannot grant another observation credit');
    for (const change of [{sourceRevision: 'b'.repeat(40)}, {run: 'different-run'}, {reviewer: 'different-reviewer'}])
      await assert.rejects(boundSemanticAssessment(dir, {...receipt, ...change}), /binding mismatch/);
    for (const change of [{victim: 'another word'}, {event: 'sign-out'}, {phase: 'outbound key'}, {targetSha256: '0'.repeat(64)}])
      await assert.rejects(boundSemanticAssessment(dir, {...receipt, observations: [{...observation, ...change}]}), /different relation/);
    const alien = await store('alien.png', Buffer.concat([await readFile(join(dir, png.path)), Buffer.from([1])]));
    await assert.rejects(boundSemanticAssessment(dir, {...receipt, observations: [{...observation, nativeWitnesses: [alien]}]}), /outside the bound capture/);
    const cases = CORPUS.map(c => ({id: c.id, disposition: 'unresolved', note: 'No judgment inferred.', nativeWitnesses: [], blocker: 'Native review pending.'}));
    const caseReview = await store('cases.json', {sourceRevision, run, reviewer, cases});
    assert.equal((await boundCaseReview(dir, caseReview, capture)).counts.unresolved, 59);
    const missing = await store('missing-case.json', {sourceRevision, run, reviewer, cases: cases.slice(1)});
    await assert.rejects(boundCaseReview(dir, missing, capture), /59-case inventory/);
    const unboundClause = await store('unbound-clause.json', {sourceRevision, run, reviewer, cases: [{...cases[0], disposition: 'observed', nativeWitnesses: [png]}, ...cases.slice(1)]});
    await assert.rejects(boundCaseReview(dir, unboundClause, capture), /incomplete disposition/);
    const guard = {name: 'RangeError', message: 'machine.send("cart"): authored transition lasts 2 s but the event allows 1 s'};
    const guardedCapture = await store('guarded-capture.json', {sourceRevision, run, nativeAssets: [png.sha256], cases: [
      {...captureCases[0], status: 'typed-refusal', sides: [{side: 'variant', status: 'typed-refusal', mark: {guard}}]}, ...captureCases.slice(1)]});
    const prevention = {event: routes[CORPUS[0]!.id]!.event, ...guard};
    const prevented = {...cases[0], disposition: 'typed-prevention', nativeWitnesses: [png], prevention};
    const preventedReview = await store('prevented.json', {sourceRevision, run, reviewer, cases: [prevented, ...cases.slice(1)]});
    assert.equal((await boundCaseReview(dir, preventedReview, guardedCapture)).counts['typed-prevention'], 1);
    const wrongGuard = await store('wrong-guard.json', {sourceRevision, run, reviewer, cases: [{...prevented, prevention: {...prevention, event: 'another event'}}, ...cases.slice(1)]});
    await assert.rejects(boundCaseReview(dir, wrongGuard, guardedCapture), /exact captured typed guard/);
    await writeFile(join(dir, png.path), 'changed native bytes');
    await assert.rejects(boundSemanticAssessment(dir, receipt), /changed artifact/);
  } finally { await rm(dir, {recursive: true, force: true}); }
});
