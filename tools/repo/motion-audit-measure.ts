// Native knockout controls on the audit's saved, unmodified SVGs. Example:
// node tools/repo/motion-audit-measure.ts <capture-path> <queries.json>
// Each query names a target and (optionally) another object to remove. Without a
// mask this measures visible target ink. With a mask a pixel counts as restored
// when the exposed target contributes >16 levels and the covered target <=15% of that.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';

interface Run {from:number;to:number;keys:string[];text?:string}
interface Part {key:string;box?:number[]}
interface FrameIndex { runs:Run[]; parts:Part[]; view:number[] }
interface Selector { key:string; text?:string }
interface Query { name:string; target:Selector; mask?:Selector; frames?:number[] }
const dir=process.argv[2]!, queries: Query[]=JSON.parse(await readFile(process.argv[3]!,'utf8'));
const raster=(s:string)=>new Resvg(s,{font:{loadSystemFonts:false}}).render().pixels;
const regex=(s:string)=>new RegExp('^(?:'+s+')$');
function selected(runs:Run[],sel:Selector) {
  const key=regex(sel.key), text=sel.text===undefined?undefined:regex(sel.text);
  const indices=new Set<number>();
  for (const r of runs) if (r.keys.some(k=>key.test(k)) && (!text || r.text!==undefined && text.test(r.text))) {
    for(let i=r.from;i<=r.to;i++) indices.add(i);
  }
  return indices;
}
function bounds(parts:Part[],sel:Selector) {
  const pattern=regex(sel.key), boxes=parts.filter(p=>p.box && pattern.test(p.key)).map(p=>p.box!);
  if (!boxes.length) return undefined;
  return boxes.reduce((u,b)=>[Math.min(u[0]!,b[0]!),Math.min(u[1]!,b[1]!),Math.max(u[2]!,b[2]!),Math.max(u[3]!,b[3]!)]);
}
function measure(index:FrameIndex,svg:string,q:Query) {
  const target=selected(index.runs,q.target), mask=q.mask ? selected(index.runs,q.mask) : undefined;
  if (!target.size || (mask && !mask.size)) return { ink:0,restored:0 };
  const a=bounds(index.parts,q.target),b=q.mask && bounds(index.parts,q.mask);
  // The extra half-unit covers all Poppy strokes. This only skips impossible
  // pairs. The bounds never establish ink, overlap or an affirmative result.
  if (a && b && (a[0]!>b[2]!+0.5 || b[0]!>a[2]!+0.5 || a[1]!>b[3]!+0.5 || b[1]!>a[3]!+0.5)) return {ink:0,restored:0};
  const path=/<path\b[^>]*\/>/g;
  let count=0;
  const remove=(ids:Set<number>)=>{ count=0;const s=svg.replace(path,(p)=>ids.has(count++)?'':p);assert.equal(count,index.runs.at(-1)!.to+1);return s; };
  const pixels=raster(svg), minus=raster(remove(target));
  const exposed=mask?raster(remove(mask)):undefined, bare=mask?raster(remove(new Set([...mask,...target]))):undefined;
  let ink=0,restored=0,totalExposed=0,x0=800,y0=450,x1=-1,y1=-1;
  for(let i=0;i<pixels.length;i+=4){
    const diff=(p:Uint8Array,n:Uint8Array)=>Math.max(Math.abs(p[i]!-n[i]!),Math.abs(p[i+1]!-n[i+1]!),Math.abs(p[i+2]!-n[i+2]!));
    const visible=diff(pixels,minus); if(visible>8) ink++;
    const unmasked=exposed && bare ? diff(exposed,bare):0;
    if(unmasked>16) totalExposed++;
    const hit=mask ? unmasked>16 && visible<=0.15*unmasked : visible>8;
    if(hit){if(mask)restored++;const x=i/4%800,y=Math.floor(i/4/800);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  }
  return {ink,restored,totalExposed,box:x1===-1?undefined:[x0,y0,x1,y1]};
}

for(const side of ['baseline','variant']){
  const p=join(dir,side),receipt=JSON.parse(await readFile(join(p,'receipt.json'),'utf8')) as { frames:{frame:number}[] };
  const index:FrameIndex[]=JSON.parse(gunzipSync(await readFile(join(p,'ownership.json.gz'))).toString());
  assert.equal(index.length,receipt.frames.length);
  const output: Record<string,unknown[]> = Object.fromEntries(queries.map(q=>[q.name,[]]));
  for(const [i,row] of receipt.frames.entries()) {
    const active=queries.filter(q=>!q.frames || q.frames.includes(row.frame));
    if(!active.length)continue;
    const svg=gunzipSync(await readFile(join(p,String(row.frame).padStart(4,'0')+'.svg.gz'))).toString();
    for(const q of active) output[q.name]!.push({frame:row.frame,...measure(index[i]!,svg,q)});
  }
  await writeFile(join(p,'controls.json'), JSON.stringify({queries,output})+'\n');
}
