import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadProject,loadFonts} from '../../../explain/testing.ts';
import {liveBase,liveSteps,LiveSink,runLive} from '../../../explain/internal.ts';
import {Text,toSvgString} from '../../../src/index.ts';
import {renderAsync} from '@resvg/resvg-js';
import SignIn from '../../../scenes/explainers/poppy-sign-in/scene.ts';
const rel=new URL('reader-grants/',import.meta.url);await mkdir(rel,{recursive:true});
await loadFonts();const project=await loadProject(SignIn,new URL('../../../scenes/explainers/poppy-sign-in/',import.meta.url).pathname);
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const keys=['you','agent:station','agent:ring','agent:key','tag','code','poll','agent:key:flight','tag:flight','answer:phrase'];
const all=[];
for(const scenario of project.scenarios)for(const replace of [false,true]){
 const host=await new scenario.Scene(new LiveSink()).run(),place=liveSteps(host).get('sign-out')!;
 const {base}=await liveBase(scenario.Scene,'sign-out',place);
 const log= replace?['ask','approve-read','collect','ask','approve-all','collect']:['ask','approve-read','collect'];
 const rows=[];let sceneTime;const name=scenario.values.flow+'-'+(replace?'replacement':'first');
 const result=await runLive(scenario.Scene,'sign-out',place,log,{from:base!.from,animate:{async frame(s){
  sceneTime??=s.time;const seq=rows.length;const parts=[];
  for(const k of keys)for(const p of s.familyMembers().filter(m=>m.key===k)){
   const family=p.family(),ink=family.filter(m=>m.style.opacity>0.01&&(m.style.fill!=='none'||m.style.stroke!=='none'));
   if(ink.length)parts.push({key:k,at:p.center(),maxStyleOpacity:Math.max(...ink.map(m=>m.style.opacity)),text:family.filter(m=>m instanceof Text).map(m=>m.text)});
  }
  const row:any={seq,absoluteFrame:s.frameCount,phase:s.phase,relativeSec:Number((s.time-sceneTime).toFixed(5)),parts};
  if([0,18,38,49,60,73,82,91,102,110,119,130,134].includes(seq)){
   const svg=toSvgString(s,{width:800});row.svgSha256=hash(svg);
   const im=await renderAsync(svg,{font:{loadSystemFonts:false}});const pixels=im.pixels;row.pixelSha256=hash(pixels);
   const f=name+'-'+String(seq).padStart(3,'0')+'.png',png=im.asPng();row.png={file:f,sha256:hash(png)};
   await writeFile(new URL(f,rel),png);await writeFile(new URL(f.replace('.png','.svg.gz'),rel),gzipSync(svg));
  }
  rows.push(row);
 }}});
 all.push({flow:scenario.values.flow,replace,step:'sign-out',log,sourceState:base!.from,finalState:result.scene.state,frames:rows});
}
await writeFile(new URL('reader-grants.json',rel),JSON.stringify({sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),run:'root-causes-39b75450/astra-reader-grants',policy:'New source/run snapshots; original independent reader-grant evidence remains unchanged. Actual accepted reader roots/logs and native clock; sparse native PNGs at specified indices, not every-frame visual inspection.',histories:all},null,2)+'\n');
console.log(all.map(x=>[x.flow,x.replace,x.frames.length,x.frames.at(-1).relativeSec]));

