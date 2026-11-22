import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CORPUS } from './fixtures/motion-corpus/corpus.ts';
import { routes } from '../tools/repo/motion-audit-routes.ts';
import type { Found } from '../tools/repo/motion-corpus-lib.ts';
import { SEMANTIC_V3, boundCaseReview, boundSemanticAssessment, digest, matchesSemantic, semanticDigest, type BoundArtifact, type NativeFrameBinding, type SemanticRatification } from '../tools/repo/motion-semantic.ts';

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

test('semantic admission uses the exact approved relation, variant event frame and recomputed baseline subtraction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-semantic-'));
  const store = async (path: string, value: unknown): Promise<BoundArtifact> => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    await mkdir(dirname(join(dir, path)), {recursive: true});
    await writeFile(join(dir, path), bytes); return {path, sha256: digest(bytes)};
  };
  try {
    const target = SEMANTIC_V3[0]!, representation = target.representations[0]!;
    const found: Found = {scenario: target.scenario, line: 'synthetic admission control only', observation: {
      type: 'finding', ...representation, detail: 'synthetic named glyph core interrupted'}};
    const worker = (id: string, findings: Found[] = []) => ({id, status: 'complete', caught: false, ms: 1, findings, fresh: findings});
    const results = CORPUS.map(c => worker(c.id, c.id === target.id ? [found] : []));
    const baselines = [...new Set(CORPUS.map(c => c.chapter))].map(c => worker('base-'+c));
    const sourceRevision = 'a'.repeat(40), run = 'semantic-test-run', reviewer = 'independent-native-reviewer';
    const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
    const route = routes[target.id]!, scenario = JSON.parse(target.scenario), asset = 'f'.repeat(64);
    const sides: {side:string;status:string;mark:{origin:number;end:number;duration:number};provenance:{settings:object};receipt:BoundArtifact}[] = [];
    const witnesses: BoundArtifact[] = [], frames: NativeFrameBinding[] = [];
    for (const side of ['baseline', 'variant'] as const) {
      const png = await store(`native/${target.id}/${side}/${asset}.png`, pngBytes); witnesses.push(png);
      const mark = {origin: 10, end: 12, duration: 2/30};
      const provenance = {settings: scenario};
      const ledger = [0,1,2].map(sequence => ({sequence, absolute: 10+sequence, frame: sequence, step: route.step, phase: 'playing', asset, pixels: '1'.repeat(64)}));
      const receipt = await store(`native/${target.id}/${side}/receipt.json`, {side,status:'complete',route,mark,provenance,frames:ledger});
      sides.push({side,status:'complete',mark,provenance,receipt:{...receipt,path:'../'+receipt.path}});
      frames.push({side,sequence:1,absolute:11,step:route.step,asset,pngSha256:png.sha256,receiptSha256:receipt.sha256});
    }
    const observation = {version: target.version, targetSha256: semanticDigest(target), actor: target.actor, victim: target.victim,
      literal: target.literal, event: target.event, phase: target.phase, note: 'Synthetic positive admission only; no actual accuracy credit.', nativeWitnesses: witnesses,
      caseId:target.id,route,scenario,witnessFrames:frames};
    const cases = CORPUS.map(c => ({id:c.id,disposition:'unresolved',note:'No visual judgment inferred.',nativeWitnesses:[] as BoundArtifact[],blocker:'Synthetic review pending.'}));
    const row = {...cases[1]!,id:target.id,disposition:'observed',nativeWitnesses:witnesses,settings:scenario,route,nativeFrameBindings:frames,
      clause:{actor:target.actor,victim:target.victim,literal:target.literal,event:target.event,phase:target.phase,observed:'Synthetic positive control.'}};
    const reviewCases = cases.map(c => c.id === target.id ? row : c);
    const reviewData = {sourceRevision,run,reviewer,cases:reviewCases,observations:[observation]};
    const review = await store('review.json', reviewData);
    const captureCases = CORPUS.map(c => ({id:c.id,route:routes[c.id],status:'complete',nativeAssets:c.id===target.id?[witnesses[0]!.sha256]:[],sides:c.id===target.id?sides:[]}));
    const captureData = {sourceRevision,run,nativeAssets:[witnesses[0]!.sha256],cases:captureCases};
    const capture = await store('packet/capture.json',captureData);
    const measurementFor = async (name: string, payloadData: unknown) => {
      const payload=await store(name+'-workers.json',payloadData);
      return store(name+'-measurement.json',{sourceRevision,run,comparison:'baseline-subtracted',measurementSha256:payload.sha256,payload});
    };
    const measurement = await measurementFor('positive',{comparison:'baseline-subtracted',baselines,results});
    const receipt: SemanticRatification = {schema:1,sourceRevision,run,reviewer,review,capture,measurement,observations:[observation]};
    assert.equal((await boundSemanticAssessment(dir,receipt))[0]!.status,'semantic-target-match');
    assert.equal((await boundCaseReview(dir,review,capture)).counts.observed,1);
    // Astra's five false-admission classes, with a genuine positive ledger role.
    await assert.rejects(boundSemanticAssessment(dir,{...receipt,observations:[{...observation,note:'Unseen starting frame.',nativeWitnesses:[witnesses[0]!]}]}),/different relation/);
    const deniedReview=await store('denied-review.json',{...reviewData,observations:[{...observation,actor:'another actor',victim:'another victim',note:'I did not observe this.',nativeWitnesses:[]}]});
    await assert.rejects(boundSemanticAssessment(dir,{...receipt,review:deniedReview}),/different relation/);
    const variantsOnly=await measurementFor('variants-only',{comparison:'variants-only',baselines:[],results});
    await assert.rejects(boundSemanticAssessment(dir,{...receipt,measurement:variantsOnly}),/not baseline-subtracted/);
    const noBaselines=await measurementFor('no-baselines',{comparison:'baseline-subtracted',baselines:[],results});
    await assert.rejects(boundSemanticAssessment(dir,{...receipt,measurement:noBaselines}),/baseline inventory/);
    const duplicate=await measurementFor('duplicate-base',{comparison:'baseline-subtracted',baselines:baselines.map(b=>b.id==='base-poppy'?worker(b.id,[found]):b),results});
    assert.equal((await boundSemanticAssessment(dir,{...receipt,measurement:duplicate}))[0]!.status,'semantic-target-miss','a baseline finding cannot be fresh because the caller said so');
    const refusedSides=sides.map(s=>s.side==='variant'?{...s,status:'typed-refusal',mark:{origin:10,end:10,duration:0}}:s);
    const refusedCapture=await store('packet/refused.json',{...captureData,cases:captureCases.map(c=>c.id===target.id?{...c,status:'typed-refusal',sides:refusedSides}:c)});
    const baselineOnly=await store('baseline-only-review.json',{...reviewData,cases:reviewCases.map(c=>c.id===target.id?{...row,nativeWitnesses:[witnesses[0]],nativeFrameBindings:[frames[0]]}:c)});
    await assert.rejects(boundCaseReview(dir,baselineOnly,refusedCapture),/side\/route\/scenario|completed variant/);
    // Same case, wrong runtime phase or pre-event variant role must also reject,
    // even when a new saved file honestly repeats the invalid claim.
    for (const changed of [{...frames[1]!,phase:'waiting'}, {...frames[1]!,sequence:0,absolute:10}]) {
      const altered={...observation,witnessFrames:[frames[0]!,changed]};
      const alteredReview=await store('altered-review.json',{...reviewData,observations:[altered]});
      await assert.rejects(boundSemanticAssessment(dir,{...receipt,review:alteredReview,observations:[altered]}),/phase binding|completed variant/);
    }
    for (const change of [{sourceRevision:'b'.repeat(40)},{run:'another-run'},{reviewer:'another-reviewer'}])
      await assert.rejects(boundSemanticAssessment(dir,{...receipt,...change}),/binding mismatch/);
    const wrongCase=await store('wrong-case-review.json',{...reviewData,observations:[{...observation,caseId:CORPUS[0]!.id}]});
    await assert.rejects(boundSemanticAssessment(dir,{...receipt,review:wrongCase,observations:[{...observation,caseId:CORPUS[0]!.id}]}),/case\/scenario\/relation/);
    const missing=await store('missing.json',{...reviewData,cases:reviewCases.slice(1)});
    await assert.rejects(boundCaseReview(dir,missing,capture),/59-case inventory/);
    await writeFile(join(dir,witnesses[1]!.path),'changed native bytes');
    await assert.rejects(boundSemanticAssessment(dir,receipt),/changed artifact/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
