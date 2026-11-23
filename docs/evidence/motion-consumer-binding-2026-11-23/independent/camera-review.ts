import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const scriptRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {loadFonts,loadProject} from '../../../explain/testing.ts';
import {LiveSink,liveBase,liveSteps,runLive} from '../../../explain/internal.ts';
import {Text,toSvgString,type Mobject,type Scene} from '../../../src/index.ts';
import {paintReach} from '../../../src/internal.ts';
import {renderAsync} from '@resvg/resvg-js';
import {occlusionSnapshot,occlusionPixels} from '../../../test/lib/native-contribution.ts';
import SignIn from '../../../scenes/explainers/poppy-sign-in/scene.ts';
import {tagPunch,DESK} from '../../../scenes/explainers/poppy-sign-in/picture.ts';
const dir=join(dirname(fileURLToPath(import.meta.url)),'reader-return');await mkdir(dir,{recursive:true});
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const positive=(m:Mobject|undefined)=>!!m&&m.family().some(p=>p.hasPoints()&&p.style.opacity>0.01);
const couldTouch=(a:Mobject,b:Mobject)=>{
 const x=a.box(),y=b.box();if(!x||!y)return false;
 const d=paintReach(a)+paintReach(b)+0.05;
 return x[2]+d>=y[0]&&y[2]+d>=x[0]&&x[3]+d>=y[1]&&y[3]+d>=x[1];
};
await loadFonts();const project=await loadProject(SignIn,new URL('../../../scenes/explainers/poppy-sign-in/',import.meta.url).pathname);
const all=[],cache=new Map<string,Awaited<ReturnType<typeof occlusionPixels>>>();
async function compare(scene:Scene,part:Mobject,actor:Mobject){
 const s=occlusionSnapshot(scene,part,actor),key=hash([s.actual,s.noActor,s.noSubject,s.neither].join('\n'));let r=cache.get(key);
 if(!r){r=await occlusionPixels(s);cache.set(key,r);}
 return r;
}
// Independently expand the actual root viewBox while keeping the scale and the
// existing scene's background rectangle. The native RGBA difference outside
// the ordinary 800 × 450 area therefore belongs to the same physical actor.
const extentCache=new Map<string,any>();
async function actualExtent(s:Scene,actor:Mobject){
 const actual=toSvgString(s,{width:800}),fam=actor.family(),opacity=fam.map(f=>f.style.opacity);let without:string;
 try{fam.forEach(f=>f.setStyle({opacity:0},false));without=toSvgString(s,{width:800});}
 finally{fam.forEach((f,i)=>f.setStyle({opacity:opacity[i]!},false));}
 const sign=hash(actual+'\n'+without);if(extentCache.has(sign))return extentCache.get(sign);
 const pad=24,W=800+2*pad,H=450+2*pad;
 const extend=(svg:string)=>svg.replace(/^<svg[^>]*>/,root=>{
   const v=root.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number),scale=v[2]!/800;assert.ok(Math.abs(scale-v[3]!/450)<1e-8);
   return root.replace(/width="800"/,'width="'+W+'"').replace(/height="450"/,'height="'+H+'"').replace(/viewBox="[^"]+"/,'viewBox="'+[v[0]!-pad*scale,v[1]!-pad*scale,v[2]!+2*pad*scale,v[3]!+2*pad*scale].join(' ')+'"');
 });
 const imgs=await Promise.all([actual,without,extend(actual),extend(without)].map(t=>renderAsync(t,{font:{loadSystemFonts:false}})));
 const [a,b,c,d]=imgs.map(i=>i.pixels);assert.equal(c!.length,W*H*4);
 let total=0,outside=0,regular=0,mismatch=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=(y*W+x)*4,inFrame=y>=pad&&y<450+pad&&x>=pad&&x<800+pad;
   const changed=Math.max(Math.abs(c![i]!-d![i]!),Math.abs(c![i+1]!-d![i+1]!),Math.abs(c![i+2]!-d![i+2]!),Math.abs(c![i+3]!-d![i+3]!))>16;
   if(changed){total++;if(!inFrame)outside++;}
   if(inFrame){const j=((y-pad)*800+x-pad)*4,ordinary=Math.max(Math.abs(a![j]!-b![j]!),Math.abs(a![j+1]!-b![j+1]!),Math.abs(a![j+2]!-b![j+2]!),Math.abs(a![j+3]!-b![j+3]!))>16;
    if(ordinary)regular++;if(changed!==ordinary)mismatch++;
   }
 }
 const result={regular,expanded:total,outside,interiorMaskMismatch:mismatch};extentCache.set(sign,result);return result;
}
for(const scenario of project.scenarios){
 const flow=scenario.values.flow,host=await new scenario.Scene(new LiveSink()).run(),spot=liveSteps(host).get('sign-out')!,{base}=await liveBase(scenario.Scene,'sign-out',spot);assert.ok(base);
 for(const replacement of [false,true])for(const pending of [false,true])for(const event of ['sign-out','disconnect']){
  const log=['ask','approve-read','collect',...(replacement?['ask',pending?'approve-read':'approve-all','collect']:[]),...(pending?['ask']:[]),event];
  const rows:any[]=[],photos:any[]=[],inverse:any[]=[],sourcePunch:Map<string,number[]>=new Map();let seq=0;
  const result=await runLive(scenario.Scene,'sign-out',spot,log,{from:base!.from,animate:{async frame(s){
   const n=seq++,actor=s.find('tag:return'),source=s.find('tag');
   if(source&&positive(source))sourcePunch.set('last',[...tagPunch(source)]);
   if(!positive(actor))return;
   const pos=[...actor!.center()],punch=[...tagPunch(actor!)],row:any={seq:n,relativeSec:s.time,center:pos,punch,extent:await actualExtent(s,actor!),bySubject:{},visibleSource:['tag','tag:cord','agent:key'].filter(k=>positive(s.find(k)))};
   if(n===30){
    actor!.moveTo(flow==='device'?[-3.81414461,-4.474570274]:[pos[0]!,s.frame.box()![1]+actor!.height()/4]);
    try{row.knownEdgeInverse=await actualExtent(s,actor!);}finally{actor!.moveTo(pos);}
   }
   for(const k of ['you:password','agent:name','card:literal','agent:station']){
    const part=k==='card:literal'?s.find('card')?.family().find(t=>t instanceof Text&&t.text==='example.com'):s.find(k);
    if(!positive(part))continue;
    const exact=part!,proof=couldTouch(actor!,exact);
    row.bySubject[k]=proof?{basis:'native full-stage subject-ownership comparison',...await compare(s,exact,actor!)}:{basis:'disjoint conservative painted bounds',lost:0};
    if(k==='you:password'&&!inverse.length&&rows.length>5){
     const dot=exact.children[1]!,from=actor!.center();actor!.moveTo(dot.center());
     try{inverse.push(await compare(s,exact,actor!));}finally{actor!.moveTo(from);}
    }
   }
   if((event==='disconnect')&&!pending&&[17,30,39,45].includes(n)){
    const svg=toSvgString(s,{width:800}),im=await renderAsync(svg,{font:{loadSystemFonts:false}}),px=im.pixels,png=im.asPng();
    const file=[flow,replacement?'replacement':'first',event,String(n)].join('-')+'.png';
    await writeFile(join(dir,file),png);photos.push({seq:n,path:'reader-return/'+file,svgSha256:hash(svg),nativePixelsSha256:hash(px),pngSha256:hash(png)});
   }
   rows.push(row);
  }}});
  const origin=rows[0],last=rows.at(-1);assert.ok(origin&&last);
  const losses=Object.fromEntries(['you:password','agent:name','card:literal'].map(k=>{
   const seen=rows.filter(r=>r.bySubject[k]);return [k,{visibleFrames:seen.length,nativeComparisons:seen.filter(r=>r.bySubject[k].basis.startsWith('native')).length,maxNativeLostPixels:Math.max(0,...seen.map(r=>r.bySubject[k].lost))}];}));
  const until=sourcePunch.get('last')!;all.push({flow,replacement,pending,event,log,sourceState:base!.from,finalState:result.scene.state,frameCount:seq,visibleActorSamples:rows.length,sourcePunch:until,actorFirstPunch:origin.punch,lastCenter:last.center,companyPortY:DESK[1],losses,poisonPasswordDot:inverse,photos,rows});
 }
}
await writeFile(join(dir,'return-reader-scan.json'),JSON.stringify({sourceRevision:scriptRevision,verifiedEndRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'16 real reader histories; every visible return sample checked conservatively for possible subject contact, then ordinary native ownership knockouts only on possible intersections. A displaced-password-dot inverse was separately captured for every legal history. No display conclusions from geometry alone.',uniqueNativeComparisons:cache.size,uniqueExtentComparisons:extentCache.size,histories:all},null,2)+'\n');
console.log(JSON.stringify(all.map(h=>[h.flow,h.replacement,h.pending,h.event,h.visibleActorSamples,h.losses,h.poisonPasswordDot[0]?.lost])));
