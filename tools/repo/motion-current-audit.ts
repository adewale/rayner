// Reproduce from revision 5bff60e0aa5660c2b944fb59fbfe0b59e703db93:
// node --max-old-space-size=1024 tools/repo/motion-current-audit.ts
// Two bounded child processes; no synchronous native rendering. Out/ media is intentionally uncommitted.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { renderAsync } from '@resvg/resvg-js';
import { loadFonts } from '../../explain/testing.ts';
import { adoptExplainer, liveSteps, liveBase, LiveSink, runLive, scriptOf } from '../../explain/internal.ts';
import { acceptedLog } from '../../app/embed-live.ts';
import { scenariosOf, withSettings } from '../../explain/settings.ts';
import { machinesOf } from '../../explain/machine.ts';
import { Text, type Mobject, type Scene } from '../../src/index.ts';
import { mobjectId } from '../../src/mobject.ts';
import { stopAt, type Sink } from '../../src/scene.ts';
import { renderElements, toSvgString } from '../../src/svg.ts';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import { loadScene } from '../lib/explain-project.ts';
import { ROOT } from '../lib/roots.ts';
import { buildVariant } from './motion-corpus-lib.ts';
import { routes, type AuditRoute } from './motion-audit-routes.ts';
// The default continues to reproduce the frozen capture. A fresh capture has an
// explicit, separate revision/output namespace, inherited by its bounded children.
const currentAt=process.argv.indexOf('--current');
if(currentAt>=0){
  const revision=process.argv[currentAt+1],outAt=process.argv.indexOf('--out'),output=process.argv[outAt+1];
  assert.match(revision??'',/^[a-f0-9]{40}$/,'--current requires an exact source revision');
  assert.ok(outAt>=0&&output&&resolve(ROOT,output)!==resolve(ROOT,'out/current-audit-2026-11-22'),'a fresh capture needs a separate --out directory');
  process.env.RAYNER_MOTION_CAPTURE_REVISION=revision;
  process.env.RAYNER_MOTION_CAPTURE_OUTPUT=output;
}
const REVISION=process.env.RAYNER_MOTION_CAPTURE_REVISION??'5bff60e0aa5660c2b944fb59fbfe0b59e703db93';
const OUT=resolve(ROOT,process.env.RAYNER_MOTION_CAPTURE_OUTPUT??'out/current-audit-2026-11-22');
const width=800, height=450, fps=30;
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const json=(v:unknown)=>JSON.stringify(v,(_k,v)=>v instanceof RegExp?String(v):v,2)+'\n';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const decimal=(n:number)=>Number(n.toFixed(5));
const errorOf=(e:unknown)=>({name:e instanceof Error?e.name:'Unknown',message:e instanceof Error?e.message:String(e),stack:e instanceof Error?e.stack:undefined});
const guardOf=(e:unknown)=>e instanceof RangeError && /^(machine\.send\(".*"\): authored transition lasts|.*authored.*pacing)/.test(e.message);
type Source=Awaited<ReturnType<typeof loadScene>>['Scene'];
interface Mark {origin:number;end:number;duration:number;before:object;after:object;history:string[];guard?:ReturnType<typeof errorOf>}
interface Frame {sequence:number;frame:number;absolute:number;step:string|null;phase:string;svg:string;pixels:string;asset:string}
function ownership(scene:Scene) {
  const members=scene.familyMembers(),lookup=new Map(members.map(m=>[mobjectId(m),m]));
  const runs:{from:number;to:number;keys:string[];text?:string}[]=[];let prior='';
  for(const [i,rec] of renderElements(scene,{width}).entries()) {
    const m=lookup.get(rec.id);assert.ok(m,'paint ownership');const keys:string[]=[];let text:string|undefined;
    for(let p:Mobject|null=m;p;p=p.parent){if(p.key)keys.unshift(p.key);if(p instanceof Text&&text===undefined)text=p.text;}
    const signature=JSON.stringify([keys,text]);if(signature===prior)runs.at(-1)!.to=i;else {runs.push({from:i,to:i,keys,text});prior=signature;}
  }
  return {view:scene.frame.box(),runs,parts:members.filter(m=>m.key).map(m=>({key:m.key!,box:m.box()?.map(decimal),text:m instanceof Text?m.text:undefined}))};
}
async function source(file:string,route:AuditRoute){
  const loaded=await loadScene(file);adoptExplainer(loaded.Scene,file,await readFile(scriptOf(file),'utf8'),file);
  const scenarios=scenariosOf(loaded.Scene),settings=route.settings??scenarios[0]!;
  const match=scenarios.find(x=>JSON.stringify(x)===JSON.stringify(settings));assert.ok(match,'authored scenario');
  return {Source:withSettings(loaded.Scene,match),settings:match,bundledSource:loaded.sourceHash};
}
async function findStory(Source:Source,route:AuditRoute):Promise<Mark>{
  let cursor=0,previousFrame=0,previousState:object={},seen=0;const history:string[]=[];let mark:Mark|undefined;
  const scene=new Source({async frame(s){
    for(;cursor<s.evidence.length;cursor++){const e=s.evidence[cursor]!;if(e.kind!=='event')continue;
      if(s.currentStep?.path===route.step&&e.event===route.event&&++seen===(route.n??1)){
        const spec=machinesOf(s)[0]!.spec.runTime,duration=typeof spec==='number'?spec:spec({event:String(e.event),before:previousState,after:s.state});
        mark={origin:previousFrame,end:previousFrame+Math.round(duration*fps),duration,before:copy(previousState),after:copy(s.state),history:[...history]};
      }history.push(String(e.event));
    }previousFrame=s.frameCount;previousState=copy(s.state);
  }});stopAt(scene,route.step,()=>{});
  try{await scene.run();}catch(e){
    if(!guardOf(e)||scene.currentStep?.path!==route.step||!(e as Error).message.startsWith('machine.send('+JSON.stringify(route.event)+')'))throw e;
    return {origin:previousFrame,end:previousFrame,duration:0,before:copy(previousState),after:copy(scene.state),history,guard:errorOf(e)};
  }assert.ok(mark,'requested event reached');return mark;
}
function painter(dir:string){
  const frames:Frame[]=[],index:ReturnType<typeof ownership>[]=[];const encoded=new Map<string,string>();
  return {frames,async frame(scene:Scene,frame:number){
    assert.equal(scene.fps,fps);
    // Snapshot all mutable scene metadata BEFORE the asynchronous native task.
    const svg=toSvgString(scene,{width}),hash=sha(svg),absolute=scene.frameCount,step=scene.currentStep?.path??null,phase=scene.phase,own=ownership(scene);
    let pixels=encoded.get(hash);
    if(!pixels){
      const image=await renderAsync(svg,{font:{loadSystemFonts:false}});assert.equal(image.width,width);assert.equal(image.height,height);
      const nativePixels=image.pixels; // exactly one read: native getter owns an allocation
      pixels=sha(nativePixels);const png=image.asPng();
      await Promise.all([writeFile(join(dir,hash+'.svg.gz'),gzipSync(svg,{level:1})),writeFile(join(dir,hash+'.png'),png)]);encoded.set(hash,pixels);
    }
    frames.push({sequence:frames.length,frame,absolute,step,phase,svg:hash,pixels,asset:hash});index.push(own);
  },async save(){await writeFile(join(dir,'ownership.json.gz'),gzipSync(JSON.stringify(index),{level:3}));}};
}
async function capture(file:string,side:string,route:AuditRoute,output:string){
  const dir=join(output,side);await mkdir(dir,{recursive:true});const paint=painter(dir);
  let provenance:unknown,mark:Mark|undefined,reader:unknown,status='partial';
  try{
    const {Source,settings,bundledSource}=await source(file,route);provenance={settings,bundledSource,primaryText:sha(await readFile(file))};
    if(route.event==='view.sync'){
      const starts=new Map<string,number>();
      const scene=new Source({async frame(s){const step=s.currentStep?.path;if(step!=='owner'&&step!=='close')return;
        if(!starts.has(step))starts.set(step,s.frameCount);await paint.frame(s,s.frameCount-starts.get(step)!);
      }});await scene.run();const first=paint.frames[0]!,last=paint.frames.at(-1)!;
      mark={origin:first.absolute,end:last.absolute,duration:(last.absolute-first.absolute)/fps,before:{steps:[...starts.keys()]},after:{},history:[]};status='complete';
    }else if(route.log){
      const ran=await new Source(new LiveSink()).run(),live=liveSteps(ran).get(route.step);assert.ok(live,'published reader controls');
      const {machine,base}=await liveBase(Source,route.step,live);
      const published=base?acceptedLog(machine,base.state,route.log):null;
      const historical=acceptedLog(machine,copy(machine.spec.start),route.log);
      reader={requestedLog:route.log,publishedBase:base,publishedAcceptedLog:published,publishedAdmissible:!!base&&!published?.stopped&&published?.kept.length===route.log.length,
        historicalStart:{from:'start',state:machine.spec.start,acceptedLog:historical},capturePolicy:'Capture published origin only; historical forced-start footage is not silently substituted.'};
      if(!base||published?.stopped||published?.kept.length!==route.log.length){
        // The actual published page rejects this history; retain its honest resting picture only.
        const rest=await runLive(Source,route.step,live,[],{sink:{async frame(s){await paint.frame(s,0);}}});
        mark={origin:rest.scene.frameCount,end:rest.scene.frameCount,duration:0,before:copy(rest.rest),after:copy(rest.rest),history:[]};status='history-inadmissible';
      }else{
        let origin:number|undefined,before:object|undefined;
        try{const result=await runLive(Source,route.step,live,route.log,{from:base.from,animate:{async frame(s){if(origin===undefined){origin=s.frameCount;before=copy(s.state);}await paint.frame(s,s.frameCount-origin);}}});
          assert.ok(origin!==undefined&&before);mark={origin,end:paint.frames.at(-1)!.absolute,duration:(paint.frames.at(-1)!.absolute-origin)/fps,before,after:copy(result.scene.state),history:route.log.slice(0,-1)};status='complete';
        }catch(e){if(!guardOf(e))throw e;assert.ok(origin!==undefined&&before);mark={origin,end:paint.frames.at(-1)!.absolute,duration:0,before,after:copy(before),history:route.log.slice(0,-1),guard:errorOf(e)};status='typed-refusal';}
      }
    }else{
      mark=await findStory(Source,route);
      const sink:Sink={async frame(s){if(s.frameCount>=mark!.origin&&s.frameCount<=mark!.end)await paint.frame(s,s.frameCount-mark!.origin);}};
      const scene=new Source(sink);stopAt(scene,route.step,()=>{});
      try{await scene.run();}catch(e){if(!mark.guard||!guardOf(e)||(e as Error).message!==mark.guard.message)throw e;}
      assert.ok(paint.frames.length,'actual pre-event or active picture captured');
      assert.deepEqual(paint.frames.map(f=>f.frame),Array.from({length:mark.end-mark.origin+1},(_,i)=>i),'full native transition inventory');status=mark.guard?'typed-refusal':'complete';
    }
    await paint.save();
    const receipt={side,status,route,provenance,width,height,fps,mark,reader,frameCount:paint.frames.length,uniqueAssets:new Set(paint.frames.map(f=>f.asset)).size,frames:paint.frames};
    await writeFile(join(dir,'receipt.json'),json(receipt));return receipt;
  }catch(e){await paint.save();const receipt={side,status:'error',route,provenance,width,height,fps,mark,reader,error:errorOf(e),frameCount:paint.frames.length,uniqueAssets:new Set(paint.frames.map(f=>f.asset)).size,frames:paint.frames};await writeFile(join(dir,'receipt.json'),json(receipt));return receipt;}
}
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
async function contacts(output:string,a:Awaited<ReturnType<typeof capture>>,b:Awaited<ReturnType<typeof capture>>){
  await mkdir(join(output,'contacts'),{recursive:true});
  // Both sides retain their actual clocks. Rows select identical native offsets, never stretch time.
  const steps=[...new Set([...a.frames,...b.frames].map(f=>f.step))];const samples:{step:string|null;frame:number}[]=[];
  for(const step of steps){const max=Math.max(...[...a.frames,...b.frames].filter(f=>f.step===step).map(f=>f.frame));
    for(const frame of [...new Set([0,...Array.from({length:8},(_,i)=>Math.round(max*(i+1)/8))])])samples.push({step,frame});}
  const regions=[{name:'whole-stage',x:0,y:0,w:800,h:450},{name:'upper-stage',x:0,y:0,w:800,h:225},{name:'lower-stage',x:0,y:225,w:800,h:225},
    {name:'left-stage',x:0,y:0,w:400,h:450},{name:'right-stage',x:400,y:0,w:400,h:450}];
  const manifest:{name:string;crop:unknown;rows:unknown[]}[]=[];
  for(const region of regions){const tileW=400,tileH=Math.round(region.h/region.w*tileW),rowH=tileH+24;const rows:unknown[]=[];let body='';
    for(const [i,sample] of samples.entries())for(const [col,side] of [a,b].entries()){
      const found=side.frames.find(f=>f.step===sample.step&&f.frame===sample.frame);const x=col*tileW,y=i*rowH;
      body+=`<rect x="${x}" y="${y}" width="400" height="${rowH}" fill="#fff"/><text x="${x+6}" y="${y+16}" font-family="sans-serif" font-size="12">${escape(side.side+' '+sample.step+' +'+(sample.frame/fps).toFixed(3)+'s'+(!found?' [no native frame]':''))}</text>`;
      if(found){const png=await readFile(join(output,side.side,found.asset+'.png'));body+=`<svg x="${x}" y="${y+24}" width="${tileW}" height="${tileH}" viewBox="${region.x} ${region.y} ${region.w} ${region.h}"><image width="800" height="450" href="data:image/png;base64,${png.toString('base64')}"/></svg>`;}
      rows.push({row:i,side:side.side,...sample,sequence:found?.sequence,asset:found?.asset});
    }
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${samples.length*rowH}">${body}</svg>`;
    const image=await renderAsync(svg,{font:{loadSystemFonts:true}});await writeFile(join(output,'contacts',region.name+'.png'),image.asPng());manifest.push({name:region.name,crop:region,rows});
  }await writeFile(join(output,'contacts','manifest.json'),json({policy:'Matched native offsets; blank cells explicitly indicate absent frames. All crops are ordinary native PNG inputs; no generated artwork.',samples,regions:manifest}));
}
async function runCase(id:string,supplement?:{route:AuditRoute;label:string}){
  const entry=CORPUS.find(e=>e.id===id);assert.ok(entry,'known case');const route=supplement?.route??routes[id]!;const parent=supplement?join(OUT,'supplemental'):OUT;const label=supplement?id+'--'+supplement.label:id;const temp=join(parent,'.partial-'+label),final=join(parent,label);await rm(temp,{recursive:true,force:true});await mkdir(temp,{recursive:true});
  const variantId='current-'+id+'-'+randomUUID();let result:unknown;
  try{
    await loadFonts();const variant=await buildVariant({...entry,id:variantId});
    const baseline=await capture(join(ROOT,'scenes/explainers',entry.chapter,'scene.ts'),'baseline',route,temp);
    const changed=await capture(variant,'variant',route,temp);
    await contacts(temp,baseline,changed);
    result={schema:1,id,index:CORPUS.indexOf(entry),revision:REVISION,supplement:supplement?{label:supplement.label,policy:'Reviewer-requested separate route; primary inventory preserved'}:undefined,captureDriverSha256:sha(await readFile(new URL(import.meta.url))),claim:{chapter:entry.chapter,kind:entry.kind,what:entry.what,method:entry.method,historicalCommit:entry.commit},
      route,routeSha256:sha(json(route)),mutation:entry.edits,mutationSha256:sha(json(entry.edits)),provenanceOnly:true,
      baseline:{status:baseline.status,frameCount:baseline.frameCount},variant:{status:changed.status,frameCount:changed.frameCount},
      timingPolicy:'30fps authored native timing; caption holds untouched; no duration normalization. Typed refusal is never completed footage.',
      matchedInitialModel:baseline.mark&&changed.mark?JSON.stringify(baseline.mark.before)===JSON.stringify(changed.mark.before):null,
      status:baseline.status==='error'||changed.status==='error'?'error':changed.status==='typed-refusal'?'typed-refusal':changed.status==='history-inadmissible'?'history-inadmissible':'complete'};
  }catch(e){result={schema:1,id,index:CORPUS.indexOf(entry),revision:REVISION,route,status:'error',error:errorOf(e)};}
  finally{await rm(join(ROOT,'out','motion-corpus-'+variantId),{recursive:true,force:true});}
  await writeFile(join(temp,'case.json'),json(result));await rm(final,{recursive:true,force:true});await rename(temp,final);process.stdout.write(json(result));
}
async function command(cmd:string,args:string[]){return await new Promise<{code:number|null;stdout:string;stderr:string}>(resolve=>{const p=spawn(cmd,args,{cwd:ROOT,env:{...process.env,UV_THREADPOOL_SIZE:'2'},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('close',code=>resolve({code,stdout,stderr}));});}
async function index(){
  const cases:unknown[]=[];for(const [i,e] of CORPUS.entries()){try{const c=JSON.parse(await readFile(join(OUT,e.id,'case.json'),'utf8'));assert.equal(c.id,e.id);cases.push(c);}catch{cases.push({id:e.id,index:i,status:'pending'});}}
  const progress={schema:1,revision:REVISION,updated:new Date().toISOString(),expected:CORPUS.length,uniqueIds:new Set(CORPUS.map(e=>e.id)).size,completed:cases.filter((c:any)=>c.status!=='pending').length,cases};
  const path=join(OUT,'index.json.'+randomUUID()+'.tmp');await writeFile(path,json(progress));await rename(path,join(OUT,'index.json'));return progress;
}
if(process.argv[2]==='--case'){await runCase(process.argv[3]!);}else if(process.argv[2]==='--supplement'){await runCase(process.argv[3]!,{route:JSON.parse(process.argv[4]!),label:process.argv[5]!});}else{
  assert.deepEqual(Object.keys(routes).sort(),CORPUS.map(x=>x.id).sort());await mkdir(OUT,{recursive:true});
  const revision=await command('git',['rev-parse','HEAD']);assert.equal(revision.stdout.trim(),REVISION,'run on the declared capture revision');
  const sourcePaths=['src','explain','app','scenes','tools/lib','test/fixtures/motion-corpus',
    ...(process.env.RAYNER_MOTION_CAPTURE_REVISION?['tools/repo/motion-current-audit.ts','tools/repo/motion-audit-routes.ts','tools/repo/motion-corpus-lib.ts','tools/repo/motion-corpus.ts']:[])];
  const clean=await command('git',['diff','--exit-code',REVISION,'--',...sourcePaths]);assert.equal(clean.code,0,'capture source must match its declared revision');
  const fingerprints={revision:REVISION,node:process.version,renderer:'@resvg/resvg-js 2.6.2',driverSha256:sha(await readFile(new URL(import.meta.url))),routesSha256:sha(await readFile(join(ROOT,'tools/repo/motion-audit-routes.ts'))),corpusSha256:sha(await readFile(join(ROOT,'test/fixtures/motion-corpus/corpus.ts'))),packageLockSha256:sha(await readFile(join(ROOT,'package-lock.json'))),reproduce:'bash tools/repo/reproduce-motion-current-audit.sh',maxWorkers:2,maxHeapMiB:1024};
  await writeFile(join(OUT,'provenance.json'),json(fingerprints));await index();let next=0;const queue=CORPUS.slice(0,30).flatMap((entry,i)=>[entry,...(CORPUS[i+30]?[CORPUS[i+30]!]:[])]);
  async function worker(){while(next<queue.length){const entry=queue[next++]!;let existing;
    try{existing=JSON.parse(await readFile(join(OUT,entry.id,'case.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    if(existing){assert.equal(existing.id,entry.id,'existing case identity');assert.equal(existing.revision,REVISION,'existing case belongs to another capture source');
      if(['complete','typed-refusal','history-inadmissible'].includes(existing.status))continue;}
    const result=await command(process.execPath,['--max-old-space-size=1024','tools/repo/motion-current-audit.ts','--case',entry.id]);
    await writeFile(join(OUT,entry.id+'.log'),result.stdout+'\n'+result.stderr);
    if(result.code!==0){await mkdir(join(OUT,entry.id),{recursive:true});await writeFile(join(OUT,entry.id,'case.json'),json({id:entry.id,index:CORPUS.indexOf(entry),status:'child-error',exitCode:result.code,stderr:result.stderr}));}
    const progress=await index();process.stdout.write(entry.id+' '+result.code+' '+progress.completed+'/'+CORPUS.length+'\n');
  }}await Promise.all([worker(),worker()]);const completed=await index();
  assert.equal(completed.completed,CORPUS.length,'every native case must finish');
  assert.ok(completed.cases.every((c:any)=>['complete','typed-refusal','history-inadmissible'].includes(c.status)),'native capture errors must not become a successful run');
  const final=await command('git',['diff','--exit-code',REVISION,'--',...sourcePaths]);assert.equal(final.code,0,'capture source changed during the run');
}
