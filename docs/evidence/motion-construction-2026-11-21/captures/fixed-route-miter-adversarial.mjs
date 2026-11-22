import {Scene, Rectangle, Polygon, toSvgString} from '../../src/index.ts';
import {clearRoute} from '../../scenes/explainers/lib/clear-route.ts';
import {renderAsync} from '@resvg/resvg-js';
import {writeFile} from 'node:fs/promises';
const rows=[];
for (const miterLimit of [-1, .1, 1, 2, 4, undefined]) {
  const carrier=new Polygon([[-.1,.1],[0,-.1],[.1,.1]], {fill:'none',stroke:'#ff0000',strokeWidth:.5,lineCap:'butt',lineJoin:'miter',miterLimit});
  const subject=new Rectangle({width:.4,height:.4,fill:'#0000ff',stroke:'none'});
  const path=clearRoute([-4,0],[4,0],carrier,[subject],[-8,-4.5,8,4.5]);
  const bend=path.find(p=>p[1]!==0);
  const scene=new Scene({async frame(){}});scene.add(subject);
  const opts={font:{loadSystemFonts:false}};
  const before=(await renderAsync(toSvgString(scene,{width:800}),opts)).pixels;
  scene.add(carrier.moveTo([0,bend[1]]));
  const after=(await renderAsync(toSvgString(scene,{width:800}),opts)).pixels;
  let protectedPixels=0,lostPixels=0;
  for(let i=0;i<before.length;i+=4) if(before[i]===0&&before[i+1]===0&&before[i+2]===255){protectedPixels++;if(after[i]!==0||after[i+1]!==0||after[i+2]!==255)lostPixels++;}
  rows.push({miterLimit: miterLimit ?? 'undefined',path,protectedPixels,lostPixels});
}
await writeFile(new URL('./fixed-route-miter-adversarial.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify(rows));
