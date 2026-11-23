import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderAsync} from '@resvg/resvg-js';
import {loadFonts} from '../../explain/testing.ts';
import {adoptExplainer,scriptOf,liveSteps,LiveSink,liveBase,runLive} from '../../explain/internal.ts';
import {withSettings} from '../../explain/settings.ts';
import {loadScene} from '../../tools/lib/explain-project.ts';
import {toSvgString} from '../../src/index.ts';
await loadFonts();
const cases=[
 {chapter:'poppy-sign-in',settings:{flow:'direct'},step:'sign-out',log:['ask','approve-read','collect'],id:'signin-direct-grant'},
 {chapter:'poppy-sign-in',settings:{flow:'device'},step:'sign-out',log:['ask','approve-read','collect'],id:'signin-device-grant'},
 {chapter:'poppy-sessions',settings:{company:'remembers'},step:'one-user',log:['published'],id:'sessions-remembers-published'},
 {chapter:'poppy-sessions',settings:{company:'required'},step:'one-user',log:['published'],id:'sessions-required-published'},
 {chapter:'poppy-conversations',settings:{},step:'read',log:['direct'],id:'conversations-open-direct'},
 {chapter:'poppy-coverage',settings:{company:'hostile'},step:'search',log:['read tasks','gift card','report'],id:'coverage-hostile-report'},
 {chapter:'poppy-coverage',settings:{company:'honest'},step:'search',log:['read tasks','gift card','report'],id:'coverage-honest-report'},
];
for(const item of cases){
 const file=process.cwd()+'/scenes/explainers/'+item.chapter+'/scene.ts';const loaded=await loadScene(file);adoptExplainer(loaded.Scene,file,await readFile(scriptOf(file),'utf8'),file);
 const Source=withSettings(loaded.Scene,item.settings),ran=await new Source(new LiveSink()).run(),place=liveSteps(ran).get(item.step)!;const {base}=await liveBase(Source,item.step,place);if(!base)throw Error('no root');
 const folder='out/editorial-motion-review-2026-11-22/witnesses/'+item.id;await mkdir(folder,{recursive:true});let origin:number|undefined,last:any;const frames=[];
 await runLive(Source,item.step,place,item.log,{from:base.from,animate:{async frame(scene){origin??=scene.frameCount;const offset=scene.frameCount-origin;const r={absolute:scene.frameCount,offset,time:scene.time,seconds:offset/scene.fps,svg:toSvgString(scene,{width:800})};last=r;if(offset%15===0)frames.push(r);}}});
 if(frames.at(-1)?.offset!==last.offset)frames.push(last);
 const receipt=[];for(const f of frames){const image=await renderAsync(f.svg,{font:{loadSystemFonts:false}}),pixels=image.pixels;const filename=String(f.offset).padStart(4,'0');await writeFile(folder+'/'+filename+'.png',image.asPng());await writeFile(folder+'/'+filename+'.svg',f.svg);const {svg,...r}=f;receipt.push({...r,pixelsSha256:createHash('sha256').update(pixels).digest('hex'),svgSha256:createHash('sha256').update(svg).digest('hex')});}
 await writeFile(folder+'/receipt.json',JSON.stringify({...item,from:base.from,base:base.state,frames:receipt},null,2));console.log(item.id,last.offset/30,frames.length);
}
