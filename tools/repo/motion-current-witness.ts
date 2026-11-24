// Recompose retained native PNGs into a paired contact; never changes the scene or its clocks.
// node tools/repo/motion-current-witness.ts <case-dir> <label> '<[{step,frame},...]>' '[x,y,w,h]'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { renderAsync } from '@resvg/resvg-js';
const dir=resolve(process.argv[2]!);const label=process.argv[3]!;
assert.match(label,/^[a-z0-9-]+$/);
const samples=JSON.parse(process.argv[4]!) as {step:string|null;frame:number}[];
const [cx,cy,cw,ch]=(process.argv[5]?JSON.parse(process.argv[5]):[0,0,800,450]) as [number,number,number,number];
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const receipts=await Promise.all(['baseline','variant'].map(async side=>{const text=await readFile(join(dir,side,'receipt.json'),'utf8');return {side,sha256:sha(text),receipt:JSON.parse(text) as {frames:{sequence:number;step:string|null;frame:number;absolute:number;asset:string}[]}};}));
const rows:unknown[]=[];const tileH=Math.round(ch/cw*400),rowH=tileH+24;let body='';
for(const [i,sample] of samples.entries())for(const [col,side] of receipts.entries()){
  // If final-settle emits a second snapshot at the same tick, show the final snapshot.
  const found=side.receipt.frames.findLast(f=>f.step===sample.step&&f.frame===sample.frame);const x=col*400,y=i*rowH;
  body+=`<rect x="${x}" y="${y}" width="400" height="${rowH}" fill="white"/><text x="${x+4}" y="${y+16}" font-family="sans-serif" font-size="12">${escape(side.side+' '+sample.step+' +'+(sample.frame/30).toFixed(3)+'s'+(!found?' [no native frame]':''))}</text>`;
  let pngSha256:string|undefined;
  if(found){const png=await readFile(join(dir,side.side,found.asset+'.png'));pngSha256=sha(png);body+=`<svg x="${x}" y="${y+24}" width="400" height="${tileH}" viewBox="${cx} ${cy} ${cw} ${ch}"><image width="800" height="450" href="data:image/png;base64,${png.toString('base64')}"/></svg>`;}
  rows.push({row:i,side:side.side,...sample,sequence:found?.sequence,absolute:found?.absolute,asset:found?.asset,pngSha256});
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${samples.length*rowH}">${body}</svg>`;
const rendered=await renderAsync(svg,{font:{loadSystemFonts:true}});const output=join(dir,'contacts');await mkdir(output,{recursive:true});
await Promise.all([writeFile(join(output,label+'.png'),rendered.asPng()),writeFile(join(output,label+'.json'),JSON.stringify({policy:'Retained native PNGs; exact matched offsets; final snapshot at duplicate tick; absent frames blank.',crop:[cx,cy,cw,ch],receiptHashes:receipts.map(r=>({side:r.side,sha256:r.sha256})),rows},null,2)+'\n')]);
