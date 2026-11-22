import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CORPUS} from '../../test/fixtures/motion-corpus/corpus.ts';
import {againstBaseline} from '../../tools/repo/motion-corpus-lib.ts';
import {recall,runInChild} from '../../tools/repo/motion-corpus.ts';
const hash=v=>createHash('sha256').update(v).digest('hex');
const encode=v=>JSON.stringify(v,(_,x)=>x instanceof RegExp?{pattern:x.source,flags:x.flags}:x);
const directory='out/principled-construction/measurement',parts=directory+'/parts';await mkdir(parts,{recursive:true});
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory()){if(!['oracle','fixtures'].includes(e.name))out.push(...await walk(p));}else if(/\.(ts|js|mjs|md|json)$/.test(p)&&!p.endsWith('.test.ts')&&!p.endsWith('/fidelity.ts'))out.push(p);}return out;}
const paths=(await Promise.all(['src','explain','app','extras','integrations','vendor','tools/lib','scenes/explainers','scenes/tutorial'].map(walk))).flat().concat(['tools/repo/motion-corpus.ts','tools/repo/motion-corpus-lib.ts','package-lock.json']).sort();
const files={};for(const p of paths)files[p]=hash(await readFile(p));
const metadata=encode(CORPUS),fixture=hash(await readFile('test/fixtures/motion-corpus/corpus.ts')),fingerprint=hash(encode(files)+metadata);
const source={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),capturedAt:new Date().toISOString(),node:process.version,fingerprint,files,fixture,entries:JSON.parse(metadata),note:'Content hashes identify measured inputs only; no behavior test pins implementation hashes. Tests, fidelity oracles and review output are outside the generic measurement.'};
try {const amendment=JSON.parse(await readFile('out/principled-construction/transport-amendment/amendment.json','utf8'));if(amendment.toFingerprint===fingerprint)source.transportAmendment='../transport-amendment/amendment.json';}catch{}
await writeFile(directory+'/source.json',JSON.stringify(source,null,2)+'\n');
async function unchanged(){for(const [p,h] of Object.entries(files))assert.equal(hash(await readFile(p)),h,'measured source changed: '+p);assert.equal(hash(await readFile('test/fixtures/motion-corpus/corpus.ts')),fixture,'corpus changed');}
async function one(id){const path=parts+'/'+id+'.json';let cached;try{cached=JSON.parse(await readFile(path,'utf8'));}catch{}
 if(cached?.fingerprint===fingerprint&&!cached.result.error){console.log('cached',id);return cached.result;}
 const result=await runInChild(id,id.startsWith('base-'));await unchanged();
 await writeFile(path+'.tmp',JSON.stringify({fingerprint,result}));await rename(path+'.tmp',path);
 console.log(result.error?'ERROR':result.caught?'reject':'clear',id,Math.round(result.ms/1000)+'s',result.status,result.findings.length+' observations');return result;
}
async function pool(ids){let next=0;const results=new Array(ids.length);await Promise.all(Array.from({length:2},async()=>{while(next<ids.length){const i=next++;results[i]=await one(ids[i]);}}));return results;}
const baselines=await pool([...new Set(CORPUS.map(e=>e.chapter))].map(c=>'base-'+c));
await writeFile(directory+'/baselines.json',JSON.stringify({fingerprint,baselines},null,2));
const failed=baselines.filter(r=>r.error||r.status!=='complete'||r.findings.length);if(failed.length){console.log('Unclean baselines:',JSON.stringify(failed.map(r=>({id:r.id,error:r.error,findings:r.findings})),null,2));process.exitCode=1;}else{
 const raw=await pool(CORPUS.map(e=>e.id));const results=raw.map((r,i)=>againstBaseline(r,baselines.find(b=>b.id==='base-'+CORPUS[i].chapter),CORPUS[i].expectedFinding,CORPUS[i].expectedRefusal));
 const errors=results.filter(r=>r.error).map(r=>({id:r.id,error:r.error}));const summary=errors.length?null:recall(CORPUS,results);
 await writeFile(directory+'/report.json',JSON.stringify({fingerprint,metricVersion:'construction-v1',comparison:'baseline-subtracted',summary,baselines,results,errors},null,1)+'\n');
 console.log(JSON.stringify({summary,errors},null,2));if(errors.length)process.exitCode=1;
}
