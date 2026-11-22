import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Scene,Rectangle,Line,Group,toSvgString} from '../../src/index.ts';
import {clearRoute} from '../../scenes/explainers/lib/clear-route.ts';
import {renderAsync} from '@resvg/resvg-js';
const frame=[-8,-4.5,8,4.5],out={};
const ordinary=new Rectangle({width:.4,height:.3,stroke:'none'});
for(const [name,from,to,subjects,box] of [
 ['nan-port',[NaN,0],[2,0],[],frame],['infinite-port',[-2,0],[Infinity,0],[],frame],
 ['nan-frame',[-2,0],[2,0],[],[-8,NaN,8,4.5]],['infinite-frame',[-2,0],[2,0],[],[-Infinity,-Infinity,Infinity,Infinity]],
 ['same-port',[0,0],[0,0],[],frame],
 ['clipped-away-obstacle',[-2,0],[2,0],[Object.assign(new Rectangle({width:1,height:12,fill:'#000',stroke:'none'}),{clipBox:[20,20,21,21]})],frame],
 ]){console.log('probe',name);try{out[name]={path:clearRoute(from,to,ordinary,subjects,box)}}catch(e){out[name]={error:e.message}}}
console.log('finite probes done');
const unset=new Line([-.1,-.1],[.1,.1],{stroke:'#ff0000',strokeWidth:1,strokeOpacity:undefined,lineCap:'square',lineJoin:'round'});
out.unsetOpacity=unset.style.strokeOpacity;
const carrier=new Line([-.1,-.1],[.1,.1],{stroke:'#ff0000',strokeWidth:1,lineCap:'square',lineJoin:'round'});
const protectedPart=new Rectangle({width:.4,height:.4,fill:'#0000ff',stroke:'none'});
console.log('before square route');
const path=clearRoute([-2,0],[2,0],carrier,[protectedPart],frame);
console.log('square route',path);
const bend=path.find(p=>p[1]!==0);
const scene=new Scene({async frame(){}});scene.add(protectedPart,carrier.moveTo([0,bend[1]]));
const svg=toSvgString(scene,{width:800});console.log(svg);await writeFile(new URL('./fixed-route-square-cap.svg',import.meta.url),svg);
const full=await renderAsync(svg,{font:{loadSystemFonts:false}});
console.log('full rendered');
carrier.setStyle({opacity:0});
const bare=await renderAsync(toSvgString(scene,{width:800}),{font:{loadSystemFonts:false}});
const a=full.pixels,b=bare.pixels;let protectedPixels=0,lostPixels=0;for(let i=0;i<b.length;i+=4){if(b[i]===0&&b[i+1]===0&&b[i+2]===255){protectedPixels++;if(a[i]!==0||a[i+1]!==0||a[i+2]!==255)lostPixels++;}}
out.squareCap={path,checkedPosition:[0,bend[1]],protectedPixels,lostPixels};
assert.ok(lostPixels>0,'the planner admitted a real stroke/subject overlap');
await writeFile(new URL('./fixed-route-square-cap.png',import.meta.url),full.asPng());
await writeFile(new URL('./fixed-route-adversarial.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
console.log(out);
