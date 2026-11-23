import {mkdir,symlink,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
import {CORPUS} from '../../../test/fixtures/motion-corpus/corpus.ts';
import {buildVariant,observationOf} from '../../../tools/repo/motion-corpus-lib.ts';
import {collectProject} from '../../../tools/lib/explain-project.ts';
import {MachineMotionCheck} from '../../../tools/lib/explain-motion-rules.ts';
import {DOMAIN_CLEARANCE_V1,matchesSemantic} from '../../../tools/repo/motion-semantic.ts';
import {Text,type Mobject} from '../../../src/index.ts';import {stopAt} from '../../../src/scene.ts';
import {occlusionPixels,occlusionSnapshot} from '../../../test/lib/native-contribution.ts';
const dir=dirname(fileURLToPath(import.meta.url)),repo=resolve(dir,'../../..');
const scratch=await mkdtemp(resolve(dir,'disposable-domain-')),entry=CORPUS.find(c=>c.id==='sign-in-poll-over-card')!;
const hits=[],visible=(m:Mobject|undefined)=>!!m&&m.family().some(p=>p.hasPoints()&&p.style.opacity>.01);
try{
 for(const source of ['scenes','src','explain'])await symlink(join(repo,source),join(scratch,source),'dir');
 for(const control of ['fixed','original','Company-only','renamed']){
  const file=await buildVariant({...entry,id:'probe-'+control.toLowerCase(),edits:control==='original'?entry.edits:control==='renamed'?[{file:'poppy-sign-in/picture.ts',find:"keyedAs(domain, 'card:domain')",replace:"keyedAs(domain, 'case-probe:renamed-domain')"}]:[]},scratch);
  const project=await collectProject(file,{write:false}),scenario=project.scenarios.find(s=>s.values.flow==='device')!,check=new MachineMotionCheck();
  let cnt=0;const samples=[];
  const scene=new scenario.Scene({async frame(s){
   const actor=s.find('poll'),domain=s.find('card:domain'),card=s.find('card'),side=card?.family().find(m=>m instanceof Text&&m.text==='Example Company');
   const at=actor?.center();try{
    if(visible(actor)&&s.currentStep?.path==='ask'&&visible(card)&&side){
     cnt++;if(control==='Company-only')actor!.moveTo([side.center()[0]+0.06*Math.sin(s.time*16),side.center()[1]]);
     if(visible(domain)&&actor!.family().some(p=>p.hasPoints()&&p.style.opacity>0.85)&&samples.length<35){
      assert.ok(domain instanceof Text&&domain.parent===card&&domain.text==='example.com');
      const ds=occlusionSnapshot(s,domain,actor!),cs=occlusionSnapshot(s,side,actor!);
      const domainPx=await occlusionPixels(ds),companyPx=await occlusionPixels(cs);samples.push({absolute:s.frameCount,domainLost:domainPx.lost,companyLost:companyPx.lost,domainVisibleFree:domainPx.owned});
     }
    }
    await check.frame(s);
   }finally{if(actor&&at)actor.moveTo(at);}
  }});
  stopAt(scene,'ask',()=>{});await check.during(scene,()=>scene.run());
  const exact=check.findings.filter(line=>matchesSemantic({line,scenario:JSON.stringify(scenario.values),
   observation:observationOf({line,scenario:JSON.stringify(scenario.values)})},DOMAIN_CLEARANCE_V1[0]!));
  hits.push({control,visiblePoll:cnt,exact,missing:check.findings.filter(x=>x.includes('card:domain')&&x.includes('must identify one part')),samples});
  assert.ok(cnt>20);if(control==='original'){assert.ok(exact.length>0&&samples.some(x=>x.domainLost>0));}else assert.equal(exact.length,0);
  if(control==='fixed'||control==='Company-only')assert.ok(samples.length>0&&samples.every(x=>x.domainLost===0));
  if(control==='Company-only')assert.ok(samples.some(x=>x.companyLost>0));if(control==='renamed')assert.ok(hits.at(-1)!.missing.length>0);
 }
}finally{await rm(scratch,{recursive:true,force:true});}
await writeFile(resolve(dir,'domain-authoring-controls.json'),JSON.stringify({sourceRevision:'39b75450eeb4ef9082ec22a93be099770365d715',method:'Independent, bounded current-worktree replay stopped at the authored ask step. Only scratch variant copies under the reviewer directory were rewritten. This is a four-case control and gives no all59 measurement credit.',controls:hits},null,2)+'\n');
console.log(hits.map(o=>[o.control,o.visiblePoll,o.exact.length,o.missing.length,Math.max(0,...o.samples.map(x=>x.domainLost)),Math.max(0,...o.samples.map(x=>x.companyLost))]));
