import assert from 'node:assert/strict';
import test from 'node:test';
import {loadProject} from '../explain/testing.ts';
import {LiveSink,liveBase,liveSteps,runLive} from '../explain/internal.ts';
import {Text,type Mobject} from '../src/index.ts';
import {occlusionPixels,occlusionSnapshot} from './lib/native-contribution.ts';
import SignIn from '../scenes/explainers/poppy-sign-in/scene.ts';
import {CARDS,type SignInEvent,type World} from '../scenes/explainers/poppy-sign-in/model.ts';
import {FACE,DESK,tagPunch} from '../scenes/explainers/poppy-sign-in/picture.ts';

const paints=(m: Mobject|undefined)=>!!m&&m.family().some(p=>p.style.opacity>0.01&&p.hasPoints());
test('physical first and replacement credential returns preserve password ink and recipient names on legal reader sign-out and disconnect histories',async()=>{
  const project=await loadProject(SignIn,'scenes/explainers/poppy-sign-in');
  for(const scenario of project.scenarios) {
    const device=scenario.values.flow==='device',host=await new scenario.Scene(new LiveSink()).run(),place=liveSteps(host).get('sign-out')!;
    const {base}=await liveBase(scenario.Scene,'sign-out',place); assert.ok(base);
    for(const replacement of [false,true]) for(const pending of [false,true]) for(const event of ['sign-out','disconnect'] as const) {
      const grant: SignInEvent[]=['ask','approve-read','collect'];
      const log: SignInEvent[]=[...grant,...(replacement?['ask',pending?'approve-read':'approve-all','collect'] as SignInEvent[]:[]),...(pending?['ask'] as SignInEvent[]:[]),event];
      const samples=new Map<string,ReturnType<typeof occlusionSnapshot>[]>(), inverses: ReturnType<typeof occlusionSnapshot>[]=[];
      let origin: readonly number[]|undefined, departed=0,last: readonly number[]|undefined;
      await runLive(scenario.Scene,'sign-out',place,log,{from:base!.from,animate:{async frame(scene){
        const actor=scene.find('tag:return'); if(!paints(actor))return;
        origin??=[...actor!.center()];last=[...actor!.center()];
        if(Math.hypot(last[0]!-origin[0]!,last[1]!-origin[1]!)>0.02) {
          departed++;
          for(const key of ['tag','tag:cord','agent:key']) assert.equal(paints(scene.find(key)),false,`${log}: source ${key} physically retires before movement`);
        }
        for(const key of ['you:password','agent:name']) {
          const subject=scene.find(key); if(!paints(subject))continue;
          const rows=samples.get(key)??[]; const sample=occlusionSnapshot(scene,subject!,actor!);
          if(rows.length<2)rows.push(sample);else rows[1]=sample; samples.set(key,rows);
          if(key==='you:password'&&inverses.length===0&&departed>0) {
            const at=actor!.center(),dot=subject!.children[1]!;
            actor!.moveTo(dot.center()); try{inverses.push(occlusionSnapshot(scene,subject!,actor!));}finally{actor!.moveTo(at);}
          }
        }
      }}});
      assert.ok(departed>2&&last,'the physical return actually travels');
      assert.ok(Math.abs(last[1]!-DESK[1])<1e-5,'return reaches the Company port height');
      assert.ok(device?last[0]!>=FACE-0.2&&last[0]!<=FACE+0.5:Math.abs(last[0]!-DESK[0])<1e-5,'return reaches the actual visible Company counter');
      for(const key of ['you:password','agent:name']) {
        const rows=samples.get(key)!;assert.equal(rows.length,2,`${log}: native ${key} samples`);
        for(const row of rows){const ink=await occlusionPixels(row);assert.ok(ink.owned>0);assert.equal(ink.lost,0,`${scenario.values.flow} ${log} preserves ${key}`);}
      }
      assert.equal(inverses.length,1);assert.ok((await occlusionPixels(inverses[0]!)).lost>0,'the actual carrier displaced over a real password dot loses owned pixels');
    }
  }
});

test('access and refresh grant handoffs preserve the resting printed tag punch orientation and attachment',async()=>{
  const project=await loadProject(SignIn,'scenes/explainers/poppy-sign-in');
  for(const scenario of project.scenarios) {
    const device=scenario.values.flow==='device';let arrivals=0;
    await new scenario.Scene({async frame(scene){
      const flight=scene.find('tag:flight'),value=CARDS[(scene.state as World).holds?.card??0];
      const rest=scene.familyMembers().find(m=>m.key==='tag'&&paints(m)&&m.family().some(p=>p instanceof Text&&p.text===value));
      if(paints(flight)){
        const hole=tagPunch(flight!),paper=flight!.children[0]!.box()!,middle=(paper[0]+paper[2])/2;
        assert.ok(device?hole[0]>middle:hole[0]<middle,'the transit punch faces the same side as the physical resting tag');
      }
      if(!paints(flight)||!paints(rest))return;
      const a=tagPunch(flight!),b=tagPunch(rest!);
      // Target print starts only once the wordless physical original has landed.
      assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5,'the punch stays attached while print replaces the transit representation');arrivals++;
    }}).run();
    assert.ok(arrivals>2,`${scenario.values.flow}: actual printed handoff frames`);
  }
});
