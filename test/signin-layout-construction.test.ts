import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Text,type Mobject} from '../src/index.ts';
import {LiveSink,liveBase,liveSteps,runLive} from '../explain/internal.ts';
import {collectProject} from '../tools/lib/explain-project.ts';
import {buildVariant} from '../tools/repo/motion-corpus-lib.ts';
import {CORPUS} from './fixtures/motion-corpus/corpus.ts';
import {CURRENT_CONSTRUCTION_OBLIGATIONS} from './fixtures/motion-corpus/current-obligations.ts';
import {occlusionSnapshot,occlusionPixels} from './lib/native-contribution.ts';

const visible=(m:Mobject)=>m.family().some(p=>p.hasPoints()&&p.style.opacity>0.5);
test('the historical direct reask edit is prevented by stable credentials while real Exchange items glyphs retain a displaced-tag inverse',async()=>{
  const policy=CURRENT_CONSTRUCTION_OBLIGATIONS['sign-in-ask-people-slide'],entry=CORPUS.find(c=>c.id==='sign-in-ask-people-slide')!;
  for(const mutated of [false,true]){
    const file=await buildVariant({...entry,id:'stable-reask-'+randomUUID(),edits:mutated?entry.edits:[]});
    try{
      const project=await collectProject(file,{write:false}),scenario=project.scenarios.find(s=>s.values.flow==='direct')!;
      const host=await new scenario.Scene(new LiveSink()).run(),place=liveSteps(host).get('sign-out')!,{base}=await liveBase(scenario.Scene,'sign-out',place);assert.ok(base);
      let reference:Map<string,readonly number[]>|undefined,frames=0,poisoned=false;
      const words:ReturnType<typeof occlusionSnapshot>[]=[],oldCredential:ReturnType<typeof occlusionSnapshot>[]=[],bad:ReturnType<typeof occlusionSnapshot>[]=[];
      await runLive(scenario.Scene,'sign-out',place,[...policy.route],{from:base!.from,animate:{async frame(scene){
        frames++;reference??=new Map(policy.context.map(k=>[k,[...scene.find(k)!.center()]]));
        const stable=()=>{for(const key of policy.context){const parts=scene.familyMembers().filter(m=>m.key===key&&visible(m));assert.equal(parts.length,1,`${key}: one stable credential/recipient`);const p=parts[0]!.center(),r=reference!.get(key)!;assert.ok(Math.hypot(p[0]-r[0]!,p[1]-r[1]!)<1e-6,`${key}: keeps its place through ask`);}};
        stable();
        const tag=scene.find('tag')!,word=scene.find(policy.victim);
        const value=tag.family().find(m=>m instanceof Text&&m.text===policy.credential);assert.ok(value&&visible(value),'the actual earlier pat_8Hk2 credential remains');
        if(!(word instanceof Text)||word.text!==policy.literal||!visible(word))return;
        const snap=occlusionSnapshot(scene,word,tag),credential=occlusionSnapshot(scene,value!,word);
        if(words.length<2){words.push(snap);oldCredential.push(credential);}else{words[1]=snap;oldCredential[1]=credential;}
        if(!poisoned){const at=tag.center();tag.moveTo(word.center());try{assert.throws(stable,/keeps its place/);bad.push(occlusionSnapshot(scene,word,tag));}finally{tag.moveTo(at);}poisoned=true;}
      }}});
      assert.ok(frames>100&&poisoned);assert.equal(words.length,2);assert.equal(oldCredential.length,2);
      for(const snap of words){const native=await occlusionPixels(snap);assert.ok(native.owned>0,'the independently named scope text actually paints');assert.equal(native.lost,0,`${mutated?'original edit':'baseline'} leaves Exchange items native glyphs clear`);}
      for(const snap of oldCredential)assert.ok((await occlusionPixels(snap)).owned>0,'prior credential contributes actual native ink');
      const collision=await occlusionPixels(bad[0]!);assert.ok(collision.actorPaint>0&&collision.lost>0,'the real tag displaced over the actual scope loses those owned glyph pixels');
    }finally{await rm(dirname(dirname(file)),{recursive:true,force:true});}
  }
});
