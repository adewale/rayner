// node tools/repo/motion-audit-capture.ts <id> [alternate-route-json] [output-suffix]
// Capture a real story or reader event. Keep ordinary painted SVGs untouched; the
// separate index maps each SVG paint record to its authored keys for removal controls.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import { loadFonts } from '../../explain/testing.ts';
import { adoptExplainer, liveSteps, LiveSink, runLive, scriptOf } from '../../explain/internal.ts';
import { scenariosOf, withSettings } from '../../explain/settings.ts';
import { machinesOf } from '../../explain/machine.ts';
import { Text, type Mobject, type Scene } from '../../src/index.ts';
import { mobjectId } from '../../src/mobject.ts';
import { stopAt, type Sink } from '../../src/scene.ts';
import { renderElements, toSvgString } from '../../src/svg.ts';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import { loadScene } from '../lib/explain-project.ts';
import { ROOT } from '../lib/roots.ts';
import { buildVariant } from './motion-corpus-lib.ts';
import { routes, type AuditRoute } from './motion-audit-routes.ts';

const width = 800, fps = 30;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const id = process.argv[2]!;
const entry = CORPUS.find(x => x.id === id);
assert.ok(entry, 'unknown corpus ID');
assert.deepEqual(Object.keys(routes).sort(), CORPUS.map(x => x.id).sort());
const route: AuditRoute = process.argv[3] ? JSON.parse(process.argv[3]) : routes[id]!;
const dirname = process.argv[4] ? id+'--'+process.argv[4] : id;
const output = join(ROOT, 'out/motion-all59-audit', dirname);
const variantId = 'audit-'+id+'-'+randomUUID();
const primary = join(ROOT, 'scenes/explainers', entry.chapter, 'scene.ts');
const decimal = (n: number) => Number(n.toFixed(4));
const numbered = (n: number) => String(n).padStart(4,'0');
type Source = Awaited<ReturnType<typeof loadScene>>['Scene'];
interface Mark { origin: number; end: number; duration: number; before: object; after: object; history: string[]; guard?: string }

async function readerSource(file: string) {
  const loaded = await loadScene(file);
  adoptExplainer(loaded.Scene, file, await readFile(scriptOf(file),'utf8'), file);
  const scenarios = scenariosOf(loaded.Scene);
  const settings = route.settings ?? scenarios[0]!;
  const match = scenarios.find(x => JSON.stringify(x) === JSON.stringify(settings));
  assert.ok(match, 'valid chapter settings');
  return { Source: withSettings(loaded.Scene,match), settings: match, bundledSource: loaded.sourceHash };
}

/** Identify the event on the chapter's authored clock before recording any pictures. */
async function findStory(Source: Source): Promise<Mark> {
  let cursor = 0, previousFrame = 0, previousState: object = {}, seen = 0;
  const history: string[] = [];
  let mark: Mark | undefined;
  const scene = new Source({ async frame(s) {
    for (; cursor<s.evidence.length; cursor++) {
      const e = s.evidence[cursor]!;
      if (e.kind !== 'event') continue;
      if (s.currentStep?.path === route.step && e.event === route.event && ++seen === (route.n ?? 1)) {
        const spec = machinesOf(s)[0]!.spec.runTime;
        const duration = typeof spec === 'number' ? spec : spec({ event: String(e.event), before: previousState, after: s.state });
        mark = { origin: previousFrame, end: previousFrame + Math.round(duration*fps), duration,
          before: copy(previousState), after: copy(s.state), history: [...history] };
      }
      history.push(String(e.event));
    }
    previousFrame=s.frameCount; previousState=s.state;
  } });
  stopAt(scene, route.step, () => {});
  try { await scene.run(); }
  catch (e) {
    // Capture the last successfully painted picture for a refused transition.
    // The guard may occur on the tick that attempts to initialize the animation.
    if (!(e instanceof RangeError) || !/^machine\.send\(".*"\): authored transition lasts/.test(e.message)) throw e;
    assert.equal(scene.currentStep?.path, route.step, 'unexpected earlier guard');
    assert.ok(e.message.startsWith('machine.send('+JSON.stringify(route.event)+')'), 'guard of the requested event');
    return { origin: previousFrame, end: previousFrame, duration: 0, before: copy(previousState), after: copy(scene.state),
      history, guard: e.message };
  }
  assert.ok(mark, 'requested event was reached');
  return mark;
}

