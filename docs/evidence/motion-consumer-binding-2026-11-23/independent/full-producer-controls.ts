import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,relative,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {boundCaseReview,boundSemanticAssessment,DOMAIN_CLEARANCE_V1,digest} from '../../../tools/repo/motion-semantic.ts';
const dir=dirname(fileURLToPath(import.meta.url)),folder=resolve(dir,'full-producer-controls');
await mkdir(folder,{recursive:true});
const read=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const save=async(name:string,v:any)=>{const dest=resolve(folder,name);await writeFile(dest,JSON.stringify(v)+'\n');return {path:relative(dir,dest),sha256:digest(await readFile(dest))};};
const origin=await read(resolve(dir,'review-receipt.json')),base=dirname(resolve(dir,origin.capture.path));
const source=await read(resolve(dir,origin.review.path)),master=await read(resolve(dir,origin.capture.path));
const priorDir='/workspace/rayner/out/root-causes-review-8151582f',old=await read(resolve(priorDir,'capture.json'));
const id=DOMAIN_CLEARANCE_V1[0]!.id;
const oldSide=old.cases.find((c:any)=>c.id===id).sides.find((s:any)=>s.side==='variant'),oldFile=resolve(priorDir,oldSide.receipt.path);
const payload=(await read(resolve(dir,'producer-controls/synthetic-measurement.json'))).payload;
const meas=await save('synthetic-measurement.json',{sourceRevision:origin.sourceRevision,run:origin.run,comparison:'baseline-subtracted',measurementSha256:payload.sha256,payload});
const resolved=(a:any,base:string)=>({...a,path:resolve(base,a.path)});
const receipts=[];
for(const mode of ['original','raw-receipt-with-new-provenance','genuine-old-side','missing-extra-witness']){
 const cap=structuredClone(master),review=structuredClone(source);review.reviewer='Astra synthetic controls, full native inventory. No scores.';
 cap.provenance=resolved(cap.provenance,base);
 for(const c of cap.cases){c.caseReceipt=resolved(c.caseReceipt,base);for(const s of c.sides)s.receipt=resolved(s.receipt,base);}
 const c=cap.cases.find((c:any)=>c.id===id),rw=review.cases.find((c:any)=>c.id===id),s=c.sides.find((s:any)=>s.side==='variant');
 const isOld=['raw-receipt-with-new-provenance','genuine-old-side'].includes(mode);
 if(isOld){
  if(mode==='genuine-old-side')Object.assign(s,structuredClone(oldSide));s.receipt=resolved(oldSide.receipt,priorDir);
  rw.variantReceipt=resolved(s.receipt,priorDir);
  for(const ob of [rw,...review.observations.filter((o:any)=>o.caseId===id)]){
   for(const a of ob.nativeWitnesses)if(resolve(dir,a.path).includes('/'+id+'/variant/'))a.path=relative(dir,resolve(dirname(oldFile),basename(a.path)));
   for(const f of (ob.nativeFrameBindings??ob.witnessFrames))if(f.side==='variant'){f.receiptSha256=s.receipt.sha256;if(f.png)f.png.path=relative(dir,resolve(dirname(oldFile),basename(f.png.path)));}
  }
 }
 const ob=review.observations.find((o:any)=>o.version===DOMAIN_CLEARANCE_V1[0]!.version);
 if(mode==='missing-extra-witness'){
  const extra={path:'never-generated/unsigned-extra.png',sha256:ob.nativeWitnesses.at(-1).sha256};
  ob.nativeWitnesses.push(extra);rw.nativeWitnesses.push(extra);
 }
 const capture=await save(mode+'-capture.json',cap);review.capture=capture;
 const ra=await save(mode+'-review.json',review);
 try{
  const admitted=await boundCaseReview(dir,ra,capture);
  const findings=await boundSemanticAssessment(dir,{schema:1,sourceRevision:origin.sourceRevision,run:origin.run,reviewer:review.reviewer,review:ra,capture,measurement:meas,observations:[ob]},DOMAIN_CLEARANCE_V1);
  receipts.push({mode,nativeProducerCaseCount:cap.cases.length,sourceRevision:origin.sourceRevision,currentCaseDispositions:admitted.counts,admitted:true,status:findings[0]?.status,variantReceipt:s.receipt});
 }catch(e){receipts.push({mode,admitted:false,error:String(e),variantReceipt:s.receipt});}
}
await save('results.json',{warning:'All four are synthetic consumer controls using genuine 39 and 815 native producer files. No real independent approval or worker changes.',receipts});console.log(receipts.map(r=>[r.mode,r.admitted,r.status??r.error]));
