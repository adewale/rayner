import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {loadProject,loadFonts} from '../../../explain/testing.ts';
import {Text,toSvgString,type Mobject} from '../../../src/index.ts';
import {renderAsync} from '@resvg/resvg-js';
import SignIn from '../../../scenes/explainers/poppy-sign-in/scene.ts';
import {DEVICE,ORGANIZATION} from '../../../scenes/explainers/poppy-sign-in/model.ts';
const out=join(dirname(fileURLToPath(import.meta.url)),'card-lifecycle');await mkdir(out,{recursive:true});
const hash=(a:string|Uint8Array)=>createHash('sha256').update(a).digest('hex'),rev=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const begin=rev(),items=[];await loadFonts();const project=await loadProject(SignIn,new URL('../../../scenes/explainers/poppy-sign-in/',import.meta.url).pathname);
const ink=(m:Mobject|undefined)=>m&&m.family().some(f=>f.hasPoints()&&f.style.opacity>0.01&&(f.style.fill!=='none'||f.style.stroke!=='none'));
for(const scenario of project.scenarios){
 const flow=scenario.values.flow,rows:any[]=[],photos:any[]=[],names=new Set<string>(),flights=new Map<string,number[][]>(),deltas:number[][]=[];
 let moving=0,coincident=0,rootCount=0,foreign=0,pollWith=0,pollWithout=0,directCode=0;let event='';let idx=0;
 await new scenario.Scene({async frame(s){
  for(;idx<s.evidence.length;idx++){const e=s.evidence[idx] as any;if(e.kind==='event')event=e.event;}
  const step=s.currentStep?.path,card=s.find('card'),cf=s.find('card:flight'),poll=s.find('poll'),trick=s.find('trick')??s.find('trick:flight'),code=s.find('code'),at=s.frameCount;
  const snapshot=async(flag:string)=>{if(names.has(flag))return;names.add(flag);const svg=toSvgString(s,{width:800}),im=await renderAsync(svg,{font:{loadSystemFonts:false}}),px=im.pixels,png=im.asPng(),file=flow+'-'+flag+'.png';await writeFile(join(out,file),png);
    photos.push({flow,flag,file:'card-lifecycle/'+file,absolute:at,step,event,svgSha256:hash(svg),nativePixelsSha256:hash(px),pngSha256:hash(png)});};
  const live=s.familyMembers().filter(m=>m.key==='card:domain'&&ink(m));
  for(const d of live){
   assert.ok(d instanceof Text&&d.text===ORGANIZATION.domain);const parent=d.parent!;assert.ok(parent.key==='card'||parent.key==='card:flight');
   const texts=parent.children.filter((q):q is Text=>q instanceof Text);assert.deepEqual(texts.map(q=>q.text),[DEVICE.user_code,ORGANIZATION.name,ORGANIZATION.domain]);assert.equal(texts.filter(q=>q.key==='card:domain').length,1);assert.equal(texts[2],d);
   rootCount++;if(parent.key==='card:flight'){
    const z=flights.get(step??'')??[];z.push([...parent.center()]);flights.set(step??'',z);
    const q=parent.center(),v=d.center();deltas.push([v[0]-q[0],v[1]-q[1]]);moving++;if(moving===14)await snapshot('domain-on-moving-parent');
   }
  }
  if(live.length>1){for(const n of live.slice(1))assert.ok(Math.hypot(n.center()[0]-live[0]!.center()[0],n.center()[1]-live[0]!.center()[1])<1e-4,'two face-up copies only coincide at handoff');coincident++;}
  if(flow==='device'&&ink(trick)){assert.equal(trick!.family().some(f=>f.key==='card:domain'),false);foreign++;if(foreign===12)await snapshot('foreign-card');}
  if(ink(poll)){if(live.length){pollWith++;if(pollWith===20)await snapshot('faceup-outgoing-poll');}else{pollWithout++;if(pollWithout===20)await snapshot('approved-outgoing-poll-without-faceup-card');}}
  if(ink(code)&&flow==='direct'){directCode++;assert.equal(live.length,0);if(directCode===20)await snapshot('direct-code');}
  if(ink(poll)||ink(cf)||ink(trick)||ink(code))rows.push({absolute:at,step,event,phase:s.phase,card:!!ink(card),cardFlight:!!ink(cf),faceUpDomains:live.length,poll:!!ink(poll),foreign:!!ink(trick),directCode:!!ink(code)});
 }}).run();
 const travel=Object.fromEntries([...flights].map(([k,v])=>[k,{observations:v.length,xRange:Math.max(...v.map(q=>q[0]))-Math.min(...v.map(q=>q[0])),yRange:Math.max(...v.map(q=>q[1]))-Math.min(...v.map(q=>q[1]))}]));
 const deltaSpan=deltas.length?[0,1].map(i=>Math.max(...deltas.map(q=>q[i]!))-Math.min(...deltas.map(q=>q[i]!))):null;
 items.push({flow,rootCount,moving,coincident,foreign,pollWith,pollWithout,directCode,travel,deltaSpan,photos,rows});
}
assert.ok(items.find(h=>h.flow==='direct')!.directCode>20);const d=items.find(h=>h.flow==='device')!;assert.ok(d.moving>20&&d.pollWith>20&&d.pollWithout>20&&d.foreign>0);assert.ok(d.deltaSpan!.every(n=>n<1e-4));
await writeFile(join(out,'lifecycle.json'),JSON.stringify({begin,end:rev(),method:'Actual canonical direct/device scene playback and sparse ordinary native frame captures; no detector invoked. Checked the physically present child Text and all three sibling literals while the parent travels, at handoff, with/without the poll and on the separate foreign card.',items},null,2)+'\n');console.log(items.map(({rows,photos,...rest})=>rest));
