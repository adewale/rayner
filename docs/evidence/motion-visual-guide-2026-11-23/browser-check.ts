// Repository-owned presentation smoke check; does not execute or change scene code.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {launch} from '../../../tools/lib/browser.ts';
let root=resolve('docs/evidence/motion-visual-guide-2026-11-23');const output=resolve('out/visual-guide-smoke');await mkdir(output,{recursive:true});
const mime:any={'.html':'text/html','.png':'image/png','.mp4':'video/mp4','.gif':'image/gif','.json':'application/json','.zip':'application/zip'};
const server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url!,'http://local').pathname));assert.ok(file.startsWith(root+'/')||file===root);const path=file===root?join(root,'index.html'):file;const bytes=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]??'text/plain');res.end(bytes);}catch{res.writeHead(404);res.end();}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const address=server.address() as any,url='http://127.0.0.1:'+address.port;
const browser=await launch('Visual evidence presentation');const rows:any[]=[];
try{
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors:string[]=[],external:string[]=[],bad:string[]=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});page.on('request',r=>{if(!r.url().startsWith(url))external.push(r.url());});
  await page.goto(url);await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.locator('video[autoplay]').count(),0);assert.equal(await page.locator('video').count(),3);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'horizontal overflow');
  await page.screenshot({path:join(output,'top-'+width+'.png')});
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Skip to the evidence');await page.keyboard.press('Enter');
  await page.screenshot({path:join(output,'gallery-'+width+'.png'),fullPage:true});
  const videos=[];
  for(const index of [0,1,2]){
   const summary=page.locator('details').filter({has:page.locator('video')}).nth(index).locator('summary');await summary.click();
   const video=page.locator('video').nth(index);await video.evaluate(async(v:HTMLVideoElement)=>{v.load();await v.play();});
   await page.waitForFunction(i=>(document.querySelectorAll('video')[i] as HTMLVideoElement).currentTime>0.06,index);
   videos.push(await video.evaluate((v:HTMLVideoElement)=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error?.message??null})));
   assert.equal(videos.at(-1).width,1600);assert.equal(videos.at(-1).height,502);assert.equal(videos.at(-1).error,null);
   await video.evaluate(async(v:HTMLVideoElement)=>{v.pause();await new Promise<void>(r=>{v.addEventListener('seeked',()=>r(),{once:true});v.currentTime=v.duration*.6;});});
   await video.evaluate((v:HTMLVideoElement)=>v.pause());await summary.click();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.deepEqual(external,[]);rows.push({width,videos,consoleErrors:errors,missingResources:bad,externalConnections:external,keyboardSkip:'pass',overflow:'none',autoplay:false});await page.close();
 }
 const originalRoot=root,offline=await browser.newPage();
 try{await offline.goto(pathToFileURL(join(root,'index.html')).href);await offline.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));rows.push({directFile:'loaded'});}
 catch(e){if(!String(e).includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw e;rows.push({directFile:'blocked by managed browser policy; no bypass attempted'});}
 finally{await offline.close();}
 const extracted=await mkdtemp(join(tmpdir(),'rayner-gallery-offline-'));execFileSync('unzip',['-q',join(originalRoot,'offline-gallery.zip'),'-d',extracted]);root=extracted;
 try{
  const page=await browser.newPage(),external:string[]=[];
  await page.route('**/*',async route=>{if(route.request().url().startsWith(url))await route.continue();else{external.push(route.request().url());await route.abort();}});
  await page.goto(url);await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));
  for(const i of [0,1,2]){
   const summary=page.locator('details').filter({has:page.locator('video')}).nth(i).locator('summary');await summary.click();const v=page.locator('video').nth(i);await v.evaluate(async(v:HTMLVideoElement)=>{v.load();await v.play();});await page.waitForFunction(i=>(document.querySelectorAll('video')[i] as HTMLVideoElement).currentTime>.06,i);assert.equal(await v.evaluate((v:HTMLVideoElement)=>v.videoWidth),1600);await v.evaluate((v:HTMLVideoElement)=>v.pause());await summary.click();
  }
  assert.deepEqual(external,[]);rows.push({freshExtractedBundle:'all images and all3MP4play',network:'localhost only; outside requests blocked',externalConnections:external});await page.close();
 }finally{await rm(extracted,{recursive:true,force:true});}
 await writeFile(join(output,'receipt.json'),JSON.stringify({browser:browser.version(),rows},null,2)+'\n');console.log(JSON.stringify(rows));
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
