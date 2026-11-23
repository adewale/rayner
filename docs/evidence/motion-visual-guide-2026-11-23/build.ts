// Presentation derivatives only. Originals and their source-qualified ledgers are never rewritten.
// Usage and required retained capture roots are documented in README.md.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function option(name: string) {
  const i = args.indexOf('--' + name);
  assert.ok(i >= 0 && args[i + 1] && !args[i + 1]!.startsWith('--'), 'Missing --' + name);
  return resolve(args[i + 1]!);
}
const roots = {historical: option('historical'), reviewed: option('reviewed'),
  returnBefore: option('return-before'), returnAfter: option('return-after')};
const media = join(here, 'media');
await mkdir(media, {recursive: true});
const temporary = await mkdtemp(join(tmpdir(), 'rayner-visual-guide-'));
const sha = (x: Uint8Array | string) => createHash('sha256').update(x).digest('hex');
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const HISTORICAL = '5bff60e0aa5660c2b944fb59fbfe0b59e703db93';
const REVIEWED = '39b75450eeb4ef9082ec22a93be099770365d715';
const RETURN_BEFORE = '8151582fc8a4ff2d06d6b4e5607633e0474c0dbf';
const manifest: any = {
  schema: 1, presentationReferenceHead: '20fe61ee4afd9fa7be55e9b34501e67674c32bf1',
  reviewedRenderingRevision: REVIEWED,
  policy: 'Unmodified native PNG copies plus explicitly derived crops, side-by-side previews and clips. Source39 rendering is unchanged in reference20fe. Historical repair comparisons are distinct from same-source injected diagnostic controls. No new detector score or independent ratification is conferred.',
  timing: 'Each MP4 contains every selected native callback once at its recorded 30 fps. Callback boundary bookkeeping is included. No interpolation, speed adjustment, added pause or trimmed middle frames. GIF previews quantize colours and centisecond timing; originals and MP4/frame ledgers take priority.',
  originals: [], posters: [], crops: [], clips: [], outputs: [],
};
const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '2', ...args], {maxBuffer: 4 << 20});
async function capture(root: string, id: string, side: string, revision: string) {
  const path = join(root, id, side), caseBytes = await readFile(join(root, id, 'case.json'));
  const caseRow = JSON.parse(caseBytes.toString()), bytes = await readFile(join(path, 'receipt.json'));
  const receipt = JSON.parse(bytes.toString());
  assert.equal(caseRow.revision, revision); assert.equal(receipt.status, 'complete'); assert.equal(receipt.fps, 30);
  assert.equal(receipt.frameCount, receipt.frames.length);
  return {root, id, side, revision, path, receipt, receiptSha256: sha(bytes), caseReceiptSha256: sha(caseBytes)};
}
function frameInfo(c: any, f: any) {
  return {sourceRevision: c.revision, caseId: c.id, side: c.side,
    sourcePath: [c.id, c.side, f.asset + '.png'].join('/'), sequence: f.sequence,
    frame: f.frame, absolute: f.absolute, step: f.step, phase: f.phase,
    nativePixelsSha256: f.pixels, receiptSha256: c.receiptSha256, caseReceiptSha256: c.caseReceiptSha256};
}
async function original(c: any, f: any, name: string) {
  const bytes = await readFile(join(c.path, f.asset + '.png'));
  await writeFile(join(media, name), bytes);
  manifest.originals.push({file: 'media/' + name, pngSha256: sha(bytes), ...frameInfo(c, f)});
  return name;
}
const headers = (left: string, right: string) =>
  `[0:v]pad=iw:ih+52:0:52:color=0xf4f6fa,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${left}':x=18:y=16:fontsize=24:fontcolor=0x17233a[a];` +
  `[1:v]pad=iw:ih+52:0:52:color=0xf4f6fa,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${right}':x=18:y=16:fontsize=24:fontcolor=0x17233a[b];[a][b]hstack=inputs=2`;
