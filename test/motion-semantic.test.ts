import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CORPUS } from './fixtures/motion-corpus/corpus.ts';
import { routes } from '../tools/repo/motion-audit-routes.ts';
import type { Found } from '../tools/repo/motion-corpus-lib.ts';
import { SEMANTIC_V3, boundCaseReview, boundSemanticAssessment, digest, matchesSemantic, semanticDigest, type BoundArtifact, type NativeFrameBinding, type SemanticRatification } from '../tools/repo/motion-semantic.ts';

test('separate semantic mappings retain the poll actor orientation and the forged slip exact SID victim', async () => {
  const frozen = JSON.parse(await readFile(new URL('./fixtures/motion-corpus/frozen-observations.json', import.meta.url), 'utf8'));
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
    const sides: {side:string;status:string;mark:{origin:number;end:number;duration:number};provenance:{settings:object};receipt:BoundArtifact;frameCount:number}[] = [];
    const witnesses: BoundArtifact[] = [], frames: NativeFrameBinding[] = [];
    for (const side of ['baseline', 'variant'] as const) {
      const png = await store(`native/${target.id}/${side}/${asset}.png`, pngBytes); witnesses.push(png);
      const mark = {origin: 10, end: 12, duration: 2/30};
      const provenance = {settings: scenario};
      const ledger = [0,1,2].map(sequence => ({sequence, absolute: 10+sequence, frame: sequence, step: route.step, phase: 'playing', asset, pixels: '1'.repeat(64)}));
      const receipt = await store(`native/${target.id}/${side}/receipt.json`, {side,status:'complete',route,mark,provenance,width:800,height:450,fps:30,frameCount:ledger.length,frames:ledger});
      sides.push({side,status:'complete',mark,provenance,receipt:{...receipt,path:'../'+receipt.path},frameCount:ledger.length});
      frames.push({side,sequence:1,absolute:11,step:route.step,asset,pngSha256:png.sha256,receiptSha256:receipt.sha256});
    }
    const observation = {version: target.version, targetSha256: semanticDigest(target), actor: target.actor, victim: target.victim,
      literal: target.literal, event: target.event, phase: target.phase, note: 'Synthetic positive admission only; no actual accuracy credit.', nativeWitnesses: witnesses,
      caseId:target.id,route,scenario,witnessFrames:frames};
    const cases = CORPUS.map(c => ({id:c.id,disposition:'unresolved',note:'No visual judgment inferred.',nativeWitnesses:[] as BoundArtifact[],blocker:'Synthetic review pending.'}));
    const row = {...cases[1]!,id:target.id,disposition:'observed',nativeWitnesses:witnesses,settings:scenario,route,nativeFrameBindings:frames,
      clause:{actor:target.actor,victim:target.victim,literal:target.literal,event:target.event,phase:target.phase,observed:'Synthetic positive control.'}};
    const reviewCases = cases.map(c => c.id === target.id ? row : c);
    const captureCases = CORPUS.map(c => ({id:c.id,route:routes[c.id],status:'complete',nativeAssets:c.id===target.id?[witnesses[0]!.sha256]:[],sides:c.id===target.id?sides:[]}));
    const driverSha256='d'.repeat(64);
    const producer=await store('native/provenance.json',{revision:sourceRevision,run,driverSha256});
    const actualCase=await store(`native/${target.id}/case.json`,{id:target.id,revision:sourceRevision,route,status:'complete',captureDriverSha256:driverSha256,
      baseline:{status:'complete',frameCount:3},variant:{status:'complete',frameCount:3}});
    const captureData = {sourceRevision,run,provenance:{...producer,path:'../'+producer.path},nativeAssets:[witnesses[0]!.sha256],
      cases:captureCases.map(c=>c.id===target.id?{...c,caseReceipt:{...actualCase,path:'../'+actualCase.path}}:c)};
    const capture = await store('packet/capture.json',captureData);
    const reviewData = {sourceRevision,run,reviewer,capture,cases:reviewCases,observations:[observation]};
    const review = await store('review.json', reviewData);
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
    await assert.rejects(boundCaseReview(dir,baselineOnly,refusedCapture),/capture binding|side\/route\/scenario|completed variant/);
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

    // Four further independent contradictions. Keep their authentic ledgers and
    // producer fixed while adversarial envelope/reviewer claims are changed.
    const unrelated={...observation,route:{...route,step:'unrelated'}};
    const unrelatedReview=await store('unrelated-step.json',{...reviewData,cases:reviewCases.map(c=>c.id===target.id?{...row,route:unrelated.route}:c),observations:[unrelated]});
    await assert.rejects(boundSemanticAssessment(dir,{...receipt,review:unrelatedReview,observations:[unrelated]}),/route mismatch/);
    const contradictory=await measurementFor('complete-with-refusal',{comparison:'baseline-subtracted',baselines,results:results.map(r=>r.id===target.id?worker(r.id,[found,
      {scenario:target.scenario,line:'typed execution refusal',observation:{type:'refusal',kind:'duration guard',name:'RangeError',message:'authored transition lasts too long',event:'sign-in'}}]):r)});
    await assert.rejects(boundSemanticAssessment(dir,{...receipt,measurement:contradictory}),/complete worker contains typed execution refusal/);
    const anotherSource='b'.repeat(40),anotherRun='relabeled-run';
    const relabeledCapture=await store('packet/relabeled-capture.json',{...captureData,sourceRevision:anotherSource,run:anotherRun});
    const relabeledReview=await store('relabeled-review.json',{...reviewData,sourceRevision:anotherSource,run:anotherRun,capture:relabeledCapture});
    const relabeledEnvelope=await store('relabeled-measurement.json',{...JSON.parse(await readFile(join(dir,measurement.path),'utf8')),sourceRevision:anotherSource,run:anotherRun});
    await assert.rejects(boundSemanticAssessment(dir,{...receipt,sourceRevision:anotherSource,run:anotherRun,review:relabeledReview,capture:relabeledCapture,measurement:relabeledEnvelope}),/producer source\/run/);
    const differentCapture=await store('packet/different-capture.json',captureData);
    await assert.rejects(boundSemanticAssessment(dir,{...receipt,capture:differentCapture}),/approved capture binding/);
    const rejectBoth=async (review:BoundArtifact, capture:BoundArtifact, observations=receipt.observations, pattern:RegExp) => {
      await assert.rejects(boundCaseReview(dir,review,capture),pattern);
      await assert.rejects(boundSemanticAssessment(dir,{...receipt,review,capture,observations}),pattern);
    };
    // A citation is the actual frame file, not any path carrying its digest.
    for (const extra of [{path:'never-generated/unsigned-extra.png',sha256:witnesses[1]!.sha256},
      await store(`native/${target.id}/variant/not-a-frame.png`,pngBytes)]) {
      const citation={...observation,nativeWitnesses:[...witnesses,extra]};
      const extraReview=await store('extra-citation-review.json',{...reviewData,observations:[citation],cases:reviewCases.map(c=>c.id===target.id?{...row,nativeWitnesses:citation.nativeWitnesses}:c)});
      await rejectBoth(extraReview,capture,[citation],/ENOENT|native witness lacks a frame binding/);
    }
    const aliasWitnesses=witnesses.map(w=>({...w,path:'./native/../'+w.path}));
    const aliasFrames=frames.map((f,i)=>({...f,png:witnesses[i]!}));
    const aliasObservation={...observation,nativeWitnesses:aliasWitnesses,witnessFrames:aliasFrames};
    const aliasCapture=await store('packet/alias-capture.json',{...captureData,provenance:{...captureData.provenance,path:'../native/../'+producer.path},
      cases:captureData.cases.map(c=>c.id===target.id?{...c,caseReceipt:{...actualCase,path:'../native/../'+actualCase.path},sides:sides.map(s=>({...s,receipt:{...s.receipt,path:'../native/../'+s.receipt.path.slice(3)}}))}:c)});
    const aliasReview=await store('alias-review.json',{...reviewData,capture:aliasCapture,observations:[aliasObservation],cases:reviewCases.map(c=>c.id===target.id?{...row,nativeWitnesses:aliasWitnesses,nativeFrameBindings:aliasFrames}:c)});
    assert.equal((await boundCaseReview(dir,aliasReview,aliasCapture)).counts.observed,1);
    assert.equal((await boundSemanticAssessment(dir,{...receipt,review:aliasReview,capture:aliasCapture,observations:[aliasObservation]}))[0]!.status,'semantic-target-match','equivalent relative citation and producer paths retain their real file roles');
    const relocated=await mkdtemp(join(tmpdir(),'rayner-semantic-relocated-'));
    try {
      await cp(dir,relocated,{recursive:true});
      assert.equal((await boundCaseReview(relocated,review,capture)).counts.observed,1);
      assert.equal((await boundSemanticAssessment(relocated,receipt))[0]!.status,'semantic-target-match','moving an intact relative archive preserves its source/run');
    }finally{await rm(relocated,{recursive:true,force:true});}
    const caseBytes=await readFile(join(dir,actualCase.path));
    const foreignCase=await store(`native/${target.id}/case-copy.json`,caseBytes);
    const misplacedCapture=await store('packet/misplaced-case.json',{...captureData,cases:captureData.cases.map(c=>c.id===target.id?{...c,caseReceipt:{...foreignCase,path:'../'+foreignCase.path}}:c)});
    const misplacedReview=await store('misplaced-case-review.json',{...reviewData,capture:misplacedCapture});
    await rejectBoth(misplacedReview,misplacedCapture,receipt.observations,/producer\/case file role/);
    // Both old summary and old ledger agree; their native pixels are identical.
    // They still belong to another producer tree with different ownership metadata.
    await cp(join(dir,'native'),join(dir,'older-native'),{recursive:true});
    await store('older-native/provenance.json',{revision:'b'.repeat(40),run:'older-native-run',driverSha256});
    await store(`older-native/${target.id}/case.json`,{...JSON.parse(caseBytes.toString()),revision:'b'.repeat(40)});
    const originalSideBytes=await readFile(join(dir,sides[1]!.receipt.path.slice(3))),originalLedger=JSON.parse(originalSideBytes.toString());
    const oldProvenance={...sides[1]!.provenance,bundledSource:'f'.repeat(64)};
    const oldSide=await store(`older-native/${target.id}/variant/receipt.json`,{...originalLedger,provenance:oldProvenance});
    const oldPng={...witnesses[1]!,path:witnesses[1]!.path.replace('native/','older-native/')};
    const mixedWitnesses=[witnesses[0]!,oldPng],mixedFrames=[frames[0]!,{...frames[1]!,receiptSha256:oldSide.sha256}];
    const mixedObservation={...observation,nativeWitnesses:mixedWitnesses,witnessFrames:mixedFrames};
    const mixedCapture=await store('packet/mixed-side.json',{...captureData,cases:captureData.cases.map(c=>c.id===target.id?{...c,sides:[sides[0],{...sides[1],provenance:oldProvenance,receipt:{...oldSide,path:'../'+oldSide.path}}]}:c)});
    const mixedReview=await store('mixed-side-review.json',{...reviewData,capture:mixedCapture,observations:[mixedObservation],cases:reviewCases.map(c=>c.id===target.id?{...row,nativeWitnesses:mixedWitnesses,nativeFrameBindings:mixedFrames}:c)});
    await rejectBoth(mixedReview,mixedCapture,[mixedObservation],/producer\/side file role/);
    for (const change of [{id:'wrong-case'},{revision:'c'.repeat(40)},{route:{...route,step:'wrong'}},{status:'typed-refusal'},
      {captureDriverSha256:'e'.repeat(64)},{variant:{status:'typed-refusal',frameCount:3}}]) {
      const badCase=await store(actualCase.path,{...JSON.parse(caseBytes.toString()),...change});
      const badCapture=await store('packet/altered-case-capture.json',{...captureData,cases:captureData.cases.map(c=>c.id===target.id?{...c,caseReceipt:{...badCase,path:'../'+badCase.path}}:c)});
      const badReview=await store('altered-case-review.json',{...reviewData,capture:badCapture});
      await assert.rejects(boundSemanticAssessment(dir,{...receipt,capture:badCapture,review:badReview}),/producer\/case|side\/route\/scenario\/ledger/);
    }
    await writeFile(join(dir,actualCase.path),caseBytes);
    const nonReproducing=async (name:string,extra:object={})=>store(name,{...reviewData,cases:reviewCases.map(c=>c.id===target.id?{...row,disposition:'non-reproducing',...extra}:c)});
    assert.equal((await boundCaseReview(dir,await nonReproducing('actually-identical.json'),capture)).counts['non-reproducing'],1);
    // Alter only the actual variant pixels, preserving honest side/case receipts.
    const side=sides[1]!, ledger=JSON.parse(await readFile(join(dir,side.receipt.path.slice(3)),'utf8'));
    ledger.frames[2].pixels='2'.repeat(64);
    const changedSide=await store(`native/${target.id}/variant/receipt.json`,ledger);
    const different=await store('packet/pixel-different.json',{...captureData,cases:captureData.cases.map(c=>c.id===target.id?{...c,sides:[sides[0],{...side,receipt:{...changedSide,path:'../'+changedSide.path}}]}:c)});
    const differentFrames=frames.map(f=>f.side==='variant'?{...f,receiptSha256:changedSide.sha256}:f);
    const unequalReview=await store('unequal-review.json',{...reviewData,capture:different,cases:reviewCases.map(c=>c.id===target.id?{...row,disposition:'non-reproducing',nativeFrameBindings:[frames[0]],nativeWitnesses:[witnesses[0]],fullPixelEqualPairs:999}:c)});
    await assert.rejects(boundCaseReview(dir,unequalReview,different),/full-route pixel identity/);
    const scopedReview=await store('scoped-review.json',{...reviewData,capture:different,cases:reviewCases.map(c=>c.id===target.id?{...row,disposition:'non-reproducing',nativeFrameBindings:differentFrames,nonReproduction:{basis:'scoped-visual',scope:'Only the independently reviewed event frames, no full-route identity claim.'}}:c)});
    assert.equal((await boundCaseReview(dir,scopedReview,different)).counts['non-reproducing'],1);
    const scopedBaselineOnly=await store('scoped-baseline-only.json',{...JSON.parse(await readFile(join(dir,scopedReview.path),'utf8')),cases:reviewCases.map(c=>c.id===target.id?{...row,disposition:'non-reproducing',nativeFrameBindings:[frames[0]],nativeWitnesses:[witnesses[0]],nonReproduction:{basis:'scoped-visual',scope:'One baseline is insufficient.'}}:c)});
    await assert.rejects(boundCaseReview(dir,scopedBaselineOnly,different),/both completed event sides/);
    const truncatedSide=await store(`native/${target.id}/variant/receipt.json`,{...ledger,frameCount:1,frames:ledger.frames.slice(0,1)});
    const truncatedCase=await store(actualCase.path,{...JSON.parse(caseBytes.toString()),variant:{status:'complete',frameCount:1}});
    const truncatedCapture=await store('packet/truncated-capture.json',{...captureData,cases:captureData.cases.map(c=>c.id===target.id?{...c,caseReceipt:{...truncatedCase,path:'../'+truncatedCase.path},sides:[sides[0],{...side,frameCount:1,receipt:{...truncatedSide,path:'../'+truncatedSide.path}}]}:c)});
    const truncatedReview=await store('truncated-review.json',{...reviewData,capture:truncatedCapture});
    await assert.rejects(boundCaseReview(dir,truncatedReview,truncatedCapture),/side\/route\/scenario\/ledger/,'matching fabricated counts cannot omit the actual event clock');
    await writeFile(join(dir,actualCase.path),caseBytes);await writeFile(join(dir,sides[1]!.receipt.path.slice(3)),originalSideBytes);
    await writeFile(join(dir,witnesses[1]!.path),'changed native bytes');
    await assert.rejects(boundSemanticAssessment(dir,receipt),/changed artifact/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
