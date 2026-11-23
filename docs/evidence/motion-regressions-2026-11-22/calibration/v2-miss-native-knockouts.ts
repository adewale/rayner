// Analyze immutable retained SVGs only. Never imports/runs the detector or scene.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { renderAsync } from '@resvg/resvg-js';
const root='/workspace/rayner-audit/out/current-audit-2026-11-22',out='/workspace/rayner-audit/out/prospective-v2-misses';await mkdir(out,{recursive:true});
const sha=(x:string|Uint8Array)=>createHash('sha256').update(x).digest('hex');
const queries=[
 {id:'poppy-key-over-station-name',target:'lane:sign-in:name',text:'Sign-in',mask:'agent:key:flight',frames:Array.from({length:13},(_,i)=>30+i)},
 {id:'refusals-key-over-lane-name',target:'lane:api:name',text:'API',mask:'agent:key:flight',frames:Array.from({length:17},(_,i)=>30+i)},
 {id:'sign-in-poll-over-card',target:'card',text:'example.com',mask:'poll',frames:[18,21,22,23,24,25,26,27,30]},
 {id:'browser-forge-across-stage',target:'page:session',text:'Session',mask:'forged',frames:[25,28,30,32,34,36,38,40,42,44]},
 {id:'browser-forge-across-stage',target:'page:sid',text:'Yx2b7Q',mask:'forged',frames:[25,28,30,32,34,36,38,40,42,44]},
];
const results:any[]=[];
for(const q of queries)for(const side of ['baseline','variant']){
 const dir=join(root,q.id,side),receipt=JSON.parse(await readFile(join(dir,'receipt.json'),'utf8')),ownership=JSON.parse(gunzipSync(await readFile(join(dir,'ownership.json.gz'))).toString());
 const select=(runs:any[],key:string,text?:string)=>{const ids=new Set<number>();for(const r of runs)if(r.keys.includes(key)&&(text===undefined||r.text===text))for(let i=r.from;i<=r.to;i++)ids.add(i);return ids;};
 for(const f of receipt.frames.filter((f:any)=>q.frames.includes(f.frame))){
  const own=ownership[f.sequence],svg=gunzipSync(await readFile(join(dir,f.asset+'.svg.gz'))).toString(),target=select(own.runs,q.target,q.text),mask=select(own.runs,q.mask);assert.ok(target.size>0,q.id+' target');assert.ok(mask.size>0,q.id+' mask '+f.frame);
  const remove=(ids:Set<number>)=>{let n=0;const s=svg.replace(/<path\b[^>]*\/>/g,p=>ids.has(n++)?'':p);assert.equal(n,own.runs.at(-1).to+1);return s;};
  const raster=async(s:string)=>{const image=await renderAsync(s,{font:{loadSystemFonts:false}});const pixels=image.pixels;return pixels;};
  const actual=await raster(svg),minusTarget=await raster(remove(target)),exposed=await raster(remove(mask)),bare=await raster(remove(new Set([...target,...mask])));
  let exposedInk=0,visibleInk=0,fullyLost=0,partlyLost=0;const bbox=[800,450,-1,-1];
  const diff=(a:Uint8Array,b:Uint8Array,i:number)=>Math.max(Math.abs(a[i]!-b[i]!),Math.abs(a[i+1]!-b[i+1]!),Math.abs(a[i+2]!-b[i+2]!));
  for(let i=0;i<actual.length;i+=4){const unmasked=diff(exposed,bare,i),visible=diff(actual,minusTarget,i);if(visible>8)visibleInk++;if(unmasked>16){exposedInk++;const lost=visible<=.15*unmasked;if(lost)fullyLost++;else if(visible+8<unmasked)partlyLost++;if(lost||visible+8<unmasked){const x=(i/4)%800,y=Math.floor(i/4/800);bbox[0]=Math.min(bbox[0]!,x);bbox[1]=Math.min(bbox[1]!,y);bbox[2]=Math.max(bbox[2]!,x);bbox[3]=Math.max(bbox[3]!,y);}}}
  results.push({id:q.id,side,target:q.target,text:q.text,mask:q.mask,frame:f.frame,seconds:f.frame/30,step:f.step,absolute:f.absolute,asset:f.asset,svgSha256:sha(svg),targetPaintRecords:target.size,maskPaintRecords:mask.size,exposedInk,visibleInk,fullyLost,partlyLost,affectedPixelBox:bbox[2]===-1?null:bbox});
 }
}
await writeFile(join(out,'native-knockouts.json'),JSON.stringify({policy:'Saved immutable native SVG snapshots; four async native renders per query; pixels getter read once/result. FullyLost requires unmasked victim contribution>16 and actual<=15% of unmasked. PartlyLost requires contribution drop>8; counts prove ink loss, not human readability.',queries,results},null,2)+'\n');
for(const q of queries){const rows=results.filter(r=>r.id===q.id&&r.text===q.text);console.log(JSON.stringify({id:q.id,text:q.text,sides:['baseline','variant'].map(side=>({side,frames:rows.filter(r=>r.side===side).map(r=>({frame:r.frame,fullyLost:r.fullyLost,partlyLost:r.partlyLost,exposedInk:r.exposedInk,box:r.affectedPixelBox}))}))}));}
