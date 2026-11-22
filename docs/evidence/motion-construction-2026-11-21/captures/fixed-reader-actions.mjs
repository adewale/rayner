import assert from 'node:assert/strict';
import {loadFonts,loadProject} from '../../explain/testing.ts';
import {liveSteps,LiveSink,liveBase} from '../../explain/internal.ts';
import {acceptedLog} from '../../app/embed-live.ts';
import {canonicalJson} from '../../src/json.ts';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
await loadFonts();
const rows=[];
for(const id of ['poppy-coverage','poppy-conversations']){
  const {default:Source}=await import(`../../scenes/explainers/${id}/scene.ts`);
  const project=await loadProject(Source,resolve(`scenes/explainers/${id}`));
  for(const scenario of project.scenarios){
    const host=await new scenario.Scene(new LiveSink()).run(),places=liveSteps(host),records=[];
    for(const [step,place] of places){
      const {machine,base}=await liveBase(scenario.Scene,step,place);
      assert.ok(base,`${id} ${step}: reader root exists`);
      const queue=[{state:base.state,path:[]}],seen=new Set([canonicalJson(base.state)]),paths={};
      for(let i=0;i<queue.length;i++){
        assert.ok(queue.length<20000,'bounded independent reachability');
        const {state,path}=queue[i];
        for(const event of machine.spec.events){
          const outcome=machine.outcome(state,event);
          if(!('next' in outcome))continue;
          const log=[...path,event],valid=acceptedLog(machine,base.state,log);
          assert.deepEqual(valid.kept,log,'each witness is admitted from this actual published root');
          assert.equal(valid.stopped,undefined);
          paths[event]??=log;
          const key=canonicalJson(outcome.next);
          if(!seen.has(key)){seen.add(key);queue.push({state:outcome.next,path:log});}
        }
      }
      records.push({step,offered:place.offered,from:base.from,states:seen.size,complete:true,paths,neverAccepted:machine.spec.events.filter(e=>!paths[e])});
    }
    const all=new Set(records.flatMap(r=>Object.keys(r.paths))),events=[...places.values()][0].machine.spec.events;
    rows.push({id,settings:scenario.values,offers:records,allAccepted:events.filter(e=>all.has(e)),neverAccepted:events.filter(e=>!all.has(e))});
  }
}
await writeFile(new URL('./fixed-reader-actions.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify(rows,null,2));
