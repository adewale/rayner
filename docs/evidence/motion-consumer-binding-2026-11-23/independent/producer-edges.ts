import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {boundCaseReview,boundSemanticAssessment,DOMAIN_CLEARANCE_V1,semanticDigest,digest} from '../../../tools/repo/motion-semantic.ts';
import {CORPUS} from '../../../test/fixtures/motion-corpus/corpus.ts';
const dir=dirname(fileURLToPath(import.meta.url)),work=resolve(dir,'../../..'),out=resolve(dir,'producer-controls');await mkdir(out,{recursive:true});
const old=resolve('/workspace/rayner/out/root-causes-review-8151582f'),cur=resolve(work,'out/root-causes-review-2c84fcf6');
const doc=async(f:string)=>JSON.parse(await readFile(f,'utf8')),ref=async(f:string)=>({path:relative(dir,f),sha256:digest(await readFile(f))});
const save=async(name:string,v:any)=>{const file=resolve(out,name);await writeFile(file,JSON.stringify(v,null,2)+'\n');return ref(file);};
const abs=(base:string,a:any)=>({...a,path:resolve(base,a.path)});
const current=await doc(resolve(cur,'capture.json')),prior=await doc(resolve(old,'capture.json')),t=DOMAIN_CLEARANCE_V1[0]!,id=t.id;
const outer=async(mode:string)=>{
 const native=structuredClone(current),c=native.cases.find((x:any)=>x.id===id),oldc=prior.cases.find((x:any)=>x.id===id);native.provenance=abs(cur,native.provenance);
 native.cases=[c];c.caseReceipt=abs(cur,c.caseReceipt);c.contact=abs(cur,c.contact);
 c.sides=c.sides.map((s:any)=>{
   if(mode==='mixed-source' && s.side==='variant'){const stale=oldc.sides.find((k:any)=>k.side==='variant');return {...stale,receipt:abs(old,stale.receipt)};}
   return {...s,receipt:abs(cur,s.receipt)};
 });
 return {capture:await save(mode+'-capture.json',native),case:c};
};
const find={scenario:t.scenario,line:'synthetic diagnostic only',observation:{type:'finding',detail:'synthetic diagnostic only',...t.representations[0]}};
const masters=[...new Set(CORPUS.map(c=>c.chapter))].map(c=>({id:'base-'+c,status:'complete',caught:false,ms:1,findings:[],fresh:[]}));
const workers=CORPUS.map(c=>({id:c.id,status:'complete',caught:c.id===id,ms:1,findings:c.id===id?[find]:[],fresh:c.id===id?[find]:[]}));
const payload=await save('synthetic-payload.json',{comparison:'baseline-subtracted',synthetic:true,baselines:masters,results:workers});
const measurement=await save('synthetic-measurement.json',{sourceRevision:current.sourceRevision,run:current.run,comparison:'baseline-subtracted',measurementSha256:payload.sha256,payload});
const results=[];
for(const mode of ['genuine','mixed-source','missing-extra-witness']){
 const {capture,case:c}=await outer(mode);
 const frames=[];const witnesses=[];
 for(const s of c.sides){
  const ledger=await doc(s.receipt.path),f=ledger.frames[26],png=await ref(resolve(dirname(s.receipt.path),f.asset+'.png'));witnesses.push(png);
  frames.push({side:s.side,sequence:26,step:f.step,phase:f.phase,absolute:f.absolute,asset:f.asset,pngSha256:png.sha256,receiptSha256:s.receipt.sha256});
 }
 if(mode==='missing-extra-witness')witnesses.push({path:'never-generated/unsigned-extra.png',sha256:witnesses[1]!.sha256});
 const scenario=JSON.parse(t.scenario),note='Synthetic validator probe only; no classification or accuracy credit.';
 const ob={version:t.version,targetSha256:semanticDigest(t),actor:t.actor,victim:t.victim,literal:t.literal,event:t.event,phase:t.phase,caseId:id,route:c.route,scenario,note,nativeWitnesses:witnesses,witnessFrames:frames};
 const cases=CORPUS.map(e=>e.id===id?{id,disposition:'observed',note,clause:{actor:t.actor,victim:t.victim,literal:t.literal,event:t.event,phase:t.phase,observed:note},caseReceipt:abs(cur,c.caseReceipt),baselineReceipt:c.sides[0].receipt,variantReceipt:c.sides[1].receipt,settings:scenario,route:c.route,nativeWitnesses:witnesses,nativeFrameBindings:frames}:{id:e.id,disposition:'unresolved',note,blocker:'Synthetic fixture',nativeWitnesses:[]});
 const sig={schema:1,sourceRevision:current.sourceRevision,run:current.run,reviewer:'Synthetic control by Astra'},review=await save(mode+'-review.json',{...sig,cases,observations:[ob],capture});
 try{
  await boundCaseReview(dir,review,capture);const assessment=await boundSemanticAssessment(dir,{...sig,review,capture,measurement,observations:[ob]},DOMAIN_CLEARANCE_V1);
  results.push({mode,admitted:true,status:assessment[0]?.status,producer:current.sourceRevision,variantSide:signedSide(c),variantPng:witnesses[1],supplementaryCitations:witnesses.length-2});
 }catch(e){results.push({mode,admitted:false,error:String(e)});}
}
function signedSide(c:any){return {file:c.sides[1].receipt.path,bundledSource:c.sides[1].provenance.bundledSource};}
await save('results.json',{synthetic:true,results});console.log(JSON.stringify(results));