async function poster(id: string, left: string, right: string, labels: [string, string], kind = 'product-repair') {
  const file = id + '-pair.png';
  ffmpeg(['-i', join(media, left), '-i', join(media, right), '-filter_complex_threads', '1',
    '-filter_complex', headers(...labels) + '[v]', '-map', '[v]', '-frames:v', '1', '-pix_fmt', 'rgba', join(media, file)]);
  manifest.posters.push({file: 'media/' + file, kind, inputs: ['media/' + left, 'media/' + right],
    policy: 'Native 800x450 pixels placed unchanged below a 52px label band.', imageRegions: [[0,52,800,450],[800,52,800,450]], labels});
}
async function clip(id: string, a: any, b: any, before: any[], after: any[], labels: [string, string], excerpt: string) {
  assert.equal(before.length, after.length); assert.ok(before.length > 1);
  assert.deepEqual(before.map(f => f.frame), after.map(f => f.frame), 'Matched native offsets');
  const inputs = [];
  for (const [side, c, frames] of [['left',a,before],['right',b,after]] as const) {
    const dir = join(temporary, id, side); await mkdir(dir, {recursive: true});
    const rows = [];
    for (const [index,f] of frames.entries()) {
      const bytes = await readFile(join(c.path, f.asset + '.png'));
      await writeFile(join(dir, String(index).padStart(4,'0') + '.png'), bytes);
      rows.push({...frameInfo(c,f), pngSha256: sha(bytes)});
    }
    inputs.push({pattern: join(dir,'%04d.png'), frames: rows, sourceRevision: c.revision,
      route: c.receipt.route, sourceModel: c.receipt.mark.before, eventMark: c.receipt.mark});
  }
  const inputArgs = inputs.flatMap(i => ['-framerate','30','-i',i.pattern]);
  ffmpeg([...inputArgs, '-filter_complex_threads','1','-filter_complex',headers(...labels)+'[v]', '-map','[v]',
    '-an','-c:v','libx264','-preset','slow','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart','-r','30',join(media,id+'.mp4')]);
  ffmpeg([...inputArgs, '-filter_complex_threads','1','-filter_complex',headers(...labels)+
    ',scale=960:-2:flags=lanczos,split[pixels][colours];[colours]palettegen=stats_mode=full[palette];[pixels][palette]paletteuse=dither=sierra2_4a[v]',
    '-map','[v]','-loop','0',join(media,id+'.gif')]);
  manifest.clips.push({id, mp4:'media/'+id+'.mp4', gif:'media/'+id+'.gif', fps:30,
    frameCount:before.length, playbackSeconds:before.length/30, excerpt, labels,
    inputs:inputs.map(({pattern,...i}) => i), codec:'H.264 CRF16 yuv420p; display derivative, not pixel evidence'});
}
async function detail(input: string, name: string, region: number[]) {
  const [x,y,w,h] = region;
  ffmpeg(['-i',join(media,input),'-vf',`crop=${w}:${h}:${x}:${y},scale=iw*2:ih*2:flags=neighbor`,
    '-frames:v','1','-pix_fmt','rgba',join(media,name)]);
  manifest.crops.push({file:'media/'+name,input:'media/'+input,region,scale:2,
    policy:'Exact native crop, 2x nearest-neighbour enlargement; no repainting or annotation inside the image.'});
}

