import assert from 'node:assert/strict';
import {loadFonts,loadProject} from '../../explain/testing.ts';
import {liveSteps,LiveSink,runLive,liveBase} from '../../explain/internal.ts';
import {acceptedLog} from '../../app/embed-live.ts';
import {Text,VMobject,toSvgString} from '../../src/index.ts';
import {renderAsync} from '@resvg/resvg-js';
import {resolve,join} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
const chapter=process.argv[2], output='out/principled-construction/fixed-native';
await mkdir(output,{recursive:true});
const config={browser:{step:'phish',log:['load','authorize'],movers:['read'],steps:['code']},refusals:{step:'pace',log:['old-copy','answer'],movers:['document']},coverage:{step:'search',log:['read tasks','gift card','report'],movers:['report:sent','report:reply']}}[chapter];
assert.ok(config);
const options={font:{loadSystemFonts:false}}, width=800;
await loadFonts();const{default:Source}=await import(`../../scenes/explainers/poppy-${chapter}/scene.ts`);
const project=await loadProject(Source,resolve(`scenes/explainers/poppy-${chapter}`));
const boxOverlap=(a,b)=>a&&b&&Math.min(a[2],b[2])>Math.max(a[0],b[0])-.15&&Math.min(a[3],b[3])>Math.max(a[1],b[1])-.15;
const delta=(a,b,i)=>Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));
function without(parts,cb){const family=[...new Set(parts.flatMap(x=>x.family()))],alpha=family.map(m=>m.style.opacity);try{family.forEach(m=>m.setStyle({opacity:0},false));return cb();}finally{family.forEach((m,i)=>m.setStyle({opacity:alpha[i]},false));}}
const exists=m=>m.family().some(p=>p instanceof VMobject&&p.hasPoints()&&p.style.opacity*Math.max(p.style.fillOpacity??1,p.style.strokeOpacity??1)>.025);
const all=[];
for(const scenario of project.scenarios){
const host=await new scenario.Scene(new LiveSink()).run(),place=liveSteps(host).get(config.step),base=(await liveBase(scenario.Scene,config.step,place)).base;
assert.ok(base);const valid=acceptedLog(place.machine,base.state,config.log);assert.deepEqual(valid.kept,config.log);
for(const kind of ['story','reader']){
 let first,frame=0;const rows=new Map(), routes=new Map();
 const capture={async frame(s){first??=s.time;frame++;const family=s.familyMembers();for(const mkey of config.movers){
 const movers=family.filter(m=>m.key===mkey&&exists(m));
 for(const m of movers){const trip=`${s.currentStep?.path}/${mkey}`,centers=routes.get(trip)??[];routes.set(trip,centers);const center=m.center();if(!centers.length||center.some((p,i)=>Math.abs(p-centers.at(-1)[i])>1e-7))centers.push(center);
 for(const v of family.filter(v=>v instanceof Text&&exists(v)&&!m.family().includes(v))){
 const k=v.key??v.text,key=`${s.currentStep?.path}/${mkey}/${k}/${v.text}`;
 const rec=rows.get(key)??{key,victimKey:v.key,text:v.text,coexisting:0,broad:0,damaged:0,maxLost:0};rows.set(key,rec);rec.coexisting++;
 if(!boxOverlap(m.box(),v.box()))continue;rec.broad++;
 const snap=()=>toSvgString(s,{width});const svgs=[snap(),without([v],snap),without([m],snap),without([m,v],snap)];
 const pics=await Promise.all(svgs.map(x=>renderAsync(x,options))),[a,b,c,d]=pics.map(im=>im.pixels);let lost=0,exposed=0;
 for(let i=0;i<a.length;i+=4){const open=delta(c,d,i);if(open<=16)continue;exposed++;if(delta(a,b,i)<=.15*open)lost++;}
 if(lost){rec.damaged++;rec.first??=+(s.time-first).toFixed(3);rec.last=+(s.time-first).toFixed(3);}
 if(lost>rec.maxLost){Object.assign(rec,{maxLost:lost,exposed,time:+(s.time-first).toFixed(3),frame,where:m.center(),victim:v.center()});const name=encodeURIComponent(`${chapter}-${Object.values(scenario.values).join('-')||'std'}-${kind}-${s.currentStep?.path}-${mkey}-${k}`);await writeFile(join(output,name+'.png'),pics[0].asPng());await writeFile(join(output,name+'-no-mover.png'),pics[2].asPng());}
 }}}}};
 try{if(kind==='story')await new scenario.Scene(capture).run();else await runLive(scenario.Scene,config.step,place,config.log,{from:base.from,animate:capture});all.push({chapter,settings:scenario.values,kind,step:config.step,from:base.from,log:kind==='reader'?config.log:undefined,rows:[...rows.values()],routes:Object.fromEntries(routes)});}catch(e){all.push({chapter,settings:scenario.values,kind,error:e.stack,rows:[...rows.values()]});}
 await writeFile(join(output,chapter+'.json'),JSON.stringify(all,null,2));console.log(chapter,scenario.values,kind,'from',base.from,'damaged',[...rows.values()].filter(r=>r.maxLost).map(r=>[r.key,r.maxLost,r.damaged]));
}}
