// node tools/repo/motion-occlusion-proof.ts [--chromium] [--out <directory>]
// Replay the current poll mutation and its unedited chapter. Determine what the
// named glyphs actually paint by removing each one from the composited SVG.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { renderAsync } from '@resvg/resvg-js';
import { loadFonts } from '../../explain/testing.ts';
import { Scene, Text, toSvgString, type Mobject } from '../../src/index.ts';
import { KeyedMotionSink } from '../../src/internal.ts';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import { collectProject } from '../lib/explain-project.ts';
import { ROOT } from '../lib/roots.ts';
import { buildVariant, type Variant } from './motion-corpus-lib.ts';

// Restoring the promised domain changes the current victim. Keep the corpus's
// frozen company-name target unchanged and uncredited; this is a separate native owner.
const name = 'example.com', glyphCount = [...name].filter(c => c !== ' ').length;
const offsets = [25 / 30, 26 / 30, 27 / 30]; // 0.833, 0.867 and 0.900 s into collect.
const width = 800;
const raster = (svg: string) => renderAsync(svg, { font: { loadSystemFonts: false } });
// The first SVG is the composite. Each following SVG has exactly one glyph removed.
interface BrowserFrames { drawn: string[]; withoutPoll: string[] }
interface ReplayInput {objects:Mobject[];camera:Mobject;colors:Scene['colors']}
const { values } = parseArgs({ options: { out: { type: 'string' }, chromium: { type: 'boolean' } } });

/** Pixels for which removing one glyph changes at least one colour channel by more than eight levels. */
function contribution(drawn: Uint8Array, removed: Uint8Array): number {
  assert.equal(removed.length, drawn.length);
  let n = 0;
  for (let i = 0; i < drawn.length; i += 4) {
    if (Math.max(Math.abs(drawn[i]! - removed[i]!), Math.abs(drawn[i + 1]! - removed[i + 1]!),
      Math.abs(drawn[i + 2]! - removed[i + 2]!)) > 8) n++;
  }
  return n;
}

/** Capture every temporary knockout before starting a native task. */
function snapshots(scene: Scene, word: Text): string[] {
  const rows=[toSvgString(scene,{width})];
  for(const glyph of word.children){const opacity=glyph.style.opacity;
    try{glyph.setOpacity(0);rows.push(toSvgString(scene,{width}));}finally{glyph.setOpacity(opacity);}}
  return rows;
}
function snapshot(scene: Scene): BrowserFrames {
  const cards=scene.familyMembers().filter(m=>m.key==='card'),polls=scene.familyMembers().filter(m=>m.key==='poll');
  assert.equal(cards.length,1);assert.equal(polls.length,1);
  const words=cards[0]!.family().filter((m):m is Text=>m instanceof Text&&m.text===name);
  assert.equal(words.length,1);assert.equal(words[0]!.children.length,glyphCount);
  const drawn=snapshots(scene,words[0]!),poll=polls[0]!,family=poll.family(),opacity=family.map(m=>m.style.opacity);
  try{family.forEach(m=>m.setStyle({opacity:0},false));return {drawn,withoutPoll:snapshots(scene,words[0]!)};}
  finally{family.forEach((m,i)=>m.setStyle({opacity:opacity[i]!},false));}
}
async function counts(svgs:string[]){
  const first=await raster(svgs[0]!),composite=first.pixels,values=[];
  for(const svg of svgs.slice(1)){const image=await raster(svg),pixels=image.pixels;values.push(contribution(composite,pixels));}
  return {values,image:first};
}
async function measure(input: BrowserFrames,browser?:BrowserFrames){
  browser?.drawn.push(...input.drawn);browser?.withoutPoll.push(...input.withoutPoll);
  const [actual,free]=await Promise.all([counts(input.drawn),counts(input.withoutPoll)]);
  return {drawn:actual.values,withoutPoll:free.values,image:actual.image};
}
/** Deliberately identified severe replay, separate from the now-partial current
 * mutation. The original opaque poll is centred/enlarged over the domain, then
 * moved wholly clear as its inverse. No production scene or frozen target changes. */
function severeSnapshots(scene:Scene){
  const poll=scene.find('poll')!,word=scene.find('card')!.family().find((m):m is Text=>m instanceof Text&&m.text===name)!;
  const saved=poll.copy();
  try{
    poll.setWidth(word.width()*2+1).setOpacity(1).moveTo(word.center());const covered=snapshot(scene);
    poll.shift([0,-(poll.height()/2+word.height()/2+0.3)]);const clear=snapshot(scene);
    return {covered,clear};
  }finally{poll.become(saved);}
}

interface Observation { seconds: number; sinceCollect: number; drawn: number[]; withoutPoll: number[] }

