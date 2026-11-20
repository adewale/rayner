/** Recorded oracle, independent of model.ts. Run with:
 * XSTATE_PACKAGE=/path/to/node_modules/xstate node oracle/statecharts.ts
 * This file imports no explainer/model code. */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const pkg = process.env.XSTATE_PACKAGE || 'xstate';
const { createMachine, getInitialSnapshot, getNextSnapshot } = require(pkg);
const { version } = require(`${pkg}/package.json`);
if(version !== '5.33.3') throw new Error(`Expected XState 5.33.3, got ${version}`);
const brew = () => ({initial:'idle',states:{idle:{on:{START:'grinding'}},grinding:{on:{GROUND:'brewing'}},brewing:{on:{POURED:'ready'}},ready:{on:{TAKE:'idle'}}}});
const foam = () => ({initial:'still',states:{still:{on:{FROTH:'frothing'}},frothing:{on:{STOP:'still'}}}});
const playback = () => ({initial:'paused',states:{paused:{on:{PLAY:'playing'}},playing:{on:{PAUSE:'paused'}}}});
const volume = () => ({initial:'sound',states:{sound:{on:{MUTE:'muted'}},muted:{on:{UNMUTE:'sound'}}}});
const player = () => ({type:'parallel',states:{playback:playback(),volume:volume()}});
const coffee = {initial:'off',states:{off:{on:{POWER_ON:'idle'}},idle:{on:{START:'grinding',POWER_OFF:'off'}},grinding:{on:{GROUND:'brewing',POWER_OFF:'off'}},brewing:{on:{POURED:'ready',POWER_OFF:'off'}},ready:{on:{TAKE:'idle',POWER_OFF:'off'}}}};
const configs:Record<string,unknown> = {
 coffee,
 parent:{initial:'off',states:{off:{on:{POWER_ON:'on'}},on:{...brew(),on:{POWER_OFF:'off'}}}},
 player:player(),
 'player-on':{initial:'off',states:{off:{on:{POWER_ON:'on'}},on:{...player(),on:{POWER_OFF:'off'}}}},
 frother:{initial:'off',states:{off:{on:{POWER_ON:'on'}},on:{type:'parallel',on:{POWER_OFF:'off'},states:{coffee:brew(),frother:foam()}}}},
};
const evs:Record<string,string[]>={coffee:['POWER_ON','START','GROUND','POURED','TAKE','POWER_OFF'],parent:['POWER_ON','START','GROUND','POURED','TAKE','POWER_OFF'],player:['PLAY','PAUSE','MUTE','UNMUTE'],'player-on':['POWER_ON','PLAY','PAUSE','MUTE','UNMUTE','POWER_OFF'],frother:['POWER_ON','START','GROUND','POURED','TAKE','POWER_OFF','FROTH','STOP']};
function leaves(v:any):string[] { return typeof v==='string' ? [v] : Object.values(v).flatMap(leaves); }
const output:any={version,charts:{}};
for(const [key,config] of Object.entries(configs)) {
 const machine=createMachine(config), initial=getInitialSnapshot(machine), snapshots=[initial], seen=new Set([JSON.stringify(initial.value)]), transitions:any[]=[];
 for(let i=0;i<snapshots.length;i++) for(const type of evs[key]!) {
   const before=snapshots[i], after=getNextSnapshot(machine,before,{type}), handled=JSON.stringify(before.value)!==JSON.stringify(after.value);
   transitions.push({from:leaves(before.value),event:type,to:leaves(after.value),handled});
   if(!seen.has(JSON.stringify(after.value))) {seen.add(JSON.stringify(after.value));snapshots.push(after);}
 }
 output.charts[key]={start:leaves(initial.value),states:snapshots.map(s=>leaves(s.value)),transitions};
}
writeFileSync(new URL('../fixtures/statecharts-xstate.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(`Recorded ${Object.keys(configs).length} charts against XState ${version}`);
