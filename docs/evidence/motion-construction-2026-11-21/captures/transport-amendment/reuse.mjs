import assert from 'node:assert/strict';import {readFile,writeFile,readdir,copyFile,mkdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {CORPUS} from '../../../test/fixtures/motion-corpus/corpus.ts';import {workerResult} from '../../../tools/repo/motion-corpus.ts';
const hash=v=>createHash('sha256').update(v).digest('hex');const encode=v=>JSON.stringify(v,(_,x)=>x instanceof RegExp?{pattern:x.source,flags:x.flags}:x);
const folder='out/principled-construction',old=JSON.parse(await readFile(folder+'/transport-amendment/source-before.json','utf8'));
const changed=[];const files={};for(const [p,h] of Object.entries(old.files)){files[p]=hash(await readFile(p));if(files[p]!==h)changed.push(p);}
assert.deepEqual(changed,['tools/repo/motion-corpus.ts']);assert.equal(hash(await readFile('test/fixtures/motion-corpus/corpus.ts')),old.fixture);assert.deepEqual(JSON.parse(encode(CORPUS)),old.entries);
const prior=execFileSync('git',['show','f102e2466c9cbbb2813299d445eb40cf21b48e6e:tools/repo/motion-corpus.ts'],{encoding:'utf8'}),current=await readFile(changed[0],'utf8');
assert.equal(hash(prior),old.files[changed[0]]);assert.equal(current.replace("    child.stdout.setEncoding('utf8');\n    child.stderr.setEncoding('utf8');\n",''),prior);
await writeFile(folder+'/transport-amendment/motion-corpus-before.ts',prior);await writeFile(folder+'/transport-amendment/motion-corpus-after.ts',current);
const fingerprint=hash(encode(files)+encode(CORPUS));const amendment={reason:'The existing membership guard exposed Unicode corruption when individual Buffer chunks were decoded separately. Only the parent stdout/stderr streaming decoder changed; scene rendering, event selection, expectations, classifier and scorer are byte-identical.',fromFingerprint:old.fingerprint,toFingerprint:fingerprint,reused:[],rerun:[]};
for(const directory of ['measurement/parts','catalog-parts']){
 await mkdir(folder+'/transport-amendment/'+directory,{recursive:true});
 for(const name of await readdir(folder+'/'+directory)){
  if(!name.endsWith('.json'))continue;const path=folder+'/'+directory+'/'+name;const part=JSON.parse(await readFile(path,'utf8'));assert.equal(part.fingerprint,old.fingerprint);
  await copyFile(path,folder+'/transport-amendment/'+directory+'/'+name);
  if(part.result.error||JSON.stringify(part.result).includes('\ufffd')){amendment.rerun.push({directory,id:part.result.id,reason:part.result.error??'replacement character in decoded observations'});continue;}
  if(directory==='measurement/parts')assert.equal(workerResult(part.result.id,JSON.stringify(part.result),0,null).error,undefined);
  else {assert.equal(part.result.status,'complete');assert.ok(Array.isArray(part.result.findings));}
  await writeFile(path,JSON.stringify({...part,fingerprint,reusedFrom:{fingerprint:old.fingerprint,reason:'Verified identical renderer/targets and completed observations without replacement characters; only parent streaming decoder changed.'}}));
  amendment.reused.push({directory,id:part.result.id});
 }
}
await writeFile(folder+'/transport-amendment/amendment.json',JSON.stringify(amendment,null,2)+'\n');
await writeFile(folder+'/measurement/source.json',JSON.stringify({...old,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fingerprint,files,transportAmendment:'../transport-amendment/amendment.json'},null,2)+'\n');
console.log(JSON.stringify({changed,reused:amendment.reused.length,rerun:amendment.rerun},null,2));