// Compress runs with identical ownership. Each index refers to a direct SVG
// paint element after the paper and optional clip definitions.
function ownership(scene: Scene) {
  const members = scene.familyMembers(), lookup = new Map(members.map(m => [mobjectId(m),m]));
  const records = renderElements(scene, { width });
  const runs: { from: number; to: number; keys: string[]; text?: string }[] = [];
  let prior = '';
  for (const [i,rec] of records.entries()) {
    const m=lookup.get(rec.id);
    assert.ok(m, 'every paint record belongs to this frame');
    const keys: string[] = [];
    let text: string | undefined;
    for (let p: Mobject | null = m; p; p=p.parent) {
      if (p.key) keys.unshift(p.key);
      if (p instanceof Text && text===undefined) text=p.text;
    }
    const signature=JSON.stringify([keys,text]);
    if (signature === prior) runs.at(-1)!.to=i;
    else { runs.push({from:i,to:i,keys,text}); prior=signature; }
  }
  const parts = members.filter(m=>m.key).map(m => ({ key:m.key!, box:m.box()?.map(decimal), text:m instanceof Text ? m.text : undefined }));
  return { view: scene.frame.box(), runs, parts };
}

interface FrameRecord { frame: number; absolute: number; svg: string; pixels: string }
function painter(dir: string) {
  const frames: FrameRecord[] = [];
  const index: ReturnType<typeof ownership>[] = [];
  return { frames, async frame(scene: Scene, frame: number, force = false) {
    if (frames.length && frames.at(-1)!.frame===frame && !force) return;
    assert.equal(scene.fps,fps);
    const svg = toSvgString(scene, { width });
    const image = new Resvg(svg,{font:{loadSystemFonts:false}}).render();
    assert.equal(image.width,width); assert.equal(image.height,450);
    const record = {frame, absolute: scene.frameCount, svg: sha(svg), pixels: sha(image.pixels)};
    const label = join(dir, numbered(frame));
    await Promise.all([writeFile(label+'.svg.gz',gzipSync(svg,{level:1})),writeFile(label+'.png',image.asPng())]);
    if (force && frames.at(-1)?.frame === frame) { frames.pop(); index.pop(); }
    index.push(ownership(scene)); frames.push(record);
  }, async save() { await writeFile(join(dir,'ownership.json.gz'),gzipSync(JSON.stringify(index),{level:3})); } };
}

