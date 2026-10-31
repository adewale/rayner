import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Browser, Frame, Page} from 'playwright-core';
import type {StepDetail} from '../app/embed-protocol.ts';
import {collectProject} from '../tools/lib/explain-project.ts';
import {buildExplainer, buildLoader} from '../tools/lib/explain-build.ts';
import {serve} from '../tools/lib/explain-serve.ts';
import {launch} from '../tools/lib/browser.ts';

const enabled=!!process.env.EXPLAIN_BROWSER;
const options={skip:enabled?false:'set EXPLAIN_BROWSER=1 for loading and host transport checks'};
type Gate = Window & {holdCase:boolean; releaseCase?:()=>void; receivedLatest:boolean};
type Host = Window & {reader:{goTo(step:string,settings:Record<string,string>):void}; heard:StepDetail[]};
let browser:Browser,folder:string,server:Awaited<ReturnType<typeof serve>>;
before(async()=>{
  if(!enabled)return;
  folder=await mkdtemp(join(tmpdir(),'rayner-loading-'));
  const fixture=join(folder,'fixture');await mkdir(fixture);
  // An authored async construct is held by the test, not by a production reset hook.
  await writeFile(join(fixture,'scene.ts'),`import{Scene,Text}from'rayner';import{settingsOf}from'rayner/explain';
    export default class PendingCase extends Scene {
      static settings=[{id:'mode',label:'Mode',default:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}]}];
      async construct(){const mode=settingsOf(this).mode;
        if(mode==='b'&&typeof window!=='undefined'&&(window as any).holdCase)
          await new Promise<void>(resolve=>{(window as any).releaseCase=resolve;});
        await this.step('one',{title:'One',caption:'Case '+mode});this.add(new Text(mode));await this.wait(.1);
        await this.step('two',{title:'Two',caption:'Case '+mode});await this.wait(.1);
      }
    }`);
  await buildExplainer(await collectProject(fixture,{write:false}),join(folder,'probe.html'));
  await buildLoader(join(folder,'loader.js'));
  server=await serve(folder,0,'host.html');
  await writeFile(join(folder,'host.html'),`<!doctype html><div id="reader"></div><script src="loader.js"></script><script>
    window.heard=[];window.reader=RaynerEmbed.mountExplainer(document.getElementById('reader'),${JSON.stringify(server.url+'/probe.html?mode=a&step=one')},{title:'Pending case',onStep:detail=>heard.push(detail)});
  </script>`);
  browser=await launch();
});
after(async()=>{if(!enabled)return;await browser?.close();server?.close();if(folder)await rm(folder,{recursive:true,force:true});});
async function opened(run:(page:Page,frame:Frame)=>Promise<void>) {
  const context=await browser.newContext({viewport:{width:1280,height:1200},reducedMotion:'reduce'});
  const page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(server.url+'/host.html');
    const element=await page.locator('#reader iframe').elementHandle();
    const frame=await element!.contentFrame();assert.ok(frame);
    await frame.waitForSelector('[data-ready=true]');
    await page.waitForFunction(()=>(window as unknown as Host).heard.length===1);
    await frame.evaluate(()=>{
      const w=window as unknown as Gate;w.holdCase=true;w.receivedLatest=false;
      window.addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='rayner:goto'&&event.data.step==='two'&&event.data.settings?.mode==='a')w.receivedLatest=true;});
    });
    await run(page,frame);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
}
const go=(page:Page,mode:string,step='one')=>page.evaluate(({mode,step})=>(window as unknown as Host).reader.goTo(step,{mode}),{mode,step});
async function held(page:Page,frame:Frame) {
  await go(page,'b');
  await frame.waitForFunction(()=>typeof(window as unknown as Gate).releaseCase==='function'&&!!document.querySelector('#content.loading'));
}
const release=(frame:Frame)=>frame.evaluate(()=>{const w=window as unknown as Gate;w.holdCase=false;w.releaseCase!();});
const twoFrames=(frame:Frame)=>frame.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
const view=(frame:Frame)=>frame.locator('.stage svg:not(.leaving)').getAttribute('viewBox');
async function wheel(page:Page,frame:Frame,deltaY:number) {
  await frame.locator('.stage').hover();await page.keyboard.down('Control');
  await page.mouse.wheel(0,deltaY);await page.keyboard.up('Control');await twoFrames(frame);
}

