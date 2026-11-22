import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';
import {EXPLAINERS} from '../../scenes/explainers/catalog.ts';
import {keyedMotionFindings} from '../../tools/repo/motion-corpus-lib.ts';
const id=process.argv[2];
if(id){try{const findings=await keyedMotionFindings('scenes/explainers/'+id+'/scene.ts');process.stdout.write(JSON.stringify({id,status:'complete',findings}));}catch(e){process.stdout.write(JSON.stringify({id,status:'error',error:e.stack,findings:[]}));process.exitCode=1;}}else{
const source=JSON.parse(await readFile('out/principled-construction/measurement/source.json','utf8'));
const directory='out/principled-construction/catalog-parts';await mkdir(directory,{recursive:true});const run=promisify(execFile),selected=EXPLAINERS.filter(e=>!e.id.startsWith('poppy'));assert.equal(selected.length,45);const results=[];
for(const e of selected){const path=directory+'/'+e.id+'.json';let cached;try{cached=JSON.parse(await readFile(path,'utf8'));}catch{}
 if(cached?.fingerprint===source.fingerprint&&!cached.result.error){results.push(cached.result);console.log('cached',e.id);continue;}
 let result;try{const {stdout}=await run(process.execPath,['--max-old-space-size=1024','out/principled-construction/catalog.mjs',e.id],{maxBuffer:64_000_000,timeout:20*60_000});result=JSON.parse(stdout);assert.equal(result.id,e.id);assert.equal(result.status,'complete');assert.ok(Array.isArray(result.findings));}catch(error){result={id:e.id,status:'error',findings:[],error:String(error.stack)};}
 for(const [file,hash] of Object.entries(source.files))assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),hash,'source changed: '+file);
 await writeFile(path+'.tmp',JSON.stringify({fingerprint:source.fingerprint,result}));await rename(path+'.tmp',path);results.push(result);console.log(result.error?'ERROR':result.findings.length,e.id);}
const report={fingerprint:source.fingerprint,expected:selected.map(e=>e.id),completed:results.length,errors:results.filter(r=>r.error).length,findings:results.reduce((sum,r)=>sum+r.findings.length,0),results};await writeFile('out/principled-construction/catalog.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({completed:report.completed,errors:report.errors,findings:report.findings}));if(report.errors||report.findings)process.exitCode=1;
}
