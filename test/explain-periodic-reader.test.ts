import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Browser} from 'playwright-core';
import {Text} from '../src/index.ts';
import {collectProject} from '../tools/lib/explain-project.ts';
import type {Project} from '../tools/lib/explain-project.ts';
import {buildExplainer} from '../tools/lib/explain-build.ts';
import {serve} from '../tools/lib/explain-serve.ts';
import {launch} from '../tools/lib/browser.ts';
import {storyFrames,inspectStoryFrame,covered} from '../tools/lib/explain-story-review.ts';
import type {StoryClaim} from '../tools/lib/explain-story-review.ts';

const enabled=!!process.env.EXPLAIN_BROWSER;
const options={skip:enabled?false:'set EXPLAIN_BROWSER=1 for served periodic-table reader checks'};
let project:Project,folder:string,browser:Browser,server:Awaited<ReturnType<typeof serve>>;
const families:Record<string,string[]>={
  na:['H','Li','Na','K','Rb','Cs','Fr'],cl:['F','Cl','Br','I','At','Ts'],
  fe:['Fe','Ru','Os','Hs'],cu:['Cu','Ag','Au','Rg'],he:['He','Ne','Ar','Kr','Xe','Rn','Og'],
};
const counted:Record<string,string[]>={na:['Na'],cl:['Na','Mg','Al','Si','P','S','Cl'],fe:['K','Ca','Sc','Ti','V','Cr','Mn','Fe']};
before(async()=>{
  if(!enabled)return;
  project=await collectProject('scenes/explainers/periodic-groups',{write:false});
  assert.equal(project.variants.length,5);
  folder=await mkdtemp(join(tmpdir(),'rayner-periodic-reader-'));
  await buildExplainer(project,join(folder,'periodic.html'));
  server=await serve(folder,0,'periodic.html');browser=await launch();
});
after(async()=>{
  if(!enabled)return;
  await browser?.close();server?.close();if(folder)await rm(folder,{recursive:true,force:true});
});

test('phone openings show each complete family and the count/group comparison without a close-up tour',options,async()=>{
  let openings=0,targets=0;
  for(const variant of project.variants){
    const element=variant.values.element!;
    const members=families[element]!;
    const familyTargets=[...members.map(symbol=>({key:`periodic-member:${symbol}`})),
      ...members.slice(1).map((symbol,i)=>({key:`periodic-jump:${members[i]}:${symbol}`}))];
    const countTargets:StoryClaim['targets']=element==='cu'?
      [{text:'[Ar] 4s² 3d⁹'},{text:'[Ar] 3d¹⁰ 4s¹'},{text:'11 counted either way = group 11'}]:
      element==='he'?[{key:'periodic-helium:2'},{key:'periodic-helium:18'}]:
      counted[element]!.map(symbol=>({key:`periodic-count:${symbol}`}));
    const claims:StoryClaim[]=[{step:'column',opening:true,targets:familyTargets},{step:'count',opening:true,targets:countTargets}];
    let frames:Awaited<ReturnType<typeof storyFrames>>|undefined;
    for(const viewport of [{width:320,height:568},{width:390,height:844}]){
      const page=await browser.newPage({viewport,reducedMotion:'reduce'});
      try{
        for(const step of ['column','count']){
          await page.goto(`${server.url}/periodic.html?element=${element}&step=${step}`);
          await page.waitForSelector('[data-ready=true]');
          await page.waitForFunction(()=>!document.querySelector('#content.loading')&&!document.querySelector('svg.leaving'));
          assert.match((await page.locator('.view-controls>span').textContent())??'',/^View 1 of 1$/,
            `${element}/${step}/${viewport.width}: the comparison must fit together`);
          frames??=await storyFrames(variant.Scene,claims);
          const frame=frames.get(step)!;
          const seen=await inspectStoryFrame(page,frame);
          const claimed=frame.targets.filter(t=>t.opening);
          assert.equal(claimed.length,step==='column'?familyTargets.length:countTargets.length);
          for(const target of claimed)for(const index of target.indices){
            const ink=seen.ink.find(p=>p.index===index)!;
            assert.ok(ink.visible&&ink.complete&&covered(ink.box,[seen.viewport]),
              `${element}/${step}/${viewport.width}: ${target.name} must be completely painted in the opening`);
          }
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
          openings++;targets+=claimed.length;
        }
      }finally{await page.close();}
    }
  }
  assert.equal(openings,20);assert.equal(targets,144);
});