test('a later trusted host request supersedes a case still loading and replaces history',options,async()=>opened(async(page,frame)=>{
  const history=await frame.evaluate(()=>window.history.length);
  await held(page,frame);await go(page,'a','two');
  // Observe message delivery before releasing B; a queued-but-undelivered A cannot hide a dropped request.
  await frame.waitForFunction(()=>(window as unknown as Gate).receivedLatest);
  await release(frame);
  await page.waitForFunction(()=>{const last=(window as unknown as Host).heard.at(-1);return last?.step==='two'&&last.settings.mode==='a';},undefined,{timeout:3000});
  await twoFrames(frame);
  assert.deepEqual(await frame.evaluate(()=>({step:new URLSearchParams(location.search).get('step'),mode:new URLSearchParams(location.search).get('mode'),chosen:document.querySelector<HTMLInputElement>('.case input:checked')?.value})),{step:'two',mode:'a',chosen:'a'});
  assert.deepEqual(await page.evaluate(()=>(window as unknown as Host).heard.map(d=>[d.settings.mode,d.step])),[['a','one'],['a','two']]);
  assert.equal(await frame.evaluate(()=>window.history.length),history);
}));

test('both footer links keep their native new-tab navigation while a case loads',options,async()=>opened(async(page,frame)=>{
  await page.context().route('https://github.com/**',route=>route.fulfill({contentType:'text/html',body:'<title>Footer destination</title>'}));
  await held(page,frame);let opened=0;
  for(const selector of ['a.mark','a.open']) {
    assert.equal(await frame.locator('#content.loading').count(),1);
    const link=frame.locator(selector),href=await link.getAttribute('href');
    const destination=page.context().waitForEvent('page',{timeout:3000});
    await link.click();const popup=await destination;await popup.waitForLoadState('domcontentloaded');
    assert.equal(popup.url(),href);opened++;await popup.close();
  }
  assert.equal(opened,2);await release(frame);
}));

test('loading gates zoom gestures while Tab can still advance focus',options,async()=>opened(async(page,frame)=>{
  await wheel(page,frame,-80);await held(page,frame);const frozen=await view(frame);
  const next=frame.getByRole('button',{name:'Next step',exact:true});assert.ok(await next.isEnabled());
  await next.focus();assert.ok(await next.evaluate(element=>element===document.activeElement));
  await page.keyboard.press('Tab');assert.equal(await next.evaluate(element=>element===document.activeElement),false,'Tab can leave an enabled control while loading');
  await wheel(page,frame,80);assert.equal(await view(frame),frozen,'Ctrl+wheel cannot zoom during loading');
  await frame.locator('.stage').dblclick();await twoFrames(frame);
  assert.equal(await view(frame),frozen,'double-click cannot zoom during loading');
  await release(frame);
}));

test('a drag pauses during loading and its pointer release is still cleaned up',options,async()=>opened(async(page,frame)=>{
  await wheel(page,frame,-80);
  const stage=frame.locator('.stage'),box=(await stage.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await held(page,frame);const frozen=await view(frame);
  await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+20);await twoFrames(frame);
  assert.equal(await view(frame),frozen,'an existing drag cannot pan during loading');
  await page.mouse.up();await release(frame);
  await frame.waitForFunction(()=>!document.querySelector('#content.loading'));
  await wheel(page,frame,-80);const released=await view(frame);
  assert.notEqual(released,await stage.locator('svg:not(.leaving)').getAttribute('data-camera'),'the post-load picture is zoomed before checking for a ghost drag');
  const next=(await stage.boundingBox())!;
  await page.mouse.move(next.x+next.width/2+60,next.y+next.height/2+30);await twoFrames(frame);
  assert.equal(await view(frame),released,'a pointer released during loading cannot become a ghost drag afterwards');
}));
