import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SEMANTIC_V3,boundSemanticAssessment,boundCaseReview,digest} from '../../../tools/repo/motion-semantic.ts';
import {CORPUS} from '../../../test/fixtures/motion-corpus/corpus.ts';
const dir='/workspace/rayner/out/remaining-fixes-2026-11-22/astra-attempt-2',out=resolve(dirname(fileURLToPath(import.meta.url)),'admission-controls');await mkdir(out,{recursive:true});
const read=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const stored=async(file:string,v:unknown)=>{const b=JSON.stringify(v,null,2)+'\n';await writeFile(resolve(out,file),b);return {path:resolve(out,file),sha256:digest(b)};};
const bound=async(file:string)=>({path:relative(dir,file),sha256:digest(await readFile(file))});
const signed=await read(resolve(dir,'ratifications-before-measurement.json')), review=await read(resolve(dir,signed.review.path)),target=SEMANTIC_V3[0]!;
const {counts}=await boundCaseReview(dir,signed.review,signed.capture);
const ob=review.observations.find((o:any)=>o.version===target.version),found={scenario:target.scenario,line:'synthetic control; has no accuracy credit',
 observation:{type:'finding',detail:'synthetic case-binding control only',...target.representations[0]}};
const workers=CORPUS.map(c=>({id:c.id,status:'complete',caught:c.id===target.id,ms:1,findings:c.id===target.id?[found]:[],fresh:c.id===target.id?[found]:[]}));
const chambers=[...new Set(CORPUS.map(c=>c.chapter))].map(c=>({id:'base-'+c,status:'complete',caught:false,ms:1,findings:[],fresh:[]}));
const env=async(name:string,comparison:string,baselines:any[],results=workers,sig=signed)=>{
 const payload=await stored(name+'-payload.json',{synthetic:true,comparison,baselines,results});
 return stored(name+'-envelope.json',{synthetic:true,sourceRevision:sig.sourceRevision,run:sig.run,comparison:'baseline-subtracted',measurementSha256:payload.sha256,payload});};
const measurement=await env('positive','baseline-subtracted',chambers),base={...signed,measurement,observations:[ob]};
const native=resolve(dir,'../../root-causes-native-8151582f');
const getFrame=async(id:string,side:string,seq:number)=>{
 const path=resolve(native,id,side,'receipt.json'),r=await read(path),f=r.frames[seq],png=await bound(resolve(native,id,side,f.asset+'.png'));
 return {png,binding:{side,sequence:seq,absolute:f.absolute,asset:f.asset,frame:f.frame,step:f.step,phase:f.phase,receiptSha256:(await bound(path)).sha256,pngSha256:png.sha256}};};
const results:any[]=[];
const assess=async(label:string,r:any)=>{
 try{const states=await boundSemanticAssessment(dir,r);results.push({label,synthetic:true,admitted:true,status:states[0]!.status});}
 catch(e){results.push({label,synthetic:true,admitted:false,error:String(e)});} };
const caseCheck=async(label:string,file:any,cap=signed.capture)=>{
 try{const r=await boundCaseReview(dir,file,cap);results.push({label,synthetic:true,admitted:true,counts:r.counts});}
 catch(e){results.push({label,synthetic:true,admitted:false,error:String(e)});} };
