import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fc,params} from './lib/pbt.ts';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Browser,Page} from 'playwright-core';
import {launch} from '../tools/lib/browser.ts';
import {collectProject} from '../tools/lib/explain-project.ts';
import {buildExplainer,buildLoader} from '../tools/lib/explain-build.ts';
import {serve} from '../tools/lib/explain-serve.ts';
const enabled=!!process.env.EXPLAIN_BROWSER;
const options={skip:enabled?false:'set EXPLAIN_BROWSER=1 for real Web Audio and score checks'};
let browser:Browser,folder:string,server:Awaited<ReturnType<typeof serve>>,hostServer:Awaited<ReturnType<typeof serve>>;
before(async()=>{
  if(!enabled)return;
  folder=await mkdtemp(join(tmpdir(),'rayner-audio-'));
  await buildExplainer(await collectProject('scenes/explainers/melody-rhythm',{write:false}),join(folder,'melody-rhythm.html'));
  // This no-audio boundary owns its fixture; gallery membership is unrelated.
  const plain=join(folder,'plain'),bounded=join(folder,'bounded');
  await mkdir(plain);await mkdir(bounded);
  const imports="import{Scene,Text,FadeIn}from'rayner';";
  await writeFile(join(plain,'scene.ts'),`${imports}export default class Plain extends Scene{async construct(){await this.step('one',{title:'One note on paper'});await this.play(new FadeIn(new Text('C')));}}`);
  await writeFile(join(bounded,'scene.ts'),`${imports}
    const note={midi:60,at:0,duration:1};
    const clips=[
      {id:'a',label:'Play middle C',bpm:96,beats:2,notes:[note]},
      {id:'b',label:'A chord of 256 middle Cs',bpm:96,beats:2,notes:Array.from({length:256},()=>({...note}))},
      {id:'c',label:'Two adjacent middle Cs',bpm:96,beats:2,notes:[note,{...note,at:1}]},
    ];
    export default class Bounded extends Scene{async construct(){await this.step('listen',{title:'Listen',audio:{clips}});await this.play(new FadeIn(new Text('C')));}}`);
  await buildExplainer(await collectProject(plain,{write:false}),join(folder,'plain.html'));
  await buildExplainer(await collectProject(bounded,{write:false}),join(folder,'bounded.html'));
  await buildLoader(join(folder,'loader.js'));
  server=await serve(folder,0,'melody-rhythm.html');
  await writeFile(join(folder,'cross-origin-host.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="height:200px">An embedded score</div><div id="reader"></div><script src="loader.js" data-src="${server.url}/melody-rhythm.html" data-target="reader" data-title="Music"></script>`);
  hostServer=await serve(folder,0,'cross-origin-host.html');browser=await launch();
});
after(async()=>{if(!enabled)return;await browser?.close();hostServer?.close();server?.close();if(folder)await rm(folder,{recursive:true,force:true});});
// Observe the real browser graph and clock. Native oscillators still connect to
// the destination and run; the wrapper records scheduling without replacing DSP.
async function observed(page:Page) {
  await page.addInitScript(()=>{
    const w=window as any,Native=AudioContext;
    w.scoreProbe={contexts:0,tones:[],late:false,release:null};
    w.AudioContext=class extends Native {
      constructor(){super();w.scoreProbe.contexts++;w.scoreProbe.context=this;}
      override resume(){
        if(w.scoreProbe.late) return new Promise<void>(resolve=>{w.scoreProbe.release=()=>{super.resume().then(resolve);};});
        return super.resume();
      }
      override createOscillator(){
        const osc=super.createOscillator(),entry:any={stops:[]};w.scoreProbe.tones.push(entry);
        const start=osc.start.bind(osc),stop=osc.stop.bind(osc),frequency=osc.frequency.setValueAtTime.bind(osc.frequency);
        osc.frequency.setValueAtTime=(value,when)=>{entry.frequency=value;return frequency(value,when);};
        osc.start=(when=0)=>{entry.start=when;start(when);};
        osc.stop=(when=0)=>{entry.stops.push(when);stop(when);};
        return osc;
      }
    };
  });
}
async function ready(page:Page,step='listen') {
  await page.waitForSelector('[data-ready=true]');
  await page.waitForFunction(name=>document.querySelector('[aria-current=step]')?.getAttribute('data-step')===name&&!document.querySelector('#content.loading'),step);
}

test('audio is opt-in, offline, gesture-triggered and follows the score at both tempos',options,async()=>{
  const plain=await readFile(join(folder,'plain.html'),'utf8');
  assert.ok(!plain.includes('score-audio')&&!plain.includes('createOscillator'),'a plain page carries no optional sound UI or DSP');
  for(const bpm of [96,120]) for(const timing of ['syncopated','straight']) {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors:string[]=[],external:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==server.url){external.push(route.request().url());return route.abort();}return route.continue();});
    try {
      await observed(page);const response=await page.goto(`${server.url}/melody-rhythm.html?tempo=${bpm}&timing=${timing}`);await ready(page);
      assert.match(response!.headers()['content-security-policy']!,/connect-src 'none'/);
      assert.equal(await page.evaluate(()=>(window as any).scoreProbe.contexts),0,'no context or autoplay before a gesture');
      assert.equal(await page.locator('.score-audio').isVisible(),true);
      const placement=await page.evaluate(()=>{const b=(s:string)=>document.querySelector(s)!.getBoundingClientRect();return {picture:b('.stage').bottom,caption:b('.caption').top,audio:b('.score-audio')};});
      assert.ok(placement.audio.top>=placement.picture&&placement.caption>=placement.audio.bottom,'playback controls stay beside the score, before its caption');
      await page.getByRole('checkbox',{name:'Pulse'}).uncheck();
      await page.getByRole('button',{name:timing==='syncopated'?'Play B: shifted timing':'Play B: even beats',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.score-audio')?.getAttribute('data-playing')==='true');
      const scheduled=await page.evaluate(()=>(window as any).scoreProbe.tones);
      assert.equal(scheduled.length,8);
      const starts=timing==='syncopated'?[0,1,2,3.5,4.5,5,6,7]:[0,1,2,3,4,5,6,7];
      const lengths=timing==='syncopated'?[1,1,1.5,1,.5,1,1,1]:Array(8).fill(1);
      for(let i=0;i<8;i++) {
        assert.ok(Math.abs((scheduled[i].start-scheduled[0].start)/(60/bpm)-starts[i]!)<1e-8);
        assert.ok(Math.abs((scheduled[i].stops[0]-scheduled[i].start)/(60/bpm)-lengths[i]!)<1e-8);
        const hz=440*2**(([60,62,64,67,64,62,60,60][i]!-69)/12);
        assert.ok(Math.abs(scheduled[i].frequency-hz)<.001);
      }
      await page.waitForFunction(()=>Number(document.querySelector('.score-playhead')?.getAttribute('x1'))>-5900);
      const clock=await page.evaluate(()=>{const p=(window as any).scoreProbe;return {now:p.context.currentTime,start:p.tones[0].start,x:Number(document.querySelector('.score-playhead')!.getAttribute('x1'))};});
      const expected=-6000+13200*Math.max(0,clock.now-clock.start)/(8*60/bpm);
      assert.ok(Math.abs(clock.x-expected)<250,'native audio clock and painted cursor agree within one slow browser frame');
      await page.getByRole('button',{name:'Stop',exact:true}).click();
      assert.equal(await page.locator('.score-playhead').count(),0);
      assert.equal(await page.evaluate(()=>(window as any).scoreProbe.tones.every((t:any)=>t.stops.at(-1)===0)),true,'Stop cancels every scheduled note');
      await page.getByRole('checkbox',{name:'Pulse'}).check();
      await page.getByRole('button',{name:'Play A: even beats',exact:true}).click();
      await page.waitForFunction(()=>(window as any).scoreProbe.tones.length===24);
      const pulses=await page.evaluate(()=>(window as any).scoreProbe.tones.slice(16));
      assert.equal(pulses.length,8);assert.notEqual(pulses[0].frequency,pulses[1].frequency,'bar downbeats have a distinct pulse');
      await page.locator('.stepper button[aria-label="Next step"]').click();await ready(page,'pulse');
      assert.equal(await page.locator('.score-playhead').count(),0);assert.equal(await page.locator('.score-audio').getAttribute('data-playing'),'false');
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    } finally {await page.close();}
  }
});

test('flattened pitches really play C',options,async()=>{
  const page=await browser.newPage({reducedMotion:'reduce'});
  try {
    await observed(page);await page.goto(server.url+'/melody-rhythm.html?step=rhythm');await ready(page,'rhythm');
    await page.getByRole('checkbox',{name:'Pulse'}).uncheck();
    await page.getByRole('button',{name:'Play B: shifted timing',exact:true}).click();
    await page.waitForFunction(()=>(window as any).scoreProbe.tones.length===8);
    const frequencies=await page.evaluate(()=>(window as any).scoreProbe.tones.map((t:any)=>t.frequency));
    assert.ok(frequencies.every((hz:number)=>Math.abs(hz-261.625565)<.001),'flat-pitch stage plays C for every event');
  } finally {await page.close();}
});

test('audio, motion on: scheduled resumes and reader actions never sound a departed step or case',options,async()=>{
  await fc.assert(fc.asyncProperty(
    fc.array(fc.record({action:fc.constantFrom('play','stop','next','previous','case','pulse'),release:fc.boolean()}),{minLength:1,maxLength:16}),
    fc.scheduler(),async(actions,scheduler)=>{
      const page=await browser.newPage({reducedMotion:'no-preference'});
      try {
        await observed(page);
        await page.exposeFunction('__resume',()=>scheduler.schedule(Promise.resolve(),'audio resume'));
        await page.addInitScript(()=>{
          const Context=AudioContext,w=window as any;
          w.AudioContext=class extends Context {
            private owner='';
            override resume(){const owner=location.search+'|'+w.__audioEpoch;return w.__resume().then(()=>super.resume()).then(()=>{this.owner=owner;});}
            override createOscillator(){
              const osc=super.createOscillator();
              const owner=this.owner;
              const start=osc.start.bind(osc),stop=osc.stop.bind(osc);
              const entry={owner,live:false};(w.owners??=[]).push(entry);
              osc.start=(at=0)=>{entry.live=true;start(at);};
              osc.stop=(at=0)=>{if(!at)entry.live=false;stop(at);};
              osc.addEventListener('ended',()=>{entry.live=false;});
              return osc;
            }
          };
        });
        await page.goto(server.url+'/melody-rhythm.html');await ready(page);
        await page.getByRole('button',{name:'Play A: even beats',exact:true}).click();
        await scheduler.waitFor(page.waitForFunction(()=>document.querySelector<HTMLElement>('.score-audio')?.dataset.playing==='true'));
        for(const {action,release} of [{action:'case',release:false},{action:'play',release:false},{action:'next',release:true},...actions]) {
          const playing=await page.evaluate(action=>{
            const click=(selector:string|HTMLButtonElement|undefined)=>{
              const b=typeof selector==='string'?document.querySelector<HTMLButtonElement>(selector):selector;
              if(b&&!b.disabled){const w=window as any;w.__audioEpoch=(w.__audioEpoch??0)+1;b.click();}
            };
            if(action==='play') click('.score-audio button');
            if(action==='stop') click(Array.from(document.querySelectorAll<HTMLButtonElement>('.score-audio button')).find(b=>b.textContent==='Stop'));
            if(action==='next') click('.stepper button[aria-label="Next step"]');
            if(action==='previous') click('.stepper button[aria-label="Previous step"]');
            if(action==='case') click('.case input:not(:checked)');
            if(action==='pulse') click('.score-audio input');
            return document.querySelector<HTMLElement>('.score-audio')?.dataset.playing;
          },action);
          if(action==='case') assert.equal(playing,'false','case changes stop sound before loading');
          if(release&&scheduler.count()) await scheduler.waitOne();
          await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
          assert.equal(await page.evaluate(()=>(window as any).owners?.some((o:any)=>o.live&&o.owner!==location.search+'|'+(window as any).__audioEpoch)??false),false,action);
        }
        await scheduler.waitAll();
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        assert.equal(await page.evaluate(()=>(window as any).owners?.some((o:any)=>o.live&&o.owner!==location.search+'|'+(window as any).__audioEpoch)??false),false,'all resumes released');
      } finally {await page.close();}
    }),params(12));
});

test('without Web Audio the full score and step controls remain usable',options,async()=>{
  const page=await browser.newPage({reducedMotion:'reduce'});
  try {
    await page.addInitScript(()=>{(window as any).AudioContext=undefined;});
    await page.goto(server.url+'/melody-rhythm.html');await ready(page);
    assert.match(await page.locator('.score-audio [role=status]').innerText(),/Audio is unavailable/);
    assert.equal(await page.getByRole('button',{name:'Play A: even beats',exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('checkbox',{name:'Pulse'}).isDisabled(),true,'unavailable audio cannot invite another Play action through Pulse');
    const control=await browser.newPage({reducedMotion:'reduce'});
    try {
      await control.goto(server.url+'/melody-rhythm.html');await ready(control);
      assert.equal(await page.locator('.stage svg:not(.leaving)').innerHTML(),await control.locator('.stage svg:not(.leaving)').innerHTML(),'unavailable audio preserves the complete score');
    } finally {await control.close();}
    await page.locator('.stepper button[aria-label="Next step"]').click();await ready(page,'pulse');
  } finally {await page.close();}
});

test('visible Play labels remain voice targets, and overlapping notes share the monophonic level',options,async()=>{
  const page=await browser.newPage({reducedMotion:'reduce'});
  try {
    // The native offline context renders the production oscillator/gain graph.
    // Only resume/close adapt its lifecycle to the reader's realtime interface.
    await page.addInitScript(()=>{
      const w=window as any;
      w.AudioContext=class extends OfflineAudioContext {
        constructor(){super(1,144000,48000);w.renderedScore=this;}
        override resume(){return Promise.resolve();}
        close(){return Promise.resolve();}
      };
    });
    await page.goto(server.url+'/bounded.html');await ready(page,'listen');
    const visible=['Play A','Play B','Play C'];
    for(const text of visible) {
      const button=page.getByRole('button',{name:new RegExp('^'+text+'(?:$|:)')});
      assert.equal(await button.count(),1,'the accessible name retains the visible voice target');
      assert.equal(await button.innerText(),text);
    }
    await page.getByRole('checkbox',{name:'Pulse'}).uncheck();
    const peaks:number[]=[];
    for(const text of visible) {
      await page.getByRole('button',{name:new RegExp('^'+text+'(?:$|:)')}).click();
      await page.waitForFunction(()=>document.querySelector('.score-audio')?.getAttribute('data-playing')==='true');
      peaks.push(await page.evaluate(async()=>{
        const samples=(await (window as any).renderedScore.startRendering()).getChannelData(0);
        let peak=0;for(const sample of samples) peak=Math.max(peak,Math.abs(sample));return peak;
      }));
    }
    assert.equal(peaks.length,3);
    assert.ok(peaks[0]!>.08&&peaks[0]!<.10,'the monophonic score is audible and keeps its existing level');
    assert.ok(Math.abs(peaks[1]!-peaks[0]!)<1e-5,'256 simultaneous notes share the monophonic level without clipping');
    assert.ok(Math.abs(peaks[2]!-peaks[0]!)<1e-5,'notes meeting at an endpoint retain the monophonic level');
  } finally {await page.close();}
});

test('starting audio keeps both score lanes, playback controls and the painted playhead on screen',
  options,async t=>{
  for(const viewport of [{width:320,height:568},{width:390,height:667},{width:1180,height:800}]) {
    for(const activation of ['click','keyboard'] as const) {
      await t.test(`${viewport.width}×${viewport.height}, ${activation}`,async()=>{
        const page=await browser.newPage({viewport,reducedMotion:'reduce'});
        try {
          await page.goto(server.url+'/melody-rhythm.html');
          await page.waitForSelector('[data-ready=true]');
          await page.waitForFunction(()=>!document.querySelector('#content.loading'));
          let previousLaneBottom=0;
          for(const clip of ['A','B']) {
            const play=page.getByRole('button',{name:`Play ${clip}: ${clip==='A'?'even beats':'shifted timing'}`,exact:true});
            if(activation==='click') await play.click();
            else {await play.focus();await page.keyboard.press('Enter');}
            await page.waitForFunction(()=>document.querySelector('.score-audio')?.getAttribute('data-playing')==='true');
            await page.waitForFunction(()=>Number(document.querySelector('.score-playhead')?.getAttribute('x1'))>-5900);
            const layout=await page.evaluate(()=>{
              const bounds=(element:Element)=>{
                const r=element.getBoundingClientRect();
                return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
              };
              const cursor=document.querySelector<SVGLineElement>('.score-playhead')!;
              const style=getComputedStyle(cursor);
              return {
                viewport:{width:innerWidth,height:innerHeight},
                stage:bounds(document.querySelector('.stage')!),
                panel:bounds(document.querySelector('.score-audio')!),
                controls:[...document.querySelectorAll('.score-audio button')].map(bounds),
                cursor:bounds(cursor),paint:{stroke:style.stroke,opacity:style.opacity,strokeWidth:style.strokeWidth},
              };
            });
            for(const [subject,bounds] of [['both score lanes',layout.stage],['sound panel',layout.panel],
              ...layout.controls.map((bounds,i)=>[`playback control ${i+1}`,bounds] as const)] as const) {
              assert.ok(bounds.top>=-1&&bounds.bottom<=layout.viewport.height+1&&bounds.left>=-1&&bounds.right<=layout.viewport.width+1,
                `${subject} must fit on screen during ${clip}: ${JSON.stringify({bounds,viewport:layout.viewport})}`);
            }
            assert.ok(layout.cursor.height>0&&layout.cursor.top>=layout.stage.top&&layout.cursor.bottom<=layout.stage.bottom,'playhead occupies visible score ink');
            assert.notEqual(layout.paint.stroke,'none');assert.notEqual(layout.paint.opacity,'0');assert.ok(parseFloat(layout.paint.strokeWidth)>0);
            const laneTop=layout.cursor.top-layout.stage.top,laneBottom=layout.cursor.bottom-layout.stage.top;
            if(clip==='B') assert.ok(laneTop>previousLaneBottom,'Play B places its cursor below the complete A lane');
            previousLaneBottom=laneBottom;
            await page.getByRole('button',{name:'Stop',exact:true}).click();
            assert.equal(await page.locator('.score-playhead').count(),0);
          }
        } finally {await page.close();}
      });
    }
  }
});


test('Play keeps the complete score and controls in the host viewport of a cross-origin auto-height embed',options,async t=>{
  for(const viewport of [{width:1180,height:800},{width:1280,height:720}]) {
    await t.test(`${viewport.width}×${viewport.height}`,async()=>{
      const page=await browser.newPage({viewport,reducedMotion:'reduce'});
      const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
      try {
        await page.goto(hostServer.url+'/cross-origin-host.html');
        const reader=page.frameLocator('iframe');
        await reader.locator('[data-ready=true]').waitFor();
        await page.waitForFunction(()=>document.querySelector('iframe')!.getBoundingClientRect().height>innerHeight);
        const frame=page.frames().find(frame=>frame.url().startsWith(server.url+'/'));
        assert.ok(frame);assert.notEqual(new URL(frame.url()).origin,new URL(page.url()).origin);
        for(const clip of ['A','B']) {
          await reader.getByRole('button',{name:`Play ${clip}: ${clip==='A'?'even beats':'shifted timing'}`,exact:true}).click();
          await frame.waitForFunction(()=>document.querySelector('.score-audio')?.getAttribute('data-playing')==='true');
          await frame.waitForFunction(()=>Number(document.querySelector('.score-playhead')?.getAttribute('x1'))>-5900);
          // Playwright's element bounds include every ancestor frame offset.
          // Inner-document coordinates would miss a score above the host viewport.
          for(const [subject,selector] of [['both score lanes','.stage'],['sound panel','.score-audio'],['painted playhead','.score-playhead']]) {
            const bounds=await reader.locator(selector!).boundingBox();assert.ok(bounds);
            assert.ok(bounds.y>=-1&&bounds.y+bounds.height<=viewport.height+1&&bounds.x>=-1&&bounds.x+bounds.width<=viewport.width+1,
              `${subject} must fit the host viewport during ${clip}: ${JSON.stringify({bounds,viewport})}`);
          }
          await reader.getByRole('button',{name:'Stop',exact:true}).click();
        }
        assert.deepEqual(errors,[]);
      } finally {await page.close();}
    });
  }
});
