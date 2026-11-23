import assert from 'node:assert/strict';
import {copyFile,cp,mkdir,mkdtemp,readFile,realpath,rename,symlink,unlink,writeFile} from 'node:fs/promises';
import {dirname,basename,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {boundCaseReview,boundSemanticAssessment,digest,DOMAIN_CLEARANCE_V1} from '../../../tools/repo/motion-semantic.ts';
const dir=dirname(fileURLToPath(import.meta.url));
const old='/workspace/rayner-attempt3/out/remaining-fixes-2026-11-22/astra-attempt-3',oldFull=resolve(old,'full-producer-controls'),native=resolve(old,'../../root-causes-native-39b75450');
const t=DOMAIN_CLEARANCE_V1[0]!,id=t.id;
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const ref=async(root:string,p:string)=>({path:relative(root,p),sha256:digest(await readFile(p))});
const save=async(root:string,p:string,v:any)=>{const file=resolve(root,p);await mkdir(dirname(file),{recursive:true});await writeFile(file,JSON.stringify(v)+'\n');return ref(root,file);};
const all:any[]=[];
async function both(label:string,directory:string,review:any,capture:any,measurement:any,pattern?:RegExp){
 const r=await read(resolve(directory,review.path)),obs=r.observations.find((o:any)=>o.version===t.version);
 const inputs={schema:1 as const,sourceRevision:r.sourceRevision,run:r.run,reviewer:r.reviewer,review,capture,measurement,observations:[obs]};
 const output:any={label,synthetic:true,caseCount:(await read(resolve(directory,capture.path))).cases.length};
 for(const [key,method] of [['wholeCase',()=>boundCaseReview(directory,review,capture)],['semantic',()=>boundSemanticAssessment(directory,inputs,DOMAIN_CLEARANCE_V1)]] as const){
   let accepted=false,verdict:any,reason='';
   try{verdict=await method();accepted=true;}catch(e){reason=String(e);}
   if(pattern){assert.equal(accepted,false,label+' '+key);assert.match(reason,pattern,label+' '+key);}
   else {assert.equal(accepted,true,label+' '+key+' '+reason);if(key==='semantic')assert.equal(verdict[0].status,'semantic-target-match');}
   output[key]=accepted?{accepted:true,...(key==='wholeCase'?{counts:verdict.counts}:{status:verdict[0].status})}:{accepted:false,reason};
 }
 all.push(output);
}
// Original counterexamples remain byte-for-byte unchanged in the source-39 workspace.
const boundMeas=await ref(old,join(oldFull,'synthetic-measurement.json'));
for(const [mode,pattern] of [['original',undefined],['raw-receipt-with-new-provenance',/producer\/side file role/],['genuine-old-side',/producer\/side file role/],['missing-extra-witness',/ENOENT/]] as const){
 await both('original full 59 '+mode,old,await ref(old,join(oldFull,mode+'-review.json')),await ref(old,join(oldFull,mode+'-capture.json')),boundMeas,pattern);
}
// Genuine small paired-case archive. Copy the entire actual producer case with all
// its frames/contacts beside its genuine provenance, and use only relative archive references.
const family=await mkdtemp(resolve(dir,'relocation-')),stage=join(family,'first'),next=join(family,'moved');
await mkdir(join(stage,'native'),{recursive:true});
await cp(join(native,id),join(stage,'native',id),{recursive:true});await copyFile(join(native,'provenance.json'),join(stage,'native/provenance.json'));
const master=await read(resolve(old,'../../root-causes-review-39b75450/capture.json')),caseData=master.cases.find((c:any)=>c.id===id);
const c=structuredClone(caseData),cap={...master,cases:[c],nativeAssets:c.nativeAssets,provenance:await ref(stage,join(stage,'native/provenance.json'))};
c.caseReceipt=await ref(stage,join(stage,'native',id,'case.json'));c.contact=await ref(stage,join(stage,'native',id,'contacts/whole-stage.png'));
for(const s of c.sides)s.receipt=await ref(stage,join(stage,'native',id,s.side,'receipt.json'));
const input=await read(resolve(oldFull,'original-review.json')),row=input.cases.find((v:any)=>v.id===id),ob=input.observations.find((v:any)=>v.version===t.version);
for(const g of [row,ob]){
 for(const b of g.nativeWitnesses){const oldFile=resolve(old,b.path);b.path=relative(stage,join(stage,'native',id,basename(dirname(oldFile)),basename(oldFile)));}
 for(const b of g.nativeFrameBindings??g.witnessFrames)if(b.png)b.png.path=relative(stage,join(stage,'native',id,b.side,b.asset+'.png'));
}
row.caseReceipt=c.caseReceipt;row.baselineReceipt=c.sides.find((s:any)=>s.side==='baseline').receipt;row.variantReceipt=c.sides.find((s:any)=>s.side==='variant').receipt;
const payload=await save(stage,'synthetic-payload.json',await read(resolve(old,'producer-controls/synthetic-payload.json')));
const measure=await save(stage,'synthetic-measurement.json',{sourceRevision:master.sourceRevision,run:master.run,comparison:'baseline-subtracted',measurementSha256:payload.sha256,payload});
const capture=await save(stage,'capture.json',cap);
const rx={schema:1,sourceRevision:master.sourceRevision,run:master.run,reviewer:'Astra synthetic relative-archive controls',capture,observations:[ob],cases:input.cases.map((x:any)=>x.id===id?row:{id:x.id,disposition:'unresolved',note:'Only the selected true producer case was included in the independent relocation/control fixture.',blocker:'Fixture subset',nativeWitnesses:[]})};
const review=await save(stage,'review.json',rx);
await both('relative-only paired archive original',stage,review,capture,measure);await rename(stage,next);await both('entire intact archive after moving directory',next,review,capture,measure);
const trueFile=resolve(next,ob.nativeWitnesses.at(-1).path),same815=resolve('/workspace/rayner/out/root-causes-native-8151582f',id,'variant',basename(trueFile));assert.equal((await ref(next,trueFile)).sha256,(await ref(next,same815)).sha256);
const trash=join(next,'own-copy.png'),localLink=join(next,'true-frame-alias.png'),oldLink=join(next,'other-source-alias.png');
await copyFile(trueFile,trash);await symlink(relative(next,trueFile),localLink);await symlink(same815,oldLink);
async function extra(label:string,name:string,pattern?:RegExp){
 const v=structuredClone(rx),extra=await ref(next,join(next,name));v.observations[0].nativeWitnesses.push(extra);v.cases.find((r:any)=>r.id===id).nativeWitnesses.push(extra);
 await both(label,next,await save(next,label.replaceAll(' ','-')+'-review.json',v),capture,measure,pattern);
}
await extra('symlink to genuine bound PNG','true-frame-alias.png');
await extra('same SHA existing extra PNG','own-copy.png',/native witness lacks a frame binding/);
await extra('symlink to same SHA other-source PNG','other-source-alias.png',/native witness lacks a frame binding/);
const dots=structuredClone(rx);const dd=structuredClone(cap);
const alias=(a:any)=>({...a,path:'./native/../'+a.path});
dd.provenance=alias(dd.provenance);for(const x of dd.cases){x.caseReceipt=alias(x.caseReceipt);for(const s of x.sides)s.receipt=alias(s.receipt);}
const dotCap=await save(next,'dots-capture.json',dd);dots.capture=dotCap;
for(const g of [dots.observations[0],dots.cases.find((r:any)=>r.id===id)])g.nativeWitnesses=g.nativeWitnesses.map(alias);
await both('equivalent dot-segment producer and PNG paths',next,await save(next,'dots-review.json',dots),dotCap,measure);
const caseCopy='native/'+id+'/explicit-case-copy.json';await copyFile(resolve(next,c.caseReceipt.path),join(next,caseCopy));
const mis=structuredClone(cap),mr=structuredClone(rx);mis.cases[0].caseReceipt=await ref(next,join(next,caseCopy));const misCap=await save(next,'misplaced-capture.json',mis);mr.capture=misCap;mr.cases.find((x:any)=>x.id===id).caseReceipt=mis.cases[0].caseReceipt;
await both('same SHA case copy in wrong role',next,await save(next,'misplaced-review.json',mr),misCap,measure,/producer\/case file role/);
const archiveAlias=join(family,'archive-link');await symlink('moved',archiveAlias,'dir');
await both('complete archive reached through directory alias',archiveAlias,review,capture,measure);
const actualOldPacket=await read('/workspace/rayner/out/root-causes-review-8151582f/capture.json');
const olderSide=actualOldPacket.cases.find((r:any)=>r.id===id).sides.find((r:any)=>r.side==='variant');
const olderReceipt=resolve('/workspace/rayner/out/root-causes-review-8151582f',olderSide.receipt.path);
const currentSide=join(next,'native',id,'variant','receipt.json'),held=currentSide+'.complete-original';
await rename(currentSide,held);await symlink(olderReceipt,currentSide);
try{
  const det=structuredClone(cap),dr=structuredClone(rx),role=await ref(next,currentSide);
  det.cases[0].sides=det.cases[0].sides.map((s:any)=>s.side==='variant'?{...olderSide,receipt:role}:s);
  const drCase=dr.cases.find((r:any)=>r.id===id);drCase.variantReceipt=role;
  for(const g of [drCase,dr.observations[0]])for(const f of (g.witnessFrames??g.nativeFrameBindings))if(f.side==='variant')f.receiptSha256=role.sha256;
  const dc=await save(next,'canonical-side-symlink-capture.json',det);dr.capture=dc;
  await both('canonical side name symlinked to old producer receipt',next,await save(next,'canonical-side-symlink-review.json',dr),dc,measure,/producer\/side file role/);
}finally{await unlink(currentSide);await rename(held,currentSide);}
const doc={testedConsumerRevision:'7b95f4435a4a1b2209c6de7c924cf5c00c98d085',originalSourceWorkspace:old,relocatedCaseRoot:relative(dir,next),notes:['Authentic source-39 producer and physical originals; measurements in this file are synthetic.','The complete 15 MiB paired-case producer directory with both full ledgers and native assets was moved in one operation.','The fixture for the relocation and alias controls explicitly marks the other 58 IDs unresolved. The original four controls independently use all 59 real case entries.'],results:all};
await writeFile(join(dir,'independent-controls.json'),JSON.stringify(doc,null,2)+'\n');console.log(all.map(x=>[x.label,x.wholeCase.accepted,x.semantic.accepted]));