try {
  const grantBefore = await capture(roots.historical,'sign-in-collect-people-slide','baseline',HISTORICAL);
  const grantAfter = await capture(roots.reviewed,'sign-in-collect-people-slide','baseline',REVIEWED);
  assert.deepEqual(grantBefore.receipt.mark.before, grantAfter.receipt.mark.before);
  await original(grantBefore,grantBefore.receipt.frames[60],'grant-before.png');
  await original(grantAfter,grantAfter.receipt.frames[60],'grant-reviewed.png');
  await poster('grant','grant-before.png','grant-reviewed.png',['Before 5bff60e0 - callback 60','Reviewed 39b75450 - callback 60']);
  await clip('grant',grantBefore,grantAfter,grantBefore.receipt.frames,grantAfter.receipt.frames,
    ['Before 5bff60e0 - direct collect','Reviewed 39b75450 - direct collect'],
    'Complete matched direct collect event after the same ask/approve-read/trick history. Includes recorded event-boundary callbacks; no sparse-frame animation.');

  const wordBefore = await capture(roots.historical,'conversations-words-dissolve','baseline',HISTORICAL);
  const wordAfter = await capture(roots.reviewed,'conversations-words-dissolve','baseline',REVIEWED);
  const firstOwner = (c:any) => c.receipt.frames.filter((f:any) => f.step==='owner').slice(0,41);
  const wb = firstOwner(wordBefore), wa = firstOwner(wordAfter);
  assert.equal(wb.length,41); assert.equal(wa.length,41); assert.equal(wb[9].frame,9); assert.equal(wa[9].frame,9);
  await original(wordBefore,wb[9],'words-before.png'); await original(wordAfter,wa[9],'words-reviewed.png');
  await poster('words','words-before.png','words-reviewed.png',['Before 5bff60e0 - owner frame 9','Reviewed 39b75450 - owner frame 9']);
  await clip('words',wordBefore,wordAfter,wb,wa,['Before 5bff60e0 - word shrink','Reviewed 39b75450 - word fade'],
    'First 41 emitted callbacks of the owner step, aligned by native step offset; includes the original first caption hold after the transition. Later holds and the close step are outside this excerpt; no whole-route timing claim.');

  const returnRoots = [roots.returnBefore,roots.returnAfter];
  for (const [i,root] of returnRoots.entries()) {
    const receiptPath=join(root,'return-reader-scan.json'), bytes=await readFile(receiptPath), receipt=JSON.parse(bytes.toString());
    const revision=i===0?RETURN_BEFORE:REVIEWED; assert.equal(receipt.sourceRevision,revision);
    const h=receipt.histories.find((h:any)=>h.flow==='device'&&!h.replacement&&!h.pending&&h.event==='disconnect');
    assert.deepEqual(h.log,['ask','approve-read','collect','disconnect']);
    const photo=h.photos.find((p:any)=>p.seq===30), name=i===0?'return-before.png':'return-reviewed.png';
    const png=await readFile(join(root,'device-first-disconnect-30.png'));assert.equal(sha(png),photo.pngSha256);
    await writeFile(join(media,name),png);
    manifest.originals.push({file:'media/'+name,sourceRevision:revision,sourcePath:'reader-return/device-first-disconnect-30.png',
      pngSha256:sha(png),nativePixelsSha256:photo.nativePixelsSha256,receiptSha256:sha(bytes),
      reader:{flow:'device',replacement:false,pending:false,event:'disconnect',log:h.log,sourceState:h.sourceState},sequence:30});
  }
  await poster('return','return-before.png','return-reviewed.png',['Before 8151582f - callback 30','Reviewed 39b75450 - callback 30']);
  await detail('return-before.png','return-before-detail.png',[110,300,320,150]);
  await detail('return-reviewed.png','return-reviewed-detail.png',[110,300,320,150]);

  const controls = [
    ['poppy','poppy-key-over-station-name',37,[130,185,210,65]],
    ['api','refusals-key-over-lane-name',38,[112,43,125,64]],
    ['domain','sign-in-poll-over-card',26,[112,271,260,65]],
    ['sid','browser-forge-across-stage',36,[182,181,245,67]],
  ] as const;
  for (const [name,id,sequence,region] of controls) {
    const clear=await capture(roots.reviewed,id,'baseline',REVIEWED), injected=await capture(roots.reviewed,id,'variant',REVIEWED);
    assert.deepEqual(clear.receipt.mark.before,injected.receipt.mark.before);
    for (const [side,c] of [['clear',clear],['injected',injected]] as const) {
      const f=c.receipt.frames[sequence];assert.equal(f.sequence,sequence);
      await original(c,f,name+'-'+side+'.png');
      await detail(name+'-'+side+'.png',name+'-'+side+'-detail.png',[...region]);
    }
    if(name==='domain') {
      await poster('domain-control','domain-injected.png','domain-clear.png',
        ['Injected crossing 39b75450','Unmodified baseline 39b75450'],'diagnostic-control');
      await clip('domain-control',injected,clear,injected.receipt.frames,clear.receipt.frames,
        ['Injected crossing 39b75450','Unmodified baseline 39b75450'],
        'Complete 85-callback device pending poll event. Same-source injected control, not a historical before/after repair.');
    }
  }
  for(const file of (await readdir(media)).sort()){
    const bytes=await readFile(join(media,file));manifest.outputs.push({file:'media/'+file,bytes:bytes.length,sha256:sha(bytes)});
  }
  await writeFile(join(here,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  execFileSync('python3',[join(here,'bundle.py')],{stdio:'inherit'});
  console.log(JSON.stringify({originals:manifest.originals.length,posters:manifest.posters.length,crops:manifest.crops.length,
    clips:manifest.clips.map((c:any)=>({id:c.id,frames:c.frameCount,seconds:c.playbackSeconds})),
    mediaBytes:manifest.outputs.reduce((n:number,f:any)=>n+f.bytes,0)},null,2));
} finally { await rm(temporary,{recursive:true,force:true}); }
