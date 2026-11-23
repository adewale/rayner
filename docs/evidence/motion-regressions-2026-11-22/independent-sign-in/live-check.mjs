import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {renderAsync} from '@resvg/resvg-js';
import {Scene,toSvgString} from '../../src/index.ts';
import {NullSink} from '../../src/timeline.ts';
import {loadFonts,loadProject} from '../../explain/testing.ts';
import {liveSteps,runLive,logStart} from '../../explain/live.ts';
import SignIn from '../../scenes/explainers/poppy-sign-in/scene.ts';
Scene.captionWpm=Infinity;
await loadFonts();
const project=await loadProject(SignIn,'scenes/explainers/poppy-sign-in');
const raster=async svg=>{const rendered=await renderAsync(svg,{font:{loadSystemFonts:false}});return Buffer.from(rendered.pixels);};
const report=[];
for(const scenario of project.scenarios){
 const ran=await new scenario.Scene(new NullSink()).run();
 const roots=[...liveSteps(ran)];
 assert.deepEqual(roots.map(([step])=>step),['sign-out']);
 const [step,place]=roots[0];
 const initial=await runLive(scenario.Scene,step,place,[],{keep:true});
 assert.equal(logStart(initial.machine,initial.rest).from,'rest');
 const session=initial.session;
 const sequence=['ask',...(scenario.values.flow==='device'?['collect']:[]),'approve-all','collect','thief','sign-out','ask','approve-read','collect','ask','approve-read','collect','ask','sign-out','approve-all','collect','disconnect','ask','approve-read','collect','ask','approve-all','collect','sign-out'];
 let events=0, approvals=0, frames=0, emptyFrames=0, heldFrames=0, inverseVisible=0;
 try {for(const event of sequence){
  const sink={async frame(scene){
   if(!event.startsWith('approve') || scene.state.last?.kind!=='approve')return;
   const guide=scene.find('agent:key:slot'),ring=scene.find('agent:ring'),key=scene.find('agent:key');
   assert.ok(guide&&ring);
   const parent=guide.parent;
   assert.equal(parent,ring.parent);
   assert.ok(parent.children.indexOf(guide)<parent.children.indexOf(ring));
   if(key)assert.ok(parent.children.indexOf(guide)<parent.children.indexOf(key));
   assert.ok(ring.family().every(m=>!m.clipBox));
   for(let ancestor=ring.parent;ancestor;ancestor=ancestor.parent)assert.equal(ancestor.clipBox,undefined);
   for(const width of [390,800]){
    const actual=toSvgString(scene,{width,cull:false});
    const oldIndex=parent.children.indexOf(guide),ringIndex=parent.children.indexOf(ring);
    let reference,poison;
    try {
      parent.insert(ringIndex-(oldIndex<ringIndex?1:0),guide);
      reference=toSvgString(scene,{width,cull:false});
      if(!key&&frames===0){parent.add(guide);poison=toSvgString(scene,{width,cull:false});}
    } finally {parent.insert(oldIndex,guide);}
    const frame=scene.frame.box(),unit=width/(frame[2]-frame[0]),boxes=[ring.box(),...(key?[key.box()]:[])];
    const bounds=[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))];
    const region=[Math.floor((bounds[0]-frame[0])*unit)-1,Math.floor((frame[3]-bounds[3])*unit)-1,Math.ceil((bounds[2]-frame[0])*unit)+1,Math.ceil((frame[3]-bounds[1])*unit)+1];
    const crop=pixels=>{const rows=[];for(let y=region[1];y<region[3];y++)rows.push(pixels.subarray((y*width+region[0])*4,(y*width+region[2])*4));return Buffer.concat(rows);};
    const pixels=crop(await raster(actual)),expected=crop(await raster(reference));
    assert.deepEqual(pixels,expected,`${scenario.values.flow} event ${events} ${event} frame ${frames} width ${width}: guide changes physical ring or foreground`);
    if(poison){assert.notDeepEqual(crop(await raster(poison)),expected);inverseVisible++;}
   }
   frames++; if(key)heldFrames++;else emptyFrames++;
  }};
  await session.send(event,{animate:sink});
  events++; if(event.startsWith('approve'))approvals++;
 }
 assert.equal(approvals,6);
 assert.ok(emptyFrames>20&&heldFrames>20&&inverseVisible===2);
 report.push({flow:scenario.values.flow,root:step,events,approvals,frames,emptyFrames,heldFrames,inverseVisible,widths:[390,800]});
 }finally{session.close();}
}
await writeFile('out/independent-regression-check-2026-11-22/live-check.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
