import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const receipt=JSON.parse(await readFile(new URL('./measurement/parts/poppy-ticket-over-lane-names.json',import.meta.url),'utf8')).result;
const finding=receipt.findings[0];
const row={id:'poppy-ticket-over-lane-names',status:'complete',caught:true,findings:[finding],fresh:[finding],ms:1};
const json=JSON.stringify(row), payload=Buffer.from(json);
const freshStart=json.indexOf('"fresh":');
const split=Buffer.byteLength(json.slice(0,json.indexOf('“',freshStart)))+1;
assert.equal(payload[split-1],0xe2,'split the three-byte opening quote after its first byte');
const rawSpawn=cp.spawn;
let utf8=false;
cp.spawn=(_file,_args,options)=>{
  const child=rawSpawn(process.execPath,['--max-old-space-size=128','-e',
    `const b=Buffer.from(${JSON.stringify(payload.toString('base64'))},'base64');process.stdout.write(b.subarray(0,${split}));setTimeout(()=>process.stdout.write(b.subarray(${split})),30);`],options);
  if(utf8){child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');}
  return child;
};
syncBuiltinESMExports();
const {runInChild,workerResult}=await import('../../tools/repo/motion-corpus.ts');
assert.deepEqual(workerResult(row.id,json,0,null),row,'the unsplit complete worker receipt is valid');
const broken=await runInChild(row.id);
assert.equal(broken.status,'error');
assert.match(broken.error,/fresh observations are absent/);
assert.deepEqual(broken.findings,[finding]);
assert.deepEqual(broken.fresh,[]);
utf8=true;
const repaired=await runInChild(row.id);
assert.deepEqual(repaired,row,'built-in streaming UTF-8 decoding preserves the identical finding/fresh copies');
const out={id:row.id,payloadBytes:payload.length,splitByte:split,broken:{status:broken.status,error:broken.error,retainedFindings:broken.findings.length,creditedFresh:broken.fresh.length},streamDecoded:{status:repaired.status,findings:repaired.findings.length,fresh:repaired.fresh.length},productionEdited:false};
await writeFile(new URL('./worker-unicode-repro.json',import.meta.url),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
