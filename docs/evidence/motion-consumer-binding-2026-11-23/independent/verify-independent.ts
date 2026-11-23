import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
import {boundCaseReview,SEMANTIC_V3,DOMAIN_CLEARANCE_V1,semanticDigest,digest} from '../../../tools/repo/motion-semantic.ts';
const dir=dirname(fileURLToPath(import.meta.url)),read=async(name:string)=>JSON.parse(await readFile(resolve(dir,name),'utf8'));
const receipt=await read('review-receipt.json'),review=await read('review.json'),combined=await read('ratifications-before-measurement.json'),out=await boundCaseReview(dir,receipt.review,receipt.capture);
assert.deepEqual(out.counts,receipt.counts);assert.deepEqual(review.observations,combined.observations);assert.equal(combined.observations.length,5);
for(const [i,t] of [...SEMANTIC_V3,...DOMAIN_CLEARANCE_V1].entries()){const o=combined.observations[i];assert.equal(o.targetSha256,semanticDigest(t));assert.equal(o.caseId,t.id);assert.deepEqual(o.witnessFrames.map((x:any)=>x.side),['baseline','variant']);}
for(const key of ['review','capture','ratifications','v3Ratifications','domainClearanceRatification','visualInspection','independentClauses','routeLineage','nativeOwnership'])assert.equal(digest(await readFile(resolve(dir,receipt[key].path))),receipt[key].sha256);
await writeFile(resolve(dir,'review-validation.json'),JSON.stringify({sourceRevision:receipt.sourceRevision,run:receipt.run,independentCaseValidation:out.counts,receiptSha256:digest(await readFile(resolve(dir,'review-receipt.json'))),registeredTargets:combined.observations.map((x:any)=>x.version),reviewInputsOnly:true},null,2)+'\n');console.log(out.counts);
