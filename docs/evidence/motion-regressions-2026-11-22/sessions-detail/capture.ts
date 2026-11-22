import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderAsync} from '@resvg/resvg-js';
import {renderFrame,toSvgString,Text} from '../../src/index.ts';
import {loadFonts,loadProject} from '../../explain/testing.ts';
import Sessions from '../../scenes/explainers/poppy-sessions/scene.ts';
await loadFonts();
const project=await loadProject(Sessions,'scenes/explainers/poppy-sessions');
assert.equal(project.scenarios.length,2);
const receipts=[];
for(const scenario of project.scenarios){
 const detail=scenario.trace.steps.find(step=>step.step==='late-copy')!;
 const scene=await renderFrame(scenario.Scene,detail.frame1),svg=toSvgString(scene,{width:800});
 const native=await renderAsync(svg,{font:{loadSystemFonts:false}}),pixels=native.pixels;
 const arrival=scene.familyMembers().find((part):part is Text=>part instanceof Text&&part.text==='00:15:20')!;
 const family=arrival.family(),opacity=family.map(part=>part.style.opacity);
 let absentSvg:string;
 try{family.forEach(part=>part.setStyle({opacity:0},false));absentSvg=toSvgString(scene,{width:800});}
 finally{family.forEach((part,i)=>part.setStyle({opacity:opacity[i]!},false));}
 const damaged=await renderAsync(absentSvg,{font:{loadSystemFonts:false}}),absent=damaged.pixels;
 let changed=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(pixels[i+c]!-absent[i+c]!)))>16)changed++;
 assert.ok(changed>0,'inverse actually removed native arrival ink');assert.equal(toSvgString(scene,{width:800}),svg,'restored native source');
 const prefix='out/sessions-late-copy-evidence/'+scenario.values.company;
 await writeFile(prefix+'.png',native.asPng());await writeFile(prefix+'-hidden-arrival.png',damaged.asPng());await writeFile(prefix+'.svg',svg);
 receipts.push({settings:scenario.values,step:'late-copy',kind:detail.meta.kind,frame:detail.frame1,time:scene.time,fps:scene.fps,state:scene.state,shown:scene.shown,expectedSteps:scenario.trace.steps.map(s=>s.step),pixelsSha256:createHash('sha256').update(pixels).digest('hex'),inversePixelsSha256:createHash('sha256').update(absent).digest('hex'),inverseRemovedArrivalPixels:changed});
}
await writeFile('out/sessions-late-copy-evidence/receipt.json',JSON.stringify(receipts,null,2));
console.log('Captured2 native late-copy details and2 visible-ink removal inverses.');
