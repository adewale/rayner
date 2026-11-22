// Verify retained native inputs and package compact review receipts (hashes are provenance only).
// node tools/repo/motion-current-audit-package.ts [capture-dir] [evidence-dir]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import { routes } from './motion-audit-routes.ts';
import { ROOT } from '../lib/roots.ts';
const input=resolve(process.argv[2]??join(ROOT,'out/current-audit-2026-11-22'));
const output=resolve(process.argv[3]??join(ROOT,'docs/evidence/motion-current-audit-2026-11-22'));
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
const receipts:unknown[]=[],assets:unknown[]=[],summary:any[]=[];let totalFrames=0;
await mkdir(join(output,'witnesses'),{recursive:true});
async function imageContact(source:string,destination:string){await new Promise<void>((resolve,reject)=>{const child=spawn('convert',[source,'-quality','82',destination],{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);child.on('close',code=>code===0?resolve():reject(new Error(stderr)));});}
async function verifyCase(id:string,dir:string,supplement=false){
  const data=JSON.parse(await readFile(join(dir,'case.json'),'utf8'));assert.equal(data.id,id);assert.ok(['complete','typed-refusal','history-inadmissible'].includes(data.status),'explicit capture status');
  if(!supplement){assert.deepEqual(data.route,JSON.parse(JSON.stringify(routes[id])));assert.equal(data.revision,'5bff60e0aa5660c2b944fb59fbfe0b59e703db93');}
  const sides:any[]=[];
  for(const side of ['baseline','variant']){
    const text=await readFile(join(dir,side,'receipt.json'),'utf8'),receipt=JSON.parse(text);assert.equal(receipt.side,side);assert.equal(receipt.fps,30);assert.equal(receipt.width,800);assert.equal(receipt.height,450);
    assert.equal(receipt.frameCount,receipt.frames.length);assert.ok(receipt.frameCount>0);assert.ok(!receipt.error);assert.deepEqual(receipt.route,data.route);
    const ownership=JSON.parse(gunzipSync(await readFile(join(dir,side,'ownership.json.gz'))).toString());assert.equal(ownership.length,receipt.frameCount);
    const unique=new Set<string>();
    for(const [i,frame] of receipt.frames.entries()){
      assert.equal(frame.sequence,i);assert.equal(frame.svg,frame.asset);assert.match(frame.pixels,/^[0-9a-f]{64}$/);assert.ok(Number.isInteger(frame.absolute)&&Number.isInteger(frame.frame));
      if(unique.has(frame.asset))continue;unique.add(frame.asset);
      const svgGz=await readFile(join(dir,side,frame.asset+'.svg.gz')),svg=gunzipSync(svgGz);assert.equal(sha(svg),frame.svg,'immutable SVG snapshot hash');
      const png=await readFile(join(dir,side,frame.asset+'.png'));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),800);assert.equal(png.readUInt32BE(20),450);
      assets.push({id,label:supplement?data.supplement?.label:null,side,asset:frame.asset,svgGzSha256:sha(svgGz),pngSha256:sha(png)});
    }
    assert.equal(receipt.uniqueAssets,unique.size);
    if(receipt.status==='typed-refusal'){assert.ok(receipt.mark.guard);assert.equal(receipt.mark.duration,0);assert.equal(receipt.frameCount,1,'refused primary event is not completed footage');}
    if(receipt.reader){const r=receipt.reader;if(receipt.status==='history-inadmissible')assert.equal(r.publishedAdmissible,false);else assert.equal(r.publishedAdmissible,true);}
    totalFrames+=receipt.frameCount;sides.push(receipt);receipts.push({id,label:supplement?data.supplement?.label:null,side,receiptSha256:sha(text),receipt});
  }
  assert.deepEqual(sides[0].provenance.settings,sides[1].provenance.settings,'matched scenario settings');
  if(!supplement&&data.status==='complete')assert.deepEqual(sides[0].mark.before,sides[1].mark.before,'matched initial model');
  const label=supplement?id+'--'+data.supplement.label:id;
  await imageContact(join(dir,'contacts/whole-stage.png'),join(output,'witnesses',label+'.jpg'));
  await copyFile(join(dir,'contacts/manifest.json'),join(output,'witnesses',label+'.json'));
  summary.push({...data,witness:'witnesses/'+label+'.jpg',sideReceipts:sides.map(r=>({side:r.side,status:r.status,frameCount:r.frameCount,uniqueAssets:r.uniqueAssets,origin:r.mark.origin,end:r.mark.end,duration:r.mark.duration,guard:r.mark.guard,reader:r.reader}))});
}
const index=JSON.parse(await readFile(join(input,'index.json'),'utf8'));assert.equal(index.expected,59);assert.equal(index.completed,59);assert.equal(index.uniqueIds,59);
assert.deepEqual(index.cases.map((c:any)=>c.id),CORPUS.map(c=>c.id));assert.equal(new Set(index.cases.map((c:any)=>c.id)).size,59);
for(const entry of CORPUS)await verifyCase(entry.id,join(input,entry.id));
const supplemental=join(input,'supplemental');try{for(const name of (await readdir(supplemental)).filter(n=>!n.startsWith('.'))){const dir=join(supplemental,name),c=JSON.parse(await readFile(join(dir,'case.json'),'utf8'));await verifyCase(c.id,dir,true);}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const provenance=JSON.parse(await readFile(join(input,'provenance.json'),'utf8'));
provenance.reproduce='bash tools/repo/reproduce-motion-current-audit.sh';provenance.finalDriverSha256=sha(await readFile(join(ROOT,'tools/repo/motion-current-audit.ts')));
await Promise.all([writeFile(join(output,'capture-index.json'),json({schema:1,provenance,expectedPrimary:59,uniquePrimary:59,statuses:summary.filter(s=>!s.supplement).reduce((a,c)=>(a[c.status]=(a[c.status]??0)+1,a),{}),totalNativeCalls:totalFrames,rawCaptureDirectory:input,cases:summary})),
  writeFile(join(output,'native-receipts.json.gz'),gzipSync(JSON.stringify(receipts),{level:9})),writeFile(join(output,'native-asset-manifest.json.gz'),gzipSync(JSON.stringify(assets),{level:9}))]);
await copyFile(join(input,'conversations-words-dissolve/contacts/owner-and-close-first-1200ms.json'),join(output,'witnesses/conversations-words-dissolve-first-1200ms.json'));
await imageContact(join(input,'conversations-words-dissolve/contacts/owner-and-close-first-1200ms.png'),join(output,'witnesses/conversations-words-dissolve-first-1200ms.jpg'));
await writeFile(join(output,'README.md'),`# Fresh native capture, 22 November 2026\n\nProduction source is frozen at ${provenance.revision}. The exact current CORPUS edits and matched routes were captured for all 59 unique IDs at 800×450, 30 fps. Authored event durations and caption holds were retained. Four variants were refused by typed authored-duration guards and retain only the actual prior picture; those are not completed animations. Capture status is not a visual verdict.\n\nRun \`bash tools/repo/reproduce-motion-current-audit.sh\` from a checkout containing the new driver. The script creates a detached worktree at the pinned source revision, copies only the capture driver, reuses installed dependencies, and runs at most two child cases, each with a 1024 MiB JS heap. Every native raster uses renderAsync against an immutable SVG snapshot and reads its pixels getter once. The source and route hashes in receipts are provenance only.\n\n\`native-receipts.json.gz\` contains every frame callback, native offset, absolute frame, state mark, source bundle fingerprint, pixel digest and content-addressed raw input reference. \`native-asset-manifest.json.gz\` records the checked raw SVG.gz and PNG file digests. Raw media and ownership indexes remain in \`${input}\`; frame PNGs are \`<case>/<side>/<frame.asset>.png\`, SVGs use the same hash plus \`.svg.gz\`. Exact PNGs are the measurement inputs. Compact JPEG contact witnesses are display derivatives; their JSON sidecars map every selected row to the raw inputs. Named upper/lower/left/right stage crop contacts remain alongside the raw outputs. Blank contact cells mean no native frame exists at that offset.\n\nThe whole-step conversations ledger contains 799 owner callbacks and 912 close callbacks per side, discovered dynamically, including all caption holds. A separate first-1200ms contact samples every three native frames through each initial transition.\n\nReader supplements are explicitly separate from the exact 59-case primary inventory. Both actual liveBase and acceptedLog are recorded. Rejected histories retain a resting picture and refusal reason; no reset or alternate history is silently substituted. Historical forced-start admissibility is recorded separately. Supplemental routes were requested by independent reviewers; native pixel judgments belong to those reviewers.\n`);
console.log(json({output,primary:59,supplements:summary.filter(s=>s.supplement).length,totalNativeCalls:totalFrames,uniqueSideAssets:assets.length,statuses:summary.filter(s=>!s.supplement).reduce((a,c)=>(a[c.status]=(a[c.status]??0)+1,a),{})}));
