import {writeFile} from 'node:fs/promises';
import {loadFonts} from '../../explain/testing.ts';
import {adoptExplainer,liveSteps,LiveSink,liveBase,scriptOf} from '../../explain/internal.ts';
import {scenariosOf,withSettings} from '../../explain/settings.ts';
import {loadScene} from '../../tools/lib/explain-project.ts';
import {readFile} from 'node:fs/promises';
await loadFonts();
const rows=[];
for(const chapter of ['poppy','poppy-refusals','poppy-sessions','poppy-sign-in','poppy-browser','poppy-conversations','poppy-coverage','poppy-discovery']){
 const file=process.cwd()+'/scenes/explainers/'+chapter+'/scene.ts';
 const loaded=await loadScene(file);adoptExplainer(loaded.Scene,file,await readFile(scriptOf(file),'utf8'),file);
 for(const settings of scenariosOf(loaded.Scene)){
  const Source=withSettings(loaded.Scene,settings);
  const ran=await new Source(new LiveSink()).run();
  for(const [step,place] of liveSteps(ran)){
   const {machine,base}=await liveBase(Source,step,place);
   const exploration=base?machine.explore(base.state):{states:[],complete:true}; const reach=exploration.states;
   const transitions=reach.map(({state,path})=>({path,outcomes:Object.fromEntries(machine.spec.events.map(e=>[e,machine.outcome(state,e)]))}));
   rows.push({chapter,settings,step,offered:place.offered,base,events:machine.spec.events,rootOutcomes:base?Object.fromEntries(machine.spec.events.map(e=>[e,machine.outcome(base.state,e)])):null,states:reach.length,complete:exploration.complete,shortestAccepted:Object.fromEntries(machine.spec.events.map(e=>[e,transitions.find(r=>'next' in r.outcomes[e])?.path??null]))});
  }
 }
}
await writeFile('out/editorial-motion-review-2026-11-22/witnesses/roots.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.map(({chapter,settings,step,offered,base,states,shortestAccepted})=>({chapter,settings,step,offered,from:base?.from,states,shortestAccepted})),null,2));