function verifyPixels(drawn: number[], withoutPoll: number[], mode: 'clear'|'severe'|'partial') {
  assert.equal(drawn.length, glyphCount);
  assert.equal(withoutPoll.length, glyphCount);
  assert.ok(withoutPoll.every(n => n > 0), 'removing the poll exposes ink from every glyph');
  if (mode==='clear') assert.deepEqual(drawn, withoutPoll, 'the clear route leaves every glyph unchanged');
  else if(mode==='partial'){
    assert.ok(drawn.every(n=>n>0),'the current partial contact leaves every glyph visible');
    assert.ok(drawn.some((n,i)=>n<withoutPoll[i]!),'the current poll removes actual domain glyph contribution');
    assert.ok(drawn.filter((n,i)=>n<=0.1*withoutPoll[i]!).length<2,'partial current contact is not the retained severe positive');
  } else {
    assert.ok(drawn.includes(0), 'the poll completely hides a glyph');
    assert.ok(drawn.filter((n, i) => n <= 0.1 * withoutPoll[i]!).length >= 2, 'the poll removes at least 90% of two glyphs');
  }
}

async function capture(variant: Variant, fixed: boolean) {
  const id = `proof-poll-${randomUUID()}`;
  const observations: Observation[] = [], severe: Observation[] = [], severeClear: Observation[] = [];
  const severeBrowser: BrowserFrames={drawn:[],withoutPoll:[]},severeClearBrowser: BrowserFrames={drawn:[],withoutPoll:[]};
  let png: Buffer | undefined;
  let severePng:Buffer|undefined,severeClearPng:Buffer|undefined,replayInput:ReplayInput|undefined;
  const browser: BrowserFrames | undefined = values.chromium ? { drawn: [], withoutPoll: [] } : undefined;
  try {
    const project = await collectProject(await buildVariant({ ...variant, id }), { write: false });
    const scenarios = project.scenarios.filter(s => s.values.flow === 'device');
    assert.equal(scenarios.length, 1, 'exactly one device flow');
    const device = scenarios[0]!;
    let cursor = 0, previous = 0, origin: number | undefined, events = 0;
    await new device.Scene({ async frame(scene) {
      const ask = scene.currentStep?.path === 'ask';
      for (; cursor < scene.evidence.length; cursor++) {
        const event = scene.evidence[cursor]!;
        if (ask && event.kind === 'event' && event.event === 'collect') { events++; origin = previous; }
      }
      previous = scene.time;
      if (!ask || origin === undefined) return;
      const sinceCollect = scene.time - origin;
      const offset = offsets.find(t => Math.abs(sinceCollect - t) < 1e-6);
      if (offset === undefined) return;
      const ordinary=snapshot(scene), replay=!fixed?severeSnapshots(scene):undefined;
      if(!fixed&&offset===offsets[1])replayInput={objects:scene.mobjects.map(m=>m.copy()),camera:scene.frame.copy(),colors:scene.colors};
      const { drawn, withoutPoll, image } = await measure(ordinary, offset === offsets[1] ? browser : undefined);
      verifyPixels(drawn, withoutPoll, fixed||offset===offsets[2]?'clear':'partial');
      if(replay){
        const bad=await measure(replay.covered,offset===offsets[1]?severeBrowser:undefined);verifyPixels(bad.drawn,bad.withoutPoll,'severe');
        const good=await measure(replay.clear,offset===offsets[1]?severeClearBrowser:undefined);verifyPixels(good.drawn,good.withoutPoll,'clear');
        if(offset===offsets[1]){severePng=bad.image.asPng();severeClearPng=good.image.asPng();}
        severe.push({seconds:scene.time,sinceCollect:offset,drawn:bad.drawn,withoutPoll:bad.withoutPoll});
        severeClear.push({seconds:scene.time,sinceCollect:offset,drawn:good.drawn,withoutPoll:good.withoutPoll});
      }
      if (offset === offsets[1]) png = image.asPng();
      observations.push({ seconds: scene.time, sinceCollect: offset, drawn, withoutPoll });
    } }).run();
    assert.equal(events, 1, 'exactly one collect during the ask step');
    assert.deepEqual(observations.map(f => f.sinceCollect), offsets);
    assert.ok(png, 'the matched middle frame was rasterized');
    return { observations, png, browser, severe, severeClear, severeBrowser, severeClearBrowser,severePng,severeClearPng,replayInput };
  } finally {
    await rm(join(ROOT, 'out', `motion-corpus-${id}`), { recursive: true, force: true });
  }
}

/** A separately named animation from the copied native stage, with ordinary
 * awaited sampler calls. It retains the severe generic positive independently
 * of the current partial mutation and its exact historical credit. */