async function capture(file: string,side: string) {
  const dir=join(output,side);
  await mkdir(dir,{recursive:true});
  const {Source,settings,bundledSource}=await readerSource(file), paint=painter(dir);
  let mark: Mark;
  if (route.event==='view.sync') {
    // The two edited calls are in owner and close. Compare EVERY emitted frame
    // including caption holds. Only encode a duplicate raster once.
    const all: { step:string; absolute:number; svg:string; pixels:string }[]=[];
    let lastSvg='',lastPixels='',lastStep='',start=0;
    await new Source({async frame(s) {
      const step=s.currentStep?.path;
      if (step!=='owner' && step!=='close') return;
      const svg=toSvgString(s,{width}),hash=sha(svg);
      if (hash!==lastSvg) { lastPixels=sha(new Resvg(svg,{font:{loadSystemFonts:false}}).render().pixels);lastSvg=hash; }
      all.push({step,absolute:s.frameCount,svg:hash,pixels:lastPixels});
      if (lastStep!==step) { start=s.frameCount;lastStep=step; }
      const local=s.frameCount-start,base=step==='owner'?0:1000;
      if (local<=36) await paint.frame(s,base+local);
    } }).run();
    assert.equal(all.filter(f=>f.step==='owner').length,799);
    assert.equal(all.filter(f=>f.step==='close').length,765);
    await writeFile(join(dir,'all-frames.json.gz'),gzipSync(JSON.stringify(all)));
    mark={origin:all[0]!.absolute,end:all.at(-1)!.absolute,duration:0,before:{steps:['owner','close']},after:{},history:[]};
  } else if (route.log) {
    const ran=await new Source(new LiveSink()).run();
    const live=liveSteps(ran).get(route.step);
    assert.ok(live,'the reader exposes the requested machine at this step');
    let origin: number | undefined, before: object | undefined;
    const log=route.log;
    try {
      const result=await runLive(Source,route.step,live,log,{from:'start',animate:{async frame(s) {
        if (origin===undefined) { origin=s.frameCount;before=copy(s.state); }
        await paint.frame(s,s.frameCount-origin);
      }}});
      assert.ok(origin!==undefined && before);
      const end=paint.frames.at(-1)!.absolute;
      mark={origin,end,duration:(end-origin)/fps,before,after:copy(result.scene.state),history:log.slice(0,-1)};
    } catch (error) {
      if (!(error instanceof RangeError) ||
        !error.message.startsWith('machine.send('+JSON.stringify(route.event)+'): authored transition lasts')) throw error;
      assert.ok(origin!==undefined && before, 'guard on the final reader event');
      assert.equal(paint.frames.length,1,'only the pre-event picture was drawn');
      mark={origin,end:origin,duration:0,before,after:before,history:log.slice(0,-1),guard:error.message};
    }
  } else {
    mark=await findStory(Source);
    const sink: Sink={async frame(s) {
      if (s.frameCount>=mark.origin && s.frameCount<=mark.end) await paint.frame(s,s.frameCount-mark.origin);
    }};
    const scene = new Source(sink);
    stopAt(scene,route.step,()=>{});
    try { await scene.run(); } catch(e) {
      if (!mark.guard || !(e instanceof RangeError) || e.message!==mark.guard) throw e;
    }
    assert.ok(paint.frames.length, 'the actual prior or active frame was painted');
    const numbers=paint.frames.map(f=>f.frame);
    assert.deepEqual(numbers,Array.from({length:mark.end-mark.origin+1},(_,i)=>i),'continuous native frame coverage');
  }
  await paint.save();
  const result={id,side,route,settings,bundledSource,width,height:450,fps,mark,frames:paint.frames};
  await writeFile(join(dir,'receipt.json'),json(result));
  return result;
}

await loadFonts();
try {
  await mkdir(output,{recursive:true});
  const file=await buildVariant({...entry,id:variantId});
  const fixed=await capture(primary,'baseline'),changed=await capture(file,'variant');
  assert.deepEqual(fixed.settings,changed.settings);
  if (!changed.mark.guard) assert.deepEqual(fixed.mark.before,changed.mark.before,'matched initial model');
  if (route.event==='view.sync') {
    const names=['baseline','variant'].map(s=>join(output,s,'all-frames.json.gz'));
    assert.deepEqual(await readFile(names[0]!),await readFile(names[1]!), 'every native frame and SVG in both edited steps agrees');
  }
  const comparisons=changed.frames.map((f,i)=>({frame:f.frame,identical:fixed.frames[i]?.pixels===f.pixels}));
  await writeFile(join(output,'comparison.json'),json({id,route,baselineFrames:fixed.frames.length,variantFrames:changed.frames.length,
    identicalAtMatchedOffsets:comparisons.filter(f=>f.identical).length,guard:changed.mark.guard??null,complete:true}));
  console.log(id,fixed.frames.length,changed.frames.length,changed.mark.guard??'painted');
} finally {
  await rm(join(ROOT,'out','motion-corpus-'+variantId),{recursive:true,force:true});
}