test('count-step labels stay at least 12 CSS pixels in actual short laptop stages',options,async()=>{
  let stages=0;
  for(const variant of project.variants){
    let minimum=Infinity;
    await new variant.Scene({async frame(){},async stepEnd(scene,step){
      if(step.name!=='count')return;
      const labels=scene.familyMembers().filter((m):m is Text=>m instanceof Text&&!!m.text.trim());
      assert.ok(labels.length>0);
      minimum=Math.min(...labels.map(m=>m.textSize()));
    }},{skipUntil:Infinity}).run();
    assert.ok(Number.isFinite(minimum));
    for(const viewport of [1100,1212,1280].flatMap(width=>[720,800].map(height=>({width,height})))){
      const page=await browser.newPage({viewport,reducedMotion:'reduce'});
      try{
        await page.goto(`${server.url}/periodic.html?element=${variant.values.element}&step=count`);
        await page.waitForSelector('[data-ready=true]');
        await page.waitForFunction(()=>!document.querySelector('#content.loading')&&!document.querySelector('svg.leaving'));
        const scale=await page.locator('.stage svg:not(.leaving)').evaluate(svg=>{
          const matrix=(svg as SVGSVGElement).getScreenCTM()!;return Math.hypot(matrix.a,matrix.b)*1000;
        });
        assert.ok(minimum*scale>=12-1e-6,`${variant.values.element}/${viewport.width}×${viewport.height}: smallest count-step label is ${minimum*scale}px`);
        stages++;
      }finally{await page.close();}
    }
  }
  assert.equal(stages,30);
});

test('all 118 atomic numbers and the block strip read at least 12 CSS pixels in short standalone windows',options,async()=>{
  let stages=0,labels=0;
  for(const variant of project.variants){
    const frame=(await storyFrames(variant.Scene)).get('blocks')!;
    const small=frame.labels.filter(label=>label.size<.23);
    assert.equal(small.length,124,'118 atomic numbers and six block-strip labels');
    assert.deepEqual(small.filter(label=>/^\d+$/.test(label.text)).map(label=>Number(label.text)).sort((a,b)=>a-b),
      Array.from({length:118},(_,i)=>i+1),'the complete periodic table must be present');
    for(const viewport of [{width:1280,height:720},{width:1366,height:768}]){
      const page=await browser.newPage({viewport,reducedMotion:'reduce'});
      try{
        await page.goto(`${server.url}/periodic.html?element=${variant.values.element}&step=blocks`);
        await page.waitForSelector('[data-ready=true]');
        await page.waitForFunction(()=>!document.querySelector('#content.loading')&&!document.querySelector('svg.leaving'));
        const seen=await inspectStoryFrame(page,frame);
        for(const label of small){
          const ink=label.indices.map(index=>seen.ink.find(p=>p.index===index)!);
          assert.ok(ink.length>0&&ink.every(p=>p.visible&&p.complete&&covered(p.box,[seen.viewport])),`${label.text}: complete visible ink`);
          const pixels=label.size*Math.min(...ink.map(p=>p.scale));
          assert.ok(pixels>=12-1e-6,`${variant.values.element}/${viewport.width}×${viewport.height}: ${label.text} reads at ${pixels}px`);
          labels++;
        }
        assert.ok(seen.stage[2]-seen.stage[0]>=880-1,'the served stage respects the per-page floor');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        stages++;
      }finally{await page.close();}
    }
  }
  assert.equal(stages,10);assert.equal(labels,1240);
});