async function genericSevereReplay(input:ReplayInput){
  const run=async(hit:boolean)=>{
    const sink=new KeyedMotionSink(()=>hit?'deliberate severe domain replay':'deliberate severe clear inverse');
    class Replay extends Scene{override async construct(){
      this.colors=input.colors;this.frame.become(input.camera);this.add(...input.objects.map(m=>m.copy()));
      const actor=this.find('poll')!,word=this.find('card')!.family().find((m):m is Text=>m instanceof Text&&m.text===name)!;
      actor.setWidth(word.width()*2+1).setOpacity(1);
      const at=word.center(),clear:[number,number]=[at[0],at[1]-actor.height()/2-word.height()/2-0.3];actor.moveTo(clear);
      await this.wait(0.1);
      if(hit){await this.play(actor.animate.moveTo(at),{runTime:0.3});await this.wait(0.2);await this.play(actor.animate.moveTo(clear),{runTime:0.3});}
      else await this.wait(0.8);
      await this.wait(0.1);
    }}
    await new Replay(sink).run();return sink.finish().filter(f=>f.kind==='occluded words'&&f.path==='card'&&f.text===name&&f.masks?.includes('poll'));
  };
  const positive=await run(true),inverse=await run(false);
  assert.ok(positive.length>0,'the separately identified severe replay diagnoses this domain under poll');assert.equal(inverse.length,0,'moving the same severe carrier clear cannot diagnose the domain');
  return {positive,inverse};
}

/** Paint the same letter-removal controls in Chromium's native SVG image and canvas. */
async function chromiumProof(fixed: BrowserFrames, mutation: BrowserFrames, severe: BrowserFrames, severeClear: BrowserFrames) {
  const { launch } = await import('../lib/browser.ts');
  const browser = await launch('The poll occlusion evidence');
  try {
    const page = await browser.newPage();
    const measure = (svgs: string[]) => page.evaluate(async images => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      let composite: Uint8ClampedArray | undefined;
      const counts: number[] = [];
      for (const svg of images) {
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        try {
          const image = new Image();
          image.src = url; await image.decode();
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          if (!composite) { composite = pixels; continue; }
          let n = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (Math.max(Math.abs(pixels[i]! - composite[i]!), Math.abs(pixels[i + 1]! - composite[i + 1]!),
              Math.abs(pixels[i + 2]! - composite[i + 2]!)) > 8) n++;
          }
          counts.push(n);
        } finally { URL.revokeObjectURL(url); }
      }
      return counts;
    }, svgs);
    const inspect = async (frames: BrowserFrames, mode: 'clear'|'partial'|'severe') => {
      const drawn = await measure(frames.drawn), withoutPoll = await measure(frames.withoutPoll);
      verifyPixels(drawn, withoutPoll, mode);
      return { drawn, withoutPoll };
    };
    return { version: browser.version(), sinceCollect: offsets[1], fixed: await inspect(fixed, 'clear'), mutation: await inspect(mutation, 'partial'), severe: await inspect(severe, 'severe'), severeClear: await inspect(severeClear, 'clear') };
  } finally { await browser.close(); }
}

const dir = values.out ?? join(ROOT, 'out', 'motion-occlusion-proof');
const entry = CORPUS.find(e => e.id === 'sign-in-poll-over-card');
assert.ok(entry);
await loadFonts();
const fixed = await capture({ ...entry, edits: [] }, true);
const mutation = await capture(entry, false);
assert.ok(mutation.replayInput&&mutation.severePng&&mutation.severeClearPng);
const genericReplay=await genericSevereReplay(mutation.replayInput);
const chromium = fixed.browser && mutation.browser ? await chromiumProof(fixed.browser, mutation.browser,mutation.severeBrowser,mutation.severeClearBrowser) : undefined;
await mkdir(dir, { recursive: true });
await Promise.all([
  writeFile(join(dir, 'fixed.png'), fixed.png),
  writeFile(join(dir, 'mutation.png'), mutation.png),
  writeFile(join(dir,'deliberate-severe.png'),mutation.severePng),writeFile(join(dir,'deliberate-severe-clear.png'),mutation.severeClearPng),
  writeFile(join(dir, 'report.json'), JSON.stringify({
    entry: entry.id, scenario: { flow: 'device' }, step: 'ask', event: 'collect', part: 'card', label: name, foreground: 'poll',
    historicalTarget: 'Example Company', historicalTargetCredit: false,
    currentObservation:'current-partial-domain-contact@2026-11-23.1',
    severeReplay:{id:'deliberate-opaque-centred-poll@2026-11-23.1',policy:'Actual current poll deliberately enlarged/centred and made opaque; separate from the current mutation, retains complete glyph and two 90% losses at all three offsets.',observations:mutation.severe,clearInverse:mutation.severeClear,genericReplay},
    width, imageSinceCollect: offsets[1], fixed: fixed.observations, mutation: mutation.observations, chromium,
  }, null, 2) + '\n'),
]);
console.log(`Verified ${offsets.length} Resvg frames on each route${chromium ? ` and the middle frame in Chromium ${chromium.version}` : ''}. Evidence in ${dir}`);
