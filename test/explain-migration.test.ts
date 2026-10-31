// Temporary old/new production-player harness; deleted by migration stage 4.
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Browser,Page} from 'playwright-core';
import type {Scheduler} from 'fast-check';
import {serve} from '../tools/lib/explain-serve.ts';
import {launch} from '../tools/lib/browser.ts';
import {fc,params} from './lib/pbt.ts';

const baseline=process.env.RAYNER_PLAYER_BASELINE&&resolve(process.env.RAYNER_PLAYER_BASELINE);
const enabled=!!process.env.EXPLAIN_BROWSER&&!!baseline;
const options={skip:enabled?false:'set EXPLAIN_BROWSER=1 and RAYNER_PLAYER_BASELINE to an immutable baseline worktree'};
const loadingPhase=process.env.RAYNER_LOADING_PHASE==='1';
let browser:Browser,folder:string,server:Awaited<ReturnType<typeof serve>>;
type Detail={step:string;settings:{mode:string}};
type Probe=Window&{holdCase:boolean;heldCases:Array<()=>void>;last:Detail|null;completeResume():Promise<void>};
before(async()=>{
  if(!enabled)return;
  folder=await mkdtemp(join(tmpdir(),'rayner-migration-'));
  const fixture=join(folder,'fixture');await mkdir(fixture);
  await writeFile(join(fixture,'scene.ts'),`import{Scene,Text}from'rayner';import{settingsOf}from'rayner/explain';
    const audio={clips:[{id:'a',label:'Play A',bpm:120,beats:64,notes:[{midi:60,at:0,duration:64}]}]};
    export default class MigrationCase extends Scene {
      static meta={title:'Migration parity'};
      static settings=[{id:'mode',label:'Mode',default:'a',options:[{value:'a',label:'A'},{value:'b',label:'B'}]}];
      async construct(){const mode=settingsOf(this).mode;
        if(mode==='b'&&typeof window!=='undefined'&&(window as any).holdCase)
          await new Promise<void>(resolve=>{(window as any).heldCases.push(resolve);});
        for(const name of ['one','two','three']){
          await this.step(name,{title:name,caption:'Case '+mode+' keeps this named picture until the next reader request.',audio});
          this.add(new Text(mode+' '+name));await this.wait(1);
        }
      }
    }`);
  // Import BOTH builders from their respective trees: importing only the old scene
  // through the new builder would still bundle the new app/embed.ts.
  for(const [label,root] of [['old',baseline!],['candidate',process.cwd()]] as const){
    const projectModule=await import(pathToFileURL(join(root,'tools/lib/explain-project.ts')).href) as typeof import('../tools/lib/explain-project.ts');
    const buildModule=await import(pathToFileURL(join(root,'tools/lib/explain-build.ts')).href) as typeof import('../tools/lib/explain-build.ts');
    await buildModule.buildExplainer(await projectModule.collectProject(fixture,{write:false}),join(folder,label,'probe.html'));
  }
  server=await serve(folder,0,'candidate/probe.html');browser=await launch();
});
after(async()=>{if(!enabled)return;await browser?.close();server?.close();if(folder)await rm(folder,{recursive:true,force:true});});
async function opened(label:string,scheduler?:Scheduler){
  const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1280,height:1200}});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('completeResume',()=>scheduler?scheduler.schedule(Promise.resolve(),label+' audio resume'):Promise.resolve());
  await page.addInitScript(()=>{
    const w=window as unknown as Probe;w.holdCase=false;w.heldCases=[];w.last=null;
    document.addEventListener('rayner:step',event=>{w.last=(event as CustomEvent<Detail>).detail;});
    const Native=AudioContext;
    (window as any).AudioContext=class extends Native{
      override resume(){return w.completeResume().then(()=>super.resume());}
    };
  });
  try{await page.goto(server.url+'/'+label+'/probe.html?mode=a&step=one');await page.waitForSelector('[data-ready=true]');await ready(page);}
  catch(error){await context.close();throw error;}
  return {context,page,errors};
}
async function ready(page:Page){
  await page.waitForFunction(()=>{const w=window as unknown as Probe,q=new URLSearchParams(location.search);return !document.querySelector('#content.loading,.stage[aria-busy=true]')&&w.last?.step===q.get('step')&&w.last.settings.mode===q.get('mode');},undefined,{timeout:10000});
}
const twoFrames=(page:Page)=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
const observed=(page:Page)=>page.evaluate(()=>({
  mode:new URLSearchParams(location.search).get('mode'),step:new URLSearchParams(location.search).get('step'),
  url:location.search,caption:document.querySelector('.caption')!.textContent,
  picture:document.querySelector('.stage > svg:not(.leaving)')?.outerHTML,
  controls:Array.from(document.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input')).map(b=>({text:b.textContent,name:b.getAttribute('aria-label'),disabled:b.disabled,hidden:b.hidden,current:b.getAttribute('aria-current'),checked:'checked' in b?b.checked:undefined})),
  history:history.length,
}));
const actionArb=fc.array(fc.record({kind:fc.constantFrom('next','previous','first','last','play','stop','pulse','case-a','case-b'),release:fc.boolean()}),{minLength:1,maxLength:10});
test('migration: generated actions and scheduled audio completions preserve URL, caption, picture, controls and history',options,async()=>{
  await fc.assert(fc.asyncProperty(actionArb,fc.scheduler(),async(actions,scheduler)=>{
    const results=[];
    for(const label of ['old','candidate']){
      const {context,page,errors}=await opened(label,scheduler);
      try{
        for(const action of actions){
          if(action.kind==='play'){
            const button=page.locator('.score-audio button').first();if(await button.isEnabled())await button.click();
          }else await page.evaluate(kind=>{
            const click=(selector:string)=>document.querySelector<HTMLButtonElement>(selector)?.click();
            if(kind==='next')click('.stepper button[aria-label="Next step"]');
            if(kind==='previous')click('.stepper button[aria-label="Previous step"]');
            if(kind==='first')click('.steps li:first-child button');
            if(kind==='last')click('.steps li:last-child button');
            if(kind==='stop')Array.from(document.querySelectorAll<HTMLButtonElement>('.score-audio button')).find(b=>b.textContent==='Stop')?.click();
            if(kind==='pulse')click('.score-audio input');
            if(kind==='case-a'||kind==='case-b')click('.case input[value='+kind.at(-1)+']');
          },action.kind);
          if(action.kind.startsWith('case-'))await ready(page);
          if(action.release&&scheduler.count())await scheduler.waitOne();
        }
        await scheduler.waitAll();await ready(page);await twoFrames(page);
        results.push(await observed(page));assert.deepEqual(errors,[]);
      }finally{await context.close();}
    }
    assert.deepEqual(results[1],results[0]);
  }),params(6));
});
test('migration: held B plus Next records the declared loading-policy difference',options,async()=>{
  const rows=[];
  for(const label of ['old','candidate']){
    const {context,page,errors}=await opened(label);
    try{
      const opening=await observed(page);
      await page.evaluate(()=>{(window as unknown as Probe).holdCase=true;document.querySelector<HTMLInputElement>('.case input[value=b]')!.click();});
      await page.waitForFunction(()=>(window as unknown as Probe).heldCases.length>0&&!!document.querySelector('#content.loading'));
      await page.getByRole('button',{name:'Next step',exact:true}).click();await twoFrames(page);
      const pending=await observed(page);
      await page.evaluate(()=>{const w=window as unknown as Probe;w.holdCase=false;w.heldCases.splice(0).forEach(resolve=>resolve());});
      await page.waitForFunction(()=>(window as unknown as Probe).last?.settings.mode==='b');await ready(page);
      const final=await observed(page),step=label==='candidate'&&loadingPhase?'one':'two';
      assert.deepEqual([pending.mode,pending.step,final.mode,final.step],['a',step,'b',step]);
      assert.equal(final.history-opening.history,label==='candidate'&&loadingPhase?1:2);
      assert.deepEqual(errors,[]);rows.push({label,pending,final});
    }finally{await context.close();}
  }
  if(!loadingPhase)assert.deepEqual(rows[1]!.final,rows[0]!.final);
});
