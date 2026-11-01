import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Browser,Page} from 'playwright-core';
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
const frameCache=new Map<Project['variants'][number],ReturnType<typeof storyFrames>>();
const openingClaims=(element:string):StoryClaim[]=>{
  const members=families[element]!;
  const familyTargets=[...members.map(symbol=>({key:`periodic-member:${symbol}`})),
    ...members.slice(1).map((symbol,i)=>({key:`periodic-jump:${members[i]}:${symbol}`}))];
  const countTargets:StoryClaim['targets']=element==='cu'?
    [{text:'[Ar] 4s² 3d⁹'},{text:'[Ar] 3d¹⁰ 4s¹'},{text:'11 counted either way = group 11'}]:
    element==='he'?[{key:'periodic-helium:2'},{key:'periodic-helium:18'}]:
    counted[element]!.map(symbol=>({key:`periodic-count:${symbol}`}));
  return [{step:'column',opening:true,targets:familyTargets},{step:'count',opening:true,targets:countTargets}];
};
function framesFor(variant:Project['variants'][number]){
  let frames=frameCache.get(variant);
  if(!frames){frames=storyFrames(variant.Scene,openingClaims(variant.values.element!));frameCache.set(variant,frames);}
  return frames;
}
const settled=(page:Page)=>page.evaluate(async()=>{for(let n=0;n<4;n++)await new Promise<void>(r=>requestAnimationFrame(()=>r()));});
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
    const claims=openingClaims(element),frames=await framesFor(variant);
    for(const viewport of [{width:320,height:568},{width:390,height:844}]){
      const page=await browser.newPage({viewport,reducedMotion:'reduce'});
      try{
        for(const step of ['column','count']){
          await page.goto(`${server.url}/periodic.html?element=${element}&step=${step}`);
          await page.waitForSelector('[data-ready=true]');
          await page.waitForFunction(()=>!document.querySelector('#content.loading')&&!document.querySelector('svg.leaving'));
          assert.match((await page.locator('.view-controls>span').textContent())??'',/^View 1 of 1$/,
            `${element}/${step}/${viewport.width}: the comparison must fit together`);
          const frame=frames.get(step)!;
          const seen=await inspectStoryFrame(page,frame);
          const claimed=frame.targets.filter(t=>t.opening);
          assert.equal(claimed.length,claims.find(c=>c.step===step)!.targets.length);
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

test('all 118 atomic numbers and the block strip read at least 12 CSS pixels in short standalone and fullscreen windows',options,async()=>{
  let stages=0,fullscreen=0,labels=0;
  for(const variant of project.variants){
    const frame=(await framesFor(variant)).get('blocks')!;
    const small=frame.labels.filter(label=>label.size<.23);
    assert.equal(small.length,124,'118 atomic numbers and six block-strip labels');
    assert.deepEqual(small.filter(label=>/^\d+$/.test(label.text)).map(label=>Number(label.text)).sort((a,b)=>a-b),
      Array.from({length:118},(_,i)=>i+1),'the complete periodic table must be present');
    const readable=(seen:Awaited<ReturnType<typeof inspectStoryFrame>>,where:string)=>{
      const byIndex=new Map(seen.ink.map(p=>[p.index,p]));
      for(const label of small){
        const ink=label.indices.map(index=>byIndex.get(index)!);
        assert.ok(ink.length>0&&ink.every(p=>p.visible&&p.complete&&covered(p.box,[seen.viewport])),`${where}/${label.text}: complete visible ink`);
        const pixels=label.size*Math.min(...ink.map(p=>p.scale));
        assert.ok(pixels>=12-1e-6,`${where}: ${label.text} reads at ${pixels}px`);
      }
    };
    for(const viewport of [{width:1280,height:720},{width:1366,height:768}]){
      const page=await browser.newPage({viewport,reducedMotion:'reduce'});
      try{
        await page.goto(`${server.url}/periodic.html?element=${variant.values.element}&step=blocks`);
        await page.waitForSelector('[data-ready=true]');
        await page.waitForFunction(()=>!document.querySelector('#content.loading')&&!document.querySelector('svg.leaving'));
        const seen=await inspectStoryFrame(page,frame);
        readable(seen,`${variant.values.element}/${viewport.width}×${viewport.height}`);
        labels+=small.length;
        assert.ok(seen.stage[2]-seen.stage[0]>=880-1,'the served stage respects the per-page floor');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        stages++;
        if(variant===project.variants[0]){
          await page.getByRole('button',{name:'Enlarge'}).click();
          await page.waitForFunction(()=>!!document.fullscreenElement);await settled(page);
          readable(await inspectStoryFrame(page,frame),`fullscreen/${viewport.width}×${viewport.height}`);
          labels+=small.length;fullscreen++;
          await page.evaluate(()=>document.exitFullscreen());await settled(page);
          if(viewport.width===1280){
            // Below-fold ink is reachable by document scrolling, not clipped away.
            await page.setViewportSize({...viewport,height:400});await settled(page);
            assert.ok(await page.locator('.stage').evaluate(e=>e.getBoundingClientRect().bottom>innerHeight));
            readable(await inspectStoryFrame(page,frame),'short scrollable document');
            await page.evaluate(()=>scrollTo(0,150));await settled(page);
            readable(await inspectStoryFrame(page,frame),'scrolled document');
            await page.setViewportSize(viewport);await page.evaluate(()=>scrollTo(0,0));await settled(page);
            // Native padding/borders and a translated, scaled clip exercise the
            // screen-space conversion before either axis is deliberately clipped.
            await page.locator('.frame').evaluate(e=>{
              e.style.border='1px solid transparent';e.style.padding='1px';
              e.style.transformOrigin='0 0';e.style.transform='translate(3px,2px) scale(1.01)';
            });await settled(page);
            readable(await inspectStoryFrame(page,frame),'transformed padding box');
            try{
              for(const axis of ['y','x'] as const){
                await page.locator('.frame').evaluate((e,axis)=>{
                  e.style.maxHeight=axis==='y'?'100px':'';
                  e.style.width=axis==='x'?'100px':'';
                  e.style.overflowX=axis==='x'?'clip':'visible';
                  e.style.overflowY=axis==='y'?'clip':'visible';
                  (e.querySelector('.stage') as HTMLElement).style.width=axis==='x'?'876px':'';
                },axis);await settled(page);
                const clipped=await inspectStoryFrame(page,frame);
                assert.throws(()=>readable(clipped,`clipped ${axis}`),/complete visible ink/,'a native overflow clip must reject missing label ink');
              }
            }finally{
              await page.locator('.frame').evaluate(e=>{
                for(const name of ['border','padding','transform-origin','transform','max-height','width','overflow-x','overflow-y'])e.style.removeProperty(name);
                (e.querySelector('.stage') as HTMLElement).style.removeProperty('width');
              });await settled(page);
            }
            readable(await inspectStoryFrame(page,frame),'restored clip');
          }
        }
      }finally{await page.close();}
    }
  }
  assert.equal(stages,10);assert.equal(fullscreen,2);assert.equal(labels,1488);
});
