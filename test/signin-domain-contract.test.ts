import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Text,type Mobject} from '../src/index.ts';
import {CORPUS} from './fixtures/motion-corpus/corpus.ts';
import {buildVariant,observationOf} from '../tools/repo/motion-corpus-lib.ts';
import {collectProject} from '../tools/lib/explain-project.ts';
import {MachineMotionCheck} from '../tools/lib/explain-motion-rules.ts';
import {DOMAIN_CLEARANCE_V1,matchesSemantic} from '../tools/repo/motion-semantic.ts';
import {occlusionPixels,occlusionSnapshot} from './lib/native-contribution.ts';

const visible=(m:Mobject|undefined)=>!!m&&m.family().some(p=>p.hasPoints()&&p.style.opacity>0.01);
test('device poll protects only the model-expected face-up domain, with the original partial-ink crossing and Company-only inverse',async()=>{
  const entry=CORPUS.find(c=>c.id==='sign-in-poll-over-card')!,target=DOMAIN_CLEARANCE_V1[0]!;
  for(const control of ['baseline','original','Company-only','missing-domain'] as const){
    const file=await buildVariant({...entry,id:'domain-contract-'+randomUUID(),edits:control==='original'?entry.edits:control==='missing-domain'?
      [{file:'poppy-sign-in/picture.ts',find:"keyedAs(domain, 'card:domain')",replace:"keyedAs(domain, 'card:renamed')"}]:[]});
    try{
      const project=await collectProject(file,{write:false});let observedDomain=0,withoutCard=0,maxDomainLoss=0,maxCompanyLoss=0,foreign=0;
      const exact:string[]=[];
      for(const scenario of project.scenarios){
        const check=new MachineMotionCheck();
        const scene=new scenario.Scene({async frame(s){
          const poll=s.find('poll'),card=s.find('card'),domain=s.find('card:domain');
          if(visible(s.find('trick'))){foreign++;assert.equal(s.find('trick')!.family().some(p=>p.key==='card:domain'),false,'a face-down foreign card exposes no domain');}
          const company=card?.family().find((p):p is Text=>p instanceof Text&&p.text==='Example Company');
          const at=poll?.center();
          try{
            if(visible(poll)){
              if(visible(domain)){
                assert.ok(domain instanceof Text);assert.equal(domain.text,'example.com');assert.equal(domain.parent,card,'domain remains owned by its physical card');observedDomain++;
                if(control==='Company-only'&&company)poll!.moveTo([company.center()[0]+0.1*Math.sin(s.time*20),company.center()[1]]);
                if(poll!.family().every(p=>p.style.opacity>0.9)){
                  const ink=await occlusionPixels(occlusionSnapshot(s,domain,poll!));assert.ok(ink.owned>0);maxDomainLoss=Math.max(maxDomainLoss,ink.lost);
                  if(control==='Company-only'&&company)maxCompanyLoss=Math.max(maxCompanyLoss,(await occlusionPixels(occlusionSnapshot(s,company,poll!))).lost);
                }
              }else if(control!=='missing-domain')withoutCard++;
            }
            await check.frame(s);
          }finally{if(poll&&at)poll.moveTo(at);}
        }});
        await check.during(scene,()=>scene.run());
        exact.push(...check.findings.filter(line=>matchesSemantic({line,scenario:JSON.stringify(scenario.values),observation:observationOf({line,scenario:JSON.stringify(scenario.values)})},target)));
        if(control==='missing-domain'&&scenario.values.flow==='device')assert.ok(check.findings.some(line=>line.includes('subject "card:domain" must identify one part')),'the source-model expectation survives a missing rendered child');
        if(scenario.values.flow==='direct')assert.equal(check.findings.some(line=>line.includes('card:domain')),false,'direct code history needs no legitimate device domain');
      }
      if(control!=='missing-domain'){assert.ok(observedDomain>20&&withoutCard>20&&foreign>0,'both face-up and legitimate no-card/approved histories actually execute');}
      if(control==='original'){assert.ok(maxDomainLoss>0,'the unmodified historical variant interrupts actual domain glyph ink');assert.ok(exact.length>0,'the exact authored poll/domain relation diagnoses it');}
      else{assert.equal(exact.length,0,'unrelated warnings cannot earn an exact domain point');assert.equal(maxDomainLoss,0);}
      if(control==='Company-only')assert.ok(maxCompanyLoss>0,'the distinct Company-line crossing is really painted while domain remains clear');
    }finally{await rm(dirname(dirname(file)),{recursive:true,force:true});}
  }
});
