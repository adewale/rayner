import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderAsync} from '@resvg/resvg-js';
import {loadFonts} from '../../explain/testing.ts';
import {adoptExplainer,scriptOf} from '../../explain/internal.ts';
import {scenariosOf,withSettings} from '../../explain/settings.ts';
import {loadScene} from '../../tools/lib/explain-project.ts';
import {toSvgString} from '../../src/index.ts';
await loadFonts();
const out='out/editorial-motion-review-2026-11-22/witnesses',receipts=[];
for(const chapter of ['poppy','poppy-refusals','poppy-sessions','poppy-sign-in','poppy-browser','poppy-conversations','poppy-coverage','poppy-discovery']){
 const file=process.cwd()+'/scenes/explainers/'+chapter+'/scene.ts';
 const loaded=await loadScene(file);adoptExplainer(loaded.Scene,file,await readFile(scriptOf(file),'utf8'),file);
 for(const settings of scenariosOf(loaded.Scene)){
  const Source=withSettings(loaded.Scene,settings),last=new Map();
  await new Source({async frame(scene){if(scene.currentStep)last.set(scene.currentStep.path,{svg:toSvgString(scene,{width:800}),absolute:scene.frameCount,time:scene.time,state:JSON.parse(JSON.stringify(scene.state)),shown:JSON.parse(JSON.stringify(scene.shown)),meta:scene.currentStep.meta});}}).run();
  const folder=out+'/'+chapter+'--'+(Object.values(settings).join('-')||'default');await mkdir(folder,{recursive:true});
  for(const [step,frame] of last){
   const image=await renderAsync(frame.svg,{font:{loadSystemFonts:false}});
   const pixels=image.pixels;
   const base=folder+'/'+step;
   await writeFile(base+'.svg',frame.svg);await writeFile(base+'.png',image.asPng());
   const {svg,...facts}=frame;receipts.push({chapter,settings,step,...facts,svgSha256:createHash('sha256').update(svg).digest('hex'),pixelsSha256:createHash('sha256').update(pixels).digest('hex'),png:base+'.png'});
  }
  console.log(chapter,JSON.stringify(settings),last.size);
 }
}
await writeFile(out+'/pictures.json',JSON.stringify(receipts,null,2));
