import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Browser} from 'playwright-core';
import {collectProject} from '../tools/lib/explain-project.ts';
import type {Project} from '../tools/lib/explain-project.ts';
import {buildExplainer} from '../tools/lib/explain-build.ts';
import {serve} from '../tools/lib/explain-serve.ts';
import {launch} from '../tools/lib/browser.ts';
import {storyFrames,inspectStoryFrame,covered} from '../tools/lib/explain-story-review.ts';
import type {StoryClaim} from '../tools/lib/explain-story-review.ts';

const enabled=!!process.env.EXPLAIN_BROWSER;
const options={skip:enabled?false:'set EXPLAIN_BROWSER=1 for served birthday reader checks'};
let project:Project,folder:string,browser:Browser,server:Awaited<ReturnType<typeof serve>>;
before(async()=>{
  if(!enabled)return;
  project=await collectProject('scenes/explainers/birthday-paradox',{write:false});
  assert.deepEqual(project.variants.map(v=>v.values),[10,23,40].map(people=>({people:String(people)})));
  folder=await mkdtemp(join(tmpdir(),'rayner-birthday-reader-'));
  await buildExplainer(project,join(folder,'birthday.html'));
  server=await serve(folder,0,'birthday.html');browser=await launch();
});
after(async()=>{
  if(!enabled)return;
  await browser?.close();server?.close();if(folder)await rm(folder,{recursive:true,force:true});
});

test('every birthday card and its date are visible together in each phone opening',options,async()=>{
  let openings=0,cards=0,labels=0;
  for(const variant of project.variants){
    const people=Number(variant.values.people);
    // Name each person independently: fitting a broad group or most of a row
    // must not earn credit for the final card beyond the right-hand edge.
    const claims:StoryClaim[]=[{step:'room',opening:true,
      targets:Array.from({length:people},(_,i)=>({key:`person-${i}`}))}];
    const frame=(await storyFrames(variant.Scene,claims)).get('room')!;
    const targets=frame.targets.filter(t=>t.opening);
    assert.equal(targets.length,people);
    const indices=new Set(targets.flatMap(t=>t.indices));
    const days=frame.labels.filter(label=>label.indices.some(index=>indices.has(index)));
    assert.equal(days.length,people,'each person must retain a readable date');
    assert.ok(days.every(label=>/^([1-9]|[12]\d|3[01]) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(label.text)));
    for(const viewport of [{width:320,height:568},{width:390,height:844}]){
      const page=await browser.newPage({viewport,reducedMotion:'reduce'});
      try{
        await page.addInitScript(()=>{
          (window as unknown as {birthdayStep?:string}).birthdayStep=undefined;
          document.addEventListener('rayner:step',event=>{
            (window as unknown as {birthdayStep?:string}).birthdayStep=(event as CustomEvent<{step:string}>).detail.step;
          });
        });
        await page.goto(`${server.url}/birthday.html?${new URLSearchParams({...variant.values,step:'room'})}`);
        await page.waitForSelector('[data-ready=true]');
        await page.waitForFunction(()=>(window as unknown as {birthdayStep?:string}).birthdayStep==='room'&&
          !document.querySelector('#content.loading')&&!document.querySelector('svg.leaving'));
        const seen=await inspectStoryFrame(page,frame);
        const name=`${people}/${viewport.width}`;
        for(const target of targets){
          assert.ok(target.indices.length>0);
          for(const index of target.indices){
            const ink=seen.ink.find(p=>p.index===index)!;
            assert.ok(ink.visible&&ink.complete&&covered(ink.box,[seen.viewport]),
              `${name}: ${target.name} must be completely painted in the opening`);
          }
          const day=days.find(label=>label.indices.some(index=>target.indices.includes(index)))!;
          const outlines=target.indices.filter(index=>!day.indices.includes(index));
          assert.equal(outlines.length,1,'each person has one card outline');
          for(const index of day.indices)assert.ok(covered(seen.ink.find(p=>p.index===index)!.box,
            [seen.ink.find(p=>p.index===outlines[0])!.box]),`${name}: ${target.name} day must fit its card`);
          cards++;
        }
        for(const day of days){
          const pixels=day.size*Math.min(...day.indices.map(index=>seen.ink.find(p=>p.index===index)!.scale));
          assert.ok(pixels>=12-1e-6,`${name}: day ${day.text} reads at ${pixels}px`);
          labels++;
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        openings++;
      }finally{await page.close();}
    }
  }
  assert.equal(openings,6);assert.equal(cards,146);assert.equal(labels,146);
});