const zero=await getFrame(target.id,'baseline',0);
await assess('positive: original 815 approval and native witnesses with synthetic complete workers',base);
await assess('previous negative: changed receipt note and substituted baseline start, authentic review unchanged',{...base,observations:[{...ob,note:'Changed receipt.',nativeWitnesses:[zero.png],witnessFrames:[zero.binding]}]});
await assess('previous negative: saved observation has wrong actor, victim, no witness and explicitly denied observation',{...base,review:await stored('wrong-review.json',{...review,observations:[{version:ob.version,targetSha256:ob.targetSha256,actor:'wrong actor',victim:'wrong victim',note:'I did not observe this.',nativeWitnesses:[]}]})});
await assess('previous negative: payload variants-only and no baselines, contrary envelope mode',{...base,measurement:await env('variants-only','variants-only',[])});
await assess('previous negative: case finding copied from baseline so submitted fresh must not match',{...base,measurement:await env('unsubtracted','baseline-subtracted',chambers.map(c=>c.id==='base-poppy'?{...c,findings:[found],fresh:[found]}:c))});
const typed='browser-message-across-stage',bf=await getFrame(typed,'baseline',20);
await caseCheck('previous negative: completed observation asserted after actual typed refusal, with authentic baseline20 only',await stored('typed-as-observed.json',{...review,cases:review.cases.map((c:any)=>c.id!==typed?c:{...c,disposition:'observed',note:'Synthetic invented later trip.',nativeWitnesses:[bf.png],nativeFrameBindings:[bf.binding],clause:{actor:'message',victim:'agent',event:'phish',phase:'later trip',observed:'fictitious post-refusal trip'}})}));
// The independent file and its receipt agree on their declaration here. The
// captured route still has its real source step, so exact route admission can
// certify this deterministic field without guessing visual truth.
const alteredRoute={...ob.route,step:'unrelated-step'},wrongRouteOb={...ob,route:alteredRoute};
const wrongRoute=await stored('wrong-route.json',{...review,observations:[wrongRouteOb],cases:review.cases.map((c:any)=>c.id!==target.id?c:{...c,route:alteredRoute})});
await assess('new control: observed source step is unrelated to genuine captured approve step',{...base,review:wrongRoute,observations:[wrongRouteOb]});
await caseCheck('same unrelated source-step artifact at separate whole-case admission',wrongRoute);
const refusal={scenario:target.scenario,line:'duration guard: synthetic deliberately incomplete replay',observation:{type:'refusal',kind:'duration guard',name:'RangeError',event:target.event,message:'synthetic replay stopped early'}};
await assess('new control: worker marked complete contains typed execution refusal alongside positive relationship',{...base,measurement:await env('ambiguous-worker','baseline-subtracted',chambers,workers.map(r=>r.id===target.id?{...r,findings:[...r.findings,refusal],fresh:[...r.fresh,refusal]}:r) as any)});
const cpath=resolve(dir,signed.capture.path),capture=await read(cpath),fakeDigest='4'.repeat(40),fakeRun='synthetic-wrong-source';
const ref=(r:any)=>({...r,path:relative(out,resolve(dirname(cpath),r.path))});
const differentlyLabelled=await stored('relabeled-capture.json',{...capture,sourceRevision:fakeDigest,run:fakeRun,provenance:ref(capture.provenance),cases:capture.cases.map((c:any)=>({...c,caseReceipt:ref(c.caseReceipt),sides:c.sides.map((s:any)=>({...s,receipt:ref(s.receipt)})),contact:ref(c.contact)}))});
const fakeSig={sourceRevision:fakeDigest,run:fakeRun};
const fakeReview=await stored('relabeled-review.json',{...review,...fakeSig,capture:differentlyLabelled});
await assess('new control: capture and envelopes declare a different revision while all capture-producer provenance and original case receipts explicitly declare 8151582f',{...base,...fakeSig,capture:differentlyLabelled,review:fakeReview,measurement:await env('wrong-source','baseline-subtracted',chambers,workers,fakeSig)});
const only=await getFrame(target.id,'baseline',0);
await caseCheck('new control: positive Poppy variant declared full pixel-equal non-reproduction using only baseline starting picture',await stored('contradictory-nonrep.json',{...review,cases:review.cases.map((c:any)=>c.id!==target.id?c:{...c,disposition:'non-reproducing',note:'Synthetic explicit claim: every full-route pair is identical.',nativeWitnesses:[only.png],nativeFrameBindings:[only.binding],pairing:{...c.pairing,identicalNativePixelHashesAtMatchedSequence:c.pairing.matchedSequenceCount}})}));
await stored('results.json',{counts,savedReview:signed.review,measurementsAreSynthetic:true,results});console.log(JSON.stringify(results.map(x=>[x.label,x.status??x.error??'admitted'])));
