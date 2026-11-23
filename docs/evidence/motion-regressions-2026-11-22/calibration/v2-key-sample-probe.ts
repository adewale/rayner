import assert from 'node:assert/strict';
import inspector from 'node:inspector';
import { createHash,randomUUID } from 'node:crypto';
import { readFile,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadFonts } from '../explain/testing.ts';
import { adoptExplainer,scriptOf } from '../explain/internal.ts';
import { withSettings,scenariosOf } from '../explain/settings.ts';
import { stopAt } from '../src/scene.ts';
import { toSvgString } from '../src/svg.ts';
import { keyedMotionSink } from '../tools/lib/explain-check.ts';
import { loadScene } from '../tools/lib/explain-project.ts';
import { buildVariant } from '../tools/repo/motion-corpus-lib.ts';
import { CORPUS } from '../test/fixtures/motion-corpus/corpus.ts';
import { KEYED_MOTION_LIMITS as L } from '../src/keyed-motion.ts';
const ROOT='/workspace/rayner-audit',OUT=join(ROOT,'out/prospective-v2-misses'),sha=(x:string)=>createHash('sha256').update(x).digest('hex');
const session=new inspector.Session();session.connect();const post=(method:string,params:any)=>new Promise<any>((resolve,reject)=>session.post(method as any,params,(e,result)=>e?reject(e):resolve(result)));
const overlap=(a:number[],b:number[])=>{const c=[Math.max(a[0]!,b[0]!),Math.max(a[1]!,b[1]!),Math.min(a[2]!,b[2]!),Math.min(a[3]!,b[3]!)];return c[2]!>c[0]!&&c[3]!>c[1]!?c:null;};
const area=(b:number[])=>Math.max(0,b[2]!-b[0]!)*Math.max(0,b[3]!-b[1]!);
const crosses=(m:any,b:number[])=>m.hulls?.some((h:number[])=>h[0]!<b[2]!&&h[2]!>b[0]!&&h[1]!<b[3]!&&h[3]!>b[1]!);
function fills(m:any,b:number[]){if(!m.fillPath||!m.hulls)return false;if(m.clip&&(m.clip[0]>b[0]!||m.clip[1]>b[1]!||m.clip[2]<b[2]!||m.clip[3]<b[3]!))return false;if(crosses(m,b))return false;const x=(b[0]!+b[2]!)/2,y=(b[1]!+b[3]!)/2;let winding=0;for(const r of m.fillPath)for(let i=0;i<r.length;i+=2){const j=(i+2)%r.length,x0=r[i],y0=r[i+1],x1=r[j],y1=r[j+1],side=(x1-x0)*(y-y0)-(x-x0)*(y1-y0);if(y0<=y&&y1>y&&side>0)winding++;if(y0>y&&y1<=y&&side<0)winding--;}return m.fillRule==='evenodd'?Math.abs(winding)%2===1:winding!==0;}
function lower(m:any,b:number[],depth=0):number{const c=m.clip?overlap(b,m.clip):b;if(!c||!m.fillPath||!m.hulls)return 0;if(fills(m,c))return area(c);if(!crosses(m,c)||depth>=4)return 0;const x=(c[0]!+c[2]!)/2,y=(c[1]!+c[3]!)/2;return [[c[0]!,c[1]!,x,y],[x,c[1]!,c[2]!,y],[c[0]!,y,x,c[3]!],[x,y,c[2]!,c[3]!]].reduce((s,b)=>s+lower(m,b,depth+1),0);}
const results:any[]=[];await loadFonts();
for(const spec of [{id:'poppy-key-over-station-name',step:'approve',target:'lane:sign-in:name',text:'Sign-in',frames:Array.from({length:13},(_,i)=>30+i)},{id:'refusals-key-over-lane-name',step:'slip',target:'lane:api:name',text:'API',frames:Array.from({length:17},(_,i)=>30+i)}]){
 const entry=CORPUS.find(e=>e.id===spec.id)!,variantId='v2-sampler-'+randomUUID(),receipt=JSON.parse(await readFile(join(ROOT,'out/current-audit-2026-11-22',spec.id,'variant/receipt.json'),'utf8'));
 try{const file=await buildVariant({...entry,id:variantId}),loaded=await loadScene(file);assert.equal(loaded.sourceHash,receipt.provenance.bundledSource,'same source bundle as frozen native capture');adoptExplainer(loaded.Scene,file,await readFile(scriptOf(file),'utf8'),file);const settings=scenariosOf(loaded.Scene).find(s=>JSON.stringify(s)===JSON.stringify(receipt.provenance.settings))!;assert.ok(settings);const Source=withSettings(loaded.Scene,settings),sink=keyedMotionSink();(globalThis as any).__v2ReadonlySink=sink;const native=new Map(receipt.frames.map((f:any)=>[f.absolute,f]));let snapshot:any;
 const actualCalls:any[]=[];const scene=new Source({async frame(s,dt){await sink.frame(s,dt);const old:any=native.get(s.frameCount);if(old&&spec.frames.includes(old.frame)){const hash=sha(toSvgString(s,{width:800}));assert.equal(hash,old.svg,'actual detector input equals retained native SVG');actualCalls.push({frame:old.frame,absolute:s.frameCount,fps:s.fps,dt,svg:hash});}
 if(old?.frame===spec.frames.at(-1)){
 const object=await post('Runtime.evaluate',{expression:'globalThis.__v2ReadonlySink'}),properties=await post('Runtime.getProperties',{objectId:object.result.objectId,ownProperties:true}),current=properties.privateProperties.find((p:any)=>p.name==='#current').value.objectId;
 const result=await post('Runtime.callFunctionOn',{objectId:current,functionDeclaration:`function(){return this.map(f=>({t:f.t,parts:[...f.parts].map(([path,p])=>({path,from:p.from,to:p.to,a:p.a,box:p.box})),leaves:f.leaves.map(l=>({...l,fillPath:l.fillPath?.map(p=>Array.from(p))}))}));}`,returnByValue:true});snapshot=result.result.value;
 }} });stopAt(scene,spec.step,()=>{});await scene.run();const findings=sink.finish();assert.deepEqual(actualCalls.map(r=>r.frame),spec.frames,'every dense hit frame reached actual sampler');assert.ok(snapshot);
 const analyzed=snapshot.filter((f:any)=>spec.frames.some(n=>receipt.mark.origin+n===Math.round(f.t*30))).map((f:any)=>{
 const frame=Math.round(f.t*30)-receipt.mark.origin,T=f.parts.find((p:any)=>p.path==='agent:key:flight'),q=f.leaves.findIndex((l:any)=>l.path===spec.target&&l.text===spec.text),label=f.leaves[q];assert.ok(T&&label);const omitted=new Set(Array.from({length:T.to-T.from},(_,i)=>T.from+i));
 const glyphs=label.glyphs.filter((g:number[])=>!f.leaves.some((m:any,r:number)=>{if(r<=q||omitted.has(r)||m.text!==undefined||(m.fillAlpha??0)<.99)return false;const clip=m.clip?overlap(g,m.clip):g;return !!clip&&!!overlap(m.box,clip)&&(fills(m,clip)||!!crosses(m,clip));}));const whole=glyphs.reduce((s:number,g:number[])=>s+area(g),0);
 const maskLeaves=f.leaves.slice(T.from,T.to);const most=Math.max(0,...maskLeaves.map((m:any)=>(m.fillAlpha??0)>=L.readable&&overlap(m.box,label.box)&&whole>0?glyphs.reduce((s:number,g:number[])=>s+lower(m,g),0)/whole:0));
 const hidden=maskLeaves.map((m:any)=>{if(m.text!==undefined||!m.fillPath||(m.fillAlpha??0)<.95)return 0;return label.glyphs.filter((g:number[])=>{const inset=(1-Math.sqrt(L.glyphCover))/2,dx=(g[2]!-g[0]!)*inset,dy=(g[3]!-g[1]!)*inset;return fills(m,[g[0]!+dx,g[1]!+dy,g[2]!-dx,g[3]!-dy]);}).length;});
 return {frame,absolute:Math.round(f.t*30),sampleTime:f.t,partAlpha:T.a,maskFillAlphas:maskLeaves.map((m:any)=>m.fillAlpha),labelAlpha:label.a,glyphs:label.glyphs.length,visibleGlyphs:glyphs.length,lowerBoundCoveredFraction:most,coverThreshold:L.cover,coverQualifies:most>=L.cover,maxSingleMaskNearlyCoveredGlyphs:Math.max(0,...hidden),occlusionGlyphRequirement:Math.min(2,label.glyphs.length)};
 });results.push({id:spec.id,settings,sourceBundle:loaded.sourceHash,sourceMatchesNative:true,fps:30,sampleCalls:actualCalls,samples:analyzed,findings});
 }finally{await rm(join(ROOT,'out','motion-corpus-'+variantId),{recursive:true,force:true});}
}
session.disconnect();await writeFile(join(OUT,'actual-sampler.json'),JSON.stringify({policy:'Read-only in-process Node inspector snapshots of actual KeyedMotionSink samples; unmodified frozen source and thresholds. Each selected input SVG matches the retained native capture byte-for-byte. Lower-bound area and near-full-glyph predicates recomputed from those exact samples using the documented unchanged geometry kernel.',limits:L,results},null,2)+'\n');
for(const r of results)console.log(JSON.stringify({id:r.id,sourceMatchesNative:r.sourceMatchesNative,frames:r.samples.map((s:any)=>s.frame),maxCoveredFraction:Math.max(...r.samples.map((s:any)=>s.lowerBoundCoveredFraction)),maxNearlyCoveredGlyphs:Math.max(...r.samples.map((s:any)=>s.maxSingleMaskNearlyCoveredGlyphs)),findings:r.findings.length}));
